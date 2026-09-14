// node --import tsx tests/desert-scene-browser.cjs
// Intercepted fixture requests keep the user's wedding database unchanged.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeInitialProject } = require("../src/lib/tasks.ts");
const { DEFAULT_DESERT_SETTINGS, DESERT_SETTINGS_KEY } = require("../src/lib/desert-settings.ts");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.DESERT_TEST_OUTPUT || "/tmp/desert-gate-check";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1506, height: 1100 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let project = makeInitialProject(), writes = 0;
    project.tasks.forEach((t,i) => { if (t.parentId) t.priority = ["none","low","medium","high"][i%4]; });
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/project", route => {
      if (route.request().method() === "PUT") { project = route.request().postDataJSON().project; writes++; }
      return route.fulfill({ json: { project, revision: writes+1, savedAt: new Date().toISOString() } });
    });
    await page.addInitScript(() => localStorage.setItem("wedding-map-pets","false"));
    await page.goto(process.env.DESERT_TEST_URL || "http://127.0.0.1:3010/");
    const theme = async value => {
      await page.getByTitle("项目设置", { exact: true }).first().click();
      await page.getByLabel("界面主题").selectOption(value);
      await page.getByRole("button", { name: "关闭设置" }).click();
    };
    await theme("desert");
    const canvas = page.locator("[data-desert-renderer]");
    const panel = page.getByRole("dialog", { name: "沙海参数" });
    const controls = page.getByRole("button", { name: "沙海参数", exact: true });
    const ready = async () => {
      await page.locator('[data-desert-renderer="ready"]').waitFor();
      await page.waitForTimeout(600);
    };
    await ready();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "desert");
    assert.equal(await page.locator("[data-desert-caravan] [data-camel]").count(),7);
    assert.equal(await canvas.evaluate(el=>getComputedStyle(el.parentElement).pointerEvents),"none");
    assert.equal(await page.locator(".desert-scene [data-camel]").count(),0,"caravan belongs to graph routes, never a detached background strip");
    assert.equal(await page.locator("[data-desert-trail]").count(),1,"one sand trail for the entire main axis");
    assert.equal(await page.locator("[data-desert-courier]").count(),project.tasks.length-1,"all task branches use camels rather than road cars");
    const axisPose = () => page.evaluate(() => {
      const car = document.querySelector("[data-desert-caravan]");
      const track = car.closest(".road-traffic").querySelector("path");
      const start = track.getPointAtLength(0), end = track.getPointAtLength(track.getTotalLength());
      const pose = car.transform.baseVal.consolidate().matrix;
      const matrix = track.getScreenCTM();
      const screenY = new DOMPoint(start.x,start.y).matrixTransform(matrix).y;
      const canvas = document.querySelector("[data-desert-renderer]");
      const groundY = canvas.getBoundingClientRect().y + Number(canvas.dataset.axisY);
      return { feetY: pose.f, routeY: start.y, screenY, groundY, x: pose.e, scale: pose.a,
        start: start.x, end: end.x, zoom: matrix.a, clip: car.closest("[clip-path]")?.getAttribute("clip-path") };
    });
    const assertAnchored = async () => {
      const pose = await axisPose();
      assert(Math.abs(pose.feetY-pose.routeY)<.001,"camel feet sit on the actual main path");
      assert(Math.abs(pose.screenY-pose.groundY)<1,"shader ground and graph axis share their screen anchor");
      assert(pose.clip?.startsWith("url("),"caravan is clipped to the route endpoints");
      return pose;
    };
    await assertAnchored();
    const initialWrites = writes;
    const snapshot = () => page.evaluate(() => ({
      time: document.querySelector("[data-desert-renderer]").dataset.sceneTime,
      wind: document.querySelector("[data-desert-renderer]").dataset.windTravel,
      city: document.querySelector("[data-desert-renderer]").dataset.cityTravel,
      caravan: document.querySelector("[data-desert-caravan]").dataset.caravanTravel,
      camels: [...document.querySelectorAll("[data-desert-caravan], [data-desert-courier]")].map(el=>el.getAttribute("transform")),
      legs: [...document.querySelectorAll("[data-camel-leg]")].map(el=>el.getAttribute("transform")),
    }));
    const start = await snapshot();
    const shell = await page.locator(".canvas-shell").boundingBox();
    const wallClip = { x: shell.x+180, y: shell.y+30, width: 180, height: 130 };
    const dustClip = { x: shell.x+120, y: shell.y+shell.height-65, width: 260, height: 40 };
    const wallBefore = await page.screenshot({ clip: wallClip });
    const dustBefore = await page.screenshot({ clip: dustClip });
    await page.waitForTimeout(500);
    const moved = await snapshot();
    assert(Number(moved.wind)>Number(start.wind));
    assert.notDeepEqual(moved.camels,start.camels,"caravan moves through the scene");
    assert.notDeepEqual(moved.legs,start.legs,"camels have articulated walking poses");
    assert.notDeepEqual(await page.screenshot({clip:wallClip}),wallBefore,"the city itself moves, independently of foreground dust");
    assert.notDeepEqual(await page.screenshot({clip:dustClip}),dustBefore,"dust is rendered dynamically");
    await page.getByRole("button",{name:"暂停沙海驼队"}).click();
    await page.waitForTimeout(80);
    const paused = await snapshot();
    const pausedWall = await page.screenshot({clip:wallClip});
    await page.waitForTimeout(200);
    assert.deepEqual(await page.screenshot({clip:wallClip}),pausedWall,"pause freezes actual city pixels");
    assert.deepEqual(await snapshot(),paused,"pause freezes scene and walking poses");
    const beforeCamera = await assertAnchored();
    await page.getByRole("button",{name:"放大",exact:true}).click();
    await page.waitForTimeout(400);
    const zoomedCamera = await assertAnchored();
    assert(zoomedCamera.zoom > beforeCamera.zoom,"zoom uses the same transform for caravan and path");
    assert.equal(zoomedCamera.scale,beforeCamera.scale,"zoom preserves caravan world geometry and cycle length");
    const mapBox = await page.locator(".canvas-shell").boundingBox();
    await page.mouse.move(mapBox.x+mapBox.width*.45,mapBox.y+mapBox.height*.36);
    await page.mouse.down(); await page.mouse.move(mapBox.x+mapBox.width*.45+80,mapBox.y+mapBox.height*.36+65,{steps:12}); await page.mouse.up();
    await page.waitForTimeout(150);
    const panned = await assertAnchored();
    assert(Math.abs(panned.screenY-zoomedCamera.screenY)>30,"the scene ground follows a real canvas pan");
    await page.getByRole("button",{name:"适应画布"}).click(); await page.waitForTimeout(450);
    await assertAnchored();
    const afterCamera = await snapshot();
    assert.equal(afterCamera.caravan,paused.caravan,"navigation while paused does not advance the journey");
    const world = await page.locator(".react-flow__viewport").getAttribute("style");
    await controls.click();
    assert.equal(await panel.getByRole("slider").count(),5);
    const setRange = async (name,value) => {
      await page.getByRole("slider",{name}).evaluate((el,value)=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,String(value));
        el.dispatchEvent(new Event("input",{bubbles:true}));
      },value);
      await page.waitForTimeout(70);
    };
    const frozenWall = await page.screenshot({clip:wallClip});
    await setRange("场景亮度",1.4);
    assert.notDeepEqual(await page.screenshot({clip:wallClip}),frozenWall,"appearance changes redraw the paused GPU scene");
    await setRange("巨城掠过速度",0);
    await setRange("风沙速度",0);
    await setRange("驼队速度",2);
    assert.deepEqual(await snapshot(),afterCamera,"changing speeds preserves all current positions");
    assert.equal(await page.locator(".react-flow__viewport").getAttribute("style"),world);
    await page.keyboard.press("Escape");
    assert.equal(await panel.count(),0);
    assert(await controls.evaluate(el=>el===document.activeElement));
    await page.getByRole("button",{name:"继续沙海驼队"}).click();
    await page.waitForTimeout(350);
    const independent = await snapshot();
    assert.equal(independent.wind,paused.wind,"wind can stop independently");
    assert.equal(independent.city,paused.city,"the city can stop independently from the caravan");
    assert(Number(independent.caravan)>Number(paused.caravan),"camels continue with wind stopped");
    // With wind stopped, the new city control must move actual architecture.
    await controls.click();
    await setRange("巨城掠过速度",1.5);
    await page.keyboard.press("Escape");
    const cityOnlyStart = await snapshot();
    const cityOnlyPixels = await page.screenshot({clip:wallClip});
    await page.waitForTimeout(400);
    const cityOnlyEnd = await snapshot();
    assert(Number(cityOnlyEnd.city)>Number(cityOnlyStart.city));
    assert.equal(cityOnlyEnd.wind,cityOnlyStart.wind);
    assert.notDeepEqual(await page.screenshot({clip:wallClip}),cityOnlyPixels,"camera movement changes metal wall pixels with wind disabled");
    assert.equal(writes,initialWrites,"theme and scene settings never change task data");
    await page.reload(); await ready();
    await controls.click();
    assert.equal(await page.getByRole("slider",{name:"驼队速度"}).inputValue(),"2");
    assert.equal(await page.getByRole("slider",{name:"风沙速度"}).inputValue(),"0");
    assert.equal(await page.getByRole("slider",{name:"巨城掠过速度"}).inputValue(),"1.5");
    await panel.getByRole("button",{name:"恢复默认"}).click();
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),DESERT_SETTINGS_KEY),DEFAULT_DESERT_SETTINGS);
    await page.screenshot({path:`${out}/verified-controls.png`});
    await page.getByRole("button",{name:"关闭沙海参数"}).click();
    await page.locator('.react-flow__node[data-id="venue"] .task-title').dblclick();
    await page.getByRole("dialog",{name:"任务详情：场地与餐饮"}).waitFor();
    await page.waitForTimeout(350); // Wait for the existing detail opening animation before the visual snapshot.
    await page.screenshot({path:`${out}/verified-details.png`});
    await page.getByRole("button",{name:"关闭任务详情"}).click();
    const cardColors = await page.locator(".canvas-shell .ticket-card").evaluateAll(cards=>[...new Set(cards.map(card=>getComputedStyle(card).backgroundColor))]);
    assert(cardColors.length>=4,"priority colors remain distinct in the desert theme");
    await page.getByRole("button",{name:"放大",exact:true}).click();
    await page.waitForTimeout(250);
    assert.equal(await canvas.evaluate(el=>getComputedStyle(el).transform),"none","background doesn't jump with map zoom");
    await page.getByRole("button",{name:"适应画布"}).click();
    await page.waitForTimeout(350);
    await page.screenshot({path:`${out}/verified-desktop.png`});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"适应画布"}).click();
    await controls.click(); await page.waitForTimeout(150);
    const box = await panel.boundingBox(), stage = await page.locator(".canvas-shell").boundingBox();
    assert(box.x>=0 && box.x+box.width<=390 && box.y>=stage.y,"mobile panel stays inside canvas");
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${out}/verified-mobile.png`});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.waitForTimeout(100);
    const reduced=await snapshot();
    await setRange("场景亮度",.9);
    await page.waitForTimeout(150);
    assert.deepEqual(await snapshot(),reduced);
    await assertAnchored();
    await page.getByRole("button",{name:"关闭沙海参数"}).click();
    await page.setViewportSize({width:1506,height:1100});
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.getByRole("button",{name:"切换为分层树状布局"}).click();
    assert.equal(await canvas.count(),0,"text outline doesn't run a hidden GPU scene");
    await page.getByRole("button",{name:"切换为脑图布局"}).click(); await ready();
    await theme("cloud");
    await page.locator('[data-cloud-renderer="ready"]').first().waitFor();
    assert.equal(await page.locator("[data-cloud-train]").count(),1,"original cloud train stays available");
    assert.equal(await canvas.count(),0);
    await theme("desert"); await ready();
    await canvas.evaluate(el=>{
      window.desertRecovery=el.getContext("webgl2").getExtension("WEBGL_lose_context");
      window.desertRecovery.loseContext();
    });
    await page.locator('[data-desert-renderer="fallback"]').waitFor({state:"attached"});
    assert(await page.locator(".desert-scene-fallback").isVisible());
    assert((await page.request.get(new URL("/assets/desert-gate/fallback.webp",page.url()).href)).ok());
    await page.waitForTimeout(150);
    await page.evaluate(()=>window.desertRecovery.restoreContext()); await ready();
    await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==="webgl2"?null:original.call(this,kind,...args);};
    });
    await page.reload();
    await page.locator('[data-desert-renderer="fallback"]').waitFor({state:"attached"});
    assert(await page.locator(".desert-scene-fallback").isVisible());
    assert.deepEqual(errors,[]);
    console.log("PASS: route-bound caravan and branch couriers, world-space feet and ground, pan/zoom, dynamic wind and camel gait, moving city with independent speed and frozen pixels, parameters, persistence, task details, priorities, mobile, reduced motion, theme switches, WebGL recovery/fallback");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
