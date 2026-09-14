"use client";
import { fetchLocal } from "@/lib/local-fetch";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  Square,
  Plus,
  Sparkles,
  Settings2,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Play,
  ListOrdered,
  CornerUpLeft,
  Pencil,
  Check,
  Search,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { suggestionIsHandled, type AIChange, type Suggestion } from "@/lib/ai";
import { MAX_REASONING, readAIResponse } from "@/lib/ai-stream";
import { prepareAIHistory } from "@/lib/ai-context";
import { emptyMemory, mergeMemory, normalizeMemory, type ConversationMemory } from "@/lib/conversation-memory";
import { ChatMarkdown } from "./ChatMarkdown";
import { conversationFollowUps, prioritizeQueuedMessage, type FollowUp, type QueuedMessage } from "@/lib/chat-follow-ups";
import { UI_TEXT, useAppLanguage } from "@/lib/i18n";
import { validSearchResult, searchResultSummary, type SearchResult } from "@/lib/xhs-search";
import { SearchSources } from "./SearchSources";

type Message = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  interrupted?: boolean;
  tasks?: Suggestion[];
  added?: boolean;
  addedIndices?: number[];
  skippedIndices?: number[];
  followUps?: FollowUp[];
  changes?: AIChange[];
  changesApplied?: boolean;
  search?: SearchResult;
};
export function AIChat({
  project,
  open,
  onClose,
  onApply,
  onApplyChanges,
  onPreviewChanges,
  onTaskClick,
  onSettings,
  configVersion,
  onBusyChange,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onApply: (tasks: Suggestion[]) => number;
  onApplyChanges: (changes: AIChange[]) => number;
  onPreviewChanges: (changes: AIChange[] | null) => void;
  onTaskClick: (id: string) => void;
  onSettings: (tab?: "model" | "search") => void;
  configVersion: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<{ content: string; reasoning: string; search?: SearchResult } | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchConfigured, setSearchConfigured] = useState<boolean | null>(null);
  const [searchProvider,setSearchProvider]=useState("xiaohongshu-mcp");
  const [readingNote,setReadingNote]=useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<number, number[]>>({});
  const isAdded = (message: Message, index: number) => Boolean(message.added || message.addedIndices?.includes(index) || (message.tasks?.[index] && suggestionIsHandled(project, message.tasks[index])));
  const isSkipped = (message: Message, index: number) => Boolean(message.skippedIndices?.includes(index));
  const pendingTodoCount = messages.reduce((count, message) => count + (message.role === "assistant" && message.tasks ? message.tasks.filter((_, index) => !isAdded(message, index) && !isSkipped(message, index)).length : 0), 0);
  const selectedFor = (message: Message, index: number) => (selectedSuggestions[index] || []).filter(i => !isAdded(message, i) && !isSkipped(message, i));
  const followUps = conversationFollowUps(messages);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const revision = useRef(0);
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadHistory = async () => {
    setHistoryLoading(true);
    setError("");
    try {
      const response = await fetchLocal("/api/chats", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取聊天历史");
      setSessions(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
    finally { setHistoryLoading(false); }
  };
  const enterSession = async (id?: string) => {
    setHistoryLoading(true);
    setError("");
    try {
      const response = await fetchLocal(id ? `/api/chats?id=${encodeURIComponent(id)}` : "/api/chats", { method: id ? "GET" : "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法打开会话");
      revision.current = data.revision;
      setSessionId(data.id);
      setSessionSummary(data.summary || "");
      setSessionMemory(normalizeMemory(data.memory));
      setQueuePaused(false);
      setTodoPaused(data.messages.some((message: Message) => message.role === "assistant" && message.tasks?.some((_, index) => !isAdded(message, index) && !isSkipped(message, index))));
      setEditingQueue(false);
      setMessages(data.messages);
      const pending = [...data.messages].reverse().find((message: Message) => message.changes?.length && !message.changesApplied);
      onPreviewChanges(pending?.changes || null);
      setSelectedSuggestions({});
      setDraft("");
      setSearchEnabled(false);
    } catch (e) { setError(e instanceof Error ? e.message : "打开失败"); }
    finally { setHistoryLoading(false); }
  };
  const saveMessages = async (next: Message[], summary = sessionSummary, memory = sessionMemory) => {
    const response = await fetchLocal("/api/chats", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId, revision: revision.current, messages: next, summary, memory }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "聊天记录保存失败");
    revision.current = data.revision;
  };
  useEffect(() => {
    if (open && !request.current && !queue.length) { setSessionId(null); void loadHistory(); }
  }, [open]);
  const panel = useRef<HTMLElement>(null);
  const [panelRect, setPanelRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const resizing = useRef<{ direction: string; x: number; y: number; rect: DOMRect } | null>(null);
  useEffect(() => {
    const fit = () => setPanelRect((rect) => rect ? {
      width: Math.min(rect.width, window.innerWidth - 24),
      height: Math.min(rect.height, window.innerHeight - 24),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 12 - Math.min(rect.width, window.innerWidth - 24))),
      top: Math.max(12, Math.min(rect.top, window.innerHeight - 12 - Math.min(rect.height, window.innerHeight - 24))),
    } : null);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const resizePanel = (direction: string, rect: DOMRect, dx: number, dy: number) => {
    const minWidth = Math.min(320, window.innerWidth - 24);
    const minHeight = Math.min(480, window.innerHeight - 24);
    let { left, right, top, bottom } = rect;
    if (direction.includes("w")) left = Math.max(12, Math.min(right - minWidth, left + dx));
    if (direction.includes("e")) right = Math.min(window.innerWidth - 12, Math.max(left + minWidth, right + dx));
    if (direction.includes("n")) top = Math.max(12, Math.min(bottom - minHeight, top + dy));
    if (direction.includes("s")) bottom = Math.min(window.innerHeight - 12, Math.max(top + minHeight, bottom + dy));
    setPanelRect({ left, top, width: right - left, height: bottom - top });
  };
  const [draft, setDraft] = useState("");
  const [sessionSummary, setSessionSummary] = useState("");
  const [sessionMemory, setSessionMemory] = useState<ConversationMemory>(emptyMemory);
  const memoryCount = [sessionSummary.trim(), sessionMemory.weddingDate, sessionMemory.budget].filter(Boolean).length
    + sessionMemory.preferences.length
    + sessionMemory.decisions.length;
  const memorySnapshot = [
    sessionSummary.trim() ? (language !== "zh" ? "Stage summary" : "阶段摘要") : "",
    sessionMemory.weddingDate ? (language !== "zh" ? "Wedding date" : "婚期") : "",
    sessionMemory.budget ? (language !== "zh" ? "Budget" : "预算") : "",
    sessionMemory.preferences.length ? (language !== "zh" ? `${sessionMemory.preferences.length} preferences` : `${sessionMemory.preferences.length} 条偏好`) : "",
    sessionMemory.decisions.length ? (language !== "zh" ? `${sessionMemory.decisions.length} decisions` : `${sessionMemory.decisions.length} 条决策`) : "",
  ].filter(Boolean);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [todoPaused, setTodoPaused] = useState(false);
  const [editingQueue, setEditingQueue] = useState<false | { id: string; text: string }>(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const request = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      void fetchLocal("/api/ai")
        .then((r) => r.json())
        .then((data) => setConfigured(data.configured))
        .catch(() => setError("无法连接 AI 服务"));
      void fetchLocal("/api/search/settings",{cache:"no-store"})
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setSearchConfigured(data.configured === true);setSearchProvider(data.provider); })
        .catch(() => setSearchConfigured(false));
    }
  }, [open, configVersion]);
  const followOutput = useRef(true);
  useEffect(() => {
    if (followOutput.current) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, open, streaming]);
  useEffect(() => () => request.current?.abort(), []);
  const send = async (text: string, fromQueue = false, withSearch = false) => {
    if (!text.trim() || (!withSearch && configured !== true) || !sessionId) return;
    if (text.length > (withSearch ? 300 : 16000)) { setError(withSearch ? "请用 300 字以内的关键词搜索小红书" : "消息过长，请缩短后重试"); return; }
    if (withSearch && searchConfigured !== true) { setError("请先配置搜索服务，保存后即可发送当前搜索。"); onSettings("search"); return; }
    if (!fromQueue && (request.current || busy || queue.length || pendingTodoCount > 0)) {
      if (queue.length >= 20) { setError("等待队列最多 20 条消息"); return; }
      if (pendingTodoCount > 0) setTodoPaused(true);
      setQueue((current) => [...current, { id: crypto.randomUUID(), sessionId, text: text.trim(), ...(withSearch ? { search: true } : {}) }]);
      setDraft("");
      return;
    }
    if (request.current) return;
    const next: Message[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(next);
    if (!fromQueue) setDraft("");
    setBusy(true);
    setError("");
    followOutput.current = true;
    const partial: { content: string; reasoning: string; search?: SearchResult } = { content: "", reasoning: "" };
    setSearching(withSearch);
    setStreaming({ ...partial });
    let paint: ReturnType<typeof setTimeout> | undefined;
    let completedReply = false;
    const controller = new AbortController();
    request.current = controller;
    try {
      await saveMessages(next);
      controller.signal.throwIfAborted();
      if (withSearch) {
        const response = await fetchLocal("/api/search",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({query:text.trim()})});
        const result = await response.json();
        if (!response.ok) { if(response.status===401 || response.status===503)onSettings("search");throw new Error(result.error || "搜索失败，请重试"); }
        if (!validSearchResult(result)) throw new Error("搜索返回格式不正确，请重试");
        controller.signal.throwIfAborted();
        partial.search = result;
        setSearching(false);
        setStreaming({...partial});
        const found: Message[] = [...next,{role:"assistant",content:searchResultSummary(result),search:result}];
        await saveMessages(found);
        controller.signal.throwIfAborted();
        if (!result.sources.length || configured !== true) {
          completedReply=true;setMessages(found);setStreaming(null);return;
        }
      }
      const response = await fetchLocal("/api/ai", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            ...project,
            tasks: project.tasks.map((task) => ({
              ...task,
              image: "",
              images: [],
            })),
          },
          messages: prepareAIHistory(next),
          summary: sessionSummary,
          memory: sessionMemory,
          language,
          ...(partial.search ? {search:partial.search} : {}),
        }),
      });
      const reply = await readAIResponse(response, controller.signal, event => {
        if (request.current !== controller || controller.signal.aborted) return;
        if (event.type === "reasoning") partial.reasoning = (partial.reasoning + event.delta).slice(0, MAX_REASONING);
        else partial.content = (partial.content + event.delta).slice(0, 16000);
        // Coalesce tokens into a small number of Markdown renders per second.
        paint ??= setTimeout(() => {
          paint = undefined;
          if (request.current === controller && !controller.signal.aborted) setStreaming({ ...partial });
        }, 50);
      });
      controller.signal.throwIfAborted();
      completedReply = true;
      const completed: Message[] = [
        ...next,
        { role: "assistant", content: reply.reply, reasoning: partial.reasoning || undefined, ...(partial.search ? {search:partial.search} : {}), tasks: reply.tasks, changes: reply.changes, followUps: reply.followUps, added: false },
      ];
      clearTimeout(paint); paint = undefined;
      setStreaming(null);
      setMessages(completed);
      const nextSummary = reply.summary || sessionSummary;
      const nextMemory = mergeMemory(sessionMemory, reply.memory);
      setSessionSummary(nextSummary);
      setSessionMemory(nextMemory);
      setTodoPaused(reply.tasks.length > 0);
      onPreviewChanges(reply.changes?.length ? reply.changes : null);
      try { await saveMessages(completed, nextSummary, nextMemory); }
      catch (e) { setQueuePaused(true); setError(e instanceof Error ? e.message : "回复保存失败"); }
    } catch (error) {
      clearTimeout(paint); paint = undefined;
      setStreaming(null);
      if (!completedReply && (partial.content || partial.reasoning || partial.search)) {
        const interrupted: Message[] = [...next, { role: "assistant", ...partial, content:partial.content || (partial.search ? searchResultSummary(partial.search) : ""), interrupted: true }];
        setMessages(interrupted);
        try { await saveMessages(interrupted); }
        catch (saveError) {
          setQueuePaused(true);
          setError(saveError instanceof Error ? saveError.message : "回复保存失败");
          return;
        }
      }
      if (controller.signal.aborted && controller.signal.reason === "steer") return;
      setQueuePaused(true);
      setError(
        controller.signal.aborted
          ? (language !== "zh" ? "Generation stopped" : "已停止生成")
          : error instanceof Error
            ? error.message
            : "请求失败",
      );
      setDraft((current) => current || text);
    } finally {
      clearTimeout(paint);
      setStreaming(null);
      setSearching(false);
      request.current = null;
      setBusy(false);
    }
  };
  const steer = (id: string) => {
    const item = queue.find(entry => entry.id === id);
    const prioritized = prioritizeQueuedMessage(queue, id);
    if (!item?.text.trim() || item.sessionId !== sessionId || !prioritized || editingQueue || (item.search ? searchConfigured !== true : configured !== true)) return;
    setQueue(prioritized.queue);
    setTodoPaused(false);
    setQueuePaused(false);
    setError("");
    request.current?.abort("steer");
  };
  const saveQueueEdit = () => {
    if (!editingQueue || !editingQueue.text.trim()) return;
    const edit = editingQueue;
    setQueue(current => current.map(entry => entry.id === edit.id ? { ...entry, text: edit.text.trim() } : entry));
    setEditingQueue(false);
  };
  const skipPendingSuggestions = async (messageIndex: number) => {
    if (busy) return;
    const message = messages[messageIndex];
    if (!message?.tasks?.length) return;
    const skippedIndices = [...new Set([...(message.skippedIndices || []), ...message.tasks.map((_, index) => index).filter(index => !isAdded(message, index))])];
    const updated = messages.map((item, index) => index === messageIndex ? { ...item, skippedIndices } : item);
    setMessages(updated);
    try { await saveMessages(updated); } catch (error) { setError(error instanceof Error ? error.message : "跳过建议失败"); }
  };
  const readNote = async (messageIndex:number,sourceIndex:number) => {
    if(busy || request.current)return;
    const message=messages[messageIndex], source=message?.search?.sources[sourceIndex];
    if(!message?.search || !source)return;
    const controller=new AbortController();request.current=controller;
    setBusy(true);setReadingNote(true);setError("");
    try {
      const response=await fetchLocal("/api/search/note",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({url:source.url})});
      const note=await response.json();if(!response.ok)throw new Error(note.error||"无法读取笔记");
      const search={...message.search,sources:message.search.sources.map((item,index)=>index===sourceIndex?note:item)};
      if(!validSearchResult(search))throw new Error("笔记返回格式不正确");
      controller.signal.throwIfAborted();
      const updated=messages.map((item,index)=>index===messageIndex?{...item,search}:item);
      setMessages(updated);await saveMessages(updated);
    }catch(error){setError(controller.signal.aborted?"已停止读取笔记":error instanceof Error?error.message:"读取笔记失败");setQueuePaused(true);}
    finally{request.current=null;setBusy(false);setReadingNote(false);}
  };
  const saveMemory = async () => {
    if (busy || !sessionId) return;
    setBusy(true);
    setError("");
    try { await saveMessages(messages); }
    catch (e) { setError(e instanceof Error ? e.message : "记忆保存失败"); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!pendingTodoCount && todoPaused) setTodoPaused(false);
  }, [pendingTodoCount, todoPaused]);
  useEffect(() => {
    if (busy || request.current || queuePaused || todoPaused || editingQueue) return;
    const next = queue[0];
    if (!next || next.sessionId !== sessionId || !next.text.trim()) return;
    if (next.search ? searchConfigured !== true : configured !== true) return;
    setQueue((current) => current.slice(1));
    void send(next.text, true, next.search === true);
  }, [busy, queue, queuePaused, todoPaused, editingQueue, configured, searchConfigured, sessionId, messages, pendingTodoCount]);
  if (!open) return null;
  return (
    <aside ref={panel} className="ai-chat" aria-label={text.aiAssistant} style={panelRect ? { ...panelRect, right: "auto", bottom: "auto" } : undefined}>
      {(["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const).map((direction) => (
        <div
          key={direction}
          className={`ai-resize-handle ai-resize-${direction}`}
          role="separator"
          tabIndex={0}
          aria-label={`调整聊天窗口${({ n: "上边", s: "下边", e: "右边", w: "左边", nw: "左上角", ne: "右上角", sw: "左下角", se: "右下角" })[direction]}尺寸`}
          aria-orientation={direction === "n" || direction === "s" ? "horizontal" : "vertical"}
          onPointerDown={(event) => {
            if (event.button !== 0 || !panel.current) return;
            event.preventDefault();
            resizing.current = { direction, x: event.clientX, y: event.clientY, rect: panel.current.getBoundingClientRect() };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = resizing.current;
            if (drag && event.currentTarget.hasPointerCapture(event.pointerId)) resizePanel(drag.direction, drag.rect, event.clientX - drag.x, event.clientY - drag.y);
          }}
          onPointerUp={(event) => { resizing.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onLostPointerCapture={() => { resizing.current = null; }}
          onKeyDown={(event) => {
            if (!panel.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            resizePanel(direction, panel.current.getBoundingClientRect(), event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0, event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0);
          }}
        />
      ))}
      <header>
        <strong>
          <Sparkles size={17} />
          {text.aiAssistant}
        </strong>
        <div>
          {sessionId && <button title={language !== "zh" ? "Back to conversations" : "返回会话列表"} aria-label={language !== "zh" ? "Back to conversations" : "返回会话列表"} disabled={busy || historyLoading || queue.length > 0} onClick={() => { setSessionId(null); setError(""); void loadHistory(); }}><ArrowLeft size={16} /></button>}
          <button
            title={language !== "zh" ? "AI model settings" : "AI 模型设置"}
            aria-label={language !== "zh" ? "AI model settings" : "AI 模型设置"}
            onClick={()=>onSettings("model")}
          >
            <Settings2 size={16} />
          </button>
          <button
            title={language !== "zh" ? "New conversation" : "新建会话"}
            aria-label={language !== "zh" ? "New conversation" : "新建会话"}
            disabled={busy || historyLoading || queue.length > 0}
            onClick={() => void enterSession()}
          >
            <Plus size={16} />
          </button>
          <button
            title={language !== "zh" ? "Close AI assistant" : "关闭 AI 助手"}
            aria-label={language !== "zh" ? "Close AI assistant" : "关闭 AI 助手"}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      {!sessionId ? (
        <div className="ai-conversation ai-session-list">
          <button className="primary-button" disabled={historyLoading} onClick={() => void enterSession()}><Plus size={15} />{text.newSession}</button>
          {historyLoading && <p role="status">{language !== "zh" ? "Loading conversations…" : "正在读取会话…"}</p>}
          {!historyLoading && !sessions.length && <p>{text.noChatHistory}</p>}
          {error && <><p className="ai-error" role="alert">{error}</p><button className="secondary-button" disabled={historyLoading} onClick={() => void loadHistory()}>{language !== "zh" ? "Reconnect" : "重新连接"}</button></>}
          {sessions.map((session) => (
            <button className="ai-session-row" key={session.id} disabled={historyLoading} onClick={() => void enterSession(session.id)}>
              <span><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString("zh-CN")}</small></span><ArrowRight size={16} />
            </button>
          ))}
        </div>
      ) : <>
      <details className="ai-memory-panel">
        <summary>
          <span className="ai-memory-summary-main">
            <strong>{language !== "zh" ? "Conversation memory" : "会话记忆"}</strong>
            <small>{memoryCount ? (language !== "zh" ? `${memoryCount} items saved` : `已记录 ${memoryCount} 项`) : (language !== "zh" ? "No key information yet" : "还没有记录关键信息")}</small>
          </span>
          <span className="ai-memory-snapshot" aria-label="当前记忆概览">
            {memorySnapshot.length ? memorySnapshot.map(item => <span key={item}>{item}</span>) : <span>{language !== "zh" ? "Dates, budget and decisions are extracted automatically" : "自动提取婚期、预算和决策"}</span>}
          </span>
        </summary>
        <div className="ai-memory-editor">
          <p className="ai-memory-hint">{language !== "zh" ? "AI updates this after each complete reply. Manual edits are saved to this conversation." : "AI 会在每轮完整回复后更新；手动修改会保存在当前会话。"}</p>
          <section className="ai-memory-section ai-memory-summary-section">
            <div className="ai-memory-section-heading"><strong>{language !== "zh" ? "Stage summary" : "阶段摘要"}</strong><small>{sessionSummary.length}/6000</small></div>
            <textarea aria-label={language !== "zh" ? "Stage summary" : "阶段摘要"} placeholder={language !== "zh" ? "Track the current schedule, risks and next steps…" : "记录当前排期、风险和下一步…"} value={sessionSummary} maxLength={6000} rows={3} disabled={busy} onChange={event => setSessionSummary(event.target.value)} />
          </section>
          <section className="ai-memory-section">
            <div className="ai-memory-section-heading"><strong>{language !== "zh" ? "Key facts" : "关键事实"}</strong><small>{language !== "zh" ? "Used in future conversations" : "用于后续对话"}</small></div>
            <div className="ai-memory-grid">
              <label><span>{language !== "zh" ? "Wedding date" : "婚期"}</span><input placeholder={language !== "zh" ? "e.g. September 27, 2026" : "例如：2026 年 9 月 27 日"} aria-label={language !== "zh" ? "Wedding date" : "婚期"} value={sessionMemory.weddingDate} maxLength={200} disabled={busy} onChange={event => setSessionMemory(current => ({ ...current, weddingDate: event.target.value }))} /></label>
              <label><span>{language !== "zh" ? "Budget" : "预算"}</span><input placeholder={language !== "zh" ? "e.g. ¥120,000" : "例如：¥ 120,000"} aria-label={language !== "zh" ? "Budget" : "预算"} value={sessionMemory.budget} maxLength={200} disabled={busy} onChange={event => setSessionMemory(current => ({ ...current, budget: event.target.value }))} /></label>
            </div>
          </section>
          <section className="ai-memory-section">
            <div className="ai-memory-section-heading"><strong>{language !== "zh" ? "Preferences" : "偏好"}</strong><small>{sessionMemory.preferences.length}/20 {language !== "zh" ? "items · one per line" : "条 · 每行一项"}</small></div>
            <textarea aria-label="偏好，每行一项" placeholder="例如：喜欢户外、偏好暖黄色布置" value={sessionMemory.preferences.join("\n")} maxLength={4000} rows={3} disabled={busy} onChange={event => setSessionMemory(current => ({ ...current, preferences: event.target.value.split("\n").map(value => value.trim()).filter(Boolean).slice(0, 20) }))} />
          </section>
          <section className="ai-memory-section">
            <div className="ai-memory-section-heading"><strong>{language !== "zh" ? "Confirmed decisions" : "已确认决策"}</strong><small>{sessionMemory.decisions.length}/20 {language !== "zh" ? "items · one per line" : "条 · 每行一项"}</small></div>
            <textarea aria-label="已确认决策，每行一项" placeholder="例如：已确定场地和婚礼主题" value={sessionMemory.decisions.join("\n")} maxLength={4000} rows={3} disabled={busy} onChange={event => setSessionMemory(current => ({ ...current, decisions: event.target.value.split("\n").map(value => value.trim()).filter(Boolean).slice(0, 20) }))} />
          </section>
          <div className="ai-memory-actions"><span>{memoryCount ? (language !== "zh" ? `${memoryCount} memory items` : `共 ${memoryCount} 项记忆`) : (language !== "zh" ? "Saved for the next conversation turn" : "保存后会用于下一轮对话")}</span><button className="primary-button ai-memory-save" disabled={busy} onClick={() => void saveMemory()}><Check size={14} />{language !== "zh" ? "Save memory" : "保存记忆"}</button></div>
        </div>
      </details>
      <div className="ai-conversation" aria-live="polite" onScroll={event => {
        const node = event.currentTarget;
        followOutput.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}>
        {configured === false && (
          <div className="ai-notice">
            <p>{language !== "zh" ? "AI connection is not configured" : "AI 接口尚未配置"}</p>
            <button className="primary-button" onClick={()=>onSettings("model")}>
              <Settings2 size={14} />
              {language !== "zh" ? "Configure model" : "设置模型"}
            </button>
          </div>
        )}
        {messages.map((message, index) => (
          <section className={`ai-message ${message.role}`} key={index}>
            <small>{message.role === "user" ? (language !== "zh" ? "Me" : "我") : text.aiAssistant}</small>
            {message.role === "assistant" && message.reasoning && <details className="ai-reasoning">
              <summary>{language !== "zh" ? "Reasoning" : "思考过程"}{message.interrupted ? " · 已中断" : ""}</summary>
              <div className="ai-reasoning-content">{message.reasoning}</div>
            </details>}
            {message.role === "assistant" ? <ChatMarkdown content={message.content} tasks={project.tasks} onTaskClick={onTaskClick} /> : <p>{message.content}</p>}
            {message.search && <SearchSources result={message.search} disabled={busy || queue.length >= 20} canSuggest={configured === true} onSuggest={prompt=>void send(prompt)} onRead={sourceIndex=>void readNote(index,sourceIndex)}/>}
            {message.interrupted && <small className="ai-interrupted">{language !== "zh" ? "Generation interrupted · received content was kept" : "生成已中断 · 已保留收到的内容"}</small>}
            {!!message.tasks?.length && (
              <>
                <label className="ai-select-all">
                  <input type="checkbox" aria-label={`全选第 ${index + 1} 条回复的未添加任务`} disabled={busy || message.tasks.every((_, i) => isAdded(message, i) || isSkipped(message, i))}
                    checked={message.tasks.some((_, i) => !isAdded(message, i) && !isSkipped(message, i)) && message.tasks.every((_, i) => isAdded(message, i) || isSkipped(message, i) || selectedFor(message, index).includes(i))}
                    onChange={event => setSelectedSuggestions(current => ({ ...current, [index]: event.target.checked ? message.tasks!.map((_, i) => i).filter(i => !isAdded(message, i) && !isSkipped(message, i)) : [] }))} />
                  {language !== "zh" ? "Select all unadded" : "全选未添加"}
                </label>
                <ul>
                  {message.tasks.map((task, i) => (
                    <li key={i}>
                      <div className="ai-task-select-row">
                      <input type="checkbox" aria-label={`选择任务：${task.title}`} disabled={busy || isAdded(message, i) || isSkipped(message, i)} checked={isAdded(message, i) || isSkipped(message, i) || selectedFor(message, index).includes(i)}
                        onChange={event => setSelectedSuggestions(current => ({ ...current, [index]: event.target.checked ? [...(current[index] || []), i] : (current[index] || []).filter(value => value !== i) }))} />
                      <button
                        className="ai-suggestion-link"
                        disabled={!configured || queue.length >= 20}
                        onClick={() => void send(`请帮我细化「${task.title}」这项任务，结合当前婚礼计划，给出具体步骤、注意事项和下一步安排。${task.description ? `任务背景：${task.description}` : ""}`)}
                      >
                        <span className="ai-option-number">{i + 1}</span>
                        <span className="ai-option-label">{task.title}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                      {isAdded(message, i) && <small className="ai-task-added">{language !== "zh" ? "Added" : "已添加"}</small>}
                      {!isAdded(message, i) && isSkipped(message, i) && <small className="ai-task-skipped">{language !== "zh" ? "Skipped" : "已跳过"}</small>}
                      </div>
                      <small>
                        {project.tasks.find((t) => t.id === task.parentId)
                          ?.title || "分支已删除"}
                        {task.due ? ` · ${task.due}` : ""}
                      </small>
                      {task.description && <p>{task.description}</p>}
                    </li>
                  ))}
                </ul>
                <button
                  className="primary-button"
                  disabled={busy || !selectedFor(message, index).length}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const chosen = selectedFor(message, index);
                      const count = onApply(chosen.map(i => message.tasks![i]));
                      const addedIndices = [...new Set([...(message.addedIndices || []), ...chosen])];
                      const updated = messages.map((m, i) =>
                          i === index ? { ...m, addedIndices, added: m.tasks!.every((_, taskIndex) => isAdded(m, taskIndex) || addedIndices.includes(taskIndex)) } : m,
                      );
                      setMessages(updated);
                      setSelectedSuggestions(current => ({ ...current, [index]: [] }));
                      await saveMessages(updated);
                      setError(count ? "" : "任务已存在，无需重复添加");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "添加失败");
                    } finally { setBusy(false); }
                  }}
                >
                  <Plus size={14} />
                  {message.tasks.every((_, i) => isAdded(message, i))
                    ? "已全部添加"
                    : language !== "zh" ? `Confirm ${selectedFor(message, index).length} task(s)` : `确认加入 ${selectedFor(message, index).length} 个任务`}
                </button>
                {message.tasks.some((_, taskIndex) => !isAdded(message, taskIndex) && !isSkipped(message, taskIndex)) && (
                  <button className="ai-skip-suggestions" disabled={busy} onClick={() => void skipPendingSuggestions(index)}>
                    {language !== "zh" ? "Skip unconfirmed items and continue" : "跳过未确认项，继续后续对话"}
                  </button>
                )}
              </>
            )}
            {!!message.changes?.length && (
              <div className="ai-change-preview" aria-label="脑图变更预览">
                <div className="ai-change-heading"><strong>{language !== "zh" ? "Canvas change preview" : "脑图调整预览"}</strong><span>{message.changes.length} {language !== "zh" ? "changes" : "项变更"}</span></div>
                <ul>
                  {message.changes.map((change, changeIndex) => {
                    const target = "taskId" in change ? project.tasks.find(task => task.id === change.taskId) : undefined;
                    const label = change.type === "add" ? `新增「${change.title}」` : change.type === "move" ? `移动「${target?.title || change.taskId}」` : change.type === "reorder" ? `将「${target?.title || change.taskId}」移到「${project.tasks.find(task => task.id === change.targetId)?.title || change.targetId}」${change.placement === "before" ? "之前" : "之后"}` : change.type === "delete" ? `删除「${target?.title || change.taskId}」` : change.type === "status" ? `将「${target?.title || change.taskId}」设为${change.status}` : `更新「${target?.title || change.taskId}」`;
                    return <li key={changeIndex}><span className={`ai-change-dot ai-change-${change.type}`} />{label}</li>;
                  })}
                </ul>
                <button className="primary-button" disabled={busy || message.changesApplied} onClick={async () => {
                  setBusy(true);
                  try {
                    const count = onApplyChanges(message.changes || []);
                    if (count) onPreviewChanges(null);
                    const updated = messages.map((item, itemIndex) => itemIndex === index ? { ...item, changesApplied: count > 0 || item.changesApplied } : item);
                    setMessages(updated);
                    await saveMessages(updated);
                    setError(count ? "" : "变更没有产生可应用的差异");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "脑图变更应用失败");
                  } finally { setBusy(false); }
                }}>
                  <Check size={14} />
                  {message.changesApplied ? (language !== "zh" ? "Applied to canvas" : "已应用到画布") : (language !== "zh" ? "Apply to canvas" : "确认应用到脑图")}
                </button>
              </div>
            )}
          </section>
        ))}
        {streaming && <section className="ai-message assistant ai-streaming" aria-label={language !== "zh" ? "Generating reply" : "正在生成的回复"} aria-busy="true">
          <small>{text.aiAssistant}</small>
          {streaming.search && <SearchSources result={streaming.search} disabled onSuggest={()=>{}}/>}
          {streaming.reasoning && <details className="ai-reasoning" open>
            <summary>{streaming.content ? (language !== "zh" ? "Reasoning" : "思考过程") : (language !== "zh" ? "Thinking…" : "正在思考…")}</summary>
            <div className="ai-reasoning-content">{streaming.reasoning}</div>
          </details>}
          {streaming.content && <ChatMarkdown content={streaming.content} tasks={project.tasks} onTaskClick={onTaskClick} />}
          <small className="ai-stream-status" role="status">{searching ? (language !== "zh" ? "Searching Xiaohongshu…" : "正在搜索小红书笔记…") : streaming.content ? (language !== "zh" ? "Generating reply…" : "正在生成回复…") : streaming.reasoning ? (language !== "zh" ? "Thinking…" : "正在思考…") : streaming.search ? (language !== "zh" ? "Sources found, preparing summary…" : "笔记已找到，正在整理结果…") : (language !== "zh" ? "Waiting for model…" : "正在等待模型响应…")}</small>
        </section>}
        <div ref={bottom} />
      </div>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {readingNote && <p className="ai-note-loading" role="status">正在读取笔记正文与图片…</p>}
      {followUps.length > 0 && <div className="ai-quick" role="group" aria-label={language !== "zh" ? "Quick prompts" : "快捷提问"}>
        {followUps.map((option, index) => (
          <button key={option.label} className="ai-suggestion-link" title={option.message} disabled={!configured || queue.length >= 20} onClick={() => void send(option.message)}>
            <span className="ai-option-number">{index + 1}</span>
            <span className="ai-option-label">{option.label}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ))}
      </div>}
      {queue.length > 0 && <section className="ai-message-queue" aria-label={language !== "zh" ? "Queued messages" : "等待发送的消息"}>
        <div className="ai-queue-heading"><span><ListOrdered size={14} />{todoPaused ? (language !== "zh" ? `${pendingTodoCount} AI tasks need confirmation` : `还有 ${pendingTodoCount} 条 AI 任务待确认`) : queuePaused ? (language !== "zh" ? "Queue paused" : "队列已暂停") : (language !== "zh" ? "Waiting to send" : "等待发送")} · {language !== "zh" ? `Queue ${queue.length}` : `队列 ${queue.length}`}</span>
          {queuePaused && <button className="icon-button" title="继续发送队列" aria-label="继续发送队列" onClick={() => { setQueuePaused(false); setError(""); }}><Play size={14} /></button>}
        </div>
        {todoPaused && <p className="ai-queue-hint">{language !== "zh" ? "Select tasks above and confirm them, or skip unconfirmed items. The queue will continue afterwards." : "请在上方任务建议中选择“确认加入”，或点击“跳过未确认项”，处理完成后队列会自动继续。"}</p>}
        <ol>
          {queue.map((item, index) => <li key={item.id}>
            <span className="ai-queue-number">{index + 1}</span>
            {editingQueue && editingQueue.id === item.id ? <>
              <textarea autoFocus aria-label={`编辑待发消息 ${index + 1}`} value={editingQueue.text} rows={2} maxLength={4000}
                onChange={event => setEditingQueue({ id: item.id, text: event.target.value })}
                onKeyDown={event => {
                  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                  if (event.key === "Escape") { event.preventDefault(); setEditingQueue(false); }
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveQueueEdit(); }
                }} />
              <button className="icon-button" title="保存修改" aria-label={`保存待发消息 ${index + 1}`} disabled={!editingQueue.text.trim()} onClick={saveQueueEdit}><Check size={14} /></button>
              <button className="icon-button" title="取消修改" aria-label="取消修改" onClick={() => setEditingQueue(false)}><X size={14} /></button>
            </> : <>
              <span className="ai-queue-text" title={item.text}>{item.search && <span className="ai-queue-search-label">{language !== "zh" ? "Public notes · " : "小红书 · "}</span>}{item.text}</span>
              <button className="icon-button" title="Steer：停止当前生成，优先按此消息继续" aria-label={`Steer 待发消息 ${index + 1}`} disabled={!!editingQueue || (item.search ? !searchConfigured : !configured) || (busy && !request.current)} onClick={() => steer(item.id)}><CornerUpLeft size={14} /></button>
              <button className="icon-button" title="Edit：编辑消息" aria-label={`Edit 待发消息 ${index + 1}`} disabled={!!editingQueue} onClick={() => setEditingQueue({ id: item.id, text: item.text })}><Pencil size={14} /></button>
            </>}
            <button className="icon-button" title={language !== "zh" ? "Remove queued message" : "移除待发消息"} aria-label={`${language !== "zh" ? "Remove queued message" : "移除待发消息"} ${index + 1}`} disabled={!!editingQueue && editingQueue.id !== item.id} onClick={() => { setEditingQueue(false); setQueue((current) => current.filter((entry) => entry.id !== item.id)); }}><Trash2 size={14} /></button>
          </li>)}
        </ol>
      </section>}
      <div className="ai-composer-tools">
        <button type="button" className="ai-search-toggle" aria-label={language !== "zh" ? "Public note search" : "小红书搜索"} aria-pressed={searchEnabled} onClick={()=>setSearchEnabled(value=>!value)}><Search size={14}/>{language !== "zh" ? "Public notes" : "小红书"}{searchEnabled && <Check size={12}/>}</button>
        {searchEnabled && <span>{searchConfigured ? `${language !== "zh" ? (searchProvider === "xiaohongshu-mcp" ? "Site search" : "Public web") : (searchProvider === "xiaohongshu-mcp" ? "站内搜索" : "公开网页")} · ${language !== "zh" ? "300 characters max" : "300 字以内"}` : (language !== "zh" ? "Configure search to use this" : "配置搜索服务后即可使用")}</span>}
        {searchEnabled && <button type="button" className="icon-button" aria-label={language !== "zh" ? "Search settings" : "搜索设置"} title={language !== "zh" ? "Search settings" : "搜索设置"} onClick={()=>onSettings("search")}><Settings2 size={14}/></button>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft, false, searchEnabled);
        }}
      >
        <textarea
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            event.stopPropagation();
            if ((configured || searchEnabled) && draft.trim()) event.currentTarget.form?.requestSubmit();
          }}
          aria-label={language !== "zh" ? "Message for AI" : "发送给 AI 的消息"}
          placeholder={searchEnabled ? (language !== "zh" ? "Search public notes, e.g. outdoor wedding white flowers…" : "搜索小红书，例如：户外婚礼 白色花材…") : (language !== "zh" ? "Talk about the wedding plan…" : "聊聊婚礼计划…")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          rows={3}
        />
        {busy && <button type="button" className="icon-button" title={`${language !== "zh" ? "Stop generation and pause queue" : "停止生成并暂停队列"}`} aria-label={language !== "zh" ? "Stop generation" : "停止生成"} onClick={() => { setQueuePaused(true); request.current?.abort(); }}><Square size={17} /></button>}
        <button
          className="primary-button"
          type="submit"
          aria-label={busy || queue.length ? (language !== "zh" ? "Add to queue" : "加入等待队列") : (language !== "zh" ? "Send" : "发送")}
          title={busy || queue.length ? (language !== "zh" ? "Add to queue" : "加入等待队列") : (language !== "zh" ? "Send" : "发送")}
          disabled={(!configured && !searchEnabled) || !draft.trim() || queue.length >= 20}
        >
          {busy || queue.length ? <ListOrdered size={17} /> : <Send size={17} />}
        </button>
      </form>
      </>}
    </aside>
  );
}
