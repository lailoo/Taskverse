// Run: node --import tsx tests/town-browser.cjs (dev server on 3011).
// Browser-scoped fixture: every project read/write is intercepted; SQLite is not changed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const buildingSheet = require("../public/assets/ai-town/buildings/town-buildings.json");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.TOWN_TEST_OUTPUT || "/tmp/ai-town-inspect";
fs.mkdirSync(out, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1506, height: 1100 } });
    const errors = [], assets = new Set();
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.ok() && response.url().includes("/assets/ai-town/")) assets.add(new URL(response.url()).pathname); });
    let project = makeInitialProject(), revision = 1;
    project.tasks.find(task => task.id === "venue-1").status = "done";
    project.tasks.find(task => task.id === "guests-2").status = "waiting";
    project.tasks.find(task => task.id === "ceremony-1").status = "doing";
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project", route => {
      if (route.request().method() === "PUT") { project = route.request().postDataJSON().project; revision++; }
      return route.fulfill({ json: { project, revision, savedAt: new Date().toISOString() } });
    });
    await page.addInitScript(() => localStorage.setItem("wedding-map-pets", "false"));
    await page.goto(process.env.TOWN_TEST_URL || "http://127.0.0.1:3011/");
    await page.getByRole("button", { name: "城市", exact: true }).click();
    await page.locator('.town-terrain[data-ready="true"]').waitFor();
    assert.equal(await page.locator(".town-building").count(), 19);
    for (const file of ["gentle-obj.png", "buildings/town-buildings.png", "32x32folk.png", "windmill.png", "gentlewaterfall32.png", "campfire.png"]) assert.ok(assets.has(`/assets/ai-town/${file}`), file);
    const kinds = await page.locator(".town-building").evaluateAll(nodes => nodes.map(node => node.dataset.buildingKind));
    assert.ok(new Set(kinds).size >= 10, "default town should retain at least ten planned architectural types");
    await page.screenshot({ path: path.join(out, "town-overview.png") });

    const building = page.getByRole("button", { name: "建筑：整理候选场地", exact: true });
    await building.click();
    await page.getByRole("complementary", { name: "建筑任务详情" }).waitFor();
    assert.match(await page.locator(".town-inspector").innerText(), /已完成/);
    assert.match(await page.locator(".town-inspector-kind").innerText(), /林间旅馆/);
    await building.dblclick();
    await page.getByRole("dialog", { name: "任务详情：整理候选场地" }).waitFor();
    await page.getByRole("button", { name: "关闭任务详情" }).click();
    await page.getByRole("button", { name: "在脑图中查看", exact: true }).click();
    await page.locator('.react-flow__node[data-id="venue-1"]').waitFor();
    await page.getByRole("button", { name: "城市", exact: true }).click();
    await page.getByRole("button", { name: "小镇全景" }).click();
    const positions = () => page.locator(".town-building").evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.taskId, [node.style.left, node.style.top]])));
    const before = await positions();
    await page.getByRole("button", { name: "只显示未完成任务" }).click();
    assert.equal(await page.locator('.town-building[data-task-id="venue-1"]').count(), 0);
    for (const [id, position] of Object.entries(await positions())) assert.deepEqual(position, before[id]);
    await page.getByRole("button", { name: "只显示未完成任务" }).click();
    await page.getByPlaceholder("搜索任务").fill("准备誓词");
    assert.ok(await page.locator(".town-building").count() < 19);
    assert.equal(await page.locator('.town-building[data-task-id="ceremony-2"]').count(), 1);
    await page.getByPlaceholder("搜索任务").fill("");

    const frame = () => page.locator(".town-motion").evaluate(canvas => canvas.toDataURL());
    const moving = await frame(); await delay(200); assert.notEqual(await frame(), moving);
    await page.getByRole("button", { name: "暂停小镇动画" }).click();
    await delay(100); const paused = await frame(); await delay(200); assert.equal(await frame(), paused);
    await page.getByRole("button", { name: "继续小镇动画" }).click();
    await delay(200); assert.notEqual(await frame(), paused);
    const oldZoom = await page.locator(".town-zoom").innerText();
    await page.getByRole("button", { name: "放大小镇" }).click();
    assert.notEqual(await page.locator(".town-zoom").innerText(), oldZoom);
    await page.getByRole("button", { name: "小镇全景" }).click();
    const world = () => page.locator(".town-world").evaluate(element => element.style.transform);
    const originalCamera = await world();
    const rect = await page.locator(".town-stage").boundingBox();
    await page.mouse.move(rect.x + 90, rect.y + 140); await page.mouse.down();
    await page.mouse.move(rect.x + 160, rect.y + 165, { steps: 8 }); await page.mouse.up();
    assert.notEqual(await world(), originalCamera);
    await page.getByRole("button", { name: "小镇全景" }).click();
    assert.equal(await world(), originalCamera);
    await page.getByRole("button", { name: "建筑：宾客与接待", exact: true }).click();
    await page.screenshot({ path: path.join(out, "town-inspector.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "小镇全景" }).click();
    assert.equal(await page.locator(".town-controls").isVisible(), true);
    const panel = await page.locator(".town-inspector").boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: path.join(out, "town-mobile.png") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await delay(100); const still = await frame(); await delay(200); assert.equal(await frame(), still);

    // Isolated, completed sample tasks let the original house and extensions be reviewed together.
    project = makeInitialProject(); project.title = "建筑风格预览（示例任务）";
    for (const [index, title] of ["原版木屋", "鸿福大酒店", "龙门客栈", "小旅馆", "箭塔", "园区围墙", "林间营地"].entries()) {
      project.tasks.push({ ...project.tasks[1], id: `material-preview-${index}`, parentId: "venue", title });
    }
    project.tasks = project.tasks.map(task => ({ ...task, status: "done" })); revision++;
    await page.setViewportSize({ width: 1506, height: 1100 });
    await page.reload(); await page.getByRole("button", { name: "城市", exact: true }).click();
    await page.locator('.town-building[data-task-id="material-preview-0"]').waitFor();
    await page.locator('.town-terrain[data-ready="true"]').waitFor();
    await page.getByRole("button", { name: "小镇全景" }).click();
    for (const kind of ["cottage", "grandhotel", "dragoninn", "lodge", "watchtower", "wall", "camp", "windmill"]) {
      assert.ok(await page.locator(`.town-building[data-building-kind="${kind}"]`).count(), kind);
    }
    // Original house pixels must still come from the source palette, with no grey roof recolouring.
    const sourceCheck = await page.evaluate(async sheet => {
      const [source, atlas] = await Promise.all(["/assets/ai-town/rpg-tileset.png", `/assets/ai-town/buildings/town-buildings.png?v=${sheet.revision}`].map(async url => {
        const image = new Image(); image.src = url; await image.decode(); return image;
      }));
      const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 176;
      const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
      const part = sheet.sourceParts.gold_roof;
      ctx.drawImage(source, part.x, part.y, part.w, part.h, 0, 0, part.w, part.h);
      const native = ctx.getImageData(0, 0, part.w, part.h).data, palette = new Set();
      for (let i = 0; i < native.length; i += 4) if (native[i + 3]) palette.add(`${native[i]},${native[i + 1]},${native[i + 2]}`);
      ctx.clearRect(0, 0, 160, 176);
      const house = sheet.frames.cottage.variants[0];
      ctx.drawImage(atlas, house.x, house.y, house.w, house.h, 0, 0, 160, 176);
      const roof = ctx.getImageData(16, 6, 128, 112).data;
      let pixels = 0, altered = 0;
      for (let i = 0; i < roof.length; i += 4) if (roof[i + 3]) {
        pixels++; if (!palette.has(`${roof[i]},${roof[i + 1]},${roof[i + 2]}`)) altered++;
      }
      return { pixels, altered };
    }, buildingSheet);
    assert.ok(sourceCheck.pixels > 5000, "original large sloped roof is present");
    assert.equal(sourceCheck.altered, 0, "original roof pixels are not recoloured");
    await page.screenshot({ path: path.join(out, "town-original-materials.png") });
    assert.deepEqual(errors, []);
    console.log("PASS: original roof pixel colours preserved, original house/camp/windmill and five extensions together, task details/map linkage, stable filters, search, animation/pause/reduced-motion, pan/zoom/fit, mobile bounds, no runtime errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
