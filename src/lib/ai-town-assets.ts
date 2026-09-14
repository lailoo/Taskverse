/** AI Town terrain and extended building sprites, sampled without smoothing. See SOURCES.md. */
import buildingSheet from "../../public/assets/ai-town/buildings/town-buildings.json";

export const AI_TOWN_ASSETS = {
  terrain: "/assets/ai-town/gentle-obj.png",
  buildings: `/assets/ai-town/buildings/town-buildings.png?v=${buildingSheet.revision}`,
  residents: "/assets/ai-town/32x32folk.png",
  windmill: "/assets/ai-town/windmill.png",
  waterfall: "/assets/ai-town/gentlewaterfall32.png",
  fire: "/assets/ai-town/campfire.png",
} as const;
export type TownImages = Record<keyof typeof AI_TOWN_ASSETS, HTMLImageElement>;
export const TOWN_STATUS = {
  todo: { color: "#ebe1b7", label: "待筹备" },
  doing: { color: "#85c8f4", label: "建设中" },
  waiting: { color: "#efba5b", label: "等回复" },
  done: { color: "#91d695", label: "已完成" },
} as const;

export function loadTownImages(): Promise<TownImages> {
  return Promise.all(Object.entries(AI_TOWN_ASSETS).map(([key, src]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([key, image]);
    image.onerror = () => reject(new Error(`地图素材加载失败：${src}`));
    image.src = src;
  }))).then(entries => Object.fromEntries(entries) as TownImages);
}
