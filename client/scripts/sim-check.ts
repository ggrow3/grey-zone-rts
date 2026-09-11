// Determinism check for the simulation. Two lockstep clients must produce the same state from the same seed
// and commands, so the simulation must never touch Math.random, Math.sin, or anything else that could differ.
//
// Runs a set of scripted games (bot against bot, a scripted Ukrainian player, a scripted Russian player,
// every skirmish start, every teaching level) and takes a digest of the state along the way.
//
//   npm run sim:check                        run every scenario twice and check the two runs agree
//   npm run sim:check -- --write base.json   also save the digest to a file
//   npm run sim:check -- --compare base.json compare with a saved digest: a refactor that must not change
//                                            the rules should match it byte for byte
import { readFileSync, writeFileSync } from 'node:fs';
import { Game, DT } from '../src/game/sim';
import type { GameOptions } from '../src/game/sim';
import { LEVELS } from '../src/game/levels';
import { UA, RU, STARTS } from '../src/game/data';
import type { Command, Unit } from '../src/game/types';

type Script = (g: Game, tick: number) => Command[];
interface Digest {
  name: string;
  hashes: string[];
  final: Record<string, unknown>;
}

const HASH_EVERY = 300;

function digest(
  name: string,
  opts: GameOptions,
  ticks: number,
  team = UA,
  script?: Script,
  extra?: (g: Game, tick: number) => unknown
): Digest {
  const g = new Game(opts);
  const hashes: string[] = [];
  const extras: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    if (script) for (const c of script(g, t)) g.apply(team, c);
    g.tick(DT);
    if (t % HASH_EVERY === 0) {
      hashes.push(g.hash());
      if (extra) extras.push(extra(g, t));
    }
  }
  return {
    name,
    hashes,
    final: {
      hash: g.hash(),
      time: Math.round(g.gameTime * 1000) / 1000,
      stats: g.stats,
      funds: g.funds.map(f => Math.round(f * 1000) / 1000),
      people: g.people,
      support: g.support,
      civ: g.civ,
      winner: g.winner,
      units: g.units.length,
      structs: g.structs.length,
      depots: g.depots.map(d => d.owner),
      log: g.log.map(l => l.at.toFixed(2) + ' ' + l.text),
      extras,
    },
  };
}

const own = (g: Game, team: number, type: string): Unit[] =>
  g.units.filter(u => u.team === team && !u.dead && u.type === type);
const ids = (list: { id: number }[]) => list.map(e => e.id);
const struct = (g: Game, team: number, type: string) =>
  g.structs.find(s => s.team === team && s.type === type && !s.dead);

/** a Ukrainian player pressing most of the buttons over the first few minutes */
const uaScript: Script = (g, t) => {
  const hq = g.hq(UA)!;
  const works = struct(g, UA, 'droneWorks')!,
    barracks = struct(g, UA, 'barracks')!,
    depot = struct(g, UA, 'artyDepot')!;
  const lyptsi = g.site('Lyptsi'),
    zhur = g.site('Zhuravlyovka');
  const inf = own(g, UA, 'infantry'),
    fpv = own(g, UA, 'fpv'),
    mavic = own(g, UA, 'mavic'),
    guns = own(g, UA, 'howitzer');
  const seenEnemy = g.units.find(u => u.team === RU && !u.dead && u.seenBy[UA]);
  switch (t) {
    case 10:
      return [
        { kind: 'enqueue', facId: works.id, type: 'fpv' },
        { kind: 'enqueue', facId: works.id, type: 'fpv' },
        { kind: 'enqueue', facId: works.id, type: 'fpv' },
        { kind: 'enqueue', facId: works.id, type: 'mavic' },
        { kind: 'enqueue', facId: barracks.id, type: 'infantry' },
        { kind: 'enqueue', facId: barracks.id, type: 'fireGroup' },
        { kind: 'enqueue', facId: depot.id, type: 'howitzer' },
      ];
    case 20:
      return [
        { kind: 'move', ids: ids(inf), x: lyptsi.x, y: lyptsi.y, formation: 'wedge' },
        {
          kind: 'move',
          ids: ids(own(g, UA, 'ifv')),
          x: lyptsi.x,
          y: lyptsi.y + 40,
          formation: 'line',
          attackMove: true,
        },
      ];
    case 25:
      return [{ kind: 'move', ids: ids(inf), x: lyptsi.x + 30, y: lyptsi.y - 30, formation: 'column', queue: true }];
    case 30:
      return [
        { kind: 'place', type: 'net', x: hq.x - 300, y: hq.y - 300 },
        { kind: 'place', type: 'generator', x: hq.x + 300, y: hq.y - 300 },
        { kind: 'place', type: 'pylon', x: hq.x + 330, y: hq.y - 200 },
        { kind: 'place', type: 'radar', x: hq.x - 320, y: hq.y + 200 },
        { kind: 'place', type: 'aidPost', x: hq.x + 320, y: hq.y + 200 },
        { kind: 'rally', ids: [works.id], x: hq.x, y: hq.y - 320 },
      ];
    case 40:
      return [
        { kind: 'upgrade', key: 'launchRail' },
        { kind: 'upgrade', key: 'cages' },
      ];
    case 50:
      return [{ kind: 'enqueue', facId: works.id, type: 'liutyi' }];
    case 60:
      return inf.length
        ? [
            { kind: 'ops', ids: [inf[0].id], delta: 1 },
            { kind: 'ops', ids: [inf[0].id], delta: 1 },
          ]
        : [];
    case 100:
      return [
        { kind: 'mode', ids: ids(inf), mode: 'creep' },
        { kind: 'mode', ids: ids(fpv), mode: 'hold' },
        { kind: 'mode', ids: ids(mavic), mode: 'low' },
      ];
    case 400:
      return fpv.length >= 2 ? [{ kind: 'swarm', ids: ids(fpv), formation: 'ring' }] : [];
    case 450:
      return [{ kind: 'swarmFormation', swarmId: g.swarms[0]?.id ?? -1, formation: 'line' }];
    case 500:
      return mavic.length ? [{ kind: 'steer', id: mavic[0].id, x: lyptsi.x, y: lyptsi.y - 100 }] : [];
    case 700:
      return [{ kind: 'strike', ids: ids(fpv) }];
    case 800:
      return seenEnemy ? [{ kind: 'attack', ids: ids(fpv), targetId: seenEnemy.id }] : [];
    case 900:
      return [{ kind: 'dig', ids: ids(inf) }];
    case 1200:
      return [{ kind: 'kab', x: zhur.x, y: zhur.y }];
    case 1500:
      return [{ kind: 'recall' }];
    case 1800:
      return [
        { kind: 'mode', ids: ids(inf), mode: 'march' },
        { kind: 'ops', ids: ids(inf), delta: -1 },
      ];
    case 2000:
      return [
        { kind: 'bombard', ids: ids(guns), x: zhur.x, y: zhur.y + 40 },
        { kind: 'mode', ids: ids(guns), mode: 'scoot' },
      ];
    case 2500:
      return works.queue.length ? [{ kind: 'cancel', facId: works.id, index: 0 }] : [];
    case 3000:
      return [{ kind: 'deep' }];
    case 3200:
      return [{ kind: 'place', type: 'netLine', x: lyptsi.x, y: lyptsi.y + 60 }];
    case 4000:
      return [
        { kind: 'upgrade', key: 'auto1' },
        { kind: 'mode', ids: ids(own(g, UA, 'tank')), mode: 'hullDown' },
      ];
    case 4500:
      return [{ kind: 'move', ids: ids(inf), x: hq.x, y: hq.y - 200, formation: 'ring' }];
    case 6000:
      return [{ kind: 'wave' }, { kind: 'iskander', targetId: g.hq(RU)?.id ?? -1 }];
  }
  return [];
};

/** a Russian player: waves, missiles, and a rush */
const ruScript: Script = (g, t) => {
  const works = struct(g, RU, 'droneWorks')!,
    barracks = struct(g, RU, 'barracks')!;
  const zhur = g.site('Zhuravlyovka');
  const inf = own(g, RU, 'infantry');
  switch (t) {
    case 10:
      return [
        { kind: 'enqueue', facId: works.id, type: 'fpv' },
        { kind: 'enqueue', facId: works.id, type: 'lancet' },
        { kind: 'enqueue', facId: barracks.id, type: 'dprk' },
        { kind: 'enqueue', facId: barracks.id, type: 'moto' },
      ];
    case 20:
      return [{ kind: 'move', ids: ids(inf), x: zhur.x, y: zhur.y, formation: 'wedge', attackMove: true }];
    case 100:
      return [{ kind: 'wave' }];
    case 200:
      return [{ kind: 'iskander', targetId: g.hq(UA)?.id ?? -1 }];
    case 300:
      return [{ kind: 'upgrade', key: 'launchRail' }];
    case 400:
      return [
        { kind: 'enqueue', facId: works.id, type: 'molniya' },
        { kind: 'enqueue', facId: works.id, type: 'fwRecon' },
      ];
    case 2000:
      return [{ kind: 'kab', x: g.hq(UA)!.x, y: g.hq(UA)!.y - 200 }];
    case 3000:
      return [
        { kind: 'mode', ids: ids(own(g, RU, 'aa')), mode: 'passive' },
        { kind: 'mode', ids: ids(own(g, RU, 'fireGroup')), mode: 'escort' },
      ];
  }
  return [];
};

function runAll(): Digest[] {
  const out: Digest[] = [];
  out.push(digest('bots-standard', { seed: 12345, bots: [true, true], difficulty: 0.7 }, 12000));
  out.push(digest('bots-hard-seed2', { seed: 987654321, bots: [true, true], difficulty: 0.95 }, 6000));
  out.push(digest('ua-player', { seed: 4242, bots: [false, true], difficulty: 0.7 }, 8000, UA, uaScript));
  out.push(digest('ru-player', { seed: 777, bots: [true, false], difficulty: 0.7 }, 6000, RU, ruScript));
  out.push(digest('sumy-bots', { seed: 555, bots: [true, true], difficulty: 0.7, map: 'sumy' }, 6000));
  out.push(digest('sumy-rush', { seed: 556, bots: [true, true], difficulty: 0.95, map: 'sumy', start: 'rush' }, 3000));
  for (const start of Object.keys(STARTS)) {
    out.push(digest('start-' + start, { seed: 31337, bots: [true, true], difficulty: 0.7, start }, 4000));
  }
  for (const l of LEVELS) {
    out.push(
      digest(
        'level-' + l.id,
        {
          seed: 2024,
          bots: [l.side === 1, l.side === 0],
          difficulty: l.difficulty,
          passive: 0 < l.passiveUntil,
          noGerans: 0 < l.noGeransUntil,
          scenario: l.scenario,
          map: l.map,
          start: l.start,
        },
        3000,
        l.side,
        undefined,
        g => l.objectives.map(o => o.done(g, { camMoved: true, selection: [], formation: 'wedge', groups: 0 }))
      )
    );
  }
  return out;
}

/** the first scenario and tick at which two digests disagree, or null */
function firstDifference(a: Digest[], b: Digest[]): string | null {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i],
      y = b[i];
    if (!x || !y || x.name !== y.name) return 'the scenario list differs at position ' + i;
    const k = x.hashes.findIndex((h, j) => h !== y.hashes[j]);
    if (k >= 0) return x.name + ' diverges at tick ' + k * HASH_EVERY + ' (' + (k * HASH_EVERY * DT).toFixed(0) + ' s)';
    if (JSON.stringify(x.final) !== JSON.stringify(y.final))
      return x.name + ': hashes agree but the final digest differs';
  }
  return null;
}

const args = process.argv.slice(2);
const argAfter = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const writeTo = argAfter('--write');
const compareTo = argAfter('--compare');

const t0 = Date.now();
const first = runAll();
console.log('simulated ' + first.length + ' scenarios in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
let failed = false;

if (writeTo) {
  writeFileSync(writeTo, JSON.stringify(first, null, 1));
  console.log('wrote ' + writeTo);
}
if (compareTo) {
  const base = JSON.parse(readFileSync(compareTo, 'utf8')) as Digest[];
  const diff = firstDifference(base, first);
  if (diff) {
    console.error('DIFFERENT from ' + compareTo + ': ' + diff);
    failed = true;
  } else console.log('matches ' + compareTo);
}
if (!writeTo && !compareTo) {
  const second = runAll();
  const diff = firstDifference(first, second);
  if (diff) {
    console.error(
      'NOT DETERMINISTIC: ' + diff + '. Something in the simulation uses Math.random or another unseeded source.'
    );
    failed = true;
  } else console.log('deterministic: a second run of every scenario produced the same state');
}
process.exit(failed ? 1 : 0);
