"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_DESERT_SETTINGS, DESERT_SETTINGS_KEY, DESERT_SLIDERS, normalizeDesertSettings, type DesertSettings } from "@/lib/desert-settings";

export function useDesertSettings() {
  const [settings, setSettings] = useState(DEFAULT_DESERT_SETTINGS);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const read = () => {
      try { setSettings(normalizeDesertSettings(JSON.parse(localStorage.getItem(DESERT_SETTINGS_KEY) || "null"))); }
      catch { /* Optional local visual preferences. */ }
    };
    read();
    const sync = (e: StorageEvent) => { if (e.key === DESERT_SETTINGS_KEY || e.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((value: DesertSettings) => {
    const next = normalizeDesertSettings(value);
    setSettings(next);
    try { localStorage.setItem(DESERT_SETTINGS_KEY, JSON.stringify(next)); setSaved(true); }
    catch { setSaved(false); }
  }, []);
  return { settings, update, saved };
}

export function DesertControls({ settings, onChange, saved }: {
  settings: DesertSettings; onChange: (value: DesertSettings) => void; saved: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(430);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const shell = root.current?.closest<HTMLElement>(".canvas-shell");
    const measure = () => setMaxHeight(Math.max(100, (shell?.clientHeight || innerHeight) - 86));
    const observer = new ResizeObserver(measure);
    if (shell) observer.observe(shell);
    measure(); closeButton.current?.focus();
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <div className="cloud-controls desert-controls" ref={root}>
    <button ref={trigger} type="button" title="沙海参数" aria-label="沙海参数" aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(v => !v)}><SlidersHorizontal size={15} /></button>
    {open && <div role="dialog" id={id} aria-label="沙海参数" className="cloud-controls-panel desert-controls-panel" style={{ maxHeight }}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <div className="cloud-controls-heading"><div><strong>沙海参数</strong><p>巨城渐远，驼铃向前</p></div>
        <button ref={closeButton} type="button" aria-label="关闭沙海参数" onClick={close}><X size={16} /></button></div>
      <div className="cloud-controls-sliders">{DESERT_SLIDERS.map(({ key, label, min, max, step, unit }) => {
        const display = unit === "%" ? `${Math.round(settings[key] * 100)}%` : `${settings[key]}×`;
        return <label key={key} className="cloud-control" htmlFor={`${id}-${key}`}>
          <span>{label}<output htmlFor={`${id}-${key}`}>{display}</output></span>
          <input id={`${id}-${key}`} type="range" min={min} max={max} step={step} value={settings[key]} aria-valuetext={display}
            onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
        </label>;
      })}</div>
      <div className="cloud-controls-footer"><small>{saved ? "实时生效 · 自动记住" : "实时生效 · 仅本次有效"}</small>
        <button className="cloud-controls-reset" type="button" onClick={() => onChange(DEFAULT_DESERT_SETTINGS)}><RotateCcw size={13} />恢复默认</button></div>
    </div>}
  </div>;
}
