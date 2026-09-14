import { buildingLevel, type CityBuildingLevel } from "./city-layout";
import type { Status, Task } from "./types";
import { selectTownBuilding, type TownBuildingKind } from "./town-buildings";

export const TOWN_TILE = 32;
export type TownPoint = { x: number; y: number };
export type TownPlot = TownPoint & {
  taskId: string; districtId: string; width: number; height: number;
  level: CityBuildingLevel; total: number; completed: number; status: Status;
  door: TownPoint; route: TownPoint[]; civic: boolean;
  hierarchyDepth: number;
  kind: TownBuildingKind; variant: 0 | 1 | 2;
};
export type TownStreet = { from: TownPoint; to: TownPoint };
export type TownDistrict = {
  id: string; title: string; x: number; y: number; width: number; height: number;
  parentId: string | null; depth: 1; centerTaskId: string; layoutStyle: "ring" | "terrace" | "courtyard" | "radial";
  memberIds: string[]; accent: 0 | 1 | 2 | 3 | 4 | 5;
};
export type TownGathering = {
  id: string; districtId: string; x: number; y: number; radius: number;
  kind: "plaza" | "market" | "campfire";
};
export type TownLayout = {
  width: number; height: number; plots: TownPlot[]; streets: TownStreet[];
  districts: TownDistrict[]; roadTiles: Set<string>; plaza: TownPoint; gatherings: TownGathering[];
};

export const tileKey = (x: number, y: number) => `${x},${y}`;
export function townResidentCount(visibleBuildingCount: number) {
  if (visibleBuildingCount <= 0) return 0;
  // A task is a place where someone works, visits or waits. Keep a small
  // town lively from the first few buildings, then grow the population with
  // the town instead of using one fixed crowd size for every project.
  return Math.min(96, Math.max(16, Math.ceil(visibleBuildingCount * 2.1)));
}
const snap = (n: number) => Math.round(n / TOWN_TILE) * TOWN_TILE;
const TOWN_ROW = 160;
function hashId(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Spatial street blocks, independent of graph coordinates and visibility filters. */
export function planTownLayout(tasks: Task[]): TownLayout {
  const root = tasks.find(task => !task.parentId);
  const groups: { id: string; members: Task[] }[] = [];
  const children = new Map<string, Task[]>();
  const byId = new Map(tasks.map(task => [task.id, task]));
  for (const task of tasks) if (task.parentId) {
    const list = children.get(task.parentId) ?? [];
    list.push(task); children.set(task.parentId, list);
  }
  const visited = new Set(root ? [root.id] : []);
  const collect = (start: Task) => {
    const members: Task[] = [], stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id); members.push(current);
      stack.push(...[...(children.get(current.id) ?? [])].reverse());
    }
    if (members.length) groups.push({ id: start.id, members });
  };
  if (root) for (const task of children.get(root.id) ?? []) collect(task);
  // Invalid/orphaned imported tasks still get a visible, reachable plot.
  for (const task of tasks) if (!visited.has(task.id)) collect(task);
  // Keep first-level districts on one horizontal civic axis. The canvas can
  // pan and fit this growing width, while each district retains its own
  // compact vertical streets.
  const columns = Math.max(1, groups.length);
  const width = Math.max(1152, 544 + columns * 416 + 64);
  const districts: TownDistrict[] = [], plots: TownPlot[] = [], streets: TownStreet[] = [];
  let rowY = 128;
  const stats = (id: string) => {
    let total = 0, completed = 0;
    const seen = new Set<string>(), stack = [id];
    while (stack.length) {
      const next = stack.pop()!;
      if (seen.has(next)) continue;
      seen.add(next); total++; if (byId.get(next)?.status === "done") completed++;
      stack.push(...(children.get(next) ?? []).map(task => task.id));
    }
    return { total, completed };
  };
  const depthFrom = (start: string, id: string) => {
    let depth = 0, current = byId.get(id);
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      if (current.parentId === start) return depth + 1;
      seen.add(current.id); depth++; current = byId.get(current.parentId);
    }
    return 0;
  };
  const addPlot = (task: Task, districtId: string, centerX: number, footY: number, civic = false, hierarchyDepth = 0) => {
    const { total, completed } = stats(task.id), level = buildingLevel(total);
    const sizes = { 1: [104, 112], 2: [112, 128], 3: [120, 140], 4: [124, 144] };
    const [w, h] = civic ? [192, 192] : sizes[level];
    plots.push({ taskId: task.id, districtId, x: centerX - w / 2, y: footY - h,
      width: w, height: h, level, total, completed, status: task.status, civic,
      hierarchyDepth,
      door: { x: centerX, y: footY }, route: [], ...selectTownBuilding(task, byId.get(districtId)?.title) });
  };
  for (let row = 0; row < Math.ceil(groups.length / columns); row++) {
    const rowGroups = groups.slice(row * columns, (row + 1) * columns);
    const height = Math.max(...rowGroups.map(group => Math.max(2, Math.ceil(group.members.length / 3) + 1))) * TOWN_ROW + 96;
    rowGroups.forEach((group, column) => {
      const x = 544 + column * 416;
      const layoutStyle = (["ring", "terrace", "courtyard", "radial"] as const)[(hashId(group.id) % 4)];
      const center = group.members.find(member => member.id === group.id) ?? group.members[0];
      const ordered = [center, ...group.members.filter(member => member.id !== center.id)];
      districts.push({
        id: group.id,
        title: byId.get(group.id)?.title ?? "筹备街区",
        x, y: rowY - 40, width: 384, height: height - 48,
        parentId: byId.get(group.id)?.parentId ?? null,
        depth: 1,
        centerTaskId: center.id,
        layoutStyle,
        memberIds: group.members.map(member => member.id),
        accent: (districts.length % 6) as 0 | 1 | 2 | 3 | 4 | 5,
      });
      streets.push({ from: { x: x - 32, y: rowY + 160 }, to: { x: x - 32, y: rowY + height - 128 } });
      ordered.forEach((task, index) => {
        const hierarchyDepth = task.id === center.id ? 0 : depthFrom(group.id, task.id);
        const slot = index === 0 ? { col: 1, row: 0 } : { col: (index - 1) % 3, row: Math.floor((index - 1) / 3) + 1 };
        // Keep every entrance on the 32px road grid while still giving each
        // district a stable, visibly different stagger.
        const templateOffset = layoutStyle === "terrace" ? (slot.row % 2 ? 32 : -32) : layoutStyle === "courtyard" ? 0 : layoutStyle === "radial" ? (slot.row % 2 ? -32 : 32) : 0;
        const centerX = x + 64 + slot.col * 128 + templateOffset;
        const footY = rowY + slot.row * TOWN_ROW + TOWN_ROW;
        addPlot(task, group.id, centerX, footY, false, hierarchyDepth);
        // The entrance itself is on the lane tile; keeping the connector to
        // one cell prevents a compact row from being crossed by its neighbour.
        streets.push({ from: { x: centerX, y: footY }, to: { x: centerX, y: footY } });
      });
      for (let lane = 0; lane < Math.max(2, Math.ceil(group.members.length / 3) + 1); lane++) {
        const y = rowY + lane * TOWN_ROW + TOWN_ROW;
        streets.push({ from: { x: 512, y }, to: { x: x + 352, y } });
      }
    });
    rowY += height;
  }
  // A horizontal town still needs enough vertical breathing room for its
  // river, civic plaza and woodland edge when it is fit to the viewport.
  const height = Math.max(1280, rowY + 96);
  const plaza = { x: 384, y: snap(height / 2) };
  if (root) addPlot(root, root.id, plaza.x, plaza.y, true, 0);
  streets.push({ from: { x: 64, y: plaza.y + 32 }, to: { x: 512, y: plaza.y + 32 } });
  streets.push({ from: { x: 512, y: 112 }, to: { x: 512, y: height - 112 } });
  streets.push({ from: { x: plaza.x, y: plaza.y }, to: { x: plaza.x, y: plaza.y + 32 } });
  const roadTiles = new Set<string>();
  for (const street of streets) {
    const x1 = Math.floor(street.from.x / 32), y1 = Math.floor(street.from.y / 32);
    const x2 = Math.floor(street.to.x / 32), y2 = Math.floor(street.to.y / 32);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) roadTiles.add(tileKey(x, y));
  }
  const gatherings: TownGathering[] = [];
  for (const district of districts) {
    const roll = hashId(district.id) % 5;
    if (roll === 0) continue;
    const count = roll >= 3 ? 2 : 1;
    const candidates = [
      { x: district.x + 64, y: district.y + 92 },
      { x: district.x + district.width - 72, y: district.y + district.height - 86 },
      { x: district.x + district.width / 2, y: district.y + district.height / 2 + 18 },
    ];
    for (let index = 0; index < count; index++) {
      const candidate = candidates[(hashId(`${district.id}:${index}`) >>> 4) % candidates.length];
      const radius = 30;
      const area = { x: candidate.x - radius, y: candidate.y - radius, width: radius * 2, height: radius * 2 };
      if (candidate.x < district.x + radius || candidate.x > district.x + district.width - radius || candidate.y < district.y + radius || candidate.y > district.y + district.height - radius) continue;
      if (layoutPlotIntersects(area, plots) || roadTiles.has(tileKey(Math.floor(candidate.x / TOWN_TILE), Math.floor(candidate.y / TOWN_TILE)))) continue;
      if (gatherings.some(other => other.districtId === district.id && Math.hypot(other.x - candidate.x, other.y - candidate.y) < radius * 2)) continue;
      gatherings.push({
        id: `${district.id}-gathering-${index}`,
        districtId: district.id,
        x: candidate.x,
        y: candidate.y,
        radius,
        kind: (["plaza", "market", "campfire"] as const)[hashId(`${district.id}:kind:${index}`) % 3],
      });
    }
  }
  // Roads are cell-aligned; use their centers for residents and camera targets.
  for (const plot of plots) {
    plot.route = [
      { x: plaza.x + 16, y: plaza.y + 48 },
      { x: 528, y: plaza.y + 48 },
      { x: 528, y: plot.door.y + 16 },
      { x: plot.door.x + 16, y: plot.door.y + 16 },
      { x: plot.door.x + 16, y: plot.door.y + 16 },
    ];
    if (plot.civic) plot.route = [plot.route[0], { x: 80, y: plaza.y + 48 }];
  }
  return { width, height, plots, districts, streets, roadTiles, plaza, gatherings };
}

function layoutPlotIntersects(area: { x: number; y: number; width: number; height: number }, plots: TownPlot[]) {
  return plots.some(plot => area.x < plot.x + plot.width && area.x + area.width > plot.x && area.y < plot.y + plot.height && area.y + area.height > plot.y);
}

/** Constant-speed motion with a pause at both ends, using street waypoints. */
export function townTraveler(route: TownPoint[], seconds: number, speed = 36) {
  const segments = route.slice(1).map((point, i) => Math.hypot(point.x - route[i].x, point.y - route[i].y));
  const length = segments.reduce((sum, n) => sum + n, 0);
  if (!length) return { ...(route[0] ?? { x: 0, y: 0 }), direction: "down" as const, walking: false };
  const journey = length / speed, cycle = journey * 2 + 6;
  const time = ((seconds % cycle) + cycle) % cycle;
  const back = time >= journey + 3;
  let distance = back ? Math.max(0, length - (time - journey - 3) * speed) : Math.min(length, time * speed);
  const walking = time < journey || (time >= journey + 3 && time < cycle - 3);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === 0) continue;
    if (distance <= segments[i] || i === segments.length - 1) {
      const a = route[i], b = route[i + 1], ratio = Math.min(1, distance / segments[i]);
      const dx = (b.x - a.x) * (back ? -1 : 1), dy = (b.y - a.y) * (back ? -1 : 1);
      const direction = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, direction, walking };
    }
    distance -= segments[i];
  }
  return { ...route[route.length - 1], direction: "down", walking: false };
}
