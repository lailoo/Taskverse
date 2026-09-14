"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Eye, History, RotateCcw, X } from "lucide-react";
import { planMapLayout } from "@/lib/map-layout";
import type { Project, Task } from "@/lib/types";
import { UI_TEXT, useAppLanguage } from "@/lib/i18n";

type Version = { id: string; revision: number; savedAt: string; title: string; tasks: { id: string; parentId: string | null; title: string; status: string; color: string }[] };

const branchColors: Record<string, string> = {
  purple: "#8b78b8",
  blue: "#6f9fc8",
  mint: "#71a995",
  pink: "#c985a1",
  peach: "#d49a70",
  yellow: "#d1a653",
  coral: "#c98273",
};
const statusColors: Record<string, string> = {
  todo: "#aab2bd",
  doing: "#668bc2",
  waiting: "#c79a55",
  done: "#6ca37d",
};

function canvasTasks(version: Version): Task[] {
  return version.tasks.map(task => ({
    ...task,
    description: "",
    owner: "",
    due: "",
    priority: "none",
    budget: 0,
    link: "",
    image: "",
    images: [],
    expanded: false,
    collapsed: false,
  } as Task));
}

function Thumbnail({ version, large = false }: { version: Version; large?: boolean }) {
  const tasks = canvasTasks(version);
  const root = tasks.find(task => !task.parentId);
  if (!root) return <div className="version-thumbnail" aria-hidden="true" />;
  const { positions } = planMapLayout(tasks, tasks, () => ({ width: 64, height: 22 }));
  const points = tasks.map(task => positions.get(task.id) || { x: 0, y: 0 });
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x + 64));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y + 22));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(1, (large ? 82 : 52) / width, (large ? 54 : 32) / height);
  const place = (point: { x: number; y: number }) => ({
    x: 3 + (point.x - minX) * scale,
    y: 3 + (point.y - minY) * scale,
  });
  return <div className="version-thumbnail" aria-hidden="true">
    <div className="version-canvas-graph">
      {tasks.filter(task => task.parentId).map(task => {
        const from = place(positions.get(task.parentId!) || { x: 0, y: 0 });
        const to = place(positions.get(task.id) || { x: 0, y: 0 });
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        return <i key={`edge-${task.id}`} className="version-canvas-edge" style={{ left: from.x + 4, top: from.y + 4, width: length, transform: `rotate(${Math.atan2(dy, dx)}rad)`, background: statusColors[task.status] || statusColors.todo }} />;
      })}
      {tasks.map(task => {
        const point = place(positions.get(task.id) || { x: 0, y: 0 });
        return <b key={task.id} className={`version-canvas-node ${task.parentId ? "" : "is-root"}`} title={task.title} style={{ left: point.x, top: point.y, background: branchColors[task.color] || branchColors.purple, borderColor: statusColors[task.status] || statusColors.todo }} />;
      })}
    </div>
    <span className="version-thumb-count">{version.tasks.length}</span>
  </div>;
}

export function VersionRail({ refreshKey, open, onClose, onRestore }: { refreshKey: number; open: boolean; onClose: () => void; onRestore: (project: Project, version: Version) => void }) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<{ project: Project; version: Version } | null>(null);
  const [loading, setLoading] = useState(false);
  const loadVersions = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/project?versions=1", { cache: "no-store" });
      if (response.ok) setVersions((await response.json()).versions || []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadVersions(); }, refreshKey ? 420 : 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey]);
  const openPreview = async (version: Version) => {
    const response = await fetch(`/api/project?version=${encodeURIComponent(version.id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setPreview({ project: data.project, version });
  };
  if (!open) return null;
  return <>
    <aside className="version-rail" aria-label={language !== "zh" ? "Project version timeline" : "项目版本时间线"}>
      <div className="version-rail-heading"><span><History size={15} /><em>{language !== "zh" ? "Versions" : "版本"}</em></span><small>{loading ? (language !== "zh" ? "Syncing" : "同步中") : `${versions.length} ${language !== "zh" ? "versions" : "个"}`}</small><button className="version-rail-toggle" aria-label={language !== "zh" ? "Close version timeline" : "关闭版本时间线"} title={language !== "zh" ? "Close version timeline" : "关闭版本时间线"} onClick={onClose}><X size={15} /></button></div>
      <div className="version-list">
        <div className="version-current"><span className="version-current-dot"><Check size={10} /></span><div><strong>{language !== "zh" ? "Current version" : "当前版本"}</strong><small>{language !== "zh" ? "Latest canvas" : "最新画布"}</small></div></div>
        {versions.map(version => <button key={version.id} className="version-item" aria-label={`预览版本 v${version.revision}`} onClick={() => void openPreview(version)}><Thumbnail version={version} /><span><strong>v{version.revision}</strong><small><Clock3 size={10} />{new Date(version.savedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span></button>)}
        {!versions.length && <p className="version-empty">{language !== "zh" ? "A version thumbnail appears after your first change." : "完成一次修改后，这里会出现版本缩略图。"}</p>}
      </div>
    </aside>
    {preview && <div className="version-preview-backdrop" onClick={() => setPreview(null)}><section className="version-preview" role="dialog" aria-label={`${language !== "zh" ? "Preview version" : "预览版本"} v${preview.version.revision}`} onClick={event => event.stopPropagation()}><header><span><Eye size={15} />{language !== "zh" ? "Version" : "版本"} v{preview.version.revision}</span><button className="icon-button" aria-label={text.close} onClick={() => setPreview(null)}><X size={16} /></button></header><p>{new Date(preview.version.savedAt).toLocaleString(language !== "zh" ? "en-US" : "zh-CN")} · {preview.project.tasks.length} {text.tasks}</p><div className="version-preview-map"><Thumbnail version={preview.version} large /><div className="version-preview-tree">{preview.project.tasks.slice(0, 18).map(task => <div key={task.id} className={`version-preview-task depth-${Math.min(3, preview.project.tasks.filter(parent => parent.id === task.parentId).length)}`}><i />{task.title}</div>)}</div></div><button className="primary-button" onClick={() => { onRestore(preview.project, preview.version); setPreview(null); }}><RotateCcw size={14} />{language !== "zh" ? "Restore this version" : "恢复此版本"}</button></section></div>}
  </>;
}
