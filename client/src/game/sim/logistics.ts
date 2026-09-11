// Trucks: supply runs to held towns, grain and oil from the sites, trade convoys to the border and back,
// ammunition trucks for the guns, capture of unescorted trucks, and the pumping stations' repair crews.
import { UA, RU, UNITS, TRUCK_LOAD, TRUCK_PERIOD, TEAMS, SCORE } from '../data';
import { W } from '../map';
import { hyp, dist } from '../dmath';
import type { Unit, Struct, Site, Pt } from '../types';
import type { Game } from './game';
import { MOVE } from './orders';
import { planRoute, stepMove } from './movement';
import { killUnit } from './combat';

/** artillery shells: slow refill beside the depot or headquarters, trucks for guns in the field */
export function updateAmmo(g: Game, dt: number) {
  g.ammoT -= dt;
  if (g.ammoT > 0) return;
  g.ammoT = 4;
  for (const T of [UA, RU]) {
    let needy: Unit | null = null,
      worst = 0.5;
    for (const u of g.units) {
      if (u.dead || u.team !== T || !u.def.ammo) continue;
      const max = u.def.ammo;
      if (
        u.ammo! < max &&
        g.structs.some(
          s =>
            !s.dead && s.team === T && s.build >= 1 && (s.type === 'artyDepot' || s.type === 'hq') && dist(s, u) < 140
        )
      ) {
        u.ammo = Math.min(max, u.ammo! + 1);
        u.ammoWarned = false;
        continue;
      }
      if (u.ammoTruckId !== undefined && g.find(u.ammoTruckId)) continue;
      u.ammoTruckId = undefined;
      const frac = u.ammo! / max;
      if (frac < worst) {
        worst = frac;
        needy = u;
      }
    }
    if (needy) spawnAmmoTruck(g, T, needy);
  }
}

export function spawnAmmoTruck(g: Game, team: number, gun: Unit) {
  const hq = g.hq(team);
  if (!hq || g.freePeople(team) < g.crewOf(UNITS.truck, team)) return;
  const u = g.makeUnit('truck', team, hq.x + g.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
  u.cargo = 'ammo';
  u.value = 150;
  u.dest = gun;
  u.order = MOVE(gun.x + g.rand(-20, 20), gun.y + g.rand(-20, 20));
  planRoute(g, u, u.order.x, u.order.y);
  g.units.push(u);
  gun.ammoTruckId = u.id;
  g.notify(team, 'Ammunition truck leaving for the ' + gun.def.label[team].toLowerCase());
}

export function updateDepots(g: Game, dt: number) {
  for (const d of g.depots.concat(g.resources)) {
    if (d.burnT > 0) d.burnT -= dt;
    let a = 0,
      b = 0;
    const first: (Unit | null)[] = [null, null];
    for (const u of g.units) {
      if (u.dead || !u.def.canCapture) continue;
      if (dist(u, d) <= d.r) {
        if (u.team === UA) a++;
        else b++;
        if (!first[u.team]) first[u.team] = u;
      }
    }
    let team = -1;
    if (a > 0 && b === 0) team = UA;
    else if (b > 0 && a === 0) team = RU;
    if (team >= 0 && d.owner !== team) {
      if (d.capTeam !== team) {
        d.capTeam = team;
        d.cap = 0;
      }
      d.cap += dt;
      if (d.cap >= 5) {
        const was = d.owner;
        d.owner = team;
        d.cap = 0;
        d.capTeam = -1;
        d.supplyT = 6;
        g.notify(team, d.name + ' captured');
        if (was >= 0) {
          g.notify(
            was,
            d.name + ' lost' + (d.kind === 'gas' ? ': gas income falls' : d.kind === 'wheat' ? ': fewer recruits' : '')
          );
          g.alert(was, d.x, d.y, d.name + ' lost');
        }
        g.addLog(team, 'capture', TEAMS[team].name + ' captured ' + d.name);
        g.stats.score[team] += SCORE.capture;
        g.capturesN[team]++;
        const cap = first[team];
        if (cap) {
          g.bark('capture', cap);
          const friend = g.units.find(
            o => o !== cap && !o.dead && o.team === team && o.def.troop && dist(o, cap) < 220
          );
          if (friend) g.bark('reply', friend, 0.9);
        }
      }
    } else {
      d.cap = Math.max(0, d.cap - dt);
      if (d.cap === 0) d.capTeam = -1;
    }
    if (d.owner >= 0 && (!d.isRes || d.burnT <= 0)) {
      d.supplyT -= dt;
      if (d.supplyT <= 0) {
        d.supplyT = TRUCK_PERIOD;
        spawnTruck(g, d.owner, d);
      }
    }
  }
  for (const ps of g.pumpSites) {
    if (ps.struct && !ps.struct.dead) continue;
    ps.rebuildT -= dt;
    if (ps.rebuildT > 0) continue;
    const enemyNear = g.units.some(
      u => !u.dead && u.team === 1 - ps.team && !u.def.air && !u.def.auto && dist(u, ps) < 250
    );
    if (enemyNear) continue;
    ps.struct = g.makeStruct('pump', ps.team, ps.x, ps.y, false);
    g.structs.push(ps.struct);
    g.notify(ps.team, 'Repair crews are rebuilding the pumping station');
  }
}

export function spawnTruck(g: Game, team: number, d: Site) {
  const hq = g.hq(team);
  if (!hq || g.freePeople(team) < g.crewOf(UNITS.truck, team)) return;
  if (d.isRes) {
    const u = g.makeUnit('truck', team, d.x + g.rand(-20, 20), d.y + g.rand(-20, 20));
    u.cargo = d.kind === 'wheat' ? 'grain' : 'oil';
    u.src = d;
    u.dest = hq;
    u.order = MOVE(hq.x + g.rand(-30, 30), hq.y + (team === UA ? -(hq.r + 24) : hq.r + 24));
    planRoute(g, u, u.order.x, u.order.y);
    g.units.push(u);
    return;
  }
  const u = g.makeUnit('truck', team, hq.x + g.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
  u.cargo = 'supply';
  u.dest = d;
  u.order = MOVE(d.x + g.rand(-20, 20), d.y + g.rand(-20, 20));
  planRoute(g, u, u.order.x, u.order.y);
  g.units.push(u);
}

/** where a side's trade convoys leave the map: Ukraine west, Russia east */
export function tradeEdge(g: Game, team: number): Pt {
  const [ua, ru] = g.map.tradeEdges;
  return team === UA ? { x: 12, y: g.map.geo(ua[0], ua[1]).y } : { x: W - 12, y: g.map.geo(ru[0], ru[1]).y };
}

export function truckValue(u: Unit): number {
  return u.value != null
    ? u.value
    : u.cargo === 'oil'
      ? 120
      : u.cargo === 'grain'
        ? 60
        : u.cargo === 'aid'
          ? 100
          : TRUCK_LOAD;
}

export function spawnTradeConvoy(g: Game, team: number) {
  const hq = g.hq(team);
  if (!hq || g.freePeople(team) < g.crewOf(UNITS.truck, team)) return;
  const u = g.makeUnit('truck', team, hq.x + g.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
  u.cargo = 'export';
  u.value = 80 + 40 * g.wheatHeld(team) + 40 * g.resources.filter(r => r.kind === 'gas' && r.owner === team).length;
  const edge = tradeEdge(g, team);
  u.dest = edge;
  u.order = MOVE(edge.x, edge.y);
  planRoute(g, u, edge.x, edge.y);
  g.units.push(u);
  g.notify(
    team,
    'Trade convoy leaving for ' +
      (team === UA ? 'the NATO border' : 'the Russian interior') +
      ' with ' +
      u.value +
      ' worth of grain and gas'
  );
}

export function updateTrade(g: Game, dt: number) {
  for (const T of [UA, RU]) {
    g.tradeT[T] -= dt;
    if (g.tradeT[T] <= 0) {
      g.tradeT[T] = 75;
      spawnTradeConvoy(g, T);
    }
  }
  for (const u of g.units) {
    if (u.dead || u.type !== 'truck') continue;
    const E = 1 - u.team;
    const captor = g.units.find(o => !o.dead && o.team === E && o.def.troop && dist(o, u) < 45);
    if (!captor) continue;
    if (g.units.some(o => !o.dead && o.team === u.team && !o.def.air && !o.def.auto && dist(o, u) < 120)) continue;
    const val = truckValue(u),
      loser = u.team;
    u.team = E;
    u.seenBy = [E === UA, E === RU];
    u.cargo = 'captured';
    u.value = val;
    u.src = null;
    u.detour = null;
    u.path = null;
    const hq = g.hq(E);
    if (!hq) {
      killUnit(g, u, true);
      continue;
    }
    u.dest = hq;
    u.order = MOVE(hq.x + g.rand(-30, 30), hq.y + (E === UA ? -(hq.r + 24) : hq.r + 24));
    planRoute(g, u, u.order.x, u.order.y);
    g.captured[E]++;
    g.addLog(E, 'truck', TEAMS[E].name + ' captured a truck worth ' + val + ' near ' + g.map.nearestPlace(u.x, u.y));
    g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8, green: true });
    g.notify(E, 'Captured an enemy truck carrying ' + val + ' worth of supplies: it is driving to your headquarters');
    g.notify(loser, 'Your truck was captured');
  }
}

export function updateTruck(g: Game, u: Unit, dt: number) {
  const px = u.x,
    py = u.y;
  const dest = u.dest as ((Struct | Site | Pt) & { dead?: boolean; r?: number; owner?: number }) | null;
  if (u.cargo === 'export' || u.cargo === 'aid' || u.cargo === 'captured') {
    if (!dest || dest.dead) {
      killUnit(g, u, true);
      return;
    }
    stepMove(g, u, u.order.x, u.order.y, dt);
    if (hyp(u.x - px, u.y - py) < 0.15) {
      u.stuck = (u.stuck || 0) + dt;
      if (u.stuck > 12) {
        killUnit(g, u, true);
        return;
      }
    } else u.stuck = 0;
    const arriveR = u.cargo === 'export' ? 30 : (dest.r || 0) + 40;
    if (dist(u, dest) < arriveR) {
      if (u.cargo === 'export') {
        g.funds[u.team] += (u.value || 0) * g.teamMul(u.team) * g.logiMul(u.team);
        g.tradeTotal[u.team] += Math.round((u.value || 0) * g.logiMul(u.team));
        g.notify(u.team, 'Trade convoy crossed the border: +' + u.value + ' funds. Supplies are on the way back.');
        const hq = g.hq(u.team);
        if (hq) {
          const back = g.makeUnit('truck', u.team, u.x, u.y);
          back.cargo = 'aid';
          back.value = 100;
          back.dest = hq;
          back.order = MOVE(hq.x + g.rand(-30, 30), hq.y + (u.team === UA ? -(hq.r + 24) : hq.r + 24));
          planRoute(g, back, back.order.x, back.order.y);
          g.units.push(back);
        }
      } else {
        g.funds[u.team] += (u.value || 0) * g.teamMul(u.team) * g.logiMul(u.team);
        g.stats.deliveries[u.team]++;
        g.effects.push({
          kind: 'text',
          x: u.x,
          y: u.y - 14,
          t: 0,
          dur: 1.2,
          team: u.team,
          text: (u.cargo === 'aid' ? 'aid: +' : 'captured: +') + u.value,
        });
      }
      g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
      killUnit(g, u, true);
    }
    return;
  }
  const stuckCheck = () => {
    if (hyp(u.x - px, u.y - py) < 0.15) {
      u.stuck = (u.stuck || 0) + dt;
      if (u.stuck > 10) {
        killUnit(g, u, true);
        return true;
      }
    } else u.stuck = 0;
    return false;
  };
  if (u.cargo === 'ammo') {
    const gun = dest as Unit | null;
    if (!gun || gun.dead) {
      killUnit(g, u, true);
      return;
    }
    if (hyp(gun.x - u.order.x, gun.y - u.order.y) > 60) {
      u.order = MOVE(gun.x, gun.y);
      planRoute(g, u, gun.x, gun.y);
    }
    stepMove(g, u, u.order.x, u.order.y, dt);
    if (stuckCheck()) return;
    if (dist(u, gun) < 80) {
      let n = 0;
      for (const o of g.units)
        if (!o.dead && o.team === u.team && o.def.ammo && dist(o, u) < 120) {
          o.ammo = o.def.ammo;
          o.ammoWarned = false;
          o.ammoTruckId = undefined;
          n++;
        }
      g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
      g.effects.push({
        kind: 'text',
        x: u.x,
        y: u.y - 14,
        t: 0,
        dur: 1.2,
        team: u.team,
        text: 'shells for ' + n + ' gun' + (n === 1 ? '' : 's'),
      });
      killUnit(g, u, true);
    }
    return;
  }
  if (u.cargo === 'grain' || u.cargo === 'oil') {
    if (!dest || dest.dead) {
      killUnit(g, u, true);
      return;
    }
    stepMove(g, u, u.order.x, u.order.y, dt);
    if (stuckCheck()) return;
    if (dist(u, dest) < (dest.r || 0) + 40) {
      const mul = g.teamMul(u.team);
      if (u.cargo === 'grain') {
        g.people[u.team].total = Math.min(200, g.people[u.team].total + 3);
        if (u.team === UA) g.support = Math.min(100, g.support + 2);
        g.funds[u.team] += 30 * mul * g.logiMul(u.team);
      } else g.funds[u.team] += 120 * mul * g.logiMul(u.team);
      g.stats.deliveries[u.team]++;
      g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
      g.effects.push({
        kind: 'text',
        x: u.x,
        y: u.y - 14,
        t: 0,
        dur: 1.2,
        team: u.team,
        text: u.cargo === 'grain' ? 'grain: +3 recruits' : 'oil: +120',
      });
      killUnit(g, u, true);
    }
    return;
  }
  if (!dest || dest.owner !== u.team) {
    killUnit(g, u, true);
    return;
  }
  stepMove(g, u, u.order.x, u.order.y, dt);
  if (stuckCheck()) return;
  if (dist(u, dest) < 40) {
    g.funds[u.team] += TRUCK_LOAD * g.teamMul(u.team) * g.logiMul(u.team);
    g.stats.deliveries[u.team]++;
    g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
    g.effects.push({ kind: 'text', x: u.x, y: u.y - 14, t: 0, dur: 1.2, team: u.team, text: '+' + TRUCK_LOAD });
    killUnit(g, u, true);
  }
}
