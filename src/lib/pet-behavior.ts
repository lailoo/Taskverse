export type PetAction = "fetch" | "grab" | "fall" | "kick" | "laser" | "skate" | "sit" | "stand" | "roll" | "stroke" | "poke" | "call" | "rest" | "charge";
/** Actions that can run end-to-end without an external pointer, tag, or dock. */
export const RANDOM_CLICK_ACTIONS: PetAction[] = ["stroke", "poke", "call", "sit", "stand", "kick", "grab", "fall", "skate", "roll", "rest"];
type Phase = { name: string; duration: number; bubble?: string };
export const PET_ACTIONS: Record<PetAction, { label: string; phases: Phase[] }> = {
  fetch: { label: "抛球叼回", phases: [{ name: "observe", duration: 800, bubble: "咕？" }, { name: "approach", duration: 900 }, { name: "pickup", duration: 1500 }, { name: "grip", duration: 500 }, { name: "lift", duration: 1500 }, { name: "carry", duration: 1500 }, { name: "lower", duration: 1200 }, { name: "drop", duration: 500 }, { name: "return", duration: 1200 }, { name: "proud", duration: 900, bubble: "咕咕咕！" }] },
  grab: { label: "叼起小袜子", phases: [{ name: "observe", duration: 700, bubble: "咕？" }, { name: "pickup", duration: 1800 }, { name: "grip", duration: 600 }, { name: "lift", duration: 1800 }, { name: "carry", duration: 1300 }, { name: "lower", duration: 1400 }, { name: "drop", duration: 500 }, { name: "return", duration: 1400 }, { name: "proud", duration: 1000, bubble: "给你，咕咕！" }] },
  fall: { label: "碰倒起身", phases: [{ name: "tumble", duration: 650, bubble: "嘎！" }, { name: "stunned", duration: 1000, bubble: "……" }, { name: "tuck", duration: 900 }, { name: "turnover", duration: 1200 }, { name: "pushup", duration: 1000 }, { name: "rise", duration: 1300 }, { name: "shake", duration: 900, bubble: "哼，没事。" }] },
  sit: { label: "坐下", phases: [{ name: "sit", duration: 1600 }, { name: "seated", duration: 600, bubble: "陪你～" }] },
  stand: { label: "站起来", phases: [{ name: "standup", duration: 1500 }, { name: "standing", duration: 500 }] },
  roll: { label: "前滚翻", phases: [{ name: "rollcrouch", duration: 1000 }, { name: "rollover", duration: 1800 }, { name: "standup", duration: 1200 }, { name: "proud", duration: 800, bubble: "咕咕！" }] },
  kick: { label: "踢小球", phases: [{ name: "observe", duration: 1000, bubble: "咕？" }, { name: "aim", duration: 800 }, { name: "kick", duration: 700 }, { name: "chase", duration: 1800 }, { name: "proud", duration: 900, bubble: "咕咕！" }] },
  laser: { label: "追光点", phases: [{ name: "hunt", duration: 1600, bubble: "咕？" }, { name: "pounce", duration: 1300 }, { name: "search", duration: 1600, bubble: "咦？" }] },
  skate: { label: "轮滑彩蛋", phases: [{ name: "wheels", duration: 1000, bubble: "出发！" }, { name: "skate", duration: 4000 }, { name: "brake", duration: 1200, bubble: "呼……" }] },
  stroke: { label: "摸摸头", phases: [{ name: "stroke", duration: 2200, bubble: "咕咕咕～" }] },
  poke: { label: "戳戳尾部", phases: [{ name: "surprise", duration: 700, bubble: "嘎！" }, { name: "lookback", duration: 1500, bubble: "谁呀？" }] },
  call: { label: "叫名字", phases: [{ name: "listen", duration: 900, bubble: "咕？" }, { name: "come", duration: 1500, bubble: "来啦！" }] },
  rest: { label: "蹲下休息", phases: [{ name: "sit", duration: 1800 }, { name: "sleep", duration: 6500, bubble: "呼噜……" }, { name: "wake", duration: 1200, bubble: "咕？" }] },
  charge: { label: "去充电", phases: [{ name: "dock", duration: 1500, bubble: "没电啦……" }, { name: "charging", duration: 4500, bubble: "陪我一会儿？" }, { name: "wake", duration: 1200, bubble: "咕咕！" }] },
};

export function petPhase(action: PetAction, elapsed: number) {
  let start = 0;
  for (const phase of PET_ACTIONS[action].phases) {
    if (elapsed < start + phase.duration) return { ...phase, progress: Math.max(0, (elapsed - start) / phase.duration) };
    start += phase.duration;
  }
  return null;
}

export type DuckPose = { hip: number; knee: number; ankle: number; neck: number; head: number; pitch: number; roll: number; jaw: number };
export const STANDING_POSE: DuckPose = { hip: -.4579, knee: -.0049, ankle: .453, neck: .3491, head: .3491, pitch: 0, roll: 0, jaw: 0 };
// HOME and SIT/FOLD joint angles follow the official MJCF; transitions are custom.
const seated: DuckPose = { ...STANDING_POSE, hip: -.5236, knee: 1.0472, ankle: 0, neck: .5, head: 1.4 };
const pick: DuckPose = { ...STANDING_POSE, hip: 1.15, knee: 1.5, ankle: .15, neck: 1, head: 1.25, pitch: .18 };
const back: DuckPose = { ...seated, hip: -.9, neck: .65, head: -.25, pitch: -Math.PI / 2 };
const tucked: DuckPose = { ...pick, pitch: -Math.PI / 2 };
const support: DuckPose = { ...pick, pitch: .8 };
const crouched: DuckPose = { ...seated, hip: .35, knee: 1.3, neck: .55, head: .7, pitch: .25 };
export function blendPose(from: DuckPose, to: DuckPose, progress: number): DuckPose {
  const p = Math.max(0, Math.min(1, progress)); if (p === 0) return { ...from }; if (p === 1) return { ...to }; const eased = p * p * (3 - 2 * p);
  return Object.fromEntries(Object.keys(from).map(key => [key, from[key as keyof DuckPose] + (to[key as keyof DuckPose] - from[key as keyof DuckPose]) * eased])) as DuckPose;
}
export function duckPose(mood: string, progress: number): DuckPose {
  switch (mood) {
    case "sit": return blendPose(STANDING_POSE, seated, progress);
    case "seated": case "sleep": case "charging": return { ...seated };
    case "wake": case "standup": return blendPose(seated, STANDING_POSE, progress);
    case "pickup": return blendPose(STANDING_POSE, { ...pick, jaw: 1 }, progress);
    case "grip": return { ...pick, jaw: 1 - progress * .8 };
    case "lift": return blendPose({ ...pick, jaw: .2 }, { ...STANDING_POSE, jaw: .2 }, progress);
    case "carry": return { ...STANDING_POSE, jaw: .2 };
    case "lower": return blendPose({ ...STANDING_POSE, jaw: .2 }, { ...pick, jaw: .2 }, progress);
    case "drop": return { ...pick, jaw: .2 + progress * .8 };
    case "return": return blendPose({ ...pick, jaw: 1 }, STANDING_POSE, progress);
    case "tumble": return blendPose(STANDING_POSE, back, progress);
    case "stunned": return { ...back };
    case "tuck": return blendPose(back, tucked, progress);
    case "turnover": return { ...blendPose(tucked, support, progress), roll: Math.sin(progress * Math.PI) * .65 };
    case "pushup": return blendPose(support, crouched, progress);
    case "rise": return blendPose(crouched, STANDING_POSE, progress);
    case "rollcrouch": return blendPose(STANDING_POSE, seated, progress);
    case "rollover": return { ...seated, pitch: progress * Math.PI * 2 };
    case "hunt": return blendPose(STANDING_POSE, crouched, .65);
    default: return { ...STANDING_POSE };
  }
}

export function joystickAxis(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) <= .16) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - .16) / .84);
}
