/** Record the actual town renderer. All API traffic is isolated from local data. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const { planTownLayout, townResidentCount } = require("../src/lib/town-layout.ts");
const { townConstruction } = require("../src/lib/town-construction.ts");

const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const output = path.resolve("docs/screenshots");
const fps = 12;
const countBy = (items, key) => items.reduce((counts, item) => {
  const value = key(item); counts[value] = (counts[value] || 0) + 1; return counts;
}, {});

function demoProject(language) {
  const english = language === "en";
  const project = makeInitialProject();
  const template = project.tasks[0];
  const title = english ? "Taskverse Community Festival" : "Taskverse 社区创意节";
  const tasks = [{ ...template, id: "demo-root", parentId: null, title, status: "doing", image: "", images: [] }];
  const groups = english ? ["Creative Quarter", "Festival Square", "Visitor Services", "Launch & Operations"] : ["创意街区", "活动广场", "宾客服务", "发布与运营"];
  const pairs = [
    ["搭建摄影工作室", "Set up photo studio"], ["搭建音乐舞台", "Build music pavilion"],
    ["布置花艺展厅", "Decorate flower hall"], ["确认餐饮菜单", "Confirm catering menu"],
    ["准备服装展览", "Prepare dress exhibition"], ["安排交通接驳", "Plan shuttle transport"],
    ["开放林间旅馆", "Open woodland lodge"], ["整理物资仓库", "Stock supplies warehouse"],
    ["完成预算审核", "Review festival budget"], ["发出活动请柬", "Send festival invites"],
    ["布置木屋工坊", "Set up cottage workshop"], ["搭建瞭望塔", "Build watchtower"],
    ["开放露营区", "Open camp area"], ["准备典礼礼堂", "Prepare ceremony hall"],
    ["开放鸿福大酒店", "Open grand hotel"],
  ];
  const statuses = ["done", "doing", "done", "waiting", "done", "todo", "done", "done", "done", "done"];
  let index = 0;
  for (const [groupIndex, size] of [16, 15, 14, 14].entries()) {
    const groupId = `demo-district-${groupIndex + 1}`;
    for (let position = 0; position < size; position++, index++) {
      const pair = pairs[(position - 1 + pairs.length) % pairs.length];
      const taskTitle = position === 0 ? groups[groupIndex] : pair[english ? 1 : 0];
      tasks.push({
        ...template, id: position === 0 ? groupId : `${groupId}-${position}`,
        parentId: position === 0 ? "demo-root" : groupId,
        title: taskTitle, status: statuses[index % statuses.length],
        description: english ? `Prepare ${taskTitle.toLowerCase()} for the community festival. Confirm the checklist and handover with the team.` : `为社区创意节完成「${taskTitle}」，与团队核对清单并安排交接。`,
        owner: ["Alex", "Sam", "Mia", "Noah"][index % 4], due: `2026-10-${String(10 + index % 18).padStart(2, "0")}`,
        priority: ["none", "high", "medium", "low"][index % 4], color: ["blue", "mint", "purple", "yellow"][groupIndex],
        image: "", images: [], expanded: false, collapsed: false,
      });
    }
  }
  assert.equal(tasks.length, 60);
  return { ...project, title, date: "2026-10-28", tasks };
}

async function capture(browser, language) {
  const project = demoProject(language), layout = planTownLayout(project.tasks);
  assert.equal(layout.plots.length, project.tasks.length);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1160 }, deviceScaleFactor: 1, reducedMotion: "no-preference", serviceWorkers: "block" });
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "taskverse-town-recording-"));
  const errors = [], requests = [];
  try {
    await context.route("**/api/**", route => {
      const request = route.request(); requests.push({ path: new URL(request.url()).pathname, method: request.method() });
      if (new URL(request.url()).pathname === "/api/project" && request.method() === "GET") {
        return route.fulfill({ json: { project, revision: 1, savedAt: "2026-09-14T09:00:00.000Z" } });
      }
      return route.fulfill({ json: {} });
    });
    await context.addInitScript(lang => {
      localStorage.clear();
      localStorage.setItem("wedding-map-theme", "rose");
      localStorage.setItem("wedding-map-pets", "false");
      localStorage.setItem("wedding-map-sidebar-collapsed", "true");
      localStorage.setItem("taskverse-language", lang);
    }, language);
    const page = await context.newPage();
    // Install before the app schedules its animation frames, so the clock
    // owns the original renderer's RAF callbacks throughout recording.
    await page.clock.install();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.TOWN_TEST_URL || "http://127.0.0.1:3010/");
    await page.waitForLoadState("networkidle");
    await page.locator(".view-tabs").getByRole("button", { name: /city|城市/i }).click();
    await page.locator('.town-terrain[data-ready="true"]').waitFor();
    await page.getByRole("button", { name: language === "en" ? "Fit town" : "小镇全景", exact: true }).click();
    await page.waitForTimeout(400);
    const rendered = await page.locator(".town-building").evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.taskId, stage: node.dataset.constructionStage, status: node.dataset.status, kind: node.dataset.buildingKind })));
    assert.deepEqual(new Set(rendered.map(plot => plot.id)), new Set(project.tasks.map(task => task.id)));
    for (const plot of rendered) assert.equal(plot.stage, townConstruction(layout.plots.find(item => item.taskId === plot.id)).stage);
    const suffix = language === "en" ? "-en" : "";
    const stem = `cyber-town${suffix}`;
    const clip = await page.locator(".town-view").boundingBox();
    await page.screenshot({ path: path.join(output, `${stem}.png`), clip });
    console.log(JSON.stringify({ language, taskNodes: project.tasks.length, renderedPlots: rendered.length, stages: countBy(rendered, item => item.stage), clip, hud: await page.locator(".town-census").innerText() }));
    if (process.env.TOWN_PREVIEW_ONLY === "1") return;

    await page.clock.pauseAt(new Date(Date.now() + 200));
    const motion = page.locator(".town-motion");
    const motionHashes = new Set();
    const terrain = await page.locator(".town-terrain").evaluate(canvas => canvas.toDataURL());
    // Keep the camera fixed; each GIF frame comes directly from the running app.
    const examples = ["done", "doing", "waiting", "todo"].map(status => project.tasks.find(task => task.parentId === "demo-district-1" && task.status === status));
    let frameIndex = 0;
    for (let phase = 0; phase < 5; phase++) {
      if (phase > 0) {
        const task = examples[phase - 1]; assert(task);
        await page.locator(`.town-building[data-task-id="${task.id}"]`).click();
        assert.equal(await page.locator(".town-construction-stage").getAttribute("data-stage"), townConstruction(layout.plots.find(plot => plot.taskId === task.id)).stage);
      }
      for (let i = 0; i < fps * 3; i++, frameIndex++) {
        await page.clock.runFor(1000 / fps);
        motionHashes.add(await motion.evaluate(canvas => canvas.toDataURL()));
        await page.screenshot({ path: path.join(frames, `frame-${String(frameIndex).padStart(3, "0")}.png`), clip });
      }
    }
    assert(motionHashes.size > frameIndex * .9, `The original canvas animation must advance throughout recording (${motionHashes.size}/${frameIndex} distinct frames)`);
    assert.equal(await page.locator(".town-terrain").evaluate(canvas => canvas.toDataURL()), terrain, "Recording must not replace terrain or buildings");
    await page.getByRole("button", { name: language === "en" ? "Pause town animation" : "暂停小镇动画", exact: true }).click();
    await page.clock.runFor(200);
    const paused = await motion.evaluate(canvas => canvas.toDataURL());
    await page.clock.runFor(500);
    assert.equal(await motion.evaluate(canvas => canvas.toDataURL()), paused, "The app pause control must stop the captured animation");
    assert.deepEqual(errors, []);
    execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "frame-%03d.png"), "-filter_complex", "scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", path.join(output, `${stem}.gif`)]);
    const report = { source: "Direct screenshots of the running application; no composited sprites or overlays", language, fixture: "60 synthetic task nodes; no local project data", taskNodes: project.tasks.length, renderedPlots: rendered.length, taskPlots: rendered.filter(plot => plot.stage !== "landmark").length, stages: countBy(rendered, item => item.stage), residents: townResidentCount(rendered.length - 1), frames: frameIndex, fps, durationSeconds: frameIndex / fps, distinctMotionFrames: motionHashes.size, nativePauseVerified: true, runtimeErrors: errors, apiRequestsIntercepted: requests, plots: rendered };
    fs.writeFileSync(path.join(output, `${stem}.json`), JSON.stringify(report, null, 2) + "\n");
    console.log(`${stem}.gif: ${frameIndex} live frames; ${motionHashes.size} distinct canvas frames; native pause verified`);
  } finally { await context.close(); fs.rmSync(frames, { recursive: true, force: true }); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try { for (const language of process.env.TOWN_DEMO_LANGUAGE ? [process.env.TOWN_DEMO_LANGUAGE] : ["zh", "en"]) await capture(browser, language); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
