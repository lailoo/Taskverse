import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, open, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const root = fileURLToPath(new URL("../",import.meta.url));
const directory = path.join(root,".local/xiaohongshu");
const binary = path.join(directory,process.platform === "win32" ? "xiaohongshu-mcp.exe" : "xiaohongshu-mcp");
const occupied = await new Promise(resolve=>{
  const socket=net.connect(18060,"127.0.0.1");
  socket.on("connect",()=>{socket.destroy();resolve(true);});
  socket.on("error",()=>resolve(false));
});
if (occupied) { console.log("小红书本地服务端口已就绪");process.exit(0); }
try {
  const pid=Number(await readFile(path.join(directory,"service.pid"),"utf8"));
  if(Number.isSafeInteger(pid) && pid>0){process.kill(pid,0);console.log("小红书本地服务正在初始化，请稍候");process.exit(0);}
} catch {}
try { await access(binary); } catch { console.error("缺少小红书 MCP 程序，请先按 README 安装到 .local/xiaohongshu/");process.exit(1); }
await mkdir(directory,{recursive:true,mode:0o700});
const tokenFile=path.join(directory,"auth-token");
let token;
try { token=await readFile(tokenFile,"utf8"); } catch(error) {
  if(error.code!=="ENOENT")throw error;
  token=randomBytes(32).toString("hex");await writeFile(tokenFile,token,{mode:0o600,flag:"wx"});
}
// Keep credentials out of command-line arguments and application responses.
const log=await open(path.join(directory,"service.log"),"a",0o600);
const child=spawn(binary,["-port","127.0.0.1:18060","-headless=true"],{
  cwd:directory,detached:true,stdio:["ignore",log.fd,log.fd],
  env:{...process.env,AUTH_TOKEN:token.trim(),COOKIES_PATH:path.join(directory,"cookies.json")},
});
child.on("error",()=>{console.error("小红书本地服务启动失败");process.exitCode=1;});
child.unref();await log.close();
await writeFile(path.join(directory,"service.pid"),String(child.pid),{mode:0o600});
console.log("小红书本地服务已启动；首次运行会下载项目所需的浏览器，完成后可在搜索设置中扫码。");
