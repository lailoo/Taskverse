export const DESERT_SETTINGS_KEY = "wedding-map-desert-settings";
export const DEFAULT_DESERT_SETTINGS = { caravanSpeed: 1, citySpeed: 1, windSpeed: 1, dust: 1, brightness: 1 };
export type DesertSettings = typeof DEFAULT_DESERT_SETTINGS;
export const DESERT_SLIDERS = [
  { key: "caravanSpeed", label: "驼队速度", min: .25, max: 2, step: .25, unit: "×" },
  { key: "citySpeed", label: "巨城掠过速度", min: 0, max: 2, step: .1, unit: "×" },
  { key: "windSpeed", label: "风沙速度", min: 0, max: 2, step: .1, unit: "×" },
  { key: "dust", label: "沙雾浓度", min: 0, max: 1.5, step: .1, unit: "%" },
  { key: "brightness", label: "场景亮度", min: .6, max: 1.4, step: .05, unit: "%" },
] as const;
export function normalizeDesertSettings(value: unknown): DesertSettings {
  const result = { ...DEFAULT_DESERT_SETTINGS };
  if (!value || typeof value !== "object") return result;
  for (const { key, min, max } of DESERT_SLIDERS) {
    const n = (value as Record<string, unknown>)[key];
    if (typeof n === "number" && Number.isFinite(n)) result[key] = Math.max(min, Math.min(max, n));
  }
  return result;
}
