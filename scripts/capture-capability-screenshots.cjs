const fs = require("node:fs");
const path = require("node:path");
const { makeInitialProject } = require("../src/lib/tasks.ts");

const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const out = path.join(process.cwd(), "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

// Use synthetic conversations so capability screenshots never expose local user data.
const demoChats = [{ id: "demo-cn", title: "演示：婚礼任务拆解", updatedAt: "2026-09-14T09:00:00.000Z" }];
const demoMessages = [
  { role: "user", content: "请把婚礼准备拆成场地、宾客和预算三组任务。" },
  {
    role: "assistant",
    content: "我先按三个分支整理了一版，可以选择需要加入画布的任务。",
    tasks: [
      { title: "比较候选场地", parentId: "venue", description: "整理交通、容量和报价。", owner: "", due: "" },
      { title: "整理双方宾客名单", parentId: "guests", description: "为请柬和座位表准备数据。", owner: "", due: "" },
      { title: "录入总预算", parentId: "budget", description: "记录预算上限和付款节点。", owner: "", due: "" },
    ],
    followUps: [],
  },
];

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1506, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem("wedding-map-theme", "rose");
    localStorage.setItem("wedding-map-pets", "true");
    localStorage.setItem("taskverse-language", "zh");
  });
  try {
    const page = await context.newPage();
    const project = makeInitialProject();
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project*", route => route.fulfill({ json: { project, revision: 1, savedAt: "2026-09-14T09:00:00.000Z", versions: [] } }));
    await page.route("**/api/chats*", route => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: url.searchParams.has("id") ? { id: "demo-cn", revision: 1, summary: "演示会话", memory: { weddingDate: "", budget: "", preferences: [], decisions: [] }, messages: demoMessages } : demoChats });
    });
    await page.route("**/api/ai", route => route.fulfill({ json: route.request().method() === "GET" ? { configured: true, model: "demo-model" } : { reply: "演示回复", tasks: [], changes: [], followUps: [] } }));
    await page.goto("http://127.0.0.1:3010/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(700);
    const shot = async name => { await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); console.log(name); };
    await shot("capability-mindmap");
    await page.locator(".main-nav").getByRole("button", { name: /看板/ }).click();
    await page.waitForTimeout(400);
    await shot("capability-kanban");
    await page.locator(".main-nav").getByRole("button", { name: /城市/ }).click();
    await page.waitForTimeout(900);
    await shot("capability-city");
    await page.locator(".main-nav").getByRole("button", { name: /筹备地图/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "婚礼 AI 助手" }).click();
    await page.waitForTimeout(500);
    await shot("capability-ai");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "项目版本" }).click();
    await page.waitForTimeout(500);
    await shot("capability-versions");
    await page.keyboard.press("Escape");
    // Capture the cloud controls in the actual Cloud Railway theme.
    await page.evaluate(() => localStorage.setItem("wedding-map-theme", "cloud"));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
    await page.getByRole("button", { name: "云海参数", exact: true }).click();
    await page.waitForTimeout(500);
    await shot("capability-cloud-controls");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
