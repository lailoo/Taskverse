// Run: node --import tsx tests/town-construction-browser.cjs
// Project reads and writes are isolated in a browser fixture; never writes SQLite.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { createHash } = require("node:crypto");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const { TOWN_BUILDING_LABELS } = require("../src/lib/town-buildings.ts");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.TOWN_TEST_OUTPUT || "/tmp/ai-town-inspect";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1506, height: 1100 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    let project = makeInitialProject(), revision = 1, writes = 0;
    const root = project.tasks.find(task => !task.parentId);
    project.tasks.push({ ...project.tasks[1], id: "test-camp", parentId: root.id, title: "露营准备", status: "todo" });
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project", route => {
      if (route.request().method() === "PUT") { project = route.request().postDataJSON().project; revision++; writes++; }
      return route.fulfill({ json: { project, revision, savedAt: new Date().toISOString() } });
    });
    await page.addInitScript(() => localStorage.setItem("wedding-map-pets", "false"));
    await page.goto(process.env.TOWN_TEST_URL || "http://127.0.0.1:3011/");
    await page.getByRole("button", { name: "城市", exact: true }).click();
    await page.locator('.town-terrain[data-ready="true"]').waitFor();
    const positions = () => page.locator(".town-building").evaluateAll(nodes => nodes.map(node => [node.dataset.taskId, node.style.left, node.style.top, node.style.width, node.style.height, node.dataset.buildingKind, node.dataset.buildingVariant]));
    const original = await positions();
    const crop = (id, layer = "terrain") => page.evaluate(({ id, layer }) => {
      const plot = document.querySelector(`.town-building[data-task-id="${id}"]`).getBoundingClientRect();
      const source = document.querySelector(`.town-${layer}`), box = source.getBoundingClientRect();
      const ratio = source.width / box.width;
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 240;
      const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
      // Exclude the pavement below the site where passing residents can overlap its bottom edge.
      const height = plot.height * (layer === "motion" ? .78 : 1);
      ctx.drawImage(source, (plot.x - box.x) * ratio, (plot.y - box.y) * ratio, plot.width * ratio, height * ratio, 0, 0, 240, 240);
      return canvas.toDataURL();
    }, { id, layer }).then(data => createHash("sha256").update(data).digest("hex"));
    // Exercise real task editing, not React internals. Renderer must change without a reload.
    for (const id of ["venue-1", root.id, "test-camp"]) {
      const plot = page.locator(`.town-building[data-task-id="${id}"]`);
      const staticFrames = {};
      for (const [status, taskStage] of [["todo", "foundation"], ["doing", "construction"], ["waiting", "suspended"], ["done", "complete"], ["todo", "foundation"]]) {
        const stage = id === root.id ? "landmark" : taskStage;
        await plot.dblclick();
        await page.getByRole("combobox", { name: "任务状态", exact: true }).selectOption(status);
        await page.getByRole("button", { name: "关闭任务详情" }).click();
        const confirmation = page.locator(".confirm-modal");
        if (await confirmation.isVisible()) await confirmation.getByRole("button", { name: "确认", exact: true }).click();
        await page.waitForFunction(({ id, stage, status }) => {
          const element = document.querySelector(`.town-building[data-task-id="${id}"]`);
          return element?.dataset.constructionStage === stage && element?.dataset.status === status;
        }, { id, stage, status });
        await delay(120);
        assert.deepEqual(await positions(), original, "status must preserve every plot's location, scale, kind and variant");
        const pixels = await crop(id);
        if (staticFrames[status]) assert.equal(pixels, staticFrames[status], "reopening must fully restore the original foundation, without stale walls");
        else staticFrames[status] = pixels;
        const motionBefore = await crop(id, "motion"); await delay(260); const motionAfter = await crop(id, "motion");
        if (status === "doing" || id === root.id) assert.notEqual(motionAfter, motionBefore, `${id}: active site or landmark animates`);
        if (id !== root.id && (status === "waiting" || status === "todo")) assert.equal(motionAfter, motionBefore, `${id}: inactive sites must not keep building`);
        if (status === "doing") {
          await page.getByRole("button", { name: "暂停小镇动画" }).click(); await delay(80);
          const frozen = await crop(id, "motion"); await delay(180); assert.equal(await crop(id, "motion"), frozen);
          await page.getByRole("button", { name: "继续小镇动画" }).click();
          await page.emulateMedia({ reducedMotion: "reduce" }); await delay(80);
          const reduced = await crop(id, "motion"); await delay(180); assert.equal(await crop(id, "motion"), reduced);
          await page.emulateMedia({ reducedMotion: "no-preference" });
        }
        if (id === "venue-1") {
          const data = await page.evaluate(id => {
            const plot = document.querySelector(`.town-building[data-task-id="${id}"]`).getBoundingClientRect();
            const source = document.querySelector(".town-terrain"), box = source.getBoundingClientRect(), ratio = source.width / box.width;
            const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 320;
            const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
            for (const node of document.querySelectorAll(".town-terrain, .town-motion")) ctx.drawImage(node, (plot.x - box.x) * ratio, (plot.y - box.y) * ratio, plot.width * ratio, plot.height * ratio, 0, 0, 320, 320);
            return canvas.toDataURL();
          }, id);
          fs.writeFileSync(path.join(out, `construction-${status}.png`), Buffer.from(data.split(",")[1], "base64"));
        }
      }
      assert.equal(new Set(Object.values(staticFrames)).size, id === root.id ? 1 : 4, `${id}: ordinary tasks change construction stage; the civic windmill remains complete`);
    }
    assert.ok(writes > 0, "real UI edits reach the persistence endpoint");

    // Real Canvas rendering of all architectural families: inspect alpha, bounds and inactive frames.
    // This module has type-only imports, so TypeScript can compile it in isolation for the browser.
    const compiled = ts.transpileModule(fs.readFileSync("src/lib/town-construction.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    await page.addScriptTag({ content: `window.constructionRenderer = {}; (function(exports) { ${compiled}\n})(window.constructionRenderer);` });
    const checks = await page.evaluate(async kinds => {
      const sprite = new Image(); sprite.src = "/assets/ai-town/32x32folk.png"; await sprite.decode();
      const images = { residents: sprite }, renderer = window.constructionRenderer, failures = [];
      for (const kind of kinds) for (const variant of [0, 1, 2]) {
        const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 108;
        const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
        const plot = { kind, variant, civic: false, x: 10, y: 10, width: 80, height: 88, status: "todo" };
        renderer.drawConstructionSite(ctx, plot);
        const data = ctx.getImageData(0, 0, 100, 108).data;
        let count = 0;
        for (let y = 0; y < 108; y++) for (let x = 0; x < 100; x++) if (data[(y * 100 + x) * 4 + 3]) {
          count++; if (y < 55 || x < 10 || x >= 90 || y >= 98) failures.push(`${kind}: foundation has raised architecture or overflow`);
        }
        if (!count) failures.push(`${kind}: missing foundation`);
        for (const status of ["todo", "doing", "waiting", "done"]) {
          plot.status = status;
          const frames = [0, 2.3].map(t => {
            ctx.clearRect(0, 0, 100, 108); renderer.drawConstructionActivity(ctx, images, plot, t); return canvas.toDataURL();
          });
          if ((frames[0] !== frames[1]) !== (status === "doing")) failures.push(`${kind}/${status}: incorrect activity`);
          ctx.clearRect(0, 0, 100, 108); renderer.drawConstructionSite(ctx, plot);
          const pixels = ctx.getImageData(0, 0, 100, 108).data;
          for (let y = 0; y < 108; y++) for (let x = 0; x < 100; x++) if (pixels[(y * 100 + x) * 4 + 3]) {
            if (status === "done") failures.push(`${kind}: construction over completed building`);
            if (x < 10 || x >= 90 || y < 10 || y >= 98) failures.push(`${kind}: site overflow`);
          }
        }
      }
      return [...new Set(failures)];
    }, Object.keys(TOWN_BUILDING_LABELS));
    assert.deepEqual(checks, []);
    assert.deepEqual(errors, []);
    console.log("PASS: real status transitions and reopening for house and camp; civic windmill remains complete for every status; all 14 building families × 3 variants stay in bounds; foundation has no upper walls; only doing builds; pause/reduced-motion freeze activity; task locations unchanged; isolated persistence writes; no runtime errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
