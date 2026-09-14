import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { isSameOrigin } from "@/lib/request-origin";
import { SearchError } from "@/lib/search-service";
import { mcpLoginQR, mcpLoginStatus } from "@/lib/xhs-mcp";

export async function POST(request: Request) {
  if(!isSameOrigin(request))return Response.json({error:"请求来源不匹配"},{status:403});
  try {
    const text=await request.text();if(text.length>200)throw new SearchError("请求过长",400);
    const {action}=JSON.parse(text);
    if(action==="start") {
      await promisify(execFile)(process.execPath,[path.join(process.cwd(),"scripts/start-xhs.mjs")],{cwd:process.cwd(),timeout:10000});
      return Response.json({message:"本地服务正在启动，首次准备浏览器可能需要几分钟，稍后点击检查登录。"});
    }
    if(!["status","qrcode"].includes(action))throw new SearchError("未知操作",400);
    const result=action==="qrcode" ? await mcpLoginQR(request.signal) : await mcpLoginStatus(request.signal);
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return Response.json({error:error instanceof SearchError ? error.message : "本地服务尚未就绪，请稍后重试或运行 npm run start:xhs"},{status:error instanceof SearchError ? error.status : 502});
  }
}
