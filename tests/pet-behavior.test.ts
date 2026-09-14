import test from "node:test";
import assert from "node:assert/strict";
import { PET_ACTIONS, RANDOM_CLICK_ACTIONS, STANDING_POSE, duckPose, joystickAxis, petPhase } from "../src/lib/pet-behavior";

test("random pet clicks only use self-contained actions", () => {
  assert.deepEqual(new Set(RANDOM_CLICK_ACTIONS), new Set([
    "stroke", "poke", "call", "sit", "stand", "kick", "grab", "fall", "skate", "roll", "rest",
  ]));
  assert(!RANDOM_CLICK_ACTIONS.includes("laser"));
  assert(!RANDOM_CLICK_ACTIONS.includes("charge"));
});

test("official-inspired actions expose ordered, finite phases", () => {
  for (const [action, definition] of Object.entries(PET_ACTIONS)) {
    let elapsed = 0; const names: string[] = [];
    for (const phase of definition.phases) {
      const current = petPhase(action as keyof typeof PET_ACTIONS, elapsed + phase.duration / 2);
      assert(current); names.push(current.name); assert(current.progress > 0 && current.progress < 1);
      elapsed += phase.duration;
    }
    assert.equal(petPhase(action as keyof typeof PET_ACTIONS, elapsed), null);
    assert.equal(new Set(names).size, names.length);
  }
  assert.deepEqual(PET_ACTIONS.grab.phases.map(phase => phase.name), ["observe", "pickup", "grip", "lift", "carry", "lower", "drop", "return", "proud"]);
  assert.deepEqual(PET_ACTIONS.fall.phases.map(phase => phase.name), ["tumble", "stunned", "tuck", "turnover", "pushup", "rise", "shake"]);
});

test("poses return to the official HOME standing frame", () => {
  assert.deepEqual(duckPose("standup", 1), STANDING_POSE);
  assert.deepEqual(duckPose("return", 1), STANDING_POSE);
  assert.deepEqual(duckPose("rise", 1), STANDING_POSE);
  assert.equal(duckPose("pickup", 1).jaw, 1);
  assert(duckPose("grip", 1).jaw < duckPose("grip", 0).jaw);
  assert(duckPose("turnover", .5).roll > 0);
});

test("joystick has a dead zone and normalized speed", () => {
  assert.equal(joystickAxis(0), 0); assert.equal(joystickAxis(.15), 0); assert.equal(joystickAxis(-.16), 0);
  assert(joystickAxis(.17) > 0 && joystickAxis(.17) < .03);
  assert.equal(joystickAxis(1), 1); assert.equal(joystickAxis(-1), -1); assert.equal(joystickAxis(Number.NaN), 0);
});
