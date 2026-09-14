export const MEMORY_LIMITS = {
  summary: 6000,
  fact: 200,
  list: 20,
} as const;

export type ConversationMemory = {
  weddingDate: string;
  budget: string;
  preferences: string[];
  decisions: string[];
};
export type ConversationMemoryPatch = Partial<ConversationMemory>;

export const emptyMemory: ConversationMemory = {
  weddingDate: "",
  budget: "",
  preferences: [],
  decisions: [],
};

function fact(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > MEMORY_LIMITS.fact) throw new Error(`AI ${name}记忆格式不正确`);
  return value.trim();
}

function facts(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MEMORY_LIMITS.list || value.some(item => typeof item !== "string" || item.length > MEMORY_LIMITS.fact)) throw new Error(`AI ${name}记忆格式不正确`);
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

export function normalizeMemory(value: unknown): ConversationMemory {
  if (value === undefined || value === null) return { ...emptyMemory, preferences: [], decisions: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 记忆格式不正确");
  const input = value as Record<string, unknown>;
  const weddingDate = fact(input.weddingDate, "婚期") ?? "";
  const budget = fact(input.budget, "预算") ?? "";
  const preferences = facts(input.preferences, "偏好") ?? [];
  const decisions = facts(input.decisions, "决策") ?? [];
  return { weddingDate, budget, preferences, decisions };
}

export function normalizeMemoryPatch(value: unknown): ConversationMemoryPatch {
  if (value === undefined) return {};
  const normalized = normalizeMemory(value);
  const input = value as Record<string, unknown>;
  return {
    ...(input.weddingDate !== undefined ? { weddingDate: normalized.weddingDate } : {}),
    ...(input.budget !== undefined ? { budget: normalized.budget } : {}),
    ...(input.preferences !== undefined ? { preferences: normalized.preferences } : {}),
    ...(input.decisions !== undefined ? { decisions: normalized.decisions } : {}),
  };
}

export function mergeMemory(current: ConversationMemory | undefined, patch: ConversationMemoryPatch | undefined): ConversationMemory {
  const base = normalizeMemory(current);
  const next = normalizeMemoryPatch(patch);
  const mergeList = (old: string[], added?: string[]) => [...new Set([...old, ...(added || [])])].slice(0, MEMORY_LIMITS.list);
  return {
    weddingDate: next.weddingDate || base.weddingDate,
    budget: next.budget || base.budget,
    preferences: mergeList(base.preferences, next.preferences),
    decisions: mergeList(base.decisions, next.decisions),
  };
}

export function normalizeSummary(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > MEMORY_LIMITS.summary) throw new Error("AI 摘要格式不正确");
  return value.trim();
}
