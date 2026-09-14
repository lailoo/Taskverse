"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromISO = (value: string) =>
  value ? new Date(`${value}T12:00:00`) : new Date();

export function DateField({
  value,
  defaultValue = "",
  onChange,
  name,
  label,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  label: string;
}) {
  const [local, setLocal] = useState(defaultValue);
  const selected = value ?? local;
  const [month, setMonth] = useState(() => fromISO(selected));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const choose = (date: string) => {
    setLocal(date);
    onChange?.(date);
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => panel.current?.hidePopover();
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
  const year = month.getFullYear(),
    index = month.getMonth();
  const first = new Date(year, index, 1);
  const offset = (first.getDay() + 6) % 7;
  const today = isoDate(new Date());
  return (
    <span className="date-control nodrag nowheel">
      <input type="hidden" name={name} value={selected} />
      <button
        ref={trigger}
        type="button"
        className="date-control-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        popoverTarget={id}
        onClick={() => {
          setMonth(fromISO(selected));
          const rect = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
            top: Math.max(
              8,
              Math.min(rect.bottom + 8, window.innerHeight - 366),
            ),
          });
        }}
      >
        <span>{selected ? selected.replaceAll("-", "/") : "选择日期"}</span>
        <CalendarDays size={15} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="date-popover nodrag nowheel"
        style={position}
        onToggle={(event) => setOpen(event.newState === "open")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="calendar-heading">
          <button
            type="button"
            aria-label="上个月"
            title="上个月"
            onClick={() => setMonth(new Date(year, index - 1, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <strong aria-live="polite">
            {year} 年 {index + 1} 月
          </strong>
          <button
            type="button"
            aria-label="下个月"
            title="下个月"
            onClick={() => setMonth(new Date(year, index + 1, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendar-week" aria-hidden="true">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-days">
          {Array.from({ length: 42 }, (_, cell) => {
            const date = new Date(year, index, cell - offset + 1),
              iso = isoDate(date);
            return (
              <button
                type="button"
                key={iso}
                className={`${date.getMonth() !== index ? "other-month" : ""} ${iso === selected ? "chosen" : ""}`}
                aria-label={iso}
                aria-pressed={iso === selected}
                aria-current={iso === today ? "date" : undefined}
                onKeyDown={(event) => {
                  const step = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  }[event.key];
                  if (step === undefined) return;
                  event.preventDefault();
                  const next = new Date(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate() + step,
                  );
                  setMonth(next);
                  requestAnimationFrame(() =>
                    panel.current
                      ?.querySelector<HTMLButtonElement>(
                        `button[aria-label="${isoDate(next)}"]`,
                      )
                      ?.focus(),
                  );
                }}
                onClick={() => choose(iso)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <div className="calendar-footer">
          <button type="button" onClick={() => choose("")}>
            清空
          </button>
          <button type="button" onClick={() => choose(today)}>
            今天
          </button>
        </div>
      </div>
    </span>
  );
}
