// Canvas rendering of a Game from one player's point of view (fog of war, selection, ghosts).
import { UA, RU, TEAMS, UNITS, STRUCTS, BUILD_RADIUS, TOWN_BUILD_RADIUS, DIG_TIME, drawR, modesOf, PILOT } from './data';
import { rankOf } from './sim';
import { W, H, H_LAND, MM_W, MM_H, BORDER, PX_PER_KM } from './map';
import { clamp } from './dmath';
import type { Game } from './sim';
import type { Unit, Struct, Entity, Site, Effect, Projectile } from './types';
import { TerrainCanvas, poly, drawPipelines } from './terrainCanvas';
import type { Marker } from './levels';

export interface Cam { x: number; y: number; z: number }
export interface View {
  team: number; cam: Cam; vw: number; vh: number; dpr: number;
  selection: Entity[]; placing: string | null; mouse: { x: number; y: number; inside: boolean }; bombardMode: boolean;
  drag: { x0: number; y0: number; x1: number; y1: number } | null; marker: Marker | null;
  /** the drone whose sticks the player holds, and what the pilot has clicked */
  pilot: Unit | null; pilotTarget: Entity | null; pilotDive: { x: number; y: number } | null;
}

/** 0 ground, 1 low aircraft, 2 high-altitude aircraft (a Mavic switched to Low flies at 1) */
export function altOf(u: Unit): number { return !u.def.air || u.landed || u.grounded || u.ambushed ? 0 : u.def.highAlt && u.mode !== 'low' ? 2 : 1; }
/** where an aircraft is drawn: it slides away from the screen centre with altitude, so panning the camera gives depth */
export function parallaxOf(u: Unit, v: View): { x: number; y: number } {
  const alt = altOf(u); if (!alt) return { x: u.x, y: u.y };
  const k = alt === 2 ? 0.09 : 0.045, cx = v.cam.x + v.vw / (2 * v.cam.z), cy = v.cam.y + v.vh / (2 * v.cam.z);
  return { x: u.x + (u.x - cx) * k, y: u.y + (u.y - cy) * k };
}
const SHADOW_OFF = [[2, 3], [10, 14], [24, 34]];

export function shapePath(c: CanvasRenderingContext2D, shape: string, r: number) {
  c.beginPath();
  switch (shape) {
    case 'circle': case 'ring': case 'gun': case 'band': case 'dprk': case 'merc': c.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'tri': case 'tritail': c.moveTo(r * 1.1, 0); c.lineTo(-r * 0.9, r * 0.75); c.lineTo(-r * 0.5, 0); c.lineTo(-r * 0.9, -r * 0.75); c.closePath(); break;
    case 'diamond': c.moveTo(r * 1.1, 0); c.lineTo(0, r * 0.65); c.lineTo(-r * 1.1, 0); c.lineTo(0, -r * 0.65); c.closePath(); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(r, 0); } c.closePath(); break;
    case 'rect': c.rect(-r, -r * 0.62, r * 2, r * 1.24); break;
    case 'rrect': c.roundRect(-r, -r * 0.6, r * 2, r * 1.2, 4); break;
    case 'cross': c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
    case 'pent': for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(r, 0); } c.closePath(); break;
    case 'wedge': c.moveTo(-r, -r * 0.7); c.lineTo(r * 0.7, -r * 0.45); c.lineTo(r * 0.7, r * 0.45); c.lineTo(-r, r * 0.7); c.closePath(); break;
    case 'dart': c.moveTo(r * 1.4, 0); c.lineTo(-r * 0.5, r * 0.55); c.lineTo(-r * 0.95, 0); c.lineTo(-r * 0.5, -r * 0.55); c.closePath(); break;
    case 'star': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 === 0 ? r * 1.2 : r * 0.45; if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(rr, 0); } c.closePath(); break;
    case 'moto': c.roundRect(-r * 1.1, -r * 0.45, r * 2.2, r * 0.9, 4); break;
    case 'truck': c.rect(-r, -r * 0.55, r * 2, r * 1.1); break;
    case 'plane': c.moveTo(r * 1.3, 0); c.lineTo(r * 0.3, r * 0.25); c.lineTo(-r * 0.1, r * 1.1); c.lineTo(-r * 0.45, r * 1.1); c.lineTo(-r * 0.35, r * 0.25);
      c.lineTo(-r * 1.1, r * 0.2); c.lineTo(-r * 1.3, r * 0.55); c.lineTo(-r * 1.4, 0); c.lineTo(-r * 1.3, -r * 0.55); c.lineTo(-r * 1.1, -r * 0.2); c.lineTo(-r * 0.35, -r * 0.25);
      c.lineTo(-r * 0.45, -r * 1.1); c.lineTo(-r * 0.1, -r * 1.1); c.lineTo(r * 0.3, -r * 0.25); c.closePath(); break;
    case 'car': c.roundRect(-r, -r * 0.5, r * 2, r, 3); break;
    case 'ugv': c.roundRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.4, 2); break;
    case 'relay': c.rect(-r, -r * 0.6, r * 2, r * 1.2); break;
    default: c.arc(0, 0, r, 0, Math.PI * 2);
  }
}
export function shapeDetail(c: CanvasRenderingContext2D, shape: string, r: number, stroke: string, cargo?: string) {
  c.strokeStyle = stroke; c.fillStyle = stroke; c.lineWidth = 2; c.lineCap = 'round';
  switch (shape) {
    case 'rect': c.beginPath(); c.arc(0, 0, r * 0.36, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(r * 0.3, 0); c.lineTo(r * 1.45, 0); c.stroke(); break;
    case 'rrect': c.beginPath(); c.arc(-r * 0.1, 0, r * 0.25, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 1.2, 0); c.stroke(); break;
    case 'cross': c.lineWidth = 1.5; c.beginPath(); c.moveTo(-r * 0.7, -r * 0.7); c.lineTo(r * 0.7, r * 0.7); c.moveTo(-r * 0.7, r * 0.7); c.lineTo(r * 0.7, -r * 0.7); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.3, 0, Math.PI * 2); c.fill(); break;
    case 'ring': c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r * 0.45, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 1.5); c.stroke(); break;
    case 'pent': c.beginPath(); c.moveTo(r * 0.2, 0); c.lineTo(r * 1.7, 0); c.stroke(); break;
    case 'wedge': c.lineWidth = 1.5; for (const y of [-r * 0.32, 0, r * 0.32]) { c.beginPath(); c.moveTo(-r * 0.6, y); c.lineTo(r * 0.55, y); c.stroke(); } break;
    case 'circle': case 'band': case 'star': c.beginPath(); c.arc(0, 0, r * 0.3, 0, Math.PI * 2); c.fill(); break;
    case 'hex': c.beginPath(); c.arc(0, 0, r * 0.35, 0, Math.PI * 2); c.stroke(); break;
    case 'tri': c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.5, 0); c.stroke(); break;
    case 'dart': c.lineWidth = 1.5; c.beginPath(); c.moveTo(-r * 0.6, -r * 0.55); c.lineTo(-r * 0.6, r * 0.55); c.stroke(); break;
    case 'dprk': c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 === 0 ? r * 0.62 : r * 0.26; if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); break;
    case 'merc': c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(-r * 0.3, 0); c.lineTo(r * 0.3, 0); c.stroke(); break;
    case 'plane': c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r * 0.4, 0); c.lineTo(r * 0.9, 0); c.stroke(); break;
    case 'car': c.fillRect(r * 0.1, -r * 0.35, r * 0.5, r * 0.7); break;
    case 'tritail': c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.5, 0); c.stroke(); c.lineWidth = 1;
      c.beginPath(); c.moveTo(-r * 0.7, 0); c.lineTo(-r * 1.6, r * 0.4); c.lineTo(-r * 2.4, -r * 0.3); c.lineTo(-r * 3.2, r * 0.2); c.stroke(); break;
    case 'gun': c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 1.9, -r * 0.5); c.stroke();
      c.beginPath(); c.arc(-r * 0.35, r * 0.4, r * 0.22, 0, Math.PI * 2); c.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, Math.PI * 2); c.fill(); break;
    case 'moto': c.beginPath(); c.arc(-r * 0.7, 0, r * 0.32, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(r * 0.7, 0, r * 0.32, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(-r * 0.05, -r * 0.1, r * 0.25, 0, Math.PI * 2); c.fill(); break;
    case 'ugv': c.lineWidth = 2; for (const y of [-r * 0.7, r * 0.7]) { c.beginPath(); c.moveTo(-r * 1.1, y); c.lineTo(r * 1.1, y); c.stroke(); } c.beginPath(); c.arc(0, 0, r * 0.28, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 1.4, 0); c.stroke(); break;
    case 'relay': c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 1.6); c.stroke(); c.beginPath(); c.arc(0, -r * 1.6, r * 0.45, Math.PI * 0.15, Math.PI * 0.85, true); c.stroke(); c.beginPath(); c.arc(-r * 0.5, r * 0.6, r * 0.2, 0, Math.PI * 2); c.arc(r * 0.5, r * 0.6, r * 0.2, 0, Math.PI * 2); c.fill(); break;
    case 'truck': c.fillRect(r * 0.45, -r * 0.45, r * 0.55, r * 0.9); if (cargo === 'oil') { c.beginPath(); c.arc(-r * 0.25, 0, r * 0.38, 0, Math.PI * 2); c.stroke(); } else if (cargo === 'grain') { c.fillStyle = '#d6b04a'; c.fillRect(-r * 0.85, -r * 0.35, r * 1.1, r * 0.7); c.fillStyle = stroke; }
      c.beginPath(); c.arc(-r * 0.55, r * 0.6, r * 0.2, 0, Math.PI * 2); c.arc(r * 0.35, r * 0.6, r * 0.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(-r * 0.55, -r * 0.6, r * 0.2, 0, Math.PI * 2); c.arc(r * 0.35, -r * 0.6, r * 0.2, 0, Math.PI * 2); c.fill(); break;
  }
}

/** shovel, flying dirt, and a trench line growing under a squad that is digging in */
function drawDigging(c: CanvasRenderingContext2D, u: Unit, now: number) {
  const r = drawR(u.def), k = clamp(1 - (u.digT ?? DIG_TIME) / DIG_TIME, 0, 1), TAU = Math.PI * 2;
  c.save(); c.translate(u.x, u.y);
  // the trench taking shape
  c.globalAlpha = 0.25 + 0.75 * k; c.strokeStyle = '#3a2f1e'; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
  const w = 4 + 16 * k; c.beginPath(); c.moveTo(-w, r + 2); c.lineTo(-w / 2, r + 8); c.lineTo(0, r + 2); c.lineTo(w / 2, r + 8); c.lineTo(w, r + 2); c.stroke();
  c.strokeStyle = '#8a7a58'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-w, r - 2); c.lineTo(-w / 2, r + 4); c.lineTo(0, r - 2); c.lineTo(w / 2, r + 4); c.lineTo(w, r - 2); c.stroke();
  // dirt clods thrown up in rhythm
  for (let i = 0; i < 6; i++) {
    const ph = ((now / 900) + i * 0.37) % 1, ang = i * 1.05 + now / 1400, dist = 6 + ph * 16;
    c.globalAlpha = (1 - ph) * 0.9; c.fillStyle = i % 2 ? '#6b5a3e' : '#4e4030';
    c.beginPath(); c.arc(Math.cos(ang) * dist, 2 - ph * 18 + ph * ph * 22, 1.6 + (1 - ph), 0, TAU); c.fill();
  }
  // shovel swinging
  const swing = Math.sin(now / 110);
  c.globalAlpha = 1; c.strokeStyle = '#d8d4c4'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(r + 1, -1); c.lineTo(r + 9, -3 - swing * 6); c.stroke();
  c.fillStyle = '#9a978c'; c.beginPath(); c.arc(r + 10, -3 - swing * 6, 2.2, 0, TAU); c.fill();
  // progress ring and countdown
  c.strokeStyle = '#e0a030'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
  c.font = '600 10px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,10,0.9)';
  const label = 'digging in ' + Math.ceil(u.digT ?? DIG_TIME) + 's'; c.strokeText(label, 0, r + 18); c.fillStyle = '#ffd60a'; c.fillText(label, 0, r + 18);
  c.restore();
}

function drawUnit(c: CanvasRenderingContext2D, u: Unit, now = 0, v?: View) {
  const d = u.def, alt = altOf(u), r = drawR(d) * (alt === 2 ? 1.15 : 1);
  if (u.order.kind === 'dig') drawDigging(c, u, now);
  const team = u.team < 0 ? { color: '#efeadf', stroke: '#5d584c' } : TEAMS[u.team];
  // shadow on the ground at the true position; aircraft cast it farther away the higher they fly
  const so = SHADOW_OFF[alt];
  c.save(); c.translate(u.x + so[0], u.y + so[1]);
  if (alt) { c.rotate(u.angle); c.globalAlpha = alt === 2 ? 0.16 : 0.26; c.fillStyle = '#000'; shapePath(c, d.shape, r * (alt === 2 ? 0.85 : 1)); c.fill(); }
  else { c.globalAlpha = 0.35; c.fillStyle = '#000'; c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2); c.fill(); }
  c.restore();
  const p = v ? parallaxOf(u, v) : { x: u.x, y: u.y };
  const bob = alt === 1 ? Math.sin(now / 420 + u.id) * 1.2 : alt === 2 ? Math.sin(now / 900 + u.id) * 2 : 0;
  c.save(); c.translate(p.x, p.y + bob);
  if (u.landed || u.ambushed) { c.scale(0.7, 0.7); c.globalAlpha = 0.6; }
  if (u.grounded) { c.scale(0.7, 0.7); c.globalAlpha = 0.5; }
  c.rotate(u.angle);
  const body = u.jamT > 0 && Math.floor(u.jamT * 40) % 2 === 0 ? '#ffffff' : d.hollow ? 'rgba(90,20,24,0.5)' : team.color;
  if (!alt) {
    // extruded side: the same shape a little lower in a darker tone
    c.save(); c.rotate(-u.angle); c.translate(0, 2.5); c.rotate(u.angle); shapePath(c, d.shape, r); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill(); c.restore();
  }
  shapePath(c, d.shape, r);
  c.fillStyle = body;
  c.fill();
  // top-face highlight for the lit side
  c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.ellipse(-r * 0.25, -r * 0.35, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); c.fill(); c.restore();
  shapePath(c, d.shape, r);
  c.lineWidth = 1.5; c.strokeStyle = team.stroke; c.stroke();
  shapeDetail(c, d.shape, r, team.stroke, u.cargo);
  if (d.shape === 'band') { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke(); }
  if (d.kamikaze && d.dmg > 0) { c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(r * 0.45, 0, Math.max(1.6, r * 0.22), 0, Math.PI * 2); c.fill(); }
  if (u.grounded) { c.globalAlpha = 1; c.strokeStyle = '#ff6b6b'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r + 4, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(-r - 3, r + 3); c.lineTo(r + 3, -r - 3); c.stroke(); }
  c.restore();
  // extra drone operators in a squad
  if (u.def.operator && (u.ops || 1) > 1) { c.save(); c.font = '600 9px "Barlow Condensed", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 2; c.strokeStyle = 'rgba(12,14,10,0.9)'; c.strokeText('x' + u.ops, u.x + r + 2, u.y - r); c.fillStyle = '#9fd6e8'; c.fillText('x' + u.ops, u.x + r + 2, u.y - r); c.restore(); }
  // veterancy chevrons
  const rank = rankOf(u);
  if (rank > 0) {
    c.save(); c.translate(u.x, u.y + r + 4); c.strokeStyle = '#ffd60a'; c.lineWidth = 1.5; c.lineCap = 'round';
    for (let i = 0; i < rank; i++) { c.beginPath(); c.moveTo(-4, i * 3); c.lineTo(0, i * 3 + 2.5); c.lineTo(4, i * 3); c.stroke(); }
    c.restore();
  }
  // a gun caught firing by enemy radar
  if (u.revealT && u.revealT > 0 && u.def.indirect) { c.save(); c.strokeStyle = 'rgba(255,107,107,' + (0.3 + 0.5 * (u.revealT / 3)) + ')'; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.arc(u.x, u.y, r + 9, 0, Math.PI * 2); c.stroke(); c.restore(); }
  // a vehicle hull down behind a berm
  if (u.mode === 'hullDown' && !u.def.air) { c.save(); c.translate(u.x, u.y); c.rotate(u.angle); c.strokeStyle = '#6b5a3e'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, r + 5, -0.9, 0.9); c.stroke(); c.strokeStyle = '#9a8660'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r + 7, -0.8, 0.8); c.stroke(); c.restore(); }
  // a piloted drone: pulsing ring
  if (u.pilotT && u.pilotT > 0) { const pulse = 0.5 + 0.5 * Math.sin(now / 160); c.save(); c.strokeStyle = 'rgba(255,214,10,' + (0.5 + 0.4 * pulse) + ')'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y + bob, r + 7 + pulse * 3, 0, Math.PI * 2); c.stroke(); c.restore(); }
}

/** a short tag under a unit that is in a posture other than its default */
function drawModeTag(c: CanvasRenderingContext2D, u: Unit, v: View) {
  const m = modesOf(u.type); if (!m || !u.mode || u.mode === m[0].key) return;
  const md = m.find(x => x.key === u.mode); if (!md || !md.short) return;
  const r = drawR(u.def), sp = parallaxOf(u, v);
  c.save(); c.font = '600 9px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = 'rgba(12,14,10,0.9)';
  const y = sp.y + r + (u.def.air ? 8 : 6) + (rankOf(u) > 0 ? rankOf(u) * 3 + 4 : 0);
  c.strokeText(md.short, sp.x, y); c.fillStyle = md.key === 'ambush' || md.key === 'silent' || md.key === 'passive' ? '#c6e48b' : '#9fd6e8'; c.fillText(md.short, sp.x, y);
  c.restore();
}

/** the pilot's view: line to the stick input, reticle, target ring, link leash, vignette, and a status line */
function drawPilotHud(c: CanvasRenderingContext2D, g: Game, v: View, now: number) {
  const u = v.pilot; if (!u || u.dead) return;
  const { cam, vw, vh, dpr } = v, sp = parallaxOf(u, v);
  c.save(); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
  // leash: the squad's control range
  if (u.operator && !u.operator.dead && g.needsOperator(u.def, u.team)) { c.strokeStyle = 'rgba(159,214,232,0.45)'; c.setLineDash([6, 8]); c.lineWidth = 1.5; c.beginPath(); c.arc(u.operator.x, u.operator.y, g.linkRange(u), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  const tgt = v.pilotTarget && !v.pilotTarget.dead ? v.pilotTarget : null;
  const aim = tgt ? (tgt.isUnit ? parallaxOf(tgt, v) : { x: tgt.x, y: tgt.y }) : v.pilotDive ? v.pilotDive : v.mouse.inside ? toWorld(v, v.mouse.x, v.mouse.y) : null;
  if (aim) {
    c.strokeStyle = tgt ? 'rgba(255,107,107,0.8)' : v.pilotDive ? 'rgba(255,160,60,0.8)' : 'rgba(255,214,10,0.55)'; c.lineWidth = 1.5; c.setLineDash([4, 5]);
    c.beginPath(); c.moveTo(sp.x, sp.y); c.lineTo(aim.x, aim.y); c.stroke(); c.setLineDash([]);
    const rr = tgt ? (tgt.isUnit ? drawR(tgt.def) : tgt.r) + 6 : 10, spin = now / 600;
    c.lineWidth = 2; c.beginPath(); c.arc(aim.x, aim.y, rr, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 4; i++) { const a = spin + i * Math.PI / 2; c.beginPath(); c.moveTo(aim.x + Math.cos(a) * (rr + 3), aim.y + Math.sin(a) * (rr + 3)); c.lineTo(aim.x + Math.cos(a) * (rr + 9), aim.y + Math.sin(a) * (rr + 9)); c.stroke(); }
    if (v.pilotDive && u.def.kamikaze) { c.font = '600 10px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffb060'; c.fillText('DIVE', aim.x, aim.y - rr - 6); }
  }
  c.restore();
  // screen space: vignette and the status line
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.38, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = vg; c.fillRect(0, 0, vw, vh);
  c.strokeStyle = 'rgba(255,214,10,0.5)'; c.lineWidth = 2; c.strokeRect(8, 8, vw - 16, vh - 16);
  const batt = u.def.endurance ? Math.ceil(u.batt === undefined ? u.def.endurance : u.batt) + ' s battery' : u.def.fuelDrone ? 'gasoline' : '';
  const link = u.operator && !u.operator.dead && g.needsOperator(u.def, u.team) ? 'link ' + Math.round(Math.hypot(u.x - u.operator.x, u.y - u.operator.y)) + ' / ' + g.linkRange(u) : 'autonomous';
  const what = tgt ? 'ON TARGET: ' + (tgt.isUnit ? tgt.def.label[tgt.team] : tgt.def.label) : v.pilotDive ? 'DIVING ON THE POINT' : 'flying to the cursor';
  const line1 = 'PILOT  ·  ' + u.def.label[u.team] + '  ·  ' + [batt, link].filter(Boolean).join('  ·  ') + '  ·  +' + Math.round(PILOT.evade * 100) + '% evasion' + (u.def.kamikaze ? ', +' + Math.round((PILOT.dmg - 1) * 100) + '% warhead' : '');
  const line2 = what + '   ·   left-click: ' + (u.def.kamikaze ? 'attack or dive on the point' : 'attack') + '   ·   right-click: let go   ·   Y or Esc: hand back';
  // the status lines sit along the bottom edge, clear of the message toast at the top
  c.font = '600 14px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = 'rgba(12,14,10,0.9)';
  c.strokeText(line1, vw / 2, vh - 32); c.fillStyle = '#ffd60a'; c.fillText(line1, vw / 2, vh - 32);
  c.font = '500 12px "Barlow Condensed", sans-serif'; c.strokeText(line2, vw / 2, vh - 16); c.fillStyle = tgt ? '#ff8a80' : v.pilotDive ? '#ffb060' : '#e8e4d4'; c.fillText(line2, vw / 2, vh - 16);
}

function hpBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number) {
  c.fillStyle = '#000'; c.fillRect(x, y, w, 4);
  c.fillStyle = ratio > 0.5 ? '#8bc34a' : ratio > 0.25 ? '#e0a030' : '#e04040';
  c.fillRect(x, y, w * clamp(ratio, 0, 1), 4);
}

function drawCiv(c: CanvasRenderingContext2D, s: Struct) {
  const r = s.r;
  drawFootprintShadow(c, s);
  c.save(); c.translate(s.x, s.y);
  c.lineWidth = 1.5; c.strokeStyle = '#5d584c';
  switch (s.type) {
    case 'apartments': c.fillStyle = '#c9c2ad'; c.fillRect(-r, -r * 0.7, r * 2, r * 1.4); c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.fillStyle = '#4a4640'; for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) c.fillRect(i * r * 0.36 - 1.5, j * r * 0.42 - 1.5, 3, 3); break;
    case 'hospital': c.fillStyle = '#efeadf'; c.fillRect(-r, -r * 0.8, r * 2, r * 1.6); c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = '#c1121f'; c.fillRect(-r * 0.15, -r * 0.5, r * 0.3, r); c.fillRect(-r * 0.5, -r * 0.15, r, r * 0.3); break;
    case 'school': c.fillStyle = '#d6c9a5'; c.fillRect(-r, -r * 0.6, r * 2, r * 1.2); c.strokeRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.beginPath(); c.moveTo(-r, -r * 0.6); c.lineTo(0, -r * 1.1); c.lineTo(r, -r * 0.6); c.stroke(); break;
    case 'power': c.fillStyle = '#9a978c'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#ffd60a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.2, -r * 0.7); c.lineTo(-r * 0.3, 0); c.lineTo(r * 0.2, 0); c.lineTo(-r * 0.2, r * 0.7); c.stroke(); break;
    case 'market': c.fillStyle = '#d9b98a'; c.fillRect(-r, -r * 0.7, r * 2, r * 1.4); c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.fillStyle = '#b5563a'; for (let i = 0; i < 4; i++) c.fillRect(-r + i * r * 0.5, -r * 0.7, r * 0.25, r * 0.4); break;
  }
  c.fillStyle = 'rgba(232,228,212,0.85)'; c.font = '10px Barlow, sans-serif'; c.textAlign = 'center';
  c.fillText(s.def.label, 0, r + 12);
  if (s.hp < s.def.hp) hpBar(c, -r, -r - 9, r * 2, s.hp / s.def.hp);
  c.restore();
}

function drawFootprintShadow(c: CanvasRenderingContext2D, s: Struct) {
  if (s.def.trench || s.def.netR) return;
  c.save(); c.translate(s.x + 4, s.y + 7); c.globalAlpha = 0.32; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0, 0, s.r * 1.15, s.r * 0.85, 0, 0, Math.PI * 2); c.fill(); c.restore();
}
function drawStruct(c: CanvasRenderingContext2D, s: Struct) {
  if (s.civ) return drawCiv(c, s);
  drawFootprintShadow(c, s);
  const team = TEAMS[s.team], r = s.r;
  c.save(); c.translate(s.x, s.y);
  c.fillStyle = team.dark; c.strokeStyle = team.color; c.lineWidth = 2;
  if (s.build < 1) c.setLineDash([6, 5]);
  switch (s.type) {
    case 'hq': c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2); c.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
      c.fillStyle = team.stroke; c.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4); break;
    case 'barracks': c.fillRect(-r, -r * 0.7, r * 2, r * 1.4); c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke(); break;
    case 'droneWorks': c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2);
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const px = Math.cos(a) * r * 0.55, py = Math.sin(a) * r * 0.55; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); c.stroke(); break;
    case 'armorPlant': c.fillRect(-r, -r * 0.8, r * 2, r * 1.6); c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r * 0.7, -r * 0.4, r * 0.6, r * 0.8); c.strokeRect(r * 0.1, -r * 0.4, r * 0.6, r * 0.8); break;
    case 'artyDepot': c.fillRect(-r, -r * 0.8, r * 2, r * 1.6); c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = team.color; for (const x of [-r * 0.5, 0, r * 0.5]) { c.beginPath(); c.arc(x, 0, r * 0.14, 0, Math.PI * 2); c.fill(); } break;
    case 'radar': c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, r * 0.2, r * 0.6, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.beginPath(); c.moveTo(0, r * 0.2); c.lineTo(0, -r * 0.6); c.stroke(); break;
    case 'ewStation': c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.2, 0, Math.PI * 2); c.stroke(); break;
    case 'trench': c.strokeStyle = '#3a2f1e'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-20, -4); c.lineTo(-10, 4); c.lineTo(0, -4); c.lineTo(10, 4); c.lineTo(20, -4); c.stroke();
      c.strokeStyle = '#8a7a58'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-20, -8); c.lineTo(-10, 0); c.lineTo(0, -8); c.lineTo(10, 0); c.lineTo(20, -8); c.stroke(); break;
    case 'generator': c.fillStyle = '#5a5a52'; c.fillRect(-r, -r * 0.7, r * 2, r * 1.4); c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeStyle = '#ffd60a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.2, -r * 0.6); c.lineTo(-r * 0.25, 0); c.lineTo(r * 0.2, 0); c.lineTo(-r * 0.2, r * 0.6); c.stroke(); break;
    case 'aidPost': c.fillStyle = '#efeadf'; c.fillRect(-r, -r * 0.8, r * 2, r * 1.6); c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = '#c1121f'; c.fillRect(-r * 0.15, -r * 0.5, r * 0.3, r); c.fillRect(-r * 0.5, -r * 0.15, r, r * 0.3); break;
    case 'pump': c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2); c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.5, 0); c.stroke(); break;
    case 'launchSite': c.fillRect(-r, -r * 0.6, r * 2, r * 1.2); c.strokeRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.beginPath(); c.moveTo(-r * 0.7, r * 0.3); c.lineTo(r * 0.7, -r * 0.3); c.stroke(); c.beginPath(); c.moveTo(r * 0.3, -r * 0.3); c.lineTo(r * 0.7, -r * 0.3); c.lineTo(r * 0.7, r * 0.05); c.stroke(); break;
    case 'net': {
      const nr = s.def.netR!;
      c.save(); c.beginPath(); c.arc(0, 0, nr, 0, Math.PI * 2); c.clip();
      c.fillStyle = 'rgba(230,226,205,0.10)'; c.fillRect(-nr, -nr, nr * 2, nr * 2);
      c.strokeStyle = 'rgba(230,226,205,0.35)'; c.lineWidth = 1;
      for (let k = -nr; k <= nr; k += 12) { c.beginPath(); c.moveTo(k, -nr); c.lineTo(k, nr); c.stroke(); c.beginPath(); c.moveTo(-nr, k); c.lineTo(nr, k); c.stroke(); }
      c.restore();
      c.setLineDash(s.build < 1 ? [6, 5] : [3, 5]); c.strokeStyle = 'rgba(230,226,205,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, nr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = team.dark; c.strokeStyle = team.color; c.lineWidth = 2; c.fillRect(-r, -r, r * 2, r * 2); c.strokeRect(-r, -r, r * 2, r * 2);
      break;
    }
  }
  c.setLineDash([]);
  c.fillStyle = 'rgba(232,228,212,0.92)'; c.font = '11px Barlow, sans-serif'; c.textAlign = 'center';
  if (!s.def.trench) c.fillText(s.def.label, 0, r + 14);
  if (s.build < 1) { c.fillStyle = '#000'; c.fillRect(-r, -r - 10, r * 2, 5); c.fillStyle = team.stroke; c.fillRect(-r, -r - 10, r * 2 * s.build, 5); }
  else if (s.hp < s.def.hp) hpBar(c, -r, -r - 10, r * 2, s.hp / s.def.hp);
  c.restore();
}

function drawDepot(c: CanvasRenderingContext2D, d: Site) {
  c.save(); c.translate(d.x, d.y);
  c.fillStyle = d.owner === UA ? 'rgba(58,134,255,0.18)' : d.owner === RU ? 'rgba(193,18,31,0.18)' : 'rgba(200,200,180,0.12)';
  c.beginPath(); c.arc(0, 0, d.r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = d.owner === UA ? TEAMS[UA].color : d.owner === RU ? TEAMS[RU].color : '#b8b4a0'; c.lineWidth = 2; c.setLineDash([8, 6]); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#6a6455'; c.fillRect(-14, -9, 12, 18); c.fillRect(2, -9, 12, 18);
  c.strokeStyle = '#3a3730'; c.lineWidth = 1; c.strokeRect(-14, -9, 12, 18); c.strokeRect(2, -9, 12, 18);
  if (d.cap > 0 && d.capTeam >= 0) { c.strokeStyle = TEAMS[d.capTeam].color; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, d.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.cap / 5)); c.stroke(); }
  c.fillStyle = 'rgba(232,228,212,0.9)'; c.font = '11px Barlow, sans-serif'; c.textAlign = 'center';
  c.fillText(d.name, 0, d.r + 15);
  c.restore();
}

function drawResource(c: CanvasRenderingContext2D, rs: Site, fx: Effect[]) {
  c.save(); c.translate(rs.x, rs.y);
  const col = rs.owner === UA ? TEAMS[UA].color : rs.owner === RU ? TEAMS[RU].color : '#b8b4a0';
  if (rs.kind === 'wheat') {
    c.fillStyle = rs.burnT > 0 ? 'rgba(120,60,20,0.55)' : 'rgba(214,176,74,0.45)';
    c.beginPath(); c.arc(0, 0, rs.r, 0, Math.PI * 2); c.fill();
    c.save(); c.clip(); c.strokeStyle = rs.burnT > 0 ? 'rgba(60,30,10,0.5)' : 'rgba(150,115,40,0.55)'; c.lineWidth = 1;
    for (let k = -rs.r; k <= rs.r; k += 8) { c.beginPath(); c.moveTo(-rs.r, k); c.lineTo(rs.r, k); c.stroke(); }
    c.restore();
    if (rs.burnT > 0 && Math.random() < 0.3) fx.push({ kind: 'caught', x: rs.x + (Math.random() * 2 - 1) * rs.r * 0.7, y: rs.y + (Math.random() * 2 - 1) * rs.r * 0.7, t: 0, dur: 0.9 });
  } else {
    c.fillStyle = 'rgba(90,84,70,0.5)'; c.beginPath(); c.arc(0, 0, rs.r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2621'; c.fillStyle = '#6b6555'; c.lineWidth = 2;
    if (rs.name.includes('depot')) { for (const dx of [-14, 14]) { c.beginPath(); c.arc(dx, 0, 11, 0, Math.PI * 2); c.fill(); c.stroke(); } }
    else { c.beginPath(); c.moveTo(-10, 14); c.lineTo(-3, -14); c.lineTo(3, -14); c.lineTo(10, 14); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-14, -8); c.lineTo(14, -12); c.stroke(); }
  }
  c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([8, 6]); c.beginPath(); c.arc(0, 0, rs.r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  if (rs.cap > 0 && rs.capTeam >= 0) { c.strokeStyle = TEAMS[rs.capTeam].color; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, rs.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (rs.cap / 5)); c.stroke(); }
  c.fillStyle = 'rgba(232,228,212,0.9)'; c.font = '11px Barlow, sans-serif'; c.textAlign = 'center';
  c.fillText(rs.name + (rs.burnT > 0 ? ' (burning)' : ''), 0, rs.r + 15);
  c.restore();
}

function drawEffects(c: CanvasRenderingContext2D, effects: Effect[], team: number, g?: Game) {
  for (const e of effects) {
    const k = e.t / e.dur;
    if (e.kind === 'alert') {
      const pulse = 0.5 + 0.5 * Math.sin(k * 40);
      c.globalAlpha = 0.5 + 0.5 * pulse; c.strokeStyle = '#ff5a5a'; c.lineWidth = 3; c.setLineDash([8, 6]);
      c.beginPath(); c.arc(e.x, e.y, 70 + pulse * 8, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(e.x - 14, e.y); c.lineTo(e.x + 14, e.y); c.moveTo(e.x, e.y - 14); c.lineTo(e.x, e.y + 14); c.stroke();
      c.font = '600 13px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,10,0.9)';
      const label = (e.text || 'STRIKE') + ' ' + Math.ceil(e.dur - e.t) + 's'; c.strokeText(label, e.x, e.y - 84); c.fillStyle = '#ff8a80'; c.fillText(label, e.x, e.y - 84);
      c.globalAlpha = 1;
    } else if (e.kind === 'bark') {
      if (e.delay && e.t < e.delay) continue;
      if (e.team !== team && g && !g.inVision(team, e.x, e.y)) continue;
      const kk = (e.t - (e.delay || 0)) / (e.dur - (e.delay || 0));
      c.globalAlpha = 1 - Math.max(0, (kk - 0.6) / 0.4);
      c.font = '600 12px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      const y = e.y - 18 - kk * 10;
      c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,10,0.9)'; c.strokeText(e.text || '', e.x, y);
      c.fillStyle = e.team === UA ? '#ffe680' : '#ffb3a8'; c.fillText(e.text || '', e.x, y);
      c.fillStyle = e.team === UA ? TEAMS[UA].color : TEAMS[RU].color; c.beginPath(); c.arc(e.x - c.measureText(e.text || '').width / 2 - 6, y, 2.5, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    } else if (e.kind === 'boom') {
      const rr = e.r! * (0.3 + 0.7 * Math.min(1, k * 1.6));
      c.globalAlpha = 1 - k;
      const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.4, 'rgba(255,140,40,0.8)'); g.addColorStop(1, 'rgba(60,40,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, Math.PI * 2); c.fill();
      c.globalAlpha = (1 - k) * 0.7; c.strokeStyle = '#ffb060'; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, e.r! * (0.5 + k), 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    } else if (e.kind === 'tracer') {
      c.globalAlpha = 1 - k; c.strokeStyle = e.team === UA ? '#ffe680' : '#ff9a80'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.tx!, e.ty!); c.stroke(); c.globalAlpha = 1;
    } else if (e.kind === 'hit') {
      c.globalAlpha = 1 - k; c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(e.x, e.y, 3 + k * 4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    } else if (e.kind === 'flash') {
      c.globalAlpha = 1 - k; c.fillStyle = '#fff5d0'; c.beginPath(); c.arc(e.x, e.y, 5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    } else if (e.kind === 'mark') {
      if (e.team !== undefined && e.team !== team) continue;
      c.globalAlpha = 1 - k; c.strokeStyle = e.red ? '#ff6b6b' : e.green ? '#8bc34a' : '#ffd60a'; c.lineWidth = 2;
      c.beginPath(); c.arc(e.x, e.y, 6 + k * 18, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    } else if (e.kind === 'heal') {
      c.globalAlpha = 1 - k; c.fillStyle = '#8bc34a'; c.fillRect(e.x - 1.5, e.y - 5 - k * 10, 3, 10); c.fillRect(e.x - 5, e.y - 1.5 - k * 10, 10, 3); c.globalAlpha = 1;
    } else if (e.kind === 'caught') {
      c.globalAlpha = (1 - k) * 0.8; c.fillStyle = '#d8d4c4'; c.beginPath(); c.arc(e.x, e.y, 4 + k * 10, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#d8d4c4'; c.lineWidth = 1; c.beginPath(); c.moveTo(e.x - 7, e.y - 7); c.lineTo(e.x + 7, e.y + 7); c.moveTo(e.x - 7, e.y + 7); c.lineTo(e.x + 7, e.y - 7); c.stroke(); c.globalAlpha = 1;
    } else if (e.kind === 'text') {
      if (e.team !== undefined && e.team !== team) continue;
      c.globalAlpha = 1 - k; c.fillStyle = '#c6e48b'; c.font = '600 13px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
      c.fillText(e.text!, e.x, e.y - k * 18); c.globalAlpha = 1;
    }
  }
}

function drawProjectiles(c: CanvasRenderingContext2D, projectiles: Projectile[]) {
  for (const p of projectiles) {
    const k = Math.min(1, p.t / p.dur), h = Math.sin(k * Math.PI) * p.arc;
    if (p.rocket) {
      c.strokeStyle = 'rgba(255,200,120,0.6)'; c.lineWidth = 2;
      const bk = Math.max(0, k - 0.08), bx = p.sx + (p.tx - p.sx) * bk, by = p.sy + (p.ty - p.sy) * bk - Math.sin(bk * Math.PI) * p.arc;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(p.x, p.y - h); c.stroke();
    }
    if (p.strike) {
      const ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
      c.save(); c.translate(p.x, p.y - h); c.rotate(ang); c.fillStyle = p.strike === 'kab' ? '#3a3a3a' : '#5a5a66'; c.strokeStyle = '#ff8a80'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, 4); c.lineTo(-9, 0); c.lineTo(-7, -4); c.closePath(); c.fill(); c.stroke();
      if (p.strike === 'kab') { c.beginPath(); c.moveTo(-2, -8); c.lineTo(2, 0); c.lineTo(-2, 8); c.stroke(); }
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(p.x, p.y, 5, 3, 0, 0, Math.PI * 2); c.fill();
      continue;
    }
    c.fillStyle = '#f5e9c8'; c.beginPath(); c.arc(p.x, p.y - h, p.rocket ? 2.2 : 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(p.x, p.y, 2, 0, Math.PI * 2); c.fill();
  }
}

export class Renderer {
  private fog: HTMLCanvasElement; private fctx: CanvasRenderingContext2D;
  private mmFog: HTMLCanvasElement; private mmFogCtx: CanvasRenderingContext2D;
  /** visual-only effects (burning fields) kept apart from the simulation's list */
  private localFx: Effect[] = [];
  constructor(public tc: TerrainCanvas) {
    this.fog = document.createElement('canvas'); this.fctx = this.fog.getContext('2d')!;
    this.mmFog = document.createElement('canvas'); this.mmFog.width = MM_W; this.mmFog.height = MM_H; this.mmFogCtx = this.mmFog.getContext('2d')!;
  }

  render(ctx: CanvasRenderingContext2D, g: Game, v: View, now: number, shake = 0) {
    const { vw, vh, dpr } = v, PL = v.team, EN = 1 - PL; let cam: Cam = v.cam;
    // a hidden or collapsed stage has no size: drawing into a zero-sized canvas throws
    if (ctx.canvas.width <= 0 || ctx.canvas.height <= 0) return;
    if (shake > 0) { cam = { x: cam.x + (Math.random() * 2 - 1) * shake / cam.z, y: cam.y + (Math.random() * 2 - 1) * shake / cam.z, z: cam.z }; }
    for (const s of g.scorches) this.tc.scorch(s.x, s.y, s.r); g.scorches = [];
    if (this.fog.width !== ctx.canvas.width || this.fog.height !== ctx.canvas.height) { this.fog.width = ctx.canvas.width; this.fog.height = ctx.canvas.height; }
    this.localFx = this.localFx.filter(e => (e.t += 1 / 60) < e.dur);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1e2419'; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(this.tc.terrain, 0, 0);
    if (this.tc.basemap && this.tc.basemapTiles > 0) {
      ctx.drawImage(this.tc.basemap, 0, 0);
      poly(ctx, BORDER, false); ctx.strokeStyle = 'rgba(193,18,31,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
      drawPipelines(ctx);
    }
    for (const rs of g.resources) drawResource(ctx, rs, this.localFx);
    for (const d of g.depots) drawDepot(ctx, d);
    for (const s of g.structs) drawStruct(ctx, s);
    for (const s of v.selection) if (s.isStruct && s.def.produces && !s.dead) {
      ctx.strokeStyle = 'rgba(255,214,10,0.7)'; ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.rally.x, s.rally.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(s.rally.x, s.rally.y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    for (const u of g.units) if (!u.def.air && (u.seenBy[PL] || u.team === PL)) drawUnit(ctx, u, now, v);
    drawProjectiles(ctx, g.projectiles);
    // low aircraft first, then the high ones on top: a layered sky
    for (const u of g.units) if (u.def.air && u.seenBy[PL] && altOf(u) < 2) drawUnit(ctx, u, now, v);
    for (const u of g.units) if (u.def.air && u.seenBy[PL] && altOf(u) === 2) drawUnit(ctx, u, now, v);
    drawEffects(ctx, g.effects, PL, g); drawEffects(ctx, this.localFx, PL);
    ctx.restore();

    this.drawFog(ctx, g, v);
    this.drawWeather(ctx, g, v, now);

    ctx.save(); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    for (const e of v.selection) {
      if (e.dead) continue;
      const r = (e.isUnit ? drawR(e.def) : e.r) + 5;
      const sp = e.isUnit ? parallaxOf(e, v) : { x: e.x, y: e.y };
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2); ctx.stroke();
      if (e.isUnit) hpBar(ctx, sp.x - 12, sp.y - r - 8, 24, e.hp / e.def.hp);
      if (e.isUnit && e.def.ammo) { const max = e.def.ammo, n = e.ammo || 0; for (let i = 0; i < max; i++) { ctx.fillStyle = i < n ? '#f5e9c8' : 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - max * 1.5 + i * 3, e.y + r + 3, 2, 3); } }
      const rng = e.isUnit ? g.rangeOf(e) : (e.def.range || 0);
      const jam = e.def.jam || 0;
      if (rng > 100 || jam) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 6]);
        if (rng > 100) { ctx.beginPath(); ctx.arc(e.x, e.y, rng, 0, Math.PI * 2); ctx.stroke(); }
        if (e.isUnit && e.def.minRange) { ctx.beginPath(); ctx.arc(e.x, e.y, e.def.minRange, 0, Math.PI * 2); ctx.stroke(); }
        if (jam) { ctx.strokeStyle = 'rgba(196,139,224,0.6)'; ctx.beginPath(); ctx.arc(e.x, e.y, jam, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    }
    for (const e of v.selection) {
      if (!e.isUnit || e.dead) continue;
      if (e.path && e.path.length && e.order.kind === 'move') { ctx.strokeStyle = 'rgba(232,228,212,0.45)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); for (const w of e.path) ctx.lineTo(w.x, w.y); ctx.lineTo(e.order.x, e.order.y); ctx.stroke(); ctx.setLineDash([]); }
      if (e.waypoints && e.waypoints.length) {
        ctx.strokeStyle = 'rgba(255,214,10,0.55)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5; ctx.beginPath();
        const start = e.order.kind === 'move' ? e.order : e; ctx.moveTo(start.x, start.y); for (const w of e.waypoints) ctx.lineTo(w.x, w.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,214,10,0.8)'; e.waypoints.forEach((w, i) => { ctx.fillRect(w.x - 3, w.y - 3, 6, 6); ctx.font = '600 9px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), w.x, w.y - 6); });
      }
      if (e.def.operated && e.operator && !e.operator.dead) { ctx.strokeStyle = 'rgba(159,214,232,0.5)'; ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.operator.x, e.operator.y); ctx.stroke(); ctx.setLineDash([]); }
      // postures with a radius: an FPV in ambush, an interceptor guarding its post
      if (e.ambushed) { const pulse = 0.5 + 0.5 * Math.sin(now / 500); ctx.strokeStyle = 'rgba(198,228,139,' + (0.3 + 0.3 * pulse) + ')'; ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, PILOT.ambushReach, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (e.mode === 'guard' && e.post) { ctx.strokeStyle = 'rgba(159,214,232,0.45)'; ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.post.x, e.post.y, PILOT.guardReach, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (e.scoot) { ctx.strokeStyle = 'rgba(240,138,93,0.7)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.scoot.x, e.scoot.y); ctx.stroke(); ctx.setLineDash([]); }
      if (e.def.operator && g.needsOperator(UNITS.fpv, PL)) {
        ctx.strokeStyle = 'rgba(159,214,232,0.35)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(e.x, e.y, 650 + (g.upgrades[PL].auto1 ? 150 : 0), 0, Math.PI * 2); ctx.stroke();
        for (const dr of (e.drones || [])) if (!dr.dead) { ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(dr.x, dr.y); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    }
    for (const e of v.selection) if (e.isUnit && !e.dead && e.order.kind === 'bombard') {
      ctx.strokeStyle = 'rgba(255,107,107,0.8)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.order.x, e.order.y, (e.def.splash || 30) * (g.inVision(PL, e.order.x, e.order.y) ? 1 : 2.4), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.order.x - 10, e.order.y); ctx.lineTo(e.order.x + 10, e.order.y); ctx.moveTo(e.order.x, e.order.y - 10); ctx.lineTo(e.order.x, e.order.y + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.order.x, e.order.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (v.bombardMode && v.mouse.inside) { const w = toWorld(v, v.mouse.x, v.mouse.y); ctx.strokeStyle = '#ff6b6b'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(w.x, w.y, 40, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (v.marker) {
      const m = v.marker, pulse = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.strokeStyle = 'rgba(255,214,10,' + (0.4 + 0.5 * pulse) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r + pulse * 10, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const sw of g.swarms) {
      if (sw.team !== PL) continue;
      const ms = sw.members.filter(m => !m.dead); if (ms.length < 2) continue;
      const cx = ms.reduce((a, u) => a + u.x, 0) / ms.length, cy = ms.reduce((a, u) => a + u.y, 0) / ms.length;
      const rr = Math.max(...ms.map(m => Math.hypot(m.x - cx, m.y - cy))) + 16;
      ctx.strokeStyle = 'rgba(58,134,255,0.55)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(232,228,212,0.85)'; ctx.font = '11px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('swarm ' + ms.length, cx, cy - rr - 4);
    }
    for (const u of g.units) if (u.team === PL && !u.dead && u.mode) drawModeTag(ctx, u, v);
    for (const u of g.units) if (u.team === PL && u.def.endurance && !u.landed && u.batt !== undefined && u.batt < u.def.endurance * 0.4) { const k = clamp(u.batt / u.def.endurance, 0, 1), sp = parallaxOf(u, v); ctx.fillStyle = '#000'; ctx.fillRect(sp.x - 8, sp.y + drawR(u.def) + 4, 16, 3); ctx.fillStyle = k < 0.15 ? '#e04040' : '#e0a030'; ctx.fillRect(sp.x - 8, sp.y + drawR(u.def) + 4, 16 * k, 3); }
    for (const u of g.units) if (u.team === PL && u.def.morale && u.morale !== undefined) { ctx.fillStyle = '#000'; ctx.fillRect(u.x - 10, u.y - drawR(u.def) - 4, 20, 3); ctx.fillStyle = u.morale < 30 ? '#e04040' : '#ffd60a'; ctx.fillRect(u.x - 10, u.y - u.def.r - 4, 20 * u.morale / 100, 3); }
    for (const u of g.units) if (u.team === PL && u.hp < u.def.hp && !v.selection.includes(u)) { const sp = parallaxOf(u, v); hpBar(ctx, sp.x - 10, sp.y - drawR(u.def) - 9, 20, u.hp / u.def.hp); }
    for (const u of g.units) if (u.team === EN && u.seenBy[PL] && u.hp < u.def.hp) { const sp = parallaxOf(u, v); hpBar(ctx, sp.x - 10, sp.y - drawR(u.def) - 9, 20, u.hp / u.def.hp); }
    for (const s of g.structs) if (s.team === PL && s.def.jam && s.build >= 1) { ctx.strokeStyle = 'rgba(196,139,224,0.35)'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(s.x, s.y, s.def.jam, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    for (const st of g.structs) if (!st.dead && st.def.heal && st.build >= 1 && (st.civ ? st.nation === PL : st.team === PL)) { ctx.strokeStyle = 'rgba(139,195,74,0.35)'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(st.x, st.y, st.def.heal, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    for (const u of g.units) if (u.team === PL && u.def.jam) { ctx.strokeStyle = 'rgba(196,139,224,0.3)'; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(u.x, u.y, u.def.jam, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // relay carriers: the control bubble they project for the squads' drones
    for (const u of g.units) if (u.team === PL && !u.dead && u.def.relay) { ctx.strokeStyle = v.selection.includes(u) ? 'rgba(159,214,232,0.6)' : 'rgba(159,214,232,0.28)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(u.x, u.y, u.def.relay, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // the kill zone: a red ring under every armed enemy drone you can see, as far as it can see
    for (const u of g.units) if (u.team === EN && !u.dead && u.seenBy[PL] && g.isKillZoneDrone(u)) { const rr = g.visionR(u); ctx.strokeStyle = 'rgba(255,90,90,0.28)'; ctx.fillStyle = 'rgba(255,90,90,0.05)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(u.x, u.y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
    if (v.placing && v.mouse.inside) {
      const w = toWorld(v, v.mouse.x, v.mouse.y), def = STRUCTS[v.placing];
      const hq = g.hq(PL);
      if (hq) { ctx.strokeStyle = 'rgba(255,214,10,0.35)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(hq.x, hq.y, BUILD_RADIUS, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      for (const d of g.depots) if (d.owner === PL) { ctx.strokeStyle = 'rgba(255,214,10,0.35)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(d.x, d.y, TOWN_BUILD_RADIUS, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (def.netR) { ctx.setLineDash([4, 6]); ctx.strokeStyle = '#e6e2cd'; ctx.beginPath(); ctx.arc(w.x, w.y, def.netR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (def.heal) { ctx.setLineDash([4, 6]); ctx.strokeStyle = '#8bc34a'; ctx.beginPath(); ctx.arc(w.x, w.y, def.heal, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      const err = g.placementError(PL, v.placing, w.x, w.y);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = err ? '#c1121f' : '#3a86ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, def.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (def.jam) { ctx.setLineDash([4, 6]); ctx.strokeStyle = '#c48be0'; ctx.beginPath(); ctx.arc(w.x, w.y, def.jam, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = '12px Barlow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(err || def.label, w.x, w.y + def.r + 16);
    }
    ctx.restore();
    if (v.pilot) drawPilotHud(ctx, g, v, now);

    ctx.save();
    ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(232,228,212,0.9)'; ctx.strokeStyle = 'rgba(232,228,212,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(26, 46); ctx.lineTo(26, 22); ctx.moveTo(19, 30); ctx.lineTo(26, 22); ctx.lineTo(33, 30); ctx.stroke();
    ctx.fillText('N', 26, 56);
    const bar = 10 * PX_PER_KM * cam.z;
    ctx.beginPath(); ctx.moveTo(52, 44); ctx.lineTo(52 + bar, 44); ctx.moveTo(52, 39); ctx.lineTo(52, 49); ctx.moveTo(52 + bar, 39); ctx.lineTo(52 + bar, 49); ctx.stroke();
    ctx.fillText('10 km', 52 + bar / 2, 56);
    ctx.textAlign = 'left'; ctx.fillText('zoom ' + cam.z.toFixed(1) + 'x', 52 + bar + 14, 44);
    if (this.tc.basemap) { ctx.font = '11px Barlow, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(232,228,212,0.85)'; ctx.fillText(this.tc.attrib() + (this.tc.basemapTiles < this.tc.basemapTotal ? ' (' + this.tc.basemapTiles + '/' + this.tc.basemapTotal + ' tiles)' : ''), 10, vh - 8); }
    ctx.restore();

    if (v.drag) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      const x = (Math.min(v.drag.x0, v.drag.x1) - cam.x) * cam.z, y = (Math.min(v.drag.y0, v.drag.y1) - cam.y) * cam.z;
      ctx.fillRect(x, y, Math.abs(v.drag.x1 - v.drag.x0) * cam.z, Math.abs(v.drag.y1 - v.drag.y0) * cam.z);
      ctx.strokeRect(x, y, Math.abs(v.drag.x1 - v.drag.x0) * cam.z, Math.abs(v.drag.y1 - v.drag.y0) * cam.z);
    }
  }

  private rainSeed = 0;
  /** client-only weather and night overlays in screen space */
  private drawWeather(ctx: CanvasRenderingContext2D, g: Game, v: View, now: number) {
    const { vw, vh, dpr } = v, k = g.weather.kind;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g.isNight()) { ctx.fillStyle = 'rgba(8,12,34,0.34)'; ctx.fillRect(0, 0, vw, vh); }
    if (k === 'fog') { ctx.fillStyle = 'rgba(214,218,205,0.42)'; ctx.fillRect(0, 0, vw, vh); const t = now / 9000; ctx.fillStyle = 'rgba(230,232,224,0.12)'; for (let i = 0; i < 4; i++) { const x = ((t * 80 + i * 300) % (vw + 400)) - 200; ctx.beginPath(); ctx.ellipse(x, vh * (0.2 + i * 0.2), 260, 90, 0, 0, Math.PI * 2); ctx.fill(); } }
    else if (k === 'rain') { ctx.fillStyle = 'rgba(40,52,64,0.16)'; ctx.fillRect(0, 0, vw, vh); ctx.strokeStyle = 'rgba(200,220,240,0.35)'; ctx.lineWidth = 1; const off = (now / 4) % 40; ctx.beginPath(); for (let i = 0; i < 90; i++) { const x = (i * 97 + this.rainSeed) % (vw + 40) - 20, y = (i * 53 + off * (1 + (i % 3))) % (vh + 40) - 20; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); } ctx.stroke(); }
    else if (k === 'snow') { ctx.fillStyle = 'rgba(230,236,240,0.22)'; ctx.fillRect(0, 0, vw, vh); ctx.fillStyle = 'rgba(255,255,255,0.8)'; const off = now / 40; for (let i = 0; i < 70; i++) { const x = (i * 131 + Math.sin(now / 900 + i) * 20 + vw) % vw, y = (i * 71 + off * (1 + (i % 4) * 0.4)) % vh; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill(); } }
  }

  private drawFog(ctx: CanvasRenderingContext2D, g: Game, v: View) {
    const { cam, vw, vh, dpr } = v, fctx = this.fctx;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, vw, vh);
    fctx.fillStyle = 'rgba(8,10,6,0.6)'; fctx.fillRect(0, 0, vw, Math.min(vh, (H_LAND - cam.y) * cam.z));
    fctx.globalCompositeOperation = 'destination-out';
    const z = cam.z;
    for (const vs of g.vision[v.team]) {
      const x = (vs.x - cam.x) * z, y = (vs.y - cam.y) * z, r = vs.r * z;
      if (x + r < 0 || y + r < 0 || x - r > vw || y - r > vh) continue;
      const gr = fctx.createRadialGradient(x, y, r * 0.72, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.fillStyle = gr; fctx.beginPath(); fctx.arc(x, y, r, 0, Math.PI * 2); fctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fog, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  renderMinimap(mmctx: CanvasRenderingContext2D, g: Game, v: View) {
    const PL = v.team;
    mmctx.setTransform(1, 0, 0, 1, 0, 0);
    mmctx.drawImage(this.tc.mm, 0, 0);
    const sx = MM_W / W, sy = MM_H / H;
    mmctx.fillStyle = 'rgba(0,0,0,0.3)'; mmctx.fillRect(0, 0, MM_W, MM_H);
    for (const d of g.depots) { mmctx.fillStyle = d.owner === UA ? TEAMS[UA].color : d.owner === RU ? TEAMS[RU].color : '#c8c4b0'; mmctx.fillRect(d.x * sx - 3, d.y * sy - 3, 6, 6); }
    for (const rs of g.resources) { mmctx.fillStyle = rs.burnT > 0 ? '#e0552b' : rs.owner === UA ? TEAMS[UA].color : rs.owner === RU ? TEAMS[RU].color : '#c8c4b0'; mmctx.beginPath(); mmctx.arc(rs.x * sx, rs.y * sy, 3, 0, Math.PI * 2); mmctx.fill(); }
    for (const s of g.structs) { mmctx.fillStyle = s.civ ? '#e8e2cc' : TEAMS[s.team].color; mmctx.fillRect(s.x * sx - 2, s.y * sy - 2, s.civ ? 3 : 5, s.civ ? 3 : 5); }
    for (const u of g.units) if (u.seenBy[PL] || u.team === PL) { mmctx.fillStyle = u.team === UA ? '#9cc4ff' : u.team < 0 ? '#e8e2cc' : '#ff7a7a'; mmctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2); }
    const f = this.mmFogCtx;
    f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, MM_W, MM_H);
    f.fillStyle = 'rgba(4,6,3,0.62)'; f.fillRect(0, 0, MM_W, H_LAND * sy);
    f.globalCompositeOperation = 'destination-out';
    for (const vs of g.vision[PL]) { f.beginPath(); f.arc(vs.x * sx, vs.y * sy, Math.max(2, vs.r * sx), 0, Math.PI * 2); f.fill(); }
    mmctx.drawImage(this.mmFog, 0, 0);
    mmctx.strokeStyle = '#fff'; mmctx.lineWidth = 1;
    mmctx.strokeRect(v.cam.x * sx + 0.5, v.cam.y * sy + 0.5, v.vw / v.cam.z * sx, v.vh / v.cam.z * sy);
  }
}

export function toWorld(v: View, mx: number, my: number) { return { x: mx / v.cam.z + v.cam.x, y: my / v.cam.z + v.cam.y }; }

export function drawLegend(cv: HTMLCanvasElement) {
  const list = ['fpv', 'fiberFpv', 'mavic', 'fwRecon', 'interceptor', 'bomber', 'liutyi', 'lancet', 'molniya', 'geran', 'geran3', 'geran5', 'gerbera', 'infantry', 'fireGroup', 'moto', 'merc', 'dprk', 'defector', 'truck', 'civcar', 'tank', 'ifv', 'aa', 'jammer', 'howitzer', 'mlrs', 'ugv', 'relay'];
  const cw = cv.clientWidth || 640, ch = cv.clientHeight || 150, d = window.devicePixelRatio || 1;
  cv.width = cw * d; cv.height = ch * d;
  const c = cv.getContext('2d')!; c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, cw, ch);
  const cols = cw > 420 ? 4 : 2, cellW = cw / cols, cellH = Math.max(22, ch / Math.ceil(list.length / cols));
  list.forEach((k, i) => {
    const def = UNITS[k], x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    c.save(); c.translate(x + 18, y + cellH / 2);
    const enemy = def.side === 1, neutral = k === 'civcar';
    shapePath(c, def.shape, def.r); c.fillStyle = def.hollow ? 'rgba(90,20,24,0.5)' : neutral ? '#efeadf' : enemy ? TEAMS[RU].color : TEAMS[UA].color; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = neutral ? '#5d584c' : enemy ? TEAMS[RU].stroke : TEAMS[UA].stroke; c.stroke();
    shapeDetail(c, def.shape, def.r, neutral ? '#5d584c' : enemy ? TEAMS[RU].stroke : TEAMS[UA].stroke);
    if (k === 'defector') { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, def.r * 0.62, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    c.fillStyle = '#e8e4d4'; c.font = '13px Barlow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText((enemy ? def.label[RU] : def.label[UA]) + (enemy ? ' (Russia)' : neutral ? ' (neutral)' : ''), x + 42, y + cellH / 2);
  });
}
