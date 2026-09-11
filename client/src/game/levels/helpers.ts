// Building blocks for level scripts and objectives: reused by every level, add your own here.
// Most take the game and return a plain value; the ones that return a function are objective conditions
// (`done`) or markers ready to drop into a level file.
import { UA } from '../data';
import type { Game } from '../sim';
import type { Unit, Struct, Pt } from '../types';
import type { Marker, Objective } from './types';

// ---------------------------------------------------------------- places
/** a town, gas site, or wheat field by name (throws on a wrong name, which `npm run validate` reports) */
export const at = (g: Game, name: string) => g.site(name);
/** a named place on the map (towns, cities, villages), by name; see the map file's `places` */
export const place = (g: Game, name: string): Pt => g.map.placePos(name);
/** the headquarters of a side */
export const hqOf = (g: Game, team: number): Pt => g.map.hq[team];
/** the substation of a nation (0 Ukrainian, 1 Russian), or null once it is destroyed */
export const substation = (g: Game, nation: number): Struct | null =>
  g.structs.find(s => s.civ && s.nation === nation && s.type === 'power' && !s.dead) || null;

// ---------------------------------------------------------------- counting things
export const alive = (g: Game, team: number, type: string): Unit[] =>
  g.units.filter(u => u.team === team && u.type === type && !u.dead);
/** alive units of a side within r of a point, optionally of one type */
export const unitsNear = (g: Game, team: number, p: Pt, r: number, type?: string): Unit[] =>
  g.units.filter(u => u.team === team && !u.dead && (!type || u.type === type) && dist(u, p) <= r);
/** finished buildings of a side and type within r of a point */
export const structsNear = (g: Game, team: number, type: string, p: Pt, r: number): Struct[] =>
  g.structs.filter(s => s.team === team && s.type === type && !s.dead && s.build >= 1 && dist(s, p) <= r);
export const kills = (g: Game, team: number, type: string) => g.stats.killsOf[team][type] || 0;
export const townsHeld = (g: Game, team: number) => g.depots.filter(d => d.owner === team).length;
export const wheatHeld = (g: Game, team: number) =>
  g.resources.filter(r => r.kind === 'wheat' && r.owner === team).length;
export const dist = (a: Pt, b: Pt) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

// ---------------------------------------------------------------- conditions (each returns a `done` function)
export const townOwned = (name: string, team: number) => (g: Game) => at(g, name).owner === team;
export const has =
  (team: number, type: string, n = 1) =>
  (g: Game) =>
    g.typeCount(team, type) >= n;
/** at least n alive units of the type are in a posture (see data/modes.ts for the keys) */
export const inMode =
  (team: number, type: string, mode: string, n = 1) =>
  (g: Game) =>
    alive(g, team, type).filter(u => g.modeOf(u) === mode).length >= n;
export const researched = (team: number, key: string) => (g: Game) => !!g.upgrades[team][key];
/** a side's artillery has a fire mission on the map */
export const bombarding = (team: number, type?: string) => (g: Game) =>
  g.units.some(
    u => u.team === team && !u.dead && u.def.indirect && (!type || u.type === type) && u.order.kind === 'bombard'
  );
/** a human is on the sticks of one of the side's drones */
export const piloting = (team: number) => (g: Game) => g.units.some(u => u.team === team && !u.dead && g.piloted(u));

// ---------------------------------------------------------------- markers
export const ring = (p: Pt, r: number): Marker => ({ x: p.x, y: p.y, r });
export const town = (name: string) => (g: Game) => ring(at(g, name), 80);
/** a ring on the side's first building of a type, or none if it has none */
export const own =
  (type: string, team = UA) =>
  (g: Game) => {
    const s = g.structs.find(x => x.team === team && x.type === type && !x.dead);
    return s ? ring(s, 60) : null;
  };

// ---------------------------------------------------------------- scripting
/** spawn n squads of a type in a row around a point, optionally already dug in */
export function squads(g: Game, team: number, type: string, x: number, y: number, n: number, trench = false): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const u = g.spawn(type, team, x - (n - 1) * 17 + i * 34, y);
    out.push(u);
    if (trench) g.build('trench', team, u.x, u.y);
  }
  return out;
}
/** game time when a step started, keyed by level:step (client-side timers for "hold for N seconds" steps) */
const startedAt: Record<string, number> = {};
/** a `done` that needs the condition to hold N seconds after the step started (pair with `onStart: mark(key)`) */
export const holdFor =
  (key: string, seconds: number, cond: (g: Game) => boolean): Objective['done'] =>
  g =>
    cond(g) && g.gameTime - (startedAt[key] ?? g.gameTime) >= seconds;
export const mark = (key: string) => (g: Game) => {
  startedAt[key] = g.gameTime;
};
