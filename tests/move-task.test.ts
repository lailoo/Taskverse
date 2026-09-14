import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject, moveTask, reorderTask, placeTaskBeside, validateProject } from "../src/lib/tasks";

test("a child can be promoted beside its parent without losing its subtree", () => {
  const project = makeInitialProject();
  const tasks = placeTaskBeside(project.tasks, "venue-1", "venue", "after");
  assert.equal(tasks.find((task) => task.id === "venue-1")!.parentId, "wedding");
  const siblings = tasks.filter((task) => task.parentId === "wedding").map((task) => task.id);
  assert.equal(siblings.indexOf("venue-1"), siblings.indexOf("venue") + 1);
  assert.doesNotThrow(() => validateProject({ ...project, tasks }));
  assert.throws(() => placeTaskBeside(project.tasks, "venue", "venue-1", "before"));
  assert.throws(() => placeTaskBeside(project.tasks, "venue", "wedding", "after"));
});

test("sibling ordering preserves parents and descendants and survives serialization", () => {
  const project = makeInitialProject();
  const moved = reorderTask(project.tasks, "venue", "style", "after");
  const order = moved.filter((task) => task.parentId === "wedding").map((task) => task.id);
  assert.equal(order.indexOf("venue"), order.indexOf("style") + 1);
  for (const task of moved) assert.equal(task.parentId, project.tasks.find((item) => item.id === task.id)!.parentId);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify({ ...project, tasks: moved }))).tasks, moved);
  const before = reorderTask(moved, "venue", "guests", "before");
  assert.equal(before.filter((task) => task.parentId === "wedding")[0].id, "venue");
  assert.throws(() => reorderTask(project.tasks, "venue", "venue-1", "after"));
});

test("moving a branch preserves descendants, opens its target and appends it", () => {
  const project = makeInitialProject();
  project.tasks.find((task) => task.id === "guests")!.collapsed = true;
  const tasks = moveTask(project.tasks, "venue", "guests");
  assert.equal(tasks.find((task) => task.id === "venue")!.parentId, "guests");
  assert.equal(tasks.find((task) => task.id === "venue-1")!.parentId, "venue");
  assert.equal(tasks.find((task) => task.id === "guests")!.collapsed, false);
  assert.equal(project.tasks.find((task) => task.id === "venue")!.parentId, "wedding");
  assert.equal(tasks.filter((task) => task.parentId === "guests").at(-1)!.id, "venue");
  assert.doesNotThrow(() => validateProject({ ...project, tasks }));
});

test("invalid branch moves cannot create cycles or move the root", () => {
  const { tasks } = makeInitialProject();
  for (const [id, target] of [["venue", "venue"], ["venue", "venue-1"], ["wedding", "guests"], ["venue", "missing"]]) {
    assert.throws(() => moveTask(tasks, id, target));
  }
  assert.equal(moveTask(tasks, "venue", "wedding"), tasks);
});
