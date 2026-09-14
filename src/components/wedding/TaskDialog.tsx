"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Task } from "@/lib/types";
import { TaskCard, type TaskActions } from "./TaskCard";

export function TaskDialog({ task, tasks, actions, onClose }: {
  task: Task;
  tasks: Task[];
  actions: TaskActions;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const children = tasks.filter((child) => child.parentId === task.id);
  return (
    <dialog
      ref={dialog}
      className="task-detail-dialog"
      aria-label={`任务详情：${task.title}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="task-detail-window" data-priority="none">
        <button className="icon-button task-detail-close" aria-label="关闭任务详情" title="关闭任务详情" autoFocus onClick={onClose}>
          <X size={18} />
        </button>
        <TaskCard
          task={{ ...task, expanded: true }}
          mode="board"
          showOwner={false}
          colorByPriority={false}
          childrenCount={children.length}
          completedCount={children.filter((child) => child.status === "done").length}
          {...actions}
          openDetails={undefined}
          remove={(id) => { onClose(); actions.remove(id); }}
          add={(id, sibling) => { onClose(); actions.add(id, sibling); }}
        />
      </section>
    </dialog>
  );
}
