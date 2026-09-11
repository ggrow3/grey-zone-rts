// Formations and drone swarms: formation offsets, the control-range leash, forming and updating swarms, swarm strikes.
import { SWARM_CAP } from '../data';
import type { FormationType } from '../data';
import { W, H } from '../map';
import { hyp, dist, clamp, dsin, dcos, datan2 } from '../dmath';
import type { Unit, Entity, Swarm, Pt } from '../types';
import type { Game } from './game';
import { MOVE, ATTACK } from './orders';
import { acquireFor, acquirePreferred } from './combat';

export function formationOffsets(n: number, type: FormationType, spacing: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (type === 'line') out.push({ x: 0, y: (i - (n - 1) / 2) * spacing });
    else if (type === 'column') out.push({ x: -i * spacing, y: 0 });
    else if (type === 'ring') {
      const R = Math.max(spacing, (spacing * n) / 6.28),
        a = (i / n) * Math.PI * 2;
      out.push({ x: dcos(a) * R, y: dsin(a) * R });
    } else {
      if (i === 0) out.push({ x: 0, y: 0 });
      else {
        const k = Math.ceil(i / 2),
          side = i % 2 ? 1 : -1;
        out.push({ x: -k * spacing * 0.9, y: side * k * spacing * 0.8 });
      }
    }
  }
  return out;
}

export function rotOff(o: Pt, h: number): Pt {
  const c = dcos(h),
    sn = dsin(h);
  return { x: o.x * c - o.y * sn, y: o.x * sn + o.y * c };
}

export function leashPoint(g: Game, u: Unit, x: number, y: number): Pt {
  if (!g.needsOperator(u.def, u.team) || !u.operator || u.operator.dead) return { x, y };
  const R = g.linkRange(u) * 0.95,
    dd = hyp(x - u.operator.x, y - u.operator.y);
  if (dd <= R || g.relayNear(u.team, { x, y })) return { x, y };
  return { x: u.operator.x + ((x - u.operator.x) * R) / dd, y: u.operator.y + ((y - u.operator.y) * R) / dd };
}

export function formationMove(g: Game, list: Unit[], x: number, y: number, type: FormationType) {
  list = list.filter(u => !u.landed);
  if (!list.length) return;
  const cx = list.reduce((a, u) => a + u.x, 0) / list.length,
    cy = list.reduce((a, u) => a + u.y, 0) / list.length;
  const h = hyp(x - cx, y - cy) > 10 ? datan2(y - cy, x - cx) : list[0].angle;
  const offs = formationOffsets(list.length, type, 26);
  list.forEach((u, i) => {
    const o = rotOff(offs[i], h),
      lp = leashPoint(g, u, x + o.x, y + o.y);
    u.order = MOVE(clamp(lp.x, 6, W - 6), clamp(lp.y, 6, H - 6));
    u.target = null;
  });
}

export function formSwarm(g: Game, team: number, sel: Unit[], formation: FormationType) {
  sel = sel.filter(e => !e.dead && e.def.air && !e.def.auto && !e.grounded);
  if (!sel.length) return g.notify(team, 'Select airborne drones first');
  const one = g.swarmOf(sel[0]);
  if (one && sel.every(u => g.swarmOf(u) === one) && one.members.filter(m => !m.dead).length === sel.length) {
    for (const m of one.members) m.swarm = null;
    one.dead = true;
    g.notify(team, 'Swarm disbanded');
    return;
  }
  const cap = SWARM_CAP[g.autoTier(team)];
  if (sel.length > cap)
    return g.notify(team, 'Automation tier ' + g.autoTier(team) + ' controls swarms of up to ' + cap);
  if (sel.length < 2) return g.notify(team, 'A swarm needs at least two drones');
  for (const u of sel) {
    const old = g.swarmOf(u);
    if (old) {
      old.members = old.members.filter(m => m !== u);
      if (old.members.length < 2) {
        for (const m of old.members) m.swarm = null;
        old.dead = true;
      }
    }
  }
  const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length,
    cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
  sel.sort((a, b) => hyp(a.x - cx, a.y - cy) - hyp(b.x - cx, b.y - cy));
  const sw: Swarm = { id: g.nextId++, team, members: sel.slice(), leader: sel[0], formation, dead: false, t: 0 };
  for (const u of sel) u.swarm = sw;
  g.swarms.push(sw);
  g.notify(team, 'Swarm of ' + sel.length + ' formed');
}

export function updateSwarms(g: Game, dt: number) {
  for (const sw of g.swarms) {
    if (sw.dead) continue;
    sw.members = sw.members.filter(m => !m.dead);
    if (sw.members.length < 2) {
      for (const m of sw.members) m.swarm = null;
      sw.dead = true;
      continue;
    }
    if (!sw.leader || sw.leader.dead) sw.leader = sw.members[0];
    sw.t -= dt;
    if (sw.t > 0) continue;
    sw.t = 0.5;
    const L = sw.leader,
      offs = formationOffsets(sw.members.length, sw.formation, 26);
    sw.members.forEach((m, i) => {
      if (m === L || m.target || m.order.kind !== 'idle' || m.landed || L.landed || m.ambushed || g.piloted(m)) return;
      const o = rotOff(offs[i], L.angle),
        sx = L.x + o.x,
        sy = L.y + o.y;
      if (hyp(m.x - sx, m.y - sy) > 28) m.order = MOVE(clamp(sx, 6, W - 6), clamp(sy, 6, H - 6));
    });
  }
  g.swarms = g.swarms.filter(sw => !sw.dead);
}

export function swarmStrike(g: Game, sw: Swarm): number {
  const L = sw.leader,
    team = sw.team;
  const T = (L.def.prefer && acquirePreferred(g, L, 1400)) || acquireFor(g, L, 1400, 0);
  if (!T) return 0;
  let n = 0;
  const near: Entity[] = [];
  for (const e of g.units)
    if (!e.dead && e.team !== team && e.team >= 0 && e.seenBy[team] && dist(e, T) < 140 && g.canEngage(L.def, e))
      near.push(e);
  for (const st of g.structs)
    if (!st.dead && st.team === 1 - team && dist(st, T) < 140 && g.canEngage(L.def, st)) near.push(st);
  if (!near.includes(T)) near.unshift(T);
  sw.members.forEach((m, i) => {
    if (!m.def.kamikaze) return;
    const t = near[i % near.length];
    if (!g.inLink(m, t)) return;
    m.order = ATTACK(t);
    m.target = t;
    n++;
  });
  return n;
}
