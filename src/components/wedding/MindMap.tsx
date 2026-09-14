"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cardSize } from "@/lib/images";
import { adjacentNode, preserveSelection } from "@/lib/map-navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useReactFlow,
  applyNodeChanges,
  getNodesBounds,
  type Node,
  type NodeProps,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { planMapLayout, planTreeLayout } from "@/lib/map-layout";
import {
  Minus,
  Plus,
  Maximize,
  ScanLine,
  MousePointer2,
  Hand,
  LayoutGrid,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { type Task } from "@/lib/types";
import { childrenOf, ancestors, unfinishedTreeIds } from "@/lib/tasks";
import { TaskCard, type TaskActions } from "./TaskCard";
import { AxisEdge, RoadEdge } from "./AxisEdge";
import { RoadTrafficProvider } from "./RoadTraffic";
import { CloudSeaScene } from "./CloudSeaScene";
import { CloudControls, useCloudSettings } from "./CloudControls";
import { DesertScene } from "./DesertScene";
import { DesertControls, useDesertSettings } from "./DesertControls";
import { UI_TEXT, useAppLanguage, statusText } from "@/lib/i18n";

type Data = {
  task: Task;
  count: number;
  done: number;
  above: boolean;
  actions: TaskActions;
  dim: boolean;
  root: boolean;
  showOwner: boolean;
  tree: boolean;
  depth: number;
  lastChild: boolean;
  previewChange?: PreviewChangeKind;
};
type TaskNode = Node<Data, "task" | "treeTask">;

export type PreviewChangeKind = "added" | "updated" | "moved" | "status" | "deleted";

export type CanvasPreviewInfo = {
  kinds: Record<string, PreviewChangeKind>;
};

function previewClass(kind?: PreviewChangeKind) {
  return kind ? `preview-change preview-change-${kind}` : "";
}

function MapNode({ data, selected }: NodeProps<TaskNode>) {
  const scale = Math.max(1, Math.min(4, 1 + Math.floor(data.count / 3)));
  return (
    <div className={[data.dim ? "dimmed-node" : "", previewClass(data.previewChange)].filter(Boolean).join(" ")}>
      <span className={`city-building city-building-${scale}`} aria-label={`城市建筑等级 ${scale}`}><i /><i /><i /></span>
      <span className="node-arrival-ripple" aria-hidden="true" />
      {!data.root && (
        <Handle
          type="target"
          position={data.tree ? Position.Top : data.above ? Position.Bottom : Position.Top}
        />
      )}
      <TaskCard
        task={data.task}
        childrenCount={data.count}
        completedCount={data.done}
        selected={selected}
        showOwner={data.showOwner}
        {...data.actions}
      />
      <Handle
        type="source"
        id="branch"
        position={
          data.root
            ? data.tree ? Position.Bottom : Position.Right
            : data.above
              ? Position.Top
              : Position.Bottom
        }
      />
    </div>
  );
}
function TreeTextNode({ data, selected }: NodeProps<TaskNode>) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const done = data.task.status === "done";
  const hasChildren = data.count > 0;
  return (
    <div
      className={`tree-text-node ${selected ? "is-selected" : ""} ${done ? "is-done" : ""} ${data.dim ? "dimmed-node" : ""} ${previewClass(data.previewChange)}`}
      data-task-id={data.task.id}
      onDoubleClick={(event) => { event.stopPropagation(); data.actions.openDetails?.(data.task.id); }}
    >
      <button
        className="tree-task-check"
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? (language !== "zh" ? "Reopen" : "取消完成") : (language !== "zh" ? "Complete" : "完成")} ${text.task}: ${data.task.title}`}
        onClick={(event) => { event.stopPropagation(); data.actions.status(data.task.id, done ? "todo" : "done"); }}
      >
        {done ? "☑" : "☐"}
      </button>
      {hasChildren ? (
        <button
          className="tree-task-toggle"
          type="button"
          aria-expanded={!data.task.collapsed}
          aria-label={`${data.task.collapsed ? text.expand : text.collapse} ${language !== "zh" ? "subtasks" : "子任务"}: ${data.task.title}`}
          title={`${data.task.collapsed ? text.expand : text.collapse} ${language !== "zh" ? "subtasks" : "子任务"} (${data.count})`}
          onClick={(event) => { event.stopPropagation(); data.actions.patch(data.task.id, { collapsed: !data.task.collapsed }); }}
        >
          {data.task.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      ) : <span className="tree-task-toggle-spacer" aria-hidden="true" />}
      <span className="tree-task-branch" aria-hidden="true">{data.root ? "" : data.lastChild ? "└─ " : "├─ "}</span>
      <span className="tree-task-title">{data.task.title}</span>
    </div>
  );
}

function TreeOutline({ nodes, readOnlyPreview, onSelect }: { nodes: TaskNode[]; readOnlyPreview: boolean; onSelect: (id: string) => void }) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const ordered = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const tasks = nodes.map(node => node.data.task);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" | "inside" } | null>(null);
  const canDrop = (id: string, targetId: string) => id !== targetId && !ancestors(tasks, targetId).some(task => task.id === id);
  const getDropTarget = (event: React.DragEvent<HTMLDivElement>, target: TaskNode) => {
    if (!draggedId || !canDrop(draggedId, target.id)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const inside = target.data.root || offsetX > Math.min(150, rect.width * .42);
    if (inside) return { id: target.id, placement: "inside" as const };
    return { id: target.id, placement: event.clientY - rect.top < rect.height / 2 ? "before" as const : "after" as const };
  };
  const finishDrag = () => { setDraggedId(null); setDropTarget(null); };
  return (
    <div className="tree-outline" role="tree" aria-label="任务层级大纲">
      <div className="tree-outline-intro">
        <span className="tree-outline-kicker">{language !== "zh" ? "Task outline" : "任务大纲"}</span>
        <span>{language !== "zh" ? "Grouped by parent and child · drag right to nest · drag up or down to reorder · Enter adds a subtask · Shift+Enter adds a sibling · double-click for details" : "按父子关系排列 · 拖到右侧接入子任务 · 拖到上下调整顺序 · Enter 新增子任务 · Shift+Enter 新增同级 · 双击查看详情"}</span>
      </div>
      <div className="tree-outline-list">
        {ordered.map((node) => {
          const { task, depth, lastChild, root, actions, dim, count, previewChange } = node.data;
          const done = task.status === "done";
          const hasChildren = count > 0;
          const style = { "--tree-indent": `${depth * 28}px` } as CSSProperties;
          return (
            <div
              key={node.id}
              className={`tree-outline-row ${root ? "is-root" : ""} ${done ? "is-done" : ""} ${dim ? "dimmed-node" : ""} ${previewClass(previewChange)} ${draggedId === node.id ? "is-dragging" : ""} ${dropTarget?.id === node.id ? `drop-${dropTarget.placement}` : ""}`}
              data-task-id={node.id}
              data-depth={depth}
              data-priority={task.priority || "none"}
              role="treeitem"
              aria-level={depth + 1}
              aria-keyshortcuts="Enter Shift+Enter"
              tabIndex={0}
              style={style}
              onClick={(event) => {
                onSelect(node.id);
                event.currentTarget.focus({ preventScroll: true });
              }}
              onKeyDown={(event) => {
                if (readOnlyPreview || event.key !== "Enter" || event.nativeEvent.isComposing) return;
                const target = event.target as HTMLElement;
                if (target.closest(".tree-outline-check, .tree-outline-toggle")) return;
                if (event.shiftKey && !task.parentId) return;
                event.preventDefault();
                event.stopPropagation();
                actions.add(task.id, event.shiftKey);
              }}
              draggable={!readOnlyPreview && !root}
              onDragStart={(event) => {
                if (readOnlyPreview || root) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/task-id", node.id);
                setDraggedId(node.id);
              }}
              onDragOver={(event) => {
                if (!draggedId) return;
                const next = getDropTarget(event, node);
                if (!next) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(current => current?.id === next.id && current.placement === next.placement ? current : next);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setDropTarget(current => current?.id === node.id ? null : current);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedId || event.dataTransfer.getData("text/task-id");
                const target = getDropTarget(event, node);
                if (sourceId && target) {
                  if (target.placement === "inside") actions.move?.(sourceId, target.id);
                  else actions.reorder?.(sourceId, target.id, target.placement);
                  onSelect(sourceId);
                }
                finishDrag();
              }}
              onDragEnd={finishDrag}
            >
              <button
                className="tree-outline-check"
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={`${done ? "取消完成" : "完成"}任务：${task.title}`}
                disabled={readOnlyPreview}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!readOnlyPreview) actions.status(task.id, done ? "todo" : "done");
                }}
              >
                <span aria-hidden="true">{done ? "✓" : ""}</span>
              </button>
              {hasChildren ? (
                <button
                  className="tree-outline-toggle"
                  type="button"
                  aria-expanded={!task.collapsed}
                  aria-label={`${task.collapsed ? "展开" : "收起"}子任务：${task.title}`}
                  title={`${task.collapsed ? "展开" : "收起"}子任务（${count}）`}
                  disabled={readOnlyPreview}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!readOnlyPreview) actions.patch(task.id, { collapsed: !task.collapsed });
                  }}
                >
                  {task.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : <span className="tree-outline-toggle-spacer" aria-hidden="true" />}
              <span className="tree-outline-branch" aria-hidden="true">
                {root ? "●" : lastChild ? "└─" : "├─"}
              </span>
              <button
                className="tree-outline-title"
                type="button"
                title="双击打开任务详情"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  actions.openDetails?.(task.id);
                }}
              >
                {task.title}
              </button>
              <span className={`tree-outline-status status-${task.status}`}>
                <i aria-hidden="true" />
                {statusText(language)[task.status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const nodeTypes = { task: MapNode, treeTask: TreeTextNode };
const edgeTypes = { axis: AxisEdge, road: RoadEdge };
const dimensions = cardSize;

function makeLayout(
  tasks: Task[],
  actions: TaskActions,
  matches: Set<string> | null,
  unfinishedOnly: boolean,
  showOwner: boolean,
  layoutMode: "mindmap" | "tree",
  previewInfo?: CanvasPreviewInfo,
  cloudRailway = false,
): { nodes: TaskNode[]; edges: Edge[] } {
  const root = tasks.find((t) => !t.parentId)!;
  const included = unfinishedOnly ? unfinishedTreeIds(tasks) : null;
  const visible = tasks.filter(
    (t) =>
      (!included || included.has(t.id)) &&
      !ancestors(tasks, t.id).some((p) => p.collapsed),
  );
  const nodeSize = layoutMode === "tree"
    ? (task: Task) => ({ width: Math.min(420, Math.max(180, task.title.length * 16 + 64)), height: 34 })
    : dimensions;
  const treeLayout = layoutMode === "tree" ? planTreeLayout(tasks, visible, nodeSize) : null;
  const mapLayout = layoutMode === "mindmap" ? planMapLayout(tasks, visible, dimensions, cloudRailway ? "above" : "both") : null;
  const positions = treeLayout?.positions ?? mapLayout?.positions ?? new Map<string, { x: number; y: number }>();
  const sides = mapLayout?.sides ?? new Map<string, boolean>();
  const routeOffsets = mapLayout?.routeOffsets ?? new Map<string, number>();
  const mainTrafficTask = visible
    .filter((task) => layoutMode === "mindmap" && task.parentId === root.id)
    .sort((a, b) =>
      (positions.get(b.id)!.x + dimensions(b).width / 2) -
      (positions.get(a.id)!.x + dimensions(a).width / 2),
    )[0]?.id;
  return {
    nodes: visible.map((task) => ({
      id: task.id,
      type: layoutMode === "tree" ? "treeTask" : "task",
      position: positions.get(task.id)!,
      sourcePosition: layoutMode === "tree" ? Position.Bottom : task.id === root.id ? Position.Right : sides.get(task.id) ? Position.Top : Position.Bottom,
      targetPosition: layoutMode === "tree" ? Position.Top : sides.get(task.id) ? Position.Bottom : Position.Top,
      data: {
        task,
        showOwner,
        root: task.id === root.id,
        count: childrenOf(tasks, task.id).length,
        done: childrenOf(tasks, task.id).filter((t) => t.status === "done")
          .length,
        above: sides.get(task.id) ?? false,
        tree: layoutMode === "tree",
        depth: treeLayout?.depths?.get(task.id) ?? 0,
        lastChild: treeLayout?.lastChild?.get(task.id) ?? true,
        actions,
        dim: previewInfo ? !previewInfo.kinds[task.id] : matches !== null && !matches.has(task.id),
        previewChange: previewInfo?.kinds[task.id],
      },
      ...nodeSize(task),
      draggable: task.id !== root.id,
    })),
    edges: layoutMode === "tree" ? [] : visible
      .filter((t) => t.parentId)
      .map((task) => ({
        id: `${task.parentId}-${task.id}`,
        source: task.parentId!,
        target: task.id,
        sourceHandle: "branch",
        type: layoutMode === "mindmap" && task.parentId === root.id ? "axis" : "road",
        data: { status: task.status, mainTraffic: layoutMode === "mindmap" && task.id === mainTrafficTask, routeOffset: routeOffsets.get(task.parentId!), rootHeight: dimensions(root).height },
        zIndex: layoutMode === "mindmap" && task.id === mainTrafficTask ? 1 : 0,
        style: {
          stroke: `var(--status-${task.status}-ink)`,
          strokeWidth: 8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: previewInfo
            ? (previewInfo.kinds[task.id] ? 1 : 0.14)
            : matches && !matches.has(task.id) ? 0.2 : 1,
        },
      })),
  };
}

function Canvas({
  tasks,
  actions,
  matches,
  focusId,
  layoutKey,
  onPaneClick,
  onUndo,
  onRedo,
  unfinishedOnly,
  showOwner,
  readOnlyPreview = false,
  previewInfo,
  cloudRailway = false,
  desertGate = false,
}: {
  tasks: Task[];
  actions: TaskActions;
  matches: Set<string> | null;
  focusId: string | null;
  layoutKey: number;
  onPaneClick: () => void;
  onUndo: () => void;
  onRedo: () => void;
  unfinishedOnly: boolean;
  showOwner: boolean;
  readOnlyPreview?: boolean;
  previewInfo?: CanvasPreviewInfo;
  cloudRailway?: boolean;
  desertGate?: boolean;
}) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const scenic = cloudRailway || desertGate;
  const [layoutMode, setLayoutMode] = useState<"mindmap" | "tree">("mindmap");
  const [trafficPaused, setTrafficPaused] = useState(false);
  const cloudSettings = useCloudSettings();
  const desertSettings = useDesertSettings();
  const [pageHidden, setPageHidden] = useState(false);
  useEffect(() => {
    const update = () => setPageHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const layout = useMemo(
    () => makeLayout(tasks, actions, matches, unfinishedOnly, showOwner, layoutMode, previewInfo, scenic),
    [tasks, actions, matches, unfinishedOnly, showOwner, layoutMode, previewInfo, scenic],
  );
  const [nodes, setNodes] = useState<TaskNode[]>(layout.nodes);
  const nodeRef = useRef(nodes);
  nodeRef.current = nodes;
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutOffset = useRef({ x: 0, y: 0 });
  const [pan, setPan] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [arranged, setArranged] = useState(0);
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" | "inside" } | null>(null);
  const { fitView, zoomIn, zoomOut, setCenter, getViewport, setViewport, screenToFlowPosition } =
    useReactFlow<TaskNode>();
  const fitCanvas = useCallback((options: { padding?: number; maxZoom?: number; duration?: number } = {}) => {
    if (!scenic) return fitView(options);
    const frame = canvasRef.current;
    const root = nodeRef.current.find(node => node.data.root);
    if (!frame || !root) return Promise.resolve(false);
    const bounds = getNodesBounds(nodeRef.current);
    const padding = frame.clientWidth < 600 ? 20 : 64;
    const axisY = root.position.y + (root.height || 140) / 2;
    const scale = Math.max(.04, Math.min(
      options.maxZoom ?? .85,
      (frame.clientWidth - padding * 2) / Math.max(1, bounds.width),
      (frame.clientHeight * .68 - 48) / Math.max(1, axisY - bounds.y),
    ));
    return setViewport({
      x: (frame.clientWidth - bounds.width * scale) / 2 - bounds.x * scale,
      y: frame.clientHeight * .76 - axisY * scale,
      zoom: scale,
    }, { duration: options.duration ?? 0 });
  }, [scenic, desertGate, fitView, setViewport]);
  useEffect(() => {
    if (!arranged) return;
    const timer = setTimeout(() => setArranged(0), 2200);
    return () => clearTimeout(timer);
  }, [arranged]);
  const findDropTarget = (event: MouseEvent | TouchEvent, dragged: TaskNode) => {
    const pointer = "clientX" in event ? event : event.changedTouches[0];
    if (!pointer || dragged.data.root) return null;
    const point = screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    const target = nodeRef.current.find((node) =>
      node.id !== dragged.id &&
      !ancestors(tasks, node.id).some((ancestor) => ancestor.id === dragged.id) &&
      point.x >= node.position.x - 20 && point.x <= node.position.x + (node.width || 260) + 20 &&
      point.y >= node.position.y && point.y <= node.position.y + (node.height || 140),
    );
    if (!target) return null;
    const fraction = (point.x - target.position.x) / (target.width || 260);
    const canPlaceBeside = target.data.task.parentId !== null;
    const placement: "before" | "after" | "inside" = canPlaceBeside && fraction < 0.3 ? "before" : canPlaceBeside && fraction > 0.7 ? "after" : "inside";
    if (placement === "inside" && target.id === dragged.data.task.parentId) return null;
    return { id: target.id, placement };
  };
  useEffect(() => {
    const previous = new Map(nodeRef.current.map((n) => [n.id, n]));
    // Keep the edited node anchored while its siblings make room.
    const resized = layout.nodes.find(
      (n) =>
        previous.has(n.id) &&
        previous.get(n.id)!.data.task.expanded !== n.data.task.expanded,
    );
    const anchor = resized || layout.nodes.find((n) => !previous.has(n.id));
    const oldAnchor =
      anchor &&
      (previous.get(anchor.id) ||
        previous.get(anchor.data.task.parentId || ""));
    const newAnchor =
      anchor &&
      (previous.has(anchor.id)
        ? anchor
        : layout.nodes.find((n) => n.id === anchor.data.task.parentId));
    const dx =
      oldAnchor && newAnchor
        ? oldAnchor.position.x - newAnchor.position.x
        : layoutOffset.current.x;
    const dy =
      oldAnchor && newAnchor
        ? oldAnchor.position.y - newAnchor.position.y
        : layoutOffset.current.y;
    layoutOffset.current = { x: dx, y: dy };
    const target = layout.nodes.map((n) => ({
      ...n,
      selected: previous.get(n.id)?.selected,
      position: { x: n.position.x + dx, y: n.position.y + dy },
    }));
    // Tree rows are sorted by their y position. Interpolating those positions
    // frame by frame can temporarily swap adjacent rows and makes an expand /
    // collapse look like a jitter. Commit the stable order in one update.
    if (layoutMode === "tree") {
      setNodes((current) => preserveSelection(target, current));
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNodes((current) => preserveSelection(target, current));
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const t = Math.min(1, (time - start) / 280),
        eased = 1 - Math.pow(1 - t, 3);
      setNodes((current) =>
        preserveSelection(
          target.map((n) => {
            const from =
              previous.get(n.id)?.position ||
              { x: n.position.x, y: n.position.y + (n.data.above ? 8 : -8) };
            return {
              ...n,
              position: {
                x: from.x + (n.position.x - from.x) * eased,
                y: from.y + (n.position.y - from.y) * eased,
              },
            };
          }),
          current,
        ),
      );
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout]);
  useEffect(() => {
    if (layoutMode === "tree") return;
    if (focusId?.startsWith("ai|")) return;
    const timer = setTimeout(() => {
      void fitCanvas({
        padding: 0.16,
        maxZoom: 0.85,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 280,
      });
    }, 320);
    return () => clearTimeout(timer);
  }, [layoutKey, fitCanvas, layoutMode]);
  useEffect(() => {
    if (!focusId) return;
    const timer = setTimeout(() => {
      const reveal = focusId.startsWith("reveal|");
      const added = focusId.startsWith("new|");
      const aiAdded = focusId.startsWith("ai|");
      const id = focusId.split("|")[reveal || added || aiAdded ? 1 : 0];
      const node = nodeRef.current.find((n) => n.id === id);
      if (!node) return;
      if (!reveal) {
        setNodes((current) =>
          current.map((n) => ({ ...n, selected: n.id === id })),
        );
        if (!aiAdded && layoutMode !== "tree") canvasRef.current
          ?.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(id)}"]`,
          )
          ?.focus({ preventScroll: true });
      }
      if (layoutMode === "tree") {
        canvasRef.current
          ?.querySelector<HTMLElement>(`.tree-outline-row[data-task-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        return;
      }
      const viewport = getViewport();
      const stage = canvasRef.current;
      if (aiAdded && stage) {
        const bounds = stage.getBoundingClientRect();
        const chat = document.querySelector(".ai-chat")?.getBoundingClientRect();
        const availableWidth = chat && chat.left > bounds.left + 160
          ? Math.min(stage.clientWidth, chat.left - bounds.left - 16)
          : stage.clientWidth;
        const zoom = Math.min(Math.max(viewport.zoom, 0.65), 0.9, (availableWidth - 48) / (node.width || 260), (stage.clientHeight - 48) / (node.height || 140));
        void setViewport({
          zoom,
          x: availableWidth / 2 - (node.position.x + (node.width || 260) / 2) * zoom,
          y: stage.clientHeight / 2 - (node.position.y + (node.height || 140) / 2) * zoom,
        }, { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320 });
        return;
      }
      if (added && stage) {
        const left = node.position.x * viewport.zoom + viewport.x;
        const top = node.position.y * viewport.zoom + viewport.y;
        const width = (node.width || 340) * viewport.zoom;
        const height = (node.height || 560) * viewport.zoom;
        const dx = left < 24 ? 24 - left : Math.min(0, stage.clientWidth - 24 - left - width);
        const dy = top < 24 ? 24 - top : Math.min(0, stage.clientHeight - 24 - top - height);
        if (dx || dy) void setViewport(
          { ...viewport, x: viewport.x + dx, y: viewport.y + dy },
          { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240 },
        );
        return;
      }
      if (reveal && stage) {
        const x = node.position.x * viewport.zoom + viewport.x,
          y = node.position.y * viewport.zoom + viewport.y;
        if (
          x >= 20 &&
          y >= 20 &&
          x + (node.width || 340) * viewport.zoom < stage.clientWidth - 20 &&
          y + (node.height || 560) * viewport.zoom < stage.clientHeight - 20
        )
          return;
      }
      void setCenter(
        node.position.x + (node.width ?? 260) / 2,
        node.position.y + (node.height ?? 140) / 2,
        {
          zoom: reveal
            ? Math.min(
                viewport.zoom,
                stage ? (stage.clientHeight - 40) / (node.height || 560) : 1,
              )
            : Math.min(
                0.9,
                stage ? (stage.clientHeight - 40) / (node.height || 560) : 0.9,
              ),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 280,
        },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [focusId, setCenter, getViewport, setViewport, layoutMode]); // Focus only when a task is explicitly requested.
  const onChanges = (changes: NodeChange<TaskNode>[]) =>
    setNodes((current) => applyNodeChanges(changes, current));
  return (
    <div
      className={`canvas-shell ${readOnlyPreview ? "canvas-shell-preview" : ""}`}
      data-traffic-paused={scenic && (trafficPaused || readOnlyPreview || pageHidden || layoutMode === "tree")}
      ref={canvasRef}
      onKeyDownCapture={(event) => {
        if (event.altKey || event.nativeEvent.isComposing) return;
        const target = event.target as HTMLElement;
        if (
          target.closest(
            "input, textarea, select, button, a, [contenteditable], [role=dialog]",
          )
        )
          return;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) (event.shiftKey ? onRedo : onUndo)();
          return;
        }
        if (event.metaKey || event.ctrlKey) return;
        const id = target.closest<HTMLElement>(".react-flow__node")?.dataset.id;
        const task = tasks.find((task) => task.id === id);
        if (!task) return;
        if (
          ![
            "Tab",
            "F2",
            " ",
            "Delete",
            "Backspace",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
          ].includes(event.key)
        )
          return;
        if (event.key === "Tab" && event.shiftKey && !task.parentId) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (event.key.startsWith("Arrow")) {
          const next = adjacentNode(nodeRef.current, task.id, event.key);
          if (next) {
            setNodes((current) =>
              current.map((node) => ({
                ...node,
                selected: node.id === next.id,
              })),
            );
            canvasRef.current
              ?.querySelector<HTMLElement>(
                `.react-flow__node[data-id="${CSS.escape(next.id)}"]`,
              )
              ?.focus({ preventScroll: true });
          }
        } else if (event.key === "F2") {
          target
            .closest(".react-flow__node")
            ?.querySelector(".task-title")
            ?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
        } else if (event.key === " ")
          actions.status(task.id, task.status === "done" ? "todo" : "done");
        else if (event.key === "Delete" || event.key === "Backspace")
          actions.remove(task.id);
        else actions.add(task.id, event.shiftKey);
      }}
    >
      {cloudRailway && <CloudSeaScene settings={cloudSettings.settings} paused={trafficPaused || readOnlyPreview || pageHidden || layoutMode === "tree"} active={layoutMode === "mindmap"} />}
      {desertGate && layoutMode === "mindmap" && <DesertScene settings={desertSettings.settings} paused={trafficPaused || readOnlyPreview || pageHidden} />}
      {layoutMode === "tree" ? (
        <TreeOutline
          nodes={nodes}
          readOnlyPreview={readOnlyPreview}
          onSelect={(id) => setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))}
        />
      ) : <RoadTrafficProvider railway={cloudRailway} desert={desertGate} speedMultiplier={desertGate ? desertSettings.settings.caravanSpeed : cloudSettings.settings.trainSpeed} paused={scenic && (trafficPaused || readOnlyPreview)}>
      <ReactFlow<TaskNode>
        nodes={nodes.map((node) => ({ ...node, className: node.id === dropTarget?.id ? (dropTarget.placement === "inside" ? "reparent-target" : `reorder-${dropTarget.placement}`) : "" }))}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onChanges}
        nodesDraggable={!readOnlyPreview}
        nodesConnectable={false}
        nodeDragThreshold={6}
        onNodeDrag={readOnlyPreview ? undefined : (event, node) => setDropTarget(findDropTarget(event, node))}
        onNodeDragStop={(event, node) => {
          if (readOnlyPreview) return;
          const target = findDropTarget(event, node);
          setDropTarget(null);
          if (target && target.placement !== "inside" && actions.reorder) actions.reorder(node.id, target.id, target.placement);
          else if (target && actions.move) actions.move(node.id, target.id);
          else setNodes((current) => preserveSelection(layout.nodes.map((item) => ({
            ...item, position: { x: item.position.x + layoutOffset.current.x, y: item.position.y + layoutOffset.current.y },
          })), current));
        }}
        onPaneClick={readOnlyPreview ? undefined : onPaneClick}
        onNodeClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            !target.closest(
              "input, textarea, select, button, a, [contenteditable]",
            )
          ) {
            target
              .closest<HTMLElement>(".react-flow__node")
              ?.focus({ preventScroll: true });
          }
        }}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        fitView={!scenic}
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={scenic ? 0.04 : 0.12}
        maxZoom={1.6}
        panOnDrag={pan ? true : [1, 2]}
        selectionOnDrag={!pan}
        deleteKeyCode={null}
        attributionPosition="top-right"
      >
        {layoutMode === "mindmap" && !scenic && <Background
          variant={BackgroundVariant.Dots}
          color="var(--map-dot)"
          gap={22}
          size={1}
        />}
      </ReactFlow>
      </RoadTrafficProvider>}
      {!readOnlyPreview && <div className="canvas-toolbox">
        {layoutMode === "mindmap" && <>
          <button
            className={!pan ? "active" : ""}
            title={language !== "zh" ? "Select tasks" : "选择任务"}
            aria-label={language !== "zh" ? "Select tasks" : "选择任务"}
            onClick={() => setPan(false)}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            className={pan ? "active" : ""}
            title={language !== "zh" ? "Pan canvas" : "移动画布"}
            aria-label={language !== "zh" ? "Pan canvas" : "移动画布"}
            onClick={() => setPan(true)}
          >
            <Hand size={18} />
          </button>
          <span />
        </>}
        <button
          className={layoutMode === "tree" ? "active" : ""}
          title={layoutMode === "tree" ? (language !== "zh" ? "Layered tree · click to switch to mind map" : "当前：分层树状布局 · 点击切换脑图") : (language !== "zh" ? "Mind map · click to switch to layered tree" : "当前：脑图布局 · 点击切换分层树状")}
          aria-label={layoutMode === "tree" ? (language !== "zh" ? "Switch to mind map" : "切换为脑图布局") : (language !== "zh" ? "Switch to layered tree" : "切换为分层树状布局")}
          aria-pressed={layoutMode === "tree"}
          onClick={() => { setLayoutMode(mode => mode === "tree" ? "mindmap" : "tree"); setArranged(Date.now()); }}
        >
          <GitBranch size={18} />
        </button>
        {layoutMode === "mindmap" && <button
            title={language !== "zh" ? "Auto arrange; keep the selected task in place" : "自动整理；选中任务时保持当前位置，否则显示全图"}
            aria-label={language !== "zh" ? "Auto arrange" : "自动整理"}
          onClick={() => {
            const selected = nodeRef.current.find((node) => node.selected);
            const anchor = selected ||
              nodeRef.current.find((node) => node.data.root);
            const next = layout.nodes.find((node) => node.id === anchor?.id);
            const offset =
              anchor && next
                ? {
                    x: anchor.position.x - next.position.x,
                    y: anchor.position.y - next.position.y,
                  }
                : layoutOffset.current;
            layoutOffset.current = offset;
            setNodes((current) => preserveSelection(
              layout.nodes.map((node) => ({
                ...node,
                position: {
                  x: node.position.x + offset.x,
                  y: node.position.y + offset.y,
                },
              })), current,
            ));
            if (!selected) void fitCanvas({ padding: 0.16, maxZoom: 0.85, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280 });
            setArranged(Date.now());
          }}
        >
          <LayoutGrid size={18} />
        </button>}
      </div>}
      {readOnlyPreview && <div className="canvas-preview-banner" role="status"><span><i />{language !== "zh" ? "AI canvas preview · not applied" : "AI 脑图调整预览 · 尚未应用"}</span><small>{language !== "zh" ? <><b>Color</b> changed · <em>gray</em> unchanged · deleted items stay as ghosts</> : <><b>彩色</b>为变更 · <em>灰色</em>为未变更 · 删除项保留为幽灵卡片</>}</small></div>}
      {arranged > 0 && <div className="map-arrange-feedback" role="status">{language !== "zh" ? "Auto arranged" : "已自动整理"}</div>}
      {layoutMode === "mindmap" && <div className="canvas-zoom">
        {desertGate && <>
          <button title={trafficPaused ? "继续沙海驼队" : "暂停沙海驼队"} aria-label={trafficPaused ? "继续沙海驼队" : "暂停沙海驼队"}
            aria-pressed={trafficPaused} disabled={readOnlyPreview} onClick={() => setTrafficPaused(value => !value)}>
            {trafficPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          {!readOnlyPreview && <DesertControls settings={desertSettings.settings} onChange={desertSettings.update} saved={desertSettings.saved} />}
          <i />
        </>}
        {cloudRailway && <>
          <button
            title={trafficPaused ? "继续主轴列车" : "暂停主轴列车"}
            aria-label={trafficPaused ? "继续主轴列车" : "暂停主轴列车"}
            aria-pressed={trafficPaused}
            disabled={readOnlyPreview}
            onClick={() => setTrafficPaused(value => !value)}
          >
            {trafficPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          {!readOnlyPreview && <CloudControls settings={cloudSettings.settings} onChange={cloudSettings.update} saved={cloudSettings.saved} />}
          <i />
        </>}
        <button
          title={language !== "zh" ? "Zoom out" : "缩小"}
          aria-label={language !== "zh" ? "Zoom out" : "缩小"}
          onClick={() => void zoomOut({ duration: 200 })}
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          title={language !== "zh" ? "Zoom in" : "放大"}
          aria-label={language !== "zh" ? "Zoom in" : "放大"}
          onClick={() => void zoomIn({ duration: 200 })}
        >
          <Plus size={15} />
        </button>
        <i />
        <button
          title={language !== "zh" ? "Fit canvas" : "适应画布"}
          aria-label={language !== "zh" ? "Fit canvas" : "适应画布"}
          onClick={() =>
            void fitCanvas({ padding: 0.12, duration: 300, maxZoom: 1 })
          }
        >
          <ScanLine size={17} />
        </button>
        <button
          title={language !== "zh" ? "Focus center" : "聚焦中心"}
          aria-label={language !== "zh" ? "Focus center" : "聚焦中心"}
          onClick={() => void setCenter(115, 43, { zoom: 1, duration: 350 })}
        >
          <Maximize size={15} />
        </button>
      </div>}
      <div className="canvas-caption">
        <span className="live-dot" />
        {language !== "zh" ? "Wedding planning map" : "婚礼筹备地图"}
      </div>
    </div>
  );
}

export function MindMap(props: React.ComponentProps<typeof Canvas>) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
