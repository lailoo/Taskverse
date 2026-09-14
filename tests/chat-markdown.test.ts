import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "../src/components/wedding/ChatMarkdown";
import { makeInitialProject } from "../src/lib/tasks";
import { resolveTaskReference } from "../src/lib/task-references";

test("task references resolve titles and unique short IDs without linking ambiguous IDs", () => {
  const { tasks } = makeInitialProject();
  tasks.push({ ...tasks[1], id: "task-12345678-abcd", title: "邀请嘉宾" });
  const html = renderToStaticMarkup(createElement(ChatMarkdown, { tasks, content: "1. venue 场地与餐饮\n2. task-12345678\n3. [查看](#task/venue-1)\n\n```text\nvenue\n```" }));
  assert.equal((html.match(/class="ai-task-reference"/g) || []).length, 3);
  assert.equal((html.match(/ai-task-reference-title">场地与餐饮/g) || []).length, 1);
  assert.ok(html.includes("邀请嘉宾"));
  assert.ok(html.includes("<pre><code"));
  tasks.push({ ...tasks[1], id: "task-12345678-efgh" });
  assert.equal(resolveTaskReference(tasks, "task-12345678"), undefined);
  assert.equal(resolveTaskReference(tasks, "task-unknown"), undefined);
});

test("date groups and escaped numbered items keep their original line breaks", () => {
  const content = "▍9/15–9/18\n5\\. 设计请柬\n6\\. 确认摄影\n\n▍9/19–9/24\n10\\. 编制座位表\n11\\. 安排签到";
  const html = renderToStaticMarkup(createElement(ChatMarkdown, { content }));
  assert.equal((html.match(/<br\/>/g) || []).length, 4);
  assert.ok(html.includes("5. 设计请柬<br/>"));
  const code = renderToStaticMarkup(createElement(ChatMarkdown, { content: "```text\nfirst\nsecond\n```" }));
  assert.doesNotMatch(code, /<br/);
});

test("AI replies render Markdown and GFM while excluding executable markup", () => {
  const content = "## 本周安排\n\n- **确认场地**\n- [x] 整理预算\n\n| 任务 | 日期 |\n| --- | --- |\n| 试菜 | 周六 |\n\n```js\nconst ready = true;\n```\n\n[参考](https://example.com)\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))";
  const html = renderToStaticMarkup(createElement(ChatMarkdown, { content }));
  for (const fragment of ["<h2>", "<strong>", "<table>", "<pre>", "type=\"checkbox\"", "noopener noreferrer"]) assert.ok(html.includes(fragment), fragment);
  assert.doesNotMatch(html, /<script|href="javascript:/);
});
