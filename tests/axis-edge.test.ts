import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Position, type EdgeProps } from "@xyflow/react";
import { AxisEdge, RoadEdge } from "../src/components/wedding/AxisEdge";

test("axis edge renders its path without leaking React Flow props to SVG", () => {
  const warnings: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    warnings.push(args);
  };
  let html: string;
  try {
    html = renderToStaticMarkup(
      createElement(
        "svg",
        null,
        createElement(AxisEdge, {
          id: "axis-test",
          source: "root",
          target: "child",
          sourceX: 10,
          sourceY: 20,
          targetX: 100,
          targetY: 140,
          sourcePosition: Position.Right,
          targetPosition: Position.Top,
          sourceHandleId: "branch",
          targetHandleId: null,
          selectable: true,
          deletable: true,
          selected: false,
          pathOptions: { borderRadius: 0 },
          style: { stroke: "#a1a7a3", strokeWidth: 1.5 },
        } as EdgeProps),
      ),
    );
  } finally {
    console.error = original;
  }
  assert.equal(
    warnings.length,
    0,
    "Rendering must not emit DOM attribute warnings",
  );
  assert.match(html!, /M 10 20 H 100/);
  assert.match(html!, /M 100 20 V 140/);
  assert.match(html!, /stroke-dasharray="5 6"/);
  assert.match(html!, /stroke:#a1a7a3/);
  assert.doesNotMatch(
    html!,
    /sourcePosition|targetPosition|sourceHandleId|targetHandleId|pathOptions|selectable|deletable/,
  );
});

test("branch roads use the target status color with a noninteractive centerline", () => {
  for (const status of ["todo", "doing", "waiting", "done"]) {
    const html = renderToStaticMarkup(
      createElement(
        "svg",
        null,
        createElement(RoadEdge, {
          id: "road",
          source: "a",
          target: "b",
          sourceX: 0,
          sourceY: 0,
          targetX: 120,
          targetY: 140,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: { stroke: `var(--status-${status}-ink)` },
          data: { status },
        }),
      ),
    );
    assert.ok(html.includes(`var(--status-${status}-ink)`));
    assert.match(html, /stroke-width="1"/);
    assert.match(html, /pointer-events="none"/);
    assert.match(html, /data-route="road"/);
  }
});
