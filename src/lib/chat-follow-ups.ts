export type FollowUp = { label: string; message: string };
export type QueuedMessage = { id: string; sessionId: string; text: string; search?: boolean };

/** Move an explicit Steer target to the front and release the todo gate. */
export function prioritizeQueuedMessage(queue: QueuedMessage[], id: string) {
  const item = queue.find(entry => entry.id === id);
  if (!item) return null;
  return {
    queue: [item, ...queue.filter(entry => entry.id !== id)],
    bypassTodoPause: true,
  };
}

export function validFollowUps(value: unknown): value is FollowUp[] {
  return Array.isArray(value) && value.length <= 3 && value.every(item =>
    item && typeof item.label === "string" && item.label.trim().length > 0 && item.label.length <= 80 &&
    typeof item.message === "string" && item.message.trim().length > 0 && item.message.length <= 1000,
  );
}

export function conversationFollowUps(messages: { role: string; followUps?: FollowUp[]; tasks?: { title: string }[] }[]): FollowUp[] {
  const latest = messages.findLast(message => message.role === "assistant");
  if (latest) {
    if (validFollowUps(latest.followUps)) return latest.followUps;
    return [...new Set(latest.tasks?.map(task => task.title) || [])].slice(0, 3).map(title => ({
      label: `细化：${title}`,
      message: `请继续讨论“${title}”，结合刚才的结论和当前计划，明确具体步骤、前置条件和需要我确认的信息。`,
    }));
  }
  return [
    { label: "检查整体进展与风险", message: "请 review 当前婚礼筹备整体进展，列出风险和本周优先事项。" },
    { label: "安排接下来要做的任务", message: "请根据当前未完成任务的优先级和截止日期，安排接下来要做的任务，并说明先后顺序。" },
    { label: "补充遗漏的筹备事项", message: "请检查当前计划，补充遗漏的筹备任务，避免重复。" },
  ];
}
