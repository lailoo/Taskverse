import type { TownImages } from "./ai-town-assets";
import type { TownPlot } from "./town-layout";
import type { Status } from "./types";

/** A task's own status is authoritative; animation never advances construction. */
export const TOWN_CONSTRUCTION: Record<Status, { stage: string; label: string; description: string }> = {
  todo: { stage: "foundation", label: "地基 · 待开工", description: "地基已预留，开始任务后进场施工。" },
  doing: { stage: "construction", label: "施工中", description: "工人正在搬料、砌墙和吊运；完成任务后建筑竣工。" },
  waiting: { stage: "suspended", label: "暂停施工", description: "工地暂时停工，恢复进行中后继续建设。" },
  done: { stage: "complete", label: "已竣工", description: "任务已完成，建筑正式落成。" },
};

export const isTownLandmark = (plot: Pick<TownPlot, "kind" | "civic">) => plot.civic && plot.kind === "windmill";
export function townConstruction(plot: Pick<TownPlot, "kind" | "civic" | "status">) {
  return isTownLandmark(plot)
    ? { stage: "landmark", label: "市政地标", description: "市政风车常驻小镇，始终保持完整外观。" }
    : TOWN_CONSTRUCTION[plot.status];
}

type Context = CanvasRenderingContext2D;
const timber = "#806347", lightWood = "#c5a875", ink = "#4b4436";
function rect(ctx: Context, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
}
function polygon(ctx: Context, points: number[][], color: string) {
  ctx.fillStyle = color; ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill();
}
function beam(ctx: Context, x1: number, y1: number, x2: number, y2: number, color = timber, width = 2) {
  // Stepped diagonals retain the atlas's pixel grid when zooming in.
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let n = 0; n <= steps; n++) rect(ctx, Math.round(x1 + (x2 - x1) * n / (steps || 1)), Math.round(y1 + (y2 - y1) * n / (steps || 1)), width, width, color);
}
function local(ctx: Context, plot: TownPlot) {
  ctx.save(); ctx.translate(plot.x, plot.y);
  const scale = Math.min(plot.width / 80, plot.height / 88);
  ctx.translate((plot.width - 80 * scale) / 2, plot.height - 88 * scale);
  ctx.scale(scale, scale);
}
function footprint(plot: TownPlot) {
  const narrow = ["chapel", "windmill", "pavilion"].includes(plot.kind);
  return { left: narrow ? 22 : 13, right: narrow ? 58 : 64, back: 55, front: 73 };
}
function foundation(ctx: Context, plot: TownPlot) {
  const { left: l, right: r, back: b, front: f } = footprint(plot);
  // Excavated soil and low stone courses, with an open floor plan and entry gap.
  polygon(ctx, [[7, 55], [63, 52], [75, 64], [73, 81], [12, 84], [5, 76]], "#253c2760");
  polygon(ctx, [[9, 55], [65, 54], [72, 62], [70, 79], [11, 80], [7, 74]], "#786b4d");
  for (let i = 0; i < 45; i++) {
    const x = 12 + (i * 17 + plot.variant * 7) % 55, y = 57 + (i * 11) % 22;
    rect(ctx, x, y, i % 3 + 1, 1, i % 2 ? "#aa9470" : "#5f5b43");
  }
  rect(ctx, l, b + 3, r - l, f - b, "#626451");
  rect(ctx, l + 3, b + 3, r - l - 6, f - b - 3, "#b1ad90");
  rect(ctx, l, b, r - l, 4, "#d2c8a6");
  rect(ctx, l, b + 4, 3, f - b - 1, "#c1bda0");
  rect(ctx, r - 3, b + 4, 3, f - b, "#92957e");
  rect(ctx, l, f, 21 - (l - 13), 4, "#aaa78d");
  rect(ctx, 45, f, r - 45, 4, "#aaa78d");
  rect(ctx, 33, f + 1, 12, 3, "#c8bc96");
  for (let x = l + 5; x < r; x += 7) rect(ctx, x, b, 1, 4, "#8c917b");
  for (let y = b + 6; y < f; y += 6) rect(ctx, l, y, 3, 1, "#92957e");
  // Interior footing (not walls), survey pegs and stretched guide strings.
  rect(ctx, l + 17, b + 4, 2, 9, "#8f947e"); rect(ctx, l + 4, b + 12, 15, 2, "#c6bda0");
  for (const x of [9, 69]) for (const y of [53, 78]) {
    rect(ctx, x, y - 5, 2, 7, timber); rect(ctx, x, y - 5, 2, 2, lightWood);
  }
  rect(ctx, 10, 50, 59, 1, "#d3c99c");
}
function brickPile(ctx: Context, x: number, y: number) {
  rect(ctx, x, y, 13, 7, "#614c3c");
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    rect(ctx, x + col * 4 + row, y + row * 3, 3, 2, row ? "#ac7f58" : "#c79a6e");
  }
}
function barrier(ctx: Context, x: number, y: number, paused: boolean) {
  rect(ctx, x + 1, y + 4, 2, 6, ink); rect(ctx, x + 16, y + 4, 2, 6, ink);
  rect(ctx, x, y, 20, 6, paused ? "#c79450" : "#d1bc79");
  for (let i = 1; i < 17; i += 6) beam(ctx, x + i, y, x + i + 3, y + 4, "#69523b");
}

/** Draws only unfinished sites. Finished architecture belongs to the existing atlas. */
export function drawConstructionSite(ctx: Context, plot: TownPlot) {
  if (plot.status === "done" || isTownLandmark(plot)) return;
  local(ctx, plot);
  foundation(ctx, plot);
  if (plot.status === "todo") {
    // A survey plan on a short peg. No roof, full walls or running machinery.
    rect(ctx, 59, 68, 2, 9, timber); rect(ctx, 54, 62, 12, 8, ink);
    rect(ctx, 55, 63, 10, 6, "#aec6bd"); rect(ctx, 57, 65, 6, 1, "#526e66"); rect(ctx, 57, 65, 1, 3, "#526e66");
    ctx.restore(); return;
  }
  const { left: l, right: r } = footprint(plot);
  // A partially laid back wall and open door jambs. No finished facade is hidden below.
  rect(ctx, l, 46, r - l - 8, 14, "#968c70");
  rect(ctx, l, 46, r - l - 8, 2, "#d1c19b");
  for (let row = 0; row < 3; row++) {
    const length = r - l - 6 - row * 5;
    for (let x = l + 1; x < l + length - 5; x += 7) rect(ctx, x + row % 2 * 2, 48 + row * 4, 6, 3, "#bbad87");
  }
  for (const x of [l + 1, r - 3, 32, 45]) {
    rect(ctx, x, 41, 3, 30, timber); rect(ctx, x, 41, 1, 29, lightWood);
  }
  beam(ctx, l, 41, r, 41, lightWood, 3);
  if (plot.kind === "windmill") {
    // Tapered tower framing; sails appear only when this task is complete.
    beam(ctx, 24, 41, 30, 15); beam(ctx, 54, 41, 48, 15);
    beam(ctx, 30, 15, 48, 15, lightWood); beam(ctx, 29, 29, 51, 29, lightWood);
    beam(ctx, 30, 16, 51, 39, "#9b805a");
  } else if (plot.kind === "camp") {
    beam(ctx, l, 41, 39, 21); beam(ctx, 39, 21, r, 41); beam(ctx, 39, 21, 39, 54, lightWood);
  } else {
    // Exposed rafters instead of a completed roof; long and narrow task types retain their scale.
    beam(ctx, l, 40, 39, 21, lightWood); beam(ctx, 39, 21, r, 40);
    beam(ctx, l + 6, 40, 39, 27, "#a58a5e"); beam(ctx, 39, 27, r - 6, 40);
    beam(ctx, 39, 21, 39, 40, timber);
  }
  // Timber scaffolding, cross braces, planks and an access ladder.
  for (const x of [8, 54]) { rect(ctx, x, 32, 2, 44, timber); rect(ctx, x, 32, 1, 44, lightWood); }
  beam(ctx, 9, 52, 28, 71, "#9e845b"); beam(ctx, 9, 71, 28, 52, "#9e845b");
  rect(ctx, 7, 49, 52, 4, timber); rect(ctx, 7, 48, 52, 2, "#d3b97f");
  rect(ctx, 7, 36, 50, 1, "#ab9364");
  for (const x of [49, 57]) beam(ctx, x, 55, x - 6, 77, "#c5ad79");
  for (let y = 57; y <= 74; y += 4) rect(ctx, 49 - Math.round((y - 55) / 4), y, 8, 1, "#cfb882");
  brickPile(ctx, 12, 72);
  rect(ctx, 58, 76, 15, 3, "#776045");
  for (let i = 0; i < 3; i++) rect(ctx, 58 + i, 70 + i * 2, 13, 1, "#c3a170");
  // A small timber gantry crane, consistent with the village's materials.
  rect(ctx, 67, 15, 3, 50, timber); rect(ctx, 67, 15, 1, 50, lightWood);
  beam(ctx, 58, 65, 69, 47); beam(ctx, 73, 65, 69, 47);
  rect(ctx, 48, 14, 25, 3, lightWood); beam(ctx, 57, 16, 67, 27);
  rect(ctx, 66, 12, 5, 4, ink); rect(ctx, 68, 13, 2, 2, "#b7ab80");
  barrier(ctx, 6, 77, plot.status === "waiting");
  if (plot.status === "waiting") {
    // Covered materials and a physical pause placard; no workers or dust on a suspended site.
    polygon(ctx, [[10, 69], [22, 68], [27, 74], [12, 76]], "#6e8b84");
    beam(ctx, 12, 70, 24, 74, "#a2b8a0", 1);
    rect(ctx, 33, 68, 14, 11, ink); rect(ctx, 34, 69, 12, 9, "#d0ab66");
    rect(ctx, 37, 71, 2, 5, "#63513c"); rect(ctx, 41, 71, 2, 5, "#63513c");
    rect(ctx, 39, 79, 2, 4, timber);
  }
  ctx.restore();
}

function worker(ctx: Context, images: TownImages, x: number, y: number, character: number, frame: number, direction: number) {
  ctx.drawImage(images.residents, character % 4 * 96 + frame * 32, Math.floor(character / 4) * 128 + direction * 32, 32, 32, x - 8, y - 20, 16, 20);
  // Tiny ochre hard hats make builders distinct from townspeople.
  rect(ctx, x - 4, y - 19, 8, 4, "#bf913e"); rect(ctx, x - 3, y - 20, 6, 2, "#edd18a"); rect(ctx, x - 5, y - 16, 10, 2, "#d6ac54");
}

/** All moving parts use the canvas clock, so pause/reduced motion freeze the entire site. */
export function drawConstructionActivity(ctx: Context, images: TownImages, plot: TownPlot, seconds: number) {
  if (isTownLandmark(plot) || (plot.status !== "doing" && plot.status !== "waiting")) return;
  local(ctx, plot);
  const working = plot.status === "doing", t = working ? seconds + plot.variant * 1.3 : 0;
  const lift = working ? Math.round((1 - Math.cos(t * 1.6)) * 12) : 22;
  rect(ctx, 51, 17, 1, 10 + lift, "#594d3b");
  rect(ctx, 48, 27 + lift, 7, 6, "#886749"); rect(ctx, 49, 27 + lift, 5, 2, "#d0a570");
  if (working) {
    const swing = Math.sin(t * 7) > 0;
    worker(ctx, images, 23, 49, 2, swing ? 1 : 0, 2);
    // A raised hammer alternates with a strike at the open wall.
    beam(ctx, 27, 40, swing ? 31 : 33, swing ? 31 : 43, "#ac9369", 1);
    rect(ctx, swing ? 29 : 31, swing ? 30 : 43, 6, 3, "#aeb8ab");
    const phase = (t % 5) / 5, x = Math.round(30 + (phase < .5 ? phase * 2 : 2 - phase * 2) * 20);
    worker(ctx, images, x, 80, 5, Math.floor(t * 7) % 3, phase < .5 ? 2 : 1);
    rect(ctx, x + (phase < .5 ? 5 : -9), 67, 6, 4, "#c39a70");
    // Short, staggered pixel dust puffs where the hammer lands. No flashing overlays.
    for (let i = 0; i < 3; i++) {
      const age = (t * 1.4 + i / 3) % 1;
      ctx.globalAlpha = (1 - age) * .65;
      rect(ctx, 32 + Math.round(age * 7) + i * 2, 44 - Math.round(age * 9), 2 + i % 2, 2, "#ded1a8");
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
