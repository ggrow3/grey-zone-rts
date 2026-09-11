// Morale, civilian traffic between the sites, Ukraine's international support, defections, and volunteers.
import { UA, RU, UNITS } from '../data';
import { dist, clamp } from '../dmath';
import type { Unit, Struct } from '../types';
import type { Game } from './game';
import { IDLE, MOVE } from './orders';
import { planRoute, stepMove } from './movement';
import { killUnit } from './combat';

export function updateMorale(g: Game, dt: number) {
  const towns = [g.depots.filter(d => d.owner === UA).length, g.depots.filter(d => d.owner === RU).length];
  const hqs = [g.hq(UA), g.hq(RU)];
  for (const u of g.units) {
    if (u.dead || !u.def.morale) continue;
    if (u.morale === undefined) u.morale = 90;
    const losing = towns[u.team] < towns[1 - u.team];
    let dm = losing ? -(u.def.moraleLoss || 0) : 0.3;
    if ((u.rations ?? 1) <= 0) dm -= 0.8;
    if (u.def.upkeep) {
      const pay = u.def.upkeep * dt;
      if (g.funds[u.team] >= pay) g.funds[u.team] -= pay;
      else dm -= 1.5;
    }
    const hq = hqs[u.team];
    if (
      (hq && dist(u, hq) < 260) ||
      g.structs.some(
        st =>
          !st.dead && st.def.heal && (st.civ ? st.nation === u.team : st.team === u.team) && dist(u, st) < st.def.heal!
      )
    )
      dm += 0.8;
    u.morale = clamp(u.morale + dm * dt, 0, 100);
    if (u.morale <= 0) {
      g.notify(
        u.team,
        UNITS[u.type].label[u.team] + (u.type === 'merc' ? ' walked off the job' : ' broke and is gone')
      );
      killUnit(g, u, true);
      continue;
    }
    if (u.morale < 30 && !u.shaken) {
      u.shaken = true;
      u.target = null;
      if (hq) {
        u.order = MOVE(hq.x + g.rand(-60, 60), hq.y + (u.team === UA ? -160 : 160));
        planRoute(g, u, u.order.x, u.order.y);
      }
      g.notify(u.team, UNITS[u.type].label[u.team] + ' shaken: falling back and not taking orders');
    } else if (u.morale > 50 && u.shaken) u.shaken = false;
  }
}

export function civSites(g: Game, nation: number): Struct[] {
  return g.structs.filter(s => s.civ && s.nation === nation && !s.dead);
}

export function spawnCivCar(g: Game, nation: number) {
  const sites = civSites(g, nation);
  if (sites.length < 2) return;
  const a = g.rng.pick(sites);
  const u = g.makeUnit('civcar', -1, a.x + g.rand(-30, 30), a.y + g.rand(-30, 30));
  u.nation = nation;
  u.waitT = g.rand(1, 4);
  u.seenBy = [false, false];
  g.units.push(u);
}

export function updateCivCar(g: Game, u: Unit, dt: number) {
  if (u.waitT! > 0) {
    u.waitT! -= dt;
    return;
  }
  const dest = u.dest as Struct | null;
  if (!dest || dest.dead) {
    const sites = civSites(g, u.nation!).filter(sx => dist(sx, u) > 60);
    if (!sites.length) {
      u.waitT = 5;
      return;
    }
    const d = g.rng.pick(sites);
    u.dest = d;
    u.order = MOVE(d.x + g.rand(-30, 30), d.y + g.rand(-30, 30));
    planRoute(g, u, u.order.x, u.order.y);
  }
  stepMove(g, u, u.order.x, u.order.y, dt);
  if (dist(u, u.order) < 8) {
    u.dest = null;
    u.waitT = g.rand(3, 9);
  }
}

export function updateCivilians(g: Game, dt: number) {
  g.support = Math.min(100, g.support + 0.05 * dt);
  g.carT -= dt;
  if (g.carT <= 0) {
    g.carT = 25;
    for (const nation of [0, 1])
      if (g.units.filter(u => u.type === 'civcar' && u.nation === nation && !u.dead).length < 3) spawnCivCar(g, nation);
  }
  g.defectT -= dt;
  if (g.defectT <= 0) {
    g.defectT = 1;
    if (g.support >= 70)
      for (const u of g.units) {
        if (u.dead || u.team !== RU || (u.type !== 'infantry' && u.type !== 'moto')) continue;
        const friendNear =
          g.units.some(o => o !== u && !o.dead && o.team === RU && !o.def.air && !o.def.auto && dist(o, u) < 220) ||
          g.structs.some(st => !st.dead && st.team === RU && dist(st, u) < 300);
        if (friendNear) continue;
        const uaNear =
          g.units.some(o => !o.dead && o.team === UA && !o.def.air && !o.def.auto && dist(o, u) < 200) ||
          g.depots.some(d => d.owner === UA && dist(d, u) < 120);
        if (uaNear && u.hp < u.def.hp * 0.7 && g.rng.next() < 0.02)
          defect(g, u, 'A cut-off Russian squad surrendered and joined Ukraine.');
      }
  }
  g.volunteerT -= dt;
  if (g.volunteerT <= 0) {
    g.volunteerT = 75;
    const held = g.depots.filter(d => d.owner === UA && g.map.volunteerTowns.includes(d.name));
    if (held.length && g.support >= 70) {
      const d = g.rng.pick(held);
      const u = g.makeUnit('defector', UA, d.x + g.rand(-30, 30), d.y + g.rand(-30, 30));
      g.units.push(u);
      g.civ.defectors++;
      g.people[UA].total += UNITS.defector.crew;
      g.notify(-1, 'Russian volunteers joined Ukraine at ' + d.name + '.');
    }
  }
}

export function defect(g: Game, u: Unit, text: string) {
  if (u.drones) {
    for (const dr of u.drones) dr.operator = null;
    u.drones = [];
  }
  u.team = UA;
  u.type = 'defector';
  u.def = UNITS.defector;
  u.hp = Math.min(u.def.hp, u.hp + 30);
  u.order = IDLE();
  u.target = null;
  u.seenBy = [true, false];
  u.angle = -Math.PI / 2;
  g.civ.defectors++;
  g.people[UA].total += UNITS.defector.crew;
  g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8, green: true });
  g.notify(-1, text);
  g.addLog(-1, 'defect', text);
}
