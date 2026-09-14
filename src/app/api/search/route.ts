import { getSearchConfig } from "@/lib/search-config";
import { searchXiaohongshu, SearchError } from "@/lib/search-service";
import { isSameOrigin } from "@/lib/request-origin";
import { searchMCP } from "@/lib/xhs-mcp";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({error:"请求来源不匹配"},{status:403});
  try {
    const text = await request.text();
    if (text.length > 3000) return Response.json({error:"搜索关键词过长"},{status:400});
    let input;
    try { input = JSON.parse(text); } catch { return Response.json({error:"搜索请求格式不正确"},{status:400}); }
    const config=await getSearchConfig();
    const result = config.provider === "xiaohongshu-mcp" ? await searchMCP(input?.query,request.signal,input?.sort,input?.noteType) : await searchXiaohongshu(input?.query, config.apiKey, request.signal);
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({error:error instanceof SearchError ? error.message : "搜索未完成，请重试"},{status:error instanceof SearchError ? error.status : 502});
  }
}
