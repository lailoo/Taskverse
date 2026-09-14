"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { DesertCaravan } from "./DesertCaravan";
import { DESERT_CARAVAN_LENGTH, desertCaravanScale } from "@/lib/desert-caravan";
import { CloudLocomotive } from "./CloudRailway";
import { CLOUD_TRAIN_LENGTH, cloudTrainLoopLength, cloudTrainScale } from "@/lib/cloud-train";

type Route = {
  source: string;
  target: string;
  lead: number;
  main: boolean;
  path: SVGPathElement;
  car: SVGGElement;
  ripple: SVGCircleElement;
  length: number;
  train: boolean;
  desert: boolean;
  gait: { body: SVGGElement; legs: SVGGElement[] }[];
};
const TrafficContext = createContext<Map<string, Route> | null>(null);
const RailwayContext = createContext(false);
const DesertTrafficContext = createContext(false);
export const useDesertTraffic = () => useContext(DesertTrafficContext);
export const useRailwayTraffic = () => useContext(RailwayContext);
const SPEED = 48;
const paints = ["var(--car-paint-1)", "var(--car-paint-2)", "var(--car-paint-3)"];

export function RoadTrafficProvider({ children, railway = false, desert = false, paused = false, speedMultiplier = 1 }: { children: ReactNode; railway?: boolean; desert?: boolean; paused?: boolean; speedMultiplier?: number }) {
  const routes = useRef(new Map<string, Route>());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    let elapsed = 0;
    let wave = 0;
    let gaitTime = 0;
    let previousSignature = "";
    const arrived = new Map<string, string>();
    const animations = new Set<Animation>();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now: number) => {
      const entries = [...routes.current.entries()];
      const mainTrain = entries.find(([, route]) => route.train)?.[1];
      // Compensate for overview zoom: a long map must still look like a fast
      // train, rather than an almost stationary dot. Normal road speed is intact.
      const mainCaravan = entries.find(([, route]) => route.desert && route.main)?.[1];
      const matrix = (mainTrain || mainCaravan)?.path.getScreenCTM();
      const zoom = matrix ? Math.max(.04, Math.hypot(matrix.a, matrix.b)) : 1;
      const camelScale = mainCaravan ? desertCaravanScale(mainCaravan.length) : .72;
      const speed = mainTrain ? Math.max(240, 140 / zoom) * speedRef.current
        : mainCaravan ? Math.max(24, 16 / zoom) * speedRef.current : SPEED;
      if (!pausedRef.current && !document.hidden && !reduced.matches) {
        const delta = Math.min((now - previousTime) / 1000, .1);
        elapsed += delta * speed / SPEED;
        gaitTime += delta * speedRef.current;
      }
      previousTime = now;
      const signature = entries.map(([id, r]) => `${id}:${r.path.getAttribute("d")}:${r.train}:${r.desert}`).join("|");
      if (signature !== previousSignature) {
        previousSignature = signature;
        // Start with the whole train visible beyond the root card. The branch
        // departures share this clock, so they still leave as its engine passes.
        elapsed = mainTrain ? (CLOUD_TRAIN_LENGTH * cloudTrainScale(mainTrain.length) + 18) / SPEED
          : mainCaravan ? (DESERT_CARAVAN_LENGTH * camelScale + 18) / SPEED : 0;
        wave++;
        arrived.clear();
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      }
      const arrivals = new Map<string, number>();
      const delay = (route: Route, seen = new Set<Route>()): number => {
        if (route.main) return 0;
        if (seen.has(route)) return 0;
        seen.add(route);
        const parent = entries.find(([, candidate]) => !candidate.main && candidate.target === route.source)?.[1];
        return parent ? delay(parent, seen) + parent.length / SPEED : route.lead / SPEED;
      };
      for (const [id, route] of entries) arrivals.set(id, delay(route));
      const cycle = mainTrain
        ? cloudTrainLoopLength(mainTrain.length) / SPEED
        : mainCaravan ? (mainCaravan.length + DESERT_CARAVAN_LENGTH * camelScale + 12) / SPEED
        : Math.max(0, ...entries.map(([id, route]) => arrivals.get(id)! + route.length / SPEED)) + 2;
      const rippleJunctions = new Set<string>();
      for (const [id, route] of entries) {
        const sinceDeparture = elapsed - arrivals.get(id)!;
        const routeCycle = route.main ? cycle : cycle * Math.max(1, Math.ceil((route.length / SPEED + .7) / cycle));
        const lap = Math.floor(sinceDeparture / routeCycle);
        const stamp = `${wave}:${lap}`;
        // Branches keep their own departure offset across laps, including deep
        // subtrees whose delivery extends into the next train's journey.
        const age = sinceDeparture < 0 ? sinceDeparture : sinceDeparture % routeCycle;
        const distance = age * SPEED;
        if (!route.main && distance >= route.length && arrived.get(id) !== stamp) {
          arrived.set(id, stamp);
          const ring = route.path.closest(".react-flow")?.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(route.target)}"] .node-arrival-ripple`,
          );
          if (ring && !reduced.matches) {
            const animation = ring.animate(
              [{ transform: "scale(1)", opacity: 0.38 }, { transform: "scale(1.12, 1.18)", opacity: 0 }],
              { duration: 700, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            );
            animations.add(animation);
            animation.onfinish = () => { animations.delete(animation); };
          }
        }
        const origin = route.path.getPointAtLength(0);
        const junction = `${Math.round(origin.x)}:${Math.round(origin.y)}:${arrivals.get(id)!.toFixed(2)}`;
        const splits = !route.main && (route.lead > 0 || entries.filter(([, other]) => !other.main && other.source === route.source).length > 1);
        const rippleVisible = splits && !reduced.matches && age >= 0 && age < 0.7 && !rippleJunctions.has(junction);
        route.ripple.setAttribute("opacity", rippleVisible ? String(0.45 * (1 - age / 0.7)) : "0");
        if (rippleVisible) {
          rippleJunctions.add(junction);
          route.ripple.setAttribute("cx", String(origin.x));
          route.ripple.setAttribute("cy", String(origin.y));
          route.ripple.setAttribute("r", String(4 + 20 * (1 - (1 - age / 0.7) ** 2)));
        }
        // The engine continues beyond the end while the last coaches leave;
        // AxisEdge clips the whole consist to the bridge, then a new lap starts.
        const procession = route.train || route.desert && route.main;
        const visible = procession || (!reduced.matches && distance >= 0 && distance < route.length);
        route.car.style.visibility = visible ? "visible" : "hidden";
        if (route.train) route.car.dataset.trainParked = String(pausedRef.current || reduced.matches || document.hidden);
        if (route.desert) {
          route.car.dataset.caravanTravel = elapsed.toFixed(4);
          route.gait.forEach(({ body, legs }, index) => {
            const phase = gaitTime * 2.7 + index * 1.4;
            body.setAttribute("transform", `translate(0 ${Math.sin(phase * 2) * .9}) rotate(${Math.sin(phase) * .7} 45 -40)`);
            legs.forEach((leg, i) => leg.setAttribute("transform", `translate(${[26,33,76,83][i]} -33) rotate(${Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 14})`));
          });
        }
        if (!visible) continue;
        if (!route.train && !route.desert && route.car.dataset.wave !== stamp) {
          route.car.dataset.wave = stamp;
          const body = route.car.querySelector("rect");
          body?.setAttribute("fill", paints[Math.floor(Math.random() * paints.length)]);
          body?.setAttribute("rx", String(1 + Math.floor(Math.random() * 3)));
          body?.setAttribute("width", String(12 + Math.floor(Math.random() * 5)));
        }
        const travel = Math.max(0, Math.min(route.length, distance));
        const point = route.path.getPointAtLength(travel);
        const before = route.path.getPointAtLength(Math.max(0, travel - 0.5));
        const after = route.path.getPointAtLength(Math.min(route.length, travel + 0.5));
        const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        const overshoot = procession ? Math.max(0, distance - route.length) : 0;
        const radians = angle * Math.PI / 180;
        route.car.setAttribute("transform", `translate(${point.x + Math.cos(radians) * overshoot} ${point.y + Math.sin(radians) * overshoot}) rotate(${angle})${route.train ? ` scale(${cloudTrainScale(route.length)})` : route.desert ? ` scale(${route.main ? camelScale : Math.min(.30 / zoom, camelScale * .48)})` : ""}`);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);
  return <DesertTrafficContext.Provider value={desert}><RailwayContext.Provider value={railway}><TrafficContext.Provider value={routes.current}>{children}</TrafficContext.Provider></RailwayContext.Provider></DesertTrafficContext.Provider>;
}

export function RoadTraffic({ id, path, source, target, lead = 0, main = false }: {
  id: string; path: string; source: string; target: string; lead?: number; main?: boolean;
}) {
  const routes = useContext(TrafficContext);
  const train = useRailwayTraffic() && main;
  const desert = useDesertTraffic();
  const pathRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const rippleRef = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (!routes || !pathRef.current || !carRef.current || !rippleRef.current) return;
    const gait = [...carRef.current.querySelectorAll<SVGGElement>("[data-camel]")].map(node => ({
      body: node.querySelector<SVGGElement>("[data-camel-body]")!, legs: [...node.querySelectorAll<SVGGElement>("[data-camel-leg]")],
    }));
    routes.set(id, { source, target, lead, main, train, desert, gait, path: pathRef.current, car: carRef.current, ripple: rippleRef.current, length: pathRef.current.getTotalLength() });
    return () => { routes.delete(id); };
  }, [routes, id, path, source, target, lead, main, train, desert]);
  return <g className={`road-traffic${train ? " railway-traffic" : desert ? " desert-traffic" : ""}`} pointerEvents="none" aria-hidden="true" data-route={id}>
    <path ref={pathRef} d={path} fill="none" stroke="none" />
    <circle ref={rippleRef} className="road-split-ripple" r={4} fill="none" stroke="var(--text)" strokeWidth={1.5} opacity={0} />
    <g ref={carRef} data-cloud-train={train ? "" : undefined} data-desert-caravan={desert && main ? "" : undefined} data-desert-courier={desert && !main ? "" : undefined} style={{ visibility: "hidden" }}>
      {train ? <CloudLocomotive /> : desert ? <DesertCaravan main={main} /> : <>
      <rect x={-7} y={-3} width={14} height={6} rx={2} fill="var(--car-paint-1)" stroke="#263238" strokeWidth={1} />
      <rect x={0} y={-2} width={3.5} height={4} rx={0.5} fill="#536976" />
      <path d="M -5.5 -2 V 2" stroke="#de533a" strokeWidth={1.5} />
      </>}
    </g>
  </g>;
}
