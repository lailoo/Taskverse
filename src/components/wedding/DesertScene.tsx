"use client";

import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { createDesertRenderer, loadDesertShader } from "@/lib/desert-renderer";
import type { DesertSettings } from "@/lib/desert-settings";

export function DesertScene({ paused, settings }: { paused: boolean; settings: DesertSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { getViewport, getNodes } = useReactFlow();
  const state = useRef({ paused, settings });
  state.current = { paused, settings };
  const clocks = useRef({ time: 0, wind: 0, city: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shell = canvas.closest<HTMLElement>(".canvas-shell")!;
    const fallback = canvas.parentElement?.querySelector<HTMLElement>(".desert-scene-fallback");
    let renderer: ReturnType<typeof createDesertRenderer> | undefined;
    let disposed = false, frame = 0, lastTime = performance.now(), lastDraw = 0, dirty = true;
    let previousSettings = state.current.settings;
    let previousRunning = false;
    let previousAxis = NaN;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new ResizeObserver(() => { renderer?.resize(shell.clientWidth,shell.clientHeight); dirty = true; });
    const visibility = () => { lastTime = performance.now(); dirty = true; };
    const lost = (e: Event) => { e.preventDefault(); renderer = undefined; setStatus("fallback"); };
    const restored = () => setGeneration(g => g + 1);
    observer.observe(shell);
    document.addEventListener("visibilitychange", visibility); reduced.addEventListener("change", visibility);
    canvas.addEventListener("webglcontextlost", lost); canvas.addEventListener("webglcontextrestored", restored);
    const tick = (now: number) => {
      const current = state.current;
      const running = !current.paused && !document.hidden && !reduced.matches;
      // Flush the final accumulated position when pausing between capped draws.
      // Otherwise a later appearance adjustment would reveal a one-frame jump.
      if (running !== previousRunning) { dirty = true; previousRunning = running; }
      const delta = Math.min(.1,(now-lastTime)/1000);
      lastTime = now;
      if (running) { clocks.current.time += delta; clocks.current.wind += delta*current.settings.windSpeed; clocks.current.city += delta*current.settings.citySpeed; }
      if (previousSettings !== current.settings) { dirty = true; previousSettings = current.settings; }
      const viewport = getViewport();
      const root = getNodes().find(node => node.data.root);
      const axis = root ? (viewport.y + (root.position.y + (root.measured?.height || root.height || 140) / 2) * viewport.zoom) / Math.max(1, shell.clientHeight) : .76;
      if (axis !== previousAxis) {
        dirty = true; previousAxis = axis;
        fallback?.style.setProperty("--desert-ground-shift", `${(axis - .76) * shell.clientHeight}px`);
      }
      if (!document.hidden && (dirty || running && now-lastDraw >= 1000/30)) {
        const { wind, time, city } = clocks.current;
        renderer?.draw(wind,city,current.settings,axis);
        fallback?.style.setProperty("--desert-city-drift", `${-city * 2}px`);
        canvas.dataset.sceneTime = time.toFixed(4);
        canvas.dataset.windTravel = wind.toFixed(4);
        canvas.dataset.cityTravel = city.toFixed(4);
        canvas.dataset.axisY = String(axis * shell.clientHeight);
        dirty = false; lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    setStatus("loading");
    loadDesertShader().then(source => {
      if (disposed) return;
      renderer = createDesertRenderer(canvas,source);
      renderer.resize(shell.clientWidth,shell.clientHeight); dirty = true; setStatus("ready");
    }).catch(error => { if (!disposed) { console.warn("Desert scene fallback:",error instanceof Error ? error.message : error); setStatus("fallback"); } });
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer?.dispose();
      document.removeEventListener("visibilitychange",visibility); reduced.removeEventListener("change",visibility);
      canvas.removeEventListener("webglcontextlost",lost); canvas.removeEventListener("webglcontextrestored",restored);
    };
  }, [generation, getViewport, getNodes]);
  return <div className="desert-scene" aria-hidden="true">
    <div className="desert-scene-fallback" hidden={status === "ready"} />
    <canvas ref={canvasRef} data-desert-renderer={status} hidden={status !== "ready"} />
  </div>;
}
