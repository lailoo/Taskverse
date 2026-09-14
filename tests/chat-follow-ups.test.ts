import test from "node:test";
import assert from "node:assert/strict";
import { conversationFollowUps, prioritizeQueuedMessage, validFollowUps } from "../src/lib/chat-follow-ups";
import { parseAIReply } from "../src/lib/ai";
import { makeInitialProject } from "../src/lib/tasks";

test("latest reply replaces previous suggestions while explicit empty ends suggestions", () => {
  const next = [{ label: "确认试菜人数", message: "试菜人数如何确定？" }];
  const messages = [{ role: "assistant", followUps: [{ label: "旧建议", message: "旧问题" }] }, { role: "assistant", followUps: next }, { role: "user" }];
  assert.deepEqual(conversationFollowUps(messages), next);
  assert.deepEqual(conversationFollowUps([...messages, { role: "assistant", followUps: [] }]), []);
  assert.equal(conversationFollowUps([]).length, 3);
  assert.equal(conversationFollowUps([{ role: "assistant", tasks: [{ title: "试菜" }, { title: "试菜" }] }]).length, 1);
});

test("optional suggestions are bounded and do not invalidate an otherwise valid old model response", () => {
  const followUps = [{ label: "下一步", message: "请细化预算" }];
  assert.deepEqual(parseAIReply({ reply: "建议", tasks: [], followUps }, makeInitialProject()).followUps, followUps);
  assert.equal(parseAIReply({ reply: "建议", tasks: [], followUps: "invalid" }, makeInitialProject()).followUps, undefined);
  assert.equal(validFollowUps(Array(4).fill(followUps[0])), false);
  assert.equal(validFollowUps([{ label: " ", message: "问题" }]), false);
});

test("Steer moves a queued message to the front and bypasses the todo pause", () => {
  const queue = [
    { id: "a", sessionId: "s", text: "先做预算" },
    { id: "b", sessionId: "s", text: "立刻调整场地任务" },
  ];
  assert.deepEqual(prioritizeQueuedMessage(queue, "b"), {
    queue: [queue[1], queue[0]],
    bypassTodoPause: true,
  });
  assert.equal(prioritizeQueuedMessage(queue, "missing"), null);
});
