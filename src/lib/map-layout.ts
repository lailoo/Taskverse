import { hierarchy, tree as d3Tree } from "d3-hierarchy";
import type { Task } from "./types";

type Size = { width: number; height: number };
const GAP = 100;

/** Pack complete subtrees into separate lanes; route each depth through a shared clear band. */
export function planMapLayout(all: Task[], visible: Task[], size: (task: Task) => Size, branchPlacement: "both" | "above" = "both") {
  const root = all.find(task => !task.parentId)!;
  const children = new Map<string, Task[]>();
  for (const task of visible) {
    if (!task.parentId) continue;
    const list = children.get(task.parentId) || [];
    list.push(task); children.set(task.parentId, list);
  }
  const positions = new Map<string, { x: number; y: number }>([[root.id, { x: 0, y: 0 }]]);
  const sides = new Map<string, boolean>();
  const routeOffsets = new Map<string, number>();
  const branches = all.filter(task => task.parentId === root.id);
  const visibleIds = new Set(visible.map(task => task.id));
  for (const above of branchPlacement === "above" ? [true] : [true, false]) {
    const forests = branches.filter((task, index) => (branchPlacement === "above" || (index % 2 === 0) === above) && visibleIds.has(task.id)).map(branch => {
      const data = hierarchy(branch, task => children.get(task.id));
      const width = Math.max(...data.descendants().map(node => size(node.data).width));
      return d3Tree<Task>().nodeSize([width + 48, 1]).separation((a, b) => a.parent === b.parent ? 1 : 1.25)(data);
    });
    const heights: number[] = [];
    for (const forest of forests) for (const node of forest.descendants()) heights[node.depth] = Math.max(heights[node.depth] || 0, size(node.data).height);
    const depths = [0];
    for (let i = 0; i < heights.length; i++) depths[i + 1] = depths[i] + heights[i] + GAP;
    let cursor = size(root).width + GAP + (above ? 0 : 150);
    for (const forest of forests) {
      const nodes = forest.descendants();
      const left = Math.min(...nodes.map(node => node.x - size(node.data).width / 2));
      const right = Math.max(...nodes.map(node => node.x + size(node.data).width / 2));
      for (const node of nodes) {
        const box = size(node.data);
        const distance = GAP + depths[node.depth];
        sides.set(node.data.id, above);
        positions.set(node.data.id, {
          x: cursor + node.x - box.width / 2 - left,
          y: size(root).height / 2 + (above ? -distance - box.height : distance),
        });
        routeOffsets.set(node.data.id, (above ? -1 : 1) * (heights[node.depth] - box.height + GAP / 2));
      }
      cursor += right - left + 100;
    }
  }
  return { positions, sides, routeOffsets };
}

/** Lay the same parent/child data out as a conventional top-down tree. */
export function planTreeLayout(all: Task[], visible: Task[], size: (task: Task) => Size) {
  const root = all.find(task => !task.parentId);
  if (!root) return {
    positions: new Map<string, { x: number; y: number }>(),
    depths: new Map<string, number>(),
    lastChild: new Map<string, boolean>(),
  };
  const visibleIds = new Set(visible.map(task => task.id));
  const children = new Map<string, Task[]>();
  for (const task of visible) {
    if (!task.parentId || !visibleIds.has(task.parentId)) continue;
    const siblings = children.get(task.parentId) || [];
    siblings.push(task);
    children.set(task.parentId, siblings);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const depths = new Map<string, number>();
  const lastChild = new Map<string, boolean>();
  const outline = hierarchy(root, task => children.get(task.id));
  const rowHeight = Math.max(34, ...outline.descendants().map(node => size(node.data).height)) + 16;
  let row = 0;
  const visit = (task: Task, depth: number, isLast: boolean) => {
    if (!visibleIds.has(task.id)) return;
    positions.set(task.id, { x: depth * 28, y: row * rowHeight });
    depths.set(task.id, depth);
    lastChild.set(task.id, isLast);
    row += 1;
    const next = children.get(task.id) || [];
    next.forEach((child, index) => visit(child, depth + 1, index === next.length - 1));
  };
  visit(root, 0, true);
  return { positions, depths, lastChild };
}
