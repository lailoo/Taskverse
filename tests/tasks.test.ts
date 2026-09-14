import test from "node:test";
import assert from "node:assert/strict";
import { taskImages } from "../src/lib/images-model";
import {
  addTask,
  ancestors,
  childrenOf,
  deleteTask,
  descendants,
  makeInitialProject,
  setTaskStatus,
  updateTask,
  validateProject,
} from "../src/lib/tasks";

test("sample is valid, detached by validation, and all six branches have children", () => {
  const project = makeInitialProject();
  const copy = validateProject(project);
  assert.deepEqual(copy, project);
  assert.notEqual(copy.tasks[0], project.tasks[0]);
  assert.equal(childrenOf(project.tasks, "wedding").length, 6);
  assert.equal(descendants(project.tasks, "wedding").length, 18);
  assert.deepEqual(
    ancestors(project.tasks, "venue-1").map((task) => task.id),
    ["wedding", "venue"],
  );
});

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=";

test("image lists preserve legacy covers and explicit removal across backup validation", () => {
  const project = makeInitialProject();
  const task = project.tasks.find((item) => item.id === "venue-1")!;
  assert.deepEqual(taskImages(task), ["/images/wedding-table.jpg"]);
  task.images = [];
  let restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(taskImages(restored.tasks.find((item) => item.id === task.id)!), []);
  task.images = [png, "https://example.com/venue.jpg"];
  task.image = png;
  restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.tasks.find((item) => item.id === task.id)!.images, task.images);
  assert.notEqual(restored.tasks.find((item) => item.id === task.id)!.images, task.images);
});

test("image validation accepts supported raster headers and rejects unsafe or malformed payloads", () => {
  const project = makeInitialProject();
  const task = project.tasks[1];
  task.images = [png, "data:image/jpeg;base64,/9j/2Q==", "data:image/webp;base64,UklGRgQAAABXRUJQ"];
  assert.doesNotThrow(() => validateProject(project));
  for (const invalid of [
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/png;base64,SGVsbG8=",
    "data:image/png;base64,abc",
    "data:image/jpeg;base64,////!",
    "data:image/png;base64,",
    "javascript:alert(1)",
    "/images/../private",
    "",
  ]) {
    task.images = [invalid];
    assert.throws(() => validateProject(project), invalid);
  }
  task.images = "invalid" as never;
  assert.throws(() => validateProject(project));
  task.images = [null] as never;
  assert.throws(() => validateProject(project));
});

test("image validation enforces per-task, per-image and whole-project limits", () => {
  const project = makeInitialProject();
  project.tasks[1].images = Array(12).fill(png);
  assert.doesNotThrow(() => validateProject(project));
  project.tasks[1].images!.push(png);
  assert.throws(() => validateProject(project), /12/);
  project.tasks[1].images = ["data:image/png;base64," + "A".repeat(1024 * 1024)];
  assert.throws(() => validateProject(project), /1 MB/);
  const nearLimit = "data:image/png;base64," + Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    Buffer.alloc(750000),
  ]).toString("base64");
  for (const task of project.tasks) task.images = [nearLimit, nearLimit, nearLimit];
  assert.throws(() => validateProject(project), /40 MB/);
});

test("completion propagates down and reconciles ancestors without mutating input", () => {
  const original = makeInitialProject().tasks;
  const completed = setTaskStatus(original, "venue", "done");
  assert.ok(
    descendants(completed, "venue").every((task) => task.status === "done"),
  );
  assert.equal(original.find((task) => task.id === "venue")!.status, "todo");
  const reopened = setTaskStatus(completed, "venue-1", "doing");
  assert.equal(reopened.find((task) => task.id === "venue")!.status, "todo");
  assert.equal(reopened.find((task) => task.id === "venue-2")!.status, "done");
  const finished = setTaskStatus(reopened, "venue-1", "done");
  assert.equal(finished.find((task) => task.id === "venue")!.status, "done");
  const reopenedParent = setTaskStatus(finished, "venue", "waiting");
  assert.ok(
    descendants(reopenedParent, "venue").every(
      (task) => task.status === "todo",
    ),
  );
  const all = setTaskStatus(original, "wedding", "done");
  assert.ok(all.every((task) => task.status === "done"));
  assert.ok(
    setTaskStatus(all, "wedding", "todo").every(
      (task) => task.status === "todo",
    ),
  );
});

test("incomplete children preserve active parent status", () => {
  let tasks = setTaskStatus(makeInitialProject().tasks, "venue", "waiting");
  tasks = setTaskStatus(tasks, "venue-1", "done");
  assert.equal(tasks.find((task) => task.id === "venue")!.status, "waiting");
});

test("adding reopens ancestors and expands parent branch; deleting removes subtree", () => {
  const completed = updateTask(
    setTaskStatus(makeInitialProject().tasks, "wedding", "done"),
    "venue",
    { collapsed: true },
  );
  const added = addTask(completed, "venue", "新候选场地");
  const child = added.tasks.find((task) => task.id === added.id)!;
  assert.equal(child.color, "blue");
  assert.equal(child.expanded, false);
  assert.equal(child.status, "todo");
  assert.equal(
    added.tasks.find((task) => task.id === "venue")!.collapsed,
    false,
  );
  assert.ok(
    ancestors(added.tasks, added.id).every((task) => task.status === "todo"),
  );
  const removed = deleteTask(added.tasks, added.id);
  assert.equal(removed.find((task) => task.id === "wedding")!.status, "done");
  const pruned = deleteTask(removed, "venue");
  assert.ok(
    pruned.every((task) => task.id !== "venue" && task.parentId !== "venue"),
  );
  assert.equal(deleteTask(pruned, "wedding"), pruned);
  assert.throws(() => addTask(pruned, "missing"));
  const updated = updateTask(pruned, "guests", {
    id: "bad",
    parentId: null,
    title: "宾客计划",
  });
  assert.equal(
    updated.find((task) => task.id === "guests")!.parentId,
    "wedding",
  );
});

test("validation rejects malformed trees, status, dates, numbers and unsafe URLs", () => {
  const invalid = (
    change: (project: ReturnType<typeof makeInitialProject>) => void,
  ) => {
    const project = makeInitialProject();
    change(project);
    assert.throws(() => validateProject(project));
  };
  invalid((project) => {
    project.tasks[1].parentId = "venue-1";
  });
  invalid((project) => {
    project.tasks[1].id = "wedding";
  });
  invalid((project) => {
    project.tasks[1].parentId = "missing";
  });
  invalid((project) => {
    project.tasks[1].parentId = null;
  });
  invalid((project) => {
    project.tasks[1].status = "invalid" as never;
  });
  invalid((project) => {
    project.tasks[1].color = "__proto__" as never;
  });
  invalid((project) => {
    project.tasks[1].link = "javascript:alert(1)";
  });
  invalid((project) => {
    project.tasks[1].image = "data:image/png;base64,abc";
  });
  invalid((project) => {
    project.tasks[1].image = "/images/../private";
  });
  invalid((project) => {
    project.date = "2026-02-30";
  });
  invalid((project) => {
    project.budget = Infinity;
  });
  invalid((project) => {
    project.tasks[1].budget = -1;
  });
  invalid((project) => {
    project.tasks[1].title = "x".repeat(201);
  });
  invalid((project) => {
    project.tasks = Array(501).fill(project.tasks[0]);
  });
});
