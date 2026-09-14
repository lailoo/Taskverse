import { CircleDashed, CircleDot, Clock3, CircleCheck } from "lucide-react";
import { type Status } from "@/lib/types";
import { statusText, useAppLanguage } from "@/lib/i18n";

const icons = {
  todo: CircleDashed,
  doing: CircleDot,
  waiting: Clock3,
  done: CircleCheck,
};

export function StatusBadge({ status }: { status: Status }) {
  const language = useAppLanguage();
  const Icon = icons[status];
  return (
    <span
      className={`status-label status-badge status-${status}`}
      style={{ color: "var(--status-ink)", background: "var(--status-bg)" }}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{statusText(language)[status]}</span>
    </span>
  );
}
