export const DESERT_CAMEL_COUNT = 7;
export const DESERT_CAMEL_SPACING = 104;
export const DESERT_CARAVAN_LENGTH = DESERT_CAMEL_COUNT * DESERT_CAMEL_SPACING;

// Match the scale of the task axis, then let React Flow transform both together.
// Zoom must not change the loop length or a later lap would jump on navigation.
export function desertCaravanScale(trackLength: number) {
  return .5 * Math.min(4, Math.max(.72, trackLength / 4000), trackLength / (DESERT_CARAVAN_LENGTH * 1.65));
}
