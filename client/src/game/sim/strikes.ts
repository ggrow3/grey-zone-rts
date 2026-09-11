// Strikes from beyond the map: glide bombs, Iskander missiles, deep strikes on refineries, and the Geran waves.
import { UA, RU, TEAMS, STRIKES } from '../data';
import { W, H, H_LAND } from '../map';
import { hyp, dist } from '../dmath';
import type { Game } from './game';
import { ATTACK } from './orders';
import { credit } from './combat';

/** announce a strike; it lands after the warning unless air defense near the point catches it */
export function scheduleStrike(
  g: Game,
  team: number,
  kind: 'kab' | 'missile',
  x: number,
  y: number,
  targetId?: number
) {
  const spec = kind === 'kab' ? STRIKES.kab : STRIKES.missile;
  g.strikes.push({ team, kind, x, y, at: g.gameTime + spec.warn, targetId });
  g.effects.push({
    kind: 'alert',
    x,
    y,
    t: 0,
    dur: spec.warn,
    team: 1 - team,
    text: kind === 'kab' ? 'GLIDE BOMB' : 'MISSILE',
  });
  g.notify(
    1 - team,
    (kind === 'kab' ? 'Air raid: glide bomb inbound at ' : 'Ballistic missile inbound at ') +
      g.map.nearestPlace(x, y) +
      ', ' +
      spec.warn +
      ' seconds'
  );
  g.addLog(
    team,
    'info',
    TEAMS[team].name +
      (kind === 'kab' ? ' launched a glide bomb at ' : ' fired a ballistic missile at ') +
      g.map.nearestPlace(x, y)
  );
}

export function updateStrikes(g: Game) {
  for (const s of g.strikes) {
    if (g.gameTime < s.at) continue;
    const E = 1 - s.team,
      spec = s.kind === 'kab' ? STRIKES.kab : STRIKES.missile;
    const p = s.kind === 'missile' && s.targetId !== undefined ? g.find(s.targetId) || s : s;
    const chance = g.upgrades[E].samNet ? spec.interceptUp : spec.intercept;
    let shot = false;
    for (const a of g.units) {
      if (a.dead || a.team !== E || a.type !== 'aa' || g.modeOf(a) === 'passive') continue;
      if (dist(a, p) < 260 && g.rng.next() < chance) {
        shot = true;
        credit(g, a, a);
        a.kills = a.kills || 0;
        break;
      }
    }
    if (shot) {
      g.stats.intercepted[E]++;
      g.effects.push({ kind: 'boom', x: p.x + g.rand(-60, 60), y: p.y - 90, r: 40, t: 0, dur: 0.9 });
      g.notify(E, (s.kind === 'kab' ? 'Glide bomb' : 'Missile') + ' shot down over ' + g.map.nearestPlace(p.x, p.y));
      g.notify(s.team, 'Strike intercepted');
      g.addLog(
        E,
        'info',
        TEAMS[E].name +
          ' shot down a ' +
          (s.kind === 'kab' ? 'glide bomb' : 'ballistic missile') +
          ' over ' +
          g.map.nearestPlace(p.x, p.y)
      );
    } else {
      const fromN = s.team === RU;
      const sx = p.x + (fromN ? 120 : -120),
        sy = fromN ? Math.max(10, p.y - 900) : Math.min(H - 10, p.y + 900);
      const dd = hyp(p.x - sx, p.y - sy);
      g.projectiles.push({
        x: sx,
        y: sy,
        sx,
        sy,
        tx: p.x,
        ty: p.y,
        t: 0,
        dur: dd / (s.kind === 'kab' ? 420 : 900),
        dmg: spec.dmg,
        splash: spec.splash,
        team: s.team,
        arc: s.kind === 'kab' ? 60 : 140,
        rocket: s.kind === 'missile',
        dead: false,
        strike: s.kind,
      });
    }
  }
  g.strikes = g.strikes.filter(s => g.gameTime < s.at);
  if (g.deepPending && g.gameTime >= g.deepPending.at) {
    const d = g.deepPending;
    g.deepPending = null;
    if (d.hit) {
      g.refineryHits.push(g.gameTime + STRIKES.deep.burn);
      g.stats.refineries++;
      g.notify(
        -1,
        'A Russian refinery is burning: Russian income down ' +
          Math.round((1 - Math.pow(STRIKES.deep.incomeMul, g.refineriesBurning())) * 100) +
          '% for four minutes, glide bombs slower to come'
      );
      g.addLog(UA, 'info', 'Deep strike: a refinery inside Russia is burning');
    } else {
      g.notify(-1, 'The deep strike was shot down over Russia');
      g.addLog(RU, 'info', 'Russian air defense downed a Liutyi over the interior');
    }
  }
}

/** Geran waves against Ukrainian buildings, launched by the Russian side (bot or timer) */
export function spawnShaheds(g: Game, count?: number, powerFirst = false) {
  const targets = g.structs.filter(s => (s.team === UA || (s.civ && s.nation === 0)) && !s.dead);
  if (!targets.length) return;
  const n = count ?? Math.min(6, 1 + Math.floor(g.gameTime / 200));
  const power = powerFirst ? targets.find(s => s.civ && s.type === 'power') : undefined;
  g.addLog(-1, 'wave', 'Geran wave: ' + n + ' drones and ' + (n + 1) + ' decoys launched at ' + g.map.cities[UA]);
  for (let i = 0; i < n * 2 + 1; i++) {
    const type =
      i < n
        ? g.gameTime > 900 && i === 0
          ? 'geran5'
          : g.gameTime > 600 && i < Math.max(1, Math.floor(n / 3))
            ? 'geran3'
            : 'geran'
        : 'gerbera';
    const roll = g.rng.next();
    const u =
      roll < 0.4
        ? g.makeUnit(type, RU, g.rand(W * 0.3, W - 40), 10)
        : roll < 0.65
          ? g.makeUnit(type, RU, W - 10, g.rand(40, H_LAND * 0.5))
          : g.makeUnit(type, RU, g.rand(W * 0.35, W - 60), H - 10);
    const pool = targets.flatMap(s =>
      s.type === 'hq'
        ? [s]
        : s.civ
          ? s.type === 'power'
            ? [s, s, s, s, s]
            : [s, s]
          : s.type === 'powerPlant'
            ? [s, s, s, s, s]
            : s.type === 'pylon'
              ? [s]
              : [s, s, s]
    );
    const t = i < 2 && power ? power : g.rng.pick(pool);
    u.order = ATTACK(t);
    u.target = t;
    g.units.push(u);
  }
  g.notify(UA, 'Gerans and decoys inbound from the north, east, and south');
}
