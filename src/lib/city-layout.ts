import { childrenOf, descendants } from "./tasks";
import type { Status, Task } from "./types";

export type CityBuildingLevel = 1 | 2 | 3 | 4;
export type CityBuilding = {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: CityBuildingLevel;
  depth: number;
  total: number;
  completed: number;
  status: Status;
};
export type CityRoad = { from: string; to: string; x1: number; y1: number; x2: number; y2: number; status: Status };

export function subtreeStats(tasks: Task[], id: string) {
  const nodes = [tasks.find(task => task.id === id), ...descendants(tasks, id)].filter((task): task is Task => !!task);
  return { total: nodes.length, completed: nodes.filter(task => task.status === "done").length };
}

export function buildingLevel(total: number): CityBuildingLevel {
  if (total <= 1) return 1;
  if (total <= 4) return 2;
  if (total <= 9) return 3;
  return 4;
}

export function planCityLayout(tasks: Task[], visibleIds?: Set<string>) {
  const root = tasks.find(task => !task.parentId);
  if (!root) return { buildings: [] as CityBuilding[], roads: [] as CityRoad[], width: 1080, height: 720 };
  const allowed = visibleIds ? new Set(visibleIds) : new Set(tasks.map(task => task.id));
  allowed.add(root.id);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const buildings: CityBuilding[] = [];
  const roads: CityRoad[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  const add = (task: Task, x: number, y: number, depth: number) => {
    if (!allowed.has(task.id) || buildings.some(building => building.taskId === task.id)) return;
    const { total, completed } = subtreeStats(tasks, task.id);
    const level = buildingLevel(total);
    const width = 118 + level * 18;
    const height = 92 + level * 15;
    positions.set(task.id, { x, y });
    buildings.push({ taskId: task.id, x, y, width, height, level, depth, total, completed, status: task.status });
    const children = childrenOf(tasks, task.id).filter(child => allowed.has(child.id));
    children.forEach((child, index) => {
      const offset = (index - (children.length - 1) / 2) * 194;
      add(child, x + offset, y + 172, depth + 1);
    });
  };
  add(root, 540, 40, 0);
  for (const building of buildings) {
    const task = byId.get(building.taskId);
    if (!task?.parentId) continue;
    const parent = positions.get(task.parentId);
    if (!parent) continue;
    roads.push({ from: task.parentId, to: task.id, x1: parent.x, y1: parent.y + 100, x2: building.x, y2: building.y, status: task.status });
  }
  const maxY = buildings.reduce((max, building) => Math.max(max, building.y + building.height), 0);
  return { buildings, roads, width: 1080, height: Math.max(720, maxY + 80) };
}
