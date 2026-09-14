// Run against production 3010: node --import tsx tests/cloud-controls-browser.cjs
// Project reads/writes are isolated from the user's SQLite database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const { CLOUD_SETTINGS_KEY, DEFAULT_CLOUD_SETTINGS } = require("../src/lib/cloud-settings.ts");
const { cloudTrainLoopLength } = require("../src/lib/cloud-train.ts");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.CLOUD_TEST_OUTPUT || "/tmp/cloud-controls-check";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1506, height: 1100 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const project = makeInitialProject();
    let writes = 0;
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project", route => {
      if (route.request().method() !== "GET") writes++;
      return route.fulfill({ json: { project, revision: 1, savedAt: new Date().toISOString() } });
    });
    await page.addInitScript(() => {
      localStorage.setItem("wedding-map-theme", "cloud");
      localStorage.setItem("wedding-map-pets", "false");
    });
    const far = page.locator('[data-cloud-layer="background"]');
    const near = page.locator('[data-cloud-layer="foreground"]');
    const trigger = page.getByRole("button", { name: "云海参数", exact: true });
    const panel = page.getByRole("dialog", { name: "云海参数" });
    const ready = async () => {
      await page.locator('[data-cloud-layer="background"][data-cloud-renderer="ready"]').waitFor();
      await page.waitForTimeout(700);
    };
    const settings = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), CLOUD_SETTINGS_KEY);
    const range = (label) => page.getByRole("slider", { name: label });
    const setRange = async (label, value) => {
      await range(label).evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
      await page.waitForTimeout(70);
    };
    const motion = () => page.evaluate(() => {
      const far = document.querySelector('[data-cloud-layer="background"]');
      const near = document.querySelector('[data-cloud-layer="foreground"]');
      const train = document.querySelector('[data-cloud-train]');
      return { time: Number(far.dataset.cloudTime), far: Number(far.dataset.cloudTravel),
        near: Number(near.dataset.cloudTravel), train: train.getAttribute("transform") };
    });
    await page.goto(process.env.CLOUD_TEST_URL || "http://127.0.0.1:3010/");
    await ready();
    const baselineWrites = writes;
    await page.getByRole("button", { name: "暂停主轴列车" }).click();
    await page.waitForTimeout(100);
    const camera = await page.locator(".react-flow__viewport").getAttribute("style");
    const rails = await page.locator("[data-cloud-railway]").innerHTML();
    const stopped = await motion();
    await trigger.click();
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    assert.equal(await panel.getByRole("slider").count(), 6);
    await page.keyboard.press("Escape");
    assert.equal(await panel.count(), 0);
    assert(await trigger.evaluate(el => el === document.activeElement), "Escape restores trigger focus");
    await trigger.click();

    const shell = await page.locator(".canvas-shell").boundingBox();
    const clip = { x: shell.x + 100, y: shell.y + 30, width: 500, height: 250 };
    const initialPixels = await page.screenshot({ clip });
    await setRange("亮度", 1.4);
    const brightPixels = await page.screenshot({ clip });
    assert.notDeepEqual(initialPixels, brightPixels, "brightness updates the actual paused shader");
    await setRange("云量", 1.5);
    assert.notDeepEqual(brightPixels, await page.screenshot({ clip }), "cloud amount updates GPU geometry");
    assert.deepEqual(await motion(), stopped, "appearance changes never advance or reset clocks/train");
    const balancedSize = await far.evaluate(el => el.width * el.height);
    await page.getByRole("combobox", { name: "画质", exact: true }).selectOption("high");
    await page.waitForFunction(() => document.querySelector('[data-cloud-layer="background"]').dataset.cloudQuality === "high");
    assert(await far.evaluate(el => el.width * el.height) > balancedSize, "high quality increases render resolution");
    assert.deepEqual(await motion(), stopped, "quality change retains scene time and travel");
    await page.getByRole("combobox", { name: "画质", exact: true }).selectOption("economy");
    await page.waitForFunction(() => document.querySelector('[data-cloud-layer="background"]').dataset.cloudQuality === "economy");
    assert(await far.evaluate(el => el.width * el.height) < balancedSize);
    assert.equal(await far.getAttribute("data-cloud-renderer"), "ready");
    await panel.getByRole("button", { name: "恢复默认" }).click();
    assert.deepEqual(await settings(), DEFAULT_CLOUD_SETTINGS);
    await range("远云速度").focus();
    await page.keyboard.press("Home");
    await range("近云速度").focus();
    await page.keyboard.press("End");
    await page.getByLabel("动态光照").uncheck();
    assert.equal((await settings()).farSpeed, 0, "sliders support keyboard input");
    assert.equal((await settings()).nearSpeed, 2);
    assert.equal(await page.locator(".react-flow__viewport").getAttribute("style"), camera, "adjustments do not change the camera");
    assert.equal(await page.locator("[data-cloud-railway]").innerHTML(), rails, "adjustments preserve the fixed SVG bridge");
    assert.deepEqual(await motion(), stopped, "speed changes retain current phase while paused");
    await page.getByRole("button", { name: "继续主轴列车" }).click();
    assert.equal(await panel.count(), 0, "click outside closes without blocking that action");
    await page.waitForTimeout(400);
    const advancing = await motion();
    assert.equal(advancing.far, stopped.far, "zero far speed freezes far cloud geometry");
    assert(advancing.near > stopped.near, "near cloud travel is independent");
    const baseTravel = t => Math.sin(1.2 * t) + 4 * t;
    assert(Math.abs((advancing.near - stopped.near) / (baseTravel(advancing.time) - baseTravel(stopped.time)) - 2) < .02);

    await trigger.click();
    const loop = await page.locator("[data-cloud-train]").evaluate(el => el.closest(".road-traffic").querySelector("path").getTotalLength());
    const trainSample = () => page.locator("[data-cloud-train]").evaluate(el => ({ x: el.transform.baseVal.consolidate().matrix.e, time: performance.now() }));
    const speed = async multiplier => {
      await setRange("列车速度", multiplier);
      const a = await trainSample();
      await page.waitForTimeout(450);
      const b = await trainSample();
      return ((b.x - a.x + cloudTrainLoopLength(loop)) % cloudTrainLoopLength(loop)) / (b.time - a.time);
    };
    const slow = await speed(.5), fast = await speed(2);
    assert(fast / slow > 3 && fast / slow < 5, `train speed scales continuously: ${fast / slow}`);
    await page.getByRole("button", { name: "暂停主轴列车" }).click();
    await trigger.click();
    await setRange("运动模糊", .3);
    const beforeReload = await settings();
    assert.equal(writes, baselineWrites, "visual settings never write task project/versions");
    await page.reload();
    await ready();
    // Workspace resaves the loaded project once on each mount, independently
    // of scene preferences. Only count writes within each mounted session.
    const reloadedWrites = writes;
    await trigger.click();
    assert.equal(await range("列车速度").inputValue(), "2");
    assert.equal(await range("远云速度").inputValue(), "0");
    assert.equal(await range("近云速度").inputValue(), "2");
    assert.equal(await range("运动模糊").inputValue(), "0.3");
    assert.equal(await page.getByLabel("动态光照").isChecked(), false);
    assert.deepEqual(await settings(), beforeReload, "initial render doesn't overwrite saved preferences");
    await panel.getByRole("button", { name: "恢复默认" }).click();
    await page.screenshot({ path: `${out}/controls-desktop.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobile = await panel.boundingBox(), mobileShell = await page.locator(".canvas-shell").boundingBox();
    assert(mobile.x >= 0 && mobile.x + mobile.width <= 390, "panel stays within mobile width");
    assert(mobile.y >= mobileShell.y && mobile.y + mobile.height < mobileShell.y + mobileShell.height, "panel fits the canvas height");
    await panel.getByRole("button", { name: "恢复默认" }).scrollIntoViewIfNeeded();
    assert(await panel.getByRole("button", { name: "恢复默认" }).isVisible());
    await page.screenshot({ path: `${out}/controls-mobile.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    const reduced = await motion();
    await setRange("列车速度", 3);
    await setRange("亮度", .6);
    assert.deepEqual(await motion(), reduced, "settings respect reduced motion");
    assert.equal(writes, reloadedWrites, "mobile settings also leave the project untouched");

    await page.evaluate(key => localStorage.setItem(key, "{invalid"), CLOUD_SETTINGS_KEY);
    await page.reload();
    await ready();
    await trigger.click();
    assert.equal(await range("列车速度").inputValue(), "1", "corrupt preferences fall back safely");
    assert.equal(await page.getByRole("combobox", { name: "画质", exact: true }).inputValue(), "balanced");
    assert.deepEqual(errors, []);
    console.log("PASS: cloud controls — GPU updates, continuous speed, fixed railway, persistence, keyboard, mobile, reduced motion, no task writes");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
