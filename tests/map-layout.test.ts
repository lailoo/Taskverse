import test from "node:test";
import assert from "node:assert/strict";
import { planMapLayout, planTreeLayout } from "../src/lib/map-layout";
import { makeInitialProject, ancestors } from "../src/lib/tasks";
import { cardSize } from "../src/lib/images";

test("subtree lanes preserve sibling order and routes avoid unrelated cards, including expanded nodes", () => {
  const tasks = makeInitialProject().tasks;
  const seed = tasks[1];
  for (let i = 0; i < 40; i++) tasks.push({ ...seed, id: `layout-${i}`, parentId: i < 8 ? seed.id : `layout-${Math.floor((i - 8) / 4)}`, expanded: i === 9 });
  const { positions, sides, routeOffsets } = planMapLayout(tasks, tasks, cardSize);
  const rect = (id: string) => { const task = tasks.find(t => t.id === id)!; return { ...positions.get(id)!, ...cardSize(task) }; };
  for (const task of tasks) {
    const siblings = tasks.filter(t => t.parentId === task.id);
    if (task.parentId) for (let i = 1; i < siblings.length; i++) assert(positions.get(siblings[i].id)!.x > positions.get(siblings[i - 1].id)!.x);
    if (!task.parentId || !tasks.find(t => t.id === task.parentId)!.parentId) continue;
    const from = rect(task.parentId), to = rect(task.id), above = sides.get(task.id);
    const sx = from.x + from.width / 2, sy = from.y + (above ? 0 : from.height);
    const tx = to.x + to.width / 2, ty = to.y + (above ? to.height : 0);
    const lane = sy + routeOffsets.get(task.parentId)!;
    const segments = [[sx, sy, sx, lane], [sx, lane, tx, lane], [tx, lane, tx, ty]];
    for (const other of tasks.filter(t => t.id !== task.id && t.id !== task.parentId)) {
      const r = rect(other.id);
      for (const [x1, y1, x2, y2] of segments) {
        const hit = x1 === x2 ? x1 > r.x - 8 && x1 < r.x + r.width + 8 && Math.max(y1, y2) > r.y - 8 && Math.min(y1, y2) < r.y + r.height + 8 : y1 > r.y - 8 && y1 < r.y + r.height + 8 && Math.max(x1, x2) > r.x - 8 && Math.min(x1, x2) < r.x + r.width + 8;
        assert(!hit, `${task.parentId}->${task.id} crosses ${other.id}`);
      }
    }
  }
  const root = tasks.find(t => !t.parentId)!;
  const branches = tasks.filter(t => t.parentId === root.id);
  for (let i = 0; i + 2 < branches.length; i++) {
    const group = (id: string) => tasks.filter(t => t.id === id || ancestors(tasks, t.id).some(a => a.id === id)).map(t => rect(t.id));
    assert(Math.max(...group(branches[i].id).map(r => r.x + r.width)) < Math.min(...group(branches[i + 2].id).map(r => r.x)));
  }
});

test("filtering and folding preserve each branch side with finite coordinates", () => {
  const tasks = makeInitialProject().tasks;
  const whole = planMapLayout(tasks, tasks, cardSize);
  const visible = tasks.filter(t => t.id !== "venue" && !ancestors(tasks, t.id).some(p => p.id === "venue"));
  const filtered = planMapLayout(tasks, visible, cardSize);
  for (const task of visible) {
    assert.equal(filtered.sides.get(task.id), whole.sides.get(task.id));
    const position = filtered.positions.get(task.id)!;
    assert(Number.isFinite(position.x) && Number.isFinite(position.y));
  }
});

test("tree layout renders a hierarchical text outline in parent-first order", () => {
  const tasks = makeInitialProject().tasks;
  const { positions } = planTreeLayout(tasks, tasks, cardSize);
  const root = tasks.find(task => !task.parentId)!;
  assert.equal(positions.get(root.id)?.y, 0);
  const order = [...tasks].sort((a, b) => positions.get(a.id)!.y - positions.get(b.id)!.y);
  for (const task of tasks) {
    const position = positions.get(task.id)!;
    assert(Number.isFinite(position.x) && Number.isFinite(position.y));
    if (task.parentId) assert(position.y > positions.get(task.parentId)!.y, `${task.id} is below its parent`);
    const depth = task.parentId ? Math.round(position.x / 28) : 0;
    assert(depth >= 0);
  }
  assert.equal(order[0].id, root.id);
  assert(positions.get("venue")!.y < positions.get("venue-1")!.y);
  assert(positions.get("venue")!.y < positions.get("guests")!.y);
});

test("cloud railway places every subtree above its axis without changing tasks or sibling order", () => {
  const tasks = makeInitialProject().tasks;
  tasks.find(task => task.id === "guests-1")!.expanded = true;
  const before = structuredClone(tasks);
  const { positions, sides, routeOffsets } = planMapLayout(tasks, tasks, cardSize, "above");
  const root = tasks.find(task => !task.parentId)!;
  const axisY = cardSize(root).height / 2;
  const rectangles = tasks.map(task => ({ id: task.id, ...positions.get(task.id)!, ...cardSize(task) }));
  for (const task of tasks.filter(task => task.parentId)) {
    assert.equal(sides.get(task.id), true);
    assert(positions.get(task.id)!.y + cardSize(task).height < axisY);
    assert(routeOffsets.get(task.id)! < 0);
    if (task.parentId !== root.id) assert(positions.get(task.id)!.y + cardSize(task).height < positions.get(task.parentId!)!.y);
  }
  for (let i = 0; i < rectangles.length; i++) for (const other of rectangles.slice(i + 1)) {
    const box = rectangles[i];
    assert(box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y, `${box.id} overlaps ${other.id}`);
  }
  const branches = tasks.filter(task => task.parentId === root.id);
  for (let index = 1; index < branches.length; index++) assert(positions.get(branches[index].id)!.x > positions.get(branches[index - 1].id)!.x);
  const filtered = planMapLayout(tasks, tasks.filter(task => task.id !== "guests-1"), cardSize, "above");
  assert([...filtered.sides.values()].every(Boolean));
  assert.deepEqual(tasks, before);
  const standard = planMapLayout(tasks, tasks, cardSize);
  assert.equal(standard.sides.get("guests"), false, "other themes keep both branch directions");
});
