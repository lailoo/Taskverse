const requestNames: Record<string, string> = {
  "/api/chats": "聊天记录",
  "/api/ai": "AI",
  "/api/ai/settings": "模型设置",
  "/api/search": "小红书搜索",
  "/api/search/settings": "搜索设置",
  "/api/search/login": "小红书登录",
  "/api/search/note": "笔记读取",
};

function pause(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const finish = () => { signal?.removeEventListener("abort", cancel); resolve(); };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** Retry transport failures for reads only. A failed write may already have reached the server. */
export async function fetchLocal(url: string, options: RequestInit & { retryRead?: boolean } = {}): Promise<Response> {
  const { retryRead, ...init } = options;
  const method = (init.method || "GET").toUpperCase();
  const retry = retryRead ?? ["GET", "HEAD"].includes(method);
  for (let attempt = 0; ; attempt++) {
    init.signal?.throwIfAborted();
    try {
      return await fetch(url, init);
    } catch (error) {
      init.signal?.throwIfAborted();
      // HTTP errors are responses, not transport failures; keep their specific messages.
      const networkFailure = error instanceof TypeError && /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(error.message);
      if (!networkFailure) throw error;
      if (retry && attempt < 2) {
        await pause(400 * (attempt + 1), init.signal);
        continue;
      }
      const name = requestNames[url.split("?")[0]] || "页面";
      throw new Error(`无法连接本机服务，${name}${name === "AI" ? " " : ""}请求未完成。请稍后重试；若持续失败，请重新启动婚礼筹备服务。`, { cause: error });
    }
  }
}
