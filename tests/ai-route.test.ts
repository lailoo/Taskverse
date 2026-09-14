import test, { before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeInitialProject } from "../src/lib/tasks";
import { readAIResponse } from "../src/lib/ai-stream";

// Load config from an isolated directory; never move or use the user's API key.
let POST: typeof import("../src/app/api/ai/route").POST;
const originalDirectory = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), "wedding-ai-route-"));
before(async () => {
  process.chdir(directory);
  ({ POST } = await import("../src/app/api/ai/route"));
});
after(() => { process.chdir(originalDirectory); rmSync(directory, { recursive: true, force: true }); });

const makeRequest = (messages = [{ role: "user", content: "review进展" }]) => new Request("http://localhost/api/ai", {
  method: "POST", body: JSON.stringify({ project: makeInitialProject(), messages }),
});
const flush = () => new Promise(resolve => setImmediate(resolve));
const encoder = new TextEncoder();
const chunk = (delta: object, finish_reason?: string) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`);

function mockProvider(t: TestContext) {
  const previous = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-only";
  t.after(() => { if (previous === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previous; });
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  // Native AbortSignal.timeout uses internal timers, so adapt it to the fake clock
  // to reproduce the old 180-second deadline through the real route.
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return controller.signal;
  });
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let providerSignal!: AbortSignal;
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    providerSignal = init.signal!;
    return new Response(new ReadableStream<Uint8Array>({
      start(c) { source = c; }, cancel() { cancelled = true; },
    }), { headers: { "content-type": "text/event-stream" } });
  });
  return { get source() { return source; }, get signal() { return providerSignal; }, get cancelled() { return cancelled; } };
}

test("AI route handles missing configuration and parses a mocked provider reply", async () => {
  const key = process.env.AI_API_KEY,
    originalFetch = globalThis.fetch;
  try {
    delete process.env.AI_API_KEY;
    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/ai", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
      503,
    );
    process.env.AI_API_KEY = "test-only";
    const project = makeInitialProject();
    globalThis.fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.response_format.type, "json_object");
      assert.equal(
        sent.messages.at(-1).content.includes("wedding-table.jpg"),
        false,
      );
      assert(sent.messages.some((message: { content: string }) => message.content.includes("当前会话摘要")));
      assert(sent.messages.some((message: { content: string }) => message.content.includes("自然光")));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ reply: "当前仍有待办任务", tasks: [] }),
            },
          },
        ],
      });
    };
    const response = await POST(
      new Request("http://localhost/api/ai", {
        method: "POST",
        body: JSON.stringify({
          project,
          messages: [{ role: "user", content: "review进展" }],
          summary: "场地候选已整理",
          memory: { weddingDate: "2026-09-27", preferences: ["自然光"] },
        }),
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      reply: "当前仍有待办任务",
      tasks: [],
    });
    globalThis.fetch = async () => Response.json({ choices: [] });
    const malformed = await POST(
      new Request("http://localhost/api/ai", {
        method: "POST",
        body: JSON.stringify({
          project,
          messages: [{ role: "user", content: "review" }],
        }),
      }),
    );
    assert.equal(malformed.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = key;
  }
});

test("active reasoning can continue beyond three minutes, including after the display limit", async t => {
  const provider = mockProvider(t);
  const output = await POST(makeRequest());
  const events: string[] = [];
  const result = readAIResponse(output, new AbortController().signal, event => events.push(event.delta));
  const settled = result.catch(error => error);
  try {
    for (let i = 0; i < 5; i++) {
      provider.source.enqueue(chunk({ reasoning_content: "思".repeat(10000) }));
      await flush();
      t.mock.timers.tick(60000);
      await flush();
      assert.equal(provider.signal.aborted, false, "active provider must survive the old three-minute cutoff");
    }
    provider.source.enqueue(chunk({ content: '{"reply":"长思考后完成","tasks":[]}' }, "stop"));
    assert.deepEqual(await result, { reply: "长思考后完成", tasks: [] });
    assert.equal(events.join("").length, 32000 + "长思考后完成".length);
    assert(provider.cancelled);
  } finally {
    if (!provider.cancelled) provider.source.close();
    await settled;
  }
});

test("a stalled upstream is stopped after two minutes even while browser heartbeats continue", async t => {
  const provider = mockProvider(t);
  const output = await POST(makeRequest());
  const result = readAIResponse(output, new AbortController().signal, () => {}).catch(error => error);
  t.mock.timers.tick(120001);
  await flush();
  try {
    assert(provider.signal.aborted, "stalled connection must be aborted");
    assert(provider.cancelled);
    assert.match((await result).message, /120 秒.*数据/);
  } finally { if (!provider.cancelled) provider.source.close(); await result; }
});

test("continuous provider keep-alives cannot bypass the ten-minute overall deadline", async t => {
  const provider = mockProvider(t);
  const output = await POST(makeRequest());
  const result = readAIResponse(output, new AbortController().signal, () => {}).catch(error => error);
  try {
    for (let i = 0; i < 10; i++) {
      provider.source.enqueue(encoder.encode(": upstream ping\n\n"));
      await flush();
      t.mock.timers.tick(60000);
      await flush();
      if (i < 9) assert.equal(provider.signal.aborted, false);
    }
    assert(provider.signal.aborted);
    assert.match((await result).message, /10 分钟/);
    assert(provider.cancelled);
  } finally { if (!provider.cancelled) provider.source.close(); await result; }
});

test("long conversations keep recent whole turns and the latest request within a text budget", async t => {
  const previous = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-only";
  t.after(() => { if (previous === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previous; });
  const messages = Array.from({ length: 6 }, (_, index) => [
    { role: "user", content: `历史问题${index}` },
    { role: "assistant", content: "回复".repeat(7000) },
  ]).flat();
  const latest = { role: "user", content: "请继续修改当前场地任务" };
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const sent = JSON.parse(String(init.body));
    const history = sent.messages.filter((message: { role: string }) => message.role !== "system").slice(0, -1);
    assert(history.reduce((count: number, message: { content: string }) => count + message.content.length, 0) <= 24000);
    assert.deepEqual(history.at(-1), latest);
    assert.equal(history[0].role, "user");
    assert(history.some((message: { role: string }) => message.role === "assistant"));
    return Response.json({ choices: [{ message: { content: '{"reply":"完成","tasks":[]}' } }] });
  });
  const response = await POST(makeRequest([...messages, latest]));
  assert.equal(response.status, 200);
});
