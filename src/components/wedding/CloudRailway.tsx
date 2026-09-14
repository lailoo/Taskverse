"use client";

import { CLOUD_TRAIN_LENGTH, CLOUD_COACH_COUNT, CLOUD_COACH_SPACING } from "@/lib/cloud-train";
import { useStore } from "@xyflow/react";

// The bridge remains a crisp, stationary vector on the actual React Flow axis.
export function CloudRailway({ sourceX, targetX, y }: { sourceX: number; targetX: number; y: number; rootHeight?: number }) {
  const zoom = useStore(state => Math.max(.04, state.transform[2]));
  const left = Math.min(sourceX, targetX), width = Math.abs(targetX - sourceX);
  const spans = Math.max(1, Math.ceil(width / 420)), span = width / spans;
  const hangers = Math.max(3, Math.min(11, Math.floor(span * zoom / 10)));
  const pierOutline = Math.max(0, 1.5 / zoom - 10);
  return <g className="cloud-rail-bridge" data-cloud-railway="" pointerEvents="none" aria-hidden="true" shapeRendering="geometricPrecision">
    <path d={`M ${left} ${y + 12} h ${width} M ${left} ${y + 20} h ${width}`} className="cloud-rail-beam" style={{ strokeWidth: Math.max(7, 2 / zoom) }} />
    {Array.from({ length: spans }, (_, index) => {
      const x = left + index * span;
      return <g key={index}>
        <path d={`M ${x} ${y - 56} Q ${x + span / 2} ${y + 8} ${x + span} ${y - 56}`} className="cloud-rail-cable" style={{ strokeWidth: Math.max(3, 1.2 / zoom) }} />
        {Array.from({ length: hangers }, (_, hanger) => {
          const t = (hanger + 1) / (hangers + 1);
          const cableY = y - 56 + 128 * t * (1 - t);
          return <path key={hanger} d={`M ${x + span * t} ${cableY} V ${y + 8}`} className="cloud-rail-hanger" style={{ strokeWidth: Math.max(1.6, .8 / zoom) }} />;
        })}
        <path d={`M ${x - 6} ${y - 68} h 12 v 81 Q ${x + 6} ${y + 26} ${x + 38} ${y + 26} H ${x + 24} Q ${x + 5} ${y + 26} ${x + 5} ${y + 60} v 230 h -10 V ${y + 60} Q ${x - 5} ${y + 26} ${x - 24} ${y + 26} H ${x - 38} Q ${x - 6} ${y + 26} ${x - 6} ${y + 13} Z`} className="cloud-rail-pier" stroke="#573029" strokeWidth={pierOutline} />
      </g>;
    })}
    <rect x={left + width - 5} y={y - 68} width={10} height={358} className="cloud-rail-pier" stroke="#573029" strokeWidth={pierOutline} />
    {zoom >= .16 && <path d={`M ${left} ${y + 3} h ${width}`} className="cloud-rail-sleepers" />}
    <path d={`M ${left} ${y - 3} h ${width} M ${left} ${y + 8} h ${width}`} className="cloud-rail-rails" style={{ strokeWidth: Math.max(3, 1 / zoom) }} />
    <path d={`M ${left} ${y - 4} h ${width}`} className="cloud-rail-highlight" style={{ strokeWidth: Math.max(1, .6 / zoom) }} />
  </g>;
}

export function CloudLocomotive() {
  return <g data-cloud-consist="" data-coach-count={CLOUD_COACH_COUNT}>
    <rect x={-CLOUD_TRAIN_LENGTH} y={-80} width={CLOUD_TRAIN_LENGTH} height={80} fill="none" />
    <g className="cloud-rail-fallback" fill="#612a30">
      {Array.from({ length: CLOUD_COACH_COUNT }, (_, index) => <rect key={index} x={-36 - (index + 1) * CLOUD_COACH_SPACING} y={-11} width={CLOUD_COACH_SPACING - 5} height={9} />)}
      <path d="M -36 -3 v -8 h 24 v 3 h 10 v 5 Z M -6 -8 v -9 h 3 v 9 Z" />
    </g>
  </g>;
}
