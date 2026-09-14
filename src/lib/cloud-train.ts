// Geometry and timing are shared by the SVG consist and the traffic clock.
export const CLOUD_COACH_COUNT = 10;
export const CLOUD_COACH_SPACING = 80;
export const CLOUD_TRAIN_UV_SCALE = CLOUD_COACH_SPACING * 9;
export const CLOUD_TRAIN_LENGTH = (CLOUD_COACH_COUNT / 9 + .05) * CLOUD_TRAIN_UV_SCALE;

export function cloudTrainScale(trackLength: number) {
  return Math.min(1, trackLength / (CLOUD_TRAIN_LENGTH * 1.5));
}

export function cloudTrainLoopLength(trackLength: number) {
  // Let the last coach leave the bridge before the next engine enters.
  return trackLength + CLOUD_TRAIN_LENGTH * cloudTrainScale(trackLength) + 12;
}
