"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  CLOUD_QUALITY, CLOUD_SETTINGS_KEY, CLOUD_SLIDERS, DEFAULT_CLOUD_SETTINGS,
  normalizeCloudSettings, type CloudSettings,
} from "@/lib/cloud-settings";

export function useCloudSettings() {
  const [settings, setSettings] = useState(DEFAULT_CLOUD_SETTINGS);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const read = () => {
      try {
        setSettings(normalizeCloudSettings(JSON.parse(localStorage.getItem(CLOUD_SETTINGS_KEY) || "null")));
      } catch { /* Unavailable or invalid preferences use the defaults. */ }
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === CLOUD_SETTINGS_KEY || event.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((value: CloudSettings) => {
    const next = normalizeCloudSettings(value);
    setSettings(next);
    try { localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(next)); setSaved(true); }
    catch { setSaved(false); }
  }, []);
  return { settings, update, saved };
}

export function CloudControls({ settings, onChange, saved }: {
  settings: CloudSettings; onChange: (value: CloudSettings) => void; saved: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(520);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const shell = container.current?.closest<HTMLElement>(".canvas-shell");
    const measure = () => setMaxHeight(Math.max(100, (shell?.clientHeight || innerHeight) - 86));
    const observer = new ResizeObserver(measure);
    if (shell) observer.observe(shell);
    measure();
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown", outside);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside); };
  }, [open]);

  return <div className="cloud-controls" ref={container}>
    <button ref={trigger} type="button" title="云海参数" aria-label="云海参数"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <SlidersHorizontal size={15} />
    </button>
    {open && <div ref={panel} id={id} role="dialog" aria-label="云海参数"
      className="cloud-controls-panel" style={{ maxHeight }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className="cloud-controls-heading">
        <div><strong>云海参数</strong><p>调一调，找到喜欢的云端节奏</p></div>
        <button type="button" onClick={close} aria-label="关闭云海参数" title="关闭"><X size={16} /></button>
      </div>
      <div className="cloud-controls-sliders">
        {CLOUD_SLIDERS.map(({ key, label, min, max, step, unit }) => {
          const display = unit === "speed" ? `${settings[key]}×` : `${Math.round(settings[key] * 100)}%`;
          return <label className="cloud-control" key={key} htmlFor={`${id}-${key}`}>
            <span>{label}<output htmlFor={`${id}-${key}`}>{display}</output></span>
            <input id={`${id}-${key}`} type="range" min={min} max={max} step={step}
              value={settings[key]} aria-valuetext={display}
              onChange={event => onChange({ ...settings, [key]: Number(event.target.value) })} />
          </label>;
        })}
      </div>
      <label className="cloud-control-quality" htmlFor={`${id}-quality`}>
        <span>画质</span>
        <select id={`${id}-quality`} value={settings.quality}
          onChange={event => onChange({ ...settings, quality: event.target.value as CloudSettings["quality"] })}>
          {Object.entries(CLOUD_QUALITY).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="cloud-control-light">
        <input type="checkbox" checked={settings.dynamicLight}
          onChange={event => onChange({ ...settings, dynamicLight: event.target.checked })} />
        <span>动态光照<small>明暗随云海缓慢变化</small></span>
      </label>
      <div className="cloud-controls-footer">
        <small>{saved ? "实时生效 · 自动记住" : "实时生效 · 仅本次有效"}</small>
        <button className="cloud-controls-reset" type="button" onClick={() => onChange(DEFAULT_CLOUD_SETTINGS)}>
          <RotateCcw size={13} />恢复默认
        </button>
      </div>
    </div>}
  </div>;
}
