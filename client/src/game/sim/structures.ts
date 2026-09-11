// Buildings each tick: construction, production queues and works heat, repair near workshops, hospitals,
// anti-drone nets, and jamming.
import { UA, UNITS } from '../data';
import { dist } from '../dmath';
import type { Unit, Struct } from '../types';
import type { Game } from './game';
import { IDLE, MOVE } from './orders';
import { planRoute } from './movement';
import { killUnit } from './combat';

export function updateStruct(g: Game, s: Struct, dt: number) {
  if (s.dead || s.civ) return;
  if (s.build < 1) {
    s.build += dt / s.def.time;
    s.hp = Math.min(s.def.hp, s.hp + (s.def.hp * 0.9 * dt) / s.def.time);
    if (s.build >= 1) {
      s.build = 1;
      g.notify(s.team, s.def.label + ' ready');
    }
    return;
  }
  if (s.def.heatPer) {
    s.heat = Math.max(0, s.heat - (s.def.cool || 0) * dt);
    if (s.overheated && s.heat < 35) {
      s.overheated = false;
      g.notify(s.team, s.def.label + ' cooled down: backlog moving');
    }
  }
  if (s.queue.length) {
    const d = UNITS[s.queue[0]];
    if (!(s.overheated && d.air)) s.progress += dt * (s.pow ?? 1);
    if (s.progress >= d.time) {
      s.progress = 0;
      spawnFromFactory(g, s, s.queue.shift()!);
      if (s.def.heatPer && d.air) {
        s.heat += s.def.heatPer;
        if (s.heat >= 100) {
          s.heat = 100;
          s.overheated = true;
          g.notify(s.team, s.def.label + ' overheated: production backlog until it cools');
        }
      }
    }
  }
}

export function spawnFromFactory(g: Game, s: Struct, type: string) {
  const dir = s.team === UA ? -1 : 1;
  const u = g.makeUnit(type, s.team, s.x + g.rand(-14, 14), s.y + dir * (s.r + 16));
  u.order = MOVE(s.rally.x + g.rand(-24, 24), s.rally.y + g.rand(-24, 24));
  planRoute(g, u, u.order.x, u.order.y);
  if (g.needsOperator(u.def, s.team)) {
    let best: Unit | null = null,
      bd = Infinity;
    for (const op of g.operatorsOf(s.team)) {
      if (g.droneCount(op) >= g.opCapOf(op)) continue;
      const dd = dist(op, s);
      if (dd < bd) {
        bd = dd;
        best = op;
      }
    }
    if (best) g.linkDrone(u, best);
    else {
      u.grounded = true;
      u.order = IDLE();
      u.x = s.x + g.rand(-40, 40);
      u.y = s.y + (s.team === UA ? -1 : 1) * (s.r + 30 + g.rand(0, 30));
    }
  }
  // small battery quads wait out the snow on the ground beside the works
  if (u.def.air && u.def.electric && !u.def.large && g.quadsGrounded()) {
    u.landed = true;
    u.rechargeT = 5;
    u.batt = u.def.endurance;
    u.order = IDLE();
  }
  g.units.push(u);
  g.stats.built[s.team]++;
  if (u.def.air) g.stats.drones[s.team]++;
}

export function updateHealing(g: Game, dt: number) {
  // workshops: vehicles parked by the armor plant or headquarters are patched up; a quiet building mends itself slowly
  for (const u of g.units) {
    if (u.dead || u.team < 0 || u.def.air || u.def.troop || u.def.auto || u.hp >= u.def.hp) continue;
    if (
      !g.structs.some(
        s =>
          !s.dead &&
          s.team === u.team &&
          s.build >= 1 &&
          (s.type === 'armorPlant' || s.type === 'hq') &&
          dist(s, u) < s.r + 120
      )
    )
      continue;
    u.hp = Math.min(u.def.hp, u.hp + u.def.hp * 0.02 * dt);
    if (g.rng.next() < dt * 1.2) g.effects.push({ kind: 'heal', x: u.x + g.rand(-8, 8), y: u.y - 10, t: 0, dur: 0.8 });
  }
  for (const s of g.structs) {
    if (s.dead || s.civ || s.team < 0 || s.build < 1 || s.def.trench || s.hp >= s.def.hp) continue;
    if (g.units.some(e => !e.dead && e.team === 1 - s.team && !e.def.auto && dist(e, s) < 420)) continue;
    s.hp = Math.min(s.def.hp, s.hp + s.def.hp * 0.004 * dt);
  }
  for (const st of g.structs) {
    if (st.dead || !st.def.heal || st.build < 1) continue;
    const team = st.civ ? st.nation : st.team;
    for (const u of g.units) {
      if (u.dead || u.team !== team || !u.def.troop || u.hp >= u.def.hp) continue;
      if (dist(u, st) > st.def.heal) continue;
      u.hp = Math.min(
        u.def.hp,
        u.hp +
          u.def.hp *
            (st.def.healRate || 0) *
            (g.upgrades[team!].medevac ? 2 : 1) *
            g.supply[team!].food *
            (st.civ ? 1 : (st.pow ?? 1)) *
            dt
      );
      if (g.rng.next() < dt * 1.5) g.effects.push({ kind: 'heal', x: u.x + g.rand(-6, 6), y: u.y - 8, t: 0, dur: 0.8 });
    }
  }
}

export function updateNets(g: Game, _dt: number) {
  const nets: Struct[] = [];
  for (const s of g.structs) if (!s.dead && s.build >= 1 && s.def.netR) nets.push(s);
  if (!nets.length) return;
  for (const u of g.units) {
    if (u.dead || !u.def.netted || u.landed || u.ambushed) continue;
    for (const n of nets) {
      if (n.team === u.team || u.netsSeen.includes(n.id)) continue;
      if (dist(u, n) <= n.def.netR!) {
        u.netsSeen.push(n.id);
        if (g.rng.next() < 0.85) {
          g.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.5 });
          killUnit(g, u, true, n.team);
          break;
        }
      }
    }
  }
}

export function updateJamming(g: Game, dt: number) {
  const src: { x: number; y: number; r: number; team: number }[] = [];
  for (const u of g.units)
    if (!u.dead && u.def.jam && g.modeOf(u) !== 'silent') src.push({ x: u.x, y: u.y, r: u.def.jam, team: u.team });
  for (const s of g.structs)
    if (!s.dead && s.build >= 1 && s.def.jam && (s.pow ?? 1) >= 0.5)
      src.push({ x: s.x, y: s.y, r: s.def.jam, team: s.team });
  if (!src.length) return;
  for (const u of g.units) {
    if (u.dead || !u.def.air || !u.def.jammable || u.landed || u.ambushed) continue;
    for (const j of src) {
      if (j.team === u.team) continue;
      if (dist(u, j) <= j.r + (g.upgrades[j.team].ewPlus ? 60 : 0)) {
        u.hp -= 30 * (g.upgrades[u.team].freqHop ? 0.5 : 1) * dt;
        u.jamT = 0.2;
        if (u.hp <= 0) {
          g.stats.jammed[u.team]++;
          killUnit(g, u, false, j.team);
          break;
        }
      }
    }
  }
}
