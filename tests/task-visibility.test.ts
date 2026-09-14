import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject, unfinishedTreeIds } from "../src/lib/tasks";

test("unfinished view hides completed branches but retains root and ancestry", () => {
  const project = makeInitialProject();
  const tasks = project.tasks.map((task) => ({
    ...task,
    status: "done" as const,
  }));
  const target = tasks.find((task) => task.id === "venue-1")!;
  const visible = unfinishedTreeIds(
    tasks.map((task) =>
      task.id === target.id ? { ...task, status: "waiting" as const } : task,
    ),
  );
  assert.deepEqual([...visible].sort(), ["wedding", "venue", "venue-1"].sort());
  assert.deepEqual([...unfinishedTreeIds(tasks)], ["wedding"]);
  assert.equal(tasks.length, project.tasks.length);
});
