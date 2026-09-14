// Run against the local production server: node --import tsx tests/cloud-train-browser.cjs
// All project requests use an isolated fixture; the user's SQLite project is untouched.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const { CLOUD_TRAIN_LENGTH } = require("../src/lib/cloud-train.ts");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.CLOUD_TEST_OUTPUT || "/tmp/cloud-train-check";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1506, height: 1100 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let project = makeInitialProject(), writes = 0;
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project", route => {
      if (route.request().method() === "PUT") { project = route.request().postDataJSON().project; writes++; }
      return route.fulfill({ json: { project, revision: writes + 1, savedAt: new Date().toISOString() } });
    });
    await page.addInitScript(() => {
      localStorage.setItem("wedding-map-theme", "cloud");
      localStorage.setItem("wedding-map-pets", "false");
    });
    await page.goto(process.env.CLOUD_TEST_URL || "http://127.0.0.1:3010/");
    const train = page.locator("[data-cloud-train]");
    const bridge = page.locator("[data-cloud-railway]");
    const far = page.locator('[data-cloud-layer="background"]');
    const near = page.locator('[data-cloud-layer="foreground"]');
    await train.waitFor({ state: "visible" });
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
    // Let the initial cloud camera fit finish before checking screen geometry.
    await page.waitForTimeout(700);
    assert.equal(await train.count(), 1, "one train for all overlapping root branches");
    assert.equal(await bridge.count(), 1, "one complete railway");
    const fixedRail = () => bridge.evaluate(el => [...el.querySelectorAll("path, rect")].map(part => ({
      shape: part.outerHTML, color: getComputedStyle(part).stroke, opacity: getComputedStyle(part).opacity,
    })));
    const fixedBefore = await fixedRail();
    assert.equal(await page.locator("[data-cloud-consist]").getAttribute("data-coach-count"), "10", "ten coaches passed to the original train shader");
    const motion = () => page.evaluate(() => {
      const far = document.querySelector('[data-cloud-layer="background"]');
      const near = document.querySelector('[data-cloud-layer="foreground"]');
      const train = document.querySelector("[data-cloud-train]");
      const route = train.closest(".road-traffic").querySelector("path");
      const zoom = Math.hypot(route.getScreenCTM().a, route.getScreenCTM().b);
      return { time: performance.now(), far: Number(far.dataset.cloudTime),
        near: Number(near.dataset.cloudTime), zoom,
        train: train.transform.baseVal.consolidate().matrix.e };
    });
    const stage = await page.locator(".canvas-shell").boundingBox();
    const skyClip = { x: stage.x + 100, y: stage.y + 40, width: 650, height: 300 };
    const fogClip = { x: stage.x + 240, y: stage.y + stage.height - 75, width: 520, height: 55 };
    const skyBefore = await page.screenshot({ clip: skyClip, path: `${out}/sky-before.png` });
    const fogBefore = await page.screenshot({ clip: fogClip, path: `${out}/fog-before.png` });
    const driftStart = await motion();
    await page.waitForTimeout(650);
    const driftEnd = await motion();
    assert.deepEqual(await fixedRail(), fixedBefore, "railway geometry and color remain fixed while clouds and train move");
    const skyAfter = await page.screenshot({ clip: skyClip, path: `${out}/sky-after.png` });
    const fogAfter = await page.screenshot({ clip: fogClip, path: `${out}/fog-after.png` });
    assert.notDeepEqual(skyAfter, skyBefore, "far cloud pixels evolve");
    assert.notDeepEqual(fogAfter, fogBefore, "near cloud pixels evolve");
    assert(driftEnd.far > driftStart.far && driftEnd.near === driftEnd.far, "both GPU passes share one advancing scene time");
    assert.equal(await far.evaluate(el => getComputedStyle(el).transform), "none", "clouds are generated, not a translated image");
    assert.equal(await near.evaluate(el => getComputedStyle(el).transform), "none");
    const seconds = (driftEnd.time - driftStart.time) / 1000;
    const trainSpeed = (driftEnd.train - driftStart.train) * driftEnd.zoom / seconds;
    assert(trainSpeed > 90, `fast train stays responsive with shader: ${trainSpeed}`);
    console.log("Actual train speed with WebGL clouds:", trainSpeed.toFixed(1));
    const trainPose = () => train.getAttribute("transform");
    const position = await trainPose();
    await page.waitForFunction(before => document.querySelector("[data-cloud-train]").getAttribute("transform") !== before, position);
    await page.getByRole("button", { name: "暂停主轴列车" }).click();
    await page.waitForTimeout(80);
    const stopped = await trainPose();
    const cloudsStopped = await motion();
    await page.waitForTimeout(250);
    assert.equal(await trainPose(), stopped, "pause freezes position");
    const cloudsAfterPause = await motion();
    assert.equal(cloudsAfterPause.far, cloudsStopped.far, "pause freezes distant clouds");
    assert.equal(cloudsAfterPause.near, cloudsStopped.near, "pause freezes foreground clouds");
    const geometry = await train.evaluate(element => {
      const route = element.closest(".road-traffic").querySelector("path");
      const origin = route.getPointAtLength(0), end = route.getPointAtLength(route.getTotalLength());
      const pose = element.transform.baseVal.consolidate().matrix;
      return { start: origin.x, end: end.x, y: origin.y, endY: end.y, trainX: pose.e, trainY: pose.f,
        inViewport: Boolean(element.closest(".react-flow__viewport")),
        pointerEvents: getComputedStyle(element).pointerEvents };
    });
    assert.equal(geometry.y, geometry.endY, "the track is the horizontal central axis");
    assert.equal(geometry.trainY, geometry.y, "train stays on the central axis");
    assert.ok(geometry.trainX >= geometry.start, "engine moves from the beginning toward the terminus");
    assert.ok(geometry.inViewport, "train shares the React Flow camera");
    assert.equal(geometry.pointerEvents, "none");
    assert.equal(await near.evaluate(el => getComputedStyle(el).pointerEvents), "none");
    const axisScreen = await train.evaluate(el => {
      const p = el.closest(".road-traffic").querySelector("path");
      const origin = p.getPointAtLength(0).matrixTransform(p.getScreenCTM());
      return origin.y - el.closest(".canvas-shell").getBoundingClientRect().y;
    });
    assert(Math.abs(Number(await near.getAttribute("data-axis-y")) - axisScreen) < 1, "near clouds follow the actual railway axis");
    assert((await page.request.get(new URL("/assets/cloud-sea/blue-noise.png", page.url()).href)).ok());
    const taskPositions = await page.locator(".react-flow__node").evaluateAll(nodes => nodes.map(node => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { id: node.dataset.id, x: matrix.e, y: matrix.f, height: node.getBoundingClientRect().height / new DOMMatrix(getComputedStyle(node.closest(".react-flow__viewport")).transform).a };
    }));
    const rootId = project.tasks.find(task => !task.parentId).id;
    for (const node of taskPositions.filter(node => node.id !== rootId)) {
      assert(node.y + node.height < geometry.y, `${node.id} is completely above the railway`);
    }
    const frozenSky = await page.screenshot({ clip: skyClip });
    await page.waitForTimeout(200);
    assert.deepEqual(await page.screenshot({ clip: skyClip }), frozenSky, "pause freezes actual GPU pixels");
    await page.screenshot({ path: `${out}/axis-overview.png` });
    const beforeZoom = await train.boundingBox();
    await page.getByRole("button", { name: "放大", exact: true }).click();
    await page.waitForTimeout(300);
    assert.ok((await train.boundingBox()).width > beforeZoom.width, "train scales with nodes");
    const lineWidths = await bridge.locator(".cloud-rail-rails, .cloud-rail-cable, .cloud-rail-hanger").evaluateAll(lines => lines.map(line => parseFloat(getComputedStyle(line).strokeWidth) * Math.hypot(line.getScreenCTM().a, line.getScreenCTM().b)));
    assert(lineWidths.every(width => width >= .79), "SVG lines keep a visible minimum screen width after zoom");
    const world = () => page.locator(".react-flow__viewport").getAttribute("style");
    const beforePan = await world();
    const canvas = await page.locator(".react-flow").boundingBox();
    await page.mouse.move(canvas.x + 70, canvas.y + canvas.height - 90);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 145, canvas.y + canvas.height - 60, { steps: 6 });
    await page.mouse.up();
    assert.notEqual(await world(), beforePan, "camera still pans");
    assert.equal(await trainPose(), stopped, "camera moves do not restart train motion");
    await page.getByRole("button", { name: "适应画布" }).click();
    await page.waitForTimeout(350);
    await page.locator('.react-flow__node[data-id="venue"] .task-title').dblclick();
    await page.getByRole("dialog", { name: "任务详情：场地与餐饮" }).waitFor();
    await page.getByRole("button", { name: "关闭任务详情" }).click();
    await page.getByRole("button", { name: "继续主轴列车" }).click();
    await page.waitForFunction(before => document.querySelector("[data-cloud-train]").getAttribute("transform") !== before, stopped);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(80);
    const reduced = await trainPose();
    const reducedClouds = await motion();
    await page.waitForTimeout(250);
    assert.equal(await trainPose(), reduced);
    const reducedCloudsAfter = await motion();
    assert.equal(reducedCloudsAfter.far, reducedClouds.far);
    assert.equal(reducedCloudsAfter.near, reducedClouds.near);
    assert.ok(await train.isVisible(), "reduced motion preserves a visible static train");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "切换为分层树状布局" }).click();
    assert.equal(await train.count(), 0, "outline has no railway animation");
    await page.getByRole("button", { name: "切换为脑图布局" }).click();
    await train.waitFor({ state: "visible" });
    const theme = async value => {
      await page.getByTitle("项目设置", { exact: true }).first().click();
      await page.getByLabel("界面主题").selectOption(value);
      await page.getByRole("button", { name: "关闭设置" }).click();
    };
    await theme("mist");
    assert.equal(await train.count(), 0);
    assert.equal(await bridge.count(), 0);
    assert.equal(await page.locator('.road-traffic[data-route$=":main"]').count(), 1, "other themes retain their main car");
    await theme("cloud");
    await train.waitFor({ state: "visible" });
    await page.waitForTimeout(700);
    assert.equal(await bridge.count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "适应画布" }).click();
    await page.waitForTimeout(350);
    assert.ok(await page.getByRole("button", { name: "暂停主轴列车" }).isVisible());
    const mobileBridge = await bridge.boundingBox();
    const mobileRoot = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
    assert.ok(mobileBridge.x < 390 && mobileBridge.x + mobileBridge.width > 0, "railway remains visible in the mobile overview");
    assert.ok(mobileRoot.x >= 0, "root task stays on screen in the mobile overview");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const mobileLines = await bridge.locator(".cloud-rail-rails, .cloud-rail-cable, .cloud-rail-hanger").evaluateAll(lines => lines.map(line => parseFloat(getComputedStyle(line).strokeWidth) * Math.hypot(line.getScreenCTM().a, line.getScreenCTM().b)));
    assert(mobileLines.every(width => width >= .79), "small overview retains crisp vector strokes");
    await page.screenshot({ path: `${out}/axis-mobile.png` });
    const checkFullJourney = async () => {
      const journey = await train.evaluate(async (element, trainLength) => {
        const route = element.closest(".road-traffic").querySelector("path");
        const length = route.getTotalLength();
        const start = route.getPointAtLength(0).x;
        const scale = element.transform.baseVal.consolidate().matrix.a;
        const zoom = Math.hypot(route.getScreenCTM().a, route.getScreenCTM().b);
        const duration = (length + trainLength * scale + 12) / Math.max(240, 140 / zoom) * 1000;
        const samples = [];
        const until = performance.now() + duration * 1.2;
        while (performance.now() < until) {
          samples.push(element.transform.baseVal.consolidate().matrix.e - start);
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        return { samples, length, scale, duration };
      }, CLOUD_TRAIN_LENGTH);
      assert(journey.samples.some(x => x > journey.length), "engine keeps moving beyond terminus while coaches leave");
      assert(journey.samples.some((x, i, xs) => i && x < xs[i - 1] - journey.length * .5), "next train lap starts automatically");
      const deltas = journey.samples.slice(1).map((x, i) => x - journey.samples[i]);
      assert(deltas.filter(dx => Math.abs(dx) < .01).length <= 1, "train does not park at terminus");
      return journey;
    };
    await checkFullJourney();
    // A single branch must still carry all ten coaches, scaled to its track.
    project = { ...makeInitialProject(), tasks: makeInitialProject().tasks.filter(task => ["wedding", "venue"].includes(task.id)) };
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.reload();
    await train.waitFor({ state: "visible" });
    await page.waitForTimeout(700);
    assert.equal(await page.locator("[data-cloud-consist]").getAttribute("data-coach-count"), "10");
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
    const shortJourney = await checkFullJourney();
    assert(shortJourney.scale < 1 && shortJourney.scale * CLOUD_TRAIN_LENGTH < shortJourney.length, "short bridge scales the entire train to fit");
    await page.screenshot({ path: `${out}/axis-short.png` });
    // Recover a lost GPU context; unavailable WebGL must not break tasks.
    await far.evaluate(el => {
      window.cloudContextRecovery = el.getContext("webgl2").getExtension("WEBGL_lose_context");
      window.cloudContextRecovery.loseContext();
    });
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="fallback"]').waitFor({ state: "attached" });
    assert(await page.locator(".cloud-sea-fallback").isVisible());
    assert(await train.isVisible());
    await page.waitForTimeout(150);
    await page.evaluate(() => window.cloudContextRecovery.restoreContext());
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        return kind === "webgl2" ? null : original.call(this, kind, ...args);
      };
    });
    await page.reload();
    await page.locator('[data-cloud-layer="background"][data-cloud-renderer="fallback"]').waitFor({ state: "attached" });
    assert(await page.locator(".cloud-sea-fallback").isVisible());
    await train.waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    console.log("PASS: ten-coach train on the real axis, real evolving GPU clouds, shared clock, actual frozen pixels, GPU loss/recovery/fallback, shared pause/resume, camera zoom/pan, task details, reduced motion, layout/theme switches, mobile bounds; no runtime errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
