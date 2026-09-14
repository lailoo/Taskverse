"use client";

import { useEffect, useRef, useState } from "react";
import { loadTownImages, type TownImages } from "@/lib/ai-town-assets";
import { tileKey, townResidentCount, townTraveler, type TownLayout, type TownPlot } from "@/lib/town-layout";
import { townBuildingFrame } from "@/lib/town-buildings";
import { drawConstructionSite, drawConstructionActivity, isTownLandmark } from "@/lib/town-construction";
import waterfallSheet from "../../../public/assets/ai-town/gentlewaterfall.json";
import splashSheet from "../../../public/assets/ai-town/gentlesplash.json";

export type TownCamera = { x: number; y: number; zoom: number };
type Props = { layout: TownLayout; visible: Set<string>; camera: TownCamera; width: number; height: number; paused: boolean };
const waterfallFrames = Object.values(waterfallSheet.frames).map(frame => frame.frame);
const splashFrames = Object.values(splashSheet.frames).map(frame => frame.frame);

function drawTile(ctx: CanvasRenderingContext2D, image: HTMLImageElement, tile: number, x: number, y: number) {
  ctx.drawImage(image, tile % 45 * 32, Math.floor(tile / 45) * 32, 32, 32, x, y, 32, 32);
}
const isWater = (x: number, y: number, rows: number) => {
  // A narrow river opens into two rocky pools, with a waterfall in the upper pool.
  const wide = (y >= 2 && y <= 7) || (y >= rows - 8 && y <= rows - 3);
  return x >= (wide ? 3 : 4) && x <= (wide ? 8 : 7);
};
const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function setup(canvas: HTMLCanvasElement, props: Props) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(props.width * ratio), h = Math.round(props.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.setTransform(ratio * props.camera.zoom, 0, 0, ratio * props.camera.zoom, ratio * props.camera.x, ratio * props.camera.y);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
function bounds(props: Props) {
  return { x: -props.camera.x / props.camera.zoom, y: -props.camera.y / props.camera.zoom,
    width: props.width / props.camera.zoom, height: props.height / props.camera.zoom };
}

function drawBuilding(ctx: CanvasRenderingContext2D, images: TownImages, plot: TownPlot) {
  const frame = townBuildingFrame(plot.kind, plot.variant);
  if (!frame) return;
  const scale = Math.min(plot.width / frame.w, plot.height / frame.h);
  const width = frame.w * scale, height = frame.h * scale;
  ctx.drawImage(images.buildings, frame.x, frame.y, frame.w, frame.h,
    plot.x + (plot.width - width) / 2, plot.y + plot.height - height, width, height);
}

type TownDecorKind = "flowers" | "supplies" | "crates" | "fence" | "rocks" | "tent";
const DECOR_SPRITES: Record<TownDecorKind, { source: [number, number, number, number]; scale: number }> = {
  // These crops are from the original gentle-obj sheet: the same tent,
  // plants, crates, work stock and stone props used by AI Town.
  flowers: { source: [1072, 608, 112, 80], scale: .5 },
  supplies: { source: [1184, 512, 128, 96], scale: .5 },
  crates: { source: [1312, 512, 128, 112], scale: .5 },
  fence: { source: [800, 640, 176, 64], scale: .5 },
  rocks: { source: [1248, 608, 144, 96], scale: .5 },
  tent: { source: [992, 512, 160, 128], scale: .5 },
};

function drawTownDecor(ctx: CanvasRenderingContext2D, images: TownImages, layout: TownLayout, view: ReturnType<typeof bounds>) {
  const styles: Record<string, TownDecorKind[]> = {
    ring: ["fence", "flowers", "crates", "rocks", "supplies"],
    terrace: ["fence", "flowers", "supplies", "rocks"],
    courtyard: ["fence", "flowers", "crates", "flowers"],
    radial: ["fence", "rocks", "supplies", "flowers", "tent"],
  };
  const signatureKinds: TownDecorKind[] = ["tent", "crates", "supplies", "fence", "rocks", "flowers"];
  for (const [districtIndex, district] of layout.districts.entries()) {
    // A larger branch receives a larger public realm, rather than just a
    // larger building. Keep the cap so a very large imported project remains
    // readable and performant.
    const count = Math.min(16, Math.max(4, Math.ceil(district.memberIds.length * 1.1)));
    const kinds = styles[district.layoutStyle] ?? styles.ring;
    const spots = [
      { x: district.x + 14, y: district.y + 4 },
      { x: district.x + district.width - 86, y: district.y + 40 },
      { x: district.x + 18, y: district.y + district.height - 78 },
      { x: district.x + district.width - 100, y: district.y + district.height - 82 },
      { x: district.x + district.width / 2 - 32, y: district.y + district.height - 70 },
      { x: district.x + 12, y: district.y + district.height / 2 - 28 },
      { x: district.x + district.width - 76, y: district.y + district.height / 2 - 22 },
      { x: district.x + district.width / 2 - 72, y: district.y + 18 },
      { x: district.x + district.width / 2 + 38, y: district.y + 18 },
      { x: district.x + district.width / 2 - 72, y: district.y + district.height - 124 },
      { x: district.x + district.width / 2 + 38, y: district.y + district.height - 124 },
      { x: district.x + district.width / 2 - 32, y: district.y + district.height / 2 - 28 },
      { x: district.x + 64, y: district.y + district.height / 2 - 16 },
      { x: district.x + district.width - 72, y: district.y + district.height / 2 + 16 },
      { x: district.x + district.width / 2 - 112, y: district.y + district.height / 2 + 26 },
      { x: district.x + district.width / 2 + 80, y: district.y + district.height / 2 + 26 },
    ];
    for (let i = 0; i < count; i++) {
      const kind = i === 0 ? signatureKinds[districtIndex % signatureKinds.length] : kinds[i % kinds.length], sprite = DECOR_SPRITES[kind];
      const [sx, sy, sw, sh] = sprite.source, width = sw * sprite.scale, height = sh * sprite.scale;
      const spot = spots[i];
      if (!spot) continue;
      const target = { x: spot.x, y: spot.y, width, height };
      if (!intersects(target, view)) continue;
      if (layout.plots.some(plot => intersects(target, { x: plot.x - 10, y: plot.y - 12, width: plot.width + 20, height: plot.height + 24 }))) continue;
      let blocked = false;
      for (let ty = Math.floor(target.y / 32); ty <= Math.floor((target.y + height) / 32) && !blocked; ty++)
        for (let tx = Math.floor(target.x / 32); tx <= Math.floor((target.x + width) / 32); tx++)
          if (layout.roadTiles.has(tileKey(tx, ty))) { blocked = true; break; }
      if (!blocked) ctx.drawImage(images.terrain, sx, sy, sw, sh, target.x, target.y, width, height);
    }
  }
}

function drawGatheringPoints(ctx: CanvasRenderingContext2D, layout: TownLayout, view: ReturnType<typeof bounds>) {
  for (const gathering of layout.gatherings) {
    const area = { x: gathering.x - gathering.radius, y: gathering.y - gathering.radius, width: gathering.radius * 2, height: gathering.radius * 2 };
    if (!intersects(area, view)) continue;
    const palette = gathering.kind === "market" ? ["#b79763", "#e0c27d"] : gathering.kind === "campfire" ? ["#725b47", "#d48c4a"] : ["#71846b", "#c2b580"];
    ctx.fillStyle = `${palette[0]}66`;
    ctx.beginPath(); ctx.arc(gathering.x, gathering.y, gathering.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `${palette[1]}aa`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(gathering.x, gathering.y, gathering.radius - 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = palette[1];
    if (gathering.kind === "market") {
      ctx.fillRect(gathering.x - 12, gathering.y - 8, 24, 3); ctx.fillRect(gathering.x - 9, gathering.y - 5, 3, 12); ctx.fillRect(gathering.x + 6, gathering.y - 5, 3, 12);
      ctx.fillStyle = palette[0]; ctx.fillRect(gathering.x - 9, gathering.y - 4, 18, 5);
    } else if (gathering.kind === "campfire") {
      ctx.fillRect(gathering.x - 8, gathering.y + 5, 16, 3); ctx.fillRect(gathering.x - 2, gathering.y - 5, 4, 12);
    } else {
      ctx.fillRect(gathering.x - 14, gathering.y - 2, 28, 3); ctx.fillRect(gathering.x - 13, gathering.y + 6, 26, 2);
    }
  }
}

function drawGatheringActivity(ctx: CanvasRenderingContext2D, layout: TownLayout, view: ReturnType<typeof bounds>, seconds: number, motion: boolean) {
  for (const [index, gathering] of layout.gatherings.entries()) {
    const area = { x: gathering.x - 42, y: gathering.y - 42, width: 84, height: 84 };
    if (!intersects(area, view)) continue;
    const phase = motion ? (seconds * 1.5 + index * .7) % 1 : .35;
    ctx.save(); ctx.globalAlpha = .22 * (1 - phase); ctx.strokeStyle = gathering.kind === "campfire" ? "#f0c277" : "#d8e5ae"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gathering.x, gathering.y, gathering.radius + phase * 10, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = .78; ctx.fillStyle = gathering.kind === "campfire" ? "#e59b50" : "#e6d58b";
    for (let person = 0; person < 3; person++) {
      const angle = person * Math.PI * 2 / 3 + index * .8;
      const distance = gathering.radius - 9;
      ctx.fillRect(Math.round(gathering.x + Math.cos(angle) * distance) - 2, Math.round(gathering.y + Math.sin(angle) * distance) - 3, 4, 6);
    }
    ctx.restore();
  }
}

function drawRiverFlow(ctx: CanvasRenderingContext2D, layout: TownLayout, view: ReturnType<typeof bounds>, seconds: number, motion: boolean) {
  const rows = layout.height / 32;
  const x0 = Math.max(0, Math.floor(view.x / 32) - 1), y0 = Math.max(0, Math.floor(view.y / 32) - 1);
  const x1 = Math.min(layout.width / 32, Math.ceil((view.x + view.width) / 32) + 1);
  const y1 = Math.min(rows, Math.ceil((view.y + view.height) / 32) + 1);
  // The imported tiles provide the river bed; these small translucent bands
  // provide the missing surface motion and flow from the upper pool downward.
  const phase = motion ? Math.floor(seconds * 22) : 0;
  ctx.save();
  ctx.lineCap = "round";
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!isWater(x, y, rows) || layout.roadTiles.has(tileKey(x, y))) continue;
    const px = x * 32, py = y * 32;
    const stream = (phase + y * 13 + x * 7) % 32;
    ctx.globalAlpha = .34;
    ctx.strokeStyle = (x + y) % 2 ? "#c6eef0" : "#8ed7df";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 4, py + stream); ctx.lineTo(px + 13, py + stream); ctx.stroke();
    if ((x + y) % 3 !== 0) {
      const second = (stream + 15) % 32;
      ctx.globalAlpha = .2;
      ctx.beginPath(); ctx.moveTo(px + 19, py + second); ctx.lineTo(px + 28, py + second); ctx.stroke();
    }
    const glint = (phase * 2 + x * 11 + y * 5) % 32;
    ctx.globalAlpha = .18;
    ctx.fillStyle = "#e4ffff";
    ctx.fillRect(px + 15, py + glint, 3, 2);
  }
  ctx.restore();
}

function paintMap(canvas: HTMLCanvasElement, images: TownImages, props: Props) {
  const ctx = setup(canvas, props), { layout, visible } = props, view = bounds(props);
  const rows = layout.height / 32, columns = layout.width / 32;
  const x0 = Math.max(0, Math.floor(view.x / 32)), y0 = Math.max(0, Math.floor(view.y / 32));
  const x1 = Math.min(columns, Math.ceil((view.x + view.width) / 32)), y1 = Math.min(rows, Math.ceil((view.y + view.height) / 32));
  ctx.fillStyle = "#2c452a"; ctx.fillRect(view.x, view.y, view.width, view.height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const px = x * 32, py = y * 32;
    drawTile(ctx, images.terrain, (x * 7 + y * 13) % 3 ? 271 : 272, px, py);
    if (isWater(x, y, rows)) {
      const left = isWater(x - 1, y, rows), right = isWater(x + 1, y, rows);
      const up = isWater(x, y - 1, rows), down = isWater(x, y + 1, rows);
      const tile = !up ? (!left ? 360 : !right ? 363 : 361) : !down ? (!left ? 495 : !right ? 498 : 496) : !left ? 405 : !right ? 408 : (x + y) % 2 ? 406 : 407;
      drawTile(ctx, images.terrain, tile, px, py);
    }
    const plaza = x >= 10 && x <= 14 && y >= layout.plaza.y / 32 && y <= layout.plaza.y / 32 + 2;
    if (layout.roadTiles.has(tileKey(x, y)) || plaza) {
      if (isWater(x, y, rows)) {
        // Original wood texture plus rails makes the river crossing readable.
        ctx.drawImage(images.terrain, 1056, 736, 32, 32, px, py, 32, 32);
        ctx.fillStyle = "#473f28"; ctx.fillRect(px, py, 32, 3); ctx.fillRect(px, py + 29, 32, 3);
        ctx.fillStyle = "#c0a46f"; ctx.fillRect(px, py + 4, 32, 2);
      } else {
        const left = layout.roadTiles.has(tileKey(x - 1, y)), right = layout.roadTiles.has(tileKey(x + 1, y));
        const up = layout.roadTiles.has(tileKey(x, y - 1)), down = layout.roadTiles.has(tileKey(x, y + 1));
        const tile = plaza ? 46 : !up && !down ? 46 : !left && !right ? 91 : 46;
        drawTile(ctx, images.terrain, tile, px, py);
        // Feather the road edge with the original grass/dirt transition tiles.
        if (!up && (left || right) && !plaza) drawTile(ctx, images.terrain, 1, px, py - 16);
        if (!down && (left || right) && !plaza) drawTile(ctx, images.terrain, 136, px, py + 16);
      }
    }
  }
  // Continuous woodland around the map and small groves between street blocks.
  for (let y = 0; y < layout.height; y += 64) for (let x = 0; x < layout.width; x += 64) {
    const hash = ((x * 17 + y * 31) >>> 0) % 19;
    const edge = x < 64 || x > layout.width - 112 || y < 48 || y > layout.height - 96;
    const garden = !edge && hash < 2 && x > 288;
    if (!edge && !garden) continue;
    const tree = { x: x - 16, y: y - 40, width: 96, height: 128 };
    if (!intersects(tree, view)) continue;
    const obstacle = { x: tree.x - 10, y: tree.y, width: tree.width + 20, height: tree.height + 24 };
    if (layout.plots.some(plot => intersects(obstacle, { x: plot.x - 16, y: plot.y - 28, width: plot.width + 32, height: plot.height + 80 }))) continue;
    let blocked = false;
    for (let ty = Math.floor(obstacle.y / 32); ty <= Math.floor((obstacle.y + obstacle.height) / 32); ty++)
      for (let tx = Math.floor(obstacle.x / 32); tx <= Math.floor((obstacle.x + obstacle.width) / 32); tx++)
        if (layout.roadTiles.has(tileKey(tx, ty)) || isWater(tx, ty, rows)) blocked = true;
    if (!blocked) ctx.drawImage(images.terrain, 352, 0, 160, 224, tree.x, tree.y, tree.width, tree.height);
  }
  // Ground clutter uses the same atlas. It stays away from roads and buildings.
  for (let y = 96; y < layout.height - 64; y += 96) for (let x = 288; x < layout.width - 64; x += 96) {
    const spot = { x, y, width: 32, height: 32 };
    if (!intersects(spot, view) || layout.roadTiles.has(tileKey(x / 32, y / 32)) || layout.plots.some(p => intersects({ x: p.x - 20, y: p.y - 32, width: p.width + 40, height: p.height + 88 }, spot))) continue;
    const variant = (x / 96 + y / 96) % 4;
    ctx.drawImage(images.terrain, [1120, 1152, 1216, 1248][variant], 576, 32, 32, x, y, 24, 24);
  }
  drawGatheringPoints(ctx, layout, view);
  drawTownDecor(ctx, images, layout, view);
  for (const plot of layout.plots) {
    if (!visible.has(plot.taskId) || !intersects(plot, view)) continue;
    if (plot.status !== "done" && !isTownLandmark(plot)) { drawConstructionSite(ctx, plot); continue; }
    if (plot.kind === "windmill") continue; // Animated windmills are drawn in the moving layer.
    if (plot.kind === "camp") ctx.drawImage(images.terrain, 992, 512, 96, 96, plot.x, plot.y, plot.width, plot.height);
    else drawBuilding(ctx, images, plot);
    ctx.drawImage(images.terrain, 1152, 576, 32, 32, plot.x - 12, plot.door.y - 16, 26, 26);
    ctx.drawImage(images.terrain, 1120, 576, 32, 32, plot.x + plot.width - 12, plot.door.y - 16, 26, 26);
  }
}

function paintMotion(canvas: HTMLCanvasElement, images: TownImages, props: Props, seconds: number, motion: boolean) {
  const ctx = setup(canvas, props), view = bounds(props);
  drawGatheringActivity(ctx, props.layout, view, seconds, motion);
  drawRiverFlow(ctx, props.layout, view, seconds, motion);
  for (const plot of props.layout.plots) {
    if (!props.visible.has(plot.taskId) || !intersects(plot, view)) continue;
    drawConstructionActivity(ctx, images, plot, seconds);
    if (plot.kind === "windmill" && (plot.status === "done" || isTownLandmark(plot))) {
      const frame = !motion ? 0 : Math.floor(seconds * 6) % 8;
      ctx.drawImage(images.windmill, frame % 3 * 208, Math.floor(frame / 3) * 208, 208, 208, plot.x, plot.y, plot.width, plot.height);
    }
  }
  const frameIndex = motion ? Math.floor(seconds * 7) : 0;
  for (let x = 128; x <= 192; x += 32) {
    const frame = waterfallFrames[frameIndex % waterfallFrames.length];
    ctx.drawImage(images.waterfall, frame.x, frame.y, frame.w, frame.h, x, 144, 32, 96);
    const splash = splashFrames[frameIndex % splashFrames.length];
    ctx.drawImage(images.waterfall, splash.x, splash.y, splash.w, splash.h, x, 208, 32, 64);
  }
  const fireFrame = frameIndex % 4;
  ctx.drawImage(images.fire, fireFrame * 32, 0, 32, 32, 336, props.layout.plaza.y + 66, 32, 32);
  const residentPlots = props.layout.plots.filter(plot => !plot.civic && props.visible.has(plot.taskId));
  const residentCount = townResidentCount(residentPlots.length);
  // Larger towns get additional walkers, while small towns keep a compact
  // population. Reusing stable routes gives the extra residents a natural
  // town rhythm without adding persistent data to tasks.
  Array.from({ length: residentPlots.length ? residentCount : 0 }, (_, index) => index).forEach(index => {
    const plot = residentPlots[index % residentPlots.length];
    const person = plot.status === "waiting"
      ? { x: plot.door.x + 16, y: plot.door.y + 20, walking: false, direction: "down" }
      : townTraveler(plot.route, seconds + index * 19, 30 + (index % 4) * 4);
    // People share roads, but their phase and lane offset differ so a large
    // task set reads as a living town instead of a single repeated sprite.
    const crowdOffset = plot.status === "waiting" ? ((index % 5) - 2) * 7 : ((index % 7) - 3) * 3;
    const position = { x: person.x + crowdOffset, y: person.y + (index % 3 === 0 ? 2 : index % 3 === 1 ? -1 : 0) };
    if (!intersects({ x: position.x - 20, y: position.y - 32, width: 40, height: 40 }, view)) return;
    const frame = motion && person.walking ? Math.floor(seconds * 7 + index) % 3 : 0;
    const row = ({ down: 0, left: 1, right: 2, up: 3 } as Record<string, number>)[person.direction];
    const character = index % 8;
    ctx.drawImage(images.residents, character % 4 * 96 + frame * 32, Math.floor(character / 4) * 128 + row * 32, 32, 32, Math.round(position.x) - 20, Math.round(position.y) - 34, 40, 40);
    if (!person.walking && motion && index % 3 === Math.floor(seconds / 5) % 3) {
      ctx.fillStyle = "#fff4d4"; ctx.fillRect(position.x - 17, position.y - 47, 28, 12);
      ctx.fillRect(position.x - 3, position.y - 35, 4, 4);
      ctx.fillStyle = "#5c6447"; for (let i = 0; i < 3; i++) ctx.fillRect(position.x - 11 + i * 7, position.y - 42, 3, 3);
    }
  });
}

export function TownMapCanvas(props: Props) {
  const terrain = useRef<HTMLCanvasElement>(null), animation = useRef<HTMLCanvasElement>(null);
  const current = useRef(props); current.current = props;
  const [images, setImages] = useState<TownImages | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadTownImages().then(result => { if (active) { setImages(result); setError(""); } }).catch(reason => { if (active) setError(String(reason.message)); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (images && terrain.current && props.width && props.height) paintMap(terrain.current, images, props);
  }, [images, props]);
  useEffect(() => {
    if (!images) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let id = 0, last = -Infinity, seconds = 0, previous: number | null = null;
    const draw = (now: number) => {
      const moving = !current.current.paused && !reduce.matches;
      if (previous !== null && moving) seconds += Math.min(now - previous, 80) / 1000;
      previous = now;
      if (now - last >= 33 && animation.current) { paintMotion(animation.current, images, current.current, seconds, moving); last = now; }
      id = requestAnimationFrame(draw);
    };
    const visibility = () => {
      cancelAnimationFrame(id); previous = null;
      if (!document.hidden) id = requestAnimationFrame(draw);
    };
    if (!document.hidden) id = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(id); document.removeEventListener("visibilitychange", visibility); };
  }, [images]);
  return <>
    <canvas ref={terrain} className="town-terrain" data-ready={!!images} aria-hidden="true" />
    <canvas ref={animation} className="town-motion" aria-hidden="true" />
    {!images && <div className="town-loading" role={error ? "alert" : "status"}>{error ? <><strong>地图素材未能加载</strong><span>{error}</span><button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>重新加载</button></> : "正在铺设小镇地图…"}</div>}
  </>;
}
