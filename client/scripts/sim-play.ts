// Plays the game headless in the terminal, so a new unit or level can be tried without opening the browser.
//
//   npm run sim:play -- list                           the levels, units, and starts you can name
//   npm run sim:play -- skirmish [options]             bot against bot on the open map
//   npm run sim:play -- level <id> [options]           a level with the bot playing the enemy (the player's side sits idle
//                                                      unless --both-bots), reporting which objectives the situation completes
//   npm run sim:play -- unit <type> [options]          one unit against a few enemies in the open: does it fight, what does it kill
//
// Options: --minutes 5   --seconds 60   --seed 7   --side 0|1   --difficulty 0.7   --start night|winter|rush
//          --both-bots   --vs infantry,tank,aa   --quiet
import { Game, DT } from '../src/game/sim';
import type { GameOptions } from '../src/game/sim';
import { LEVELS, levelById } from '../src/game/levels';
import { UA, RU, UNITS, TEAMS, STARTS } from '../src/game/data';
import { MAPS, DEFAULT_MAP } from '../src/game/maps';
import type { Unit } from '../src/game/types';

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const command = args[0];
function opt(name: string, fallback: string): string {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const flag = (name: string) => args.includes('--' + name);
const minutes = Number(opt('minutes', '0')) || 0;
const seconds = minutes ? minutes * 60 : Number(opt('seconds', '0')) || 0;
const seed = Number(opt('seed', '1')) | 0;
const side = Number(opt('side', '0')) === 1 ? 1 : 0;
const difficulty = Number(opt('difficulty', '0.7'));
const quiet = flag('quiet');

const name = (team: number, type: string) => (UNITS[type] ? UNITS[type].label[team] : type);
const fmt = (t: number) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

/** run the game for a while, printing a status line each minute */
function play(g: Game, totalSeconds: number, onMinute?: (g: Game) => void) {
  const ticks = Math.round(totalSeconds / DT);
  let nextReport = 60;
  for (let t = 0; t < ticks && !g.gameOver; t++) {
    g.tick(DT);
    if (g.gameTime >= nextReport) {
      nextReport += 60;
      if (!quiet) status(g);
      onMinute?.(g);
    }
  }
}
function status(g: Game) {
  const cols = [UA, RU].map(T => {
    const n = g.units.filter(u => u.team === T && !u.dead && !u.def.auto).length;
    const towns = g.depots.filter(d => d.owner === T).length;
    return (
      TEAMS[T].name.padEnd(8) +
      String(Math.floor(g.funds[T])).padStart(6) +
      ' funds ' +
      String(n).padStart(3) +
      ' units ' +
      towns +
      ' towns ' +
      g.stats.kills[T] +
      ' kills ' +
      Math.round(g.stats.score[T]) +
      ' pts'
    );
  });
  console.log(fmt(g.gameTime).padStart(6) + '  ' + cols.join('   |   '));
}
function summary(g: Game) {
  console.log('');
  console.log('after ' + fmt(g.gameTime) + (g.gameOver ? ': ' + TEAMS[g.winner].name + ' won' : ': no winner yet'));
  for (const T of [UA, RU]) {
    const ko = Object.entries(g.stats.killsOf[T])
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => n + ' ' + name(1 - T, k).toLowerCase())
      .join(', ');
    const built: Record<string, number> = {};
    for (const u of g.units) if (u.team === T && !u.dead && !u.def.auto) built[u.type] = (built[u.type] || 0) + 1;
    const army = Object.entries(built)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => n + ' ' + name(T, k).toLowerCase())
      .join(', ');
    console.log(
      '  ' +
        TEAMS[T].name +
        ': ' +
        g.stats.kills[T] +
        ' kills (' +
        (ko || 'none') +
        '), lost ' +
        g.stats.lost[T] +
        ', army: ' +
        (army || 'nothing')
    );
  }
  const tail = g.log.slice(-8);
  if (tail.length) {
    console.log('  last log lines:');
    for (const l of tail) console.log('    ' + fmt(l.at) + ' ' + l.text);
  }
}

// ---------------------------------------------------------------- commands
if (command === 'list') {
  console.log('levels:  ' + LEVELS.map(l => l.id).join(', '));
  console.log('units:   ' + Object.keys(UNITS).join(', '));
  console.log('starts:  ' + Object.keys(STARTS).join(', '));
  console.log('maps:    ' + Object.keys(MAPS).join(', '));
} else if (command === 'skirmish') {
  const opts: GameOptions = {
    seed,
    bots: [true, true],
    difficulty,
    start: opt('start', 'standard'),
    map: opt('map', DEFAULT_MAP),
  };
  console.log(
    'skirmish on the ' +
      MAPS[opts.map!].name +
      ', seed ' +
      seed +
      ', difficulty ' +
      difficulty +
      ', start ' +
      opts.start +
      ', ' +
      (seconds || 300) +
      ' s'
  );
  const g = new Game(opts);
  play(g, seconds || 300);
  summary(g);
} else if (command === 'level') {
  const l = levelById(args[1] || '');
  if (!l) {
    console.error('unknown level; one of: ' + LEVELS.map(x => x.id).join(', '));
    process.exit(1);
  }
  const both = flag('both-bots');
  const g = new Game({
    seed,
    bots: both ? [true, true] : [l.side === 1, l.side === 0],
    difficulty: l.difficulty,
    passive: 0 < l.passiveUntil,
    noGerans: 0 < l.noGeransUntil,
    scenario: l.scenario,
    map: l.map,
    start: l.start,
  });
  console.log(
    l.title +
      ' as ' +
      TEAMS[l.side].name +
      (both ? ', both sides played by the bot' : ', the enemy played by the bot') +
      ', ' +
      (seconds || 180) +
      ' s'
  );
  const ctx = { camMoved: true, selection: [], formation: 'wedge' as const, groups: 0 };
  const done = new Set<number>();
  const check = (g: Game) => {
    l.objectives.forEach((o, i) => {
      if (!done.has(i) && o.done(g, ctx)) {
        done.add(i);
        console.log('        objective ' + (i + 1) + ' would be done now: ' + o.title);
      }
    });
  };
  l.objectives[0]?.onStart?.(g);
  play(g, seconds || 180, check);
  check(g);
  summary(g);
  console.log('  objectives: ' + l.objectives.map((o, i) => (done.has(i) ? '[x] ' : '[ ] ') + o.title).join('  '));
} else if (command === 'unit') {
  const type = args[1] || '';
  if (!UNITS[type]) {
    console.error('unknown unit; one of: ' + Object.keys(UNITS).join(', '));
    process.exit(1);
  }
  const team = side,
    enemy = 1 - team;
  const vs = opt('vs', 'infantry,ifv').split(',').filter(Boolean);
  // an empty map corner: both bots off, nothing else moving
  const g = new Game({
    seed,
    bots: [false, false],
    difficulty: 1,
    passive: true,
    noGerans: true,
    map: opt('map', DEFAULT_MAP),
  });
  const cx = g.map.hq[team].x,
    cy = g.map.hq[team].y - 600;
  const spotter = g.spawn('infantry', team, cx - 40, cy);
  void spotter;
  const u = g.spawn(type, team, cx, cy);
  const targets: Unit[] = [];
  vs.forEach((t, i) => {
    if (UNITS[t]) targets.push(g.spawn(t, enemy, cx + 40 * (i - (vs.length - 1) / 2), cy - 150));
    else if (!g.structs.some(s => s.type === t)) console.log('  (no unit called ' + t + ')');
  });
  const struct = g.build('radar', enemy, cx + 120, cy - 170);
  const hp0 = targets.reduce((a, t) => a + t.hp, 0) + (struct ? struct.hp : 0);
  g.tick(DT);
  const seen = targets.filter(t => t.seenBy[team]).length;
  console.log(
    name(team, type) +
      ' (' +
      type +
      ') for ' +
      TEAMS[team].name +
      ' against ' +
      targets.map(t => t.def.label[enemy]).join(', ') +
      ' and a radar post, ' +
      (seconds || 60) +
      ' s'
  );
  console.log(
    '  grounded: ' +
      !!u.grounded +
      ', operator: ' +
      (u.operator ? u.operator.def.label[team] : 'none') +
      ', enemies seen at start: ' +
      seen +
      '/' +
      targets.length
  );
  const first = targets[0] ?? struct;
  if (first) g.apply(team, { kind: 'attack', ids: [u.id], targetId: first.id });
  let shots = 0;
  const ticks = Math.round((seconds || 60) / DT);
  for (let t = 0; t < ticks; t++) {
    const before = g.effects.length;
    g.tick(DT);
    for (let i = before; i < g.effects.length; i++)
      if (g.effects[i].kind === 'tracer' || g.effects[i].kind === 'flash') shots++;
    if (u.dead) break;
  }
  const hp1 = targets.reduce((a, t) => a + (t.dead ? 0 : t.hp), 0) + (struct ? (struct.dead ? 0 : struct.hp) : 0);
  console.log(
    '  after ' +
      fmt(g.gameTime) +
      ': ' +
      (u.dead ? 'the unit is dead' : 'alive with ' + Math.round(u.hp) + '/' + u.def.hp + ' hp') +
      ', ' +
      shots +
      ' shots seen, ' +
      Math.round(hp0 - hp1) +
      ' damage dealt, ' +
      g.stats.kills[team] +
      ' kills' +
      (struct && struct.dead ? ', the radar post is down' : '')
  );
  console.log(
    '  targets: ' +
      targets.map(t => t.def.label[enemy] + ' ' + (t.dead ? 'dead' : Math.round(t.hp) + '/' + t.def.hp)).join(', ')
  );
  const tail = g.log.slice(-5);
  for (const l of tail) console.log('    ' + fmt(l.at) + ' ' + l.text);
  if (!shots && !(hp0 - hp1))
    console.log('  nothing happened: check targets, range, dmg, and (for a drone) that a squad flies it');
} else {
  console.log(
    'usage: sim-play list | skirmish | level <id> | unit <type>   (options in the header of scripts/sim-play.ts)'
  );
  process.exit(command ? 1 : 0);
}
