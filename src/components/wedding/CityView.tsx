"use client";

import "./town.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Compass, Eye, EyeOff, MapPin, Maximize2, Minus, Pause, Play, Plus, Trees, Users, X } from "lucide-react";
import { ancestors, unfinishedTreeIds } from "@/lib/tasks";
import { planTownLayout, townResidentCount, type TownPlot } from "@/lib/town-layout";
import { TOWN_STATUS } from "@/lib/ai-town-assets";
import { TOWN_BUILDING_LABELS } from "@/lib/town-buildings";
import { isTownLandmark, townConstruction } from "@/lib/town-construction";
import { type Project, type Task } from "@/lib/types";
import { priorityText, statusText, UI_TEXT, useAppLanguage } from "@/lib/i18n";
import { TownMapCanvas, type TownCamera } from "./TownMapCanvas";
import type { TaskActions } from "./TaskCard";

type Props = { project: Project; actions: TaskActions; matches: Set<string> | null; unfinishedOnly: boolean; focusId: string | null; onLocate: (id: string) => void };

function visibleSet(tasks: Task[], matches: Set<string> | null, unfinishedOnly: boolean) {
  const unfinished = unfinishedOnly ? unfinishedTreeIds(tasks) : null;
  const matching = matches ? new Set([...matches].flatMap(id => [id, ...ancestors(tasks, id).map(task => task.id)])) : null;
  return new Set(tasks.filter(task => (!unfinished || unfinished.has(task.id)) && (!matching || matching.has(task.id))).map(task => task.id));
}
const EN_BUILDING_NAMES: Record<TownPlot["kind"], string> = {
  cottage: "Cottage", inn: "Guesthouse", tavern: "Tavern", boutique: "Boutique", florist: "Flower shop", studio: "Photo studio", chapel: "Ceremony hall", warehouse: "Warehouse", station: "Transport station", bank: "Treasury", postoffice: "Post office", pavilion: "Music pavilion", grandhotel: "Grand hotel", dragoninn: "Courtyard inn", lodge: "Woodland lodge", watchtower: "Watchtower", wall: "Town wall", camp: "Campground", windmill: "Civic windmill",
};
const EN_CONSTRUCTION: Record<string, { label: string; description: string }> = {
  foundation: { label: "Foundation · not started", description: "The site is reserved. Start the task to begin construction." },
  construction: { label: "Under construction", description: "Workers carry materials, build walls and operate the crane. Complete the task to finish the building." },
  suspended: { label: "Construction paused", description: "Work is on hold. Set the task to in progress to resume construction." },
  complete: { label: "Completed building", description: "The task is done and its building is complete." },
  landmark: { label: "Civic landmark", description: "The central windmill stays complete as the town's landmark." },
};

export function CityView({ project, actions, matches, unfinishedOnly, focusId, onLocate }: Props) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const priorities = priorityText(language);
  const buildingName = (plot: TownPlot) => language === "zh" ? TOWN_BUILDING_LABELS[plot.kind] : EN_BUILDING_NAMES[plot.kind];
  const constructionText = (plot: TownPlot) => {
    const construction = townConstruction(plot);
    return language === "zh" ? construction : { ...construction, ...EN_CONSTRUCTION[construction.stage] };
  };
  const stage = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const drag = useRef<{ x: number; y: number; camera: TownCamera; moved: boolean } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<TownCamera>({ x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labels, setLabels] = useState(true), [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const visible = useMemo(() => visibleSet(project.tasks, matches, unfinishedOnly), [project.tasks, matches, unfinishedOnly]);
  // Always plan all plots. Filtering does not regenerate the town or its road network.
  const layout = useMemo(() => planTownLayout(project.tasks), [project.tasks]);
  const byId = useMemo(() => new Map(project.tasks.map(task => [task.id, task])), [project.tasks]);
  const selectedPlot = layout.plots.find(plot => plot.taskId === selectedId && visible.has(plot.taskId));
  const selectedTask = selectedPlot ? byId.get(selectedPlot.taskId) : undefined;
  const fit = useCallback(() => {
    if (!viewport.width || !viewport.height) return;
    const zoom = Math.max(.12, Math.min(1.3, (viewport.width - 32) / layout.width, (viewport.height - 104) / layout.height));
    setCamera({ x: (viewport.width - layout.width * zoom) / 2, y: 54 + (viewport.height - 104 - layout.height * zoom) / 2, zoom });
  }, [layout.width, layout.height, viewport]);
  const zoomAt = useCallback((factor: number, anchorX?: number, anchorY?: number) => {
    setCamera(previous => {
      const zoom = Math.max(.12, Math.min(2.5, previous.zoom * factor));
      const x = anchorX ?? viewport.width / 2, y = anchorY ?? viewport.height / 2;
      return { zoom, x: x - (x - previous.x) * zoom / previous.zoom, y: y - (y - previous.y) * zoom / previous.zoom };
    });
  }, [viewport]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (!initialized.current && viewport.width) { initialized.current = true; fit(); } }, [viewport.width, fit]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoomAt]);
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || lastFocus.current === focusId || !viewport.width) return;
    const id = focusId.split("|")[1], plot = layout.plots.find(item => item.taskId === id);
    if (!plot) return;
    lastFocus.current = focusId; setSelectedId(id);
    setCamera(previous => { const zoom = Math.max(.85, previous.zoom); return { zoom, x: viewport.width / 2 - (plot.x + plot.width / 2) * zoom, y: viewport.height / 2 - (plot.y + plot.height / 2) * zoom }; });
  }, [focusId, layout.plots, viewport]);

  const taskPlots = layout.plots.filter(plot => !isTownLandmark(plot));
  const completed = taskPlots.filter(plot => plot.status === "done").length;
  const active = taskPlots.filter(plot => plot.status === "doing").length;
  const waiting = taskPlots.filter(plot => plot.status === "waiting").length;
  const planned = taskPlots.filter(plot => plot.status === "todo").length;
  const landmarks = layout.plots.length - taskPlots.length;
  const residents = townResidentCount(taskPlots.length);
  const completedTasks = project.tasks.filter(task => task.status === "done").length;
  const progress = project.tasks.length ? Math.round(completedTasks / project.tasks.length * 100) : 0;
  const selectedPriority = selectedTask?.priority ?? "none";

  return <section className="town-view" aria-label={language === "zh" ? "城市经营视图" : "Task town view"}>
    <div className="town-stage" ref={stage} tabIndex={0} aria-label={language === "zh" ? "小镇地图：拖动平移，滚轮缩放，方向键移动" : "Town map: drag to pan, scroll to zoom, arrow keys to move"} data-dragging={dragging}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const delta: Record<string, [number, number]> = { ArrowLeft: [64, 0], ArrowRight: [-64, 0], ArrowUp: [0, 64], ArrowDown: [0, -64] };
        if (delta[event.key]) { event.preventDefault(); const [dx, dy] = delta[event.key]; setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy })); }
        if (event.key === "+" || event.key === "=") zoomAt(1.2);
        if (event.key === "-") zoomAt(1 / 1.2);
        if (event.key === "Escape") setSelectedId(null);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        stage.current?.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, camera, moved: false };
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 4) { drag.current.moved = true; setDragging(true); }
        if (drag.current.moved) setCamera({ ...drag.current.camera, x: drag.current.camera.x + dx, y: drag.current.camera.y + dy });
      }}
      onPointerUp={event => {
        if (!drag.current) return;
        if (!drag.current.moved) setSelectedId(null);
        drag.current = null; setDragging(false);
        if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
    >
      <TownMapCanvas layout={layout} visible={visible} camera={camera} width={viewport.width} height={viewport.height} paused={paused} />
      <div className="town-world" style={{ width: layout.width, height: layout.height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, "--town-label-size": `${Math.min(16, 11 / camera.zoom)}px` } as React.CSSProperties}>
        {layout.districts.map((district, index) => {
          const districtTasks = district.memberIds.map(id => byId.get(id)).filter(Boolean);
          const districtDone = districtTasks.filter(task => task!.status === "done").length;
          return <div key={district.id} className="town-district" data-district-id={district.id} data-depth={district.depth}
            style={{ left: district.x, top: district.y + 24, width: district.width, height: district.height - 8, "--town-district-accent": `var(--town-district-${district.accent})` } as React.CSSProperties}>
            <span className="town-district-name" style={{ left: 192, top: -56 }}>
              <i>{String(index + 1).padStart(2, "0")}</i><span>{district.title}</span><b>{districtDone}/{districtTasks.length} {language === "zh" ? "完成" : "done"}</b>
            </span>
            <span className="town-district-entrance" aria-hidden="true">{language === "zh" ? "园区入口" : "Entrance"}</span>
          </div>;
        })}
        {layout.plots.filter(plot => visible.has(plot.taskId)).map(plot => {
          const task = byId.get(plot.taskId)!;
          const priority = task.priority ?? "none";
          return <button type="button" key={plot.taskId} className={`town-building ${selectedId === plot.taskId ? "is-selected" : ""} ${labels ? "show-name" : ""}`}
            style={{ left: plot.x, top: plot.y, width: plot.width, height: plot.height, "--town-status": TOWN_STATUS[task.status].color } as React.CSSProperties}
            data-task-id={task.id} data-status={task.status} data-construction-stage={townConstruction(plot).stage} data-level={plot.level} data-hierarchy-depth={plot.hierarchyDepth} data-building-kind={plot.kind} data-building-variant={plot.variant}
            title={`${task.title} · ${buildingName(plot)} · ${constructionText(plot).label} · ${language !== "zh" ? "Double-click for full task" : "双击查看完整任务"}`}
            aria-label={`${text.building}: ${task.title}`} aria-pressed={selectedId === task.id}
            onClick={() => setSelectedId(task.id)} onDoubleClick={() => actions.openDetails?.(task.id)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); actions.openDetails?.(task.id); } if (event.key === "Escape") setSelectedId(null); }}
          >
            <span className="town-selection" aria-hidden="true" />
            <span className="town-building-sign"><i className={`town-state state-${task.status}`}>{task.status === "done" ? <Check size={9} /> : task.status === "waiting" ? "Ⅱ" : ""}</i><span>{task.title}</span>{priority !== "none" && <b className={`town-priority priority-${priority}`} aria-label={`${priorities[priority]} ${text.priority}`}>⚑</b>}</span>
          </button>;
        })}
      </div>
    </div>

    <header className="town-hud">
      <div className="town-title"><span className="town-title-icon"><Trees size={21} /></span><div><span className="town-eyebrow">{taskPlots.length} {language === "zh" ? "个任务地块" : "TASK SITES"} · {landmarks} {language === "zh" ? "座地标" : "LANDMARK"}</span><h2>{project.title}</h2></div></div>
      <div className="town-census"><span><i className="town-live-dot" />{active} {language !== "zh" ? "under construction" : "处建设中"}</span><span>{completed} {language !== "zh" ? "completed" : "处已竣工"}</span><span>{waiting} {language !== "zh" ? "paused" : "处暂停施工"}</span><span>{planned} {language !== "zh" ? "not started" : "处待开工"}</span><span className="town-population"><Users size={13} />{residents} {text.residents}</span><strong title={language !== "zh" ? "Task completion" : "任务完成率"}>{progress}<small>%</small></strong></div>
    </header>

    <div className="town-controls" aria-label={language !== "zh" ? "Town map tools" : "小镇地图工具"}>
      <button type="button" onClick={() => zoomAt(1 / 1.2)} aria-label={language !== "zh" ? "Zoom out town" : "缩小小镇"} title={language !== "zh" ? "Zoom out" : "缩小"}><Minus size={16} /></button>
      <span className="town-zoom">{Math.round(camera.zoom * 100)}%</span>
      <button type="button" onClick={() => zoomAt(1.2)} aria-label={language !== "zh" ? "Zoom in town" : "放大小镇"} title={language !== "zh" ? "Zoom in" : "放大"}><Plus size={16} /></button>
      <i />
      <button type="button" onClick={fit} aria-label={language !== "zh" ? "Fit town" : "小镇全景"} title={language !== "zh" ? "Fit town" : "小镇全景"}><Maximize2 size={16} /></button>
      <button type="button" onClick={() => setLabels(value => !value)} aria-pressed={labels} aria-label={language !== "zh" ? "Show building names" : "显示建筑名称"} title={labels ? (language !== "zh" ? "Hide building names" : "隐藏建筑名称") : (language !== "zh" ? "Show building names" : "显示建筑名称")}>{labels ? <Eye size={16} /> : <EyeOff size={16} />}</button>
      <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? (language !== "zh" ? "Resume town animation" : "继续小镇动画") : (language !== "zh" ? "Pause town animation" : "暂停小镇动画")} title={paused ? (language !== "zh" ? "Resume animation" : "继续动画") : (language !== "zh" ? "Pause animation" : "暂停动画")}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
    </div>

    {!selectedTask && <div className="town-map-note"><Compass size={14} /><span>{language !== "zh" ? <>To do is the foundation · in progress is construction · done is completed<br />Drag to explore · scroll to zoom · double-click a building for its task</> : <>待办是地基 · 进行中建造 · 完成后竣工<br />拖动探索 · 滚轮缩放 · 双击建筑打开任务</>}</span></div>}
    {!visible.size && <div className="town-no-match" role="status">{language !== "zh" ? "No matching task buildings" : "没有符合筛选条件的任务建筑"}</div>}

    {selectedTask && selectedPlot && <aside className="town-inspector" aria-label={language !== "zh" ? "Building task details" : "建筑任务详情"}>
      <button type="button" className="town-inspector-close" onClick={() => setSelectedId(null)} aria-label={text.close}><X size={16} /></button>
      <div className="town-inspector-kind"><MapPin size={12} />{buildingName(selectedPlot)}<span>LEVEL {selectedPlot.level}</span></div>
      <h3>{selectedTask.title}</h3>
      <div className="town-inspector-meta"><span><i style={{ background: TOWN_STATUS[selectedTask.status].color }} />{statusText(language)[selectedTask.status]}</span>{selectedPriority !== "none" && <span className={`town-priority priority-${selectedPriority}`}>{priorities[selectedPriority]} {text.priority}</span>}{selectedTask.due && <span>{selectedTask.due}</span>}</div>
      <div className="town-construction-stage" data-stage={townConstruction(selectedPlot).stage}><strong>{constructionText(selectedPlot).label}</strong><span>{constructionText(selectedPlot).description}</span></div>
      {selectedTask.description && <p>{selectedTask.description}</p>}
      <div className="town-inspector-progress"><span>{language !== "zh" ? "District progress" : "街区筹备"}</span><b>{selectedPlot.completed} / {selectedPlot.total}</b><i><em style={{ width: `${selectedPlot.completed / selectedPlot.total * 100}%` }} /></i></div>
      <div className="town-inspector-actions"><button type="button" onClick={() => onLocate(selectedTask.id)}><MapPin size={13} />{text.locateOnMap}</button><button type="button" onClick={() => actions.openDetails?.(selectedTask.id)}>{text.fullTask}<ArrowUpRight size={14} /></button></div>
    </aside>}
    <a className="town-credits" href="/assets/ai-town/SOURCES.md" target="_blank" rel="noreferrer">AI Town · {language === "zh" ? "素材署名" : "Asset credits"}</a>
  </section>;
}
