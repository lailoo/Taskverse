import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, closeSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const url = "http://127.0.0.1:3010";
const next = path.join(root, "node_modules/next/dist/bin/next");
// The optional search companion starts with the same fixed project entry point.
if (existsSync(path.join(root,".local/xiaohongshu/xiaohongshu-mcp"))) {
  spawnSync(process.execPath,[path.join(root,"scripts/start-xhs.mjs")],{cwd:root,stdio:"inherit",timeout:15000});
}
async function ready() {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(1200),
    });
    const data = await response.json();
    return (
      response.ok && data.app === "our-wedding-map" && data.directory === root
    );
  } catch {
    return false;
  }
}
const open = () => {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  console.log(`婚礼筹备已启动：${url}`);
};
if (await ready()) {
  open();
  process.exit(0);
}
const occupied = await new Promise((resolve) => {
  const socket = net.connect(3010, "127.0.0.1");
  socket.on("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.on("error", () => resolve(false));
});
if (occupied) {
  console.error(
    "3010 端口已被占用，请关闭占用它的服务后重新启动。数据仍在 .local/wedding.sqlite。",
  );
  process.exit(1);
}
try {
  await import("node:sqlite");
} catch {
  console.error("需要 Node.js 22.13 或更高版本。");
  process.exit(1);
}
console.log("正在准备婚礼筹备服务…");
const build = spawnSync(process.execPath, [next, "build"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status || 1);
mkdirSync(path.join(root, ".local"), { recursive: true });
const log = openSync(path.join(root, ".local/server.log"), "a", 0o600);
const server = spawn(
  process.execPath,
  [next, "start", "--hostname", "127.0.0.1", "--port", "3010"],
  { cwd: root, detached: true, stdio: ["ignore", log, log] },
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.unref();
closeSync(log);
for (let i = 0; i < 40; i++) {
  if (await ready()) {
    open();
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.error("启动未成功，请查看 .local/server.log。");
process.exit(1);
