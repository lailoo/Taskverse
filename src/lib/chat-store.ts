import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AIChange, Suggestion } from "./ai";
import { validFollowUps, type FollowUp } from "./chat-follow-ups";
import { normalizeMemory, normalizeSummary, type ConversationMemory } from "./conversation-memory";
import { validSearchResult, type SearchResult } from "./xhs-search";

export type ChatMessage = { role: "user" | "assistant"; content: string; reasoning?: string; interrupted?: boolean; search?: SearchResult; tasks?: Suggestion[]; added?: boolean; addedIndices?: number[]; skippedIndices?: number[]; changes?: AIChange[]; changesApplied?: boolean; followUps?: FollowUp[] };
export class ChatStore {
  private db: DatabaseSync;
  constructor(directory = path.join(process.cwd(), ".local")) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, "chats.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT NOT NULL, messages TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)");
    const columns = this.db.prepare("PRAGMA table_info(chats)").all() as { name: string }[];
    if (!columns.some(column => column.name === "summary")) this.db.exec("ALTER TABLE chats ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
    if (!columns.some(column => column.name === "memory")) this.db.exec("ALTER TABLE chats ADD COLUMN memory TEXT NOT NULL DEFAULT '{}'");
  }
  list() { return this.db.prepare("SELECT id, title, updated_at AS updatedAt FROM chats ORDER BY updated_at DESC").all(); }
  read(id: string) {
    const row = this.db.prepare("SELECT * FROM chats WHERE id=?").get(id) as { id: string; title: string; messages: string; revision: number; updated_at: string; summary: string; memory: string } | undefined;
    return row ? { id: row.id, title: row.title, messages: JSON.parse(row.messages), revision: row.revision, updatedAt: row.updated_at, summary: normalizeSummary(row.summary), memory: normalizeMemory(JSON.parse(row.memory)) } : null;
  }
  create() {
    const id = crypto.randomUUID();
    this.db.prepare("INSERT INTO chats (id,title,messages,updated_at) VALUES (?, ?, ?, ?)").run(id, "新会话", "[]", new Date().toISOString());
    return this.read(id)!;
  }
  save(id: string, messages: ChatMessage[], revision: number, summary?: string, memory?: unknown) {
    if (Array.isArray(messages) && messages.some(message => message?.followUps !== undefined && !validFollowUps(message.followUps))) throw new Error("后续建议格式不正确");
    if (!Array.isArray(messages) || messages.length > 1000 || messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 16000 || (m.tasks !== undefined && (!Array.isArray(m.tasks) || m.tasks.length > 30 || m.tasks.some(t => !t || [t.title,t.parentId,t.description,t.owner,t.due].some(v=>typeof v!=="string")))))) throw new Error("会话内容格式不正确");
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("会话版本不正确");
    if (messages.some(message => message.search !== undefined && (message.role !== "assistant" || !validSearchResult(message.search)))) throw new Error("搜索来源格式不正确");
    if (messages.some(message => (message.reasoning !== undefined && (message.role !== "assistant" || typeof message.reasoning !== "string" || message.reasoning.length > 32000)) || (message.interrupted !== undefined && (message.role !== "assistant" || typeof message.interrupted !== "boolean")))) throw new Error("思考内容或生成状态格式不正确");
    if (messages.some(message => message.addedIndices !== undefined && (!Array.isArray(message.addedIndices) || message.addedIndices.length > 30 || message.addedIndices.some(index => !Number.isInteger(index) || index < 0 || index >= (message.tasks?.length || 0))))) throw new Error("任务添加记录格式不正确");
    if (messages.some(message => message.skippedIndices !== undefined && (!Array.isArray(message.skippedIndices) || message.skippedIndices.length > 30 || message.skippedIndices.some(index => !Number.isInteger(index) || index < 0 || index >= (message.tasks?.length || 0))))) throw new Error("任务跳过记录格式不正确");
    if (messages.some(message => message.changes !== undefined && (!Array.isArray(message.changes) || message.changes.length > 50)) || messages.some(message => message.changesApplied !== undefined && (message.role !== "assistant" || typeof message.changesApplied !== "boolean"))) throw new Error("画布变更记录格式不正确");
    const current = this.read(id);
    const savedSummary = summary === undefined ? current?.summary || "" : normalizeSummary(summary);
    const savedMemory: ConversationMemory = memory === undefined ? current?.memory || normalizeMemory(undefined) : normalizeMemory(memory);
    const title = messages.find(m => m.role === "user")?.content.slice(0, 48) || "新会话";
    const result = this.db.prepare("UPDATE chats SET title=?,messages=?,summary=?,memory=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(title, JSON.stringify(messages), savedSummary, JSON.stringify(savedMemory), new Date().toISOString(), id, revision);
    if (!result.changes) throw new Error("会话已在其他窗口更新，请返回列表重新打开");
    return this.read(id)!;
  }
  close() { this.db.close(); }
}
