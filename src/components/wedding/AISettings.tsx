"use client";
import { fetchLocal } from "@/lib/local-fetch";
import { useEffect, useRef, useState } from "react";
import { X, PlugZap, Save } from "lucide-react";
import { useAppLanguage } from "@/lib/i18n";
import { SearchSettings } from "./SearchSettings";

const presets = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  custom: { label: "自定义 · OpenAI 兼容", baseUrl: "", model: "" },
};
type Provider = keyof typeof presets;
export function AISettings({
  onClose,
  onSaved,
  initialTab = "model",
}: {
  onClose: () => void;
  onSaved: () => void;
  initialTab?: "model" | "search";
}) {
  const language = useAppLanguage();
  const [tab, setTab] = useState(initialTab);
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  const [baseUrl, setBaseUrl] = useState(presets.openai.baseUrl);
  const [model, setModel] = useState(presets.openai.model);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    void fetchLocal("/api/ai/settings", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setProvider(
          Object.hasOwn(presets, data.provider) ? data.provider : "custom",
        );
        setBaseUrl(data.baseUrl);
        setModel(data.model);
        setKeyConfigured(data.keyConfigured);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, []);
  const submit = async (action: "save" | "test") => {
    if (abort.current) return;
    setBusy(action);
    setError("");
    setFeedback("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetchLocal("/api/ai/settings", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model, apiKey, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "请求失败");
      setFeedback(data.message);
      if (action === "save") {
        setKeyConfigured(true);
        setApiKey("");
        onSaved();
        onClose();
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      abort.current = null;
      setBusy("");
    }
  };
  return (
    <dialog
      ref={dialog}
      className="modal ai-settings"
      aria-labelledby="ai-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id="ai-settings-title">{language !== "zh" ? "AI settings" : "AI 设置"}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={language !== "zh" ? "Close AI settings" : "关闭模型设置"}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="ai-settings-tabs" role="tablist" aria-label={language !== "zh" ? "AI settings categories" : "AI 设置分类"}>
        <button type="button" role="tab" aria-selected={tab === "model"} disabled={!!busy} onClick={()=>setTab("model")}>{language !== "zh" ? "Model" : "模型"}</button>
        <button type="button" role="tab" aria-selected={tab === "search"} disabled={!!busy} onClick={()=>setTab("search")}>{language !== "zh" ? "Search" : "搜索"}</button>
      </div>
      {tab === "search" ? <SearchSettings onSaved={()=>{onSaved();onClose();}}/> : <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit("save");
        }}
      >
        <fieldset disabled={loading || !!busy}>
          <label className="field-label">
            {language !== "zh" ? "Provider" : "服务商"}
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value as Provider;
                setProvider(next);
                setBaseUrl(presets[next].baseUrl);
                setModel(presets[next].model);
                setApiKey("");
                setKeyConfigured(false);
                setFeedback("");
              }}
            >
              {Object.entries(presets).map(([key, preset]) => (
                <option value={key} key={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            {language !== "zh" ? "API endpoint" : "接口地址"}
            <input
              type="url"
              required
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setKeyConfigured(false);
              }}
            />
          </label>
          <label className="field-label">
            {language !== "zh" ? "Model name" : "模型名称"}
            <input
              required
              value={model}
              maxLength={160}
              placeholder="模型 ID"
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
          <label className="field-label">
            API key
            {keyConfigured && (
              <span className="ai-key-state">{language !== "zh" ? "Configured · leave blank to keep" : "已配置 · 留空保留"}</span>
            )}
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              required={!keyConfigured}
              maxLength={4096}
              placeholder={keyConfigured ? (language !== "zh" ? "Replace key" : "更换密钥") : (language !== "zh" ? "Enter API key" : "输入 API Key")}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        </fieldset>
        {loading && <p role="status">{language !== "zh" ? "Loading settings…" : "正在读取设置…"}</p>}
        {error && (
          <p className="ai-error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="ai-settings-feedback">
            {feedback}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={loading || !!busy}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity())
                void submit("test");
            }}
          >
            <PlugZap size={14} />
            {busy === "test" ? (language !== "zh" ? "Testing…" : "测试中…") : (language !== "zh" ? "Test connection" : "测试连接")}
          </button>
          <button className="primary-button" disabled={loading || !!busy}>
            <Save size={14} />
            {busy === "save" ? (language !== "zh" ? "Testing and saving…" : "测试并保存中…") : (language !== "zh" ? "Test and save" : "测试并保存")}
          </button>
        </div>
      </form>}
    </dialog>
  );
}
