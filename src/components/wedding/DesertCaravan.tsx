"use client";

import { useStore } from "@xyflow/react";
import { DESERT_CAMEL_COUNT, DESERT_CAMEL_SPACING } from "@/lib/desert-caravan";

function Camel({ index }: { index: number }) {
  return <g data-camel={index}>
    <ellipse cx="48" cy="3" rx="42" ry="3.3" fill="#182537" opacity=".35" />
    <g data-camel-body>
      {[26, 33, 76, 83].map((x, leg) => <g key={x} data-camel-leg={leg} transform={`translate(${x} -33)`}>
        <path d="M0 0 Q-3 8 1 17 L-1 32 L-5 33" fill="none" stroke={leg % 2 ? "#372c33" : "#242c36"} strokeWidth="3.3" strokeLinecap="round" />
        <path d="M0 1 L1 14" fill="none" stroke="#9f7764" strokeWidth=".8" />
      </g>)}
      <path d="M22-40 C17-45 22-53 30-55 C35-58 36-70 43-74 C51-79 58-72 64-63 L72-59 C79-57 86-53 90-49 L92-35 C74-24 47-23 25-34Z" fill="#43323b" stroke="#ad826b" strokeWidth="1" />
      <path d="M31-39 C16-45 18-60 14-75 L7-84 C0-82-9-82-12-88 C-14-93-5-96 3-94 L11-100 L16-93 C25-86 22-67 36-56Z" fill="#48333b" stroke="#a37a68" strokeWidth="1" />
      <path d="M89-46 Q105-35 100-23 L104-19" fill="none" stroke="#2c2934" strokeWidth="2" />
      <path d="M31-53 Q53-48 76-55 L82-33 Q58-28 33-37Z" fill={index % 2 ? "#7d504e" : "#305768"} stroke="#b68b70" strokeWidth="1.4" />
      <path d="M38-50 L42-33 M51-50 L55-32 M65-51 L67-33" stroke="#c29770" strokeWidth="1.1" opacity=".65" />
      <path d="M36-53 L71-54 L64-64 L40-64Z" fill="#243b4e" />
      <path d="M44-63 L46-85 Q54-92 58-82 L64-60 L57-52 L55-70 L51-54 L41-49Z" fill={index % 3 ? "#2b465a" : "#82636a"} stroke="#718493" strokeWidth=".8" />
      <path d="M46-85 Q43-95 49-98 Q56-99 58-91 L57-84Z" fill="#283542" stroke="#98a1aa" strokeWidth=".8" />
      <path d="M49-92 L55-90 L54-85 L50-86Z" fill="#ae8777" />
      <path d="M50-78 L35-66 L11-87 M10-86 Q13-75 22-73" fill="none" stroke="#baa387" strokeWidth=".75" />
      <path d="M74-48 L84-45 L81-31 L73-34Z M24-50 L32-47 L30-34 L22-38Z" fill="#625056" stroke="#a5806a" strokeWidth=".8" />
      <circle cx="4" cy="-89" r="1.2" fill="#121f2a" />
      <path d="M-9-88 L-4-87 M2-94 L6-96" stroke="#ceb39a" strokeWidth=".7" />
    </g>
  </g>;
}

// Feet lie on y=0 in the route's local coordinate system. The artwork faces
// forward along the SVG path, with the following animals behind the leader.
export function DesertCaravan({ main }: { main: boolean }) {
  return <g data-desert-consist={main ? "main" : "branch"}>
    {Array.from({ length: main ? DESERT_CAMEL_COUNT : 1 }, (_, index) =>
      <g key={index} transform={`translate(${-index * DESERT_CAMEL_SPACING} 0) scale(-1 1)`}><Camel index={index} /></g>)}
  </g>;
}

export function DesertTrail({ sourceX, targetX, y }: { sourceX: number; targetX: number; y: number }) {
  const zoom = useStore(state => Math.max(.04, state.transform[2]));
  const left = Math.min(sourceX, targetX), width = Math.abs(targetX - sourceX);
  const marks = Math.max(1, Math.ceil(width / 110));
  const path = `M ${left} ${y} H ${left + width}`;
  return <g data-desert-trail="" pointerEvents="none" aria-hidden="true">
    <path d={path} fill="none" stroke="#182c3e" strokeOpacity=".32" strokeWidth={Math.max(28, 10 / zoom)} />
    <path d={path} fill="none" stroke="#9d827b" strokeOpacity=".52" strokeWidth={Math.max(16, 5 / zoom)} />
    <path d={path} fill="none" stroke="#dab497" strokeOpacity=".75" strokeWidth={Math.max(1.5, .8 / zoom)} />
    <path d={`M ${left} ${y + Math.max(7, 2 / zoom)} H ${left + width}`} fill="none" stroke="#dec0a4" strokeOpacity=".22" strokeWidth={1 / zoom} />
    {zoom > .1 && Array.from({ length: marks }, (_, index) => <path key={index}
      d={`M ${left + index * 110 + 22} ${y + 4} l 6 1 m 12 -6 l 5 1`}
      stroke="#302e39" strokeOpacity=".32" strokeWidth={Math.max(1.5, 1 / zoom)} strokeLinecap="round" />)}
  </g>;
}
