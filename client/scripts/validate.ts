// Checks the data tables and the levels for mistakes the type checker cannot see: a unit whose factory
// does not build it, a posture set for a unit that does not exist, a level that names a site that is not
// on the map. Run it after editing anything under src/game/data or src/game/levels:
//
//   npm run validate
//
// Exit code 1 and a list of problems if anything is wrong; nothing but "ok" otherwise.
import {
  UNITS,
  STRUCTS,
  CIV_TYPES,
  BUILDABLE,
  UPGRADES,
  TECH_BRANCHES,
  MODE_SETS,
  MODE_SET_OF,
  BARKS,
  BARKS_TTS,
  BARK_GLOSS,
  HOTKEYS,
  MISSIONS,
  STARTS,
  FUEL_USERS,
} from '../src/game/data';
import { MAPS } from '../src/game/maps';
import { SHAPES } from '../src/game/render/shapes';
import { LEVELS } from '../src/game/levels';
import { Game, DT } from '../src/game/sim';

const problems: string[] = [];
const bad = (what: string) => problems.push(what);

// ---------------------------------------------------------------- units
const TARGET_CLASSES = ['inf', 'veh', 'struct', 'air'];
for (const [key, u] of Object.entries(UNITS)) {
  const at = 'UNITS.' + key;
  if (!Array.isArray(u.label) || u.label.length !== 2) bad(at + ': label must be [Ukrainian name, Russian name]');
  if (!SHAPES.includes(u.shape))
    bad(at + ": shape '" + u.shape + "' is not drawn by render/shapes.ts (" + SHAPES.join(', ') + ')');
  if (u.factory !== null) {
    const f = STRUCTS[u.factory];
    if (!f) bad(at + ": factory '" + u.factory + "' is not in STRUCTS");
    else if (!f.produces || !f.produces.includes(key))
      bad(at + ': STRUCTS.' + u.factory + '.produces does not list it');
  }
  if (u.side !== undefined && u.side !== 0 && u.side !== 1) bad(at + ': side must be 0 (Ukraine) or 1 (Russia)');
  if (u.targets)
    for (const t of u.targets) if (!TARGET_CLASSES.includes(t)) bad(at + ": unknown target class '" + t + "'");
  if (u.kamikaze && !u.targets) bad(at + ': a kamikaze drone needs targets');
  if (u.dmg > 0 && !u.kamikaze && !u.targets) bad(at + ': it has damage but no targets, so it will never shoot');
  if (u.dmg > 0 && !u.kamikaze && !u.range) bad(at + ': it has damage but no range');
  if (u.prefer) for (const p of u.prefer) if (!UNITS[p]) bad(at + ": prefers unknown unit '" + p + "'");
  if (u.operated && !u.air) bad(at + ': only aircraft are operated');
  if (u.electric && !u.endurance) bad(at + ': a battery drone needs endurance');
  if (u.indirect && !u.ammo) bad(at + ': artillery needs ammo');
  if (u.cost < 0 || u.hp <= 0 || u.speed < 0 || u.r <= 0) bad(at + ': cost, hp, speed, and r must be sensible');
  if (u.crew < 0) bad(at + ': crew cannot be negative');
}
for (const t of FUEL_USERS) if (!UNITS[t]) bad("FUEL_USERS names unknown unit '" + t + "'");

// ---------------------------------------------------------------- buildings
for (const [key, s] of Object.entries(STRUCTS)) {
  const at = 'STRUCTS.' + key;
  if (s.produces) {
    if (s.produces.length > HOTKEYS.length)
      bad(at + ': produces more than ' + HOTKEYS.length + ' units, no hotkey for the rest');
    for (const p of s.produces) {
      if (!UNITS[p]) bad(at + ": produces unknown unit '" + p + "'");
      else if (UNITS[p].factory !== key)
        bad(at + ": produces '" + p + "' but UNITS." + p + ".factory is '" + UNITS[p].factory + "'");
    }
  }
  if (s.heal && !s.healRate) bad(at + ': heal needs healRate');
  if (s.tunnel && !s.netR) bad(at + ': a net tunnel needs netR');
}
for (const b of BUILDABLE) if (!STRUCTS[b]) bad("BUILDABLE names unknown building '" + b + "'");
// ---------------------------------------------------------------- maps
for (const [id, m] of Object.entries(MAPS)) {
  const at = 'map ' + id;
  const placeNames = new Set(m.places.map(p => p[0]));
  const townNames = new Set(m.towns.map(t => t[0]));
  for (const c of m.cities) if (!placeNames.has(c)) bad(at + ": city '" + c + "' is not in places");
  for (const [type, nation, place] of m.civSites) {
    if (!CIV_TYPES[type]) bad(at + ": unknown civilian type '" + type + "'");
    if (nation !== 0 && nation !== 1) bad(at + ': civSites nation must be 0 or 1 for ' + type + ' at ' + place);
    if (!placeNames.has(place)) bad(at + ": civSites names unknown place '" + place + "'");
  }
  for (const t of m.volunteerTowns) if (!townNames.has(t)) bad(at + ": volunteerTowns names unknown town '" + t + "'");
  for (const t of m.firstTowns) if (!townNames.has(t)) bad(at + ": firstTowns names unknown town '" + t + "'");
  for (const pl of m.pipelines)
    for (const i of pl.pumps)
      if (i < 0 || i >= pl.pts.length) bad(at + ': pipeline ' + pl.name + ' pump index ' + i + ' is off the line');
  if (m.towns.length < 2) bad(at + ': needs at least two towns');
  if (m.borderLabelAt >= m.border.length) bad(at + ': borderLabelAt is past the end of the border');
  if (m.geo(m.bounds.lat0, m.bounds.lon0).y < m.geo(m.bounds.lat1, m.bounds.lon1).y)
    bad(at + ': lat0 must be the southern edge');
  if (m.hq[0].y < m.hq[1].y) bad(at + ': Ukraine must be the southern side (its city below the Russian one)');
}

// ---------------------------------------------------------------- research and postures
for (const [key, u] of Object.entries(UPGRADES)) {
  if (u.requires && !UPGRADES[u.requires]) bad('UPGRADES.' + key + ": requires unknown '" + u.requires + "'");
  if (!TECH_BRANCHES.includes(u.branch)) bad('UPGRADES.' + key + ": branch '" + u.branch + "' is not in TECH_BRANCHES");
}
for (const [set, defs] of Object.entries(MODE_SETS)) {
  const keys = defs.map(d => d.key);
  if (new Set(keys).size !== keys.length) bad('MODE_SETS.' + set + ': duplicate posture keys');
  if (!defs.length) bad('MODE_SETS.' + set + ': empty');
  if (!Object.values(MODE_SET_OF).includes(set)) bad('MODE_SETS.' + set + ': no unit uses it (MODE_SET_OF)');
}
for (const [type, set] of Object.entries(MODE_SET_OF)) {
  if (!UNITS[type]) bad("MODE_SET_OF: unknown unit '" + type + "'");
  if (!MODE_SETS[set]) bad('MODE_SET_OF.' + type + ": unknown set '" + set + "'");
}

// ---------------------------------------------------------------- barks
for (const [kind, sides] of Object.entries(BARKS)) {
  for (const T of [0, 1]) {
    if (!sides[T].length) bad('BARKS.' + kind + ': side ' + T + ' has no phrases');
    for (const phrase of sides[T]) {
      if (!BARKS_TTS[phrase]) bad("BARKS_TTS is missing the voice line for '" + phrase + "'");
      if (!BARK_GLOSS[phrase]) bad("BARK_GLOSS is missing the English for '" + phrase + "'");
    }
  }
}

// ---------------------------------------------------------------- goals and starts
for (const [key, m] of Object.entries(MISSIONS))
  if (m.goal <= 0 || m.reward <= 0) bad('MISSIONS.' + key + ': goal and reward must be positive');
for (const [key, s] of Object.entries(STARTS)) if (!s.label || !s.desc) bad('STARTS.' + key + ': needs label and desc');

// ---------------------------------------------------------------- levels: build each one and poke every callback
const ids = new Set<string>();
for (const l of LEVELS) {
  const at = 'level ' + l.id;
  if (ids.has(l.id)) bad(at + ': duplicate id');
  ids.add(l.id);
  if (l.side !== 0 && l.side !== 1) bad(at + ': side must be 0 or 1');
  if (!MAPS[l.map]) {
    bad(at + ": map '" + l.map + "' is not in MAPS");
    continue;
  }
  if (!l.objectives.length) bad(at + ': no objectives');
  if (!l.briefing.length) bad(at + ': no briefing lines');
  const titles = l.objectives.map(o => o.title);
  if (new Set(titles).size !== titles.length) bad(at + ': duplicate objective titles');
  let g: Game;
  try {
    g = new Game({
      seed: 1,
      bots: [l.side === 1, l.side === 0],
      difficulty: l.difficulty,
      passive: true,
      noGerans: true,
      scenario: l.scenario,
      map: l.map,
      start: l.start,
    });
  } catch (e) {
    bad(at + ': scenario threw: ' + (e as Error).message);
    continue;
  }
  try {
    const shots = l.shots(g);
    if (!shots.length) bad(at + ': shots() returned no points');
    for (const p of shots)
      if (typeof p.x !== 'number' || typeof p.y !== 'number') bad(at + ': shots() returned something without x and y');
  } catch (e) {
    bad(at + ': shots() threw: ' + (e as Error).message);
  }
  const ctx = { camMoved: false, selection: [], formation: 'wedge' as const, groups: 0 };
  l.objectives.forEach((o, i) => {
    const step = at + ' step ' + (i + 1) + ' (' + o.title + ')';
    try {
      o.onStart?.(g);
    } catch (e) {
      bad(step + ': onStart threw: ' + (e as Error).message);
    }
    try {
      o.marker?.(g);
    } catch (e) {
      bad(step + ': marker threw: ' + (e as Error).message);
    }
    try {
      if (o.done(g, ctx)) bad(step + ': is already done when the level starts');
    } catch (e) {
      bad(step + ': done threw: ' + (e as Error).message);
    }
  });
  // a few seconds of play so a scenario that breaks the sim shows up here, not in the browser
  try {
    for (let t = 0; t < 300; t++) g.tick(DT);
    for (const o of l.objectives) o.done(g, ctx);
  } catch (e) {
    bad(at + ': the game threw within five seconds: ' + (e as Error).message);
  }
}

if (problems.length) {
  console.error(problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ':');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(
  'ok: ' +
    Object.keys(UNITS).length +
    ' units, ' +
    Object.keys(STRUCTS).length +
    ' buildings, ' +
    Object.keys(UPGRADES).length +
    ' research items, ' +
    LEVELS.length +
    ' levels'
);
