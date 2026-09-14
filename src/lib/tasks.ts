import {
  COLORS,
  STATUSES,
  PRIORITIES,
  type Priority,
  type Color,
  type Project,
  type Status,
  type Task,
} from "./types";

const blank = (
  id: string,
  parentId: string | null,
  title: string,
  color: Color,
): Task => ({
  id,
  parentId,
  title,
  color,
  description: "",
  owner: "",
  due: "",
  status: "todo",
  priority: "none",
  budget: 0,
  link: "",
  image: "",
  expanded: false,
  collapsed: false,
});

export function makeInitialProject(): Project {
  const groups: [string, string, Color, string[]][] = [
    ["venue", "场地与餐饮", "blue", ["整理候选场地", "预约看场与试菜"]],
    ["guests", "宾客与接待", "mint", ["整理双方宾客名单", "安排交通与住宿"]],
    ["style", "服装与造型", "pink", ["挑选婚纱与西装", "收集妆容与布置灵感"]],
    [
      "team",
      "婚礼服务团队",
      "purple",
      ["比较摄影与摄像方案", "确认主持与化妆档期"],
    ],
    ["ceremony", "仪式与当天", "peach", ["起草当天流程", "准备誓词与音乐"]],
    ["budget", "预算与付款", "yellow", ["讨论预算分配", "记录定金与尾款"]],
  ];
  const tasks = [blank("wedding", null, "我们的婚礼", "purple")];
  for (const [id, title, color, children] of groups) {
    tasks.push(blank(id, "wedding", title, color));
    children.forEach((name, i) =>
      tasks.push(blank(`${id}-${i + 1}`, id, name, color)),
    );
  }
  tasks.find((task) => task.id === "venue-1")!.image =
    "/images/wedding-table.jpg";
  return { title: "我们的婚礼", date: "", budget: 0, tasks };
}

export const childrenOf = (tasks: Task[], id: string): Task[] =>
  tasks.filter((task) => task.parentId === id);

export function unfinishedTreeIds(tasks: Task[]): Set<string> {
  const ids = new Set(
    tasks.filter((task) => !task.parentId).map((task) => task.id),
  );
  for (const task of tasks) {
    if (task.status === "done") continue;
    ids.add(task.id);
    for (const parent of ancestors(tasks, task.id)) ids.add(parent.id);
  }
  return ids;
}

export function descendants(tasks: Task[], id: string): Task[] {
  const seen = new Set([id]);
  const result: Task[] = [];
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    for (const child of childrenOf(tasks, queue[i])) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      queue.push(child.id);
      result.push(child);
    }
  }
  return result;
}

export function ancestors(tasks: Task[], id: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result: Task[] = [];
  const seen = new Set([id]);
  let parentId = byId.get(id)?.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    result.unshift(parent);
    parentId = parent.parentId;
  }
  return result;
}

function reconcile(tasks: Task[], ids: string[]): Task[] {
  let next = tasks;
  for (const id of ids) {
    const parent = next.find((task) => task.id === id);
    if (!parent) continue;
    const children = childrenOf(next, id);
    if (!children.length) continue;
    const status = children.every((task) => task.status === "done")
      ? "done"
      : parent.status === "done"
        ? "todo"
        : parent.status;
    if (status !== parent.status)
      next = next.map((task) => (task.id === id ? { ...task, status } : task));
  }
  return next;
}

export function setTaskStatus(
  tasks: Task[],
  id: string,
  status: Status,
): Task[] {
  const target = tasks.find((task) => task.id === id);
  if (!target) return tasks;
  const nested = new Set(descendants(tasks, id).map((task) => task.id));
  const next = tasks.map((task) => {
    if (task.id === id) return { ...task, status };
    if (nested.has(task.id) && status === "done") return { ...task, status };
    if (
      nested.has(task.id) &&
      target.status === "done" &&
      task.status === "done"
    )
      return { ...task, status: "todo" as const };
    return task;
  });
  return reconcile(
    next,
    ancestors(tasks, id)
      .reverse()
      .map((task) => task.id),
  );
}

export function updateTask(
  tasks: Task[],
  id: string,
  patch: Partial<Task>,
): Task[] {
  const { id: _id, parentId: _parentId, status, ...fields } = patch;
  const next = tasks.map((task) =>
    task.id === id ? { ...task, ...fields } : task,
  );
  return status === undefined ? next : setTaskStatus(next, id, status);
}

export function reorderTask(tasks: Task[], id: string, targetId: string, placement: "before" | "after"): Task[] {
  const task = tasks.find((item) => item.id === id);
  const target = tasks.find((item) => item.id === targetId);
  if (!task?.parentId || !target || task.parentId !== target.parentId) throw new Error("只能调整同级任务顺序");
  if (id === targetId) return tasks;
  const siblings = tasks.filter((item) => item.parentId === task.parentId && item.id !== id);
  siblings.splice(siblings.findIndex((item) => item.id === targetId) + (placement === "after" ? 1 : 0), 0, task);
  let index = 0;
  return tasks.map((item) => item.parentId === task.parentId ? siblings[index++] : item);
}

export function placeTaskBeside(tasks: Task[], id: string, targetId: string, placement: "before" | "after"): Task[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target?.parentId) throw new Error("根任务不能添加同级任务");
  if (id === targetId || ancestors(tasks, targetId).some((task) => task.id === id)) throw new Error("不能移动到自身的子树中");
  return reorderTask(moveTask(tasks, id, target.parentId), id, targetId, placement);
}

export function moveTask(tasks: Task[], id: string, parentId: string): Task[] {
  const task = tasks.find((item) => item.id === id);
  const parent = tasks.find((item) => item.id === parentId);
  if (!task || !parent) throw new Error("找不到任务");
  if (!task.parentId) throw new Error("根任务不能移动");
  const subtree = new Set([id, ...descendants(tasks, id).map((item) => item.id)]);
  if (subtree.has(parentId)) throw new Error("不能移动到自身或子任务下面");
  if (task.parentId === parentId) return tasks;
  const next = [
    ...tasks.filter((item) => !subtree.has(item.id)).map((item) => item.id === parentId ? { ...item, collapsed: false } : item),
    ...tasks.filter((item) => subtree.has(item.id)).map((item) => item.id === id ? { ...item, parentId } : item),
  ];
  return reconcile(next, [...ancestors(tasks, id).reverse().map((item) => item.id), parentId, ...ancestors(next, parentId).reverse().map((item) => item.id)]);
}

export function addTask(
  tasks: Task[],
  parentId: string,
  title = "新任务",
): { tasks: Task[]; id: string } {
  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) throw new Error("找不到父任务");
  if (tasks.length >= 500) throw new Error("任务数量不能超过 500 个");
  let id: string;
  do {
    id = `task-${globalThis.crypto.randomUUID()}`;
  } while (tasks.some((task) => task.id === id));
  const next = [
    ...tasks.map((task) =>
      task.id === parentId ? { ...task, collapsed: false } : task,
    ),
    blank(id, parentId, title, parent.color),
  ];
  return {
    id,
    tasks: reconcile(next, [
      parentId,
      ...ancestors(tasks, parentId)
        .reverse()
        .map((task) => task.id),
    ]),
  };
}

export function deleteTask(tasks: Task[], id: string): Task[] {
  const target = tasks.find((task) => task.id === id);
  if (!target || target.parentId === null) return tasks;
  const remove = new Set([
    id,
    ...descendants(tasks, id).map((task) => task.id),
  ]);
  return reconcile(
    tasks.filter((task) => !remove.has(task.id)),
    ancestors(tasks, id)
      .reverse()
      .map((task) => task.id),
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("项目或任务格式不正确");
  return value as Record<string, unknown>;
}
function string(
  value: unknown,
  name: string,
  max: number,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error(`${name}格式不正确或长度超限`);
  return value;
}
function date(value: unknown): string {
  const result = string(value, "日期", 10);
  if (!result) return result;
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    throw new Error("日期必须是有效的 YYYY-MM-DD");
  return result;
}
function amount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e12
  )
    throw new Error("预算必须是有效的非负数字");
  return value;
}
function url(value: unknown, image = false): string {
  if (image && typeof value === "string" && value.startsWith("data:")) {
    if (value.length > 1024 * 1024) throw new Error("每张图片不能超过 1 MB");
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0)
      throw new Error("图片必须为有效的 PNG、JPEG 或 WebP 数据");
    const bytes = atob(match[2]);
    const signature =
      match[1] === "png"
        ? bytes.startsWith("\x89PNG\r\n\x1a\n")
        : match[1] === "jpeg"
          ? bytes.startsWith("\xff\xd8\xff")
          : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
    if (!signature || btoa(bytes) !== match[2])
      throw new Error("图片内容与格式不匹配");
    return value;
  }
  const result = string(value, image ? "图片地址" : "链接", 2048);
  if (!result) return result;
  if (
    image &&
    /^\/images\/[a-zA-Z0-9_./-]+$/.test(result) &&
    !result.split("/").includes("..")
  )
    return result;
  try {
    const parsed = new URL(result);
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    )
      return result;
  } catch {
    /* Report a consistent validation message below. */
  }
  throw new Error(
    image
      ? "图片地址必须为 HTTP、HTTPS 或 /images/ 下的本地图片"
      : "链接必须为 HTTP 或 HTTPS 地址",
  );
}

export function validateProject(input: unknown): Project {
  const data = object(input);
  if (
    !Array.isArray(data.tasks) ||
    data.tasks.length < 1 ||
    data.tasks.length > 500
  )
    throw new Error("项目需要 1 至 500 个任务");
  const tasks: Task[] = data.tasks.map((value) => {
    const task = object(value);
    if (!STATUSES.includes(task.status as Status))
      throw new Error("任务状态不正确");
    const priority = task.priority === "normal" ? "none" : task.priority === "urgent" ? "high" : task.priority;
    if (
      priority !== undefined &&
      !PRIORITIES.includes(priority as Priority)
    )
      throw new Error("任务优先级不正确");
    if (typeof task.color !== "string" || !Object.hasOwn(COLORS, task.color))
      throw new Error("任务颜色不正确");
    if (
      typeof task.expanded !== "boolean" ||
      typeof task.collapsed !== "boolean"
    )
      throw new Error("任务展开状态不正确");
    return {
      id: string(task.id, "任务编号", 128, true),
      parentId:
        task.parentId === null
          ? null
          : string(task.parentId, "父任务编号", 128, true),
      title: string(task.title, "任务标题", 200, true),
      description: string(task.description, "任务描述", 10000),
      owner: string(task.owner, "负责人", 100),
      due: date(task.due),
      status: task.status as Status,
      ...(priority === undefined
        ? {}
        : { priority: priority as Priority }),
      color: task.color as Color,
      budget: amount(task.budget),
      link: url(task.link),
      image: url(task.image, true),
      ...(task.images === undefined ? {} : { images: imageList(task.images) }),
      expanded: task.expanded,
      collapsed: task.collapsed,
    };
  });
  const imagePayload = tasks.reduce(
    (total, task) =>
      total +
      task.image.length +
      (task.images?.reduce((size, image) => size + image.length, 0) ?? 0),
    0,
  );
  if (imagePayload > 40 * 1024 * 1024)
    throw new Error("项目图片总量不能超过 40 MB");
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) throw new Error("任务编号不能重复");
  if (tasks.filter((task) => task.parentId === null).length !== 1)
    throw new Error("项目必须有且仅有一个根任务");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    const seen = new Set([task.id]);
    let parentId = task.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) throw new Error("任务层级不能形成循环");
      const parent = byId.get(parentId);
      if (!parent) throw new Error("任务引用了不存在的父任务");
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }
  return {
    title: string(data.title, "项目标题", 200, true),
    date: date(data.date),
    budget: amount(data.budget),
    tasks,
  };
}

function imageList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12)
    throw new Error("每个任务最多添加 12 张图片");
  return value.map((image) => {
    const result = url(image, true);
    if (!result) throw new Error("图片地址不能为空");
    return result;
  });
}
