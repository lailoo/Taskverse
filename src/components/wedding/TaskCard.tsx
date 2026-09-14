"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { taskImages, compressImage, cardSize } from "@/lib/images";
import { PhotoGallery, PhotoPreview } from "./PhotoGallery";
import { DateField } from "./DateField";
import { StatusBadge } from "./StatusBadge";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  CalendarDays,
  UserRound,
  Trash2,
  Link2,
  CornerDownRight,
  ExternalLink,
  Flag,
  Pencil,
  PanelTopOpen,
} from "lucide-react";
import {
  COLORS,
  STATUSES,
  PRIORITIES,
  type Priority,
  type Task,
  type Status,
} from "@/lib/types";
import { priorityText, statusText, UI_TEXT, useAppLanguage } from "@/lib/i18n";

export interface TaskActions {
  openDetails?: (id: string) => void;
  move?: (id: string, parentId: string) => void;
  reorder?: (id: string, targetId: string, placement: "before" | "after") => void;
  patch: (id: string, patch: Partial<Task>) => void;
  status: (id: string, status: Status) => void;
  add: (id: string, sibling?: boolean) => void;
  remove: (id: string) => void;
}

interface Props extends TaskActions {
  task: Task;
  childrenCount: number;
  completedCount: number;
  selected?: boolean;
  breadcrumb?: string;
  mode?: "map" | "board";
  showOwner?: boolean;
  colorByPriority?: boolean;
}

function EditField({
  value,
  onSave,
  label,
  multiline = false,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const props = {
    value: draft,
    "aria-label": label,
    placeholder: label,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.target.value),
    onBlur: () => {
      if (draft !== value) onSave(draft);
    },
  };
  return multiline ? (
    <textarea {...props} rows={3} maxLength={3000} />
  ) : (
    <input
      {...props}
      maxLength={160}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing)
          e.currentTarget.blur();
      }}
    />
  );
}

export function TaskCard({
  task,
  childrenCount,
  completedCount,
  selected,
  breadcrumb,
  mode = "map",
  showOwner = false,
  colorByPriority = true,
  patch,
  status,
  add,
  remove,
  openDetails,
}: Props) {
  const language = useAppLanguage();
  const text = UI_TEXT[language];
  const priorities = priorityText(language);
  const color = COLORS[task.color];
  const isRoot = task.parentId === null;
  const images = taskImages(task);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const cancelTitle = useRef(false);
  const editTitle = () => {
    cancelTitle.current = false;
    setTitleDraft(task.title);
    setEditingTitle(true);
  };
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [preview, setPreview] = useState<{
    index: number;
    rect: DOMRect;
  } | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(task.expanded);
  useEffect(() => {
    if (task.expanded) {
      setDetailsVisible(true);
      return;
    }
    const timer = setTimeout(() => setDetailsVisible(false), 240);
    return () => clearTimeout(timer);
  }, [task.expanded]);
  const changeImages = (next: string[]) =>
    patch(task.id, { images: next, image: "" });
  const attach = async (files: File[]) => {
    if (busyRef.current || !files.length) return;
    if (files.length + imagesRef.current.length > 8) {
      setImageError("每个任务最多添加 8 张图片");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setImageError("");
    try {
      const added: string[] = [];
      for (const file of files) added.push(await compressImage(file));
      changeImages([...imagesRef.current, ...added]);
    } catch (e) {
      setImageError(
        e instanceof Error ? e.message : "图片无法读取，请换一张重试",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <article
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("input, select, textarea, button, a")) return;
        event.stopPropagation();
        openDetails?.(task.id);
      }}
      tabIndex={0}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.items)
          .filter(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          )
          .map((item) => item.getAsFile())
          .filter((file): file is File => !!file);
        if (files.length) {
          e.preventDefault();
          e.stopPropagation();
          void attach(files);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          setDraggingImage(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDraggingImage(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          e.stopPropagation();
          setDraggingImage(false);
          void attach(Array.from(e.dataTransfer.files));
        }
      }}
      data-task-id={task.id}
      data-status={task.status}
      data-priority={colorByPriority ? (task.priority ?? "none") : "none"}
      className={`task-card ticket-card color-${task.color} ${images.length ? "has-photos" : ""} ${draggingImage ? "image-drop-active" : ""} ${task.expanded ? "expanded" : ""} ${task.status === "done" ? "is-done" : ""} ${selected ? "is-selected" : ""} ${isRoot ? "root-card" : ""} ${mode === "board" ? "board-card" : ""}`}
      style={
        {
          "--branch": color.line,
          "--tint": color.background,
          "--ink": color.ink,
          "--card-height": `${cardSize(task).height}px`,
          "--card-width": `${cardSize(task).width}px`,
        } as CSSProperties
      }
    >
      {breadcrumb && (
        <div className="task-breadcrumb" title={breadcrumb}>
          {breadcrumb}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        aria-label={`上传图片：${task.title}`}
        onChange={(e) => {
          void attach(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <div className="ticket-top">
        {showOwner && (
          <span>
            <UserRound size={12} />
            {task.owner || text.unassigned}
          </span>
        )}
        <StatusBadge status={task.status} />
        <label
          className="task-priority nodrag"
          title={`${text.priority}: ${priorities[task.priority ?? "none"]}`}
        >
          <Flag size={11} aria-hidden="true" />
          <select
            aria-label={text.priority}
            value={task.priority ?? "none"}
            onChange={(event) =>
              patch(task.id, { priority: event.target.value as Priority })
            }
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorities[priority]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {images.length > 0 && (
        <button
          className="ticket-cover nodrag"
          aria-label={`预览封面：${task.title}`}
          onClick={(e) =>
            setPreview({
              index: 0,
              rect: e.currentTarget.getBoundingClientRect(),
            })
          }
        >
          <img src={images[0]} alt={`${task.title}封面`} />
          {images.length > 1 && (
            <span className="image-count">{images.length} 张</span>
          )}
        </button>
      )}
      <div className="task-head">
        <button
          className="task-check nodrag"
          role="checkbox"
          aria-checked={task.status === "done"}
          aria-label={`${task.status === "done" ? "重新打开" : "完成"}：${task.title}`}
          onClick={() =>
            status(task.id, task.status === "done" ? "todo" : "done")
          }
        >
          {task.status === "done" && <Check size={13} strokeWidth={3} />}
        </button>
        {editingTitle ? (
          <input
            className="task-title title-editor nodrag"
            aria-label="编辑任务名称"
            value={titleDraft}
            maxLength={160}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              const title = titleDraft.trim();
              if (!cancelTitle.current && title && title !== task.title)
                patch(task.id, { title });
              setEditingTitle(false);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelTitle.current = event.key === "Escape";
                event.currentTarget.blur();
                event.currentTarget
                  .closest<HTMLElement>(".react-flow__node")
                  ?.focus({ preventScroll: true });
              }
            }}
          />
        ) : (
          <button
            className="task-title"
            onClick={(event) =>
              event.currentTarget
                .closest<HTMLElement>(".react-flow__node")
                ?.focus({ preventScroll: true })
            }
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (openDetails) openDetails(task.id);
              else editTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "F2") {
                event.preventDefault();
                event.stopPropagation();
                editTitle();
              }
            }}
            title={openDetails ? "双击打开任务详情" : "双击编辑任务名称"}
          >
            {task.title}
          </button>
        )}
        <button
          className="icon-button expand-button nodrag"
          title={task.expanded ? text.collapse : text.expand}
          aria-label={`${task.expanded ? text.collapse : text.expand} card: ${task.title}`}
          onClick={() => patch(task.id, { expanded: !task.expanded })}
        >
          <ChevronDown size={15} className={task.expanded ? "rotate" : ""} />
        </button>
      </div>
      <div className="ticket-date">
        <CalendarDays size={13} />
        <span>{task.due ? task.due.replaceAll("-", ".") : text.dueUnset}</span>
      </div>
      <div className="task-meta">
        {childrenCount > 0 ? (
          <span className="child-progress">
            <span className="tiny-track">
              <i
                style={{ width: `${(completedCount / childrenCount) * 100}%` }}
              />
            </span>
            {completedCount}/{childrenCount}
          </span>
        ) : (
          <StatusBadge status={task.status} />
        )}
        <span className="task-person">
          {task.owner ? (
            <>
              <span className="avatar-mini">{task.owner.slice(0, 1)}</span>
              {task.owner}
            </>
          ) : (
            <UserRound size={12} />
          )}
        </span>
        {task.due && (
          <span className="task-due">
            <CalendarDays size={11} />
            {task.due.slice(5).replace("-", "/")}
          </span>
        )}
      </div>
      {imageError && (
        <div className="image-error" role="alert">
          {imageError}
          <button aria-label="关闭图片错误" onClick={() => setImageError("")}>
            ×
          </button>
        </div>
      )}
      {busy && (
        <div className="image-processing" role="status">
          {language !== "zh" ? "Processing image…" : "正在处理图片…"}
        </div>
      )}
      {detailsVisible && (
        <div
          className={`task-details nodrag nowheel ${task.expanded ? "details-enter" : "details-leave"}`}
          inert={!task.expanded}
        >
          <label className="field-label">
            {language !== "zh" ? "Task name" : "任务名称"}
            <EditField
              key={task.title}
              value={task.title}
              label={language !== "zh" ? "Task name" : "任务名称"}
              onSave={(title) =>
                patch(task.id, { title: title.trim() || task.title })
              }
            />
          </label>
          <PhotoGallery
            images={images}
            busy={busy}
            onAdd={() => fileInput.current?.click()}
            onChange={changeImages}
            onPreview={(index, rect) => setPreview({ index, rect })}
          />
          <div className="field-pair">
            <label className="field-label">
              {text.ownerLabel}
              <select
                aria-label={text.ownerLabel}
                value={task.owner}
                onChange={(e) => patch(task.id, { owner: e.target.value })}
              >
                <option value="">{text.unassigned}</option>
                <option>我</option>
                <option>伴侣</option>
                <option>一起</option>
                <option>家人</option>
                <option>婚庆</option>
                {task.owner &&
                  !["我", "伴侣", "一起", "家人", "婚庆"].includes(
                    task.owner,
                  ) && <option>{task.owner}</option>}
              </select>
            </label>
            <label className="field-label">
              {text.status}
              <select
                aria-label={text.status}
                value={task.status}
                onChange={(e) => status(task.id, e.target.value as Status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusText(language)[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-pair">
            <label className="field-label">
              {language !== "zh" ? "Due date" : "截止日期"}
              <DateField
                label={language !== "zh" ? "Due date" : "截止日期"}
                value={task.due}
                onChange={(due) => patch(task.id, { due })}
              />
            </label>
            <label className="field-label">
              {language !== "zh" ? "Estimated cost · CNY" : "预计费用 · 元"}
              <input
                aria-label="预计费用"
                type="number"
                min="0"
                max="100000000"
                value={task.budget || ""}
                placeholder={language !== "zh" ? "Not set" : "未填写"}
                onChange={(e) =>
                  patch(task.id, {
                    budget: Math.max(
                      0,
                      Math.min(100000000, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
            </label>
          </div>
          <label className="field-label">
            {text.notes}
            <EditField
              key={`${task.id}-${task.description}`}
              value={task.description}
              label={language !== "zh" ? "Ideas, requirements or open questions" : "记录想法、要求或待确认事项"}
              multiline
              onSave={(description) => patch(task.id, { description })}
            />
          </label>
          <label className="field-label">
            {text.reference}
            <div className="link-field">
              <Link2 size={14} />
              <EditField
                key={task.link}
                value={task.link}
                label="https://"
                onSave={(link) => {
                  if (!link || /^https?:\/\//i.test(link))
                    patch(task.id, { link });
                }}
              />
              {task.link && (
                <a
                  href={task.link}
                  target="_blank"
                  rel="noreferrer"
                  title={language !== "zh" ? "Open reference link" : "打开参考链接"}
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </label>
          <div className="detail-bottom">
            <div className="swatches" aria-label="分支颜色">
              {Object.entries(COLORS).map(([key, c]) => (
                <button
                  key={key}
                  title={c.label}
                  aria-label={`设为${c.label}`}
                  aria-pressed={task.color === key}
                  style={{ background: c.line }}
                  onClick={() =>
                    patch(task.id, { color: key as Task["color"] })
                  }
                >
                  {task.color === key && <Check size={10} />}
                </button>
              ))}
            </div>
            <button
              className="icon-button danger"
              title="删除任务及子任务"
              aria-label={`删除：${task.title}`}
              disabled={isRoot}
              onClick={() => remove(task.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="card-actions">
            <button onClick={() => add(task.id)}>
              <Plus size={13} />
              {text.addSubtask}
            </button>
            {!isRoot && (
              <button onClick={() => add(task.id, true)}>
                <CornerDownRight size={13} />
                {text.addSibling}
              </button>
            )}
          </div>
        </div>
      )}
      {preview && images[preview.index] && (
        <PhotoPreview
          images={images}
          index={preview.index}
          origin={preview.rect}
          onClose={() => setPreview(null)}
        />
      )}
      {mode === "map" && (
        <div className="branch-actions nodrag" role="toolbar" aria-label={`任务操作：${task.title}`}>
          <button
            title={text.addSubtask}
            aria-label={`${text.addSubtask}: ${task.title}`}
            onClick={() => add(task.id)}
          >
            <Plus size={12} />
          </button>
          {!isRoot && (
            <button
              className="context-action"
              title={text.addSibling}
              aria-label={`${text.addSibling}: ${task.title}`}
              onClick={() => add(task.id, true)}
            >
              <CornerDownRight size={12} />
            </button>
          )}
          <button className="context-action" title={text.edit} aria-label={text.edit} onClick={editTitle}>
            <Pencil size={12} />
          </button>
          <button className="context-action" title={text.details} aria-label={text.details} onClick={() => openDetails ? openDetails(task.id) : patch(task.id, { expanded: !task.expanded })}>
            <PanelTopOpen size={12} />
          </button>
          {!isRoot && (
            <button className="context-action" title={language !== "zh" ? "Delete task" : "删除任务"} aria-label={language !== "zh" ? "Delete task" : "删除任务"} onClick={() => remove(task.id)}>
              <Trash2 size={12} />
            </button>
          )}
          {childrenCount > 0 && (
            <button
              title={task.collapsed ? "展开分支" : "收起分支"}
              aria-expanded={!task.collapsed}
              aria-label={`${task.collapsed ? "展开" : "收起"}分支：${task.title}`}
              onClick={() => patch(task.id, { collapsed: !task.collapsed })}
            >
              {task.collapsed ? (
                <>
                  <ChevronRight size={11} />
                  <span>{childrenCount}</span>
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  <span>{childrenCount}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
