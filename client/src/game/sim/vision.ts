// What each side can see: vision circles, who is spotted (cover hides troops and guns), counter-battery
// radar, and the kill zone under armed enemy drones.
import { UA, RU, COVER, KILLZONE } from '../data';
import { hyp, dist } from '../dmath';
import type { Game } from './game';
import { killUnit } from './combat';

export function computeVision(g: Game) {
  g.vision = [[], []];
  for (const u of g.units)
    if (!u.dead && u.team >= 0) {
      const low = u.def.highAlt && !g.isHigh(u) && !u.landed && !u.grounded;
      g.vision[u.team].push({
        x: u.x,
        y: u.y,
        r: g.visionR(u),
        deep: low || undefined,
        kz: g.isKillZoneDrone(u) || undefined,
      });
    }
  for (const s of g.structs)
    if (!s.dead && s.build >= 1 && s.team >= 0)
      g.vision[s.team].push({
        x: s.x,
        y: s.y,
        r:
          s.def.vision *
          g.visMul(s.team) *
          g.visionMul(null) *
          (g.isNight() && s.type === 'radar' ? 1.4 : 1) *
          (s.type === 'radar' ? 0.3 + 0.7 * (s.pow ?? 1) : 1),
      });
  for (const u of g.units) {
    if (u.dead) continue;
    u.cover = u.def.air ? 'open' : u.def.troop && g.trenchAt(u.x, u.y) ? 'trench' : g.terrain.coverOf(u.x, u.y);
    if (!u.def.air) u.onRoad = g.terrain.onRoadAt(u.x, u.y);
    let hid = (u.def.troop || u.def.indirect) && u.cover !== 'open' ? COVER[u.cover].spot : 0;
    const mode = g.modeOf(u);
    // creeping troops are hard to spot even in the open; an FPV sitting in ambush is a lump in a field
    if (mode === 'creep') hid = hid ? Math.min(hid, 150) : 150;
    if (u.ambushed) hid = 60;
    u.seenBy[UA] = u.team === UA || (hid ? g.inVisionClose(UA, u.x, u.y, hid) : g.inVision(UA, u.x, u.y));
    u.seenBy[RU] = u.team === RU || (hid ? g.inVisionClose(RU, u.x, u.y, hid) : g.inVision(RU, u.x, u.y));
    // counter-battery: a gun that just fired, a jammer that is emitting, or a radar that is on is caught by any enemy radar post within 900
    if (((u.revealT && u.revealT > 0) || g.emitting(u)) && u.team >= 0) {
      const E = 1 - u.team;
      if (
        !u.seenBy[E] &&
        g.structs.some(s => !s.dead && s.build >= 1 && s.type === 'radar' && s.team === E && dist(s, u) < 900)
      )
        u.seenBy[E] = true;
    }
  }
}

/** troops and trucks in the open under an armed enemy drone bleed; a friendly net overhead or any cover stops it */
export function updateKillZone(g: Game, dt: number) {
  g.kzT -= dt;
  if (g.kzT > 0) return;
  g.kzT = KILLZONE.tick;
  const step = KILLZONE.tick;
  for (const T of [UA, RU]) if (g.kzWarnT[T] > 0) g.kzWarnT[T] -= step;
  let hit: [number, number] = [0, 0];
  for (const u of g.units) {
    if (u.dead || u.team < 0 || u.def.air || u.cover !== 'open') continue;
    const truck = u.type === 'truck';
    if (!u.def.troop && !truck) continue;
    const E = 1 - u.team,
      list = g.vision[E];
    let under = false;
    for (let i = 0; i < list.length && !under; i++) {
      const c = list[i];
      if (c.kz && hyp(c.x - u.x, c.y - u.y) <= c.r) under = true;
    }
    if (!under) continue;
    if (g.structs.some(n => !n.dead && n.build >= 1 && n.def.netR && n.team === u.team && dist(n, u) <= n.def.netR!))
      continue;
    u.hp -= (truck ? KILLZONE.truck : KILLZONE.troop) * step;
    u.lastHitBy = E;
    hit[u.team]++;
    if (g.rng.next() < 0.35)
      g.effects.push({
        kind: 'hit',
        x: u.x + g.rand(-6, 6),
        y: u.y + g.rand(-6, 6),
        t: 0,
        dur: 0.2,
        sub: 'kz',
        team: u.team,
      });
    if (u.hp <= 0) killUnit(g, u, false, E);
  }
  for (const T of [UA, RU])
    if (hit[T] && g.kzWarnT[T] <= 0) {
      g.kzWarnT[T] = 25;
      g.notify(
        T,
        'Kill zone: ' +
          hit[T] +
          ' of your ' +
          (hit[T] > 1 ? 'units are' : 'units is') +
          ' in the open under enemy drones and bleeding. Get into cover or under a net'
      );
    }
}
