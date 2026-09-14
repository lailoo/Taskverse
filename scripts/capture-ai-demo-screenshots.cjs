/**
 * Capture AI capability screenshots with a clean, synthetic project.
 *
 * This script deliberately uses a fresh Playwright context and intercepts every
 * project/chat/AI request. It never reads .local/wedding.sqlite, browser storage,
 * or a real chat history. Keep provider credentials in local .env files only.
 */
const fs = require("node:fs");
const path = require("node:path");

const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const out = path.join(process.cwd(), "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

const task = (id, parentId, title, color, extra = {}) => ({
  id,
  parentId,
  title,
  color,
  description: "",
  owner: "",
  due: "",
  status: "todo",
  priority: "none",
  budget: 0,
  link: "",
  image: "",
  images: [],
  expanded: false,
  collapsed: false,
  ...extra,
});

const demoProject = {
  title: "Summer Wedding Plan",
  date: "2026-09-27",
  budget: 120000,
  tasks: [
    task("demo-root", null, "Plan Our Wedding", "purple"),
    task("demo-venue", "demo-root", "Venue & Catering", "blue", { status: "doing", priority: "high" }),
    task("demo-venue-compare", "demo-venue", "Compare outdoor venues", "blue", { owner: "Alex", due: "2026-04-30", priority: "high" }),
    task("demo-venue-tasting", "demo-venue", "Schedule tastings", "blue", { owner: "Sam", due: "2026-05-08" }),
    task("demo-guests", "demo-root", "Guests & Invitations", "mint", { status: "todo" }),
    task("demo-guest-list", "demo-guests", "Build both guest lists", "mint", { owner: "Alex", due: "2026-05-15" }),
    task("demo-budget", "demo-root", "Budget & Payments", "yellow", { status: "waiting" }),
    task("demo-budget-total", "demo-budget", "Set the overall budget", "yellow", { owner: "Sam", due: "2026-05-20" }),
  ],
};

const planningMessages = [
  { role: "user", content: "Plan our wedding for September 27 with a realistic first pass." },
  {
    role: "assistant",
    content: "Here is a practical first pass. I grouped the work by venue, guests, and budget so you can confirm the structure before it reaches the board.",
    tasks: [
      { title: "Book a photographer", parentId: "demo-root", description: "Compare two portfolios and hold a date.", owner: "Alex", due: "2026-06-01" },
      { title: "Choose the ceremony music", parentId: "demo-root", description: "Shortlist three songs and confirm licensing.", owner: "Sam", due: "2026-06-12" },
      { title: "Create a day-of timeline", parentId: "demo-root", description: "Draft setup, ceremony, dinner, and send-off times.", owner: "", due: "" },
    ],
    followUps: [
      { label: "Review the critical path", message: "Review the critical path and flag anything at risk." },
      { label: "Add a vendor shortlist", message: "Add a vendor shortlist under Venue & Catering." },
    ],
  },
];

const canvasMessages = [
  { role: "user", content: "Move the vendor shortlist under Venue & Catering and mark the venue comparison as in progress." },
  {
    role: "assistant",
    content: "I prepared a canvas preview. The changes stay read-only until you confirm them.",
    changes: [
      { type: "move", taskId: "demo-guest-list", parentId: "demo-venue" },
      { type: "status", taskId: "demo-venue-compare", status: "doing" },
      { type: "update", taskId: "demo-budget-total", title: "Confirm the overall budget" },
    ],
    changesApplied: false,
  },
];

const memoryMessages = [
  { role: "user", content: "We prefer an outdoor ceremony, want to stay near ¥120,000, and have already chosen the venue." },
  {
    role: "assistant",
    content: "Got it. I will keep the outdoor preference and confirmed venue decision in this conversation memory, and use them in the next review.",
    summary: "Venue is confirmed. Keep the ceremony outdoors, stay near the ¥120,000 budget, and next prepare the guest list.",
    memory: { weddingDate: "September 27, 2026", budget: "¥120,000", preferences: ["Outdoor ceremony"], decisions: ["Venue confirmed"] },
  },
];

function sessions() {
  return [
    { id: "demo-planning", title: "Plan our wedding", updatedAt: "2026-09-14T09:30:00.000Z" },
    { id: "demo-canvas", title: "Adjust the task map", updatedAt: "2026-09-14T09:20:00.000Z" },
    { id: "demo-memory", title: "Remember our decisions", updatedAt: "2026-09-14T09:10:00.000Z" },
  ];
}

function sessionData(id) {
  const messages = id === "demo-canvas" ? canvasMessages : id === "demo-memory" ? memoryMessages : planningMessages;
  return {
    id,
    revision: 1,
    summary: id === "demo-memory" ? memoryMessages[1].summary : "",
    memory: id === "demo-memory" ? memoryMessages[1].memory : { weddingDate: "", budget: "", preferences: [], decisions: [] },
    messages,
  };
}

async function main() {
  const browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1506, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem("taskverse-language", "en");
    localStorage.setItem("wedding-map-theme", "warm");
    localStorage.setItem("wedding-map-pets", "false");
  });
  const page = await context.newPage();

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/project") return json({ project: demoProject, revision: 1, savedAt: "2026-09-14T09:00:00.000Z", versions: [] });
    if (url.pathname === "/api/chats") {
      if (request.method() === "GET") return json(url.searchParams.get("id") ? sessionData(url.searchParams.get("id")) : sessions());
      if (request.method() === "POST") return json(sessionData("demo-planning"));
      if (request.method() === "PUT") return json({ revision: 1 });
    }
    if (url.pathname === "/api/ai" && request.method() === "GET") return json({ configured: true, model: "demo-model" });
    if (url.pathname === "/api/ai" && request.method() === "POST") return json({ reply: "Demo response", tasks: [], changes: [], followUps: [] });
    return route.abort();
  });

  async function openAssistant() {
    await page.goto("http://127.0.0.1:3010/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Wedding AI assistant" }).click();
    await page.waitForTimeout(250);
  }
  async function openSession(id) {
    await openAssistant();
    await page.getByRole("button", { name: new RegExp(id === "demo-planning" ? "Plan our wedding" : id === "demo-canvas" ? "Adjust the task map" : "Remember our decisions") }).click();
    await page.waitForTimeout(250);
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    console.log(name);
  }

  await openSession("demo-planning");
  await shot("capability-ai");
  await shot("capability-ai-planning");

  await openSession("demo-canvas");
  await shot("capability-ai-canvas");

  await openSession("demo-memory");
  const memory = page.locator("details.ai-memory-panel");
  if (!(await memory.getAttribute("open"))) await memory.locator("summary").click();
  await page.waitForTimeout(150);
  await shot("capability-ai-memory");

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
