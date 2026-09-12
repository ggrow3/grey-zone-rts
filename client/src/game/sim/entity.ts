// Small facts about a unit or building that need no game state.
import type { UnitDef } from '../data';
import type { Entity, Unit } from '../types';

export const ADJ = ['Ukrainian', 'Russian'];
/** a line in a unit's record (towns taken, notable kills), kept to the last eight */
export function remember(u: Unit, line: string) {
  (u.history ||= []).push(line);
  if (u.history.length > 8) u.history.shift();
}

/** veteran rank from confirmed kills: 0 recruit, 1 trained, 2 veteran, 3 elite */
export function rankOf(u: Unit): number {
  return Math.min(3, Math.floor((u.kills || 0) / 2));
}
export function isVehicle(t: Entity): boolean {
  return !!t.isUnit && !t.def.air && !t.def.troop;
}
/** rock, paper, scissors: how hard a weapon hits this kind of target */
export function matchup(src: UnitDef | undefined, t: Entity): number {
  if (!src) return 1;
  if (t.isStruct) return src.vsStruct || 1;
  if (t.def.air) return t.def.large || t.def.structuresOnly ? src.vsAirLarge || 1 : src.vsAirSmall || 1;
  if (t.def.troop) return src.vsInf || 1;
  return src.vsVehicle || 1;
}
export function rOf(e: Entity): number {
  return e.isStruct ? e.r : e.def.r;
}
