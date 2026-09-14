import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChatStore } from "../src/lib/chat-store";
import { applySuggestions } from "../src/lib/ai";
import { makeInitialProject } from "../src/lib/tasks";

test("public note sources persist across sessions and reject unsafe or oversized links", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-search-history-"));
  let store = new ChatStore(directory);
  try {
    const chat = store.create();
    const source = { title: "婚礼花材", url: "https://www.xiaohongshu.com/explore/66abcdef0123456789012345", snippet: "白色花材" };
    const search = { provider: "tavily" as const, query: "婚礼", searchedAt: "2026-09-14T10:00:00Z", sources: [source] };
    store.save(chat.id, [{ role: "assistant", content: "找到笔记", search }], 0);
    store.close(); store = new ChatStore(directory);
    assert.deepEqual(store.read(chat.id)!.messages[0].search, search);
    assert.throws(() => store.save(chat.id, [{ role: "assistant", content: "bad", search: {...search,sources:[{...source,url:"javascript:alert(1)"}]} }], 1), /搜索/);
    assert.throws(() => store.save(chat.id, [{ role: "user", content: "bad", search }], 1), /搜索/);
  } finally { store.close(); rmSync(directory,{recursive:true,force:true}); }
});

test("reasoning and interrupted replies survive reopening without task actions", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-stream-history-"));
  let store = new ChatStore(directory);
  try {
    const chat = store.create();
    const message = { role: "assistant" as const, content: "已收到的正文", reasoning: "接口返回的思考内容", interrupted: true };
    store.save(chat.id, [message], 0);
    store.close(); store = new ChatStore(directory);
    assert.deepEqual(store.read(chat.id)!.messages, [message]);
    for (const invalid of [{ reasoning: 12 }, { reasoning: "字".repeat(32001) }, { interrupted: "yes" }, { role: "user", reasoning: "bad" }]) {
      assert.throws(() => store.save(chat.id, [{ ...message, ...invalid }] as never, 1), /格式/);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("partial task additions persist per-item markers and allow adding the rest", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-selection-"));
  let store = new ChatStore(directory);
  try {
    const tasks = [1, 2, 3].map(i => ({ title: `Selection ${i}`, parentId: "venue", description: "", owner: "", due: "" }));
    let project = makeInitialProject();
    const initial = project.tasks.length;
    project = applySuggestions(project, [tasks[1]]);
    assert.equal(project.tasks.length, initial + 1);
    assert.equal(project.tasks.some(task => task.title === tasks[0].title), false);
    const chat = store.create();
    store.save(chat.id, [{ role: "assistant", content: "Suggested tasks", tasks, addedIndices: [1], skippedIndices: [2], added: false }], 0);
    store.close(); store = new ChatStore(directory);
    const saved = store.read(chat.id)!;
    assert.deepEqual(saved.messages[0].addedIndices, [1]);
    assert.deepEqual(saved.messages[0].skippedIndices, [2]);
    assert.equal(saved.messages[0].added, false);
    project = applySuggestions(project, [tasks[0], tasks[2]]);
    assert.equal(project.tasks.length, initial + 3);
    assert.equal(applySuggestions(project, tasks).tasks.length, initial + 3);
    assert.throws(() => store.save(chat.id, [{ role: "assistant", content: "bad", tasks, addedIndices: [3] }], saved.revision), /格式/);
    assert.throws(() => store.save(chat.id, [{ role: "assistant", content: "bad", tasks, skippedIndices: [3] }], saved.revision), /格式/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("chat sessions survive reopening, remain separate, and reject stale writes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-chats-"));
  let store = new ChatStore(directory);
  try {
    const first = store.create(), second = store.create();
    const followUps = [{ label: "确认试菜安排", message: "请细化试菜安排" }];
    store.save(first.id, [{ role: "user", content: "筹备进展" }, { role: "assistant", content: "先确认场地", tasks: [], added: true, followUps }], 0);
    assert.throws(() => store.save(first.id, [], 0), /其他窗口/);
    store.close();
    store = new ChatStore(directory);
    assert.equal(store.list().length, 2);
    assert.equal(store.read(first.id)!.messages.length, 2);
    assert.deepEqual(store.read(first.id)!.messages[1].followUps, followUps);
    assert.throws(() => store.save(first.id, [{ role: "assistant", content: "错误", followUps: [{ label: "", message: "" }] }], 1), /格式/);
    assert.equal(store.read(first.id)!.title, "筹备进展");
    assert.equal(store.read(second.id)!.messages.length, 0);
    const session = store.read(first.id)!;
    store.save(first.id, [...session.messages, { role: "user", content: "下一步呢" }], session.revision);
    assert.equal(store.read(first.id)!.messages.length, 3);
    assert.throws(() => store.save(first.id, [{ role: "system", content: "bad" }] as never, 2), /格式/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("conversation summary and long-term memory survive reopening", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-memory-"));
  let store = new ChatStore(directory);
  try {
    const chat = store.create();
    const memory = { weddingDate: "2026-09-27", budget: "12万元", preferences: ["自然光"], decisions: ["先定场地"] };
    store.save(chat.id, [{ role: "user", content: "记住婚期" }], 0, "场地和预算正在确认。", memory);
    store.close();
    store = new ChatStore(directory);
    const saved = store.read(chat.id)!;
    assert.equal(saved.summary, "场地和预算正在确认。");
    assert.deepEqual(saved.memory, memory);
    assert.throws(() => store.save(chat.id, [], saved.revision, "x".repeat(6001), memory), /摘要/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
