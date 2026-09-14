import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { duckPose, type PetAction } from "./pet-behavior";

let asset: Promise<THREE.Group> | undefined;
function loadDuck() {
  asset ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/models/microduck/microduck.glb").then(gltf => gltf.scene).catch(error => { asset = undefined; throw error; });
  return asset;
}

export type DuckAppearance = "lavender" | "graphite" | "sky" | "ivory";

export const DUCK_APPEARANCES: Record<DuckAppearance, {
  label: string;
  shell: number;
  body: number;
  accent: number;
  lens: number;
  beak: number;
  sole: number;
}> = {
  lavender: { label: "薰衣草紫", shell: 0xa78bd2, body: 0x8e79bd, accent: 0xc0a9ed, lens: 0x9fe0f5, beak: 0xf3ba48, sole: 0xd7a24a },
  graphite: { label: "石墨黑", shell: 0x3b3f4c, body: 0x252b36, accent: 0x596171, lens: 0xb497e9, beak: 0xd7a846, sole: 0x9a7c38 },
  sky: { label: "天空蓝", shell: 0x8fd0ee, body: 0x72bddd, accent: 0xb7e7f8, lens: 0xf1d45c, beak: 0xe99a3c, sole: 0xd9953a },
  ivory: { label: "象牙白", shell: 0xf2efe7, body: 0xeee9dc, accent: 0xd9cdb8, lens: 0xe7b95e, beak: 0xe9a548, sole: 0xc28e3d },
};

// Official Pollen Robotics geometry; expressive poses are custom animation, not RL policies.
export function createMechanicalDuck(canvas: HTMLCanvasElement, flower: boolean, appearance: DuckAppearance = flower ? "ivory" : "graphite") {
  const palette = DUCK_APPEARANCES[appearance];
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(120, 180, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 2.7, -2.7, 0.1, 50);
  camera.position.set(6, 3.2, 8); camera.lookAt(0, 2.18, 0);
  scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x899192, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-3, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe1f5ff, 1.4); rim.position.set(4, 4, -3); scene.add(rim);
  const robot = new THREE.Group(); scene.add(robot);
  const joints = new Map<string, { node: THREE.Object3D; rest: THREE.Quaternion; axis: THREE.Vector3; range: number[]; value: number }>();
  const ownedMaterials: THREE.Material[] = [];
  const ownedGeometry: THREE.BufferGeometry[] = [];
  const toyMaterial = new THREE.MeshStandardMaterial({ color: 0xe8873c, roughness: .55 });
  const ballGeometry = new THREE.SphereGeometry(.16, 16, 12);
  const ball = new THREE.Mesh(ballGeometry, toyMaterial); ball.visible = false; scene.add(ball);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xf04438 });
  const dotGeometry = new THREE.SphereGeometry(.06, 12, 8);
  const dot = new THREE.Mesh(dotGeometry, dotMaterial); dot.visible = false; scene.add(dot);
  const wheels = new THREE.Group(); robot.add(wheels); wheels.visible = false;
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x485a68, roughness: .6 });
  const wheelSets: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const footWheels = new THREE.Group(); wheels.add(footWheels); wheelSets.push(footWheels);
    for (const z of [-.25, .25]) {
    const geometry = new THREE.CylinderGeometry(.15, .15, .12, 16); ownedGeometry.push(geometry);
    const wheel = new THREE.Mesh(geometry, wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0, z); footWheels.add(wheel);
    }
    footWheels.position.x = side * .5;
  }
  const dockGeometry = new THREE.CylinderGeometry(.72, .78, .1, 24);
  const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x8fbeb1, roughness: .7 });
  const dock = new THREE.Mesh(dockGeometry, dockMaterial); dock.visible = false; scene.add(dock);
  ownedMaterials.push(toyMaterial, dotMaterial, wheelMaterial, dockMaterial); ownedGeometry.push(ballGeometry, dotGeometry, dockGeometry);
  const sock = new THREE.Group(); scene.add(sock); sock.visible = false;
  const sockMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e8c9, roughness: 1 }); ownedMaterials.push(sockMaterial);
  for (const [x, y, width, height] of [[0, .04, .42, .15], [-.15, .15, .15, .3]]) {
    const geometry = new THREE.BoxGeometry(width, height, .12); ownedGeometry.push(geometry);
    const part = new THREE.Mesh(geometry, sockMaterial); part.position.set(x, y, 0); sock.add(part);
  }
  const jawHinge = new THREE.Group();
  const forward = new THREE.Vector3(0, 0, 1), right = new THREE.Vector3(1, 0, 0);
  let assembly: THREE.Group | undefined;
  let jawAxis = new THREE.Vector3(1, 0, 0), jawRest = new THREE.Quaternion();
  const feet: (THREE.Object3D | undefined)[] = [];
  const floorBounds = new THREE.Box3(), footBounds = new THREE.Box3();
  const groundedToy = new THREE.Vector3(); let previousMood = "", toyDropped = false;
  let mouth: THREE.Object3D | undefined;
  let disposed = false, ready = false, facing = 0, frontFacing = 0, targetFacing = 0;
  void loadDuck().then(source => {
    if (disposed) return;
    const model = source.clone(true);
    model.traverse(node => {
      if (node.userData.joint) {
        const { name, axis, range } = node.userData.joint;
        joints.set(name, { node, rest: node.quaternion.clone(), axis: new THREE.Vector3().fromArray(axis).normalize(), range, value: 0 });
      }
      if (node instanceof THREE.Mesh) {
        const material = (node.material as THREE.MeshStandardMaterial).clone();
        node.material = material; ownedMaterials.push(material);
        if (/jaw_soft|soft_mouth_top|beak|mouth/i.test(node.name)) material.color.setHex(palette.beak);
        else if (/sole_|rigidity_plate|foot|ankle/i.test(node.name)) material.color.setHex(palette.sole);
        else if (/lens|m12_lens_holder|camera/i.test(node.name)) material.color.setHex(palette.lens);
        else if (/^(left_shell|right_shell)$/.test(node.name)) material.color.setHex(palette.shell);
        else if (/shell|trunk|torso|arm|leg|body/i.test(node.name)) material.color.setHex(palette.body);
      }
    });
    const head = joints.get("head_roll")?.node;
    mouth = model.getObjectByName("jaw");
    if (head) head.scale.setScalar(1.07);
    const upright = new THREE.Group(); upright.rotation.x = -Math.PI / 2; upright.add(model);
    const oriented = new THREE.Group(); oriented.rotation.y = -Math.PI / 2; oriented.add(upright); oriented.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(oriented);
    const scale = 4.15 / bounds.getSize(new THREE.Vector3()).y; oriented.scale.setScalar(scale);
    const center = bounds.getCenter(new THREE.Vector3()); oriented.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    assembly = oriented;
    robot.add(oriented); robot.updateMatrixWorld(true);
    const headBounds = head ? new THREE.Box3().setFromObject(head) : new THREE.Box3().setFromObject(oriented);
    const headCenter = headBounds.getCenter(new THREE.Vector3());
    const lens = model.getObjectByName("lens");
    if (lens) forward.copy(new THREE.Box3().setFromObject(lens).getCenter(new THREE.Vector3()).sub(headCenter).setY(0).normalize());
    right.set(forward.z, 0, -forward.x);
    const forwardAngle = Math.atan2(forward.x, forward.z);
    frontFacing = Math.atan2(camera.position.x, camera.position.z) - forwardAngle;
    targetFacing = frontFacing + (flower ? -1 : 1) * Math.PI / 2;
    facing = targetFacing;
    // The walk mesh has a rigid jaw. Add a local hinge to its lower beak only.
    if (mouth && head) {
      const jawBounds = new THREE.Box3().setFromObject(mouth);
      jawHinge.position.copy(jawBounds.getCenter(new THREE.Vector3())).addScaledVector(forward, -.36);
      robot.add(jawHinge); head.attach(jawHinge); jawHinge.attach(mouth);
      jawRest = jawHinge.quaternion.clone();
      jawAxis = right.clone().applyQuaternion(jawHinge.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    feet.push(model.getObjectByName("left_ankle"), model.getObjectByName("right_ankle"));
    // Joint groups are named after their MJCF bodies; use the joint map when needed.
    feet[0] ||= joints.get("left_ankle")?.node;
    feet[1] ||= joints.get("right_ankle")?.node;
    wheelSets.forEach((set, index) => {
      const foot = feet[index]; if (!foot) return;
      const bounds = new THREE.Box3().setFromObject(foot);
      set.position.copy(bounds.getCenter(new THREE.Vector3())); set.position.y = bounds.min.y - .1;
      set.rotation.y = forwardAngle;
    });
    const white = new THREE.MeshStandardMaterial({ color: flower ? 0xfff8e9 : palette.body, roughness: .65 });
    const accent = new THREE.MeshStandardMaterial({ color: flower ? 0xe8b650 : palette.accent, roughness: .5 });
    ownedMaterials.push(white, accent);
    const addMesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      ownedGeometry.push(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    if (flower && head) {
      const crown = new THREE.Group(); crown.position.set(headCenter.x, headBounds.max.y + .01, headCenter.z); crown.rotation.y = forwardAngle; robot.add(crown);
      for (let i = -2; i <= 2; i++) {
        const x = i * .19, y = -.045 * Math.abs(i);
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5;
          addMesh(crown, new THREE.SphereGeometry(.075, 10, 8), white, x + Math.cos(angle) * .08, y + Math.sin(angle) * .08, .18);
        }
        addMesh(crown, new THREE.SphereGeometry(.05, 10, 8), accent, x, y, .24);
      }
      const veilMaterial = new THREE.MeshStandardMaterial({ color: 0xf9fcff, transparent: true, opacity: .43, side: THREE.DoubleSide, depthWrite: false, roughness: .95 }); ownedMaterials.push(veilMaterial);
      const veilGeometry = new THREE.PlaneGeometry(.95, .82, 8, 8);
      const vertices = veilGeometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setZ(i, Math.cos(vertices.getX(i) * 23) * .035);
      veilGeometry.computeVertexNormals();
      addMesh(crown, veilGeometry, veilMaterial, 0, -.42, -.36);
      for (const side of [-1, 1]) addMesh(crown, new THREE.PlaneGeometry(.1, .65), veilMaterial, side * .48, -.32, -.12);
      head.attach(crown);
    } else {
      const torso = model.getObjectByName("trunk_base");
      const shell = model.getObjectByName("left_shell");
      if (torso && shell) {
        const chest = new THREE.Box3().setFromObject(shell).getCenter(new THREE.Vector3());
        const suit = new THREE.Group(); suit.position.copy(chest).addScaledVector(forward, .62); suit.rotation.y = forwardAngle; robot.add(suit);
        addMesh(suit, new THREE.BoxGeometry(.5, .48, .035), white, 0, 0, 0);
        for (const side of [-1, 1]) {
          const wing = addMesh(suit, new THREE.SphereGeometry(.15, 12, 8), accent, side * .14, .2, .055); wing.scale.set(1.2, .7, .4);
        }
        addMesh(suit, new THREE.SphereGeometry(.06, 10, 8), accent, 0, .17, .09);
        for (let i = 0; i < 2; i++) addMesh(suit, new THREE.SphereGeometry(.025, 8, 6), accent, 0, .01 - i * .11, .035);
        torso.attach(suit);
      }
    }
    ready = true; canvas.dataset.model = "microduck-official"; canvas.dataset.appearance = appearance; canvas.dataset.variant = appearance;
  }).catch(error => { if (!disposed) { canvas.dataset.model = "load-error"; canvas.dataset.modelError = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180); } });
  const rotation = new THREE.Quaternion();
  function pose(name: string, target: number, reduced: boolean) {
    const joint = joints.get(name); if (!joint) return;
    const bounded = THREE.MathUtils.clamp(target, joint.range[0], joint.range[1]);
    joint.value += (bounded - joint.value) * (reduced ? 1 : .13);
    joint.node.quaternion.copy(joint.rest).multiply(rotation.setFromAxisAngle(joint.axis, joint.value));
  }
  return {
    render(time: number, mood: string, direction: number, reduced: boolean, behavior?: { action?: PetAction; progress: number; toyOffset?: number; speed?: number }) {
      if (!ready) return;
      const walk = ["walking", "following", "approach", "carry", "come", "chase"].includes(mood) && !reduced;
      const sitting = ["sit", "seated", "sleep", "charging"].includes(mood);
      const progress = behavior?.progress || 0;
      const ease = (x: number) => x * x * (3 - 2 * x);
      const poseFrame = duckPose(mood, progress);
      const phase = time * (flower ? 7.3 : 7), sway = walk ? Math.sin(phase) * Math.max(.25, Math.min(1, behavior?.speed ?? 1)) : 0;
      const moving = ["walking", "following", "approach", "carry", "come", "chase", "pounce", "skate"].includes(mood);
      if (moving) {
        targetFacing = frontFacing + direction * Math.PI / 2;
      } else if (mood === "nuzzling") {
        targetFacing = frontFacing + direction * 1.15;
      }
      // Resting keeps the last heading. Turns take the shortest arc, without a frontal reset.
      const turn = Math.atan2(Math.sin(targetFacing - facing), Math.cos(targetFacing - facing));
      facing += turn * (reduced ? 1 : .16);
      const roll = reduced ? 0 : poseFrame.roll + (mood === "shake" ? Math.sin(time * 28) * .07 * (1 - progress) : mood === "skate" ? Math.sin(time * 5) * .09 : mood === "stroke" ? Math.sin(time * 5) * .05 : sway * .035);
      robot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing)
        .multiply(rotation.setFromAxisAngle(right, poseFrame.pitch))
        .multiply(rotation.setFromAxisAngle(forward, roll));
      robot.position.set(0, 0, 0);
      for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
        const kick = side === "right" ? mood === "aim" ? -ease(progress) * .4 : mood === "kick" ? Math.sin(progress * Math.PI) * 1.15 - .4 * (1 - progress) : 0 : 0;
        const stride = sway * sign;
        pose(`${side}_hip_pitch`, sign * (poseFrame.hip + stride * .18 + kick), reduced);
        pose(`${side}_knee`, sign * (poseFrame.knee + Math.max(0, -stride) * .26 + Math.abs(kick) * .2), reduced);
        pose(`${side}_ankle`, sign * (poseFrame.ankle + Math.max(0, -stride) * .08 - kick * .3), reduced);
        pose(`${side}_hip_roll`, -sign * .0873 + (reduced ? 0 : sway * .025 + (mood === "skate" ? Math.sin(time * 3) * sign * .06 : 0)), reduced);
      }
      const curious = ["tilt", "waiting", "observe", "listen", "search"].includes(mood);
      pose("neck_pitch", poseFrame.neck + (mood === "nuzzling" ? .18 : sway * .045), reduced);
      pose("head_pitch", poseFrame.head + (mood === "nuzzling" ? -.12 + (reduced ? 0 : Math.sin(time * 3) * .08) : mood === "stroke" ? -.15 : 0), reduced);
      pose("head_roll", curious ? (flower ? -.22 : .22) : walk ? -sway * .07 : 0, reduced);
      pose("head_yaw", mood === "lookback" ? direction * 1.1 : !reduced && ["waiting", "hunt", "search"].includes(mood) ? Math.sin(time * 2) * .3 : sitting && mood !== "sleep" && !reduced ? Math.sin(time * .8) * .12 : 0, reduced);
      jawHinge.quaternion.copy(jawRest).multiply(rotation.setFromAxisAngle(jawAxis, poseFrame.jaw * .5));
      wheels.visible = behavior?.action === "skate"; dock.visible = behavior?.action === "charge";
      dot.visible = behavior?.action === "laser";
      const screenRight = new THREE.Vector3(camera.position.z, 0, -camera.position.x).normalize();
      dot.position.copy(screenRight).multiplyScalar(THREE.MathUtils.clamp((behavior?.toyOffset ?? 24) / 33, -2.1, 2.1)); dot.position.y = .08;
      ball.visible = behavior?.action === "fetch" || behavior?.action === "kick";
      sock.visible = behavior?.action === "grab";
      robot.updateMatrixWorld(true);
      if (assembly) {
        floorBounds.setFromObject(assembly);
        robot.position.y = -floorBounds.min.y + (wheels.visible ? .22 : 0);
        // Center the grounded body so a full-size lying duck remains in its canvas.
        if (["tumble", "stunned", "tuck", "turnover", "pushup", "rise", "rollover"].includes(mood)) {
          const center = floorBounds.getCenter(new THREE.Vector3());
          robot.position.x = -center.x; robot.position.z = -center.z;
        }
      }
      if (!reduced && ["surprise", "pounce"].includes(mood)) robot.position.y += Math.sin(progress * Math.PI) * .38;
      if (walk) robot.position.y += Math.abs(Math.sin(phase)) * .025;
      robot.updateMatrixWorld(true);
      if (wheels.visible) wheelSets.forEach((set, index) => {
        const foot = feet[index]; if (!foot) return;
        footBounds.setFromObject(foot); const center = footBounds.getCenter(new THREE.Vector3()); center.y = footBounds.min.y - .12;
        set.position.copy(robot.worldToLocal(center));
        if (!reduced) set.children.forEach(wheel => { wheel.rotation.x = time * (mood === "skate" ? 12 : 0); });
      });
      if (ball.visible || sock.visible) {
        const toy = sock.visible ? sock : ball;
        const beak = mouth ? new THREE.Box3().setFromObject(mouth).getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 2.9, .7);
        if (mood === "observe" || mood === "pickup" || mood === "approach") toyDropped = false;
        const ground = screenRight.clone().multiplyScalar((behavior?.toyOffset ?? direction * 24) / 33); ground.y = sock.visible ? .05 : .16;
        toy.position.copy(ground);
        const attached = ["lift", "carry", "lower"].includes(mood) || mood === "grip" && progress > .55;
        if (attached) toy.position.copy(beak).add(new THREE.Vector3(0, -.13, 0));
        if (mood === "drop") {
          if (previousMood !== "drop") { groundedToy.copy(beak); groundedToy.y = ground.y; }
          toy.position.copy(beak).lerp(groundedToy, ease(progress)); toyDropped = true;
        } else if (toyDropped) toy.position.copy(groundedToy);
        if (behavior?.action === "kick") {
          const travel = mood === "kick" ? Math.max(0, (progress - .35) / .65) : mood === "chase" || mood === "proud" ? 1 : 0;
          toy.position.addScaledVector(screenRight, direction * travel * .9);
          if (!reduced && mood === "kick") toy.position.y += Math.sin(travel * Math.PI) * .35;
        }
        sock.rotation.z = attached ? -.5 : Math.PI / 2;
      }
      previousMood = mood;
      renderer.render(scene, camera);
    },
    dispose() { disposed = true; ownedMaterials.forEach(material => material.dispose()); ownedGeometry.forEach(geometry => geometry.dispose()); renderer.dispose(); },
  };
}
