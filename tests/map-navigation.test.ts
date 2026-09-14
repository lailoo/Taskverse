import test from "node:test";
import assert from "node:assert/strict";
import { adjacentNode, preserveSelection } from "../src/lib/map-navigation";

test("layout frames retain selection changes made during animation", () => {
  const frame = [
    { id: "a", selected: true },
    { id: "b", selected: false },
  ];
  const live = [
    { id: "a", selected: false },
    { id: "b", selected: true },
  ];
  assert.deepEqual(
    preserveSelection(frame, live).map((node) => node.selected),
    [false, true],
  );
  assert.deepEqual(
    preserveSelection(
      frame,
      live.map((node) => ({ ...node, selected: false })),
    ).map((node) => node.selected),
    [false, false],
  );
});

test("repeated layout frames preserve React Flow measurements for existing nodes", () => {
  const frame = [{ id: "a" }, { id: "new" }];
  const live = [{ id: "a", measured: { width: 260, height: 140 }, selected: true }];
  const first = preserveSelection<{ id: string; measured?: { width: number; height: number }; selected?: boolean }>(frame, live);
  const second = preserveSelection<typeof first[number]>(frame, first);
  assert.deepEqual(second[0].measured, live[0].measured);
  assert.equal(second[1].measured, undefined);
});

const nodes = [
  { id: "center", position: { x: 0, y: 0 } },
  { id: "upper", position: { x: 150, y: -240 } },
  { id: "lower", position: { x: 150, y: 240 } },
  { id: "right", position: { x: 400, y: 0 } },
];
test("directional navigation follows staggered rows and prefers alignment", () => {
  assert.equal(adjacentNode(nodes, "center", "ArrowUp")?.id, "upper");
  assert.equal(adjacentNode(nodes, "center", "ArrowDown")?.id, "lower");
  assert.equal(adjacentNode(nodes, "center", "ArrowRight")?.id, "right");
  assert.equal(adjacentNode(nodes, "center", "ArrowLeft"), undefined);
});
test("navigation only considers supplied visible nodes", () => {
  assert.equal(
    adjacentNode(
      nodes.filter((n) => n.id !== "upper"),
      "center",
      "ArrowUp",
    ),
    undefined,
  );
  assert.equal(adjacentNode(nodes, "missing", "ArrowDown"), undefined);
});
