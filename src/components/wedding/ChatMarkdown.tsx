"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Crosshair } from "lucide-react";
import type { Task } from "@/lib/types";
import { remarkTaskReferences, resolveTaskReference } from "@/lib/task-references";
import { STATUS_LABELS } from "@/lib/types";

export function ChatMarkdown({ content, tasks = [], onTaskClick }: { content: string; tasks?: Task[]; onTaskClick?: (id: string) => void }) {
  return (
    <div className="ai-markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks, [remarkTaskReferences, { tasks }]]}
        skipHtml
        components={{
          a: ({ children, href }) => {
            if (href?.startsWith("#task/")) {
              let reference = "";
              try { reference = decodeURIComponent(href.slice(6)); } catch { /* Invalid references remain plain text. */ }
              const task = resolveTaskReference(tasks, reference);
              return task ? <button type="button" className="ai-task-reference" title={`在画布定位：${task.title}\n${tasks.find(parent => parent.id === task.parentId)?.title || "婚礼计划"} · ${STATUS_LABELS[task.status]} · ${task.due || "日期待定"}`} aria-label={`在画布定位：${task.title}，${STATUS_LABELS[task.status]}`} onClick={() => onTaskClick?.(task.id)}>
                <span className="ai-task-reference-status" data-status={task.status} aria-hidden="true" />
                <span className="ai-task-reference-title">{task.title}</span>
                {task.due && <span className="ai-task-reference-date">{task.due.slice(5).replace("-", "/")}</span>}
                <Crosshair size={11} className="ai-task-reference-locate" aria-hidden="true" />
              </button> : <span title="任务不存在或已删除">{children}</span>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          table: ({ children }) => <div className="ai-markdown-table" tabIndex={0} role="region" aria-label="回复中的表格"><table>{children}</table></div>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
