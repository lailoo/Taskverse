import test from "node:test";
import assert from "node:assert/strict";
import { emptyMemory, mergeMemory, normalizeMemory } from "../src/lib/conversation-memory";

test("memory patches merge facts without dropping existing manual facts", () => {
  const current = { ...emptyMemory, weddingDate: "2026-09-27", preferences: ["自然光", "不铺满鲜花"] };
  const merged = mergeMemory(current, { budget: "12万元", preferences: ["自然光", "户外晚宴"], decisions: ["先确认场地"] });
  assert.deepEqual(merged, { weddingDate: "2026-09-27", budget: "12万元", preferences: ["自然光", "不铺满鲜花", "户外晚宴"], decisions: ["先确认场地"] });
});

test("memory normalization rejects oversized or malformed model facts", () => {
  assert.throws(() => normalizeMemory({ weddingDate: "x".repeat(201) }), /记忆/);
  assert.throws(() => normalizeMemory({ preferences: ["ok", 12] }), /记忆/);
  assert.throws(() => normalizeMemory({ decisions: Array.from({ length: 21 }, () => "x") }), /记忆/);
  assert.deepEqual(normalizeMemory(undefined), emptyMemory);
});
