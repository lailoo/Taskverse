import { addTask, deleteTask, moveTask, placeTaskBeside, setTaskStatus, updateTask } from "./tasks";
import type { Project } from "./types";
import { STATUSES, PRIORITIES, type Priority, type Status, type Task } from "./types";
import { validFollowUps, type FollowUp } from "./chat-follow-ups";
import { normalizeMemoryPatch, normalizeSummary, type ConversationMemoryPatch } from "./conversation-memory";

export type Suggestion = {
  title: string;
  parentId: string;
  description: string;
  owner: string;
  due: string;
};
export type AIChange =
  | { type: "add"; parentId: string; title: string; description: string; owner: string; due: string; priority?: Priority }
  | { type: "update"; taskId: string; title?: string; description?: string; owner?: string; due?: string; priority?: Priority }
  | { type: "move"; taskId: string; parentId: string }
  | { type: "reorder"; taskId: string; targetId: string; placement: "before" | "after" }
  | { type: "delete"; taskId: string }
  | { type: "status"; taskId: string; status: Status };
export type AIReply = { reply: string; tasks: Suggestion[]; changes?: AIChange[]; followUps?: FollowUp[]; summary?: string; memory?: ConversationMemoryPatch };

function optionalString(value: unknown, max: number, name: string) {
  if (value !== undefined && (typeof value !== "string" || value.length > max)) throw new Error(`AI ${name}格式不正确`);
  return value as string | undefined;
}

function validDue(value: string) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

function parseChange(item: unknown, project: Project): AIChange {
  if (!item || typeof item !== "object") throw new Error("AI 画布变更格式不正确");
  const change = item as Record<string, unknown>;
  if (typeof change.type !== "string") throw new Error("AI 画布变更缺少类型");
  if (change.type === "add") {
    if (typeof change.parentId !== "string" || typeof change.title !== "string") throw new Error("AI 新任务变更缺少父节点或标题");
    if (!project.tasks.some(task => task.id === change.parentId)) throw new Error("AI 新任务父节点不存在");
    const optionalText = (key: string, max: number) => {
      const value = change[key];
      if (value === undefined || value === null) return "";
      if (typeof value !== "string" || value.length > max) throw new Error("AI 新任务变更字段格式不正确");
      return value;
    };
    const description = optionalText("description", 3000);
    const owner = optionalText("owner", 80);
    const due = optionalText("due", 10);
    const priority = change.priority === undefined || change.priority === null ? undefined : String(change.priority) as Priority;
    if (priority !== undefined && !PRIORITIES.includes(priority)) throw new Error("AI 优先级不正确");
    const title = String(change.title).trim();
    if (!title || title.length > 160 || !validDue(due)) throw new Error("AI 新任务内容或日期不正确");
    return { type: "add", parentId: String(change.parentId), title, description, owner, due, ...(priority ? { priority } : {}) };
  }
  const taskId = change.taskId;
  if (typeof taskId !== "string" || !project.tasks.some(task => task.id === taskId)) throw new Error("AI 变更任务不存在");
  if (change.type === "move") {
    if (typeof change.parentId !== "string" || !project.tasks.some(task => task.id === change.parentId)) throw new Error("AI 移动目标不存在");
    return { type: "move", taskId, parentId: change.parentId };
  }
  if (change.type === "reorder") {
    if (typeof change.targetId !== "string" || !project.tasks.some(task => task.id === change.targetId)) throw new Error("AI 排序目标不存在");
    if (change.targetId === taskId || !["before", "after"].includes(String(change.placement))) throw new Error("AI 排序位置不正确");
    return { type: "reorder", taskId, targetId: change.targetId, placement: change.placement as "before" | "after" };
  }
  if (change.type === "delete") {
    if (!project.tasks.find(task => task.id === taskId)?.parentId) throw new Error("AI 不能删除根节点");
    return { type: "delete", taskId };
  }
  if (change.type === "status") {
    if (!STATUSES.includes(change.status as Status)) throw new Error("AI 状态不正确");
    return { type: "status", taskId, status: change.status as Status };
  }
  if (change.type === "update") {
    const priority = change.priority === undefined ? undefined : String(change.priority) as Priority;
    if (priority !== undefined && !PRIORITIES.includes(priority)) throw new Error("AI 优先级不正确");
    const result: AIChange = { type: "update", taskId };
    for (const key of ["title", "description", "owner", "due"] as const) {
      const value = optionalString(change[key], key === "title" ? 160 : key === "description" ? 3000 : key === "owner" ? 80 : 10, key);
      if (key === "title" && value !== undefined && !value.trim()) throw new Error("AI 任务名称不能为空");
      if (key === "due" && value !== undefined && !validDue(value)) throw new Error("AI 日期格式不正确");
      if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
    if (priority !== undefined) result.priority = priority;
    return result;
  }
  throw new Error("AI 画布变更类型不支持");
}

export function parseAIReply(raw: unknown, project: Project): AIReply {
  if (!raw || typeof raw !== "object") throw new Error("AI 返回格式不正确");
  const data = raw as Record<string, unknown>;
  if (
    typeof data.reply !== "string" ||
    !data.reply.trim() ||
    data.reply.length > 16000 ||
    !Array.isArray(data.tasks) ||
    data.tasks.length > 30
  )
    throw new Error("AI 返回格式不正确");
  const tasks = data.tasks.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("AI 任务格式不正确");
    const task = item as Record<string, unknown>;
    for (const key of ["title", "parentId", "description", "owner", "due"])
      if (typeof task[key] !== "string") throw new Error("AI 任务缺少必要字段");
    const result = task as Suggestion;
    if (
      !result.title.trim() ||
      result.title.length > 160 ||
      result.description.length > 3000 ||
      result.owner.length > 80 ||
      !project.tasks.some((t) => t.id === result.parentId)
    )
      throw new Error("AI 任务内容或所属分支不正确");
    if (
      result.due &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(result.due) ||
        !Number.isFinite(Date.parse(result.due)) ||
        new Date(result.due).toISOString().slice(0, 10) !== result.due)
    )
      throw new Error("AI 日期格式不正确");
    return {
      title: result.title.trim(),
      parentId: result.parentId,
      description: result.description,
      owner: result.owner,
      due: result.due,
    };
  });
  const rawChanges = data.changes === undefined ? [] : data.changes;
  if (!Array.isArray(rawChanges) || rawChanges.length > 50) throw new Error("AI 画布变更数量不正确");
  const changes = rawChanges.map(item => parseChange(item, project));
  const summary = data.summary === undefined ? undefined : normalizeSummary(data.summary);
  const memory = data.memory === undefined ? undefined : normalizeMemoryPatch(data.memory);
  return { reply: data.reply, tasks, ...(data.changes !== undefined ? { changes } : {}), ...(validFollowUps(data.followUps) ? { followUps: data.followUps } : {}), ...(summary !== undefined ? { summary } : {}), ...(memory !== undefined ? { memory } : {}) };
}

export function applySuggestions(
  project: Project,
  suggestions: Suggestion[],
): Project {
  const checked = parseAIReply(
    { reply: "新增任务", tasks: suggestions },
    project,
  );
  let tasks = project.tasks;
  for (const suggestion of checked.tasks) {
    if (
      tasks.some(
        (task) =>
          task.parentId === suggestion.parentId &&
          task.title.trim() === suggestion.title,
      )
    )
      continue;
    const result = addTask(tasks, suggestion.parentId, suggestion.title);
    tasks = result.tasks.map((task) =>
      task.id === result.id
        ? { ...task, ...suggestion, expanded: false }
        : task,
    );
  }
  return tasks === project.tasks ? project : { ...project, tasks };
}

/**
 * A suggestion has been handled when the same task still exists under its
 * original parent, or when a unique title match was moved/re-grouped later.
 * The latter keeps the AI queue from blocking after a canvas move changes the
 * parent id recorded in the original suggestion.
 */
export function suggestionIsHandled(project: Project, suggestion: Suggestion) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const title = normalize(suggestion.title);
  if (!title) return false;
  const matches = project.tasks.filter(task => normalize(task.title) === title);
  return matches.some(task => task.parentId === suggestion.parentId) || matches.length === 1;
}

export function applyAIChanges(project: Project, changes: AIChange[]) {
  const checked = changes.map(change => parseChange(change, project));
  let next = project;
  for (const change of checked) {
    if (change.type === "add") {
      const result = addTask(next.tasks, change.parentId, change.title);
      next = { ...next, tasks: result.tasks.map(task => task.id === result.id ? { ...task, description: change.description, owner: change.owner, due: change.due, ...(change.priority ? { priority: change.priority } : {}) } : task) };
    } else if (change.type === "update") {
      const patch = { ...change } as Partial<Task>;
      delete (patch as Record<string, unknown>).type;
      delete (patch as Record<string, unknown>).taskId;
      const target = next.tasks.find(task => task.id === change.taskId);
      next = {
        ...next,
        ...(target?.parentId === null && change.title !== undefined ? { title: change.title } : {}),
        tasks: updateTask(next.tasks, change.taskId, patch),
      };
    } else if (change.type === "move") {
      next = { ...next, tasks: moveTask(next.tasks, change.taskId, change.parentId) };
    } else if (change.type === "reorder") {
      next = { ...next, tasks: placeTaskBeside(next.tasks, change.taskId, change.targetId, change.placement) };
    } else if (change.type === "delete") {
      next = { ...next, tasks: deleteTask(next.tasks, change.taskId) };
    } else {
      next = { ...next, tasks: setTaskStatus(next.tasks, change.taskId, change.status) };
    }
  }
  return next;
}
