import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeInitialProject } from "../src/lib/tasks";
import { planTownLayout } from "../src/lib/town-layout";
import { selectTownBuilding, townBuildingFrame } from "../src/lib/town-buildings";
import atlas from "../public/assets/ai-town/buildings/town-buildings.json";

test("wedding activities map to visibly different building uses", () => {
  for (const [title, expected] of [
    ["预约试菜与确认菜单", "tavern"], ["整理宾客名单", "postoffice"], ["安排婚车接送", "station"],
    ["比较摄影方案", "studio"], ["准备婚礼仪式", "chapel"], ["购买应急物品", "warehouse"],
    ["鲜花与会场布置", "florist"], ["挑选婚纱", "boutique"], ["讨论预算分配", "bank"],
    ["预订宾客住宿", "inn"], ["准备誓词和音乐", "pavilion"], ["户外休息区", "cottage"],
    ["鸿福大酒店", "grandhotel"], ["龙门客栈", "dragoninn"], ["小旅馆", "lodge"],
    ["修建箭塔", "watchtower"], ["园区围墙", "wall"], ["原版木屋", "cottage"],
  ]) assert.equal(selectTownBuilding({ id: "test", parentId: "root", title }).kind, expected);
  assert.ok(new Set(planTownLayout(makeInitialProject().tasks).plots.map(plot => plot.kind)).size >= 10);
});

test("original building parts refer to the unchanged upstream asset", () => {
  const source = readFileSync("public/assets/ai-town/rpg-tileset.png");
  assert.equal(atlas.sourceSha256, createHash("sha256").update(source).digest("hex"));
  const width = source.readUInt32BE(16), height = source.readUInt32BE(20);
  for (const part of Object.values(atlas.sourceParts)) {
    assert.ok(part.x >= 0 && part.y >= 0 && part.w > 0 && part.h > 0 && part.x + part.w <= width && part.y + part.h <= height);
  }
});

test("task details, filtering and work amount do not randomly change building identity", () => {
  const project = makeInitialProject(), before = planTownLayout(project.tasks);
  const extra = { ...project.tasks[2], id: "additional", parentId: "venue", title: "新事项" };
  const after = planTownLayout([...project.tasks.map(task => ({ ...task, status: "done" as const, priority: "high" as const, description: "修改备注", owner: "伴侣" })), extra]);
  for (const plot of before.plots) {
    const updated = after.plots.find(item => item.taskId === plot.taskId)!;
    assert.deepEqual([updated.kind, updated.variant], [plot.kind, plot.variant]);
  }
  assert.equal(selectTownBuilding(extra, "场地与餐饮").kind, "tavern");
  assert.equal(before.plots.find(plot => plot.civic)?.kind, "windmill");
});

test("unclassified tasks distribute across several stable types and variants", () => {
  const kinds = new Set(), variants = new Set();
  for (let i = 0; i < 80; i++) {
    const task = { id: `generic-${i}`, parentId: "root", title: "新任务" };
    const a = selectTownBuilding(task), b = selectTownBuilding(task);
    assert.deepEqual(a, b); kinds.add(a.kind); variants.add(a.variant);
  }
  assert.ok(kinds.size >= 8); assert.equal(variants.size, 3);
});

test("all generated sprite frames lie within the actual PNG and never overlap", () => {
  const png = readFileSync("public/assets/ai-town/buildings/town-buildings.png");
  assert.equal(png.readUInt32BE(16), atlas.width); assert.equal(png.readUInt32BE(20), atlas.height);
  const frames = Object.values(atlas.frames).flatMap(info => info.variants);
  assert.equal(Object.keys(atlas.frames).length, 17); assert.equal(frames.length, 51);
  for (const [i, a] of frames.entries()) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= atlas.width && a.y + a.h <= atlas.height);
    for (const b of frames.slice(i + 1)) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
  }
  assert.equal(townBuildingFrame("windmill", 0), null);
  assert.equal(townBuildingFrame("camp", 0), null);
});
