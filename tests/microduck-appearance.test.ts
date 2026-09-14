import test from "node:test";
import assert from "node:assert/strict";
import { DUCK_APPEARANCES, type DuckAppearance } from "../src/lib/mechanical-duck";

test("Microduck exposes four distinct appearance palettes", () => {
  const names: DuckAppearance[] = ["lavender", "graphite", "sky", "ivory"];
  assert.deepEqual(Object.keys(DUCK_APPEARANCES).sort(), names.slice().sort());
  for (const field of ["shell", "body", "accent", "lens"] as const) {
    assert.equal(new Set(names.map(name => DUCK_APPEARANCES[name][field])).size, names.length, `${field} colors should distinguish variants`);
  }
  assert.equal(DUCK_APPEARANCES.lavender.label, "薰衣草紫");
  assert.equal(DUCK_APPEARANCES.graphite.label, "石墨黑");
  assert.equal(DUCK_APPEARANCES.sky.label, "天空蓝");
  assert.equal(DUCK_APPEARANCES.ivory.label, "象牙白");
});
