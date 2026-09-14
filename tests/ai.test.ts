import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject } from "../src/lib/tasks";
import { parseAIReply, applyAIChanges, applySuggestions, suggestionIsHandled } from "../src/lib/ai";

test("AI task proposals validate parents and dates before applying", () => {
  const project = makeInitialProject();
  const task = {
    title: "确认雨天预案",
    parentId: project.tasks[0].id,
    description: "联系场地",
    owner: "",
    due: "2026-09-20",
  };
  assert.throws(() =>
    parseAIReply(
      { reply: "建议", tasks: [{ ...task, parentId: "missing" }] },
      project,
    ),
  );
  assert.throws(() =>
    parseAIReply(
      { reply: "建议", tasks: [{ ...task, due: "2026-02-30" }] },
      project,
    ),
  );
  const next = applySuggestions(project, [task, task]);
  assert.equal(next.tasks.length, project.tasks.length + 1);
  assert.equal(applySuggestions(next, [task]), next);
  assert.equal(
    project.tasks.some((t) => t.title === task.title),
    false,
  );
});

test("AI canvas changes validate and apply as one project transform", () => {
  const project = makeInitialProject();
  const changes = [
    { type: "add", parentId: "venue", title: "确认灯光方案", description: "联系供应商", owner: "我", due: "", priority: "high" },
    { type: "status", taskId: "venue-1", status: "doing" },
    { type: "update", taskId: "venue-2", title: "预约看场与试菜", description: "安排周末试菜" },
    { type: "move", taskId: "guests-1", parentId: "venue" },
  ] as const;
  const parsed = parseAIReply({ reply: "已整理", tasks: [], changes }, project);
  assert.equal(parsed.changes?.length, changes.length);
  const next = applyAIChanges(project, parsed.changes || []);
  assert.equal(next.tasks.length, project.tasks.length + 1);
  assert.equal(next.tasks.find(task => task.id === "venue-1")?.status, "doing");
  assert.equal(next.tasks.find(task => task.id === "venue-2")?.description, "安排周末试菜");
  assert.equal(next.tasks.find(task => task.id === "guests-1")?.parentId, "venue");
  assert.throws(() => parseAIReply({ reply: "删除", tasks: [], changes: [{ type: "delete", taskId: "wedding" }] }, project));
});

test("AI canvas changes can reorder siblings and reject invalid dates", () => {
  const project = makeInitialProject();
  const parsed = parseAIReply({
    reply: "已调整",
    tasks: [],
    changes: [{ type: "reorder", taskId: "venue-2", targetId: "venue-1", placement: "before" }],
  }, project);
  const next = applyAIChanges(project, parsed.changes || []);
  assert.deepEqual(next.tasks.filter(task => task.parentId === "venue").map(task => task.id), ["venue-2", "venue-1"]);
  assert.throws(() => parseAIReply({ reply: "修改", tasks: [], changes: [{ type: "update", taskId: "venue-1", due: "2026-02-30" }] }, project));
});

test("AI add changes default omitted optional task fields instead of rejecting the whole reply", () => {
  const parsed = parseAIReply({
    reply: "已补充",
    tasks: [],
    changes: [{ type: "add", parentId: "venue", title: "确认备用场地" }],
  }, makeInitialProject());
  assert.deepEqual(parsed.changes, [{
    type: "add", parentId: "venue", title: "确认备用场地", description: "", owner: "", due: "",
  }]);
});

test("AI reply accepts an incremental summary and long-term memory facts", () => {
  const project = makeInitialProject();
  const parsed = parseAIReply({
    reply: "已记下",
    tasks: [],
    summary: "已确认场地候选，等待试菜反馈。",
    memory: { weddingDate: "2026-09-27", budget: "12万元", preferences: ["自然光", "室内备选"], decisions: ["优先确认场地"] },
  }, project);
  assert.equal(parsed.summary, "已确认场地候选，等待试菜反馈。");
  assert.deepEqual(parsed.memory?.preferences, ["自然光", "室内备选"]);
});

test("AI memory fields remain optional for compatible providers", () => {
  const parsed = parseAIReply({ reply: "继续", tasks: [] }, makeInitialProject());
  assert.equal(parsed.summary, undefined);
  assert.equal(parsed.memory, undefined);
});

test("a task suggestion is handled after the task is moved to another parent", () => {
  const project = makeInitialProject();
  const suggestion = {
    title: "预约看场与试菜",
    parentId: "venue",
    description: "",
    owner: "",
    due: "",
  };
  const moved = {
    ...project,
    tasks: project.tasks.map(task => task.id === "venue-2" ? { ...task, parentId: "guests" } : task),
  };
  assert.equal(suggestionIsHandled(moved, suggestion), true);
});
