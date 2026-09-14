/** Real application frames, with synthetic tasks and all API calls intercepted. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { makeInitialProject } = require("../src/lib/tasks.ts");

const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const out = path.join(process.cwd(), "docs", "screenshots");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const languages = process.env.CLOUD_DEMO_LANGUAGE ? [process.env.CLOUD_DEMO_LANGUAGE] : ["zh", "en"];
const fps = 12, frameCount = 96;
fs.mkdirSync(out, { recursive: true });

function demoProject(language, dense = true) {
  const project = makeInitialProject();
  const english = language === "en";
  const branches = english
    ? [["Design", "blue"], ["Build", "mint"], ["Content", "pink"], ["Team", "purple"], ["Launch", "peach"], ["Budget", "yellow"]]
    : [["设计体验", "blue"], ["开发能力", "mint"], ["内容准备", "pink"], ["团队协作", "purple"], ["发布运营", "peach"], ["预算管理", "yellow"]];
  const childWords = english
    ? ["Map the flow", "Review the brief", "Prepare assets", "Confirm owners", "Run a check", "Polish details", "Share a draft", "Track progress", "Close the loop"]
    : ["梳理流程", "确认方案", "准备素材", "明确负责人", "执行检查", "打磨细节", "同步草稿", "跟踪进度", "完成闭环"];
  // Seeded pseudo-random values keep the public demo reproducible while
  // presenting a realistic, varied 60-task plan.
  let seed = 0x60_2026;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
  const owners = english ? ["Alex", "Sam", "Mia", "Noah"] : ["小林", "小周", "小陈", "小许"];
  const rootTemplate = project.tasks.find(task => task.id === "wedding");
  const tasks = [{ ...rootTemplate, title: english ? "Taskverse Launch Plan" : "Taskverse 发布计划", image: "", images: [] }];
  branches.forEach(([title, color], branchIndex) => {
    const branchId = `demo-branch-${branchIndex + 1}`;
    const branchTemplate = project.tasks.find(task => task.id === ["venue", "guests", "style", "team", "ceremony", "budget"][branchIndex]);
    tasks.push({ ...branchTemplate, id: branchId, parentId: "wedding", title, color, image: "", images: [], status: branchIndex % 3 === 0 ? "doing" : "todo" });
    const childCount = dense
      ? (branchIndex === branches.length - 1 ? 8 : 9)
      : (branchIndex < 5 ? 2 : 1);
    for (let childIndex = 0; childIndex < childCount; childIndex++) {
      const statusRoll = random();
      tasks.push({
        ...branchTemplate,
        id: `${branchId}-${childIndex + 1}`,
        parentId: branchId,
        title: `${childWords[childIndex]}${english ? ` · ${branchIndex + 1}.${childIndex + 1}` : ` · ${branchIndex + 1}.${childIndex + 1}`}`,
        color,
        image: "", images: [],
        status: statusRoll < .18 ? "done" : statusRoll < .42 ? "doing" : statusRoll < .52 ? "waiting" : "todo",
        priority: random() < .16 ? "high" : random() < .45 ? "medium" : random() < .7 ? "low" : "none",
        owner: random() < .62 ? owners[Math.floor(random() * owners.length)] : "",
        due: `2026-${String(4 + (childIndex % 6)).padStart(2, "0")}-${String(8 + branchIndex * 3 + childIndex).padStart(2, "0")}`,
      });
    }
  });
  return { ...project, title: english ? "Taskverse Launch Plan" : "Taskverse 发布计划", tasks };
}

async function capture(browser, language) {
  assert(["zh", "en"].includes(language), "CLOUD_DEMO_LANGUAGE must be zh or en");
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "taskverse-cloud-demo-"));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  try {
    let project = demoProject(language, false);
    await context.route("**/api/**", route => {
      if (new URL(route.request().url()).pathname === "/api/project") {
        return route.fulfill({ json: { project, revision: 1, savedAt: "2026-09-14T09:00:00.000Z", versions: [] } });
      }
      return route.abort();
    });
    await context.addInitScript(lang => {
      localStorage.setItem("wedding-map-theme", "cloud");
      localStorage.setItem("wedding-map-pets", "false");
      localStorage.setItem("wedding-map-sidebar-collapsed", "true");
      localStorage.setItem("taskverse-language", lang);
      localStorage.setItem("wedding-map-cloud-settings", JSON.stringify({ quality: "high" }));
    }, language);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.CLOUD_TEST_URL || "http://127.0.0.1:3010/");
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
    await page.locator("[data-cloud-train]").waitFor();
    await page.waitForTimeout(900);
    // Freeze only the browser clock between screenshots. runFor advances the
    // application's real animation at its original speed, without capture lag.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 200));
    const shell = page.locator(".canvas-shell");
    const clip = await shell.boundingBox();
    assert(clip && clip.width > 0 && clip.height > 0);
    const suffix = language === "en" ? "-en" : "";
    const stem = `cloud-railway${suffix}`;
    const poses = [], sceneTimes = [];
    for (let index = 0; index < frameCount; index++) {
      await page.clock.runFor(1000 / fps);
      const sample = await page.locator("[data-cloud-train]").evaluate(el => ({
        pose: el.getAttribute("transform"), time: document.querySelector('[data-cloud-layer="background"]').dataset.cloudTime,
      }));
      poses.push(sample.pose); sceneTimes.push(sample.time);
      await page.screenshot({ path: path.join(frames, `frame-${String(index).padStart(3, "0")}.png`), clip });
      if (index === 12) fs.copyFileSync(path.join(frames, "frame-012.png"), path.join(out, `${stem}.png`));
    }
    assert(new Set(poses).size > 80, "train must move throughout the capture");
    assert(new Set(sceneTimes).size > 80, "WebGL cloud time must advance throughout the capture");
    execFileSync(ffmpeg, [
      "-y", "-framerate", String(fps), "-i", path.join(frames, "frame-%03d.png"),
      "-filter_complex", "scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none",
      "-loop", "0", path.join(out, `${stem}.gif`),
    ], { stdio: "pipe" });
    if (language === "zh") {
      // The controls screenshot intentionally uses the full 60-task showcase
      // so the public README communicates the product's planning density.
      project = demoProject(language, true);
      assert.equal(project.tasks.length, 60);
      await page.reload();
      await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
      await page.getByRole("button", { name: "适应画布", exact: true }).click();
      await page.clock.runFor(450);
      await page.getByRole("button", { name: "云海参数", exact: true }).click();
      await page.clock.runFor(100);
      await page.getByRole("dialog", { name: "云海参数", exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, "capability-cloud-controls.png"), clip });
    }
    assert.deepEqual(errors, [], "capture must not contain runtime errors");
    console.log(`${stem}.gif: ${frameCount} frames / ${fps} fps; moving train, evolving GPU clouds, synthetic ${language} tasks`);
  } finally {
    await context.close();
    fs.rmSync(frames, { recursive: true, force: true });
  }
}

(async () => {
  execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try { for (const language of languages) await capture(browser, language); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
