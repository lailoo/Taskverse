import test from "node:test";
import assert from "node:assert/strict";
import { prepareAIHistory } from "../src/lib/ai-context";

test("request context excludes interrupted answers and private reasoning but preserves the saved conversation", () => {
  const messages = [
    { role: "assistant" as const, content: "你好" },
    { role: "user" as const, content: "检查场地" },
    { role: "assistant" as const, content: "先确认[场地](#task/venue)", reasoning: "思考", tasks: [] },
    { role: "user" as const, content: "继续" },
    { role: "assistant" as const, content: "未完成的结论", reasoning: "中断思考", interrupted: true },
    { role: "user" as const, content: "请重试" },
  ];
  const before = structuredClone(messages);
  assert.deepEqual(prepareAIHistory(messages), [
    { role: "user", content: "检查场地" },
    { role: "assistant", content: "先确认[场地](#task/venue)" },
    { role: "user", content: "继续" },
    { role: "user", content: "请重试" },
  ]);
  assert.deepEqual(messages, before);
});

test("context trimming keeps the entire latest request and never leaves an orphan answer or broken link", () => {
  const latest = { role: "user" as const, content: "问题".repeat(8000) };
  const messages = [
    { role: "user" as const, content: "旧问题".repeat(3000) },
    { role: "assistant" as const, content: "[旧答复](#task/venue)" },
    latest,
  ];
  assert.deepEqual(prepareAIHistory(messages), [latest]);
  const shortHistory = Array.from({ length: 20 }, (_, index) => [
    { role: "user" as const, content: `问题${index}` },
    { role: "assistant" as const, content: `答复${index}` },
  ]).flat();
  const result = prepareAIHistory([...shortHistory, latest]);
  assert.equal(result.length, 11);
  assert.equal(result[0].role, "user");
  assert.deepEqual(result.at(-1), latest);
});
