// The world: the fixed pixel size every map shares, and WorldMap, which turns a map's hand-placed geography
// (latitude and longitude) into pixel positions. The maps themselves are in maps/; a game owns one as `g.map`.
import { q3 } from './dmath';

/** the world is this much larger than the first version's 3600 x 2110: more ground between the towns, longer drives, farther for a drone to reach */
export const MAP_SCALE = 1.4;
export const W = Math.round(3600 * MAP_SCALE),
  H = Math.round(2110 * MAP_SCALE),
  H_LAND = H,
  MM_W = 260,
  MM_H = 152;
/** pixel sizes of hand-placed geography (forest radii, town sizes, road widths) were drawn for the old scale */
export const px = (v: number) => v * MAP_SCALE;

export type LatLon = [number, number];
export interface Pt {
  x: number;
  y: number;
}

/** everything that describes a map; the two examples are maps/kharkiv.ts and maps/sumy.ts */
export interface MapData {
  id: string;
  name: string;
  blurb: string;
  /** the corners of the map in degrees; the west-east span decides the scale */
  bounds: { lon0: number; lon1: number; lat0: number; lat1: number };
  /** the headquarters cities, [Ukrainian, Russian]; both must be in `places`. Ukraine is always the southern side */
  cities: [string, string];
  /** captions painted on the ground: [text, lat, lon] */
  labels: [string, number, number][];
  /** every named place: [name, lat, lon, size, font size]; places of size 8 or more give urban cover */
  places: [string, number, number, number, number][];
  /** rivers block ground movement except at bridges (where roads cross them): [name, points, width, label point index] */
  rivers: [string, LatLon[], number, number][];
  reservoirs: [string, LatLon[]][];
  /** the state border, west to east, and which of its points the label sits at */
  border: LatLon[];
  borderLabelAt: number;
  /** roads (width 5 to 9): units route along them and move faster on them; a road crossing a river is a bridge */
  roads: { w: number; pts: LatLon[] }[];
  railways: LatLon[][];
  /** woods: [lat, lon, radius] */
  forests: [number, number, number][];
  /** gas and wheat sites: [kind, name, lat, lon, starting owner (0 Ukraine, 1 Russia, -1 neutral)]; a gas site named ...depot or ...station pays 2.4 times more */
  resources: ['gas' | 'wheat', string, number, number, number][];
  /** gas flows to the headquarters along these; `pumps` are indexes into `pts` where the pumping stations stand */
  pipelines: { team: number; name: string; pts: LatLon[]; pumps: number[] }[];
  /** the capturable towns: [name, lat, lon]; holding all of them for three minutes wins */
  towns: [string, number, number][];
  /** civilian sites: [type (a key of CIV_TYPES), nation (0 or 1), place name, dx, dy] */
  civSites: [string, number, string, number, number][];
  /** towns whose capture by Ukraine brings Russian volunteer squads */
  volunteerTowns: string[];
  /** where trade convoys leave the map: [Ukrainian point on the west edge, Russian point on the east edge] */
  tradeEdges: [LatLon, LatLon];
  /** the town each side is told to take first, for the skirmish briefing */
  firstTowns: [string, string];
  /** the skirmish briefing lines, [as Ukraine, as Russia] */
  briefing: [string[], string[]];
}

function mercY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}
function invMercY(m: number): number {
  return ((2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180) / Math.PI;
}

/** a map with its projection: pixel positions for its places, the headquarters, and the nearest-place lookup */
export class WorldMap {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly bounds: MapData['bounds'];
  readonly cities: [string, string];
  readonly labels: MapData['labels'];
  readonly places: MapData['places'];
  readonly rivers: MapData['rivers'];
  readonly reservoirs: MapData['reservoirs'];
  readonly border: LatLon[];
  readonly borderLabelAt: number;
  readonly roads: MapData['roads'];
  readonly railways: LatLon[][];
  readonly forests: MapData['forests'];
  readonly resources: MapData['resources'];
  readonly pipelines: MapData['pipelines'];
  readonly towns: MapData['towns'];
  readonly civSites: MapData['civSites'];
  readonly volunteerTowns: string[];
  readonly tradeEdges: [LatLon, LatLon];
  readonly firstTowns: [string, string];
  readonly briefing: [string[], string[]];
  /** pixels per kilometre, for the scale bar */
  readonly pxPerKm: number;
  /** the headquarters positions, [Ukrainian, Russian] */
  readonly hq: [Pt, Pt];
  private readonly my0: number;
  private readonly my1: number;
  private readonly placePx: { name: string; x: number; y: number }[];

  constructor(d: MapData) {
    this.id = d.id;
    this.name = d.name;
    this.blurb = d.blurb;
    this.bounds = d.bounds;
    this.cities = d.cities;
    this.labels = d.labels;
    this.places = d.places;
    this.rivers = d.rivers;
    this.reservoirs = d.reservoirs;
    this.border = d.border;
    this.borderLabelAt = d.borderLabelAt;
    this.roads = d.roads;
    this.railways = d.railways;
    this.forests = d.forests;
    this.resources = d.resources;
    this.pipelines = d.pipelines;
    this.towns = d.towns;
    this.civSites = d.civSites;
    this.volunteerTowns = d.volunteerTowns;
    this.tradeEdges = d.tradeEdges;
    this.firstTowns = d.firstTowns;
    this.briefing = d.briefing;
    this.my0 = mercY(d.bounds.lat0);
    this.my1 = mercY(d.bounds.lat1);
    this.pxPerKm = W / ((d.bounds.lon1 - d.bounds.lon0) * 71.1);
    this.placePx = d.places.map(p => ({ name: p[0], ...this.geo(p[1], p[2]) }));
    this.hq = [this.placePos(d.cities[0]), this.placePos(d.cities[1])];
  }

  /** Web Mercator, scaled so a pixel is the same size north-south as east-west; quantized for determinism */
  geo(lat: number, lon: number): Pt {
    const { lon0, lon1 } = this.bounds;
    return { x: q3(((lon - lon0) / (lon1 - lon0)) * W), y: q3(((this.my1 - mercY(lat)) / (this.my1 - this.my0)) * H) };
  }
  geoInv(x: number, y: number): { lat: number; lon: number } {
    const { lon0, lon1 } = this.bounds;
    return { lon: lon0 + (x / W) * (lon1 - lon0), lat: invMercY(this.my1 - (y / H) * (this.my1 - this.my0)) };
  }
  /** the pixel position of a named place; throws on a name that is not on the map */
  placePos(name: string): Pt {
    const p = this.places.find(x => x[0] === name);
    if (!p) throw new Error("no place '" + name + "' on the " + this.name);
    return this.geo(p[1], p[2]);
  }
  /** name of the nearest town or city, for the battle log */
  nearestPlace(x: number, y: number): string {
    let best = this.placePx[0],
      bd = Infinity;
    for (const p of this.placePx) {
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best.name;
  }
}
