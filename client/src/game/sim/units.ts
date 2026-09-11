// One unit's tick: batteries and landing, the link to its squad, ambush, digging, shoot-and-scoot,
// fire missions, target acquisition, carrying out its order, shooting, and (for kamikaze drones) the dive.
import { DIG_TIME, PILOT, SQUAD_SWAP } from '../data';
import { hyp, dist, datan2 } from '../dmath';
import type { Unit, Entity } from '../types';
import type { Game } from './game';
import { IDLE, MOVE, ATTACK } from './orders';
import { rOf } from './entity';
import { updateTruck } from './logistics';
import { planRoute, stepMove, moveToward, moveAway } from './movement';
import {
  acquireFor,
  acquirePreferred,
  fireAt,
  launchShell,
  launchShellAt,
  damageArea,
  killUnit,
  explosionFx,
} from './combat';
import { updateCivCar } from './civilians';

export function updateUnit(g: Game, u: Unit, dt: number) {
  if (u.dead) return;
  const d = u.def;
  u.cool -= dt;
  if (u.jamT > 0) u.jamT -= dt;
  if (u.revealT && u.revealT > 0) u.revealT -= dt;
  if (u.grief && u.grief > 0) u.grief -= dt;
  if (u.pilotT && u.pilotT > 0) {
    u.pilotT -= dt;
    if (u.pilotT <= 0) {
      u.pilotT = 0;
      u.diveAt = null;
    }
  }
  if (u.target && u.target.dead) u.target = null;
  if (u.order.kind === 'attack' && (!u.order.target || u.order.target.dead)) u.order = IDLE();
  const range = g.rangeOf(u),
    minR = d.minRange || 0;

  if (d.civ) {
    updateCivCar(g, u, dt);
    return;
  }
  if (d.auto) {
    updateTruck(g, u, dt);
    return;
  }
  if (u.grounded) {
    if (!g.needsOperator(d, u.team)) {
      u.grounded = false;
    } else if (g.relink(u)) {
      u.grounded = false;
      g.notify(u.team, d.label[u.team] + ' has an operator and is airborne');
    } else return;
  }
  if (d.endurance) {
    if (u.batt === undefined) u.batt = d.endurance;
    if (u.landed) {
      u.rechargeT! -= dt * (u.team >= 0 && g.supply[u.team].power < 1 ? 1 / 3 : 1);
      if (u.rechargeT! <= 0 && !(g.quadsGrounded() && d.electric && !d.large)) {
        u.landed = false;
        u.batt = d.endurance;
        u.grace = 0;
      }
      return;
    }
    const diving = (d.kamikaze && u.target && !u.target.dead) || u.ambushed;
    if (!diving) u.batt -= dt * (g.weather.kind === 'rain' ? 1.5 : g.weather.kind === 'snow' ? 2 : 1);
    if (!diving && u.batt < d.endurance * 0.25) {
      const spot = g.landingSpot(u);
      if (!spot) {
        if (u.batt <= 0) {
          g.crashDrone(u, 'battery flat, nowhere to land');
          return;
        }
      } else {
        const dd = dist(u, spot);
        if (dd < 50) {
          u.landed = true;
          // a squad swaps the battery by hand, faster than the works
          u.rechargeT = (d.recharge || 30) * (spot.isUnit && spot.def.troop ? SQUAD_SWAP : 1);
          u.order = IDLE();
          u.target = null;
          g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6 });
          return;
        }
        if (u.batt <= 0) {
          u.grace = (u.grace || 0) + dt;
          if (u.grace > 30) {
            g.crashDrone(u, 'battery flat before it got home');
            return;
          }
        }
        if (!u.order || u.order.kind !== 'move' || hyp(u.order.x - spot.x, u.order.y - spot.y) > 40) {
          u.order = MOVE(spot.x, spot.y);
          u.target = null;
        }
        moveToward(g, u, spot.x, spot.y, dt);
        return;
      }
    }
  }
  if (g.needsOperator(d, u.team)) {
    if (!u.operator || u.operator.dead) {
      u.operator = null;
      if (!g.relink(u)) {
        u.lostT = (u.lostT || 0) + dt;
        if (u.lostT > (g.upgrades[u.team].auto1 ? 10 : 4) && !(d.kamikaze && u.target && !u.target.dead)) {
          u.grounded = true;
          u.order = IDLE();
          u.target = null;
          u.lostT = 0;
          g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8 });
          g.notify(u.team, d.label[u.team] + ' landed: its squad is gone, it waits for another');
          return;
        }
      } else u.lostT = 0;
    } else {
      const R = g.linkRange(u),
        dd = dist(u, u.operator);
      if (dd > R && !(d.kamikaze && u.target && !u.target.dead) && !g.relayNear(u.team, u)) {
        const k = (R * 0.85) / dd;
        u.order = MOVE(u.operator.x + (u.x - u.operator.x) * k, u.operator.y + (u.y - u.operator.y) * k);
        u.target = null;
      }
    }
  }
  // an FPV in ambush sits with the motors off until something worth a warhead comes close
  if (u.ambushed) {
    if (g.modeOf(u) !== 'ambush' || g.piloted(u) || u.order.kind !== 'idle') u.ambushed = false;
    else {
      const t = acquireFor(g, u, PILOT.ambushReach, 0);
      if (t && g.inLink(u, t)) {
        u.ambushed = false;
        u.target = t;
        u.order = ATTACK(t);
        g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, red: true, team: u.team });
        g.notify(
          u.team,
          'Ambush sprung near ' +
            g.map.nearestPlace(u.x, u.y) +
            ': ' +
            d.label[u.team] +
            ' pouncing on a ' +
            (t.isStruct ? t.def.label.toLowerCase() : t.def.label[t.team].toLowerCase())
        );
      } else return;
    }
  } else if (d.kamikaze && g.modeOf(u) === 'ambush' && !u.target && u.order.kind === 'idle' && !g.piloted(u)) {
    u.ambushed = true;
    g.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, team: u.team });
    return;
  }
  if (d.kamikaze) {
    updateKamikaze(g, u, dt);
    return;
  }

  if (u.salvoLeft > 0) {
    if (u.salvoAt) {
      u.salvoT -= dt;
      if (u.salvoT <= 0) {
        launchShellAt(g, u, u.salvoAt.x, u.salvoAt.y, u.salvoAt.spread);
        u.salvoLeft--;
        u.salvoT = 0.18;
      }
    } else if (!u.target || u.target.dead) u.salvoLeft = 0;
    else {
      u.salvoT -= dt;
      if (u.salvoT <= 0) {
        launchShell(g, u, u.target);
        u.salvoLeft--;
        u.salvoT = 0.18;
      }
    }
  }
  if (u.order.kind === 'dig') {
    u.digT = (u.digT === undefined ? DIG_TIME : u.digT) - dt;
    u.target = null;
    if (u.digT <= 0) {
      u.digT = undefined;
      if (!g.trenchAt(u.x, u.y)) {
        const tr = g.makeStruct('trench', u.team, u.x, u.y, true);
        tr.hp = tr.def.hp;
        g.structs.push(tr);
        g.notify(u.team, 'Trench dug');
        g.bark('dig', u);
      }
      u.order = IDLE();
    }
    return;
  }
  u.digT = undefined;
  // shoot and scoot: after a fire mission the gun displaces before it fires again
  if (d.indirect && g.modeOf(u) === 'scoot') {
    if (u.scootPending && u.salvoLeft <= 0) {
      u.scootPending = false;
      u.scoot = g.scootPoint(u);
      g.effects.push({ kind: 'mark', x: u.scoot.x, y: u.scoot.y, t: 0, dur: 0.6, team: u.team });
    }
    if (u.scoot) {
      if (dist(u, u.scoot) < 8) u.scoot = null;
      else {
        moveToward(g, u, u.scoot.x, u.scoot.y, dt);
        u.target = null;
        return;
      }
    }
  } else {
    u.scoot = null;
    u.scootPending = false;
  }
  if (u.order.kind === 'bombard' && d.indirect) {
    const dd = dist(u, u.order);
    if (dd > range) moveToward(g, u, u.order.x, u.order.y, dt);
    else if (minR && dd < minR) moveAway(u, u.order, dt);
    else if (u.cool <= 0 && hasAmmo(g, u)) {
      const vis = acquireFor(g, u, range, minR);
      if (vis && vis.isUnit) fireAt(g, u, vis);
      else {
        u.cool = d.rof || 1;
        u.angle = datan2(u.order.y - u.y, u.order.x - u.x);
        const spread = g.inVision(u.team, u.order.x, u.order.y) ? 1 : 2.4;
        launchShellAt(g, u, u.order.x, u.order.y, spread);
        if (d.salvo) {
          u.salvoLeft = d.salvo - 1;
          u.salvoT = 0.18;
          u.salvoAt = { x: u.order.x, y: u.order.y, spread };
        }
      }
    }
    u.target = null;
    return;
  }
  u.salvoAt = null;

  const mode = g.modeOf(u),
    piloted = g.piloted(u);
  let tgt: Entity | null = null;
  if (u.order.kind === 'attack') tgt = u.order.target;
  else if (d.dmg > 0) {
    // a guarding interceptor only looks a short way out; a piloted drone shoots what its pilot brings it to
    let hunt = d.acquire ? (d.acquire + (g.upgrades[u.team].repeaters ? 120 : 0)) * (d.air ? g.huntMul() : 1) : range;
    if (mode === 'guard') hunt = Math.min(hunt, PILOT.guardReach);
    if (piloted) hunt = range;
    if (u.target && dist(u, u.target) <= Math.max(range, hunt) && g.canSee(u, u.target)) tgt = u.target;
    else tgt = acquireFor(g, u, u.order.kind === 'idle' || u.order.amove ? hunt : range, minR);
    if (tgt && mode === 'guard' && u.post && dist(tgt, u.post) > PILOT.guardReach + 60) tgt = null;
  }
  u.target = tgt;

  if (u.order.kind === 'move' && u.order.amove && tgt) {
    // attack-move: stand and fight what is in reach, close a little on it, carry on when it is gone
    const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
    if (dd > range * 0.9 && d.acquire) moveToward(g, u, tgt.x, tgt.y, dt);
    else if (minR && dd < minR) moveAway(u, tgt, dt);
  } else if (u.order.kind === 'move') {
    const dd = dist(u, u.order);
    const last = stepMove(g, u, u.order.x, u.order.y, dt);
    if ((last === true && dd < 6) || last === 'stalled') {
      const am = u.order.amove;
      u.order = IDLE();
      u.path = null;
      nextWaypoint(g, u, am);
    }
  } else if (u.order.kind === 'attack' && tgt) {
    const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
    if (dd > range * 0.9) moveToward(g, u, tgt.x, tgt.y, dt);
    else if (minR && dd < minR) moveAway(u, tgt, dt);
  } else if (u.order.kind === 'idle' && tgt) {
    const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
    if (d.acquire && dd > range * 0.9 && !piloted) moveToward(g, u, tgt.x, tgt.y, dt);
    else if (minR && dd < minR) moveAway(u, tgt, dt);
  } else if (u.order.kind === 'idle') {
    if (mode === 'guard' && u.post && dist(u, u.post) > 30) moveToward(g, u, u.post.x, u.post.y, dt);
    else if (mode === 'escort') {
      // a fire group on escort shadows the nearest friendly truck
      let tr: Unit | null = null,
        bd = 700;
      for (const o of g.units) {
        if (o.dead || o.team !== u.team || o.type !== 'truck') continue;
        const dd = dist(o, u);
        if (dd < bd) {
          bd = dd;
          tr = o;
        }
      }
      if (tr && bd > 34) moveToward(g, u, tr.x, tr.y, dt);
    }
  }

  if (tgt && d.dmg > 0 && u.cool <= 0 && hasAmmo(g, u)) {
    const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
    if (dd <= range && dd >= minR && g.canSee(u, tgt) && g.canHitTarget(u, tgt)) fireAt(g, u, tgt);
  }
}

/** continue along queued waypoints after a move completes */
export function nextWaypoint(g: Game, u: Unit, amove?: boolean) {
  if (!u.waypoints || !u.waypoints.length) {
    u.waypoints = undefined;
    return;
  }
  const w = u.waypoints.shift()!;
  u.order = MOVE(w.x, w.y);
  if (amove) u.order.amove = true;
  u.target = null;
  planRoute(g, u, w.x, w.y);
  if (!u.waypoints.length) u.waypoints = undefined;
}

export function hasAmmo(g: Game, u: Unit): boolean {
  if (!u.def.ammo) return true;
  if (u.ammo! > 0) return true;
  if (!u.ammoWarned) {
    u.ammoWarned = true;
    g.notify(u.team, u.def.label[u.team] + ' out of shells: waiting for an ammunition truck');
  }
  return false;
}

export function updateKamikaze(g: Game, u: Unit, dt: number) {
  const d = u.def;
  if (u.order.kind === 'attack' && u.order.target && !u.order.target.dead) u.target = u.order.target;
  const mode = g.modeOf(u),
    piloted = g.piloted(u);
  if (!u.target) {
    if (u.order.kind === 'move') {
      const dd = dist(u, u.order);
      moveToward(g, u, u.order.x, u.order.y, dt);
      // a piloted drone flown into a point goes off there: a treeline, a trench, a suspected position
      if (u.diveAt && piloted && dist(u, u.diveAt) < 8) {
        detonate(g, u, null);
        return;
      }
      if (dd < 6) {
        const am = u.order.amove;
        u.order = IDLE();
        nextWaypoint(g, u, am);
      }
    }
    // Hunt mode (and every drone without modes) picks its own targets; Hold and Ambush wait for orders unless attack-moving, and a pilot chooses
    if (d.acquire! > 0 && (mode === 'hunt' || mode === '' || (u.order.kind === 'move' && u.order.amove)) && !piloted) {
      const reach = (d.acquire! + (g.upgrades[u.team].repeaters ? 120 : 0)) * g.huntMul();
      const t = (d.prefer && acquirePreferred(g, u, reach)) || acquireFor(g, u, reach, 0);
      if (t && g.inLink(u, t)) {
        u.target = t;
        u.order = ATTACK(t);
      }
    }
    return;
  }
  moveToward(g, u, u.target.x, u.target.y, dt);
  if (dist(u, u.target) <= rOf(u.target) + 4) detonate(g, u, u.target);
}

/** a kamikaze drone goes off: on its target, or on the ground where its pilot flew it */
export function detonate(g: Game, u: Unit, primary: Entity | null) {
  const d = u.def,
    piloted = g.piloted(u);
  if (d.dmg > 0) {
    explosionFx(g, u.x, u.y, (d.splash || 0) + 14, true);
    damageArea(
      g,
      u.x,
      u.y,
      d.splash || 0,
      d.dmg * (piloted ? PILOT.dmg : 1),
      u.team,
      primary,
      d.vsStruct || 1,
      d.vsVehicle || 1,
      true,
      u
    );
    if (piloted)
      g.effects.push({
        kind: 'text',
        x: u.x,
        y: u.y - 16,
        t: 0,
        dur: 1.4,
        team: u.team,
        text: primary ? 'DIRECT HIT +20%' : 'IMPACT',
        sub: 'pilotHit',
      });
  } else g.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.4 });
  killUnit(g, u, true);
}
