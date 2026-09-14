"use client";

import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { useId, type CSSProperties } from "react";
import { RoadTraffic, useRailwayTraffic, useDesertTraffic } from "./RoadTraffic";
import { DesertTrail } from "./DesertCaravan";
import { CloudRailway } from "./CloudRailway";

function RoadPath({ path, style, id, interactionWidth = 20 }: {
  path: string; style?: CSSProperties; id?: string; interactionWidth?: number;
}) {
  const desert = useDesertTraffic();
  return <>
    {desert && <path d={path} fill="none" stroke="#9d827b" strokeOpacity=".25" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
    <BaseEdge id={id} path={path} interactionWidth={interactionWidth} style={{ ...style, strokeWidth: desert ? 4 : 8, strokeLinecap: "round", strokeLinejoin: "round" }} />
    {!desert && <path d={path} className="road-centerline" fill="none" stroke="#ffffffd9" strokeWidth={1} strokeDasharray="5 6" strokeLinecap="round" pointerEvents="none" opacity={style?.opacity ?? 1} />}
  </>;
}

export function RoadEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
    sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
    centerY: typeof props.data?.routeOffset === "number" ? props.sourceY + props.data.routeOffset : undefined,
    borderRadius: 16,
  });
  return <>
    <RoadPath id={props.id} path={path} style={props.style} interactionWidth={props.interactionWidth} />
    <RoadTraffic id={props.id} path={path} source={props.source} target={props.target} />
  </>;
}

export function AxisEdge({ id, source, target, sourceX, sourceY, targetX, targetY, style, interactionWidth, data }: EdgeProps) {
  const railway = useRailwayTraffic();
  const desert = useDesertTraffic();
  const scenic = railway || desert;
  const trainClip = useId();
  const trunk = `M ${sourceX} ${sourceY} H ${targetX}`;
  const branch = `M ${targetX} ${sourceY} V ${targetY}`;
  return <>
    {!scenic && <RoadPath style={{ ...style, stroke: "var(--map-line)" }} interactionWidth={0} path={trunk} />}
    <RoadPath id={id} style={style} interactionWidth={interactionWidth} path={branch} />
    {railway && data?.mainTraffic === true && <CloudRailway sourceX={sourceX} targetX={targetX} y={sourceY} rootHeight={typeof data?.rootHeight === "number" ? data.rootHeight : undefined} />}
    {desert && data?.mainTraffic === true && <DesertTrail sourceX={sourceX} targetX={targetX} y={sourceY} />}
    {data?.mainTraffic === true && <>
      {scenic && <defs><clipPath id={trainClip}><rect x={Math.min(sourceX, targetX)} y={sourceY - (desert ? 520 : 120)} width={Math.abs(targetX - sourceX)} height={desert ? 560 : 140} /></clipPath></defs>}
      <g clipPath={scenic ? `url(#${trainClip})` : undefined}>
        <RoadTraffic id={`${id}:main`} path={trunk} source={source} target="" main />
      </g>
    </>}
    <RoadTraffic id={id} path={branch} source={source} target={target} lead={Math.abs(targetX - sourceX)} />
  </>;
}
