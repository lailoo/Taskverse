import { normalizeNoteUrl, safeNoteImage, type SearchSource } from "./xhs-search";
export { safeNoteImage } from "./xhs-search";
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0,max) : "";

export function normalizeMCPFeeds(value: unknown): SearchSource[] {
  const feeds = object(value).feeds;
  if (!Array.isArray(feeds)) throw new Error("站内搜索返回格式不正确");
  const seen = new Set<string>(), sources: SearchSource[] = [];
  for (const raw of feeds) {
    const feed = object(raw), card=object(feed.noteCard), user=object(card.user), cover=object(card.cover);
    const id=text(feed.id,64), token=text(feed.xsecToken,1200), title=text(card.displayTitle,200);
    if (feed.modelType !== "note" || !title || !/^[a-zA-Z0-9_-]{6,64}$/.test(id) || seen.has(id)) continue;
    const url = new URL(`https://www.xiaohongshu.com/explore/${id}`);
    if (token) { url.searchParams.set("xsec_token",token);url.searchParams.set("xsec_source","pc_search"); }
    if (!normalizeNoteUrl(url.href)) continue;
    seen.add(id);
    const image=safeNoteImage(cover.urlDefault || cover.url || cover.urlPre);
    const author=text(user.nickname || user.nickName,100), likes=text(object(card.interactInfo).likedCount,30);
    sources.push({title,url:url.href,snippet:"",...(image?{image}:{}),...(author?{author}:{}),...(likes?{likes}:{})});
    if(sources.length===8)break;
  }
  return sources;
}

export function normalizeMCPNote(raw: unknown, url: string): SearchSource {
  const note=object(object(object(raw).data).note);
  const title=text(note.title,200), content=text(note.desc,6000), user=object(note.user);
  const normalized=normalizeNoteUrl(url);
  if (!normalized || (!title && !content) || (note.noteId && note.noteId !== new URL(normalized).pathname.split("/").at(-1))) throw new Error("无法读取这篇笔记，请打开原文查看");
  const images=Array.isArray(note.imageList) ? note.imageList.map(item=>{const row=object(item);return safeNoteImage(row.urlDefault || row.url || row.urlPre);}).filter((url):url is string=>!!url).slice(0,8) : [];
  return {title:title || "未命名笔记",url:normalized,snippet:content.slice(0,1000),content,images,...(images[0]?{image:images[0]}:{}),author:text(user.nickname || user.nickName,100),likes:text(object(note.interactInfo).likedCount,30)};
}
