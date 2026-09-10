// Player input: camera, selection, hotkeys, and turning clicks into simulation commands.
import { UNITS, STRUCTS, HOTKEYS, UNIT_SCALE, MODE_SET_OF, MODE_SETS } from './data';
import type { FormationType } from './data';
import { W, H } from './map';
import { clamp, dist } from './dmath';
import type { Game } from './sim';
import type { Entity, Unit, Struct, Command } from './types';
import type { View } from './render';
import { parallaxOf } from './render';
import type { Session } from './session';

export class Controller {
  view: View;
  formationType: FormationType = 'wedge';
  groups: Record<string, Unit[]> = {};
  keys: Record<string, boolean> = {};
  cmdTab: 'build' | 'procure' | 'market' = 'build';
  /** next left click on the map picks the strike point (glide bomb) or the enemy building (missile) */
  strikeMode: 'kab' | 'iskander' | null = null;
  private pan: { mx: number; my: number; cx: number; cy: number } | null = null;
  /** stick input goes out once a turn while piloting; the zoom to restore when the sticks are handed back */
  private steerT = 0; private zoomBefore = 1;
  onMessage: (text: string) => void = () => {};
  onSelectionChange: () => void = () => {};
  onToggle: (panel: 'tech' | 'manual' | 'pause' | 'legend' | 'audio' | 'log') => void = () => {};

  constructor(public session: Session, team: number) {
    this.view = { team, cam: { x: 0, y: 0, z: 1 }, vw: 800, vh: 600, dpr: 1, selection: [], placing: null, mouse: { x: 0, y: 0, inside: false }, bombardMode: false, drag: null, marker: null, pilot: null, pilotTarget: null, pilotDive: null };
  }
  get pilot(): Unit | null { return this.view.pilot; }
  get game(): Game { return this.session.game; }
  get team(): number { return this.view.team; }
  get selection(): Entity[] { return this.view.selection; }
  set selection(v: Entity[]) { this.view.selection = v; this.onSelectionChange(); }
  submit(cmd: Command) { this.session.submit(cmd); }
  ids(list: Entity[]): number[] { return list.map(e => e.id); }

  // ---- camera
  resize(vw: number, vh: number, dpr: number) { this.view.vw = vw; this.view.vh = vh; this.view.dpr = dpr; this.clampCam(); }
  clampCam() {
    const { cam, vw, vh } = this.view, cw = vw / cam.z, ch = vh / cam.z;
    cam.x = cw >= W ? (W - cw) / 2 : clamp(cam.x, 0, W - cw);
    cam.y = ch >= H ? (H - ch) / 2 : clamp(cam.y, 0, H - ch);
  }
  toWorld(mx: number, my: number) { const { cam } = this.view; return { x: mx / cam.z + cam.x, y: my / cam.z + cam.y }; }
  zoomAt(factor: number, mx: number, my: number) {
    const { cam } = this.view, before = this.toWorld(mx, my);
    cam.z = clamp(cam.z * factor, 0.25, 2.5);
    cam.x = before.x - mx / cam.z; cam.y = before.y - my / cam.z;
    this.clampCam();
  }
  centerOn(x: number, y: number) { const { cam, vw, vh } = this.view; cam.x = x - vw / (2 * cam.z); cam.y = y - vh / (2 * cam.z); this.clampCam(); }
  goHome() { const hq = this.game.hq(this.team); if (hq) this.centerOn(hq.x, hq.y); }
  handleCamera(dt: number) {
    const { cam, vw, vh, mouse, drag } = this.view, k = this.keys;
    if (this.view.pilot) { this.flyPilot(dt); return; }
    const sp = 560 * dt / cam.z;
    if (k.ArrowLeft || k.KeyA) cam.x -= sp; if (k.ArrowRight || k.KeyD) cam.x += sp;
    if (k.ArrowUp || k.KeyW) cam.y -= sp; if (k.ArrowDown || k.KeyS) cam.y += sp;
    if (mouse.inside && !drag && !this.pan) {
      const m = 26;
      if (mouse.x < m) cam.x -= sp; if (mouse.x > vw - m) cam.x += sp;
      if (mouse.y < m) cam.y -= sp; if (mouse.y > vh - m) cam.y += sp;
    }
    this.clampCam();
  }
  /** drop dead entities from the selection and groups; called every frame */
  prune() {
    const before = this.view.selection.length;
    this.view.selection = this.view.selection.filter(e => !e.dead);
    if (this.view.selection.length !== before) this.onSelectionChange();
    for (const k in this.groups) this.groups[k] = this.groups[k].filter(u => !u.dead);
    const v = this.view;
    if (v.pilot && (v.pilot.dead || v.pilot.grounded || v.pilot.landed)) this.releasePilot(v.pilot.dead ? (v.pilot.def.kamikaze && v.pilot.hp > 0 ? 'Impact. Sticks handed back.' : 'Drone lost. Sticks handed back.') : 'The drone is down for charging: sticks handed back');
    if (v.pilotTarget && v.pilotTarget.dead) { v.pilotTarget = null; if (v.pilot) this.onMessage('Target destroyed'); }
  }

  // ---- pilot mode: a human on the sticks of one drone
  /** take the sticks of the selected drone, or hand them back */
  togglePilot() {
    if (this.view.pilot) return this.releasePilot('Sticks handed back');
    const g = this.game;
    const u = this.selUnits().find(x => x.def.air && !x.def.auto && !x.grounded && !x.landed && !x.dead && !(g.needsOperator(x.def, x.team) && (!x.operator || x.operator.dead)));
    if (!u) return this.onMessage(this.selUnits().some(x => x.def.air) ? 'That drone cannot take a pilot right now: it is grounded, charging, or has no squad' : 'Select an airborne drone first (Y)');
    const v = this.view; v.pilot = u; v.pilotTarget = null; v.pilotDive = null; this.selection = [u];
    this.zoomBefore = v.cam.z; if (v.cam.z < 1.4) v.cam.z = 1.4;
    v.placing = null; v.bombardMode = false; this.strikeMode = null; v.drag = null; this.steerT = 0.1;
    this.onMessage('You have the sticks of the ' + u.def.label[u.team] + ': it flies to your cursor. Left-click ' + (u.def.kamikaze ? 'a target to attack, or the ground to dive on it' : 'a target to attack') + '. Y or Esc hands it back.');
    this.onSelectionChange();
  }
  releasePilot(text?: string) {
    const v = this.view; if (!v.pilot) return;
    v.pilot = null; v.pilotTarget = null; v.pilotDive = null;
    v.cam.z = this.zoomBefore; this.clampCam();
    if (text) this.onMessage(text);
    this.onSelectionChange();
  }
  /** camera follows the drone; the stick position goes to the simulation once a turn */
  private flyPilot(dt: number) {
    const v = this.view, u = v.pilot!, { cam, vw, vh } = v;
    const tx = u.x - vw / (2 * cam.z), ty = u.y - vh / (2 * cam.z), k = Math.min(1, dt * 7);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; this.clampCam();
    this.steerT -= dt;
    if (this.steerT > 0) return;
    this.steerT = 0.1;
    if (v.pilotTarget && !v.pilotTarget.dead) { this.submit({ kind: 'steer', id: u.id, x: v.pilotTarget.x, y: v.pilotTarget.y, targetId: v.pilotTarget.id }); return; }
    if (v.pilotDive) { this.submit({ kind: 'steer', id: u.id, x: v.pilotDive.x, y: v.pilotDive.y, dive: true }); return; }
    if (!v.mouse.inside) { this.submit({ kind: 'steer', id: u.id, x: u.x, y: u.y }); return; }
    const w = this.toWorld(v.mouse.x, v.mouse.y);
    this.submit({ kind: 'steer', id: u.id, x: clamp(w.x, 6, W - 6), y: clamp(w.y, 6, H - 6) });
  }
  /** the pilot clicks: an enemy becomes the target, the ground becomes a dive point for a kamikaze drone */
  private pilotClick(x: number, y: number) {
    const v = this.view, u = v.pilot!;
    const t = this.findEnemyAt(x, y);
    if (t) {
      if (!this.game.canHitTarget(u, t)) return this.onMessage('This drone cannot hit that: ' + (t.isUnit ? t.def.label[t.team] : t.def.label));
      if (!this.game.inLink(u, t)) return this.onMessage('Beyond the squad\'s control range: move the squad closer or pick a nearer target');
      v.pilotTarget = t; v.pilotDive = null; this.steerT = 0; this.onMessage('Attacking the ' + (t.isUnit ? t.def.label[t.team] : t.def.label));
    } else if (u.def.kamikaze) { v.pilotDive = { x, y }; v.pilotTarget = null; this.steerT = 0; this.onMessage('Diving on the point: right-click to pull up'); }
  }

  // ---- postures
  /** switch these units (or the selection) to a mode; only units whose type has it are affected */
  setMode(mode: string, units?: Unit[]) {
    const list = (units || this.selUnits()).filter(u => { const s = MODE_SET_OF[u.type]; return s && MODE_SETS[s].some(m => m.key === mode); });
    if (!list.length) return this.onMessage('Nothing selected can switch to that');
    this.submit({ kind: 'mode', ids: this.ids(list), mode });
  }
  /** R: every kind of unit in the selection steps to its next posture */
  cycleMode() {
    const g = this.game, sets = new Map<string, Unit[]>();
    for (const u of this.selUnits()) { const s = MODE_SET_OF[u.type]; if (s) (sets.get(s) || sets.set(s, []).get(s)!).push(u); }
    if (!sets.size) return this.onMessage('Nothing selected has postures to switch (R)');
    for (const [s, list] of sets) { const defs = MODE_SETS[s], i = defs.findIndex(m => m.key === g.modeOf(list[0])); this.submit({ kind: 'mode', ids: this.ids(list), mode: defs[(i + 1) % defs.length].key }); }
  }

  // ---- mouse
  mouseDown(px: number, py: number, button: number, shift: boolean) {
    const w = this.toWorld(px, py);
    if (button === 0) {
      if (this.view.pilot) { this.pilotClick(w.x, w.y); return; }
      if (this.strikeMode) { const m = this.strikeMode; this.strikeMode = null; if (m === 'kab') this.submit({ kind: 'kab', x: w.x, y: w.y }); else { const t = this.findEnemyAt(w.x, w.y); if (t && t.isStruct) this.submit({ kind: 'iskander', targetId: t.id }); else this.onMessage('Missiles need an enemy building: click one'); } this.onSelectionChange(); return; }
      if (this.view.bombardMode) { this.view.bombardMode = false; this.bombardAt(w.x, w.y); return; }
      if (this.view.placing) { this.tryPlace(w.x, w.y, shift); return; }
      this.view.drag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      (this.view.drag as { shift?: boolean }).shift = shift;
    } else if (button === 1) { this.pan = { mx: px, my: py, cx: this.view.cam.x, cy: this.view.cam.y }; }
  }
  mouseMove(px: number, py: number) {
    const m = this.view.mouse; m.x = px; m.y = py; m.inside = true;
    if (this.view.drag) { const w = this.toWorld(px, py); this.view.drag.x1 = w.x; this.view.drag.y1 = w.y; }
    if (this.pan) { this.view.cam.x = this.pan.cx - (px - this.pan.mx) / this.view.cam.z; this.view.cam.y = this.pan.cy - (py - this.pan.my) / this.view.cam.z; this.clampCam(); }
  }
  mouseUp(button: number) {
    if (button === 1) this.pan = null;
    if (button === 0 && this.view.drag) {
      const d = this.view.drag as { x0: number; y0: number; x1: number; y1: number; shift?: boolean }; this.view.drag = null;
      if (Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5) this.clickSelect(d.x1, d.y1, !!d.shift);
      else this.boxSelect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.max(d.x0, d.x1), Math.max(d.y0, d.y1), !!d.shift);
    }
  }
  mouseLeave() { this.view.mouse.inside = false; }
  doubleClick(px: number, py: number) {
    if (this.view.pilot) return;
    const w = this.toWorld(px, py), { cam, vw, vh } = this.view, g = this.game, PL = this.team;
    const onScreen = (u: Unit) => (u.x - cam.x) * cam.z >= 0 && (u.x - cam.x) * cam.z <= vw && (u.y - cam.y) * cam.z >= 0 && (u.y - cam.y) * cam.z <= vh;
    let hit: Unit | null = null, bd = Infinity;
    for (const u of g.units) if (u.team === PL && !u.dead && u.def.air && !u.def.auto) { const dd = dist(parallaxOf(u, this.view), w); if (dd <= u.def.r * UNIT_SCALE + 8 && dd < bd) { bd = dd; hit = u; } }
    const picked = g.units.filter(u => u.team === PL && !u.dead && u.def.air && !u.def.auto && onScreen(u) && (!hit || u.type === hit.type));
    if (!picked.length) return this.onMessage('No drones on screen');
    this.selection = g.expandSwarms(picked); this.view.drag = null;
    this.onMessage(picked.length + ' ' + (hit ? UNITS[hit.type].label[PL] : 'drone') + (picked.length > 1 ? 's' : '') + ' selected');
  }
  contextMenu(px: number, py: number, ctrl: boolean, shift = false) {
    if (this.view.pilot) { const v = this.view; if (v.pilotTarget || v.pilotDive) { v.pilotTarget = null; v.pilotDive = null; this.steerT = 0; this.onMessage('Let go: flying to the cursor'); } return; }
    if (this.strikeMode) { this.strikeMode = null; this.onSelectionChange(); return; }
    if (this.view.placing) { this.view.placing = null; this.onSelectionChange(); return; }
    const w = this.toWorld(px, py);
    if (this.view.bombardMode) { this.view.bombardMode = false; return this.bombardAt(w.x, w.y); }
    this.issueCommand(w.x, w.y, ctrl, shift);
  }
  wheel(deltaY: number, px: number, py: number) { this.zoomAt(Math.exp(-deltaY * 0.0012), px, py); }
  minimapDown(fx: number, fy: number, button: number) {
    const wx = fx * W, wy = fy * H;
    if (button === 2) { this.issueCommand(wx, wy, false); return; }
    this.centerOn(wx, wy);
  }

  // ---- selection
  clickSelect(x: number, y: number, shift: boolean) {
    const g = this.game, PL = this.team;
    // aircraft hover over squads: prefer the ground unit under the click unless the drone itself was hit dead centre
    let best: Entity | null = null, bd = Infinity;
    for (const u of g.units) if (u.team === PL && !u.dead && !u.def.auto) { const dd = dist(parallaxOf(u, this.view), { x, y }) + (u.def.air ? 3 : 0); if (dd <= u.def.r * UNIT_SCALE + 5 && dd < bd) { bd = dd; best = u; } }
    if (!best) for (const s of g.structs) if (s.team === PL && !s.dead && dist(s, { x, y }) <= s.r) best = s;
    if (!best) { if (!shift) this.selection = []; else this.onSelectionChange(); return; }
    let sel = this.view.selection;
    if (shift) { const i = sel.indexOf(best); if (i >= 0) sel = sel.filter(e => e !== best); else if (best.isUnit) sel = sel.filter(e => e.isUnit).concat([best]); else sel = [best]; }
    else sel = [best];
    if (best.isUnit) sel = g.expandSwarms(sel.filter(e => e.isUnit) as Unit[]);
    this.selection = sel;
  }
  boxSelect(x0: number, y0: number, x1: number, y1: number, shift: boolean) {
    const g = this.game, PL = this.team;
    const found = g.units.filter(u => u.team === PL && !u.dead && !u.def.auto && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1);
    let sel: Entity[];
    if (!found.length && !shift) sel = [];
    else if (shift) { const base = this.view.selection.filter(e => e.isUnit) as Unit[]; for (const u of found) if (!base.includes(u)) base.push(u); sel = base; }
    else sel = found;
    this.selection = g.expandSwarms(sel as Unit[]);
  }
  findEnemyAt(x: number, y: number): Entity | null {
    const g = this.game, PL = this.team, EN = 1 - PL;
    let best: Entity | null = null, bd = Infinity;
    for (const u of g.units) if (u.team === EN && !u.dead && u.seenBy[PL]) { const dd = dist(parallaxOf(u, this.view), { x, y }); if (dd <= u.def.r * UNIT_SCALE + 7 && dd < bd) { bd = dd; best = u; } }
    if (!best) for (const s of g.structs) if (s.team === EN && !s.dead && dist(s, { x, y }) <= s.r + 4) best = s;
    return best;
  }
  selUnits(): Unit[] { return this.view.selection.filter(e => e.isUnit && !e.dead) as Unit[]; }
  selFactories(): Struct[] { return this.view.selection.filter(e => e.isStruct && !e.dead && e.def.produces) as Struct[]; }

  // ---- commands
  issueCommand(x: number, y: number, ctrl: boolean, shift = false) {
    const units = this.selUnits();
    if (ctrl && units.some(e => e.def.indirect)) return this.bombardAt(x, y);
    if (shift && units.length) { this.submit({ kind: 'move', ids: this.ids(units), x, y, formation: this.formationType, queue: true }); return; }
    if (!units.length) {
      const fac = this.selFactories();
      if (fac.length) this.submit({ kind: 'rally', ids: this.ids(fac), x, y });
      return;
    }
    const enemy = this.findEnemyAt(x, y);
    if (enemy) { this.submit({ kind: 'attack', ids: this.ids(units), targetId: enemy.id }); return; }
    this.submit({ kind: 'move', ids: this.ids(units), x, y, formation: this.formationType });
  }
  bombardAt(x: number, y: number) {
    const arty = this.selUnits().filter(e => e.def.indirect);
    if (!arty.length) return this.onMessage('Select artillery first');
    this.submit({ kind: 'bombard', ids: this.ids(arty), x, y });
  }
  digIn() {
    const troops = this.selUnits().filter(e => e.def.troop);
    if (!troops.length) return this.onMessage('Select troops first');
    this.submit({ kind: 'dig', ids: this.ids(troops) });
  }
  strikeNearest() {
    const sel = this.selUnits().filter(e => e.def.kamikaze);
    if (!sel.length) return this.onMessage('Select airborne kamikaze drones first');
    this.submit({ kind: 'strike', ids: this.ids(sel) });
  }
  formSwarm() {
    const sel = this.selUnits().filter(e => e.def.air && !e.def.auto);
    if (!sel.length) return this.onMessage('Select airborne drones first');
    this.submit({ kind: 'swarm', ids: this.ids(sel), formation: this.formationType });
  }
  setFormation(f: FormationType) {
    this.formationType = f;
    const units = this.selUnits();
    const sw = units.length && units.every(u => this.game.swarmOf(u) === this.game.swarmOf(units[0]) && this.game.swarmOf(u)) ? this.game.swarmOf(units[0]) : null;
    if (sw) this.submit({ kind: 'swarmFormation', swarmId: sw.id, formation: f });
    this.onSelectionChange();
  }
  startBombard() { if (this.selUnits().some(u => u.def.indirect)) { this.view.bombardMode = true; this.onMessage('Click where the guns should fire. Right-click or Esc to cancel.'); } }
  startPlacing(type: string | null) {
    if (type && this.game.funds[this.team] < STRUCTS[type].cost) return this.onMessage('Not enough funds');
    this.view.placing = this.view.placing === type ? null : type;
    if (this.view.placing) this.onMessage('Click the map to place. Right-click to cancel.');
    this.onSelectionChange();
  }
  tryPlace(x: number, y: number, keep: boolean) {
    const type = this.view.placing; if (!type) return;
    const err = this.game.placementError(this.team, type, x, y);
    if (err) { this.onMessage(err); return; }
    this.submit({ kind: 'place', type, x, y });
    if (!keep) { this.view.placing = null; this.onSelectionChange(); }
  }
  enqueue(fac: Struct, type: string) { this.submit({ kind: 'enqueue', facId: fac.id, type }); }
  cancelQueued(fac: Struct, index: number) { this.submit({ kind: 'cancel', facId: fac.id, index }); }
  buyUpgrade(key: string) { this.submit({ kind: 'upgrade', key }); }
  geranWave() { this.submit({ kind: 'wave' }); }
  startStrike(kind: 'kab' | 'iskander') { this.strikeMode = this.strikeMode === kind ? null : kind; this.onMessage(kind === 'kab' ? 'Click where the glide bomb should land. Right-click to cancel.' : 'Click the enemy building the missile should hit. Right-click to cancel.'); this.onSelectionChange(); }
  deepStrike() { this.submit({ kind: 'deep' }); }
  setOps(delta: 1 | -1) {
    const squads = this.selUnits().filter(u => u.def.operator);
    if (!squads.length) return this.onMessage('Select an infantry squad first');
    this.submit({ kind: 'ops', ids: this.ids(squads), delta });
  }

  // ---- keys
  keyDown(e: KeyboardEvent): boolean {
    this.keys[e.code] = true;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return false;
    const v = this.view;
    if (e.code === 'Escape') { if (v.pilot) this.releasePilot('Sticks handed back'); else if (this.strikeMode) this.strikeMode = null; else if (v.bombardMode) v.bombardMode = false; else if (v.placing) v.placing = null; else this.view.selection = []; this.onSelectionChange(); }
    else if (e.code === 'KeyP') this.onToggle('pause');
    else if (e.code === 'KeyY') { this.togglePilot(); return true; }
    else if (e.code === 'KeyR') this.cycleMode();
    else if (e.code === 'Space') { if (v.pilot) return true; this.goHome(); return true; }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomAt(1.25, v.vw / 2, v.vh / 2);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomAt(0.8, v.vw / 2, v.vh / 2);
    else if (e.code === 'KeyF') this.strikeNearest();
    else if (e.code === 'KeyG') this.formSwarm();
    else if (e.code === 'KeyT') this.onToggle('tech');
    else if (e.code === 'KeyM') this.onToggle('manual');
    else if (e.code === 'KeyL') this.onToggle('legend');
    else if (e.code === 'KeyN') this.onToggle('audio');
    else if (e.code === 'KeyO') this.setOps(e.shiftKey ? -1 : 1);
    else if (e.code === 'KeyK') this.onToggle('log');
    else if (e.code === 'KeyE' && !this.selFactories().length) { if (this.selUnits().some(x => x.def.troop)) this.digIn(); }
    else if (e.code === 'KeyB' && !this.selFactories().length) this.startBombard();
    else if (/^Digit[1-5]$/.test(e.code)) {
      const k = e.code.slice(5);
      if (e.ctrlKey || e.shiftKey) { this.groups[k] = this.selUnits(); this.onMessage('Group ' + k + ' set'); return true; }
      else if (this.groups[k] && this.groups[k].length) this.selection = this.groups[k].filter(u => !u.dead);
    }
    else {
      const idx = HOTKEYS.indexOf(e.key.toUpperCase());
      if (idx >= 0) {
        const fac = this.selFactories();
        if (fac.length === 1) { const list = fac[0].def.produces!.filter(k => UNITS[k].side === undefined || UNITS[k].side === this.team); if (list[idx]) this.enqueue(fac[0], list[idx]); }
      }
    }
    return false;
  }
  keyUp(e: KeyboardEvent) { this.keys[e.code] = false; }
}
