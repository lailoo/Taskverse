"use client";

import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { createCloudRenderer, loadCloudAssets, type CloudFrame } from "@/lib/cloud-sea-renderer";
import { CLOUD_TRAIN_UV_SCALE, CLOUD_COACH_COUNT } from "@/lib/cloud-train";
import { CLOUD_QUALITY, type CloudSettings } from "@/lib/cloud-settings";

export function CloudSeaScene({ paused, active, settings }: { paused: boolean; active: boolean; settings: CloudSettings }) {
  const farRef = useRef<HTMLCanvasElement>(null);
  const nearRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ paused, active, settings });
  stateRef.current = { paused, active, settings };
  const timeRef = useRef(0);
  const travelRef = useRef<[number, number]>([0, 0]);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [generation, setGeneration] = useState(0);
  const { getViewport, getNodes } = useReactFlow();

  useEffect(() => {
    const far = farRef.current, near = nearRef.current;
    const shell = far?.closest<HTMLElement>(".canvas-shell");
    if (!far || !near || !shell) return;
    let disposed = false, frameId = 0, lastTime = performance.now(), lastDraw = 0;
    let width = shell.clientWidth, height = shell.clientHeight, dirty = true;
    let farRenderer: ReturnType<typeof createCloudRenderer> | undefined;
    let nearRenderer: ReturnType<typeof createCloudRenderer> | undefined;
    let previousGeometry = "";
    let previousSettings = stateRef.current.settings;
    let quality = CLOUD_QUALITY[previousSettings.quality];
    let trainAnchor: SVGGElement | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = () => { lastTime = performance.now(); dirty = true; };
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frameId);
      setStatus("fallback");
    };
    const restored = () => setGeneration(value => value + 1);
    const observer = new ResizeObserver(() => {
      width = shell.clientWidth; height = shell.clientHeight;
      farRenderer?.resize(width, height, quality.pixels); nearRenderer?.resize(width, height, quality.pixels);
      dirty = true;
    });
    observer.observe(shell);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", visibility);
    for (const canvas of [far, near]) {
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
    }

    const tick = (now: number) => {
      const currentSettings = stateRef.current.settings;
      if (currentSettings !== previousSettings) {
        const nextQuality = CLOUD_QUALITY[currentSettings.quality];
        if (nextQuality !== quality) {
          quality = nextQuality;
          farRenderer?.resize(width, height, quality.pixels); nearRenderer?.resize(width, height, quality.pixels);
        }
        previousSettings = currentSettings;
        dirty = true;
      }
      const running = !stateRef.current.paused && !document.hidden && !reduced.matches;
      if (running) {
        const before = timeRef.current;
        timeRef.current += Math.min((now - lastTime) / 1000, .1);
        // Integrate travel instead of multiplying elapsed time by speed, so a
        // slider change never jumps the cloud field back to another location.
        const delta = Math.sin(1.2 * timeRef.current) - Math.sin(1.2 * before) + 4 * (timeRef.current - before);
        travelRef.current[0] += delta * currentSettings.farSpeed;
        travelRef.current[1] += delta * currentSettings.nearSpeed;
      }
      lastTime = now;
      const viewport = getViewport();
      const root = getNodes().find(node => node.data.root);
      const scale = viewport.zoom;
      const x = root ? root.position.x * scale + viewport.x : -1000;
      const y = root ? root.position.y * scale + viewport.y : -1000;
      const w = (root?.measured?.width || root?.width || 260) * scale;
      const h = (root?.measured?.height || root?.height || 140) * scale;
      const axisY = root && stateRef.current.active ? (y + h / 2) / Math.max(1, height) : .7;
      if (!trainAnchor?.isConnected) trainAnchor = shell.querySelector<SVGGElement>("[data-cloud-train]");
      const trainPose = trainAnchor?.transform.baseVal.consolidate()?.matrix;
      const track = trainAnchor?.closest(".road-traffic")?.querySelector("path");
      const start = track?.getPointAtLength(0);
      const end = track?.getPointAtLength(track.getTotalLength());
      const enabled = stateRef.current.active && trainPose && start && end;
      const railway: CloudFrame["railway"] = enabled
        ? [start.x * scale + viewport.x, end.x * scale + viewport.x, start.y * scale + viewport.y, scale]
        : [0, 0, 0, 0];
      const train: CloudFrame["train"] = enabled
        ? [trainPose.e * scale + viewport.x, trainPose.f * scale + viewport.y, Math.abs(trainPose.a) * scale * CLOUD_TRAIN_UV_SCALE, CLOUD_COACH_COUNT]
        : [0, 0, 1, 0];
      const geometry = `${x}:${y}:${w}:${h}:${axisY}:${width}:${height}:${root?.selected}:${railway.join(":")}:${running ? "moving" : train.join(":")}`;
      if (geometry !== previousGeometry) { dirty = true; previousGeometry = geometry; }
      // Paused scenes still redraw parameter/camera changes without advancing.
      if (!document.hidden && width > 0 && height > 0 && (dirty || (running && now - lastDraw >= 1000 / quality.fps))) {
        const data: CloudFrame = { time: timeRef.current, travel: travelRef.current, settings: currentSettings, axisY, root: [x / width, y / height, (x + w) / width, (y + h + (root?.selected ? 64 * scale : 0)) / height], railway, train };
        farRenderer?.draw(data); nearRenderer?.draw(data);
        far.dataset.cloudTime = near.dataset.cloudTime = timeRef.current.toFixed(4);
        far.dataset.cloudTravel = travelRef.current[0].toFixed(4);
        near.dataset.cloudTravel = travelRef.current[1].toFixed(4);
        far.dataset.cloudQuality = near.dataset.cloudQuality = currentSettings.quality;
        near.dataset.axisY = String(axisY * height);
        lastDraw = now; dirty = false;
      }
      frameId = requestAnimationFrame(tick);
    };
    setStatus("loading");
    loadCloudAssets().then(({ source, noise }) => {
      if (disposed) return;
      farRenderer = createCloudRenderer(far, source, noise, false);
      nearRenderer = createCloudRenderer(near, source, noise, true);
      farRenderer.resize(width, height, quality.pixels); nearRenderer.resize(width, height, quality.pixels);
      lastTime = performance.now();
      setStatus("ready");
      frameId = requestAnimationFrame(tick);
    }).catch(error => {
      if (disposed) return;
      farRenderer?.dispose(); nearRenderer?.dispose();
      farRenderer = nearRenderer = undefined;
      console.warn("Cloud scene fallback:", error instanceof Error ? error.message : error);
      setStatus("fallback");
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", visibility);
      for (const canvas of [far, near]) {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
      }
      farRenderer?.dispose(); nearRenderer?.dispose();
    };
  }, [generation, getNodes, getViewport]);

  return <>
    <div className="cloud-sea-fallback" hidden={status === "ready"} aria-hidden="true" />
    <canvas ref={farRef} className="cloud-sea-canvas cloud-sea-background" data-cloud-layer="background" data-cloud-renderer={status} hidden={status !== "ready"} aria-hidden="true" />
    <canvas ref={nearRef} className="cloud-sea-canvas cloud-sea-foreground" data-cloud-layer="foreground" data-cloud-renderer={status} hidden={status !== "ready" || !active} aria-hidden="true" />
  </>;
}
