import { validateProject } from "./tasks";
import type { Project } from "./types";

const DATABASE = "wedding-map";
const STORE = "projects";
const KEY = "current";
const LEGACY_KEY = "wedding-map-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开本机存储"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("本机存储被其他页面占用，请关闭旧页面后重试"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function readStoredProject(): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(KEY);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("读取本机存储失败"));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("读取本机存储失败"));
    });
  } finally {
    database.close();
  }
}

async function loadBrowserProject(): Promise<Project | null> {
  const stored = await readStoredProject();
  if (stored !== undefined) return validateProject(stored);
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;
  const project = validateProject(JSON.parse(legacy));
  return project;
}

async function saveBrowserProject(project: Project): Promise<void> {
  const validated = validateProject(project);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("本机保存失败"));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("本机保存失败"));
      transaction.objectStore(STORE).put(validated, KEY);
    });
  } finally {
    database.close();
  }
}

let revision: number | null = null;
export async function loadProject(): Promise<Project | null> {
  const response = await fetch("/api/project", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法读取数据库");
  revision = data.revision;
  if (data.project) return validateProject(data.project);
  // Read legacy storage only when the server has no project; never overwrite it.
  const legacy = await loadBrowserProject();
  if (!legacy) return null;
  const migrated = await fetch("/api/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: legacy, revision }),
  });
  if (migrated.status === 409) return loadProject();
  const result = await migrated.json();
  if (!migrated.ok)
    throw new Error(result.error || "迁移到数据库失败，浏览器原记录保留");
  revision = result.revision;
  return legacy;
}

export async function saveProject(project: Project): Promise<void> {
  if (revision === null) throw new Error("请先加载服务端项目");
  const validated = validateProject(project);
  const response = await fetch("/api/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: validated, revision }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "本机保存失败");
  revision = data.revision;
  // A browser cache failure does not invalidate a successful durable database save.
  try {
    await saveBrowserProject(validated);
  } catch {
    /* SQLite is authoritative. */
  }
}
