/**
 * Optional 3D asset slots for the city view.
 *
 * The default renderer is the original SVG architecture so the app works
 * without downloading any binary files. When a GLB is placed at the listed
 * public path, a future Three.js renderer can use this manifest to replace
 * the matching building while keeping the same task-to-building mapping.
 */
export type CityAssetKind =
  | "house"
  | "rowhouse"
  | "apartment"
  | "commercial"
  | "office"
  | "industrial"
  | "civic";

export type CityAsset = {
  kind: CityAssetKind;
  label: string;
  source: "original-svg" | "quaternius" | "kenney";
  path?: string;
  license: "original" | "CC0";
};

export const CITY_ASSETS: Record<CityAssetKind, CityAsset> = {
  house: { kind: "house", label: "花园住宅", source: "original-svg", license: "original" },
  rowhouse: { kind: "rowhouse", label: "联排住宅", source: "original-svg", license: "original" },
  apartment: { kind: "apartment", label: "阶梯公寓", source: "original-svg", license: "original" },
  commercial: { kind: "commercial", label: "商业街区", source: "original-svg", license: "original" },
  office: { kind: "office", label: "办公塔楼", source: "original-svg", license: "original" },
  industrial: { kind: "industrial", label: "物流工坊", source: "original-svg", license: "original" },
  civic: { kind: "civic", label: "城市会堂", source: "original-svg", license: "original" },
};

/** Optional downloaded model overrides. Keep these paths empty until assets are reviewed. */
export const CITY_MODEL_OVERRIDES: Partial<Record<CityAssetKind, CityAsset>> = {
  // commercial: { kind: "commercial", label: "商业街区", source: "quaternius", path: "/models/city/commercial.glb", license: "CC0" },
};

export function cityAssetFor(kind: CityAssetKind): CityAsset {
  return CITY_MODEL_OVERRIDES[kind] ?? CITY_ASSETS[kind];
}
