import { parseAIReply, type AIReply } from "./ai";
import type { Project } from "./types";
import { AIError, classifyAIError, type AIErrorCode } from "./ai-errors";

export const MAX_REASONING = 32000;
export type AIStreamEvent =
  | { type: "reply" | "reasoning"; delta: string }
  | { type: "done"; result: AIReply }
  | { type: "error"; error: string; code?: AIErrorCode };

type StreamOptions = {
  onActivity?: (bytes: number) => void;
  onFinish?: (outcome: "completed" | AIErrorCode) => void;
};

async function* readBytes(body: ReadableStream<Uint8Array>, signal?: AbortSignal, onActivity?: (bytes: number) => void) {
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (value.byteLength) onActivity?.(value.byteLength);
      yield value;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Both the provider connection and browser connection may split an SSE event
// anywhere, including inside UTF-8 characters, JSON escapes, or CRLF delimiters.
export async function* readSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal, onActivity?: (bytes: number) => void) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const value of readBytes(body, signal, onActivity)) {
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 1000000) throw new AIError("AI_RESPONSE_TOO_LARGE");
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const lines = block.split(/\r?\n/);
      const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
      if (data) yield data;
    }
  }
}

function jsonString(source: string, start: number) {
  let value = "";
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === '"') return { value, end: i + 1, complete: true };
    if (char !== "\\") { value += char; continue; }
    const escaped = source[++i];
    if (!escaped) break;
    if (escaped === "u") {
      const hex = source.slice(i + 1, i + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16)); i += 4;
    } else {
      const escapes: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      if (!(escaped in escapes)) break;
      value += escapes[escaped];
    }
  }
  // A split surrogate pair must not flash as a replacement character.
  return { value: value.replace(/[\uD800-\uDBFF]$/, ""), end: source.length, complete: false };
}

export function partialReply(source: string) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    else if (char === '"') {
      const token = jsonString(source, i);
      if (!token.complete) return "";
      let next = token.end;
      while (/\s/.test(source[next] || "x")) next++;
      if (depth === 1 && token.value === "reply" && source[next] === ":") {
        next++;
        while (/\s/.test(source[next] || "x")) next++;
        return source[next] === '"' ? jsonString(source, next).value : "";
      }
      i = token.end - 1;
    }
  }
  return "";
}

// Only user-visible fields explicitly returned by the configured provider are
// displayed. No fabricated reasoning is generated when the field is absent.
function reasoningText(message: Record<string, unknown>) {
  if (typeof message.reasoning_content === "string") return message.reasoning_content;
  return typeof message.reasoning === "string" ? message.reasoning : "";
}

function parseJSON(text: string, code: "AI_INVALID_RESPONSE" | "AI_INVALID_STREAM") {
  try { return JSON.parse(text); }
  catch { throw new AIError(code); }
}

function parseReplyJSON(text: string) {
  try { return JSON.parse(text); }
  catch {
    // Some compatible endpoints emit literal newlines/tabs in quoted content,
    // even with response_format=json_object. Escape only these string controls;
    // never guess quotes, field separators, missing values or closing brackets.
    let quoted = false, escaped = false, normalized = "";
    for (const char of text) {
      if (escaped) {
        escaped = false;
        normalized += char;
        continue;
      }
      if (quoted && char === "\\") escaped = true;
      else if (char === '"') quoted = !quoted;
      if (quoted && char.charCodeAt(0) < 0x20) {
        normalized += JSON.stringify(char).slice(1, -1);
      } else {
        normalized += char;
      }
    }
    return parseJSON(normalized, "AI_INVALID_RESPONSE");
  }
}

function validatedReply(text: string, project: Project) {
  const raw = parseReplyJSON(text);
  try { return parseAIReply(raw, project); }
  catch (error) {
    // Only our own schema validator's message is safe to include as detail.
    throw new AIError("AI_INVALID_RESPONSE", error instanceof Error ? error.message : undefined);
  }
}

function checkFinishReason(reason: unknown) {
  if (reason === "length") throw new AIError("AI_OUTPUT_TRUNCATED");
  if (reason && reason !== "stop") throw new AIError("AI_PROVIDER_ERROR");
  return reason === "stop";
}

async function readProviderJSON(response: Response, signal: AbortSignal, onActivity?: StreamOptions["onActivity"]) {
  if (!response.body) throw new AIError("AI_INVALID_RESPONSE");
  const decoder = new TextDecoder();
  let text = "";
  for await (const bytes of readBytes(response.body, signal, onActivity)) {
    text += decoder.decode(bytes, { stream: true });
    if (text.length > 1000000) throw new AIError("AI_RESPONSE_TOO_LARGE");
  }
  return parseJSON(text + decoder.decode(), "AI_INVALID_RESPONSE");
}

export async function* providerEvents(response: Response, project: Project, signal: AbortSignal, onActivity?: StreamOptions["onActivity"]): AsyncGenerator<AIStreamEvent> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await readProviderJSON(response, signal, onActivity);
    signal.throwIfAborted();
    if (data?.error) throw new AIError("AI_PROVIDER_ERROR");
    const choice = data?.choices?.[0];
    const message = choice?.message || {};
    const reasoning = reasoningText(message).slice(0, MAX_REASONING);
    if (reasoning) yield { type: "reasoning", delta: reasoning };
    checkFinishReason(choice?.finish_reason);
    yield { type: "done", result: validatedReply(message.content || "", project) };
    return;
  }
  if (!response.body) throw new AIError("AI_DISCONNECTED");
  let raw = "", reply = "", reasoningLength = 0, finished = false;
  for await (const data of readSSE(response.body, signal, onActivity)) {
    if (data === "[DONE]") { finished = true; break; }
    const chunk = parseJSON(data, "AI_INVALID_STREAM");
    if (!chunk || typeof chunk !== "object") throw new AIError("AI_INVALID_STREAM");
    if (chunk.error) throw new AIError("AI_PROVIDER_ERROR");
    const choice = chunk.choices?.[0];
    if (!choice) continue; // Usage-only events have no choices.
    const delta = choice.delta || {};
    const reasoning = reasoningText(delta).slice(0, MAX_REASONING - reasoningLength);
    reasoningLength += reasoning.length;
    if (reasoning) yield { type: "reasoning", delta: reasoning };
    if (typeof delta.content === "string") {
      raw += delta.content;
      if (raw.length > 300000) throw new AIError("AI_RESPONSE_TOO_LARGE");
      const partial = partialReply(raw);
      if (partial.length > 16000) throw new AIError("AI_RESPONSE_TOO_LARGE");
      if (partial.length > reply.length) {
        yield { type: "reply", delta: partial.slice(reply.length) };
        reply = partial;
      }
    }
    // Some compatible providers leave the connection open after stop and never
    // send [DONE]. Process the final delta, then finish without waiting again.
    if (checkFinishReason(choice.finish_reason)) { finished = true; break; }
  }
  signal.throwIfAborted();
  if (!finished) throw new AIError("AI_DISCONNECTED");
  yield { type: "done", result: validatedReply(raw, project) };
}

export async function streamAIResponse(response: Response, project: Project, upstream: AbortController, signal: AbortSignal, options: StreamOptions = {}) {
  const finish = (outcome: "completed" | AIErrorCode) => {
    options.onFinish?.(outcome);
    upstream.abort();
  };
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    let outcome: "completed" | AIErrorCode = "completed";
    try {
      for await (const event of providerEvents(response, project, signal, options.onActivity)) {
        if (event.type === "done") return Response.json(event.result);
      }
      throw new AIError("AI_INVALID_RESPONSE");
    } catch (error) {
      const failure = classifyAIError(error, signal);
      outcome = failure.code;
      return Response.json({ error: failure.message, code: failure.code }, { status: 502 });
    } finally {
      finish(outcome);
    }
  }
  const encoder = new TextEncoder();
  let cancelled = false;
  let heartbeat: ReturnType<typeof setInterval>;
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AIStreamEvent) => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
      const keepAlive = () => { if (!cancelled) controller.enqueue(encoder.encode(": keep-alive\n\n")); };
      keepAlive();
      heartbeat = setInterval(keepAlive, 15000);
      let outcome: "completed" | AIErrorCode = "completed";
      try {
        for await (const event of providerEvents(response, project, signal, options.onActivity)) {
          signal.throwIfAborted();
          emit(event);
        }
      } catch (error) {
        const failure = classifyAIError(error, signal);
        outcome = failure.code;
        emit({ type: "error", error: failure.message, code: failure.code });
      } finally {
        clearInterval(heartbeat);
        finish(outcome);
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; clearInterval(heartbeat); upstream.abort(); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}

export async function readAIResponse(response: Response, signal: AbortSignal, onDelta: (event: { type: "reply" | "reasoning"; delta: string }) => void): Promise<AIReply> {
  try {
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "请求失败");
    }
    // Supports cached clients and endpoints which still return the old JSON shape.
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      const result = await response.json();
      signal.throwIfAborted();
      return result;
    }
    if (!response.body) throw new Error("AI 返回了空响应");
    for await (const data of readSSE(response.body, signal)) {
      const event = JSON.parse(data) as AIStreamEvent;
      signal.throwIfAborted();
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "done") return event.result;
      if ((event.type === "reply" || event.type === "reasoning") && typeof event.delta === "string") onDelta(event);
    }
    throw new AIError("AI_DISCONNECTED");
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof TypeError && /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(error.message)) {
      throw new AIError("AI_DISCONNECTED");
    }
    throw error;
  }
}
