// Player commands: everything a player (or the bot, or a replay) can ask the simulation to do.
//
// `applyCommand` is the single entry point; each command kind has one handler below. Commands arrive
// through Game.apply, in the same order on every client, so a handler may use the RNG freely.
// To add a command: add its shape to the `Command` union in types.ts, a handler here, and a case in
// the switch in applyCommand.
import {
  UA,
  RU,
  UNITS,
  STRUCTS,
  UPGRADES,
  FUEL_USERS,
  upgLabel,
  WAVE_COST,
  WAVE_COOLDOWN,
  TEAMS,
  OPS_MAX,
  DIG_TIME,
  STRIKES,
  modesOf,
  PILOT,
  NET_LINE,
} from '../data';
import { W, H, H_LAND } from '../map';
import { hyp, dist, clamp, datan2 } from '../dmath';
import type { Unit, Struct, Entity, Swarm, Command } from '../types';
import type { Game } from './game';
import { IDLE, MOVE, ATTACK } from './orders';
import { scheduleStrike, spawnShaheds } from './strikes';
import { planRoute } from './movement';
import { acquireFor, acquirePreferred, killUnit } from './combat';
import { formationOffsets, rotOff, leashPoint, formationMove, formSwarm, swarmStrike } from './swarms';

/** the command of one kind, for the handlers' signatures */
type Cmd<K extends Command['kind']> = Extract<Command, { kind: K }>;

export function applyCommand(g: Game, team: number, cmd: Command) {
  if (g.gameOver) return;
  switch (cmd.kind) {
    case 'move':
      return moveUnits(g, team, cmd);
    case 'attack':
      return attackTarget(g, team, cmd);
    case 'bombard':
      return bombardArea(g, team, cmd);
    case 'dig':
      return digIn(g, team, cmd);
    case 'strike':
      return strikeNearest(g, team, cmd);
    case 'swarm':
      return formSwarm(g, team, ownUnits(g, team, cmd.ids), cmd.formation);
    case 'swarmFormation':
      return setSwarmFormation(g, team, cmd);
    case 'rally':
      return setRally(g, team, cmd);
    case 'place':
      return placeBuilding(g, team, cmd);
    case 'enqueue':
      return enqueueAt(g, team, cmd);
    case 'cancel':
      return cancelQueued(g, team, cmd);
    case 'upgrade':
      return buyUpgrade(g, team, cmd.key);
    case 'ops':
      return changeOperators(g, team, cmd);
    case 'kab':
      return callGlideBomb(g, team, cmd);
    case 'deep':
      return launchDeepStrike(g, team);
    case 'iskander':
      return launchMissile(g, team, cmd);
    case 'recall':
      return recallDrones(g, team);
    case 'mode':
      return setMode(g, team, cmd);
    case 'steer':
      return steerDrone(g, team, cmd);
    case 'wave':
      return launchWave(g, team);
  }
}

// ---------------------------------------------------------------- shared helpers

/** the caller's own controllable units among these ids (never trucks or civilian cars) */
export function ownUnits(g: Game, team: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const e = g.find(id);
    if (e && e.isUnit && e.team === team && !e.def.auto) out.push(e);
  }
  return out;
}

/** an enemy the caller can currently see, else null */
export function findEnemy(g: Game, team: number, id: number): Entity | null {
  const e = g.find(id);
  if (!e || e.team === team || e.team < 0) return null;
  if (e.isUnit && !e.seenBy[team]) return null;
  return e;
}

/** a hull-down vehicle that is told to move leaves its scrape */
export function leaveHullDown(g: Game, team: number, list: Unit[]) {
  let n = 0;
  for (const u of list)
    if (g.modeOf(u) === 'hullDown') {
      u.mode = 'mobile';
      n++;
    }
  if (n) g.notify(team, n + ' vehicle' + (n > 1 ? 's' : '') + ' left hull-down to move');
}

const plural = (n: number, word: string) => n + ' ' + word + (n === 1 ? '' : 's');

// ---------------------------------------------------------------- movement and formations

/** right-click on the ground: move in formation; Shift queues a waypoint; Q makes it an attack-move */
function moveUnits(g: Game, team: number, cmd: Cmd<'move'>) {
  const sel = ownUnits(g, team, cmd.ids);
  const shakenN = sel.filter(e => e.shaken).length;
  if (shakenN) g.notify(team, plural(shakenN, 'shaken squad') + ' ignored the order');
  const groundedN = sel.filter(e => e.grounded).length;
  if (groundedN)
    g.notify(
      team,
      groundedN + ' grounded drone' + (groundedN > 1 ? 's have' : ' has') + ' no operator and cannot take orders'
    );
  const selUnits = sel.filter(e => !e.shaken && !e.grounded);
  if (!selUnits.length) return;
  if (cmd.queue) return queueWaypoint(g, team, selUnits, cmd);

  for (const u of selUnits) u.waypoints = undefined;
  leaveHullDown(g, team, selUnits);
  const airSel = selUnits.filter(u => u.def.air),
    groundSel = selUnits.filter(u => !u.def.air);
  const talker = groundSel.find(u => u.def.troop) || groundSel[0];
  if (talker) g.bark('ack', talker);

  if (airSel.length) {
    // swarms move as a body; loose drones take the chosen formation
    const seen = new Set<Swarm>();
    for (const u of airSel) {
      const sw = g.swarmOf(u);
      if (sw && !seen.has(sw)) {
        seen.add(sw);
        formationMove(g, sw.members, cmd.x, cmd.y, sw.formation);
      }
    }
    formationMove(
      g,
      airSel.filter(u => !g.swarmOf(u)),
      cmd.x,
      cmd.y,
      cmd.formation
    );
    if (cmd.attackMove)
      for (const u of airSel) if (u.order.kind === 'move' && (u.def.dmg > 0 || u.def.kamikaze)) u.order.amove = true;
    // a guarding interceptor's post moves with it
    for (const u of airSel)
      if (g.modeOf(u) === 'guard' && u.order.kind === 'move') u.post = { x: u.order.x, y: u.order.y };
  }

  // ground formations: wedge, line, or column face the way they are going; ring is the old square block
  const n = groundSel.length,
    cols = Math.ceil(Math.sqrt(Math.max(1, n))),
    sp = 28,
    rows = Math.ceil(n / cols);
  const gcx = n ? groundSel.reduce((a, u) => a + u.x, 0) / n : cmd.x,
    gcy = n ? groundSel.reduce((a, u) => a + u.y, 0) / n : cmd.y;
  const gh = hyp(cmd.x - gcx, cmd.y - gcy) > 10 ? datan2(cmd.y - gcy, cmd.x - gcx) : n ? groundSel[0].angle : 0;
  const goffs =
    cmd.formation !== 'ring' && n > 1 ? formationOffsets(n, cmd.formation, 30).map(o => rotOff(o, gh)) : null;
  groundSel.forEach((u, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    const ox = goffs ? goffs[i].x : (c - (cols - 1) / 2) * sp,
      oy = goffs ? goffs[i].y : (r - (rows - 1) / 2) * sp;
    u.order = MOVE(clamp(cmd.x + ox, 6, W - 6), clamp(cmd.y + oy, 6, H_LAND - 6));
    if (cmd.attackMove && (u.def.dmg > 0 || u.def.kamikaze)) u.order.amove = true;
    u.target = null;
    planRoute(g, u, u.order.x, u.order.y);
  });
  g.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.5, team });
}

/** Shift+right-click: append a waypoint; units with nothing to do start on it at once */
function queueWaypoint(g: Game, team: number, selUnits: Unit[], cmd: Cmd<'move'>) {
  const n0 = selUnits.length,
    cols0 = Math.ceil(Math.sqrt(Math.max(1, n0))),
    rows0 = Math.ceil(n0 / cols0);
  selUnits.forEach((u, i) => {
    const c = i % cols0,
      r = Math.floor(i / cols0);
    const wp = {
      x: clamp(cmd.x + (c - (cols0 - 1) / 2) * 28, 6, W - 6),
      y: clamp(cmd.y + (r - (rows0 - 1) / 2) * 28, 6, (u.def.air ? H : H_LAND) - 6),
    };
    if (u.order.kind === 'move') {
      (u.waypoints ||= []).push(wp);
    } else {
      u.waypoints = [];
      u.order = MOVE(wp.x, wp.y);
      u.target = null;
      planRoute(g, u, wp.x, wp.y);
    }
  });
  g.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.5, team });
}

/** right-click on an enemy: shooters attack, drones out of link range close up, the rest walk over */
function attackTarget(g: Game, team: number, cmd: Cmd<'attack'>) {
  const enemy = findEnemy(g, team, cmd.targetId);
  if (!enemy) return;
  const selUnits = ownUnits(g, team, cmd.ids).filter(e => !e.shaken && !e.grounded);
  for (const u of selUnits) u.waypoints = undefined;
  leaveHullDown(
    g,
    team,
    selUnits.filter(u => !g.canHitTarget(u, enemy) || dist(u, enemy) > g.rangeOf(u))
  );
  const shouter = selUnits.find(u => u.def.troop);
  if (shouter) g.bark('attack', shouter);
  const guns = selUnits.filter(u => u.def.indirect);
  if (guns.length) {
    const close = g.dangerClose(team, enemy.x, enemy.y, Math.max(...guns.map(a => a.def.splash || 0)) + 14);
    if (close)
      g.notify(
        team,
        'DANGER CLOSE: ' +
          close +
          ' of your own unit' +
          (close > 1 ? 's are' : ' is') +
          ' next to that target. Shells splash friend and foe alike'
      );
  }
  let warned = false;
  for (const u of selUnits) {
    if (u.landed) continue;
    if (g.needsOperator(u.def, u.team) && !g.inLink(u, enemy)) {
      const lp = leashPoint(g, u, enemy.x, enemy.y);
      u.order = MOVE(lp.x, lp.y);
      u.target = null;
      if (!warned) {
        warned = true;
        g.notify(team, "Target is beyond that drone's control range: move its squad closer");
      }
    } else if (g.canHitTarget(u, enemy)) {
      u.order = ATTACK(enemy);
      u.target = enemy;
    } else {
      u.order = MOVE(enemy.x + g.rand(-30, 30), enemy.y + g.rand(-30, 30));
      planRoute(g, u, u.order.x, u.order.y);
    }
  }
  g.effects.push({ kind: 'mark', x: enemy.x, y: enemy.y, t: 0, dur: 0.5, red: true, team });
}

// ---------------------------------------------------------------- fire missions, trenches, drone strikes

/** artillery fires on a map point, seen or unseen */
function bombardArea(g: Game, team: number, cmd: Cmd<'bombard'>) {
  const arty = ownUnits(g, team, cmd.ids).filter(e => e.def.indirect);
  if (!arty.length) return g.notify(team, 'Select artillery first');
  const close = g.dangerClose(
    team,
    cmd.x,
    cmd.y,
    Math.max(...arty.map(a => a.def.splash || 0)) * (g.inVision(team, cmd.x, cmd.y) ? 1 : 2.4)
  );
  if (close)
    g.notify(
      team,
      'DANGER CLOSE: ' +
        close +
        ' of your own unit' +
        (close > 1 ? 's are' : ' is') +
        ' inside the beaten zone. Shells do not know whose troops are under them'
    );
  for (const u of arty) {
    u.order = { kind: 'bombard', x: cmd.x, y: cmd.y, target: null };
    u.target = null;
    u.path = null;
  }
  g.bark('bombard', arty[0]);
  g.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.8, red: true, team });
  g.notify(
    team,
    plural(arty.length, 'gun') +
      ' firing on the area' +
      (g.inVision(team, cmd.x, cmd.y) ? '' : ', unobserved: wider scatter')
  );
}

/** E: troops dig a trench where they stand */
function digIn(g: Game, team: number, cmd: Cmd<'dig'>) {
  const troops = ownUnits(g, team, cmd.ids).filter(e => e.def.troop && !e.shaken);
  if (!troops.length) return g.notify(team, 'Select troops first');
  let n = 0;
  for (const u of troops) {
    if (g.trenchAt(u.x, u.y)) continue;
    u.order = { kind: 'dig', x: u.x, y: u.y, target: null };
    u.target = null;
    u.path = null;
    u.digT = DIG_TIME;
    n++;
  }
  g.notify(team, n ? plural(n, 'squad') + ' digging in: ' + DIG_TIME + ' seconds' : 'Already in a trench');
}

/** F: kamikaze drones dive at the nearest target in sight; a swarm spreads its dives */
function strikeNearest(g: Game, team: number, cmd: Cmd<'strike'>) {
  const sel = ownUnits(g, team, cmd.ids).filter(e => e.def.kamikaze && !e.grounded);
  if (!sel.length) return g.notify(team, 'Select airborne kamikaze drones first');
  let n = 0;
  const done = new Set<Swarm>();
  for (const u of sel) {
    const sw = g.swarmOf(u);
    if (sw) {
      if (!done.has(sw)) {
        done.add(sw);
        n += swarmStrike(g, sw);
      }
      continue;
    }
    const t = (u.def.prefer && acquirePreferred(g, u, 1400)) || acquireFor(g, u, 1400, 0);
    if (t && g.inLink(u, t)) {
      u.order = ATTACK(t);
      u.target = t;
      n++;
    }
  }
  g.notify(team, n ? plural(n, 'drone') + ' diving' + (done.size ? ' as a swarm' : '') : 'No target in sight for them');
  if (n) {
    const op =
      sel[0].operator && !sel[0].operator.dead ? sel[0].operator : g.nearestTroop(team, sel[0].x, sel[0].y, 900);
    if (op) g.bark('strike', op);
  }
}

function setSwarmFormation(g: Game, team: number, cmd: Cmd<'swarmFormation'>) {
  const sw = g.swarms.find(s => s.id === cmd.swarmId && s.team === team && !s.dead);
  if (sw) sw.formation = cmd.formation;
}

/** Home: every airborne battery drone flies home for fresh batteries */
function recallDrones(g: Game, team: number) {
  let n = 0;
  for (const u of g.units) {
    if (
      u.dead ||
      u.team !== team ||
      !u.def.air ||
      !u.def.endurance ||
      u.landed ||
      u.grounded ||
      (u.def.kamikaze && u.target)
    )
      continue;
    u.batt = Math.min(u.batt === undefined ? u.def.endurance : u.batt, u.def.endurance * 0.24);
    u.ambushed = false;
    u.target = null;
    if (u.order.kind === 'attack') u.order = IDLE();
    n++;
  }
  g.notify(team, n ? plural(n, 'drone') + ' recalled for fresh batteries' : 'No drones in the air');
}

/** R or the panel buttons: switch the posture of every selected unit whose type has that posture */
function setMode(g: Game, team: number, cmd: Cmd<'mode'>) {
  const sel = ownUnits(g, team, cmd.ids).filter(u => {
    const m = modesOf(u.type);
    return !!m && m.some(x => x.key === cmd.mode);
  });
  if (!sel.length) return;
  let n = 0,
    label = '';
  for (const u of sel) {
    if (g.modeOf(u) === cmd.mode) continue;
    u.mode = cmd.mode;
    n++;
    label = modesOf(u.type)!.find(x => x.key === cmd.mode)!.label;
    if (cmd.mode === 'hullDown') {
      u.order = IDLE();
      u.path = null;
      u.waypoints = undefined;
    }
    if (cmd.mode === 'guard') u.post = { x: u.x, y: u.y };
    if (cmd.mode === 'hunt' || cmd.mode === 'hold') u.ambushed = false;
    if (cmd.mode !== 'scoot') {
      u.scoot = null;
      u.scootPending = false;
    }
  }
  if (n) g.notify(team, plural(n, 'unit') + ' switched to ' + label);
}

/** a human pilot's stick input for one drone: fly toward a point, attack a target, or dive into the ground */
function steerDrone(g: Game, team: number, cmd: Cmd<'steer'>) {
  const u = g.find(cmd.id);
  if (!u || !u.isUnit || u.team !== team || !u.def.air || u.def.auto || u.grounded || u.landed) return;
  u.pilotT = PILOT.hold;
  u.ambushed = false;
  u.waypoints = undefined;
  const enemy = cmd.targetId !== undefined ? findEnemy(g, team, cmd.targetId) : null;
  if (enemy && g.canHitTarget(u, enemy) && g.inLink(u, enemy)) {
    u.order = ATTACK(enemy);
    u.target = enemy;
    u.diveAt = null;
    return;
  }
  const lp = leashPoint(g, u, clamp(cmd.x, 6, W - 6), clamp(cmd.y, 6, H - 6));
  u.order = MOVE(lp.x, lp.y);
  u.target = null;
  u.diveAt = cmd.dive && u.def.kamikaze ? { x: lp.x, y: lp.y } : null;
}

// ---------------------------------------------------------------- squads

/** O / Shift+O: a person from the pool joins the squad as a drone operator, or goes back */
function changeOperators(g: Game, team: number, cmd: Cmd<'ops'>) {
  const squads = ownUnits(g, team, cmd.ids).filter(u => u.def.operator);
  if (!squads.length) return g.notify(team, 'Select an infantry squad first');
  let n = 0;
  for (const u of squads) {
    if (cmd.delta > 0) {
      if ((u.ops || 1) >= OPS_MAX) continue;
      if (g.freePeople(team) < 1) {
        g.notify(team, 'No free personnel to add');
        break;
      }
      u.ops = (u.ops || 1) + 1;
      n++;
    } else if ((u.ops || 1) > 1) {
      u.ops = (u.ops || 1) - 1;
      n++;
    }
  }
  if (n) {
    g.notify(
      team,
      cmd.delta > 0
        ? plural(n, 'operator') + ' joined: each flies ' + g.opCap(team) + ' drones'
        : plural(n, 'operator') + ' returned to the pool'
    );
    if (cmd.delta > 0) g.bark('ops', squads[0]);
  } else if (cmd.delta > 0) g.notify(team, 'A squad holds at most ' + OPS_MAX + ' operators');
}

// ---------------------------------------------------------------- building and production

function setRally(g: Game, team: number, cmd: Cmd<'rally'>) {
  let n = 0;
  for (const id of cmd.ids) {
    const e = g.find(id);
    if (e && e.isStruct && e.team === team && e.def.produces) {
      e.rally = { x: cmd.x, y: cmd.y };
      n++;
    }
  }
  if (n) g.notify(team, 'Rally point set');
}

function placeBuilding(g: Game, team: number, cmd: Cmd<'place'>) {
  const err = g.placementError(team, cmd.type, cmd.x, cmd.y);
  if (err) return g.notify(team, err);
  g.funds[team] -= STRUCTS[cmd.type].cost;
  if (STRUCTS[cmd.type].tunnel) {
    const n = layNetLine(g, team, cmd.x, cmd.y);
    g.notify(team, plural(n, 'net') + ' strung along the road');
    return;
  }
  g.structs.push(g.makeStruct(cmd.type, team, cmd.x, cmd.y, false));
}

/** a Road net tunnel order: nets spaced along the nearest road on both sides of the click, skipping spots already taken */
export function layNetLine(g: Game, team: number, x: number, y: number): number {
  const rh = g.terrain.nearestRoad(x, y);
  if (!rh) return 0;
  const A = g.terrain.roadNodes[rh.e.a],
    B = g.terrain.roadNodes[rh.e.b],
    L = hyp(B.x - A.x, B.y - A.y) || 1,
    ux = (B.x - A.x) / L,
    uy = (B.y - A.y) / L;
  const s0 = (rh.px - A.x) * ux + (rh.py - A.y) * uy;
  let n = 0;
  for (let k = -Math.floor(NET_LINE.count / 2); k <= Math.floor(NET_LINE.count / 2); k++) {
    const s = clamp(s0 + k * NET_LINE.spacing, 0, L),
      px = A.x + ux * s,
      py = A.y + uy * s;
    if (px < 24 || py < 24 || px > W - 24 || py > H_LAND - 24) continue;
    if (g.structs.some(st => !st.dead && !st.def.trench && dist(st, { x: px, y: py }) < st.r + STRUCTS.net.r + 6))
      continue;
    g.structs.push(g.makeStruct('net', team, px, py, false));
    n++;
  }
  return n;
}

function enqueueAt(g: Game, team: number, cmd: Cmd<'enqueue'>) {
  const fac = g.find(cmd.facId);
  if (!fac || !fac.isStruct || fac.team !== team || !fac.def.produces || !fac.def.produces.includes(cmd.type)) return;
  return enqueue(g, team, fac, cmd.type);
}

/** queue a unit at a factory: every reason it cannot be built is a toast */
export function enqueue(g: Game, team: number, fac: Struct, type: string) {
  const def = UNITS[type];
  if (!fac || fac.dead || !def) return;
  if (fac.build < 1) return g.notify(team, 'Still under construction');
  if (fac.queue.length >= 5) return g.notify(team, 'Production queue is full');
  if (g.funds[team] < def.cost) return g.notify(team, 'Not enough funds');
  if (g.freePeople(team) < g.crewOf(def, team))
    return g.notify(
      team,
      'Not enough personnel: needs ' + g.crewLabel(def, team) + ', ' + Math.floor(g.freePeople(team)) + ' free'
    );
  if (g.needsOperator(def, team) && g.freeSlots(team) < 1)
    g.notify(team, 'No free operator: this drone will sit grounded at the works until a squad has a free slot');
  if (def.side !== undefined && def.side !== team) return g.notify(team, 'Not available to your side');
  if (def.fixedWing && !g.upgrades[team].launchRail)
    return g.notify(team, 'Fixed-wing aircraft need Launch rails: research it (T)');
  if (FUEL_USERS.has(type) && g.supply[team].fuelUsed + 1 > g.supply[team].fuelCap)
    return g.notify(
      team,
      'No fuel for another ' +
        (def.air ? 'aircraft' : 'vehicle') +
        ': ' +
        g.supply[team].fuelUsed +
        ' of ' +
        g.supply[team].fuelCap +
        '. Hold gas sites and keep the pipeline pumping.'
    );
  if (def.electric && g.supply[team].powerUsed + 1 > g.supply[team].powerCap)
    return g.notify(
      team,
      'No charging capacity for another battery drone: ' +
        g.supply[team].powerUsed +
        ' of ' +
        g.supply[team].powerCap +
        '. Keep the substation standing or build generator sets.'
    );
  if (def.troop && g.supply[team].foodUsed + 1 > g.supply[team].foodCap)
    g.notify(
      team,
      'Warning: this squad will go hungry, ' + g.supply[team].foodCap + ' can be fed. Take more wheat fields.'
    );
  if (def.cap && g.typeCount(team, type) >= def.cap)
    return g.notify(team, 'No more ' + def.label[team] + 's available: at most ' + def.cap + ' squads');
  if (def.air && fac.overheated) g.notify(team, 'Works overheated: the drone joins the backlog until it cools');
  g.funds[team] -= def.cost;
  fac.queue.push(type);
}

function cancelQueued(g: Game, team: number, cmd: Cmd<'cancel'>) {
  const fac = g.find(cmd.facId);
  if (!fac || !fac.isStruct || fac.team !== team) return;
  const type = fac.queue[cmd.index];
  if (!type) return;
  fac.queue.splice(cmd.index, 1);
  g.funds[team] += UNITS[type].cost;
  if (cmd.index === 0) fac.progress = 0;
}

export function buyUpgrade(g: Game, team: number, key: string) {
  const u = UPGRADES[key];
  if (!u || g.upgrades[team][key]) return;
  if (key === 'aid' && team === UA && g.support < 60) return g.notify(team, 'Aid needs support of at least 60%');
  if (u.requires && !g.upgrades[team][u.requires])
    return g.notify(team, 'Needs ' + upgLabel(team, u.requires) + ' first');
  if (g.funds[team] < u.cost) return g.notify(team, 'Not enough funds');
  g.funds[team] -= u.cost;
  g.upgrades[team][key] = true;
  g.notify(team, upgLabel(team, key) + ' acquired');
  g.addLog(team, 'research', TEAMS[team].name + ' researched ' + upgLabel(team, key));
  if (key === 'mobilization') g.people[team].total = Math.min(240, g.people[team].total + 40);
  // Full autonomy: every radio drone lets go of its squad
  if (key === 'auto3')
    for (const d of g.units)
      if (d.team === team && d.operator && !d.def.tether) {
        if (d.operator.drones) d.operator.drones = d.operator.drones.filter(x => x !== d);
        d.operator = null;
      }
}

// ---------------------------------------------------------------- strikes from beyond the map

function callGlideBomb(g: Game, team: number, cmd: Cmd<'kab'>) {
  const cost = STRIKES.kab.cost[team];
  if (g.kabT[team] > 0) return g.notify(team, 'Aviation reloading: ' + Math.ceil(g.kabT[team]) + ' s');
  if (g.funds[team] < cost) return g.notify(team, 'A glide bomb strike costs ' + cost + ' funds');
  g.funds[team] -= cost;
  g.kabT[team] = g.kabCooldown(team);
  g.stats.kabs[team]++;
  scheduleStrike(g, team, 'kab', clamp(cmd.x, 20, W - 20), clamp(cmd.y, 20, H_LAND - 20));
  g.notify(team, 'Glide bomb on the way: ' + STRIKES.kab.warn + ' seconds to impact');
}

/** Ukraine sends an idle Liutyi at a refinery inside Russia */
function launchDeepStrike(g: Game, team: number) {
  if (team !== UA) return g.notify(team, 'Only Ukraine flies deep strikes');
  if (g.deepT > 0) return g.notify(team, 'Deep strike crews preparing: ' + Math.ceil(g.deepT) + ' s');
  if (g.deepPending) return g.notify(team, 'A deep strike is already in the air');
  const li = g.units.find(u => !u.dead && u.team === UA && u.type === 'liutyi' && u.order.kind !== 'attack');
  if (!li) return g.notify(team, 'Needs an idle Liutyi: build one at the launch site');
  if (g.funds[UA] < STRIKES.deep.cost) return g.notify(team, 'A deep strike costs ' + STRIKES.deep.cost + ' funds');
  g.funds[UA] -= STRIKES.deep.cost;
  g.deepT = STRIKES.deep.cooldown;
  killUnit(g, li, true);
  g.deepPending = { at: g.gameTime + STRIKES.deep.delay, hit: g.rng.next() < STRIKES.deep.chance };
  g.notify(UA, 'Liutyi away toward a refinery inside Russia: ' + STRIKES.deep.delay + ' seconds of flight');
  g.addLog(UA, 'info', 'A Liutyi left for the Russian interior');
}

/** Russia fires an Iskander at a chosen enemy building */
function launchMissile(g: Game, team: number, cmd: Cmd<'iskander'>) {
  if (team !== RU) return g.notify(team, 'Only Russia has Iskanders here');
  if (g.missileT > 0) return g.notify(team, 'Missile brigade reloading: ' + Math.ceil(g.missileT) + ' s');
  if (g.funds[RU] < STRIKES.missile.cost)
    return g.notify(team, 'A missile strike costs ' + STRIKES.missile.cost + ' funds');
  const t = g.find(cmd.targetId);
  if (!t || !t.isStruct || t.team === RU) return g.notify(team, 'Pick an enemy building');
  g.funds[RU] -= STRIKES.missile.cost;
  g.missileT = STRIKES.missile.cooldown;
  g.stats.missiles++;
  scheduleStrike(g, RU, 'missile', t.x, t.y, t.id);
  g.notify(RU, 'Iskander launched: ' + STRIKES.missile.warn + ' seconds to impact');
}

/** Russia launches a Geran wave by hand (the bot gets them free on a timer) */
function launchWave(g: Game, team: number) {
  if (team !== RU) return g.notify(team, 'Only Russia launches Geran waves');
  if (g.waveT > 0) return g.notify(team, 'Launch crews reloading: ' + Math.ceil(g.waveT) + ' s');
  if (g.funds[RU] < WAVE_COST) return g.notify(team, 'A Geran wave costs ' + WAVE_COST + ' funds');
  g.funds[RU] -= WAVE_COST;
  g.waveT = WAVE_COOLDOWN;
  g.stats.waves[RU]++;
  spawnShaheds(g, 3, true);
  g.notify(RU, 'Geran wave launched: three drones and four decoys are on their way, the first two at the substation');
}
