"use client";
import { fetchLocal } from "@/lib/local-fetch";
import { useEffect, useRef, useState } from "react";
import { PlugZap, Save, ExternalLink } from "lucide-react";
import { LocalSearchLogin } from "./LocalSearchLogin";
import type { SearchProvider } from "@/lib/xhs-search";

export function SearchSettings({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [provider,setProvider]=useState<SearchProvider>("xiaohongshu-mcp");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchLocal("/api/search/settings",{signal:controller.signal,cache:"no-store"}).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法读取搜索设置");
      setConfigured(data.provider === "tavily" && data.configured === true);
      setProvider(data.provider === "tavily" ? "tavily" : "xiaohongshu-mcp");
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(()=>setLoading(false));
    return () => { controller.abort(); active.current?.abort(); };
  },[]);
  const submit = async (action: "test" | "save") => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(action);setError("");setFeedback("");
    try {
      const response = await fetchLocal("/api/search/settings",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,apiKey:key,action})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "搜索连接失败");
      setFeedback(data.message);
      if (action === "save") { setConfigured(true);setKey("");onSaved(); }
    } catch(error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "搜索设置失败"); }
    finally { active.current=null;setBusy(""); }
  };
  return <form className="search-settings-form" onSubmit={event=>{event.preventDefault();void submit("save");}}>
    <label className="field-label search-provider-choice">搜索方式<select aria-label="搜索方式" value={provider} disabled={loading||!!busy} onChange={event=>{setProvider(event.target.value as SearchProvider);setError("");setFeedback("");}}><option value="xiaohongshu-mcp">小红书站内 · 本地 MCP</option><option value="tavily">公开网页 · Tavily</option></select></label>
    {!loading && provider === "xiaohongshu-mcp" ? <LocalSearchLogin saving={!!busy} onSave={()=>void submit("save")}/> : provider === "tavily" && <>
    <p className="search-settings-description">搜索公开收录的笔记，在对话中查看来源、整理方案并生成任务建议。</p>
    <fieldset disabled={loading || !!busy}>
      <div className="search-provider"><strong>Tavily</strong><span>公开网页搜索</span><a href="https://app.tavily.com/" target="_blank" rel="noopener noreferrer">获取 API Key <ExternalLink size={12}/></a></div>
      <label className="field-label">Tavily API Key
        {configured && <span className="ai-key-state">已配置 · 留空保留</span>}
        <input aria-label="Tavily API Key" type="password" autoComplete="new-password" value={key} required={!configured} maxLength={4096} placeholder={configured ? "更换搜索密钥" : "输入 Tavily API Key"} onChange={event=>{setKey(event.target.value);setFeedback("");setError("");}}/>
      </label>
    </fieldset>
    <p className="search-settings-description">独立于模型配置；密钥保存在本机服务端。搜索结果取决于网页收录，部分笔记需登录小红书后查看。</p>
    </>}
    {loading && <p role="status">正在读取搜索设置…</p>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    {feedback && <p className="ai-settings-feedback" role="status">{feedback}</p>}
    {provider === "tavily" && <div className="modal-actions">
      <button type="button" className="secondary-button" disabled={loading || !!busy} onClick={event=>{if(event.currentTarget.form?.reportValidity())void submit("test");}}><PlugZap size={14}/>{busy === "test" ? "测试中…" : "测试连接"}</button>
      <button className="primary-button" disabled={loading || !!busy}><Save size={14}/>{busy === "save" ? "测试并保存中…" : "测试并保存"}</button>
    </div>}
  </form>;
}
