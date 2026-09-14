import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMCPFeeds, normalizeMCPNote, safeNoteImage } from "../src/lib/xhs-mcp-data";
import { validSearchResult, searchContextText } from "../src/lib/xhs-search";
const id = "66abcdef0123456789012345";
const image = "https://sns-webpic-qc.xhscdn.com/20260914/example";
const feed = { id, xsecToken: "note-token", modelType: "note", noteCard: { displayTitle: "花园婚礼", user: { nickname:"作者" }, cover: {urlDefault:image}, interactInfo:{likedCount:"42"} } };

test("station search normalizes real notes, image links and author without inventing descriptions",()=>{
  const sources = normalizeMCPFeeds({feeds:[feed,{id:"bad",modelType:"hot_query"},feed]});
  assert.equal(sources.length,1);assert.equal(sources[0].author,"作者");assert.equal(sources[0].image,image);
  assert.equal(sources[0].snippet,"");assert.equal(sources[0].likes,"42");
  assert.match(sources[0].url,/xsec_token=note-token/);
  const result={provider:"xiaohongshu-mcp" as const,query:"婚礼",searchedAt:new Date().toISOString(),sources};
  assert(validSearchResult(result));assert.match(searchContextText(result),/尚未读取正文/);
});
test("note details preserve text and safe pictures, but do not pass executable or unrelated URLs",()=>{
  const source=normalizeMCPFeeds({feeds:[feed]})[0];
  const note=normalizeMCPNote({data:{note:{noteId:id,title:"花园婚礼",desc:"先确认下雨备选场地。",imageList:[{urlDefault:image},{urlDefault:"https://evil.test/tracker"}],user:{nickname:"作者"}}}},source.url);
  assert.equal(note.content,"先确认下雨备选场地。");assert.deepEqual(note.images,[image]);
  assert.equal(safeNoteImage("https://xhscdn.com.evil.test/a"),undefined);
  assert.equal(safeNoteImage("javascript:alert(1)"),undefined);
  assert.throws(()=>normalizeMCPNote({data:{}},source.url),/笔记/);
});
