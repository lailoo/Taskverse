# Microduck Pet Reference

## Sources Checked

- [Pollen Robotics Microduck](https://github.com/pollen-robotics/microduck): official README describes walking, sitting, picking objects up, standing back up, rolling, and kicking a ball. These are documented capabilities; no claim is made that the web animation reproduces a recorded trajectory.
- [Official simulation assets](https://github.com/pollen-robotics/microduck_rl/tree/1e79c29c97d8b38aee9eefde77a545860ba7658e/src/mjlab_microduck/robot/microduck): MJCF visual assembly, STL geometry, materials and joint ranges.
- [Official home pose](https://github.com/pollen-robotics/microduck_rl/blob/1e79c29c97d8b38aee9eefde77a545860ba7658e/src/mjlab_microduck/robot/microduck_constants.py): mirrored hip, knee and ankle angles; neck and head pitch at 0.3491 radians.

## Web Adaptation

The previous primitive approximation is replaced with the official visual mesh assembly, converted to indexed GLB with Meshopt compression. The local asset includes the Apache-2.0 license and pinned source metadata under `public/models/microduck/`.

The head is enlarged by 7%, and the browser provides four appearance variants on the same official mesh: Lavender (`#a78bd2`), Graphite (`#3b3f4c`), Sky (`#8fd0ee`) and Ivory (`#f2efe7`). Each variant also changes the body accents, camera lens and feet while retaining the warm beak. The remote's 外观 tab switches variants without resetting the pet's current position or behavior. A small flower and bow ornament distinguish partners. The custom animation uses the official joint frames and angle limits, with mirrored leg movement, short steps, slight body sway, delayed turns, a seated pose and occasional curious head dips. Existing dragging, landing, celebrations, AI waiting and couple encounters remain connected to application state.

The behavior menu now maps the official task families to browser stages: `GroundPick` becomes observe → crouch → open jaw → grip → lift → carry → lower → release; `StandUp` becomes tumble → stunned → tuck → turnover → pushup → rise → shake; `BallKick` has aim → kick → chase; `Rollers` mounts visible wheels and spins them while skating; `SitStand` provides explicit sit and stand actions. A normal click randomly chooses one of the self-contained actions (petting, tail poke, name call, sit/stand, kick, grab, fall recovery, rollers, roll or rest), while laser, charging and NFC remain deliberate controls. A virtual laser spot and configurable NFC-style command tag provide the camera and tag interaction ideas in a safe browser form. A keyboard/gamepad remote makes the velocity command explicit: holding a direction walks, releasing it returns to a stable standing pose.

This is an expressive browser pet, not a MuJoCo physics simulation or a deployment of the robot's reinforcement-learning policies. The stages are hand-authored interpolation around the official joint limits; they are not the seven learned policies or real hardware control. The browser never requests camera, NFC, or gamepad permissions; pointer, virtual tag, and already-available standard gamepad input are optional interaction surfaces.

## Rebuild

`node scripts/import-microduck.mjs /path/to/microduck_rl-checkout`

Use the pinned commit in `scripts/import-microduck.mjs`. Without an argument the script retrieves the same source files from GitHub. Runtime loading uses local files only; no external model request is needed.
