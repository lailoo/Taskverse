import { ProjectStore, ProjectConflict } from "@/lib/project-db";
import { isSameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export async function GET(request: Request) {
  let store: ProjectStore | undefined;
  try {
    store = new ProjectStore();
    const url = new URL(request.url);
    const version = url.searchParams.get("version");
    if (version) return Response.json({ project: store.readVersion(version) }, { headers: { "Cache-Control": "no-store" } });
    if (url.searchParams.get("versions") === "1") return Response.json({ versions: store.listVersions() }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(store.read(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "无法读取本机数据库，原数据未覆盖。" },
      { status: 500 },
    );
  } finally {
    store?.close();
  }
}
export async function PUT(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "请求来源不匹配" }, { status: 403 });
  let store: ProjectStore | undefined;
  let body;
  try {
    const text = await request.text();
    if (text.length > 60000000) throw new Error();
    body = JSON.parse(text);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      throw new Error();
  } catch {
    return Response.json({ error: "项目数据或版本号无效" }, { status: 400 });
  }
  try {
    store = new ProjectStore();
    return Response.json(store.save(body.project, body.revision));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ProjectConflict
            ? error.message
            : "本机数据库保存失败，请导出当前修改后重试。",
      },
      { status: error instanceof ProjectConflict ? 409 : 500 },
    );
  } finally {
    store?.close();
  }
}
