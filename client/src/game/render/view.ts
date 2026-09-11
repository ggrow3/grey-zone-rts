// The camera and everything the renderer needs to know about the player's view, plus screen/world conversions.
import type { Unit, Entity } from '../types';
import type { Marker } from '../levels';

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export interface View {
  team: number;
  cam: Cam;
  vw: number;
  vh: number;
  dpr: number;
  selection: Entity[];
  placing: string | null;
  mouse: { x: number; y: number; inside: boolean };
  bombardMode: boolean;
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  marker: Marker | null;
  /** the drone whose sticks the player holds, and what the pilot has clicked */
  pilot: Unit | null;
  pilotTarget: Entity | null;
  pilotDive: { x: number; y: number } | null;
  /** the next click is an attack-move destination */
  amoveMode: boolean;
}

/** 0 ground, 1 low aircraft, 2 high-altitude aircraft (a Mavic switched to Low flies at 1) */
export function altOf(u: Unit): number {
  return !u.def.air || u.landed || u.grounded || u.ambushed ? 0 : u.def.highAlt && u.mode !== 'low' ? 2 : 1;
}

/** where an aircraft is drawn: it slides away from the screen centre with altitude, so panning the camera gives depth */
export function parallaxOf(u: Unit, v: View): { x: number; y: number } {
  const alt = altOf(u);
  if (!alt) return { x: u.x, y: u.y };
  const k = alt === 2 ? 0.09 : 0.045,
    cx = v.cam.x + v.vw / (2 * v.cam.z),
    cy = v.cam.y + v.vh / (2 * v.cam.z);
  return { x: u.x + (u.x - cx) * k, y: u.y + (u.y - cy) * k };
}

export function toWorld(v: View, mx: number, my: number) {
  return { x: mx / v.cam.z + v.cam.x, y: my / v.cam.z + v.cam.y };
}
