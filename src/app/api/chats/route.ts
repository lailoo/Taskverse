import { ChatStore } from "@/lib/chat-store";
import { isSameOrigin } from "@/lib/request-origin";

export function GET(request: Request) {
  const store = new ChatStore();
  try {
    const id = new URL(request.url).searchParams.get("id");
    const result = id ? store.read(id) : store.list();
    return Response.json(result ?? { error: "会话不存在" }, { status: result ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } finally { store.close(); }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不匹配" }, { status: 403 });
  const store = new ChatStore();
  try { return Response.json(store.create()); } finally { store.close(); }
}
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不匹配" }, { status: 403 });
  const store = new ChatStore();
  try {
    const text = await request.text();
    if (text.length > 2000000) throw new Error("会话过长，请新建会话");
    const body = JSON.parse(text);
    if (typeof body.id !== "string") throw new Error("会话编号不正确");
    return Response.json(store.save(body.id, body.messages, body.revision, body.summary, body.memory));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "会话保存失败" }, { status: 400 });
  } finally { store.close(); }
}
