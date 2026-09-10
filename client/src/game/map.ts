// Kharkiv - Belgorod border region: projection and hand-placed geography (from the original game).
import { q3 } from './dmath';

/** the world is this much larger than the first version's 3600 x 2110: more ground between the towns, longer drives, farther for a drone to reach */
export const MAP_SCALE = 1.4;
export const W = Math.round(3600 * MAP_SCALE), H = Math.round(2110 * MAP_SCALE), H_LAND = H, MM_W = 260, MM_H = 152;
/** pixel sizes of hand-placed geography (forest radii, town sizes, road widths) were drawn for the old scale */
export const px = (v: number) => v * MAP_SCALE;
export const LON0 = 35.10, LON1 = 37.90, LAT0 = 49.68, LAT1 = 50.73;
export const PX_PER_KM = W / ((LON1 - LON0) * 71.1);

function mercY(lat: number): number { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
function invMercY(m: number): number { return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI; }
const MY0 = mercY(LAT0), MY1 = mercY(LAT1);

export type LatLon = [number, number];
export interface Pt { x: number; y: number }

/** Web Mercator, scaled so a pixel is the same size north-south as east-west; quantized for determinism */
export function geo(lat: number, lon: number): Pt {
  return { x: q3((lon - LON0) / (LON1 - LON0) * W), y: q3((MY1 - mercY(lat)) / (MY1 - MY0) * H) };
}
export function geoInv(x: number, y: number): { lat: number; lon: number } {
  return { lon: LON0 + x / W * (LON1 - LON0), lat: invMercY(MY1 - y / H * (MY1 - MY0)) };
}

// [name, lat, lon, size, font]
export const PLACES: [string, number, number, number, number][] = [
  ['Kharkiv', 49.99, 36.23, 70, 17], ['Belgorod', 50.60, 36.59, 46, 16], ['Chuhuiv', 49.84, 36.68, 18, 12], ['Derhachi', 50.11, 36.12, 14, 12],
  ['Shebekino', 50.41, 36.89, 18, 12], ['Vovchansk', 50.29, 36.94, 14, 12], ['Zolochiv', 50.28, 35.98, 10, 12], ['Bohodukhiv', 50.16, 35.53, 12, 12],
  ['Velykyi Burluk', 50.06, 37.38, 8, 11], ['Grayvoron', 50.48, 35.67, 10, 12], ['Borisovka', 50.60, 36.02, 10, 11], ['Staryi Saltiv', 50.09, 36.79, 7, 11],
  ['Pechenihy', 49.87, 36.93, 6, 11], ['Lyptsi', 50.20, 36.42, 8, 11], ['Kozacha Lopan', 50.34, 36.30, 8, 11], ['Zhuravlyovka', 50.40, 36.44, 6, 11],
  ['Tsyrkuny', 50.07, 36.37, 8, 11], ['Ruska Lozova', 50.17, 36.22, 6, 11], ['Hoptivka crossing', 50.36, 36.35, 5, 10], ['Maslova Pristan', 50.45, 36.73, 6, 11],
  ['Razumnoye', 50.53, 36.67, 9, 11], ['Kupiansk', 49.71, 37.62, 16, 12], ['Volokonovka', 50.48, 37.86, 10, 12],
];
// [name, points, width, label point index]
export const RIVERS: [string, LatLon[], number, number][] = [
  ['Siverskyi Donets', [[50.70, 36.56], [50.60, 36.61], [50.52, 36.66], [50.45, 36.72], [50.36, 36.85], [50.28, 36.98], [50.20, 36.90], [50.12, 36.82], [50.05, 36.86], [49.96, 36.90], [49.88, 36.80], [49.84, 36.68], [49.80, 36.62]], 5, 7],
  ['Lopan', [[50.52, 36.28], [50.42, 36.29], [50.34, 36.30], [50.25, 36.22], [50.15, 36.14], [50.08, 36.18], [49.99, 36.23]], 3, 3],
  ['Kharkiv', [[50.30, 36.50], [50.20, 36.42], [50.10, 36.33], [50.00, 36.25]], 2.5, 2],
  ['Udy', [[50.58, 36.30], [50.45, 36.12], [50.35, 36.00], [50.28, 35.98], [50.18, 36.02], [50.08, 36.08], [49.98, 36.16], [49.92, 36.24], [49.85, 36.35], [49.80, 36.42]], 3, 4],
  ['Vovcha', [[50.42, 37.15], [50.33, 37.02], [50.29, 36.94], [50.24, 36.90], [50.19, 36.87]], 2.5, 1],
  ['Nezhegol', [[50.45, 37.10], [50.41, 36.89], [50.40, 36.78], [50.37, 36.72]], 2.5, 2],
  ['Oskil', [[50.73, 37.55], [50.55, 37.58], [50.35, 37.62], [50.10, 37.60], [49.85, 37.58], [49.71, 37.62], [49.68, 37.66]], 4, 3],
];
export const RESERVOIRS: [string, LatLon[]][] = [
  ['Belgorod Reservoir', [[50.55, 36.62], [50.53, 36.68], [50.48, 36.70], [50.44, 36.73], [50.42, 36.70], [50.46, 36.65], [50.50, 36.62]]],
  ['Pechenihy Reservoir', [[50.05, 36.84], [50.02, 36.90], [49.97, 36.93], [49.90, 36.93], [49.87, 36.89], [49.92, 36.86], [49.98, 36.85], [50.03, 36.82]]],
];
export const BORDER: LatLon[] = [[50.70, 35.10], [50.62, 35.30], [50.55, 35.45], [50.45, 35.58], [50.42, 35.75], [50.40, 35.95], [50.37, 36.15], [50.36, 36.35], [50.35, 36.55], [50.33, 36.75], [50.33, 36.95], [50.28, 37.15], [50.23, 37.40], [50.19, 37.70], [50.12, 37.90]];
export const ROADS: { w: number; pts: LatLon[] }[] = [
  { w: 9, pts: [[49.99, 36.23], [50.17, 36.22], [50.36, 36.35], [50.48, 36.48], [50.60, 36.59]] },
  { w: 6, pts: [[49.99, 36.23], [50.07, 36.37], [50.15, 36.60], [50.29, 36.94]] },
  { w: 8, pts: [[49.99, 36.23], [49.92, 36.45], [49.84, 36.68], [49.80, 36.80]] },
  { w: 6, pts: [[49.99, 36.23], [50.10, 36.05], [50.28, 35.98]] },
  { w: 6, pts: [[49.99, 36.23], [50.05, 35.95], [50.16, 35.53]] },
  { w: 6, pts: [[50.60, 36.59], [50.50, 36.75], [50.41, 36.89]] },
  { w: 6, pts: [[50.60, 36.59], [50.60, 36.30], [50.60, 36.02], [50.48, 35.67]] },
  { w: 5, pts: [[49.84, 36.68], [49.95, 37.00], [50.06, 37.38]] },
  { w: 5, pts: [[50.29, 36.94], [50.15, 37.20], [50.06, 37.38]] },
  { w: 5, pts: [[50.41, 36.89], [50.35, 37.05], [50.29, 36.94]] },
  { w: 5, pts: [[50.11, 36.12], [50.20, 36.05], [50.28, 35.98]] },
  { w: 7, pts: [[49.84, 36.68], [49.78, 37.10], [49.71, 37.62]] },
  { w: 6, pts: [[50.60, 36.59], [50.55, 37.20], [50.48, 37.86]] },
  { w: 5, pts: [[49.71, 37.62], [49.88, 37.50], [50.06, 37.38]] },
];
export const RAILWAYS: LatLon[][] = [[[49.99, 36.23], [50.11, 36.12], [50.34, 36.30], [50.45, 36.42], [50.60, 36.59]]];
export const FORESTS: [number, number, number][] = [[50.10, 36.28, 55], [50.15, 36.38, 40], [50.20, 36.52, 40], [50.50, 36.68, 50], [50.45, 36.62, 35], [50.38, 36.98, 40], [49.90, 36.78, 45],
  [49.95, 36.95, 35], [50.45, 35.78, 40], [50.16, 36.02, 30], [50.05, 37.10, 30], [50.30, 36.62, 30], [50.55, 36.40, 35], [50.25, 35.80, 30], [50.02, 36.60, 30]];
// resource nodes: kind, name, lat, lon, starting owner (0 Ukraine, 1 Russia, -1 neutral)
export const RESOURCES: ['gas' | 'wheat', string, number, number, number][] = [
  ['gas', 'Gas wells', 49.72, 36.45, 0], ['gas', 'Gas wells', 49.76, 36.12, 0], ['gas', 'Belgorod fuel depot', 50.62, 36.66, 1],
  ['wheat', 'Wheat fields', 49.95, 35.75, 0], ['wheat', 'Wheat fields', 50.12, 36.80, 0], ['wheat', 'Wheat fields', 50.30, 36.12, -1],
  ['wheat', 'Wheat fields', 50.55, 36.20, 1], ['wheat', 'Wheat fields', 50.50, 37.20, 1],
];
export const PIPELINES: { team: number; name: string; pts: LatLon[]; pumps: number[] }[] = [
  { team: 0, name: 'Shebelynka line', pts: [[49.72, 36.45], [49.80, 36.40], [49.88, 36.33], [49.95, 36.28], [49.99, 36.23]], pumps: [1, 3] },
  { team: 0, name: '', pts: [[49.76, 36.12], [49.86, 36.18], [49.95, 36.28]], pumps: [1] },
  { team: 1, name: 'Line from Kursk', pts: [[50.73, 36.70], [50.68, 36.68], [50.62, 36.66], [50.60, 36.59]], pumps: [1] },
];
export const TOWNS: [string, number, number][] = [['Kozacha Lopan', 50.34, 36.30], ['Lyptsi', 50.20, 36.42], ['Vovchansk', 50.29, 36.94], ['Zhuravlyovka', 50.40, 36.44], ['Shebekino', 50.41, 36.89], ['Zolochiv', 50.28, 35.98]];

export function placePos(name: string): Pt { const p = PLACES.find(x => x[0] === name)!; return geo(p[1], p[2]); }
export const KHARKIV = geo(49.99, 36.23);
const PLACE_PX = PLACES.map(p => ({ name: p[0], ...geo(p[1], p[2]) }));
/** name of the nearest town or city, for the battle log */
export function nearestPlace(x: number, y: number): string {
  let best = PLACE_PX[0], bd = Infinity;
  for (const p of PLACE_PX) { const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = p; } }
  return best.name;
}
export const BELGOROD = geo(50.60, 36.59);
