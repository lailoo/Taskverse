export const STATUSES = ["todo", "doing", "waiting", "done"] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["none", "low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
};
export type Color = "purple" | "blue" | "mint" | "pink" | "peach" | "yellow";
export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  owner: string;
  due: string;
  status: Status;
  priority?: Priority;
  color: Color;
  budget: number;
  link: string;
  image: string;
  images?: string[];
  expanded: boolean;
  collapsed: boolean;
}
export interface Project {
  title: string;
  date: string;
  budget: number;
  tasks: Task[];
}
export const STATUS_LABELS: Record<Status, string> = {
  todo: "待办",
  doing: "进行中",
  waiting: "等回复",
  done: "已完成",
};
export const COLORS: Record<
  Color,
  { line: string; background: string; ink: string; label: string }
> = {
  purple: {
    line: "#b69adf",
    background: "#f2eafa",
    ink: "#725298",
    label: "淡紫",
  },
  blue: {
    line: "#91c4ed",
    background: "#eaf4fc",
    ink: "#477da6",
    label: "浅蓝",
  },
  mint: {
    line: "#87c9b5",
    background: "#e8f5ef",
    ink: "#41856f",
    label: "薄荷绿",
  },
  pink: {
    line: "#e6a2bb",
    background: "#fbeaf1",
    ink: "#a7607d",
    label: "浅粉",
  },
  peach: {
    line: "#e5b183",
    background: "#fcf0e5",
    ink: "#a67743",
    label: "杏色",
  },
  yellow: {
    line: "#d7c471",
    background: "#faf5df",
    ink: "#928031",
    label: "鹅黄",
  },
};
