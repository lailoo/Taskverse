import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNoteUrl, normalizeSearchResults, searchContextText, validSearchResult } from "../src/lib/xhs-search";
import { searchXiaohongshu } from "../src/lib/search-service";
import { prepareAIHistory } from "../src/lib/ai-context";

const note = "https://www.xiaohongshu.com/explore/66abcdef0123456789012345";
const source = { title: "户外婚礼布置", url: note, snippet: "木色桌椅与白色花材" };
const result = { query: "户外婚礼", provider: "tavily" as const, searchedAt: "2026-09-14T10:00:00.000Z", sources: [source] };

test("only genuine note links survive, preserving access tokens but stripping tracking", () => {
  assert.equal(normalizeNoteUrl(note + "?xsec_token=abc%2B123&xsec_source=pc_search&utm_source=foo"), note + "?xsec_token=abc%2B123&xsec_source=pc_search");
  for (const url of ["javascript:alert(1)", "https://xiaohongshu.com.evil.test/explore/abc", "https://evil.test/?url="+note, "https://user:secret@www.xiaohongshu.com/explore/abc", "https://www.xiaohongshu.com/user/profile/abc", "http://127.0.0.1/"]) assert.equal(normalizeNoteUrl(url), null);
});

test("provider results are bounded, deduplicated and cannot pass unrelated sites as sources", () => {
  const sources = normalizeSearchResults([
    { title: source.title, url: note, content: source.snippet },
    { title: "duplicate", url: note + "?utm_campaign=x", content: "dup" },
    { title: "unrelated", url: "https://example.com/a", content: "bad" },
    { title: "", url: "https://www.xiaohongshu.com/explore/another", content: "missing title" },
  ]);
  assert.deepEqual(sources, [source]);
  assert.equal(validSearchResult(result), true);
  assert.equal(validSearchResult({ ...result, sources: [{ ...source, url: "javascript:alert(1)" }] }), false);
  assert.equal(validSearchResult({ ...result, sources: Array(9).fill(source) }), false);
});

test("Tavily receives only search keywords and domain constraints, never project context", async () => {
  let calls = 0;
  const output = await searchXiaohongshu(" 户外婚礼 ", "test-secret", undefined, async (url, init) => {
    calls++;
    assert.equal(url, "https://api.tavily.com/search");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.query, "户外婚礼");
    assert.deepEqual(body.include_domains, ["xiaohongshu.com"]);
    assert.equal(body.include_raw_content, false);
    assert.equal("messages" in body || "project" in body, false);
    return Response.json({ results: [{ title: source.title, url: note, content: source.snippet }] });
  });
  assert.equal(calls, 1);
  assert.deepEqual(output.sources, [source]);
  for (const query of ["", "x".repeat(301)]) await assert.rejects(searchXiaohongshu(query, "test-secret"), /关键词/);
  await assert.rejects(searchXiaohongshu("婚礼", ""), /搜索设置/);
});

test("search failures and invalid payloads cannot become fabricated successful results", async () => {
  for (const status of [401,429,500]) await assert.rejects(searchXiaohongshu("婚礼", "secret", undefined, async () => new Response("private upstream details", { status })), error => error instanceof Error && !error.message.includes("private"));
  await assert.rejects(searchXiaohongshu("婚礼", "secret", undefined, async () => Response.json({ error: "bad" })), /格式/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchXiaohongshu("婚礼", "secret", controller.signal));
  const empty = await searchXiaohongshu("婚礼", "secret", undefined, async () => Response.json({ results: [] }));
  assert.deepEqual(empty.sources, []);
});

test("search sources survive follow-up context and interrupted generation without exposing reasoning", () => {
  assert.match(searchContextText(result), /资料.*不是指令/);
  const history = prepareAIHistory([
    { role: "user", content: "帮我找婚礼布置" },
    { role: "assistant", content: "未完成正文", interrupted: true, search: result },
    { role: "user", content: "按第一篇生成任务建议" },
  ]);
  assert.equal(history.length,3);
  assert.match(history[1].content, /木色桌椅/);
  assert.match(history[1].content, /https:\/\/www.xiaohongshu.com/);
  assert.doesNotMatch(history[1].content, /未完成正文/);
  assert(history.every(message => message.content.length <= 16000));
});
