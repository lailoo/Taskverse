import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

export type AIConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};
const file = path.join(process.cwd(), ".local", "ai-config.json");
export async function getAIConfig(): Promise<AIConfig> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      provider: "custom",
      baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      apiKey: process.env.AI_API_KEY || "",
    };
  }
}
export function resolveAIConfig(raw: unknown, previous: AIConfig): AIConfig {
  if (!raw || typeof raw !== "object") throw new Error("设置格式无效");
  const value = raw as Record<string, unknown>;
  if (
    !["openai", "deepseek", "qwen", "custom"].includes(String(value.provider))
  )
    throw new Error("请选择服务商");
  if (
    typeof value.baseUrl !== "string" ||
    typeof value.model !== "string" ||
    typeof value.apiKey !== "string"
  )
    throw new Error("请填写完整设置");
  const url = new URL(value.baseUrl.trim());
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("接口地址必须使用 HTTPS，本机服务可用 HTTP");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("接口地址不能包含认证信息、查询参数或锚点");
  const baseUrl = url.toString().replace(/\/$/, "");
  if (baseUrl.endsWith("/chat/completions"))
    throw new Error("填写基础地址即可，不要包含 /chat/completions");
  const model = value.model.trim();
  if (!model || model.length > 160) throw new Error("请填写有效模型名称");
  const apiKey =
    value.apiKey.trim() ||
    (baseUrl === previous.baseUrl.replace(/\/$/, "") &&
    value.provider === previous.provider
      ? previous.apiKey
      : "");
  if (!apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey))
    throw new Error("请填写当前服务商的 API Key");
  return { provider: String(value.provider), baseUrl, model, apiKey };
}
export async function saveAIConfig(config: AIConfig) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(config), { mode: 0o600 });
  await rename(temporary, file);
}
export const publicAIConfig = ({ apiKey, ...config }: AIConfig) => ({
  ...config,
  keyConfigured: Boolean(apiKey),
});
