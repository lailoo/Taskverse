import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeMCPFeeds, normalizeMCPNote } from "./xhs-mcp-data";
import { normalizeNoteUrl, type SearchResult } from "./xhs-search";
import { SearchError } from "./search-service";

const origin="http://127.0.0.1:18060";
type ReadEndpoint = "login/status" | "login/qrcode" | "feeds/search" | "feeds/detail";
// Intentionally expose only these four read/login endpoints, not arbitrary MCP tools.
async function readMCP(endpoint: ReadEndpoint, signal?: AbortSignal, body?: unknown) {
  let token;
  try { token=await readFile(path.join(process.cwd(),".local/xiaohongshu/auth-token"),"utf8"); }
  catch { throw new SearchError("小红书本地服务尚未启动，请打开搜索设置启动服务",503); }
  const combined=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(endpoint === "login/status" ? 25000 : 75000)]);
  try {
    const response=await fetch(`${origin}/api/v1/${endpoint}`,{
      method:body ? "POST" : "GET",signal:combined,cache:"no-store",
      headers:{Authorization:`Bearer ${token.trim()}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),
    });
    if (!response.ok) { void response.body?.cancel().catch(()=>{});throw new SearchError(response.status === 401 ? "小红书本地服务认证失败，请重启服务" : "小红书暂时无法完成请求，请检查登录状态后重试"); }
    const text=await response.text();
    if(text.length>3000000)throw new SearchError("笔记内容过多，请打开原文查看");
    const result=JSON.parse(text);
    if(result.success!==true || !result.data)throw new SearchError("小红书返回格式不正确，请重试");
    return result.data;
  } catch(error) {
    if(signal?.aborted)throw signal.reason;
    if(error instanceof SearchError)throw error;
    throw new SearchError(combined.aborted ? "小红书响应超时，请稍后重试" : "无法连接小红书本地服务，请在搜索设置检查服务状态",combined.aborted ? 504 : 503);
  }
}

export async function mcpLoginStatus(signal?: AbortSignal) {
  const data=await readMCP("login/status",signal);
  if(typeof data.is_logged_in!=="boolean")throw new SearchError("登录状态返回格式不正确");
  return {connected:true,loggedIn:data.is_logged_in,username:typeof data.username==="string"?data.username.slice(0,100):""};
}
export async function mcpLoginQR(signal?: AbortSignal) {
  const data=await readMCP("login/qrcode",signal);
  if(data.is_logged_in===true)return {connected:true,loggedIn:true};
  if(typeof data.img!=="string" || data.img.length>600000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(data.img))throw new SearchError("登录二维码获取失败，请重新获取");
  return {connected:true,loggedIn:false,qr:data.img,expiresAt:Date.now()+4*60*1000};
}
export async function searchMCP(query: string, signal?: AbortSignal, sort="综合",noteType="不限"): Promise<SearchResult> {
  if(typeof query!=="string" || !query.trim() || query.length>300)throw new SearchError("请输入 1–300 字的搜索关键词",400);
  if(!["综合","最新","最多点赞","最多收藏"].includes(sort) || !["不限","图文","视频"].includes(noteType))throw new SearchError("搜索筛选条件不正确",400);
  const status=await mcpLoginStatus(signal);
  if(!status.loggedIn)throw new SearchError("请先在搜索设置中使用小红书 App 扫码登录",401);
  const data=await readMCP("feeds/search",signal,{keyword:query.trim(),filters:{sort_by:sort,note_type:noteType}});
  return {query:query.trim(),provider:"xiaohongshu-mcp",searchedAt:new Date().toISOString(),sources:normalizeMCPFeeds(data)};
}
export async function readMCPNote(url: string,signal?: AbortSignal) {
  const normalized=normalizeNoteUrl(url);
  if(!normalized)throw new SearchError("笔记链接不正确",400);
  const note=new URL(normalized), token=note.searchParams.get("xsec_token");
  if(!token)throw new SearchError("该笔记缺少读取凭据，请重新搜索或打开原文",400);
  const data=await readMCP("feeds/detail",signal,{feed_id:note.pathname.split("/").filter(Boolean).at(-1),xsec_token:token,load_all_comments:false});
  return normalizeMCPNote(data,normalized);
}
