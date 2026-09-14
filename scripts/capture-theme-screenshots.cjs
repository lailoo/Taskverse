const fs = require('node:fs');
const path = require('node:path');
const { makeInitialProject } = require('../src/lib/tasks.ts');
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.join(process.cwd(), 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
// Keep the public showcase focused on the two primary product worlds.
const themes = ['rose','cloud'];
(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1506,height:1100}, deviceScaleFactor:1});
  const project=makeInitialProject();
  await page.route("**/api/**", route => route.abort("blockedbyclient"));
  await page.route('**/api/project', route=>route.fulfill({json:{project,revision:1,savedAt:new Date().toISOString()}}));
  await page.addInitScript(()=>localStorage.setItem('wedding-map-pets','false'));
  for (const theme of themes) {
   await page.addInitScript(value=>localStorage.setItem('wedding-map-theme', value), theme);
   await page.goto('http://127.0.0.1:3010/?scene=cloud-railway');
   await page.waitForTimeout(theme==='cloud'?1500:500);
   await page.screenshot({path:path.join(out, `${theme}.png`), fullPage:true});
   console.log(theme);
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
