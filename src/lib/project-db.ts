import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { validateProject } from "./tasks";
import type { Project } from "./types";

export class ProjectConflict extends Error {}
export type ProjectVersionPreview = { id: string; revision: number; savedAt: string; title: string; tasks: { id: string; parentId: string | null; title: string; status: string; color: string }[] };
export class ProjectStore {
  private db: DatabaseSync;
  private backups: string;
  constructor(directory = path.join(process.cwd(), ".local")) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.backups = path.join(directory, "backups");
    mkdirSync(this.backups, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, "wedding.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL)",
    );
  }
  read(): {
    project: Project | null;
    revision: number;
    savedAt: string | null;
  } {
    const row = this.db
      .prepare("SELECT revision, data, saved_at FROM projects WHERE id=1")
      .get() as
      { revision: number; data: string; saved_at: string } | undefined;
    return row
      ? {
          project: validateProject(JSON.parse(row.data)),
          revision: row.revision,
          savedAt: row.saved_at,
        }
      : { project: null, revision: 0, savedAt: null };
  }
  save(input: unknown, expectedRevision: number) {
    const project = validateProject(input);
    this.db.exec("BEGIN IMMEDIATE");
    let next;
    try {
      const previous = this.read();
      if (previous.revision !== expectedRevision)
        throw new ProjectConflict(
          "其他页面已保存了更新，请先导出当前修改，再刷新加载最新项目。",
        );
      if (JSON.stringify(project) === JSON.stringify(previous.project)) {
        this.db.exec("COMMIT");
        return { revision: previous.revision, savedAt: previous.savedAt };
      }
      // Keep a complete pre-change snapshot outside SQLite for manual recovery.
      const filename = `project-${String(previous.revision).padStart(10, "0")}-${crypto.randomUUID()}.json`;
      const target = path.join(this.backups, filename);
      writeFileSync(
        `${target}.tmp`,
        JSON.stringify(previous.project ?? project),
        { mode: 0o600 },
      );
      renameSync(`${target}.tmp`, target);
      next = {
        revision: previous.revision + 1,
        savedAt: new Date().toISOString(),
      };
      this.db
        .prepare(
          "INSERT INTO projects(id,revision,data,saved_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,saved_at=excluded.saved_at",
        )
        .run(next.revision, JSON.stringify(project), next.savedAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    // Retention failure must not turn an already committed save into a retry.
    try {
      const files = readdirSync(this.backups)
        .filter((file) => /^project-\d{10}-[a-f0-9-]+\.json$/.test(file))
        .sort();
      for (const file of files.slice(0, Math.max(0, files.length - 30)))
        unlinkSync(path.join(this.backups, file));
    } catch {
      /* Keep extra backups if cleanup is temporarily unavailable. */
    }
    return next;
  }
  listVersions(): ProjectVersionPreview[] {
    return readdirSync(this.backups)
      .filter(file => /^project-\d{10}-[a-f0-9-]+\.json$/.test(file))
      .sort()
      .reverse()
      .map(file => {
        const project = validateProject(JSON.parse(readFileSync(path.join(this.backups, file), "utf8")));
        const stat = statSync(path.join(this.backups, file));
        return { id: file, revision: Number(file.slice(8, 18)), savedAt: stat.mtime.toISOString(), title: project.title, tasks: project.tasks.map(task => ({ id: task.id, parentId: task.parentId, title: task.title, status: task.status, color: task.color })) };
      });
  }
  readVersion(id: string): Project {
    if (!/^project-\d{10}-[a-f0-9-]+\.json$/.test(id)) throw new Error("版本标识无效");
    return validateProject(JSON.parse(readFileSync(path.join(this.backups, id), "utf8")));
  }
  close() {
    this.db.close();
  }
}
