import { normalizeSearchResults, type SearchResult } from "./xhs-search";

export class SearchError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function searchXiaohongshu(query: string, apiKey: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  if (typeof query !== "string" || !query.trim() || query.length > 300) throw new SearchError("请输入 1–300 字的搜索关键词", 400);
  if (!apiKey) throw new SearchError("请先在搜索设置中配置 Tavily API Key", 503);
  signal?.throwIfAborted();
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(25000)]);
  try {
    const response = await fetcher("https://api.tavily.com/search", {
      method: "POST", signal: combined, cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), include_domains: ["xiaohongshu.com"], search_depth: "basic", topic: "general", max_results: 8, include_answer: false, include_raw_content: false, include_images: false }),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new SearchError(response.status === 401 || response.status === 403 ? "搜索密钥验证失败，请检查搜索设置" : response.status === 429 || response.status === 432 ? "搜索额度不足或请求过于频繁，请稍后重试" : "搜索服务暂时不可用，请稍后重试");
    }
    // Bound provider responses without retaining full pages or large payloads.
    const reader = response.body?.getReader();
    if (!reader) throw new SearchError("搜索接口返回格式不正确");
    const decoder = new TextDecoder(); let text = "", bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 512000) { await reader.cancel(); throw new SearchError("搜索返回内容过大，请缩短关键词"); }
        text += decoder.decode(part.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    text += decoder.decode();
    let data;
    try { data = JSON.parse(text); } catch { throw new SearchError("搜索接口返回格式不正确"); }
    return { query: query.trim(), provider: "tavily", searchedAt: new Date().toISOString(), sources: normalizeSearchResults(data?.results) };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof SearchError) throw error;
    if (combined.aborted) throw new SearchError("搜索超时，请稍后重试", 504);
    throw new SearchError(error instanceof Error && error.message.includes("格式") ? error.message : "无法连接搜索服务，请检查网络后重试");
  }
}
