import type { Task } from "@/lib/types";

export function architectureKind(task: Task, level: number) {
  if (!task.parentId) return "civic";
  if (/预算|付款|定金|费用/.test(task.title)) return "office";
  if (/餐|场地|宴|酒|婚纱|礼服|妆/.test(task.title)) return "commercial";
  if (/车|交通|物品|应急|运输/.test(task.title)) return "industrial";
  return level >= 3 ? "apartment" : level === 2 ? "rowhouse" : "house";
}

export const ARCHITECTURE_LABELS: Record<string, string> = {
  civic: "市政建筑", office: "办公建筑", commercial: "服务建筑", industrial: "物流建筑",
  apartment: "居民建筑", rowhouse: "居民建筑", house: "居民建筑",
};

/** Top-down pixel-town building sprite. Every task uses the same tile language. */
export function CityArchitecture({ task, level }: { task: Task; level: number }) {
  const kind = architectureKind(task, level);
  const colors: Record<string, [string, string, string]> = {
    civic: ["#466c80", "#263f58", "#d8bc70"], office: ["#60859a", "#304f68", "#a9d4d3"],
    commercial: ["#8d5d66", "#503746", "#e8a86b"], industrial: ["#687870", "#3f514e", "#c7a468"],
    apartment: ["#6c668f", "#403b65", "#d89e68"], rowhouse: ["#8f6b55", "#593f3c", "#d8b56d"], house: ["#71845d", "#41563f", "#ddb777"],
  };
  const [roof, wall, accent] = colors[kind];
  const size = 42 + level * 6;
  const windows = Array.from({ length: Math.max(2, level + 1) }, (_, row) => Array.from({ length: 3 }, (_, column) => <rect key={`${row}-${column}`} x={52 + column * 13} y={42 + row * 12} width="7" height="6" fill={task.status === "done" ? "#ffe48b" : accent} />));
  return <svg className="city-architecture city-pixel-sprite" viewBox="0 0 160 120" aria-hidden="true" data-architecture={kind}>
    <rect x="13" y="90" width="134" height="17" fill="#385347" opacity=".35" />
    <rect x="26" y="22" width={size + 35} height={size + 25} fill="#1e3b39" opacity=".32" />
    <rect x="31" y="17" width={size + 35} height={size + 25} fill={wall} stroke="#1f3338" strokeWidth="3" />
    <path d={`M27 18h${size + 43}v12H27z`} fill={roof} stroke="#263c42" strokeWidth="3" />
    <path d={`M31 42h${size + 35}v${size}H31z`} fill={wall} />
    {windows}
    <rect x="78" y={87 - Math.min(level * 2, 8)} width="15" height="20" fill="#352d36" />
    <rect x="81" y={90 - Math.min(level * 2, 8)} width="8" height="11" fill={accent} />
    <rect x="24" y="34" width="8" height="34" fill="#33494b" />
    <rect x="128" y="31" width="8" height="42" fill="#33494b" />
    <circle cx="20" cy="92" r="10" fill="#49724d" /><circle cx="140" cy="94" r="10" fill="#49724d" />
    {task.status === "doing" && <><rect x="130" y="10" width="3" height="48" fill="#bf814b" /><rect x="107" y="10" width="26" height="3" fill="#bf814b" /><rect x="105" y="10" width="3" height="36" fill="#bf814b" /></>}
  </svg>;
}
