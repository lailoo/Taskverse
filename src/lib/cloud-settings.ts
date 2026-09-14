export const CLOUD_SETTINGS_KEY = "wedding-map-cloud-settings";

export const CLOUD_QUALITY = {
  economy: { label: "流畅", pixels: 500_000, fps: 24 },
  balanced: { label: "均衡", pixels: 1_000_000, fps: 36 },
  high: { label: "细腻", pixels: 1_800_000, fps: 60 },
} as const;

export const CLOUD_SLIDERS = [
  { key: "trainSpeed", label: "列车速度", min: .25, max: 3, step: .25, unit: "speed" },
  { key: "farSpeed", label: "远云速度", min: 0, max: 2, step: .1, unit: "speed" },
  { key: "nearSpeed", label: "近云速度", min: 0, max: 2, step: .1, unit: "speed" },
  { key: "density", label: "云量", min: .5, max: 1.5, step: .05, unit: "percent" },
  { key: "brightness", label: "亮度", min: .6, max: 1.4, step: .05, unit: "percent" },
  { key: "motionBlur", label: "运动模糊", min: 0, max: 1, step: .1, unit: "percent" },
] as const;

export type CloudSettings = Record<typeof CLOUD_SLIDERS[number]["key"], number> & {
  quality: keyof typeof CLOUD_QUALITY;
  dynamicLight: boolean;
};

export const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  trainSpeed: 1, farSpeed: 1, nearSpeed: 1, density: 1,
  brightness: 1, motionBlur: 1, quality: "balanced", dynamicLight: true,
};

/** Preferences are browser-local; never part of the task project or its versions. */
export function normalizeCloudSettings(value: unknown): CloudSettings {
  const result = { ...DEFAULT_CLOUD_SETTINGS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const stored = value as Record<string, unknown>;
  for (const { key, min, max, step } of CLOUD_SLIDERS) {
    const number = stored[key];
    if (typeof number !== "number" || !Number.isFinite(number)) continue;
    const bounded = Math.max(min, Math.min(max, number));
    result[key] = Number((min + Math.round((bounded - min) / step) * step).toFixed(2));
  }
  if (typeof stored.quality === "string" && Object.hasOwn(CLOUD_QUALITY, stored.quality)) {
    result.quality = stored.quality as CloudSettings["quality"];
  }
  if (typeof stored.dynamicLight === "boolean") result.dynamicLight = stored.dynamicLight;
  return result;
}
