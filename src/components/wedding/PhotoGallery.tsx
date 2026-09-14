"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Trash2,
  ImagePlus,
} from "lucide-react";

export function PhotoPreview({
  images,
  index,
  origin,
  onClose,
}: {
  images: string[];
  index: number;
  origin: DOMRect;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 220);
  };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const style = {
    "--origin-x": `${origin.x + origin.width / 2 - window.innerWidth / 2}px`,
    "--origin-y": `${origin.y + origin.height / 2 - window.innerHeight / 2}px`,
    "--origin-scale": Math.max(
      0.06,
      origin.width / Math.min(window.innerWidth - 48, 1000),
    ),
  } as CSSProperties;
  return createPortal(
    <dialog
      ref={dialog}
      className={`photo-lightbox ${closing ? "closing" : ""}`}
      style={style}
      aria-label="图片预览"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setCurrent((i) => (i + 1) % images.length);
        if (e.key === "ArrowLeft")
          setCurrent((i) => (i - 1 + images.length) % images.length);
      }}
    >
      <button
        className="preview-close"
        aria-label="关闭图片预览"
        onClick={close}
        autoFocus
      >
        <X size={22} />
      </button>
      <figure>
        <img
          key={images[current]}
          src={images[current]}
          alt={`任务图片 ${current + 1}`}
        />
        <figcaption>
          {current + 1} / {images.length}
        </figcaption>
      </figure>
      {images.length > 1 && (
        <>
          <button
            className="preview-prev"
            aria-label="上一张图片"
            onClick={() =>
              setCurrent((i) => (i - 1 + images.length) % images.length)
            }
          >
            <ChevronLeft />
          </button>
          <button
            className="preview-next"
            aria-label="下一张图片"
            onClick={() => setCurrent((i) => (i + 1) % images.length)}
          >
            <ChevronRight />
          </button>
        </>
      )}
    </dialog>,
    document.body,
  );
}

export function PhotoGallery({
  images,
  busy,
  onAdd,
  onChange,
  onPreview,
}: {
  images: string[];
  busy: boolean;
  onAdd: () => void;
  onChange: (images: string[]) => void;
  onPreview: (index: number, rect: DOMRect) => void;
}) {
  return (
    <section className="photo-gallery" aria-label="任务图片">
      <div className="photo-gallery-heading">
        <span>
          图片 <small>{images.length}/8</small>
        </span>
        <button
          type="button"
          title="上传图片"
          aria-label="上传图片"
          disabled={busy || images.length >= 8}
          onClick={onAdd}
        >
          <ImagePlus size={15} />
        </button>
      </div>
      <div className="photo-grid">
        {images.map((src, i) => (
          <div className="photo-thumb" key={`${i}-${src.slice(-28)}`}>
            <button
              className="photo-open"
              aria-label={`预览图片 ${i + 1}`}
              onClick={(e) =>
                onPreview(i, e.currentTarget.getBoundingClientRect())
              }
            >
              <img src={src} alt={`附件 ${i + 1}`} />
            </button>
            <div className="photo-thumb-actions">
              <button
                aria-label={`设图片 ${i + 1} 为封面`}
                title="设为封面"
                aria-pressed={i === 0}
                onClick={() =>
                  onChange([src, ...images.filter((_, n) => n !== i)])
                }
              >
                <Star size={12} fill={i === 0 ? "currentColor" : "none"} />
              </button>
              <button
                aria-label={`删除图片 ${i + 1}`}
                title="删除图片"
                onClick={() => onChange(images.filter((_, n) => n !== i))}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {images.length < 8 && (
          <button
            className="photo-add"
            aria-label="添加图片"
            disabled={busy}
            onClick={onAdd}
          >
            <Plus size={19} />
            <span>{busy ? "处理中" : "添加图片"}</span>
          </button>
        )}
      </div>
    </section>
  );
}
