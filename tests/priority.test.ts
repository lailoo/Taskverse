import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject, validateProject } from "../src/lib/tasks";
import { PRIORITIES } from "../src/lib/types";

test("priority survives project serialization and legacy tasks remain valid", () => {
  const project = makeInitialProject();
  for (const priority of PRIORITIES) {
    project.tasks[1].priority = priority;
    const restored = validateProject(JSON.parse(JSON.stringify(project)));
    assert.equal(restored.tasks[1].priority, priority);
  }
  delete project.tasks[1].priority;
  assert.equal(
    validateProject(project).tasks[1].priority ?? "none",
    "none",
  );
});

test("previous priority names migrate to the new scale", () => {
  for (const [oldValue, expected] of [["normal", "none"], ["urgent", "high"]]) {
    const input = JSON.parse(JSON.stringify(makeInitialProject()));
    input.tasks[1].priority = oldValue;
    assert.equal(validateProject(input).tasks[1].priority, expected);
  }
});

test("invalid priorities are rejected before saving", () => {
  const project = makeInitialProject();
  for (const priority of ["unknown", "", null, 1]) {
    const input = JSON.parse(JSON.stringify(project));
    input.tasks[1].priority = priority;
    assert.throws(() => validateProject(input), /优先级/);
  }
});
