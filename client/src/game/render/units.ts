// Drawing one unit: shadow, body, details, veterancy chevrons, digging animation, posture tag.
import { TEAMS, DIG_TIME, drawR, modesOf } from '../data';
import { rankOf } from '../sim';
import { clamp } from '../dmath';
import type { Unit } from '../types';
import { altOf, parallaxOf } from './view';
import type { View } from './view';
import { shapePath, shapeDetail } from './shapes';

export const SHADOW_OFF = [
  [2, 3],
  [10, 14],
  [24, 34],
];

/** shovel, flying dirt, and a trench line growing under a squad that is digging in */
export function drawDigging(c: CanvasRenderingContext2D, u: Unit, now: number) {
  const r = drawR(u.def),
    k = clamp(1 - (u.digT ?? DIG_TIME) / DIG_TIME, 0, 1),
    TAU = Math.PI * 2;
  c.save();
  c.translate(u.x, u.y);
  // the trench taking shape
  c.globalAlpha = 0.25 + 0.75 * k;
  c.strokeStyle = '#3a2f1e';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const w = 4 + 16 * k;
  c.beginPath();
  c.moveTo(-w, r + 2);
  c.lineTo(-w / 2, r + 8);
  c.lineTo(0, r + 2);
  c.lineTo(w / 2, r + 8);
  c.lineTo(w, r + 2);
  c.stroke();
  c.strokeStyle = '#8a7a58';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-w, r - 2);
  c.lineTo(-w / 2, r + 4);
  c.lineTo(0, r - 2);
  c.lineTo(w / 2, r + 4);
  c.lineTo(w, r - 2);
  c.stroke();
  // dirt clods thrown up in rhythm
  for (let i = 0; i < 6; i++) {
    const ph = (now / 900 + i * 0.37) % 1,
      ang = i * 1.05 + now / 1400,
      dist = 6 + ph * 16;
    c.globalAlpha = (1 - ph) * 0.9;
    c.fillStyle = i % 2 ? '#6b5a3e' : '#4e4030';
    c.beginPath();
    c.arc(Math.cos(ang) * dist, 2 - ph * 18 + ph * ph * 22, 1.6 + (1 - ph), 0, TAU);
    c.fill();
  }
  // shovel swinging
  const swing = Math.sin(now / 110);
  c.globalAlpha = 1;
  c.strokeStyle = '#d8d4c4';
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(r + 1, -1);
  c.lineTo(r + 9, -3 - swing * 6);
  c.stroke();
  c.fillStyle = '#9a978c';
  c.beginPath();
  c.arc(r + 10, -3 - swing * 6, 2.2, 0, TAU);
  c.fill();
  // progress ring and countdown
  c.strokeStyle = '#e0a030';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k);
  c.stroke();
  c.font = '600 10px "Barlow Condensed", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(12,14,10,0.9)';
  const label = 'digging in ' + Math.ceil(u.digT ?? DIG_TIME) + 's';
  c.strokeText(label, 0, r + 18);
  c.fillStyle = '#ffd60a';
  c.fillText(label, 0, r + 18);
  c.restore();
}

export function drawUnit(c: CanvasRenderingContext2D, u: Unit, now = 0, v?: View) {
  const d = u.def,
    alt = altOf(u),
    r = drawR(d) * (alt === 2 ? 1.15 : 1);
  if (u.order.kind === 'dig') drawDigging(c, u, now);
  const team = u.team < 0 ? { color: '#efeadf', stroke: '#5d584c' } : TEAMS[u.team];
  // shadow on the ground at the true position; aircraft cast it farther away the higher they fly
  const so = SHADOW_OFF[alt];
  c.save();
  c.translate(u.x + so[0], u.y + so[1]);
  if (alt) {
    c.rotate(u.angle);
    c.globalAlpha = alt === 2 ? 0.16 : 0.26;
    c.fillStyle = '#000';
    shapePath(c, d.shape, r * (alt === 2 ? 0.85 : 1));
    c.fill();
  } else {
    c.globalAlpha = 0.35;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  const p = v ? parallaxOf(u, v) : { x: u.x, y: u.y };
  const bob = alt === 1 ? Math.sin(now / 420 + u.id) * 1.2 : alt === 2 ? Math.sin(now / 900 + u.id) * 2 : 0;
  c.save();
  c.translate(p.x, p.y + bob);
  if (u.landed || u.ambushed) {
    c.scale(0.7, 0.7);
    c.globalAlpha = 0.6;
  }
  if (u.grounded) {
    c.scale(0.7, 0.7);
    c.globalAlpha = 0.5;
  }
  c.rotate(u.angle);
  const body =
    u.jamT > 0 && Math.floor(u.jamT * 40) % 2 === 0 ? '#ffffff' : d.hollow ? 'rgba(90,20,24,0.5)' : team.color;
  if (!alt) {
    // extruded side: the same shape a little lower in a darker tone
    c.save();
    c.rotate(-u.angle);
    c.translate(0, 2.5);
    c.rotate(u.angle);
    shapePath(c, d.shape, r);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fill();
    c.restore();
  }
  shapePath(c, d.shape, r);
  c.fillStyle = body;
  c.fill();
  // top-face highlight for the lit side
  c.save();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.14)';
  c.beginPath();
  c.ellipse(-r * 0.25, -r * 0.35, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  shapePath(c, d.shape, r);
  c.lineWidth = 1.5;
  c.strokeStyle = team.stroke;
  c.stroke();
  shapeDetail(c, d.shape, r, team.stroke, u.cargo);
  if (d.shape === 'band') {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    c.stroke();
  }
  if (d.kamikaze && d.dmg > 0) {
    c.fillStyle = '#ff5a5a';
    c.beginPath();
    c.arc(r * 0.45, 0, Math.max(1.6, r * 0.22), 0, Math.PI * 2);
    c.fill();
  }
  if (u.grounded) {
    c.globalAlpha = 1;
    c.strokeStyle = '#ff6b6b';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, r + 4, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-r - 3, r + 3);
    c.lineTo(r + 3, -r - 3);
    c.stroke();
  }
  c.restore();
  // extra drone operators in a squad
  if (u.def.operator && (u.ops || 1) > 1) {
    c.save();
    c.font = '600 9px "Barlow Condensed", sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(12,14,10,0.9)';
    c.strokeText('x' + u.ops, u.x + r + 2, u.y - r);
    c.fillStyle = '#9fd6e8';
    c.fillText('x' + u.ops, u.x + r + 2, u.y - r);
    c.restore();
  }
  // veterancy chevrons
  const rank = rankOf(u);
  if (rank > 0) {
    c.save();
    c.translate(u.x, u.y + r + 4);
    c.strokeStyle = '#ffd60a';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    for (let i = 0; i < rank; i++) {
      c.beginPath();
      c.moveTo(-4, i * 3);
      c.lineTo(0, i * 3 + 2.5);
      c.lineTo(4, i * 3);
      c.stroke();
    }
    c.restore();
  }
  // confirmed kills, tallied beside the unit
  if (u.kills && !u.def.kamikaze) {
    c.save();
    c.font = '600 8px "Barlow Condensed", sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.lineWidth = 2.5;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,14,10,0.9)';
    c.strokeText(u.kills + '†', u.x + r + 2, u.y + r + 3);
    c.fillStyle = '#ffd60a';
    c.fillText(u.kills + '†', u.x + r + 2, u.y + r + 3);
    c.restore();
  }
  // a gun caught firing by enemy radar
  if (u.revealT && u.revealT > 0 && u.def.indirect) {
    c.save();
    c.strokeStyle = 'rgba(255,107,107,' + (0.3 + 0.5 * (u.revealT / 3)) + ')';
    c.lineWidth = 1.5;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.arc(u.x, u.y, r + 9, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  // a vehicle hull down behind a berm
  if (u.mode === 'hullDown' && !u.def.air) {
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.angle);
    c.strokeStyle = '#6b5a3e';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, r + 5, -0.9, 0.9);
    c.stroke();
    c.strokeStyle = '#9a8660';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, r + 7, -0.8, 0.8);
    c.stroke();
    c.restore();
  }
  // a piloted drone: pulsing ring
  if (u.pilotT && u.pilotT > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    c.save();
    c.strokeStyle = 'rgba(255,214,10,' + (0.5 + 0.4 * pulse) + ')';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y + bob, r + 7 + pulse * 3, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

/** a short tag under a unit that is in a posture other than its default */
export function drawModeTag(c: CanvasRenderingContext2D, u: Unit, v: View) {
  const m = modesOf(u.type);
  if (!m || !u.mode || u.mode === m[0].key) return;
  const md = m.find(x => x.key === u.mode);
  if (!md || !md.short) return;
  const r = drawR(u.def),
    sp = parallaxOf(u, v);
  c.save();
  c.font = '600 9px "Barlow Condensed", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.lineWidth = 3;
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(12,14,10,0.9)';
  const y = sp.y + r + (u.def.air ? 8 : 6) + (rankOf(u) > 0 ? rankOf(u) * 3 + 4 : 0);
  c.strokeText(md.short, sp.x, y);
  c.fillStyle = md.key === 'ambush' || md.key === 'silent' || md.key === 'passive' ? '#c6e48b' : '#9fd6e8';
  c.fillText(md.short, sp.x, y);
  c.restore();
}
