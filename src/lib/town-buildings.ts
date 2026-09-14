import type { Task } from "./types";
import atlas from "../../public/assets/ai-town/buildings/town-buildings.json";

export type TownSpriteKind = keyof typeof atlas.frames;
export type TownBuildingKind = TownSpriteKind | "camp" | "windmill";
export const TOWN_BUILDING_LABELS: Record<TownBuildingKind, string> = {
  ...Object.fromEntries(Object.entries(atlas.frames).map(([kind, info]) => [kind, info.label])),
  camp: "林间营地", windmill: "市政风车",
} as Record<TownBuildingKind, string>;

const rules: [RegExp, TownBuildingKind][] = [
  [/原版木屋|木屋|小屋|住宅|cottage/i, "cottage"],
  [/婚车|交通|接送|接驳|巴士|出行|车队|运输|shuttle|transport/i, "station"],
  [/鸿福大酒店|大酒店|grand\s*hotel/i, "grandhotel"],
  [/龙门客栈|客栈|dragon\s*inn/i, "dragoninn"],
  [/小旅馆|旅店|lodge|小酒店/i, "lodge"],
  [/箭塔|瞭望塔|防御塔|watchtower|arrow\s*tower/i, "watchtower"],
  [/围墙|城墙|墙体|wall|fortification/i, "wall"],
  [/预算|费用|定金|尾款|付款|支付|账|资金|budget|payment/i, "bank"],
  [/摄影|摄像|拍照|影像|录像|照片|photo|video/i, "studio"],
  [/鲜花|花艺|布置|灵感|绿植|花束|florist|flower|decor/i, "florist"],
  [/试菜|餐|酒水|菜单|饮|蛋糕|甜品|宴|cater|menu|cake/i, "tavern"],
  [/婚纱|礼服|西装|化妆|试妆|妆|服装|造型|首饰|珠宝|婚戒|dress|makeup/i, "boutique"],
  [/誓词|音乐|致辞|舞台|彩排|演出|敬酒|music|vow|rehearsal/i, "pavilion"],
  [/请柬|邀请|名单|回复|邮件|invite|rsvp/i, "postoffice"],
  [/物品|应急|物资|清单|采购|货|道具|supplies|inventory/i, "warehouse"],
  [/仪式|教堂|典礼|流程|礼堂|ceremony|chapel/i, "chapel"],
  [/场地|住宿|宾客|接待|酒店|民宿|旅馆|venue|hotel|guest/i, "inn"],
  [/营地|露营|野营|camp/i, "camp"],
  [/花园|户外|休息|休闲|garden|home/i, "cottage"],
];
const defaultKinds: TownSpriteKind[] = ["cottage", "inn", "tavern", "boutique", "florist", "studio", "chapel", "warehouse", "station", "bank", "postoffice", "pavilion", "grandhotel", "dragoninn", "lodge", "watchtower", "wall"];

function hashId(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Task meaning picks the use; task ID picks a stable architectural variant. */
export function selectTownBuilding(task: Pick<Task, "id" | "parentId" | "title">, districtTitle = "") {
  const hash = hashId(task.id);
  const kind = !task.parentId ? "windmill" :
    rules.find(([pattern]) => pattern.test(task.title))?.[1] ??
    rules.find(([pattern]) => pattern.test(districtTitle))?.[1] ??
    defaultKinds[(hash >>> 8) % defaultKinds.length];
  return { kind, variant: (hash % 3) as 0 | 1 | 2 };
}

export function townBuildingFrame(kind: TownBuildingKind, variant: number) {
  if (kind === "windmill" || kind === "camp") return null;
  return atlas.frames[kind].variants[variant % 3];
}
