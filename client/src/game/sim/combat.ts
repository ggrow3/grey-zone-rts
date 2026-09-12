// Combat: target acquisition, direct and indirect fire, shells in flight, splash damage, the cover and posture
// modifiers, kills and veterancy, destroyed buildings, and what all of that does to the score and the log.
import {
  UA,
  RU,
  UNITS,
  COVER,
  TEAMS,
  TRENCH_IN_FOREST,
  AIR_VS_AIR_EVADE,
  PILOT,
  unitPoints,
  structPoints,
  SCORE,
  NET_LINE,
} from '../data';
import type { UnitDef } from '../data';
import { hyp, dist, clamp, dsin, dcos, datan2 } from '../dmath';
import type { Unit, Struct, Entity, Projectile } from '../types';
import type { Game } from './game';
import { remember } from './entity';
import { rankOf, isVehicle, matchup, ADJ } from './entity';

export function acquireFor(g: Game, src: Unit, maxR: number, minR: number): Entity | null {
  const T = src.def.targets;
  if (!T) return null;
  let best: Entity | null = null,
    bd = Infinity;
  for (const e of g.units) {
    if (e.dead || e.team === src.team || e.team < 0 || !e.seenBy[src.team] || !g.canEngage(src.def, e) || e.landed)
      continue;
    const dd = dist(src, e);
    if (dd <= maxR && dd >= minR && dd < bd) {
      bd = dd;
      best = e;
    }
  }
  if (T.includes('struct'))
    for (const s of g.structs) {
      if (s.dead || s.team === src.team || s.team < 0) continue;
      const dd = dist(src, s) - s.r * 0.5;
      if (dd <= maxR && dd >= minR && dd < bd) {
        bd = dd;
        best = s;
      }
    }
  return best;
}

export function acquirePreferred(g: Game, u: Unit, maxR: number): Unit | null {
  let best: Unit | null = null,
    bd = Infinity;
  for (const e of g.units) {
    if (
      e.dead ||
      e.team === u.team ||
      e.team < 0 ||
      !u.def.prefer!.includes(e.type) ||
      !e.seenBy[u.team] ||
      !g.canEngage(u.def, e)
    )
      continue;
    const dd = dist(u, e);
    if (dd <= maxR && dd < bd) {
      bd = dd;
      best = e;
    }
  }
  return best;
}

export function fireAt(g: Game, u: Unit, t: Entity) {
  const d = u.def;
  u.cool = d.rof || 1;
  u.angle = datan2(t.y - u.y, t.x - u.x);
  if (d.indirect) {
    launchShell(g, u, t);
    if (d.salvo) {
      u.salvoLeft = d.salvo - 1;
      u.salvoT = 0.18;
    }
  } else {
    directHit(
      g,
      u,
      t,
      d.dmg *
        (d.troop ? COVER[u.cover || 'open'].give * g.rationMul(u) : 1) *
        g.moraleMul(u) *
        (!d.air && g.upgrades[u.team].ammo ? 1.15 : 1) *
        (1 + 0.06 * rankOf(u)) *
        (u.grief && u.grief > 0 ? 0.8 : 1),
      d.splash || 0
    );
  }
}

export function directHit(g: Game, src: Unit, t: Entity, dmg: number, splash: number) {
  g.effects.push({ kind: 'tracer', x: src.x, y: src.y, tx: t.x, ty: t.y, t: 0, dur: 0.12, team: src.team });
  if (t.isUnit && t.def.air) {
    const ev = clamp(
      (t.def.evade || 0) +
        0.04 * rankOf(t) +
        (src.def.air &&
        !(src.team >= 0 && g.upgrades[src.team].aiIntercept && src.def.targets && src.def.targets.includes('air'))
          ? AIR_VS_AIR_EVADE
          : 0) +
        (g.piloted(t) ? PILOT.evade : 0) -
        (g.weather.kind === 'rain' ? 0.1 : 0) +
        (t.team >= 0 && g.upgrades[t.team].evasion ? 0.15 : 0) -
        (src.team >= 0 && g.upgrades[src.team].gunnery ? 0.15 : 0),
      0,
      0.9
    );
    if (g.rng.next() < ev) {
      g.effects.push({ kind: 'hit', x: t.x + g.rand(-14, 14), y: t.y + g.rand(-14, 14), t: 0, dur: 0.15 });
      return;
    }
  }
  const vs = src.def.vsStruct || 1,
    vv = src.def.vsVehicle || 1;
  if (splash > 0) {
    explosionFx(g, t.x, t.y, splash * 0.7, false);
    damageArea(g, t.x, t.y, splash, dmg, src.team, t, vs, vv, !!src.def.air, src);
  } else {
    applyDamage(g, t, dmg * matchup(src.def, t), src.team, !!src.def.air, src);
    g.effects.push({ kind: 'hit', x: t.x + g.rand(-3, 3), y: t.y + g.rand(-3, 3), t: 0, dur: 0.18 });
  }
}

export function launchShell(g: Game, u: Unit, t: Entity) {
  launchShellAt(g, u, t.x, t.y, 1);
}

export function launchShellAt(g: Game, u: Unit, px: number, py: number, spreadMul: number) {
  const d = u.def;
  const spread = (d.salvo ? 34 : 14) * (spreadMul || 1);
  const tx = px + g.rand(-spread, spread),
    ty = py + g.rand(-spread, spread);
  const dd = hyp(tx - u.x, ty - u.y);
  u.revealT = u.cover === 'forest' ? 2 : u.cover === 'open' ? 6 : 3;
  u.scootPending = true;
  if (d.ammo) {
    if (u.ammo! <= 0) return;
    u.ammo!--;
    if (u.ammo === 0) g.notify(u.team, u.def.label[u.team] + ' fired its last shell');
  }
  g.projectiles.push({
    x: u.x,
    y: u.y,
    sx: u.x,
    sy: u.y,
    tx,
    ty,
    t: 0,
    dur: dd / (d.shellSpeed || 260),
    dmg: d.dmg * (g.upgrades[u.team].ammo ? 1.15 : 1) * (1 + 0.06 * rankOf(u)),
    splash: d.splash || 0,
    team: u.team,
    arc: Math.min(110, dd * 0.22),
    rocket: !!d.salvo,
    dead: false,
    srcId: u.id,
    srcType: u.type,
  });
  g.effects.push({ kind: 'flash', x: u.x + dcos(u.angle) * 14, y: u.y + dsin(u.angle) * 14, t: 0, dur: 0.1 });
}

export function updateProjectile(g: Game, p: Projectile, dt: number) {
  if (p.dead) return;
  p.t += dt;
  const k = Math.min(1, p.t / p.dur);
  p.x = p.sx + (p.tx - p.sx) * k;
  p.y = p.sy + (p.ty - p.sy) * k;
  if (p.t >= p.dur) {
    p.dead = true;
    explosionFx(g, p.tx, p.ty, p.splash, true);
    if (p.strike) {
      // a glide bomb or missile: trench cover does not help, trenches are erased, buildings crumble
      g.effects.push({ kind: 'boom', x: p.tx, y: p.ty, r: p.splash * 1.4, t: 0, dur: 1.4 });
      g.scorches.push({ x: p.tx, y: p.ty, r: p.splash });
      for (const s of g.structs)
        if (!s.dead && s.def.trench && hyp(s.x - p.tx, s.y - p.ty) < p.splash) destroyStruct(g, s, p.team);
      damageArea(g, p.tx, p.ty, p.splash, p.dmg, p.team, null, 1.5, 1.2, false, undefined, undefined, true);
      return;
    }
    const src = p.srcId !== undefined ? g.find(p.srcId) : undefined;
    const sd = src && src.isUnit ? src.def : p.srcType ? UNITS[p.srcType] : undefined;
    // artillery does not know whose troops are under the shell: friendly ground units in the splash take it too
    damageArea(
      g,
      p.tx,
      p.ty,
      p.splash,
      p.dmg,
      p.team,
      null,
      sd && sd.vsStruct ? sd.vsStruct : 1,
      sd && sd.vsVehicle ? sd.vsVehicle : 1,
      false,
      src && src.isUnit ? src : undefined,
      sd,
      false,
      !!(sd && sd.indirect)
    );
  }
}

export function damageArea(
  g: Game,
  x: number,
  y: number,
  r: number,
  dmg: number,
  team: number,
  primary: Entity | null,
  vsStruct?: number,
  vsVehicle?: number,
  drone?: boolean,
  src?: Unit,
  srcDef?: UnitDef,
  heavy = false,
  friendly = false
) {
  const vs = vsStruct || 1,
    vv = vsVehicle || 1;
  if (dmg >= 30)
    for (const rs of g.resources)
      if (rs.kind === 'wheat' && rs.burnT <= 0 && hyp(rs.x - x, rs.y - y) < rs.r) {
        rs.burnT = 60;
        if (rs.owner >= 0) g.notify(rs.owner, 'Wheat field burning');
      }
  const sd = src ? src.def : srcDef,
    vi = heavy ? 1.6 : sd && sd.vsInf ? sd.vsInf : 1;
  for (const e of g.units) {
    if (e.dead || (e.team === team && !friendly) || e.def.air) continue;
    const dd = hyp(e.x - x, e.y - y) - e.def.r;
    if (dd <= r)
      applyDamage(
        g,
        e,
        (e === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * (isVehicle(e) ? vv : e.def.troop ? vi : 1),
        team,
        drone,
        src,
        heavy
      );
  }
  for (const s of g.structs) {
    if (s.dead || s.team === team) continue;
    const dd = hyp(s.x - x, s.y - y) - s.r;
    if (dd <= r)
      applyDamage(g, s, (s === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * vs, team, false, src);
  }
}

export function applyDamage(g: Game, t: Entity, amt: number, team: number, drone?: boolean, src?: Unit, heavy = false) {
  if (t.dead) return;
  if (drone && t.isUnit && isVehicle(t) && t.team >= 0 && g.upgrades[t.team].cages) amt *= 0.65;
  if (drone && t.isUnit && t.def.robot) amt *= 0.6;
  // nets are cable and poles: a warhead or a dropped bomb does little; guns and armor cut them
  if (drone && t.isStruct && t.def.netR) amt *= NET_LINE.droneDamage;
  if (t.isUnit) amt *= 1 - 0.06 * rankOf(t);
  if (t.isUnit) {
    const m = g.modeOf(t);
    if (m === 'hullDown' && !heavy) amt *= 0.7;
    else if (m === 'creep' && drone) amt *= 0.65;
  }
  if (t.isUnit && t.def.troop && !heavy) {
    const cv = COVER[t.cover || 'open'];
    amt *= cv.take;
    if (drone) {
      amt *= cv.drone;
      if (t.cover === 'trench' && g.terrain.coverOf(t.x, t.y) === 'forest') amt *= TRENCH_IN_FOREST;
    }
  } else if (t.isUnit && t.def.indirect && drone) amt *= COVER[t.cover || 'open'].drone;
  if (t.isUnit && t.def.morale) t.morale = clamp((t.morale === undefined ? 90 : t.morale) - amt * 0.25, 0, 100);
  t.hp -= amt;
  t.lastHitBy = team;
  if (t.isStruct && !t.civ && t.team >= 0 && team !== t.team && !t.def.trench && t.hp > 0)
    g.alert(t.team, t.x, t.y, t.def.label + ' under attack');
  if (t.hp <= 0) {
    if (t.isUnit) killUnit(g, t, false, team, src);
    else destroyStruct(g, t, team, src);
  }
}

/** a confirmed kill for the unit that scored it: veterancy */
export function credit(g: Game, src: Unit | undefined, victim: Entity) {
  if (!src || src.dead || src.def.kamikaze) return;
  const before = rankOf(src);
  src.kills = (src.kills || 0) + 1;
  const best = g.stats.best[src.team];
  if (!best || src.kills > best.kills)
    g.stats.best[src.team] = { label: src.def.label[src.team], callsign: src.callsign || '', kills: src.kills };
  // the record keeps the kills worth telling: armor, guns, buildings, anything dear
  if (victim.isStruct || (victim.isUnit && (victim.def.cost >= 250 || victim.def.indirect)))
    remember(
      src,
      'destroyed a ' +
        (victim.isStruct ? victim.def.label.toLowerCase() : victim.def.label[src.team].toLowerCase()) +
        ' near ' +
        g.map.nearestPlace(victim.x, victim.y)
    );
  if (rankOf(src) > before) {
    g.stats.vets[src.team]++;
    g.notify(
      src.team,
      src.def.label[src.team] +
        ' is now ' +
        ['a recruit', 'trained', 'a veteran', 'elite'][rankOf(src)] +
        (victim.isStruct ? '' : '')
    );
    g.bark('kill', src);
  }
}

export function killUnit(g: Game, u: Unit, silent?: boolean, byTeam?: number, by?: Unit) {
  if (u.dead) return;
  u.dead = true;
  if (u.team < 0) {
    if (byTeam === UA) {
      g.civ.carsKilled[0]++;
      supportHit(g, 4, 'A civilian vehicle was hit by your strike.');
      g.addLog(UA, 'loss', 'Ukrainian fire hit a civilian vehicle near ' + g.map.nearestPlace(u.x, u.y));
    } else if (byTeam === RU) {
      g.civ.carsKilled[1]++;
      g.addLog(RU, 'loss', 'Russian fire hit a civilian vehicle near ' + g.map.nearestPlace(u.x, u.y));
    }
    if (byTeam !== undefined && byTeam >= 0) g.stats.score[byTeam] += SCORE.civCar;
    explosionFx(g, u.x, u.y, 12, false);
    return;
  }
  g.stats.lost[u.team]++;
  if (byTeam !== undefined && byTeam >= 0 && byTeam !== u.team) {
    const lt = g.stats.lostTo[u.team],
      k = by ? by.type : 'strike';
    lt[k] = (lt[k] || 0) + 1;
  }
  if ((u.type === 'truck' || u.type === 'repairTruck') && byTeam !== undefined && byTeam >= 0 && byTeam !== u.team)
    g.stats.trucksKilled[byTeam]++;
  if (byTeam !== undefined && byTeam >= 0 && byTeam !== u.team && !u.def.air)
    g.alert(u.team, u.x, u.y, u.def.label[u.team] + ' lost');
  if (byTeam !== undefined && byTeam >= 0 && byTeam !== u.team) {
    g.stats.kills[byTeam]++;
    if (u.def.air) g.stats.shotDown[byTeam]++;
    g.stats.score[byTeam] += unitPoints(u.def);
    const ko = g.stats.killsOf[byTeam];
    ko[u.type] = (ko[u.type] || 0) + 1;
    g.addLog(
      byTeam,
      'kill',
      (by ? by.def.label[byTeam] : TEAMS[byTeam].name) +
        ' destroyed a ' +
        ADJ[u.team] +
        ' ' +
        u.def.label[u.team].toLowerCase() +
        (u.callsign
          ? ' (' + u.callsign + (rankOf(u) ? ', ' + ['recruit', 'trained', 'veteran', 'elite'][rankOf(u)] : '') + ')'
          : '') +
        ' near ' +
        g.map.nearestPlace(u.x, u.y)
    );
    // a veteran squad lost shakes the squads around it
    if (u.def.troop && rankOf(u) >= 2) {
      let n = 0;
      for (const o of g.units)
        if (!o.dead && o !== u && o.team === u.team && o.def.troop && dist(o, u) < 400) {
          o.grief = 10;
          if (o.def.morale) o.morale = clamp((o.morale === undefined ? 90 : o.morale) - 20, 0, 100);
          n++;
        }
      if (n)
        g.notify(
          u.team,
          (u.callsign || u.def.label[u.team]) +
            ', a ' +
            ['', '', 'veteran', 'elite'][rankOf(u)] +
            ' squad, is gone: ' +
            n +
            ' squad' +
            (n > 1 ? 's' : '') +
            ' nearby shaken for ten seconds'
        );
    }
    credit(g, by, u);
    if (!u.def.auto) {
      const shouter = g.nearestTroop(byTeam, u.x, u.y, 260);
      if (shouter) g.bark('kill', shouter);
    }
    if (u.def.troop) {
      const friend = g.nearestTroop(u.team, u.x, u.y, 260);
      if (friend) g.bark('lost', friend);
    }
  } else if (byTeam === u.team && by && by.def.indirect && !u.def.auto) {
    g.stats.friendlyFire[u.team]++;
    g.addLog(
      u.team,
      'loss',
      'Friendly fire: ' +
        TEAMS[u.team].name +
        ' lost ' +
        (/^[aeiou]/i.test(u.def.label[u.team]) ? 'an ' : 'a ') +
        u.def.label[u.team].toLowerCase() +
        ' to its own ' +
        by.def.label[u.team].toLowerCase() +
        ' near ' +
        g.map.nearestPlace(u.x, u.y)
    );
    g.notify(
      u.team,
      'Friendly fire! Your ' +
        by.def.label[u.team].toLowerCase() +
        ' destroyed your own ' +
        u.def.label[u.team].toLowerCase()
    );
    g.effects.push({
      kind: 'text',
      x: u.x,
      y: u.y - 16,
      t: 0,
      dur: 1.4,
      team: u.team,
      text: 'FRIENDLY FIRE',
      sub: 'ff',
    });
  } else if (!u.def.auto && !silent)
    g.addLog(
      u.team,
      'loss',
      TEAMS[u.team].name + ' lost a ' + u.def.label[u.team].toLowerCase() + ' near ' + g.map.nearestPlace(u.x, u.y)
    );
  if (u.def.troop)
    for (const o of g.units)
      if (!o.dead && o !== u && o.team === u.team && o.def.morale && dist(o, u) < 300)
        o.morale = clamp((o.morale === undefined ? 90 : o.morale) - 12, 0, 100);
  if (u.operator && u.operator.drones) u.operator.drones = u.operator.drones.filter(x => x !== u);
  if (u.drones) {
    for (const dr of u.drones) dr.operator = null;
    u.drones = [];
  }
  if (!u.def.air && u.def.crew && !(u.def.auto && g.upgrades[u.team].ugvLogistics)) {
    const lost = Math.floor((u.def.crew + (u.ops || 1) - 1) * (g.upgrades[u.team].medevac ? 0.25 : 0.5) + g.rng.next());
    g.people[u.team].total = Math.max(0, g.people[u.team].total - lost);
    g.stats.peopleLost[u.team] += lost;
  }
  if (!silent) explosionFx(g, u.x, u.y, u.def.air ? 10 : u.def.r + 8, !u.def.air);
}

export function destroyStruct(g: Game, s: Struct, byTeam: number, by?: Unit) {
  if (s.dead) return;
  s.dead = true;
  explosionFx(g, s.x, s.y, s.r + 30, true);
  g.scorches.push({ x: s.x, y: s.y, r: s.r + 18 });
  if (byTeam >= 0 && byTeam !== s.team) {
    if (!s.def.trench) g.stats.structsKilled[byTeam]++;
    g.stats.score[byTeam] += s.civ ? SCORE.civSite : structPoints(s.def);
    credit(g, by, s);
    if (!s.def.trench)
      g.addLog(
        byTeam,
        'struct',
        (by ? by.def.label[byTeam] : TEAMS[byTeam].name) +
          ' destroyed ' +
          (s.civ ? 'a ' + ADJ[s.nation!] + ' ' : 'the ' + ADJ[s.team] + ' ') +
          s.def.label.toLowerCase() +
          ' at ' +
          g.map.nearestPlace(s.x, s.y)
      );
  }
  if (s.civ) {
    g.civ.lost[s.nation!]++;
    if (byTeam === UA) {
      if (s.nation === 1) {
        g.civ.harmedByUA++;
        g.funds[UA] = Math.max(0, g.funds[UA] - 200);
        supportHit(g, 12, 'Your strike destroyed a Russian ' + s.def.label.toLowerCase() + '.');
      } else supportHit(g, 6, 'Your own strike destroyed a Ukrainian ' + s.def.label.toLowerCase() + '.');
    } else if (s.nation === 0) g.notify(UA, 'Ukrainian ' + s.def.label.toLowerCase() + ' destroyed by enemy fire');
    return;
  }
  if (s.type === 'pump') {
    const ps = g.pumpSites.find(x => x.struct === s);
    if (ps) ps.rebuildT = 120;
    g.notify(s.team, 'Pumping station destroyed: gas flow stopped');
  } else if (!s.def.trench) {
    g.notify(s.team, s.def.label + ' destroyed');
    g.alert(s.team, s.x, s.y, s.def.label + ' destroyed');
  }
  if (s.type === 'hq') g.endGame(1 - s.team);
}

export function supportHit(g: Game, amount: number, text: string) {
  g.support = clamp(g.support - amount, 0, 100);
  g.notify(UA, text + ' Support ' + Math.round(g.support) + '%.');
}

export function explosionFx(g: Game, x: number, y: number, r: number, mark: boolean) {
  g.effects.push({ kind: 'boom', x, y, r, t: 0, dur: 0.45 + r / 120 });
  if (mark && r >= 20) g.scorches.push({ x, y, r: r * 0.8 });
}
