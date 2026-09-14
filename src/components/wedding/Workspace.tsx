"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  Network,
  Columns3,
  Wallet,
  Search,
  Plus,
  Undo2,
  Redo2,
  Download,
  Upload,
  Settings2,
  X,
  ChevronRight,
  CheckCheck,
  Circle,
  CalendarDays,
  Menu,
  ArrowUpRight,
  Image as ImageIcon,
  Check,
  ListFilter,
  ListTodo,
  ArrowLeft,
  Sparkles,
  Building2,
  History,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { MindMap, type CanvasPreviewInfo, type PreviewChangeKind } from "./MindMap";
import { TaskCard, type TaskActions } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { loadProject, saveProject } from "@/lib/storage";
import {
  addTask,
  moveTask,
  placeTaskBeside,
  ancestors,
  childrenOf,
  deleteTask,
  descendants,
  makeInitialProject,
  setTaskStatus,
  updateTask,
  validateProject,
} from "@/lib/tasks";
import {
  COLORS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Project,
  type Status,
  type Task,
} from "@/lib/types";

import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import { AIChat } from "./AIChat";
import { AISettings } from "./AISettings";
import { PixelCouple } from "./PixelCouple";
import { applyAIChanges, applySuggestions, type AIChange } from "@/lib/ai";
import { CityView } from "./CityView";
import { VersionRail } from "./VersionRail";
import { APP_LANGUAGE_KEY, APP_LANGUAGES, LOCALE_BY_LANGUAGE, LanguageContext, UI_TEXT, isAppLanguage, statusText, type AppLanguage } from "@/lib/i18n";

type View = "map" | "board" | "city" | "budget";
type Confirmation = { title: string; body: string; action: () => void; defaultChoice?: "cancel" | "confirm" };

const previewKindRank: Record<PreviewChangeKind, number> = {
  updated: 1,
  status: 2,
  moved: 3,
  added: 4,
  deleted: 5,
};

function buildCanvasPreview(base: Project, preview: Project, changes: AIChange[]) {
  const kinds: Record<string, PreviewChangeKind> = {};
  const mark = (id: string, kind: PreviewChangeKind) => {
    const current = kinds[id];
    if (!current || previewKindRank[kind] > previewKindRank[current]) kinds[id] = kind;
  };
  for (const change of changes) {
    if (change.type === "add") continue;
    if (change.type === "delete") mark(change.taskId, "deleted");
    else if (change.type === "move" || change.type === "reorder") mark(change.taskId, "moved");
    else if (change.type === "status") mark(change.taskId, "status");
    else mark(change.taskId, "updated");
  }

  const baseById = new Map(base.tasks.map(task => [task.id, task]));
  const previewById = new Map(preview.tasks.map(task => [task.id, task]));
  const comparable = (task: Task) => [
    task.title,
    task.description,
    task.owner,
    task.due,
    task.priority ?? "none",
    task.budget,
    task.link,
    task.image,
    JSON.stringify(task.images ?? []),
  ].join("\u0001");
  for (const task of preview.tasks) {
    const before = baseById.get(task.id);
    if (!before) {
      mark(task.id, "added");
      continue;
    }
    if (before.parentId !== task.parentId) mark(task.id, "moved");
    else if (before.status !== task.status && comparable(before) === comparable(task)) mark(task.id, "status");
    else if (comparable(before) !== comparable(task)) mark(task.id, "updated");
  }
  for (const task of base.tasks) if (!previewById.has(task.id)) mark(task.id, "deleted");

  const previewIds = new Set(preview.tasks.map(task => task.id));
  const root = preview.tasks.find(task => !task.parentId) ?? base.tasks.find(task => !task.parentId);
  const deletedTasks = base.tasks
    .filter(task => !previewIds.has(task.id))
    .map(task => ({
      ...task,
      parentId: task.parentId && previewIds.has(task.parentId) ? task.parentId : root?.id ?? null,
      expanded: false,
      collapsed: false,
    }));
  return { info: { kinds }, deletedTasks };
}

export function Workspace() {
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [project, setProject] = useState<Project>(makeInitialProject);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("正在加载");
  const [view, setView] = useState<View>("map");
  const [unfinishedOnly, setUnfinishedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [branch, setBranch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("zh");
  const text = UI_TEXT[language];
  useEffect(() => {
    try {
      const stored = localStorage.getItem(APP_LANGUAGE_KEY);
      if (isAppLanguage(stored)) setLanguage(stored);
    } catch { /* optional preference */ }
  }, []);
  const changeLanguage = (next: AppLanguage) => {
    setLanguage(next);
    try { localStorage.setItem(APP_LANGUAGE_KEY, next); } catch { /* optional preference */ }
  };
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem("wedding-map-sidebar-collapsed") === "true"); } catch { /* optional preference */ }
  }, []);
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(value => {
      const next = !value;
      try { localStorage.setItem("wedding-map-sidebar-collapsed", String(next)); } catch { /* optional preference */ }
      return next;
    });
  };
  const [showBoardOwner, setShowBoardOwner] = useState(false);
  useEffect(() => {
    try {
      setShowBoardOwner(
        localStorage.getItem("wedding-map-show-board-owner") === "true",
      );
    } catch {
      /* Optional display preference. */
    }
  }, []);
  const changeShowBoardOwner = (show: boolean) => {
    setShowBoardOwner(show);
    try {
      localStorage.setItem("wedding-map-show-board-owner", String(show));
    } catch {
      setToast("显示设置已更新，但无法保存到本机");
    }
  };
  const [aiOpen, setAiOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [petCelebration, setPetCelebration] = useState(0);
  const [petsVisible, setPetsVisible] = useState(false);
  useEffect(() => {
    try { setPetsVisible(localStorage.getItem("wedding-map-pets") !== "false"); }
    catch { setPetsVisible(true); }
  }, []);
  const togglePets = () => {
    setPetsVisible(!petsVisible);
    try { localStorage.setItem("wedding-map-pets", String(!petsVisible)); }
    catch { setToast("宠物显示已切换，但无法保存到本机"); }
  };
  const [aiSettings, setAiSettings] = useState(false);
  const [aiSettingsTab, setAiSettingsTab] = useState<"model" | "search">("model");
  const [aiConfigVersion, setAiConfigVersion] = useState(0);
  type WorkspaceTheme = "warm" | "mist" | "glass" | "rose" | "graphite" | "cloud" | "desert";
  const [theme, setTheme] = useState<WorkspaceTheme>("rose");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wedding-map-theme");
      const next: WorkspaceTheme = saved === "cloud" ? "cloud" : "rose";
      setTheme(next);
      document.documentElement.dataset.theme = next;
    } catch {
      /* Theme storage is optional. */
    }
  }, []);
  const changeTheme = (next: WorkspaceTheme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("wedding-map-theme", next);
    } catch {
      setToast("主题已切换，但无法保存到本机");
    }
  };
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationChoice, setConfirmationChoice] = useState<"cancel" | "confirm">("cancel");
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const confirmConfirmationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const choice = confirmation?.defaultChoice ?? "cancel";
    setConfirmationChoice(choice);
    if (!confirmation) return;
    const frame = requestAnimationFrame(() => {
      (choice === "confirm" ? confirmConfirmationRef : cancelConfirmationRef).current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [confirmation]);
  const [toast, setToast] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [canvasPreview, setCanvasPreview] = useState<{
    project: Project;
    changes: AIChange[];
    info: CanvasPreviewInfo;
    deletedTasks: Task[];
  } | null>(null);
  const undoStack = useRef<Project[]>([]);
  const redoStack = useRef<Project[]>([]);
  const current = useRef(project);
  const importInput = useRef<HTMLInputElement>(null);
  const dragging = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadProject()
      .then((saved) => {
        if (!active) return;
        if (saved) {
          current.current = saved;
          setProject(saved);
        }
        setStorageReady(true);
      })
      .catch(() => {
        if (active) {
          setSaveState("存储读取失败，请导出备份");
          setToast(
            "项目加载或迁移失败，自动保存已暂停，原数据库与浏览器记录未覆盖。请刷新重试。",
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !storageReady) return;
    let active = true;
    setSaveState("正在保存");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(project));
    void saveQueue.current
      .then(() => {
        if (active) setSaveState("已保存到本机数据库");
      })
      .catch((error) => {
        if (active) {
          setSaveState("保存失败，请导出备份");
          setToast(error instanceof Error ? error.message : "保存失败");
        }
      });
    return () => {
      active = false;
    };
  }, [project, loaded, storageReady]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettings(false);
        setConfirmation(null);
        setSidebar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const commit = useCallback((transform: (p: Project) => Project) => {
    const previous = current.current;
    const next = transform(previous);
    if (next === previous) return;
    undoStack.current = [...undoStack.current.slice(-39), previous];
    redoStack.current = [];
    current.current = next;
    setProject(next);
    setCanvasPreview(null);
    setHistoryVersion((v) => v + 1);
  }, []);
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(current.current);
    current.current = previous;
    setProject(previous);
    setCanvasPreview(null);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(current.current);
    current.current = next;
    setProject(next);
    setCanvasPreview(null);
    setHistoryVersion((v) => v + 1);
  };
  const changeStatus = useCallback(
    (id: string, status: Status) => {
      const task = current.current.tasks.find((t) => t.id === id);
      if (!task) return;
      const nested = descendants(current.current.tasks, id);
      const run = () => {
        commit((p) => ({ ...p, tasks: setTaskStatus(p.tasks, id, status) }));
        if (status === "done" && task.status !== "done") setPetCelebration((value) => value + 1);
      };
      if (
        nested.length &&
        ((status === "done" && nested.some((t) => t.status !== "done")) ||
          (task.status === "done" && status !== "done"))
      ) {
        setConfirmation({
          title: status === "done" ? "一起完成子任务？" : "重新打开这组任务？",
          body: `“${task.title}”下有 ${nested.length} 个子任务。${status === "done" ? "它们将同时标记为已完成。" : "已完成的子任务将恢复为待办。"}`,
          action: run,
        });
      } else run();
    },
    [commit],
  );
  const actions = useMemo<TaskActions>(
    () => ({
      openDetails: setDetailTaskId,
      reorder: (id, targetId, placement) => {
        commit((project) => ({ ...project, tasks: placeTaskBeside(project.tasks, id, targetId, placement) }));
        setToast("已调整任务顺序，可撤销");
      },
      move: (id, parentId) => {
        commit((project) => ({ ...project, tasks: moveTask(project.tasks, id, parentId) }));
        setToast("已移动任务，可撤销");
      },
      patch: (id, patch) => {
        commit((p) => ({
          ...p,
          title:
            patch.title && p.tasks.find((t) => t.id === id)?.parentId === null
              ? patch.title
              : p.title,
          tasks: updateTask(p.tasks, id, patch),
        }));
        if (patch.expanded) setFocusId(`reveal|${id}|${Date.now()}`);
      },
      status: changeStatus,
      add: (id, sibling = false) => {
        const task = current.current.tasks.find((t) => t.id === id);
        const parentId = sibling ? task?.parentId : id;
        if (!parentId) return;
        try {
          const result = addTask(current.current.tasks, parentId);
          commit((p) => ({ ...p, tasks: result.tasks }));
          setFocusId(`new|${result.id}|${Date.now()}`);
          setToast(sibling ? "已添加同级任务" : "已添加子任务");
        } catch (error) {
          setToast(error instanceof Error ? error.message : "添加失败");
        }
      },
      remove: (id) => {
        const task = current.current.tasks.find((t) => t.id === id);
        if (!task?.parentId) return;
        const count = descendants(current.current.tasks, id).length;
        setConfirmation({
          title: "删除这个任务？",
          body: `将删除“${task.title}”${count ? `和它的 ${count} 个子任务` : ""}。删除后可以撤销。`,
          defaultChoice: "confirm",
          action: () => {
            commit((p) => ({ ...p, tasks: deleteTask(p.tasks, id) }));
            setFocusId(null);
          },
        });
      },
    }),
    [commit, changeStatus],
  );

  const collapseCards = useCallback(() => {
    setFocusId(null);
    commit((p) =>
      p.tasks.some((task) => task.expanded)
        ? {
            ...p,
            tasks: p.tasks.map((task) =>
              task.expanded ? { ...task, expanded: false } : task,
            ),
          }
        : p,
    );
  }, [commit]);

  const root = project.tasks.find((t) => !t.parentId)!;
  const branches = childrenOf(project.tasks, root.id);
  const leaves = project.tasks.filter(
    (t) => t.parentId && !childrenOf(project.tasks, t.id).length,
  );
  const completed = leaves.filter((t) => t.status === "done").length;
  const progress = leaves.length
    ? Math.round((completed / leaves.length) * 100)
    : 0;
  const matches = useMemo(() => {
    if (!query && !owner && !branch) return null;
    return new Set(
      project.tasks
        .filter(
          (t) =>
            (!query ||
              `${t.title} ${t.description} ${t.owner}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (!owner || t.owner === owner) &&
            (!branch ||
              t.id === branch ||
              ancestors(project.tasks, t.id).some((a) => a.id === branch)),
        )
        .map((t) => t.id),
    );
  }, [project.tasks, query, owner, branch]);
  const visibleTasks = project.tasks.filter(
    (t) =>
      t.parentId &&
      (!unfinishedOnly || t.status !== "done") &&
      (!matches || matches.has(t.id)),
  );
  const owners = [
    ...new Set([
      "我",
      "伴侣",
      "一起",
      "家人",
      "婚庆",
      ...project.tasks.map((t) => t.owner).filter(Boolean),
    ]),
  ];
  const days = project.date
    ? Math.ceil(
        (new Date(`${project.date}T00:00:00`).getTime() -
          new Date().setHours(0, 0, 0, 0)) /
          86400000,
      )
    : null;
  const costs = leaves.filter((t) => t.budget > 0);
  const allocated = costs.reduce((sum, t) => sum + t.budget, 0);
  const amount = (n: number) => new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language]).format(n);
  const selectBranch = (id: string) => {
    setBranch(id);
    if (id) {
      commit((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === root.id ? { ...t, collapsed: false } : t,
        ),
      }));
      setFocusId(id);
    }
    setSidebar(false);
  };
  const exportProject = () => {
    const projectToExport = current.current;
    const tasksById = new Map(projectToExport.tasks.map(task => [task.id, task]));
    const escapeCell = (value: unknown) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const depthOf = (task: Task) => {
      let depth = 0;
      let parentId = task.parentId;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        depth += 1;
        parentId = tasksById.get(parentId)?.parentId ?? null;
      }
      return depth;
    };
    const rows = projectToExport.tasks.map(task => {
      const parent = task.parentId ? tasksById.get(task.parentId) : undefined;
      const values = [
        depthOf(task),
        task.title,
        STATUS_LABELS[task.status],
        PRIORITY_LABELS[task.priority || "none"],
        task.owner,
        task.due,
        task.budget || "",
        task.description,
        parent?.title || "",
      ];
      return `<Row>${values.map((value, index) => `<Cell${index === 1 ? ' ss:StyleID="Title"' : ""}><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${escapeCell(value)}</Data></Cell>`).join("")}</Row>`;
    }).join("");
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8EDF3" ss:Pattern="Solid"/></Style><Style ss:ID="Title"><Font ss:Bold="1"/></Style></Styles>
  <Worksheet ss:Name="任务清单"><Table>
    <Row ss:StyleID="Header"><Cell><Data ss:Type="String">层级</Data></Cell><Cell><Data ss:Type="String">任务名称</Data></Cell><Cell><Data ss:Type="String">状态</Data></Cell><Cell><Data ss:Type="String">优先级</Data></Cell><Cell><Data ss:Type="String">负责人</Data></Cell><Cell><Data ss:Type="String">截止日期</Data></Cell><Cell><Data ss:Type="String">预算</Data></Cell><Cell><Data ss:Type="String">描述</Data></Cell><Cell><Data ss:Type="String">父任务</Data></Cell></Row>
    ${rows}
  </Table></Worksheet>
</Workbook>`;
    const blob = new Blob(["\ufeff", workbook], {
      type: "application/vnd.ms-excel",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `婚礼筹备任务表-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Excel 任务表已导出");
  };
  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 60_000_000) throw new Error("备份文件不能超过 60 MB");
      const next = validateProject(JSON.parse(await file.text()));
      setConfirmation({
        title: "导入这份婚礼计划？",
        body: `“${next.title}”包含 ${next.tasks.length} 个节点，将替换当前计划。可通过撤销恢复。`,
        action: () => {
          commit(() => next);
          setStorageReady(true);
          setBranch("");
          setQuery("");
          setOwner("");
          setLayoutKey((k) => k + 1);
          setToast("计划已导入");
        },
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "无法导入这份文件");
    }
    if (importInput.current) importInput.current.value = "";
  };

  return (
    <LanguageContext.Provider value={language}>
    <div className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-history={historyVersion}>
      {sidebar && (
        <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a className="brand" href="/" aria-label={`${text.home} home`}>
          <span className="brand-icon">
            <Heart size={21} />
          </span>
          <span>
            {text.home}<small>TASKVERSE</small>
          </span>
        </a>
        <div className="project-switch">
          <span className="project-initial">W</span>
          <div>
            <strong>{project.title}</strong>
            <small>{language === "zh" ? "私人筹备空间" : text.privateSpace}</small>
          </div>
          <button
            className="icon-button"
            title={text.settings}
            onClick={() => setSettings(true)}
          >
            <Settings2 size={15} />
          </button>
          <button
            className="icon-button sidebar-collapse-toggle"
            title={sidebarCollapsed ? (language !== "zh" ? "Expand sidebar" : "展开左侧导航") : (language !== "zh" ? "Collapse sidebar" : "折叠左侧导航")}
            aria-label={sidebarCollapsed ? (language !== "zh" ? "Expand sidebar" : "展开左侧导航") : (language !== "zh" ? "Collapse sidebar" : "折叠左侧导航")}
            onClick={toggleSidebarCollapsed}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
        <div className="nav-label">{text.myPlan}</div>
        <nav className="main-nav">
          <button
            className={view === "map" ? "active" : ""}
            onClick={() => {
              setView("map");
              setSidebar(false);
            }}
          >
            <Network size={18} />
            <span className="nav-text">{text.map}</span><span className="nav-count">{project.tasks.length}</span>
          </button>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => {
              setView("board");
              setSidebar(false);
            }}
          >
            <Columns3 size={18} />
            <span className="nav-text">{text.board}</span>
          </button>
          <button
            className={view === "city" ? "active" : ""}
            onClick={() => {
              setView("city");
              setSidebar(false);
            }}
          >
            <Building2 size={18} />
            <span className="nav-text">{text.city}</span>
          </button>
          <button
            className={view === "budget" ? "active" : ""}
            onClick={() => {
              setView("budget");
              setSidebar(false);
            }}
          >
            <Wallet size={18} />
            <span className="nav-text">{text.budget}</span>
          </button>
        </nav>
        <div className="nav-label branch-label">
          <span className="nav-text">{text.branch}</span>
          <button
            className="icon-button"
            title={text.addBranch}
            aria-label={text.addBranch}
            onClick={() => {
              actions.add(root.id);
              setView("map");
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="branch-nav">
          <button
            className={!branch ? "selected" : ""}
            onClick={() => selectBranch("")}
          >
            <span className="all-dot" />
            <span className="nav-text">{text.allTasks}</span><span>{leaves.length}</span>
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              className={branch === b.id ? "selected" : ""}
              onClick={() => selectBranch(b.id)}
            >
              <span
                className="branch-dot"
                style={{ background: COLORS[b.color].line }}
              />
              <span className="nav-text">{b.title}</span>
              <span>{descendants(project.tasks, b.id).length}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="wedding-cover"
            onClick={() => {
              setFocusId("venue-1");
              setView("map");
            }}
          >
            <img src="/images/wedding-table.jpg" alt={language !== "zh" ? "Wedding setup reference" : "婚礼布置参考"} />
            <span>
              <ImageIcon size={13} />
              {language !== "zh" ? "Our good day" : "属于我们的好日子"}
              <ArrowUpRight size={14} />
            </span>
          </button>
          <div className="sidebar-foot">
            <span className="avatar">我</span>
            <span>
              {language !== "zh" ? "My planning space" : "我的筹备空间"}<small>{language !== "zh" ? "Example plan · editable" : "示例计划 · 可自由修改"}</small>
            </span>
            <button
              className="icon-button"
              title={text.settings}
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setSidebar(true)}
            >
              <Menu size={19} />
            </button>
            <Heart size={15} />
            <span>{text.mySpace}</span>
            <ChevronRight size={13} />
            <strong>{project.title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              title={text.ai}
              aria-label={text.ai}
              aria-expanded={aiOpen}
              onClick={() => setAiOpen((value) => !value)}
            >
              <Sparkles size={18} />
            </button>
            <button
              className="icon-button"
              title={text.versions}
              aria-label={text.versions}
              aria-expanded={versionsOpen}
              onClick={() => setVersionsOpen((value) => !value)}
            >
              <History size={18} />
            </button>
            <span
              className={`save-state ${saveState.includes("失败") ? "save-error" : ""}`}
            >
              <span />
              {language !== "zh"
                ? saveState === "正在加载" ? "Loading"
                  : saveState === "正在保存" ? "Saving"
                    : saveState === "已保存到本机数据库" ? "Saved locally"
                      : saveState === "存储读取失败，请导出备份" ? "Storage read failed · export a backup"
                        : saveState === "保存失败，请导出备份" ? "Save failed · export a backup"
                          : saveState
                : saveState}
            </span>
            <button
              className="icon-button"
              title={text.import}
              aria-label={text.import}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={17} />
            </button>
            <button
              className="export-button"
              aria-label={language !== "zh" ? "Export Excel task table" : "导出 Excel 任务表"}
              title={language !== "zh" ? "Export Excel task table" : "导出 Excel 任务表"}
              onClick={exportProject}
            >
              <Download size={15} />
              <span>{text.export}</span>
            </button>
            <button
              className="avatar user-avatar"
              title="编辑婚礼信息"
              onClick={() => setSettings(true)}
            >
              我
            </button>
          </div>
        </header>
        <section className="workspace-heading">
          <div>
            <div className="heading-title">
              <h1>{view === "budget" ? text.budget : project.title}</h1>
              <button className="date-chip" onClick={() => setSettings(true)}>
                <CalendarDays size={13} />
                {project.date
                  ? `${project.date.replaceAll("-", ".")} · ${days! >= 0 ? (language !== "zh" ? `${days} days left` : `还有 ${days} 天`) : (language !== "zh" ? `${Math.abs(days!)} days ago` : `已过 ${Math.abs(days!)} 天`)}`
                  : text.pendingDate}
              </button>
            </div>
            <p>
              {view === "budget"
                ? text.budgetIntro
                : view === "city"
                  ? text.cityIntro
                : text.mapIntro}
            </p>
          </div>
          <div className="overall-progress">
            <div
              className="progress-ring"
              style={{ "--progress": `${progress}%` } as React.CSSProperties}
            >
              <span>{progress}%</span>
            </div>
            <div>
              <strong>
                {completed}
                <span> / {leaves.length} 项</span>
              </strong>
                <small>{text.progress}</small>
            </div>
          </div>
        </section>
        <div className="workspace-toolbar">
          <div className="view-tabs">
            <button
              className={view === "map" ? "active" : ""}
              onClick={() => setView("map")}
            >
              <Network size={16} />
              {text.map}
            </button>
            <button
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              <Columns3 size={16} />
              {text.board}
            </button>
            <button
              className={view === "city" ? "active" : ""}
              onClick={() => setView("city")}
            >
              <Building2 size={16} />
              {text.city}
            </button>
          </div>
          <div className="toolbar-separator" />
          <div className="history-buttons">
            <button
              className="icon-button"
              title="撤销"
              aria-label="撤销"
              disabled={!undoStack.current.length}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              title="重做"
              aria-label="重做"
              disabled={!redoStack.current.length}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <div className="toolbar-right">
            <label className="search-box">
              <Search size={15} />
              <input
                placeholder={text.search}
                aria-label={text.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  title={language !== "zh" ? "Clear search" : "清除搜索"}
                  onClick={() => setQuery("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <label className="owner-filter">
              <ListFilter size={15} />
              <select
                aria-label={language !== "zh" ? "Filter by owner" : "筛选负责人"}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">{text.owner}</option>
                {owners.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <button
              className="icon-button task-mode-toggle toolbar-task-action"
              aria-label={language !== "zh" ? "Show unfinished tasks only" : "只显示未完成任务"}
              aria-pressed={unfinishedOnly}
              title={unfinishedOnly
                ? "当前：未完成任务 · 点击显示全部任务"
                : "当前：全部任务 · 点击只显示未完成任务"}
              onClick={() => {
                setUnfinishedOnly((value) => !value);
                setFocusId(null);
              }}
            >
              <ListTodo size={18} />
            </button>
            <button
              className="primary-button toolbar-task-action"
              aria-label={language !== "zh" ? "New task" : "新任务"}
              title={language !== "zh" ? "New task" : "新任务"}
              onClick={() => actions.add(branch || root.id)}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        {matches && (
          <div className="filter-summary">
            <span>
              {branch
                ? branches.find((b) => b.id === branch)?.title
                : "筛选结果"}{" "}
              · {visibleTasks.length} 个任务
            </span>
            <button
              onClick={() => {
                setQuery("");
                setOwner("");
                setBranch("");
              }}
            >
              清除筛选
              <X size={12} />
            </button>
          </div>
        )}
        <div className="view-content">
          {!loaded ? (
            <div className="loading-state">{language !== "zh" ? "Opening planning map…" : "正在打开婚礼地图…"}</div>
          ) : view === "map" ? (
            <MindMap
              cloudRailway={theme === "cloud"}
              desertGate={theme === "desert"}
              showOwner={showBoardOwner}
              unfinishedOnly={canvasPreview ? false : unfinishedOnly}
              tasks={canvasPreview ? [...canvasPreview.project.tasks, ...canvasPreview.deletedTasks] : project.tasks}
              actions={actions}
              matches={canvasPreview ? null : matches}
              focusId={focusId}
              layoutKey={layoutKey}
              onPaneClick={collapseCards}
              onUndo={undo}
              onRedo={redo}
              readOnlyPreview={Boolean(canvasPreview)}
              previewInfo={canvasPreview?.info}
            />
          ) : view === "board" ? (
            <div className="kanban">
              <div
                className={`kanban-columns ${unfinishedOnly ? "unfinished-columns" : ""}`}
              >
                {STATUSES.filter((s) => !unfinishedOnly || s !== "done").map(
                  (s) => (
                    <section
                      key={s}
                      className={`kanban-column ${dragOver === s ? "drag-over" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(s);
                      }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = dragging.current;
                        if (id) actions.status(id, s);
                        dragging.current = null;
                        setDragOver(null);
                      }}
                    >
                      <div className="column-heading">
                        <h2>
                          <StatusBadge status={s} />
                        </h2>
                        <span className="column-count">
                          {visibleTasks.filter((t) => t.status === s).length}
                        </span>
                        <button
                          className="icon-button"
                          title={`添加${STATUS_LABELS[s]}任务`}
                          aria-label={`添加${STATUS_LABELS[s]}任务`}
                          onClick={() => {
                            try {
                              const result = addTask(
                                current.current.tasks,
                                branch || root.id,
                              );
                              commit((p) => ({
                                ...p,
                                tasks: setTaskStatus(
                                  result.tasks,
                                  result.id,
                                  s,
                                ),
                              }));
                            } catch (error) {
                              setToast(
                                error instanceof Error
                                  ? error.message
                                  : "添加失败",
                              );
                            }
                          }}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="column-tasks">
                        {visibleTasks
                          .filter((t) => t.status === s)
                          .map((t) => (
                            <div
                              key={t.id}
                              draggable={!t.expanded}
                              onDragStart={(e) => {
                                dragging.current = t.id;
                                e.dataTransfer.setData("text/plain", t.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                dragging.current = null;
                                setDragOver(null);
                              }}
                            >
                              <TaskCard
                                task={t}
                                childrenCount={
                                  childrenOf(project.tasks, t.id).length
                                }
                                completedCount={
                                  childrenOf(project.tasks, t.id).filter(
                                    (c) => c.status === "done",
                                  ).length
                                }
                                breadcrumb={ancestors(project.tasks, t.id)
                                  .map((p) => p.title)
                                  .join(" / ")}
                                mode="board"
                                showOwner={showBoardOwner}
                                {...actions}
                              />
                              <button
                                className="show-on-map"
                                onClick={() => {
                                  commit((p) => ({
                                    ...p,
                                    tasks: p.tasks.map((task) =>
                                      ancestors(p.tasks, t.id).some(
                                        (a) => a.id === task.id,
                                      )
                                        ? { ...task, collapsed: false }
                                        : task,
                                    ),
                                  }));
                                  setFocusId(t.id);
                                  setView("map");
                                }}
                              >
                                <Network size={12} />
                                {text.locateOnMap}
                                <ArrowUpRight size={11} />
                              </button>
                            </div>
                          ))}
                        {!visibleTasks.some((t) => t.status === s) && (
                          <div className="column-empty">
                            {s === "done" ? (
                              <CheckCheck size={24} />
                            ) : (
                              <Circle size={22} />
                            )}
                            <span>
                              {s === "done"
                                ? "期待第一个完成的小事"
                                : text.noTasks}
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                  ),
                )}
              </div>
            </div>
          ) : view === "city" ? (
            <CityView
              project={project}
              actions={actions}
              matches={matches}
              unfinishedOnly={unfinishedOnly}
              focusId={focusId}
              onLocate={(id) => {
                const parents = new Set(ancestors(current.current.tasks, id).map(task => task.id));
                commit(p => ({ ...p, tasks: p.tasks.map(task => parents.has(task.id) ? { ...task, collapsed: false } : task) }));
                setFocusId(`city|${id}|${Date.now()}`);
                setView("map");
              }}
            />
          ) : (
            <div className="budget-view">
              <div className="budget-totals">
                <div>
                  <span>{language !== "zh" ? "Budget limit" : "预算上限"}</span>
                  <strong>
                    {project.budget ? `¥ ${amount(project.budget)}` : (language !== "zh" ? "Not set" : "待设定")}
                  </strong>
                  <button onClick={() => setSettings(true)}>
                    {language !== "zh" ? "Edit budget" : "编辑预算"}
                    <Settings2 size={13} />
                  </button>
                </div>
                <div>
                  <span>{language !== "zh" ? "Planned · leaf tasks" : "已规划 · 末级任务"}</span>
                  <strong>¥ {amount(allocated)}</strong>
                  <small>{costs.length} {language !== "zh" ? "costs" : "项费用"}</small>
                </div>
                <div>
                  <span>
                    {project.budget && allocated > project.budget
                      ? (language !== "zh" ? "Over budget" : "超出预算")
                      : (language !== "zh" ? "Remaining" : "剩余可分配")}
                  </span>
                  <strong>
                    {project.budget
                      ? `¥ ${amount(Math.abs(project.budget - allocated))}`
                      : "—"}
                  </strong>
                  <small>{language !== "zh" ? "Parent costs are not double-counted" : "不重复累计父任务费用"}</small>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>{text.task}</th>
                    <th>{language !== "zh" ? "Branch" : "所属分支"}</th>
                    <th>{text.ownerLabel}</th>
                    <th>{language !== "zh" ? "Estimated cost" : "预计费用"}</th>
                    <th>{text.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks
                    .filter((t) => !childrenOf(project.tasks, t.id).length)
                    .map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button
                            onClick={() => {
                              actions.patch(t.id, { expanded: true });
                              commit((p) => ({
                                ...p,
                                tasks: p.tasks.map((task) =>
                                  ancestors(p.tasks, t.id).some(
                                    (a) => a.id === task.id,
                                  )
                                    ? { ...task, collapsed: false }
                                    : task,
                                ),
                              }));
                              setFocusId(t.id);
                              setView("map");
                            }}
                          >
                            {t.title}
                            <ArrowUpRight size={12} />
                          </button>
                        </td>
                        <td>
                          {ancestors(project.tasks, t.id).find(
                            (p) => p.parentId === root.id,
                          )?.title || (language !== "zh" ? "Uncategorized" : "未分类")}
                        </td>
                        <td>{t.owner || text.unassigned}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            aria-label={`${t.title} ${language !== "zh" ? "estimated cost" : "预计费用"}`}
                            value={t.budget || ""}
                            placeholder="0"
                            onChange={(e) =>
                              actions.patch(t.id, {
                                budget: Math.max(
                                  0,
                                  Math.min(
                                    100000000,
                                    Number(e.target.value) || 0,
                                  ),
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!visibleTasks.length && (
                <div className="column-empty">{text.noMatches}</div>
              )}
            </div>
          )}
        </div>
        <footer className="workspace-status">
          <span>
            <span className="live-dot" />
            {view === "map"
              ? "脑图视图"
              : view === "board"
                ? "看板视图"
                : view === "city"
                  ? "城市视图"
                : "预算视图"}
          </span>
          <span>
            {leaves.length} 个任务 · {completed} 个已完成
          </span>
          <button onClick={() => setSettings(true)}>
            <Settings2 size={12} />
            {text.settings}
          </button>
          <button type="button" onClick={togglePets} aria-label={petsVisible ? (language !== "zh" ? "Hide couple pets" : "隐藏情侣宠物") : (language !== "zh" ? "Show couple pets" : "显示情侣宠物")} title={petsVisible ? (language !== "zh" ? "Hide couple pets" : "隐藏情侣宠物") : (language !== "zh" ? "Show couple pets" : "显示情侣宠物")} aria-pressed={petsVisible}><Heart size={14} /></button>
        </footer>
      </main>
      <input
        ref={importInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void importProject(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            className="icon-button"
            title="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {petsVisible && <PixelCouple waiting={aiBusy} celebration={petCelebration} />}
      <AIChat
        onBusyChange={setAiBusy}
        onTaskClick={(id) => {
          if (!current.current.tasks.some(task => task.id === id)) return;
          const parents = new Set(ancestors(current.current.tasks, id).map(task => task.id));
          commit(project => ({ ...project, tasks: project.tasks.map(task => parents.has(task.id) ? { ...task, collapsed: false } : task) }));
          setQuery(""); setOwner(""); setBranch(""); setUnfinishedOnly(false);
          setView("map");
          if (window.innerWidth < 700) setAiOpen(false);
          setFocusId(`ai|${id}|${Date.now()}`);
        }}
        onSettings={(tab = "model") => { setAiSettingsTab(tab); setAiSettings(true); }}
        configVersion={aiConfigVersion}
        project={project}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onApply={(suggestions) => {
          const previous = current.current;
          const next = applySuggestions(previous, suggestions);
          const count = next.tasks.length - previous.tasks.length;
          if (count) {
            const previousIds = new Set(previous.tasks.map((task) => task.id));
            const added = next.tasks.filter((task) => !previousIds.has(task.id));
            const revealParents = new Set(added.flatMap((task) => ancestors(next.tasks, task.id).map((parent) => parent.id)));
            commit(() => ({ ...next, tasks: next.tasks.map((task) => revealParents.has(task.id) ? { ...task, collapsed: false } : task) }));
            setQuery("");
            setOwner("");
            setBranch("");
            setView("map");
            if (window.innerWidth < 700) setAiOpen(false);
            setFocusId(`ai|${added[0].id}|${Date.now()}`);
            setToast(`已添加 ${count} 个 AI 建议任务，可撤销`);
          }
          return count;
        }}
        onApplyChanges={(changes: AIChange[]) => {
          const previous = current.current;
          const next = applyAIChanges(previous, changes);
          if (next === previous || JSON.stringify(next) === JSON.stringify(previous)) return 0;
          const changedIds = changes.flatMap(change => "taskId" in change ? [change.taskId] : []);
          commit(() => next);
          setView("map");
          setQuery(""); setOwner(""); setBranch(""); setUnfinishedOnly(false);
          if (changedIds[0]) setFocusId(`ai-change|${changedIds[0]}|${Date.now()}`);
          setToast(`已应用 ${changes.length} 项脑图调整，生成新版本`);
          return changes.length;
        }}
        onPreviewChanges={(changes) => {
          if (!changes?.length) {
            setCanvasPreview(null);
            return;
          }
          try {
            const base = current.current;
            const rawPreview = applyAIChanges(base, changes);
            const focusIds = new Set<string>([
              ...rawPreview.tasks.filter(task => !base.tasks.some(item => item.id === task.id)).map(task => task.id),
              ...changes.flatMap(change => "taskId" in change ? [change.taskId] : []),
            ]);
            const reveal = new Set<string>();
            for (const id of focusIds) {
              for (const task of ancestors(rawPreview.tasks, id)) reveal.add(task.id);
              for (const task of ancestors(base.tasks, id)) if (rawPreview.tasks.some(item => item.id === task.id)) reveal.add(task.id);
            }
            const preview = {
              ...rawPreview,
              tasks: rawPreview.tasks.map(task => reveal.has(task.id) ? { ...task, collapsed: false } : task),
            };
            const { info, deletedTasks } = buildCanvasPreview(base, preview, changes);
            setCanvasPreview({ project: preview, changes, info, deletedTasks });
            setView("map");
          } catch (error) {
            setCanvasPreview(null);
            setToast(error instanceof Error ? error.message : "无法预览脑图调整");
          }
        }}
      />
      <VersionRail
        refreshKey={historyVersion}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        onRestore={(restored, version) => {
          setConfirmation({
            title: `恢复版本 v${version.revision}？`,
            body: `将用该版本的 ${restored.tasks.length} 个任务替换当前画布，可通过撤销恢复。`,
            action: () => {
              commit(() => restored);
              setView("map");
              setFocusId(null);
              setToast(`已恢复版本 v${version.revision}`);
            },
          });
        }}
      />
      {aiSettings && (
        <AISettings
          initialTab={aiSettingsTab}
          onClose={() => setAiSettings(false)}
          onSaved={() => setAiConfigVersion((version) => version + 1)}
        />
      )}
      {detailTaskId && project.tasks.some((task) => task.id === detailTaskId) && (
        <TaskDialog
          task={project.tasks.find((task) => task.id === detailTaskId)!}
          tasks={project.tasks}
          actions={actions}
          onClose={() => setDetailTaskId(null)}
        />
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="settings-title">{language !== "zh" ? "Project settings" : "我们的婚礼"}</h2>
              <button
                className="icon-button"
                aria-label={language !== "zh" ? "Close settings" : "关闭设置"}
                onClick={() => setSettings(false)}
              >
                <X size={19} />
              </button>
            </div>
            <form
              className="project-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const title = String(data.get("title")).trim() || "我们的婚礼";
                commit((p) => ({
                  ...p,
                  title,
                  date: String(data.get("date")),
                  budget: Math.max(0, Number(data.get("budget")) || 0),
                  tasks: updateTask(p.tasks, root.id, { title }),
                }));
                setSettings(false);
                setToast("婚礼信息已更新");
              }}
            >
              <label className="field-label">
                {language !== "zh" ? "Theme" : "界面主题"}
                <select
                  value={theme}
                  onChange={(event) => changeTheme(event.target.value as WorkspaceTheme)}
                >
                  <option value="rose">{language !== "zh" ? "Mist Rose · Soft UI" : "雾玫瑰 · Soft UI"}</option>
                  <option value="cloud">{language !== "zh" ? "Cloud Railway · Cloud Sea" : "云间列车 · 云海画布"}</option>
                  {/* Legacy themes stay addressable for old local projects and browser tests, but are not promoted in the picker. */}
                  <option hidden value="warm">暖黄 · Soft UI</option>
                  <option hidden value="mist">雾蓝 · Soft UI</option>
                  <option hidden value="graphite">石墨灰 · Neumorphism</option>
                  <option hidden value="glass">实景玻璃 · Skeuomorphic Glass</option>
                  <option hidden value="desert">沙海巨门 · 落日驼队</option>
                </select>
              </label>
              <label className="field-label">
                {text.language}
                <select value={language} onChange={(event) => changeLanguage(event.target.value as AppLanguage)}>
                  {APP_LANGUAGES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSettings(false);
                  setAiSettings(true);
                }}
              >
                <Settings2 size={14} /> {language !== "zh" ? "AI model settings" : "AI 模型设置"}
              </button>
              <label className="field-label">
                {language !== "zh" ? "Plan name" : "计划名称"}
                <input
                  name="title"
                  defaultValue={project.title}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label className="display-preference">
                <input
                  type="checkbox"
                  checked={showBoardOwner}
                  onChange={(event) =>
                    changeShowBoardOwner(event.target.checked)
                  }
                />
                {language !== "zh" ? "Show owners on task cards" : "任务卡片显示负责人"}
              </label>
              <label className="field-label">
                {language !== "zh" ? "Wedding date" : "婚礼日期"}
                <DateField
                  name="date"
                  label={language !== "zh" ? "Wedding date" : "婚礼日期"}
                  defaultValue={project.date}
                />
              </label>
              <label className="field-label">
                {language !== "zh" ? "Total budget · CNY" : "总预算 · 元"}
                <input
                  name="budget"
                  type="number"
                  min="0"
                  max="100000000"
                  defaultValue={project.budget || ""}
                  placeholder={language !== "zh" ? "Not set" : "待定"}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSettings(false)}
                >
                  {text.cancel}
                </button>
                <button type="submit" className="primary-button">
                  {text.save}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {confirmation && (
        <div className="modal-backdrop" onClick={() => setConfirmation(null)}>
          <section
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                setConfirmationChoice("cancel");
                cancelConfirmationRef.current?.focus();
              } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                setConfirmationChoice("confirm");
                confirmConfirmationRef.current?.focus();
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (confirmationChoice === "confirm") confirmation.action();
                setConfirmation(null);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setConfirmation(null);
              }
            }}
          >
            <div className="modal-heading">
              <h2 id="confirm-title">{confirmation.title}</h2>
              <button
                className="icon-button"
                aria-label={language !== "zh" ? "Close confirmation" : "关闭确认"}
                onClick={() => setConfirmation(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p>{confirmation.body}</p>
            <div className="modal-actions">
              <button
                ref={cancelConfirmationRef}
                className="secondary-button"
                autoFocus={confirmationChoice === "cancel"}
                data-keyboard-selected={confirmationChoice === "cancel"}
                onClick={() => setConfirmation(null)}
              >
                取消
              </button>
              <button
                ref={confirmConfirmationRef}
                className="primary-button"
                autoFocus={confirmationChoice === "confirm"}
                data-keyboard-selected={confirmationChoice === "confirm"}
                onClick={() => {
                  confirmation.action();
                  setConfirmation(null);
                }}
              >
                {text.confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
    </LanguageContext.Provider>
  );
}
