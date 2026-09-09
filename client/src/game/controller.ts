// Player input: camera, selection, hotkeys, and turning clicks into simulation commands.
import { UNITS, STRUCTS, HOTKEYS, UNIT_SCALE } from './data';
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
  cmdTab: 'build' | 'procure' = 'build';
  private pan: { mx: number; my: number; cx: number; cy: number } | null = null;
  onMessage: (text: string) => void = () => {};
  onSelectionChange: () => void = () => {};
  onToggle: (panel: 'tech' | 'manual' | 'pause' | 'legend' | 'audio' | 'log') => void = () => {};

  constructor(public session: Session, team: number) {
    this.view = { team, cam: { x: 0, y: 0, z: 1 }, vw: 800, vh: 600, dpr: 1, selection: [], placing: null, mouse: { x: 0, y: 0, inside: false }, bombardMode: false, drag: null, marker: null };
  }
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
    cam.z = clamp(cam.z * factor, 0.35, 2.5);
    cam.x = before.x - mx / cam.z; cam.y = before.y - my / cam.z;
    this.clampCam();
  }
  centerOn(x: number, y: number) { const { cam, vw, vh } = this.view; cam.x = x - vw / (2 * cam.z); cam.y = y - vh / (2 * cam.z); this.clampCam(); }
  goHome() { const hq = this.game.hq(this.team); if (hq) this.centerOn(hq.x, hq.y); }
  handleCamera(dt: number) {
    const { cam, vw, vh, mouse, drag } = this.view, k = this.keys;
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
  }

  // ---- mouse
  mouseDown(px: number, py: number, button: number, shift: boolean) {
    const w = this.toWorld(px, py);
    if (button === 0) {
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
    const w = this.toWorld(px, py), { cam, vw, vh } = this.view, g = this.game, PL = this.team;
    const onScreen = (u: Unit) => (u.x - cam.x) * cam.z >= 0 && (u.x - cam.x) * cam.z <= vw && (u.y - cam.y) * cam.z >= 0 && (u.y - cam.y) * cam.z <= vh;
    let hit: Unit | null = null, bd = Infinity;
    for (const u of g.units) if (u.team === PL && !u.dead && u.def.air && !u.def.auto) { const dd = dist(parallaxOf(u, this.view), w); if (dd <= u.def.r * UNIT_SCALE + 8 && dd < bd) { bd = dd; hit = u; } }
    const picked = g.units.filter(u => u.team === PL && !u.dead && u.def.air && !u.def.auto && onScreen(u) && (!hit || u.type === hit.type));
    if (!picked.length) return this.onMessage('No drones on screen');
    this.selection = g.expandSwarms(picked); this.view.drag = null;
    this.onMessage(picked.length + ' ' + (hit ? UNITS[hit.type].label[PL] : 'drone') + (picked.length > 1 ? 's' : '') + ' selected');
  }
  contextMenu(px: number, py: number, ctrl: boolean) {
    if (this.view.placing) { this.view.placing = null; this.onSelectionChange(); return; }
    const w = this.toWorld(px, py);
    if (this.view.bombardMode) { this.view.bombardMode = false; return this.bombardAt(w.x, w.y); }
    this.issueCommand(w.x, w.y, ctrl);
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
  issueCommand(x: number, y: number, ctrl: boolean) {
    const units = this.selUnits();
    if (ctrl && units.some(e => e.def.indirect)) return this.bombardAt(x, y);
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
    if (e.code === 'Escape') { if (v.bombardMode) v.bombardMode = false; else if (v.placing) v.placing = null; else this.view.selection = []; this.onSelectionChange(); }
    else if (e.code === 'KeyP') this.onToggle('pause');
    else if (e.code === 'Space') { this.goHome(); return true; }
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
