import { isSameOrigin } from "@/lib/request-origin";
import { SearchError } from "@/lib/search-service";
import { readMCPNote } from "@/lib/xhs-mcp";
export async function POST(request:Request) {
  if(!isSameOrigin(request))return Response.json({error:"请求来源不匹配"},{status:403});
  try {
    const text=await request.text();if(text.length>3000)throw new SearchError("笔记链接过长",400);
    const {url}=JSON.parse(text);
    return Response.json(await readMCPNote(url,request.signal),{headers:{"Cache-Control":"no-store"}});
  }catch(error) {return Response.json({error:error instanceof SearchError?error.message:"无法读取笔记，请打开原文查看"},{status:error instanceof SearchError?error.status:502});}
}
