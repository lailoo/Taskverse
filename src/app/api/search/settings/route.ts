import { getSearchConfig, publicSearchConfig, resolveSearchConfig, saveSearchConfig } from "@/lib/search-config";
import { SearchError, searchXiaohongshu } from "@/lib/search-service";
import { isSameOrigin } from "@/lib/request-origin";
import { mcpLoginStatus } from "@/lib/xhs-mcp";

export async function GET() {
  try { return Response.json(publicSearchConfig(await getSearchConfig()),{headers:{"Cache-Control":"no-store"}}); }
  catch { return Response.json({error:"无法读取搜索设置"},{status:500}); }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({error:"请求来源不匹配"},{status:403});
  try {
    const text = await request.text();
    if (text.length > 6000) throw new Error("搜索设置内容过长");
    const body = JSON.parse(text);
    if (body?.action !== "test" && body?.action !== "save") throw new Error("未知操作");
    const config = resolveSearchConfig(body,await getSearchConfig());
    if(config.provider === "xiaohongshu-mcp") {
      const status=await mcpLoginStatus(request.signal);
      if(!status.loggedIn)throw new SearchError("请先使用小红书 App 扫码登录，再保存设置",401);
    } else await searchXiaohongshu("婚礼布置",config.apiKey,request.signal);
    request.signal.throwIfAborted();
    if (body.action === "save") await saveSearchConfig(config);
    return Response.json({...publicSearchConfig(config),message:body.action === "save" ? "搜索连接测试通过，设置已保存" : "搜索服务连接成功"});
  } catch (error) {
    return Response.json({error:error instanceof SearchError ? error.message : error instanceof Error && !("code" in error) && !(error instanceof SyntaxError) ? error.message : "无法保存搜索设置，请检查输入后重试"},{status:error instanceof SearchError ? error.status : 400});
  }
}
