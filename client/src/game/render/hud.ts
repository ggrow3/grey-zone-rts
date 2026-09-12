// Screen-space overlays: announced enemy columns, the pilot's view, and the name of what the cursor rests on.
import { drawR, PILOT, TARGET_WORDS, RANK_NAMES } from '../data';
import type { Game } from '../sim';
import { rankOf } from '../sim';
import type { Entity } from '../types';
import { parallaxOf, toWorld } from './view';
import type { View } from './view';

/** an announced enemy column: a screen-edge arrow toward where it is going while that is off screen, a marker when it is on */
export function drawIncoming(c: CanvasRenderingContext2D, g: Game, v: View, now: number) {
  const { cam, vw, vh, dpr } = v;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const inc of g.incoming) {
    if (inc.team !== v.team) continue;
    const age = g.gameTime - inc.at;
    if (age > 25) continue;
    const a = 0.9 - age / 30,
      pulse = 0.5 + 0.5 * Math.sin(now / 200);
    const sx = (inc.x - cam.x) * cam.z,
      sy = (inc.y - cam.y) * cam.z,
      cx = vw / 2,
      cy = vh / 2;
    const on = sx > 20 && sx < vw - 20 && sy > 20 && sy < vh - 20;
    let ex = sx,
      ey = sy;
    if (!on) {
      const dx = sx - cx,
        dy = sy - cy,
        kx = Math.abs(dx) > 1 ? (vw / 2 - 40) / Math.abs(dx) : 1e9,
        ky = Math.abs(dy) > 1 ? (vh / 2 - 60) / Math.abs(dy) : 1e9,
        k = Math.min(kx, ky);
      ex = cx + dx * k;
      ey = cy + dy * k;
    }
    const ang = Math.atan2(sy - cy, sx - cx);
    c.save();
    c.globalAlpha = a;
    c.translate(ex, ey);
    if (!on) {
      c.rotate(ang);
      c.fillStyle = '#ff6b6b';
      c.beginPath();
      c.moveTo(16 + pulse * 4, 0);
      c.lineTo(-6, -10);
      c.lineTo(-2, 0);
      c.lineTo(-6, 10);
      c.closePath();
      c.fill();
      c.rotate(-ang);
    } else {
      c.strokeStyle = '#ff6b6b';
      c.lineWidth = 2;
      c.setLineDash([6, 5]);
      c.beginPath();
      c.arc(0, 0, 26 + pulse * 6, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.font = '600 12px "Barlow Condensed", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,14,10,0.9)';
    const label = 'ENEMY COLUMN: ' + inc.name.toUpperCase();
    c.strokeText(label, 0, on ? 34 : 14);
    c.fillStyle = '#ff8a80';
    c.fillText(label, 0, on ? 34 : 14);
    c.restore();
  }
}

/** the pilot's view: line to the stick input, reticle, target ring, link leash, vignette, and a status line */
export function drawPilotHud(c: CanvasRenderingContext2D, g: Game, v: View, now: number) {
  const u = v.pilot;
  if (!u || u.dead) return;
  const { cam, vw, vh, dpr } = v,
    sp = parallaxOf(u, v);
  c.save();
  c.scale(cam.z, cam.z);
  c.translate(-cam.x, -cam.y);
  // leash: the squad's control range
  if (u.operator && !u.operator.dead && g.needsOperator(u.def, u.team)) {
    c.strokeStyle = 'rgba(159,214,232,0.45)';
    c.setLineDash([6, 8]);
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(u.operator.x, u.operator.y, g.linkRange(u), 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  const tgt = v.pilotTarget && !v.pilotTarget.dead ? v.pilotTarget : null;
  const aim = tgt
    ? tgt.isUnit
      ? parallaxOf(tgt, v)
      : { x: tgt.x, y: tgt.y }
    : v.pilotDive
      ? v.pilotDive
      : v.mouse.inside
        ? toWorld(v, v.mouse.x, v.mouse.y)
        : null;
  if (aim) {
    c.strokeStyle = tgt ? 'rgba(255,107,107,0.8)' : v.pilotDive ? 'rgba(255,160,60,0.8)' : 'rgba(255,214,10,0.55)';
    c.lineWidth = 1.5;
    c.setLineDash([4, 5]);
    c.beginPath();
    c.moveTo(sp.x, sp.y);
    c.lineTo(aim.x, aim.y);
    c.stroke();
    c.setLineDash([]);
    const rr = tgt ? (tgt.isUnit ? drawR(tgt.def) : tgt.r) + 6 : 10,
      spin = now / 600;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(aim.x, aim.y, rr, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      c.beginPath();
      c.moveTo(aim.x + Math.cos(a) * (rr + 3), aim.y + Math.sin(a) * (rr + 3));
      c.lineTo(aim.x + Math.cos(a) * (rr + 9), aim.y + Math.sin(a) * (rr + 9));
      c.stroke();
    }
    if (v.pilotDive && u.def.kamikaze) {
      c.font = '600 10px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#ffb060';
      c.fillText('DIVE', aim.x, aim.y - rr - 6);
    }
  }
  c.restore();
  // screen space: vignette and the status line
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.38, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = vg;
  c.fillRect(0, 0, vw, vh);
  c.strokeStyle = 'rgba(255,214,10,0.5)';
  c.lineWidth = 2;
  c.strokeRect(8, 8, vw - 16, vh - 16);
  const batt = u.def.endurance
    ? Math.ceil(u.batt === undefined ? u.def.endurance : u.batt) + ' s battery'
    : u.def.fuelDrone
      ? 'gasoline'
      : '';
  const link =
    u.operator && !u.operator.dead && g.needsOperator(u.def, u.team)
      ? 'link ' + Math.round(Math.hypot(u.x - u.operator.x, u.y - u.operator.y)) + ' / ' + g.linkRange(u)
      : 'autonomous';
  const what = tgt
    ? 'ON TARGET: ' + (tgt.isUnit ? tgt.def.label[tgt.team] : tgt.def.label)
    : v.pilotDive
      ? 'DIVING ON THE POINT'
      : 'flying to the cursor';
  const line1 =
    'PILOT  ·  ' +
    u.def.label[u.team] +
    '  ·  ' +
    [batt, link].filter(Boolean).join('  ·  ') +
    '  ·  +' +
    Math.round(PILOT.evade * 100) +
    '% evasion' +
    (u.def.kamikaze ? ', +' + Math.round((PILOT.dmg - 1) * 100) + '% warhead' : '');
  const line2 =
    what +
    '   ·   left-click: ' +
    (u.def.kamikaze ? 'attack or dive on the point' : 'attack') +
    '   ·   right-click: let go   ·   Y or Esc: hand back';
  // the status lines sit along the bottom edge, clear of the message toast at the top
  c.font = '600 14px "Barlow Condensed", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.lineWidth = 3;
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(12,14,10,0.9)';
  c.strokeText(line1, vw / 2, vh - 32);
  c.fillStyle = '#ffd60a';
  c.fillText(line1, vw / 2, vh - 32);
  c.font = '500 12px "Barlow Condensed", sans-serif';
  c.strokeText(line2, vw / 2, vh - 16);
  c.fillStyle = tgt ? '#ff8a80' : v.pilotDive ? '#ffb060' : '#e8e4d4';
  c.fillText(line2, vw / 2, vh - 16);
}

/** the enemy unit or building under the cursor, if the player's side can see it */
export function hovered(g: Game, v: View): Entity | null {
  if (!v.mouse.inside || v.drag || v.placing) return null;
  const PL = v.team,
    w = toWorld(v, v.mouse.x, v.mouse.y);
  let best: Entity | null = null,
    bd = Infinity;
  for (const u of g.units) {
    if (u.dead || u.team === PL || !u.seenBy[PL]) continue;
    const dd = Math.hypot(parallaxOf(u, v).x - w.x, parallaxOf(u, v).y - w.y) + (u.def.air ? 3 : 0);
    if (dd <= drawR(u.def) + 6 / v.cam.z && dd < bd) {
      bd = dd;
      best = u;
    }
  }
  if (!best)
    for (const s of g.structs) if (s.team !== PL && !s.dead && Math.hypot(s.x - w.x, s.y - w.y) <= s.r + 4) best = s;
  return best;
}

/** a label beside the cursor naming the enemy under it: type, health, rank, what it can hit and how far */
export function drawHover(c: CanvasRenderingContext2D, g: Game, v: View) {
  const e = hovered(g, v);
  if (!e) return;
  const PL = v.team;
  const lines: string[] = [];
  if (e.isUnit) {
    const d = e.def;
    lines.push(d.label[PL]);
    lines.push(
      'health ' +
        Math.ceil(e.hp) +
        ' / ' +
        d.hp +
        (d.auto || d.kamikaze ? '' : ', ' + RANK_NAMES[rankOf(e)].toLowerCase() + ', ' + (e.kills || 0) + ' kills')
    );
    if (d.kamikaze) lines.push('one-way dive, warhead ' + d.dmg);
    else if (d.dmg)
      lines.push(
        'hits ' + (d.targets ? d.targets.map(k => TARGET_WORDS[k]).join(', ') : 'nothing') + ' within ' + g.rangeOf(e)
      );
    else if (d.recon) lines.push('recon: what it sees, their guns can shell');
    else if (d.jam) lines.push('jammer: drops radio drones near it');
    if (e.cover === 'trench') lines.push('dug in');
    if (e.landed) lines.push('landed, swapping batteries');
  } else {
    lines.push(e.def.label + (e.build < 1 ? ' (under construction)' : ''));
    lines.push('health ' + Math.ceil(e.hp) + ' / ' + e.def.hp);
  }
  const { cam, vw, dpr } = v;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.font = '12px "Barlow", "Arial Narrow", sans-serif';
  const pad = 6,
    lh = 15,
    w = Math.max(...lines.map(t => c.measureText(t).width)) + pad * 2,
    h = lines.length * lh + pad * 2 - 3;
  const p = e.isUnit ? parallaxOf(e, v) : { x: e.x, y: e.y };
  let x = (p.x - cam.x) * cam.z + 14,
    y = (p.y - cam.y) * cam.z - h / 2;
  if (x + w > vw - 6) x = (p.x - cam.x) * cam.z - w - 14;
  y = Math.max(6, y);
  c.fillStyle = 'rgba(14,16,12,0.9)';
  c.strokeStyle = 'rgba(255,107,107,0.8)';
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(x, y, w, h, 3);
  c.fill();
  c.stroke();
  c.textAlign = 'left';
  c.textBaseline = 'top';
  lines.forEach((t, i) => {
    c.fillStyle = i === 0 ? '#ff8c8c' : '#e6e2d3';
    if (i === 0) c.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif';
    else c.font = '12px "Barlow", "Arial Narrow", sans-serif';
    c.fillText(t, x + pad, y + pad + i * lh);
  });
}
