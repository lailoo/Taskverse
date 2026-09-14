import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialProject, descendants } from "../src/lib/tasks";
import { buildingLevel, planCityLayout, subtreeStats } from "../src/lib/city-layout";

test("building level follows the amount of work in a subtree", () => {
  assert.equal(buildingLevel(1), 1);
  assert.equal(buildingLevel(4), 2);
  assert.equal(buildingLevel(9), 3);
  assert.equal(buildingLevel(10), 4);
});

test("city layout includes a stable building and road for every visible task", () => {
  const project = makeInitialProject();
  const visible = new Set(project.tasks.map(task => task.id));
  const layout = planCityLayout(project.tasks, visible);
  assert.equal(layout.buildings.length, project.tasks.length);
  assert.equal(layout.roads.length, project.tasks.length - 1);
  assert.equal(layout.buildings[0].taskId, "wedding");
  assert.equal(layout.buildings.find(building => building.taskId === "venue")?.level, 2);
  assert.deepEqual(subtreeStats(project.tasks, "venue"), { total: descendants(project.tasks, "venue").length + 1, completed: 0 });
  const second = planCityLayout(project.tasks, visible);
  assert.deepEqual(layout, second);
});
