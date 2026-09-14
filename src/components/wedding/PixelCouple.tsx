"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createMechanicalDuck, DUCK_APPEARANCES, type DuckAppearance } from "@/lib/mechanical-duck";
import { PET_ACTIONS, RANDOM_CLICK_ACTIONS, joystickAxis, petPhase, type PetAction } from "@/lib/pet-behavior";
import { MoreHorizontal, X, Gamepad2, ArrowLeft, ArrowRight, Square } from "lucide-react";

type Props = { waiting: boolean; celebration: number };
const SIZE = 120;
const HEIGHT = 180;
type Partner = { x: number; y: number; drag: boolean; busy: boolean };
type Couple = { partners: (Partner | null)[]; until: number; next: number; targets: number[]; leader: number | null; control: number | null };

function PixelPet({ flower, waiting, celebration, couple }: Props & { flower: boolean; couple: RefObject<Couple> }) {
  const element = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuOpen = useRef(false);
  const [remote, setRemote] = useState(false);
  const [tool, setTool] = useState<"drive" | "laser" | "tag" | "appearance">("drive");
  const [appearance, setAppearance] = useState<DuckAppearance>(flower ? "ivory" : "graphite");
  const [tagAction, setTagAction] = useState<PetAction>("sit");
  const remotePanel = useRef<HTMLDivElement>(null);
  const laserSpot = useRef<HTMLSpanElement>(null);
  const tagElement = useRef<HTMLButtonElement>(null);
  const controls = useRef({ open: false, tool: "drive", axis: 0, held: new Set<string>(), seated: false, tagAction: "sit" as PetAction, tagX: 0, tagArmed: false, pauseUntil: 0, gamepadButtons: [] as boolean[] });
  const behavior = useRef<{ action: PetAction; start: number; origin?: number; direction?: number } | null>(null);
  const pointer = useRef({ x: -1000, y: -1000, last: 0 });
  const begin = (action: PetAction) => {
    const state = motion.current;
    behavior.current = { action, start: performance.now(), origin: state.x, direction: state.direction };
    controls.current.seated = false;
    controls.current.axis = 0; controls.current.held.clear();
    controls.current.pauseUntil = performance.now() + 15000;
    couple.current.until = 0; couple.current.next = performance.now() + 15000;
    setMenu(null); menuOpen.current = false;
  };
  const openMenu = () => {
    menuOpen.current = true;
    setMenu({ x: Math.max(8, Math.min(innerWidth - 248, motion.current.x)), y: Math.max(8, Math.min(innerHeight - 330, motion.current.y - 260)) });
  };
  const closeRemote = () => {
    setRemote(false); controls.current.open = false; controls.current.axis = 0; controls.current.held.clear();
    controls.current.tagArmed = false; behavior.current = null;
    controls.current.pauseUntil = performance.now() + 10000;
    couple.current.control = null; menuButton.current?.focus();
  };
  const openRemote = () => {
    setRemote(true); controls.current.open = true; controls.current.pauseUntil = performance.now() + 15000;
    couple.current.control = flower ? 1 : 0; behavior.current = null;
    setMenu(null); menuOpen.current = false;
  };
  const selectTool = (value: "drive" | "laser" | "tag" | "appearance") => {
    setTool(value); controls.current.tool = value; controls.current.tagArmed = false;
    behavior.current = null; controls.current.axis = 0;
  };
  const live = useRef({ waiting, celebration });
  const motion = useRef({ x: 0, y: 0, velocity: 0, direction: flower ? -1 : 1, drag: false, pointer: -1, offsetX: 0, offsetY: 0, startX: 0, startY: 0, moved: false, tiltUntil: 0, landedUntil: 0, celebrateUntil: 0, initialized: false });
  useEffect(() => {
    if (celebration !== live.current.celebration) motion.current.celebrateUntil = performance.now() + 2800;
    live.current = { waiting, celebration };
  }, [waiting, celebration]);

  useEffect(() => {
    const button = element.current!;
    const sprite = canvas.current!;
    let model: ReturnType<typeof createMechanicalDuck>;
    try { model = createMechanicalDuck(sprite, flower, appearance); button.hidden = false; }
    catch { button.hidden = true; return; }
    const state = motion.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const track = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY, last: performance.now() }; };
    const releaseControls = () => { controls.current.axis = 0; controls.current.held.clear(); };
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("blur", releaseControls);
    const floor = () => Math.max(0, innerHeight - HEIGHT - (innerWidth < 700 ? 96 : 38));
    if (!state.initialized) {
      state.x = Math.min(innerWidth - SIZE, 40 + (flower ? 135 : 0)); state.y = floor();
      state.initialized = true;
    }
    const index = flower ? 1 : 0;
    couple.current.partners[index] = { x: state.x, y: state.y, drag: false, busy: false };
    couple.current.next = performance.now() + 2500;
    let frame = 0, last = 0, lastPaint = 0, clock = 0;
    let nextStumble = 75 + Math.random() * 45, lastRest = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.04); last = now;
      if (!document.hidden) {
        clock += dt;
        const reduced = preference.matches;
        const control = controls.current;
        const activeControl = control.open && couple.current.control === index;
        const celebrating = now < state.celebrateUntil;
        const tilt = now < state.tiltUntil;
        const ground = floor();
        let axis = activeControl ? control.axis : 0;
        if (activeControl && control.held.size) axis = Number(control.held.has("ArrowRight") || control.held.has("d")) - Number(control.held.has("ArrowLeft") || control.held.has("a"));
        if (activeControl && document.hasFocus()) {
          const pad = navigator.getGamepads?.().find(pad => pad?.mapping === "standard");
          if (pad) {
            axis ||= joystickAxis(Math.abs(pad.axes[0] || 0) > Math.abs(pad.axes[1] || 0) ? pad.axes[0] : -pad.axes[1]);
            const mapped: PetAction[] = ["sit", "stand", "kick", "grab", "fall", "skate"];
            mapped.forEach((action, i) => { if (pad.buttons[i]?.pressed && !control.gamepadButtons[i]) begin(action); });
            control.gamepadButtons = pad.buttons.map(button => button.pressed);
          } else control.gamepadButtons = [];
        }
        if (axis) { behavior.current = null; control.seated = false; state.direction = Math.sign(axis); }
        if (!behavior.current && !activeControl && !control.seated && now > control.pauseUntil && !reduced && !state.drag && !live.current.waiting && !celebrating && !menuOpen.current) {
          if (clock > nextStumble) { behavior.current = { action: "fall", start: now }; nextStumble = clock + 90 + Math.random() * 60; }
          else if (now - pointer.current.last > 45000 && clock - lastRest > 50) { behavior.current = { action: "rest", start: now }; lastRest = clock; }
        }
        let phase = behavior.current ? petPhase(behavior.current.action, now - behavior.current.start) : null;
        if (!phase && behavior.current) {
          control.seated = behavior.current.action === "sit";
          behavior.current = null; control.pauseUntil = now + 6000;
        }
        if (state.drag || live.current.waiting || celebrating) { behavior.current = null; phase = null; }
        const pair = couple.current;
        const partner = pair.partners[1 - index];
        const busy = state.drag || state.y < ground || live.current.waiting || celebrating || tilt || !!phase || menuOpen.current || activeControl || control.seated || now < control.pauseUntil;
        pair.partners[index] = { x: state.x, y: state.y, drag: state.drag, busy };
        if (busy || partner?.busy || reduced) pair.until = 0;
        const available = !busy && partner && !partner.busy && !reduced;
        const distance = partner ? Math.abs(partner.x - state.x) : 0;
        if (available && distance < 145 && now > pair.next) {
          const center = Math.max(36, Math.min(innerWidth - SIZE - 36, (state.x + partner.x) / 2));
          pair.targets[index] = center + (state.x < partner.x ? -32 : 32);
          pair.targets[1 - index] = center + (state.x < partner.x ? 32 : -32);
          pair.until = now + 4200; pair.next = now + 22000; pair.leader = null;
        }
        const together = available && now < pair.until;
        if (available && pair.leader !== null && distance < 115) pair.leader = null;
        const following = available && pair.leader !== null && pair.leader !== index && distance > 105;
        const waitingForPartner = available && pair.leader === index && distance > 105;
        const ownerNearby = !reduced && now - pointer.current.last < 1800 && Math.abs(pointer.current.y - (state.y + HEIGHT / 2)) < 140 && Math.abs(pointer.current.x - (state.x + SIZE / 2)) < 250;
        const ownerDistance = pointer.current.x - (state.x + SIZE / 2);
        const followOwner = !busy && !together && ownerNearby && Math.abs(ownerDistance) > 85;
        const walking = !busy && !together && !waitingForPartner && (followOwner || following || (!ownerNearby && clock % 12 < 8));
        if (!state.drag) {
          if (state.y < ground) {
            state.velocity += 1100 * dt;
            state.y = reduced ? ground : Math.min(ground, state.y + state.velocity * dt);
            if (state.y >= ground) { state.velocity = 0; state.landedUntil = now + 380; }
          } else {
            state.y = ground;
            if (activeControl && axis) {
              state.x += 48 * axis * dt;
            } else if (activeControl && control.tool === "laser" && !phase && Math.abs(pointer.current.y - (ground + HEIGHT)) < 200) {
              const delta = pointer.current.x - (state.x + SIZE / 2);
              if (Math.abs(delta) > 20) { state.direction = Math.sign(delta); state.x += Math.sign(delta) * Math.min(Math.abs(delta), 50 * dt); }
            } else if (activeControl && control.tool === "tag" && control.tagArmed && !phase) {
              const delta = control.tagX - (state.x + SIZE / 2);
              if (Math.abs(delta) < 12) { control.tagArmed = false; begin(control.tagAction); }
              else { state.direction = Math.sign(delta); state.x += Math.sign(delta) * Math.min(Math.abs(delta), 42 * dt); }
            } else if (phase && !reduced) {
              if (phase.name === "carry" && behavior.current?.origin !== undefined) {
                const delta = behavior.current.origin - 24 * (behavior.current.direction || 1) - state.x;
                if (Math.abs(delta) > 2) { state.direction = Math.sign(delta); state.x += Math.sign(delta) * Math.min(Math.abs(delta), 26 * dt); }
              } else {
                if (phase.name === "come" && pointer.current.x >= 0) state.direction = pointer.current.x > state.x + SIZE / 2 ? 1 : -1;
                const speed = ["approach", "chase", "pounce", "come"].includes(phase.name) ? 22 : phase.name === "skate" ? 48 : phase.name === "brake" ? 48 * (1 - phase.progress) : 0;
                state.x += speed * state.direction * dt;
              }
            } else if (together) {
              state.x += (pair.targets[index] - state.x) * Math.min(1, dt * 3);
              state.direction = partner.x > state.x ? 1 : -1;
            } else if (walking && !reduced) {
              const limit = Math.max(90, Math.min(innerWidth * 0.55, 640) - SIZE);
              if (followOwner) state.direction = ownerDistance > 0 ? 1 : -1;
              else if (following) state.direction = partner.x > state.x ? 1 : -1;
              else {
                if (state.x > limit) state.direction = -1;
                if (state.x < 18) state.direction = 1;
                if (partner && distance < 78 && (partner.x - state.x) * state.direction > 0) state.direction *= -1;
              }
              state.x += dt * (following ? 48 : 22) * state.direction;
            } else if (partner && !reduced) {
              state.direction = partner.x > state.x ? 1 : -1;
            }
          }
        }
        state.x = Math.max(0, Math.min(innerWidth - SIZE, state.x));
        state.y = Math.max(0, Math.min(ground, state.y));
        const chasingLight = activeControl && control.tool === "laser" && !phase && Math.abs(pointer.current.y - (ground + HEIGHT)) < 200;
        const approachingTag = activeControl && control.tool === "tag" && control.tagArmed && !phase;
        const mood = state.drag ? "dragging" : state.y < ground ? "falling" : celebrating ? "celebrating" : live.current.waiting ? "waiting" : phase ? phase.name : axis || approachingTag ? "walking" : chasingLight ? Math.abs(pointer.current.x - state.x - SIZE / 2) > 20 ? "chase" : "hunt" : control.seated ? "seated" : tilt ? "tilt" : now < state.landedUntil ? "landing" : together ? "nuzzling" : following || followOwner ? "following" : walking ? "walking" : "standing";
        button.dataset.mood = mood;
        button.dataset.action = behavior.current?.action || "idle";
        button.dataset.direction = String(state.direction);
        if (bubble.current) { bubble.current.textContent = phase?.bubble || ""; bubble.current.hidden = !phase?.bubble; }
        if (menuButton.current) menuButton.current.style.transform = `translate3d(${state.x + SIZE - 22}px, ${state.y + HEIGHT - 22}px, 0)`;
        button.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
        if (laserSpot.current) {
          laserSpot.current.hidden = !chasingLight;
          laserSpot.current.style.transform = `translate3d(${Math.max(8, Math.min(innerWidth - 8, pointer.current.x))}px, ${ground + HEIGHT - 17}px, 0)`;
        }
        if (tagElement.current) {
          tagElement.current.style.left = `${control.tagX - 25}px`;
          tagElement.current.style.top = `${ground + HEIGHT - 40}px`;
          tagElement.current.dataset.scanned = String(!control.tagArmed);
        }
        const hop = !reduced && (mood === "celebrating" ? Math.abs(Math.sin(clock * 9)) * -15 : mood === "walking" ? Math.abs(Math.sin(clock * 11)) * -3 : 0);
        sprite.style.transform = `translateY(${hop}px) rotate(${mood === "dragging" ? 10 : 0}deg)`;
        if (now - lastPaint > 33) {
          model.render(clock, mood, state.direction, reduced, { action: behavior.current?.action, progress: phase?.progress || 0, speed: axis ? Math.abs(axis) : 1 });
          lastPaint = now;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); model.dispose(); window.removeEventListener("pointermove", track); window.removeEventListener("blur", releaseControls); couple.current.partners[index] = null; couple.current.until = 0; };
  }, [flower, couple, appearance]);

  const release = () => {
    const state = motion.current;
    if (state.drag && state.moved) couple.current.leader = flower ? 1 : 0;
    state.drag = false; state.pointer = -1; state.velocity = 0;
  };
  return (
    <><button ref={element} type="button" className="pixel-pet" aria-label={flower ? "花花，机械鸭" : "团团，机械鸭"}
      onContextMenu={event => { event.preventDefault(); openMenu(); }}
      title={flower ? "花花 · 点击互动，拖动搬家" : "团团 · 点击互动，拖动搬家"}
      onPointerDown={(event) => {
        if (event.button !== 0 || motion.current.drag) return;
        const state = motion.current;
        state.drag = true; state.pointer = event.pointerId; state.moved = false;
        state.startX = event.clientX; state.startY = event.clientY;
        state.offsetX = event.clientX - state.x; state.offsetY = event.clientY - state.y;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = motion.current;
        if (!state.drag || state.pointer !== event.pointerId) return;
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 4) state.moved = true;
        state.x = event.clientX - state.offsetX; state.y = event.clientY - state.offsetY;
      }}
      onPointerUp={(event) => {
        if (motion.current.pointer !== event.pointerId) return;
        release();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={release} onLostPointerCapture={release}
      onClick={(event) => {
        if (event.detail === 0 || !motion.current.moved) {
          const randomAction = RANDOM_CLICK_ACTIONS[Math.floor(Math.random() * RANDOM_CLICK_ACTIONS.length)] || "stroke";
          begin(randomAction);
        }
      }}>
      <span ref={bubble} className="pet-speech" hidden />
      <span className="pet-wait" aria-hidden="true"><i /><i /><i /></span>
      <span className="pet-celebration" aria-hidden="true">♥</span>
      <canvas ref={canvas} aria-hidden="true" />
    </button>
    <button ref={menuButton} className="pet-menu-button" aria-label={flower ? "花花互动" : "团团互动"} title="宠物互动" onClick={openMenu}><MoreHorizontal size={16} /></button>
    {menu && <div className="pet-action-menu" role="dialog" aria-label={flower ? "花花互动菜单" : "团团互动菜单"} style={{ left: menu.x, top: menu.y }} onKeyDown={event => { if (event.key === "Escape") { setMenu(null); menuOpen.current = false; menuButton.current?.focus(); } }}>
      <header><strong>{flower ? "花花" : "团团"}</strong><button autoFocus className="icon-button" aria-label="关闭宠物菜单" onClick={() => { setMenu(null); menuOpen.current = false; }}><X size={14} /></button></header>
      <button className="pet-control-entry" onClick={openRemote}><Gamepad2 size={16} />遥控与玩具</button>
      {(Object.keys(PET_ACTIONS) as PetAction[]).map(action => <button key={action} onClick={() => begin(action)}>{PET_ACTIONS[action].label}</button>)}
    </div>}
    {remote && <div ref={remotePanel} className="pet-remote" role="dialog" aria-label={`${flower ? "花花" : "团团"}遥控器`} tabIndex={0}
      onKeyDown={event => {
        if ((event.target as HTMLElement).matches("input, textarea, select")) return;
        if (["ArrowLeft", "ArrowRight", "a", "d"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); controls.current.held.add(event.key); }
        if (event.key === "Escape") { event.stopPropagation(); closeRemote(); }
      }} onKeyUp={event => { controls.current.held.delete(event.key); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { controls.current.held.clear(); controls.current.axis = 0; } }}>
      <header><strong><Gamepad2 size={15} />{flower ? "花花" : "团团"}的遥控器</strong><button className="icon-button" onClick={closeRemote} aria-label="关闭遥控器"><X size={14} /></button></header>
      <div className="pet-remote-tabs">{([['drive', '遥控'], ['laser', '激光笔'], ['tag', '指令标签'], ['appearance', '外观']] as const).map(([value, label]) => <button key={value} aria-pressed={tool === value} onClick={() => selectTool(value)}>{label}</button>)}</div>
      {tool === "drive" && <>
        <div className="pet-direction-pad">{([-1, 1] as const).map(direction => <button key={direction} aria-label={direction < 0 ? "向左走，松开停止" : "向右走，松开停止"}
          onPointerDown={event => { if (event.button !== 0) return; controls.current.axis = direction; behavior.current = null; controls.current.seated = false; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic events have no active pointer */ } }}
          onPointerUp={event => { controls.current.axis = 0; try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ } }} onPointerCancel={() => { controls.current.axis = 0; }} onLostPointerCapture={() => { controls.current.axis = 0; }}
          onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); controls.current.axis = direction; } }} onKeyUp={() => { controls.current.axis = 0; }}>
          {direction < 0 ? <ArrowLeft size={21} /> : <ArrowRight size={21} />}</button>)}
          <button aria-label="停止宠物动作" onClick={() => { behavior.current = null; controls.current.axis = 0; controls.current.held.clear(); controls.current.seated = false; }}><Square size={15} /></button>
        </div>
        <p>按住行走，松开站稳 · 支持 ← → / A D</p>
        <div className="pet-remote-actions">{(["sit", "stand", "grab", "fetch", "fall", "kick", "skate", "roll"] as PetAction[]).map(action => <button key={action} onClick={() => begin(action)}>{PET_ACTIONS[action].label}</button>)}</div>
        <p>标准手柄左摇杆行走，A 坐下 · B 站起 · X 踢球 · Y 叼物 · LB 起身 · RB 轮滑</p>
      </>}
      {tool === "laser" && <p>把鼠标移到页面底部，小鸭会追着红点走；靠近时会低头观察。</p>}
      {tool === "tag" && <>
        <label>标签指令<select value={tagAction} onChange={event => { const action = event.target.value as PetAction; setTagAction(action); controls.current.tagAction = action; }}>
          {(["sit", "stand", "grab", "kick", "skate", "roll"] as PetAction[]).map(action => <option key={action} value={action}>{PET_ACTIONS[action].label}</option>)}
        </select></label>
        <button className="primary-button" onClick={() => { controls.current.tagX = Math.max(65, Math.min(innerWidth - 65, motion.current.x + SIZE / 2 + motion.current.direction * 150)); controls.current.tagArmed = true; behavior.current = null; }}>放置标签并走过去</button>
        <p>虚拟 NFC 标签：走近后执行一次，再次放置可重新触发。</p>
      </>}
      {tool === "appearance" && <>
        <p>选择 Microduck 外观，动作和情侣装饰会保留。</p>
        <div className="pet-appearance-grid" role="group" aria-label="Microduck 外观">
          {(Object.entries(DUCK_APPEARANCES) as [DuckAppearance, (typeof DUCK_APPEARANCES)[DuckAppearance]][]).map(([value, palette]) => <button key={value} className={`pet-appearance-option pet-appearance-${value}`} aria-label={`切换外观：${palette.label}`} aria-pressed={appearance === value} onClick={() => setAppearance(value)}><i aria-hidden="true" /><span>{palette.label}</span></button>)}
        </div>
      </>}
    </div>}
    {remote && tool === "laser" && <span ref={laserSpot} className="pet-laser-spot" aria-hidden="true" />}
    {remote && tool === "tag" && <button ref={tagElement} className="pet-command-tag" aria-label={`指令标签：${PET_ACTIONS[tagAction].label}`} onClick={() => { controls.current.tagArmed = true; }}><span>NFC</span><small>{PET_ACTIONS[tagAction].label}</small></button>}
    </>
  );
}

export function PixelCouple(props: Props) {
  const couple = useRef<Couple>({ partners: [null, null], until: 0, next: 0, targets: [0, 0], leader: null, control: null });
  return <div className="pixel-couple"><PixelPet {...props} couple={couple} flower={false} /><PixelPet {...props} couple={couple} flower /></div>;
}
