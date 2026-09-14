import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { SearchProvider } from "./xhs-search";

type SearchConfig = { apiKey: string; provider?: SearchProvider };
const defaultDirectory = () => path.join(process.cwd(), ".local");
export async function getSearchConfig(directory = defaultDirectory()): Promise<SearchConfig> {
  try {
    const raw=JSON.parse(await readFile(path.join(directory,"search-config.json"),"utf8"));
    const storedKey=typeof raw?.apiKey === "string" && raw.apiKey.length <= 4096 && !/[\r\n]/.test(raw.apiKey) ? raw.apiKey : "";
    return resolveSearchConfig(raw,{apiKey:storedKey});
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { provider:process.env.TAVILY_API_KEY ? "tavily" : "xiaohongshu-mcp", apiKey: process.env.TAVILY_API_KEY || "" };
  }
}
export function resolveSearchConfig(raw: unknown, previous: SearchConfig): SearchConfig {
  const provider = raw && typeof raw === "object" ? (raw as {provider?:unknown}).provider : undefined;
  if(provider!==undefined && !["tavily","xiaohongshu-mcp"].includes(String(provider)))throw new Error("请选择有效的搜索方式");
  if(provider === "xiaohongshu-mcp")return {provider,apiKey:previous.apiKey};
  const value = raw && typeof raw === "object" ? (raw as { apiKey?: unknown }).apiKey : undefined;
  if (typeof value !== "string" || /[\r\n]/.test(value)) throw new Error("请填写有效的 Tavily API Key");
  const apiKey = value.trim() || previous.apiKey;
  if (!apiKey || apiKey.length > 4096) throw new Error("请填写有效的 Tavily API Key");
  return { apiKey,...(provider === "tavily" ? {provider} : {}) };
}
export const publicSearchConfig = (config: SearchConfig) => ({ provider:config.provider || "tavily", configured:config.provider === "xiaohongshu-mcp" || Boolean(config.apiKey) });
export async function saveSearchConfig(config: SearchConfig, directory = defaultDirectory()) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const file = path.join(directory,"search-config.json");
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(config),{mode:0o600});
  await rename(temporary,file);
}
