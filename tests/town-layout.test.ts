import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeInitialProject } from "../src/lib/tasks";
import { planTownLayout, tileKey, townResidentCount, townTraveler } from "../src/lib/town-layout";
import type { Task } from "../src/lib/types";

function validateTown(tasks: Task[]) {
  const layout = planTownLayout(tasks);
  assert.equal(layout.plots.length, tasks.length);
  assert.equal(new Set(layout.plots.map(plot => plot.taskId)).size, tasks.length);
  const first = [...layout.roadTiles][0], reached = new Set([first]), queue = [first];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i].split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = tileKey(x + dx, y + dy);
      if (layout.roadTiles.has(key) && !reached.has(key)) { reached.add(key); queue.push(key); }
    }
  }
  assert.equal(reached.size, layout.roadTiles.size, "all streets connect to the entrance");
  for (const [i, plot] of layout.plots.entries()) {
    assert.ok(reached.has(tileKey(plot.door.x / 32, plot.door.y / 32)), "building has a reachable entrance");
    assert.ok(plot.x >= 0 && plot.y >= 0 && plot.x + plot.width <= layout.width && plot.y + plot.height <= layout.height);
    for (const other of layout.plots.slice(i + 1)) assert.ok(!(plot.x < other.x + other.width && plot.x + plot.width > other.x && plot.y < other.y + other.height && plot.y + plot.height > other.y), `overlap: ${plot.taskId}, ${other.taskId}`);
    for (const key of layout.roadTiles) {
      const [x, y] = key.split(",").map(Number);
      assert.ok(!(x * 32 < plot.x + plot.width && x * 32 + 32 > plot.x && y * 32 < plot.y + plot.height && y * 32 + 32 > plot.y), `road crosses building ${plot.taskId}`);
    }
    for (let seconds = 0; seconds < 100; seconds += .73) {
      const person = townTraveler(plot.route, seconds);
      assert.ok(reached.has(tileKey(Math.floor(person.x / 32), Math.floor(person.y / 32))), "resident walks on streets");
    }
  }
  return layout;
}

test("town is a connected street network with one unobstructed plot per task", () => {
  validateTown(makeInitialProject().tasks);
});

test("large uneven branches and nested tasks fit into street blocks", () => {
  const base = makeInitialProject().tasks;
  const tasks = [...base, ...Array.from({ length: 70 }, (_, i) => ({ ...base[2], id: `extra-${i}`, parentId: i % 4 ? "venue" : "guests" }))];
  validateTown(tasks);
});

test("status, priority and task detail updates do not move buildings or streets", () => {
  const tasks = makeInitialProject().tasks, before = planTownLayout(tasks);
  const after = planTownLayout(tasks.map(task => ({ ...task, status: "done" as const, priority: "high" as const, description: "updated" })));
  assert.deepEqual(after.plots.map(p => [p.taskId, p.x, p.y, p.width, p.height]), before.plots.map(p => [p.taskId, p.x, p.y, p.width, p.height]));
  assert.deepEqual(after.roadTiles, before.roadTiles);
  assert.equal(after.plots.find(p => p.civic)?.completed, tasks.length);
});

test("top-level mind-map branches become stable town districts", () => {
  const tasks = makeInitialProject().tasks, layout = planTownLayout(tasks);
  const root = tasks.find(task => !task.parentId)!;
  const firstLevel = tasks.filter(task => task.parentId === root.id);
  assert.equal(layout.districts.length, firstLevel.length);
  assert.deepEqual(layout.districts.map(district => district.id), firstLevel.map(task => task.id));
  for (const district of layout.districts) {
    assert.equal(district.parentId, root.id);
    assert.equal(district.depth, 1);
    assert.ok(district.memberIds.includes(district.id));
    for (const plot of layout.plots.filter(plot => plot.districtId === district.id)) assert.ok(district.memberIds.includes(plot.taskId));
    assert.ok(district.width > 0 && district.height > 0);
  }
});

test("districts expose stable layout templates and place the branch task at the center", () => {
  const layout = planTownLayout(makeInitialProject().tasks);
  assert.ok(new Set(layout.districts.map(district => district.layoutStyle)).size >= 3);
  for (const district of layout.districts) {
    const center = layout.plots.find(plot => plot.taskId === district.centerTaskId)!;
    assert.equal(center.hierarchyDepth, 0);
    assert.ok(layout.plots.filter(plot => plot.districtId === district.id && plot.hierarchyDepth > 0).every(plot => plot.y >= center.y));
  }
});

test("first-level districts share a horizontal civic axis", () => {
  const layout = planTownLayout(makeInitialProject().tasks);
  assert.ok(layout.districts.length > 1);
  assert.equal(new Set(layout.districts.map(district => district.y)).size, 1);
  for (let i = 1; i < layout.districts.length; i++) assert.ok(layout.districts[i].x > layout.districts[i - 1].x);
  assert.ok(layout.width > layout.height);
});

test("town population grows with the visible city while remaining bounded", () => {
  assert.equal(townResidentCount(0), 0);
  assert.equal(townResidentCount(12), 26);
  assert.equal(townResidentCount(25), 53);
  assert.equal(townResidentCount(100), 96);
});

test("town districts receive stable gathering points away from roads and buildings", () => {
  const tasks = makeInitialProject().tasks, layout = planTownLayout(tasks), again = planTownLayout(tasks);
  assert.deepEqual(layout.gatherings, again.gatherings);
  assert.ok(layout.gatherings.length > 0);
  for (const gathering of layout.gatherings) {
    assert.ok(!layout.roadTiles.has(tileKey(Math.floor(gathering.x / 32), Math.floor(gathering.y / 32))));
    for (const plot of layout.plots) {
      assert.ok(!(gathering.x - gathering.radius < plot.x + plot.width && gathering.x + gathering.radius > plot.x && gathering.y - gathering.radius < plot.y + plot.height && gathering.y + gathering.radius > plot.y));
    }
  }
});

test("orphaned branches receive their own district instead of crossing a first-level park", () => {
  const tasks = makeInitialProject().tasks;
  tasks.push({ ...tasks[2], id: "orphan-branch", parentId: "missing-parent", title: "外部供应商" });
  const layout = planTownLayout(tasks), district = layout.districts.find(item => item.id === "orphan-branch");
  assert.ok(district);
  assert.equal(district!.memberIds.includes("orphan-branch"), true);
  assert.equal(layout.plots.find(plot => plot.taskId === "orphan-branch")!.districtId, "orphan-branch");
});

test("empty, root-only, orphaned and cyclic imports terminate with accessible plots", () => {
  const base = makeInitialProject().tasks[0];
  validateTown([]); validateTown([base]);
  validateTown([base, { ...base, id: "orphan", parentId: "missing" }]);
  validateTown([base, { ...base, id: "a", parentId: "b" }, { ...base, id: "b", parentId: "a" }]);
});

test("imported AI Town files match the pinned source manifest", () => {
  const manifest = JSON.parse(readFileSync("public/assets/ai-town/manifest.json", "utf8"));
  assert.equal(manifest.commit, "8e05997f2409275669c8344b84a51692e83f3f33");
  for (const [name, entry] of Object.entries(manifest.files) as [string, { sha256: string }][]) {
    assert.equal(createHash("sha256").update(readFileSync(`public/assets/ai-town/${name}`)).digest("hex"), entry.sha256, name);
  }
});
