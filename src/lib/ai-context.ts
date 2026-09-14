import { searchContextText, type SearchResult } from "./xhs-search";
type HistoryMessage = { role: "user" | "assistant"; content: string; interrupted?: boolean; search?: SearchResult };

// Bound repeated long reviews without changing the saved conversation or
// cutting task links/sentences in half. The latest user request is kept intact.
export function prepareAIHistory(messages: HistoryMessage[]) {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const search = message.role === "assistant" && message.search ? message.search : undefined;
    if (!message.content.trim() || (message.role === "assistant" && message.interrupted && !search)) continue;
    let content = message.interrupted ? "上轮已取得搜索资料，AI 正文未完成。" : message.content;
    if (search) content += searchContextText(search, Math.min(8000,16000-content.length));
    if (history.length >= 12 || characters + content.length > 24000) break;
    history.unshift({ role: message.role, content });
    characters += content.length;
  }
  // An assistant answer without its question is misleading context.
  while (history[0]?.role === "assistant") history.shift();
  return history;
}
