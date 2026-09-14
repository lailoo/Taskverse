import {
  getAIConfig,
  publicAIConfig,
  resolveAIConfig,
  saveAIConfig,
} from "@/lib/ai-config";
import { isSameOrigin } from "@/lib/request-origin";
export async function GET() {
  try {
    return Response.json(publicAIConfig(await getAIConfig()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "无法读取 AI 设置" }, { status: 500 });
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "请求来源不匹配" }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 12000) throw new Error("设置内容过长");
    const body = JSON.parse(text);
    if (body.action !== "test" && body.action !== "save") throw new Error("未知操作");
    const config = resolveAIConfig(body, await getAIConfig());
    {
      try {
        const result = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "user", content: 'Return JSON only: {"ok":true}' },
            ],
          }),
        });
        if (!result.ok)
          return Response.json(
            {
              error:
                result.status === 401
                  ? "密钥验证失败"
                  : result.status === 429
                    ? "额度不足或请求过于频繁"
                    : `连接失败（HTTP ${result.status}），请检查模型和接口地址`,
            },
            { status: 502 },
          );
        const data = await result.json();
        const content = JSON.parse(data.choices?.[0]?.message?.content || "");
        if (content.ok !== true) throw new Error();
        if (body.action === "test")
          return Response.json({ message: "连接成功，模型支持结构化回复" });
      } catch {
        return Response.json(
          { error: "测试超时或接口不支持 JSON 回复" },
          { status: 502 },
        );
      }
    }
    request.signal.throwIfAborted();
    await saveAIConfig(config);
    return Response.json({
      ...publicAIConfig(config),
      message: "连接测试通过，模型设置已保存",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && !("code" in error)
            ? error.message
            : "保存失败，请检查配置目录权限",
      },
      { status: 400 },
    );
  }
}
