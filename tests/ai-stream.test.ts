import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject } from "../src/lib/tasks";
import { MAX_REASONING, partialReply, providerEvents, readAIResponse, readSSE, streamAIResponse, type AIStreamEvent } from "../src/lib/ai-stream";

const encoder = new TextEncoder();
const project = makeInitialProject();
const signal = () => new AbortController().signal;
const sse = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
const delta = (value: object) => sse({ choices: [{ delta: value }] });
const response = (text: string, split = false) => {
  const bytes = encoder.encode(text);
  return new Response(new ReadableStream({ start(c) {
    if (split) for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
    else c.enqueue(bytes);
    c.close();
  } }), { headers: { "content-type": "text/event-stream" } });
};
const collect = async (source: AsyncIterable<AIStreamEvent>) => { const result = []; for await (const event of source) result.push(event); return result; };

test("partial JSON displays only the root reply, decoding split escapes and emoji", () => {
  const reply = '计划\n**婚礼** [场地](#task/venue)，他说："可以"。\\💛';
  const raw = JSON.stringify({ tasks: [{ reply: "do not show this" }], reply, followUps: [] });
  let previous = "";
  for (let i = 0; i <= raw.length; i++) {
    const partial = partialReply(raw.slice(0, i));
    assert(reply.startsWith(partial)); assert(partial.startsWith(previous)); previous = partial;
  }
  assert.equal(previous, reply);
  assert.equal(partialReply('{"reply":"\\u4f60\\u597d\\ud83d'), "你好");
  assert.equal(partialReply('{"reply":"\\u4f60\\u597d\\ud83d\\udc9b"}'), "你好💛");
  assert.equal(partialReply('{"tasks":[{"reply":"nested"}]}'), "");
});

test("SSE preserves UTF-8, CRLF, multiline data, and ignores keep-alive comments", async () => {
  const r = response(': ping\r\n\r\ndata: {"text":\r\ndata: "婚礼💛"}\r\n\r\n', true);
  const values = []; for await (const item of readSSE(r.body!, signal())) values.push(JSON.parse(item));
  assert.deepEqual(values, [{ text: "婚礼💛" }]);
});

test("provider streams reasoning and Markdown before final validated tasks", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const upstream = new Response(new ReadableStream<Uint8Array>({ start(c) { source = c; } }), { headers: { "content-type": "text/event-stream" } });
  const controller = new AbortController();
  const output = await streamAIResponse(upstream, project, controller, controller.signal);
  const events: { type: string; delta: string }[] = [];
  let completed = false;
  const result = readAIResponse(output, signal(), event => events.push(event)).then(value => { completed = true; return value; });
  source.enqueue(encoder.encode(delta({ reasoning_content: "先检查截止日期。" })));
  source.enqueue(encoder.encode(delta({ content: '{"reply":"**先确认场地**' })));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, [{ type: "reasoning", delta: "先检查截止日期。" }, { type: "reply", delta: "**先确认场地**" }]);
  assert.equal(completed, false);
  source.enqueue(encoder.encode(delta({ content: '\\n联系供应商。","tasks":[],"followUps":[]}' })));
  source.enqueue(encoder.encode('data: [DONE]\r\n\r\n')); source.close();
  assert.deepEqual(await result, { reply: "**先确认场地**\n联系供应商。", tasks: [], followUps: [] });
  assert.equal(controller.signal.aborted, true);
});

test("structured suggestions are released only after validation; truncation is an error", async () => {
  for (const ending of ["", sse({ choices: [{ delta: {}, finish_reason: "length" }] })]) {
    await assert.rejects(collect(providerEvents(response(delta({ content: '{"reply":"partial","tasks":[]}' }) + ending), project, signal())), /中断|未完成/);
  }
  const invalid = { reply: "建议", tasks: [{ title: "错误分支", parentId: "missing", description: "", owner: "", due: "" }] };
  const events: AIStreamEvent[] = [];
  await assert.rejects(async () => { for await (const event of providerEvents(response(delta({ content: JSON.stringify(invalid) }) + 'data: [DONE]\n\n'), project, signal())) events.push(event); }, /分支/);
  assert(events.every(event => event.type !== "done"));
});

test("non-streaming providers still work and missing reasoning does not invent text", async () => {
  const raw = { reply: "确认场地", tasks: [] };
  const events = await collect(providerEvents(Response.json({ choices: [{ message: { content: JSON.stringify(raw) } }] }), project, signal()));
  assert.deepEqual(events, [{ type: "done", result: raw }]);
  assert.deepEqual(await readAIResponse(Response.json(raw), signal(), () => assert.fail()), raw);
});

test("reasoning aliases are supported and storage length is bounded", async () => {
  const events = await collect(providerEvents(response(delta({ reasoning: "长".repeat(MAX_REASONING + 100) }) + delta({ content: '{"reply":"完成","tasks":[]}' }) + 'data: [DONE]\n\n', true), project, signal()));
  assert.equal(events.filter(e => e.type === "reasoning").map(e => "delta" in e ? e.delta : "").join("").length, MAX_REASONING);
});

test("abort cancels a pending reader and never commits an incomplete reply", async () => {
  const controller = new AbortController(); let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encoder.encode(sse({ type: "reply", delta: "已收到" }))); }, cancel() { cancelled = true; } });
  const deltas: string[] = [];
  const pending = readAIResponse(new Response(body, { headers: { "content-type": "text/event-stream" } }), controller.signal, e => deltas.push(e.delta));
  await new Promise(resolve => setImmediate(resolve));
  controller.abort("steer");
  await assert.rejects(pending, e => e === "steer");
  assert(cancelled); assert.deepEqual(deltas, ["已收到"]);
});

test("downstream disconnect cancels the provider connection", async () => {
  const upstream = new AbortController(); let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const output = await streamAIResponse(new Response(body, { headers: { "content-type": "text/event-stream" } }), project, upstream, upstream.signal);
  await output.body!.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert(upstream.signal.aborted); assert(cancelled);
});

test("a browser transport failure during streaming preserves deltas and has an actionable message", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
  const received: string[] = [];
  const pending = readAIResponse(new Response(body, { headers: { "content-type": "text/event-stream" } }), signal(), event => received.push(event.delta));
  const rejected = assert.rejects(pending, /AI 连接中断，已保留收到的内容，请重试/);
  source.enqueue(encoder.encode(sse({ type: "reply", delta: "已收到的正文" })));
  await new Promise(resolve => setImmediate(resolve));
  source.error(new TypeError("Failed to fetch"));
  await rejected;
  assert.deepEqual(received, ["已收到的正文"]);
});

test("stream failures retain received text and report distinct, safe error codes", async () => {
  const partial = delta({ content: '{"reply":"已收到的正文' });
  const cases = [
    { body: partial, code: "AI_DISCONNECTED", message: /连接中断/ },
    { body: partial + sse({ choices: [{ delta: {}, finish_reason: "length" }] }), code: "AI_OUTPUT_TRUNCATED", message: /输出上限/ },
    { body: partial + 'data: [DONE]\n\n', code: "AI_INVALID_RESPONSE", message: /格式/ },
    { body: partial + 'data: {invalid-private-provider-data}\n\n', code: "AI_INVALID_STREAM", message: /流式数据/ },
  ];
  for (const item of cases) {
    const upstream = new AbortController();
    const output = await streamAIResponse(response(item.body), project, upstream, upstream.signal);
    const events = []; for await (const data of readSSE(output.body!)) events.push(JSON.parse(data));
    assert(events.some(event => event.type === "reply" && event.delta === "已收到的正文"));
    assert(!events.some(event => event.type === "done"));
    assert.equal(events.at(-1).code, item.code);
    assert.match(events.at(-1).error, item.message);
    assert(!JSON.stringify(events).includes("private-provider-data"));
  }
});

test("JSON fallback also rejects provider output truncated at the token limit", async () => {
  const upstream = new AbortController();
  const output = await streamAIResponse(Response.json({ choices: [{
    finish_reason: "length", message: { content: '{"reply":"看似完整","tasks":[]}' },
  }] }), project, upstream, upstream.signal);
  assert.equal(output.status, 502);
  assert.equal((await output.json()).code, "AI_OUTPUT_TRUNCATED");
});

test("finish_reason stop completes immediately without waiting for an optional DONE sentinel", async () => {
  let cancelled = false;
  const upstream = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(encoder.encode(sse({ choices: [{ delta: { content: '{"reply":"完成","tasks":[]}' }, finish_reason: "stop" }] }))); },
    cancel() { cancelled = true; },
  });
  const output = await streamAIResponse(new Response(body, { headers: { "content-type": "text/event-stream" } }), project, upstream, upstream.signal);
  let result: unknown;
  const pending = readAIResponse(output, signal(), () => {}).then(value => { result = value; }).catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.deepEqual(result, { reply: "完成", tasks: [] });
    assert(cancelled);
  } finally { upstream.abort(); await pending; }
});

test("keep-alive comments reach the browser during reasoning pauses and stop after cancellation", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const upstream = new AbortController();
  const output = await streamAIResponse(new Response(new ReadableStream<Uint8Array>(), { headers: { "content-type": "text/event-stream" } }), project, upstream, upstream.signal);
  const reader = output.body!.getReader();
  let text = "", done = false;
  const reading = (async () => { while (true) { const value = await reader.read(); if (value.done) { done = true; break; } text += new TextDecoder().decode(value.value); } })();
  t.mock.timers.tick(15000);
  await new Promise(resolve => setImmediate(resolve));
  try { assert.match(text, /: keep-alive\n\n/); }
  finally { await reader.cancel(); await reading; }
  assert(done);
  const previous = text;
  t.mock.timers.tick(60000);
  assert.equal(text, previous);
  assert(upstream.signal.aborted);
});

test("provider replies tolerate literal line breaks inside JSON strings without changing content", async () => {
  const expected = {
    reply: '第一行\n第二行\r\n第三行\t引用："确认"；路径 C:\\new\\note。',
    tasks: [{ title: "打印海报", parentId: "ceremony", description: "确认规格\n送印与取件", owner: "", due: "" }],
  };
  // Reproduce a compatible provider emitting raw controls in the final JSON.
  // Already escaped backslashes and quotes must keep their original meaning.
  const malformed = JSON.stringify(expected).replace(/(?<!\\)\\([nrt])/g, (_, key) => ({ n: "\n", r: "\r", t: "\t" }[key as "n" | "r" | "t"]));
  assert.throws(() => JSON.parse(malformed));
  for (const streaming of [true, false]) {
    const upstream = new AbortController();
    const input = streaming
      ? response([...malformed].map(char => delta({ content: char })).join("") + sse({ choices: [{ delta: {}, finish_reason: "stop" }] }), true)
      : Response.json({ choices: [{ message: { content: malformed }, finish_reason: "stop" }] });
    const output = await streamAIResponse(input, project, upstream, upstream.signal);
    const shown: string[] = [];
    const before = JSON.stringify(project);
    const result = await readAIResponse(output, signal(), event => { if (event.type === "reply") shown.push(event.delta); });
    assert.deepEqual(result, expected);
    if (streaming) assert.equal(shown.join(""), expected.reply);
    assert.equal(JSON.stringify(project), before, "parsing only returns a proposal; it never applies tasks");
  }
});

test("normalizing string line breaks still validates task references", async () => {
  const malformed = '{"reply":"建议\n待确认","tasks":[{"title":"打印海报","parentId":"missing","description":"", "owner":"", "due":""}]}';
  await assert.rejects(collect(providerEvents(response(delta({ content: malformed }) + 'data: [DONE]\n\n'), project, signal())), /分支/);
});

test("control-character compatibility never repairs incomplete or ambiguous task structures", async () => {
  const invalid = [
    '{"reply":"第一行\n还未写完',
    '{"reply":"第一行\n第二行","tasks":[',
    '{"reply":"第一行\n第二行" "tasks":[]}',
    '{"reply":"第一行\n错误转义\\q","tasks":[]}',
    '{"reply":"第一行\\\n不接受续行","tasks":[]}',
    '{"reply":"第一行\n第二行","tasks":[]} {"changes":[]}',
  ];
  for (const raw of invalid) {
    await assert.rejects(collect(providerEvents(response(delta({ content: raw }) + 'data: [DONE]\n\n'), project, signal())), /任务协议/);
  }
});
