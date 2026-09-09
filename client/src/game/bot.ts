// The computer opponent. Team-parametric; uses the game's seeded RNG so it is deterministic.
import { UA, RU, UNITS, UPGRADES, FUEL_USERS, DIG_TIME } from './data';
import { dist } from './dmath';
import type { Game } from './sim';
import { MOVE, ATTACK } from './sim';
import type { Bot, Unit, Pt } from './types';

export function makeBot(team: number, staging: Pt): Bot {
  return { team, staging, spendT: 2, attackT: 0, shahedT: 240, warnT: 0, warnName: '', defendT: 0, artyT: 0, pending: null };
}

function weightedPick(g: Game, table: [string, number][]): string {
  let sum = 0; for (const [, w] of table) sum += w;
  let r = g.rng.next() * sum;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return table[table.length - 1][0];
}

export function updateBot(g: Game, bot: Bot, dt: number) {
  const T = bot.team, E = 1 - T, t = g.gameTime;
  bot.spendT -= dt;
  if (bot.spendT <= 0) { bot.spendT = 1; botSpend(g, bot); }
  bot.attackT += dt;
  const staging = g.units.filter(u => u.team === T && !u.dead && !u.def.structuresOnly && !u.def.auto && !u.def.indirect && !u.def.recon && u.order.kind === 'idle');
  const threshold = Math.min(2600, 700 + t * 2);
  const homeHq = g.structs.find(s => s.team === T && s.type === 'hq');
  const guard = homeHq ? staging.filter(u => !u.def.air).sort((a, b) => dist(a, homeHq) - dist(b, homeHq)).slice(0, 4) : [];
  const sortie = staging.filter(u => !guard.includes(u));
  const sortieValue = sortie.reduce((a, u) => a + u.def.cost, 0);
  if (!g.botPassive && t > 60 && sortie.length >= 3 && (sortieValue >= threshold || (bot.attackT > 45 && sortieValue >= 300))) { botLaunch(g, bot, sortie); bot.attackT = 0; }
  bot.defendT -= dt;
  if (bot.defendT <= 0) {
    const hq = homeHq;
    if (hq) {
      let intruder: Unit | null = null, bd = 560;
      for (const u of g.units) if (u.team === E && !u.dead && !u.def.air && !u.def.auto && u.seenBy[T]) { const dd = dist(u, hq); if (dd < bd) { bd = dd; intruder = u; } }
      if (intruder) {
        for (const u of staging) { u.order = MOVE(intruder.x + g.rand(-50, 50), intruder.y + g.rand(-50, 50)); u.target = null; g.planRoute(u, u.order.x, u.order.y); }
        bot.defendT = 12;
      }
    }
  }
  // troops standing still dig in; troops in the open with enemy drones about run for the nearest wood first
  bot.coverT = (bot.coverT === undefined ? 3 : bot.coverT) - dt;
  const droneAlert = bot.coverT <= 0;
  if (droneAlert) bot.coverT = 4;
  for (const u of g.units) {
    if (u.dead || u.team !== T || !u.def.troop || u.order.kind !== 'idle') { if (u.team === T) u.idleT = 0; continue; }
    u.idleT = (u.idleT || 0) + dt;
    if (droneAlert && u.cover === 'open' && !u.shaken && g.units.some(e => !e.dead && e.team === E && e.def.air && e.def.dmg > 0 && e.seenBy[T] && dist(e, u) < 320)) {
      let best: Pt | null = null, bd = 380;
      for (const f of g.terrain.forestPx) { const d = dist(f, u); if (d < bd) { bd = d; best = f; } }
      if (best) { u.order = MOVE(best.x + g.rand(-12, 12), best.y + g.rand(-12, 12)); u.target = null; u.idleT = 0; continue; }
      if (!g.trenchAt(u.x, u.y)) { u.order = { kind: 'dig', x: u.x, y: u.y, target: null }; u.digT = DIG_TIME; u.idleT = 0; continue; }
    }
    if (u.idleT > (u.cover === 'forest' ? 6 : 12) && !g.trenchAt(u.x, u.y) && !u.shaken) { u.order = { kind: 'dig', x: u.x, y: u.y, target: null }; u.digT = DIG_TIME; u.idleT = 0; }
  }
  bot.artyT -= dt;
  if (bot.artyT <= 0) {
    bot.artyT = 5;
    const arty = g.units.filter(u => u.team === T && !u.dead && u.def.indirect);
    const recon = g.units.filter(u => u.team === T && !u.dead && u.def.recon);
    if (arty.length || recon.length) {
      const enemyHq = g.structs.find(s => s.team === E && s.type === 'hq');
      const held = g.depots.filter(d => d.owner === T);
      const toward = T === RU ? 1 : -1;
      let fb: Pt = { x: bot.staging.x, y: bot.staging.y };
      if (held.length && enemyHq) { held.sort((a, b) => dist(a, enemyHq) - dist(b, enemyHq)); fb = { x: held[0].x, y: held[0].y - toward * 90 }; }
      // guns belong in the trees: the firebase snaps to the nearest wood within 320
      { let best: Pt | null = null, bd = 320; for (const f of g.terrain.forestPx) { const d = dist(f, fb); if (d < bd) { bd = d; best = f; } } if (best) fb = { x: best.x, y: best.y }; }
      for (const u of arty) if (u.order.kind === 'idle' && dist(u, fb) > 90) { u.order = MOVE(fb.x + g.rand(-50, 50), fb.y + g.rand(-30, 30)); g.planRoute(u, u.order.x, u.order.y); }
      for (const u of arty) {
        if (u.order.kind !== 'idle' || u.target) continue;
        const rng = g.rangeOf(u), minR = u.def.minRange || 0;
        const known = g.structs.filter(st => st.team === E && !st.dead).map(st => ({ x: st.x, y: st.y, w: st.type === 'pump' ? 3 : st.type === 'hq' ? 2 : 1 }))
          .concat(g.depots.filter(dp => dp.owner === E).map(dp => ({ x: dp.x, y: dp.y, w: 2 })))
          // counter-battery: enemy guns caught firing by radar
          .concat(g.units.filter(e => e.team === E && !e.dead && e.def.indirect && e.seenBy[T]).map(e => ({ x: e.x, y: e.y, w: 3 })))
          .filter(pnt => { const dd = dist(u, pnt); return dd <= rng && dd >= minR; });
        if (known.length) { known.sort((a, b) => b.w - a.w || dist(u, a) - dist(u, b)); u.order = { kind: 'bombard', x: known[0].x, y: known[0].y, target: null }; }
      }
      recon.forEach((u, k) => { if (u.order.kind === 'idle') { const tx = fb.x + (k - 1) * 150, ty = fb.y + toward * 230; if (dist(u, { x: tx, y: ty }) > 60) u.order = MOVE(tx, ty); } });
    }
  }
  bot.raidT = (bot.raidT === undefined ? 120 : bot.raidT) - dt;
  if (bot.raidT <= 0 && t > 150 && !g.botPassive) {
    bot.raidT = 100;
    const targets = g.pumpSites.filter(ps => ps.team === E && ps.struct && !ps.struct.dead);
    if (targets.length) {
      targets.sort((a, b) => dist(a, bot.staging) - dist(b, bot.staging));
      const tgt = targets[0].struct!;
      const raiders = g.units.filter(u => u.team === T && !u.dead && u.def.kamikaze && !u.def.structuresOnly && u.order.kind === 'idle').slice(0, 4);
      for (const u of raiders) { u.order = ATTACK(tgt); u.target = tgt; }
      if (raiders.length) { bot.warnT = 4; bot.warnName = 'a pumping station'; }
    }
  }
  if (T === RU) {
    bot.shahedT -= dt;
    if (bot.shahedT <= 0) { bot.shahedT = g.noGerans ? 20 : Math.max(55, 125 - t / 25); if (!g.noGerans) g.spawnShaheds(); }
  }
  if (bot.warnT > 0) { bot.warnT -= dt; if (bot.warnT <= 0) g.notify(E, 'Enemy column moving toward ' + bot.warnName); }
  // squads take on extra operators when people are spare, so more drones can fly
  bot.opsT = (bot.opsT === undefined ? 40 : bot.opsT) - dt;
  if (bot.opsT <= 0) {
    bot.opsT = 30;
    if (g.needsOperator(UNITS.fpv, T) && g.freePeople(T) > 12) {
      const sq = g.units.filter(u => u.team === T && !u.dead && u.def.operator && (u.ops || 1) < 4).sort((a, b) => (a.ops || 1) - (b.ops || 1))[0];
      if (sq) g.apply(T, { kind: 'ops', ids: [sq.id], delta: 1 });
    }
  }
  bot.resT = (bot.resT === undefined ? 200 : bot.resT) - dt;
  if (bot.resT <= 0) {
    bot.resT = 90;
    const prio = ['auto1', 'training', 'armorDrone', 'cages', 'auto2', 'aaRange', 'repeaters', 'logistics', 'medevac', 'evasion', 'ammo', 'gunnery', 'relay', 'thermal', 'auto3', 'nightOps', 'ewPlus', 'shells', 'mobilization', 'freqHop', 'aid'];
    const pick = prio.find(k => g.upgAvailable(T, k) && g.funds[T] >= UPGRADES[k].cost * 0.6);
    if (pick) { g.funds[T] = Math.max(0, g.funds[T] - UPGRADES[pick].cost * 0.6); g.upgrades[T][pick] = true; if (pick === 'mobilization') g.people[T].total = Math.min(240, g.people[T].total + 40); }
  }
}

function botSpend(g: Game, bot: Bot) {
  const T = bot.team, E = 1 - T, t = g.gameTime;
  const count = g.units.filter(u => u.team === T && !u.dead && !u.def.auto).length;
  if (count > 90) return;
  const recon = g.units.filter(u => u.team === T && !u.dead && u.def.recon).length;
  const enemyEW = g.structs.some(s => s.team === E && !s.dead && s.build >= 1 && s.def.jam) || g.units.some(u => u.team === E && !u.dead && u.def.jam);
  const autonomous = !g.needsOperator(UNITS.fpv, T);
  const slots = autonomous ? 99 : g.freeSlots(T), hasOp = slots > 0 ? 1 : 0, fiberOp = g.freeSlots(T) > 0 ? 1 : 0;
  const table: [string, number][] = ([
    ['fpv', (enemyEW ? 3 : 6) * hasOp], ['fiberFpv', (enemyEW ? (t > 120 ? 4 : 0) : (t > 240 ? 2 : 0)) * fiberOp], ['moto', t > 45 ? 3 : 0], ['infantry', slots < 2 ? 6 : 2],
    ['fireGroup', t > 60 ? 2 : 0], ['mavic', (recon < 3 ? 1 : 0) * hasOp], ['fwRecon', (recon < 3 && t > 90 ? 0.7 : 0) * hasOp], ['interceptor', (t > 150 ? 1.5 : 0) * hasOp], ['bomber', (t > 240 ? 1.5 : 0) * hasOp],
    ['dprk', T === RU && t > 90 && g.typeCount(RU, 'dprk') < UNITS.dprk.cap! ? 1.5 : 0], ['merc', t > 150 && g.typeCount(T, 'merc') < UNITS.merc.cap! && g.funds[T] > 400 ? 1 : 0],
    ['lancet', (T === RU && t > 120 ? 1.5 : 0) * hasOp], ['molniya', (T === RU && t > 180 ? 1.5 : 0) * hasOp], ['liutyi', T === UA && t > 300 ? 0.6 : 0],
    ['jammer', t > 120 ? 1.5 : 0], ['aa', t > 90 ? 1.5 : 0.7], ['ifv', t > 150 ? 1.2 : 0], ['tank', t > 300 ? 0.7 : 0],
    ['howitzer', t > 200 ? (enemyEW ? 2 : 1.2) : 0], ['mlrs', t > 500 ? 0.6 : 0],
  ] as [string, number][]).filter(x => x[1] > 0);
  if (!table.length) return;
  if (!bot.pending) bot.pending = weightedPick(g, table);
  for (let guard = 0; guard < 4 && bot.pending; guard++) {
    const def = UNITS[bot.pending];
    const fac = g.structs.find(s => s.team === T && !s.dead && s.build >= 1 && s.type === def.factory && s.queue.length < 4);
    if (!fac || g.freePeople(T) < g.crewOf(def, T) || (g.needsOperator(def, T) && g.freeSlots(T) < 1) || (def.side !== undefined && def.side !== T) || (def.cap && g.typeCount(T, bot.pending) >= def.cap) || (FUEL_USERS.has(bot.pending) && g.supply[T].fuelUsed + 1 > g.supply[T].fuelCap) || (def.electric && g.supply[T].powerUsed + 1 > g.supply[T].powerCap) || (def.troop && g.supply[T].foodUsed + 1 > g.supply[T].foodCap + 2)) { bot.pending = weightedPick(g, table); continue; }
    if (g.funds[T] < def.cost) break;
    g.funds[T] -= def.cost; fac.queue.push(bot.pending);
    bot.pending = weightedPick(g, table);
  }
}

function botLaunch(g: Game, bot: Bot, group: Unit[]) {
  const T = bot.team, E = 1 - T;
  let target: Pt | null = null, name = '';
  const contested = g.depots.concat(g.resources).filter(d => d.owner !== T);
  if (contested.length) {
    const want = (d: typeof contested[number]) => (g.supply[T].food < 1 && d.kind === 'wheat') || (g.supply[T].fuel < 1 && d.kind === 'gas') ? 0 : 1;
    contested.sort((a, b) => want(a) - want(b) || dist(a, bot.staging) - dist(b, bot.staging));
    target = contested[0]; name = contested[0].name;
  } else {
    const es = g.structs.filter(s => s.team === E && !s.dead);
    if (!es.length) return;
    es.sort((a, b) => dist(a, bot.staging) - dist(b, bot.staging));
    target = es[0]; name = 'your base';
  }
  for (const u of group) { u.order = MOVE(target.x + g.rand(-70, 70), target.y + g.rand(-70, 70)); u.target = null; g.planRoute(u, u.order.x, u.order.y); }
  bot.warnT = 6; bot.warnName = name;
}
