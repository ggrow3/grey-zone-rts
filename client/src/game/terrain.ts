// Passable terrain derived from the map data: rivers and reservoirs (crossed only at bridges), the road graph
// ground units route along, and forest/urban cover. Pure and deterministic, built once and shared.
import { geo, RIVERS, RESERVOIRS, ROADS, RAILWAYS, PLACES, FORESTS } from './map';
import type { Pt } from './map';
import { hyp, clamp } from './dmath';

export type Seg = [Pt, Pt];
interface RoadNode { x: number; y: number; adj: { to: number; len: number }[] }
interface RoadEdge { a: number; b: number; len: number }
export interface RoadHit { e: RoadEdge; px: number; py: number; d: number }

export const ROAD_CELL = 120;
function cellKey(cx: number, cy: number): number { return cx * 4096 + cy; }

export function segHit(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) } : null;
}
export function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return hyp(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class Terrain {
  waterSegs: Seg[] = []; waterPolys: Pt[][] = []; bridges: Pt[] = [];
  forestPx: { x: number; y: number; r: number }[] = []; urbanPx: { x: number; y: number; r: number }[] = [];
  roadNodes: RoadNode[] = []; roadEdges: RoadEdge[] = [];
  private roadGrid = new Map<number, RoadEdge[]>();
  private waterGrid = new Map<number, Seg[]>();
  private bridgeGrid = new Map<number, Pt[]>();

  constructor() { this.buildWater(); this.buildRoads(); this.buildGrids(); }

  private buildWater() {
    for (const [, pts] of RIVERS) { const P = pts.map(([la, lo]) => geo(la, lo)); for (let i = 0; i < P.length - 1; i++) this.waterSegs.push([P[i], P[i + 1]]); }
    for (const [, pts] of RESERVOIRS) this.waterPolys.push(pts.map(([la, lo]) => geo(la, lo)));
    for (const pts of ROADS.map(r => r.pts).concat(RAILWAYS)) {
      const P = pts.map(([la, lo]) => geo(la, lo));
      for (let i = 0; i < P.length - 1; i++) for (const [a, b] of this.waterSegs) { const h = segHit(P[i], P[i + 1], a, b); if (h) this.bridges.push(h); }
    }
    for (const [, la, lo] of PLACES) { const c = geo(la, lo); if (this.waterSegs.some(([a, b]) => distToSeg(c, a, b) < 60)) this.bridges.push({ x: c.x, y: c.y }); }
    for (const [la, lo, rad] of FORESTS) { const c = geo(la, lo); this.forestPx.push({ x: c.x, y: c.y, r: rad }); }
    for (const [, la, lo, size] of PLACES) if (size >= 8) { const c = geo(la, lo); this.urbanPx.push({ x: c.x, y: c.y, r: size * 1.15 + 10 }); }
  }

  private buildRoads() {
    const segs: { a: Pt; b: Pt; ids: number[] }[] = [];
    for (const r of ROADS) { const P = r.pts.map(([la, lo]) => geo(la, lo)); for (let i = 0; i < P.length - 1; i++) segs.push({ a: P[i], b: P[i + 1], ids: [] }); }
    const nodeAt = (x: number, y: number) => { for (let i = 0; i < this.roadNodes.length; i++) if (hyp(this.roadNodes[i].x - x, this.roadNodes[i].y - y) < 6) return i; this.roadNodes.push({ x, y, adj: [] }); return this.roadNodes.length - 1; };
    for (const sg of segs) sg.ids.push(nodeAt(sg.a.x, sg.a.y), nodeAt(sg.b.x, sg.b.y));
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const h = segHit(segs[i].a, segs[i].b, segs[j].a, segs[j].b); if (h) { const n = nodeAt(h.x, h.y); segs[i].ids.push(n); segs[j].ids.push(n); } }
    for (const sg of segs) {
      const ids = [...new Set(sg.ids)].sort((p, q) => hyp(this.roadNodes[p].x - sg.a.x, this.roadNodes[p].y - sg.a.y) - hyp(this.roadNodes[q].x - sg.a.x, this.roadNodes[q].y - sg.a.y));
      for (let k = 0; k < ids.length - 1; k++) {
        const A = ids[k], B = ids[k + 1], len = hyp(this.roadNodes[A].x - this.roadNodes[B].x, this.roadNodes[A].y - this.roadNodes[B].y);
        if (len < 1) continue;
        this.roadNodes[A].adj.push({ to: B, len }); this.roadNodes[B].adj.push({ to: A, len }); this.roadEdges.push({ a: A, b: B, len });
      }
    }
  }

  private buildGrids() {
    for (const e of this.roadEdges) {
      const A = this.roadNodes[e.a], B = this.roadNodes[e.b];
      const x0 = Math.floor((Math.min(A.x, B.x) - 20) / ROAD_CELL), x1 = Math.floor((Math.max(A.x, B.x) + 20) / ROAD_CELL);
      const y0 = Math.floor((Math.min(A.y, B.y) - 20) / ROAD_CELL), y1 = Math.floor((Math.max(A.y, B.y) + 20) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cellKey(cx, cy); if (!this.roadGrid.has(k)) this.roadGrid.set(k, []); this.roadGrid.get(k)!.push(e); }
    }
    for (const [a, b] of this.waterSegs) {
      const x0 = Math.floor((Math.min(a.x, b.x) - 30) / ROAD_CELL), x1 = Math.floor((Math.max(a.x, b.x) + 30) / ROAD_CELL);
      const y0 = Math.floor((Math.min(a.y, b.y) - 30) / ROAD_CELL), y1 = Math.floor((Math.max(a.y, b.y) + 30) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cellKey(cx, cy); if (!this.waterGrid.has(k)) this.waterGrid.set(k, []); this.waterGrid.get(k)!.push([a, b]); }
    }
    for (const br of this.bridges) {
      const x0 = Math.floor((br.x - 80) / ROAD_CELL), x1 = Math.floor((br.x + 80) / ROAD_CELL), y0 = Math.floor((br.y - 80) / ROAD_CELL), y1 = Math.floor((br.y + 80) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cellKey(cx, cy); if (!this.bridgeGrid.has(k)) this.bridgeGrid.set(k, []); this.bridgeGrid.get(k)!.push(br); }
    }
  }

  onRoadAt(x: number, y: number): boolean {
    const list = this.roadGrid.get(cellKey(Math.floor(x / ROAD_CELL), Math.floor(y / ROAD_CELL)));
    if (!list) return false;
    for (const e of list) { const A = this.roadNodes[e.a], B = this.roadNodes[e.b]; if (distToSeg({ x, y }, A, B) < 12) return true; }
    return false;
  }
  nearestRoad(x: number, y: number): RoadHit | null {
    let best: RoadHit | null = null;
    for (const e of this.roadEdges) {
      const A = this.roadNodes[e.a], B = this.roadNodes[e.b], dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - A.x) * dx + (y - A.y) * dy) / l2, 0, 1), px = A.x + t * dx, py = A.y + t * dy, d = hyp(x - px, y - py);
      if (!best || d < best.d) best = { e, px, py, d };
    }
    return best;
  }
  roadPath(s0: RoadHit, s1: RoadHit): { path: Pt[]; len: number } | null {
    const N = this.roadNodes.length, distA = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const A = this.roadNodes[s0.e.a], B = this.roadNodes[s0.e.b];
    distA[s0.e.a] = hyp(s0.px - A.x, s0.py - A.y); distA[s0.e.b] = hyp(s0.px - B.x, s0.py - B.y);
    for (let it = 0; it < N; it++) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && distA[i] < bd) { bd = distA[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const ad of this.roadNodes[u].adj) { const nd = bd + ad.len; if (nd < distA[ad.to]) { distA[ad.to] = nd; prev[ad.to] = u; } }
    }
    const ea = this.roadNodes[s1.e.a], eb = this.roadNodes[s1.e.b];
    const ca = distA[s1.e.a] + hyp(s1.px - ea.x, s1.py - ea.y), cb = distA[s1.e.b] + hyp(s1.px - eb.x, s1.py - eb.y);
    const endNode = ca <= cb ? s1.e.a : s1.e.b, total = Math.min(ca, cb);
    if (!isFinite(total)) return null;
    const path: Pt[] = []; for (let n = endNode; n >= 0; n = prev[n]) path.push({ x: this.roadNodes[n].x, y: this.roadNodes[n].y });
    path.reverse();
    return { path, len: total };
  }
  inWater(x: number, y: number): boolean { return this.waterPolys.some(pg => pointInPoly(x, y, pg)); }
  nearBridge(x: number, y: number, r: number): boolean { const list = this.bridgeGrid.get(cellKey(Math.floor(x / ROAD_CELL), Math.floor(y / ROAD_CELL))); return !!list && list.some(b => hyp(b.x - x, b.y - y) <= r); }
  /** null if the step is clear, 'poly' if it ends in a reservoir, or the river segment it crosses */
  waterBlock(x0: number, y0: number, x1: number, y1: number): Seg | 'poly' | null {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const list = this.waterGrid.get(cellKey(Math.floor(mx / ROAD_CELL), Math.floor(my / ROAD_CELL)));
    if (!list) return this.waterPolys.length && this.inWater(x1, y1) ? 'poly' : null;
    if (this.nearBridge(mx, my, 70)) return null;
    if (this.inWater(x1, y1)) return 'poly';
    const a = { x: x0, y: y0 }, b = { x: x1, y: y1 };
    for (const seg of list) if (segHit(a, b, seg[0], seg[1])) return seg;
    return null;
  }
  nearestBridge(p: Pt, maxD: number): Pt | null {
    let best: Pt | null = null, bd = maxD;
    for (const b of this.bridges) { const dd = hyp(b.x - p.x, b.y - p.y); if (dd < bd) { bd = dd; best = b; } }
    return best;
  }
  coverOf(x: number, y: number): 'forest' | 'urban' | 'open' {
    for (const f of this.forestPx) { const dx = (x - f.x) / (f.r * 1.3), dy = (y - f.y) / f.r; if (dx * dx + dy * dy <= 1) return 'forest'; }
    for (const c of this.urbanPx) if (hyp(x - c.x, y - c.y) <= c.r) return 'urban';
    return 'open';
  }
}

let shared: Terrain | null = null;
export function getTerrain(): Terrain { if (!shared) shared = new Terrain(); return shared; }
