"use client";
import { useState } from "react";
import { ExternalLink, Search, ListPlus, BookOpen } from "lucide-react";
import { selectedSourcePrompt, type SearchResult } from "@/lib/xhs-search";

export function SearchSources({ result, disabled, onSuggest, onRead, canSuggest = true }: { result: SearchResult; disabled: boolean; onSuggest: (prompt: string) => void; onRead?: (index:number)=>void; canSuggest?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <div className="ai-search-results" aria-label={`小红书搜索结果：${result.query}`}>
    <div className="ai-search-heading"><strong><Search size={13}/>小红书 · {result.provider === "xiaohongshu-mcp" ? "站内搜索" : "公开笔记"}</strong><span>{result.sources.length} 篇</span></div>
    <div className="ai-source-list">
      {result.sources.map((source,index)=><article className="ai-source-card" key={source.url}>
        <input type="checkbox" aria-label={`选择笔记：${source.title}`} disabled={disabled} checked={selected.includes(source.url)} onChange={event=>setSelected(current=>event.target.checked ? [...current,source.url] : current.filter(url=>url!==source.url))}/>
        <div className="ai-source-content">
          {source.image && <a className="ai-source-cover" href={source.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"><img src={source.image} loading="lazy" referrerPolicy="no-referrer" alt="" onError={event=>{event.currentTarget.style.display="none";}}/></a>}
          <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={source.title}><span className="ai-source-number">{index+1}</span><strong>{source.title}</strong><ExternalLink size={12}/></a>
          <p>{source.snippet || (result.provider === "xiaohongshu-mcp" ? "可读取笔记正文，再整理为任务建议。" : "暂无公开摘要，可打开原文查看。")}</p>
          <small>{source.author || "xiaohongshu.com"}{source.likes ? ` · ${source.likes} 赞` : ""} · {source.content !== undefined ? "已读正文" : result.provider === "xiaohongshu-mcp" ? "站内笔记" : "收录摘要"}</small>
          {source.content !== undefined && <details className="ai-note-detail"><summary>查看笔记正文</summary><div>{source.content || "这篇笔记没有文字正文。"}</div>{!!source.images?.length && <div className="ai-note-images">{source.images.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="笔记配图" loading="lazy" referrerPolicy="no-referrer"/></a>)}</div>}</details>}
          {result.provider === "xiaohongshu-mcp" && source.content === undefined && onRead && <button type="button" className="ai-note-read" disabled={disabled} onClick={()=>onRead(index)}><BookOpen size={12}/>读取笔记</button>}
        </div>
      </article>)}
    </div>
    <div className="ai-search-footer"><span>{new Date(result.searchedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} 检索</span><a href={`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(result.query)}`} target="_blank" rel="noopener noreferrer">去站内搜索 <ExternalLink size={11}/></a></div>
    {result.sources.length > 0 && <button className="secondary-button ai-source-suggest" aria-label="根据所选笔记生成任务建议" disabled={disabled || !canSuggest || !selected.length} onClick={()=>onSuggest(selectedSourcePrompt(result.sources.filter(source=>selected.includes(source.url))))}><ListPlus size={14}/>{selected.length ? `用所选 ${selected.length} 篇生成任务建议` : "勾选笔记，整理为任务建议"}</button>}
  </div>;
}
