const messages = {
  AI_IDLE_TIMEOUT: "AI 服务连续 120 秒未返回数据，连接已超时。已保留收到的内容，请重试。",
  AI_TIMEOUT: "AI 本次生成超过 10 分钟，已停止等待。已保留收到的内容，建议分批提问后重试。",
  AI_DISCONNECTED: "AI 连接中断，已保留收到的内容，请重试。",
  AI_OUTPUT_TRUNCATED: "AI 达到模型输出上限，回答未完成。已保留收到的内容，请减少本次任务数量后重试。",
  AI_INVALID_STREAM: "AI 服务返回了无效的流式数据。已保留收到的内容，请重试或检查接口兼容性。",
  AI_INVALID_RESPONSE: "AI 返回格式不符合任务协议，未应用任何变更。已保留收到的正文，请重试。",
  AI_PROVIDER_ERROR: "AI 服务未能完成生成。已保留收到的内容，请重试或检查模型配置。",
  AI_RESPONSE_TOO_LARGE: "AI 回复过长，已保留收到的内容。请减少本次任务数量后重试。",
  AI_CANCELLED: "已停止生成，已保留收到的内容。",
} as const;

export type AIErrorCode = keyof typeof messages;

export class AIError extends Error {
  constructor(public readonly code: AIErrorCode, detail?: string) {
    super(detail ? `${messages[code]}（${detail}）` : messages[code]);
    this.name = "AIError";
  }
}

// Never forward raw provider errors, JSON fragments or fetch URLs to the UI/log.
export function classifyAIError(error: unknown, signal?: AbortSignal): AIError {
  const cause = signal?.aborted ? signal.reason : error;
  if (cause instanceof AIError) return cause;
  if (cause instanceof Error && cause.name === "TimeoutError") return new AIError("AI_TIMEOUT");
  if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) return new AIError("AI_CANCELLED");
  return new AIError("AI_DISCONNECTED");
}
