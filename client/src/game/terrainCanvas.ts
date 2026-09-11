// The painted map (fields, forests, rivers, roads, towns, border) and the optional real map tiles under it.
// Visual only: uses its own seeded random so it never touches the simulation's RNG.
import { W, H, H_LAND, MM_W, MM_H, MAP_SCALE, px } from './map';
import type { LatLon, WorldMap } from './map';
import { getTerrain } from './terrain';
import { Rng } from './rng';

/** a path through lat/lon points, projected onto the map */
export function poly(t: CanvasRenderingContext2D, map: WorldMap, pts: LatLon[], close: boolean) {
  t.beginPath();
  pts.forEach(([lat, lon], i) => {
    const p = map.geo(lat, lon);
    if (i) t.lineTo(p.x, p.y);
    else t.moveTo(p.x, p.y);
  });
  if (close) t.closePath();
}
export function outlinedText(
  t: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  italic?: boolean
) {
  t.font = (italic ? 'italic ' : '') + size + 'px Barlow, sans-serif';
  t.textAlign = 'center';
  t.textBaseline = 'middle';
  t.lineWidth = 3;
  t.strokeStyle = 'rgba(20,22,16,0.85)';
  t.lineJoin = 'round';
  t.strokeText(text, x, y);
  t.fillStyle = color;
  t.fillText(text, x, y);
}
export function drawPipelines(c: CanvasRenderingContext2D, map: WorldMap) {
  for (const pl of map.pipelines) {
    poly(c, map, pl.pts, false);
    c.strokeStyle = '#2a2621';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.stroke();
    c.strokeStyle = '#a58a5a';
    c.lineWidth = 2;
    c.setLineDash([10, 8]);
    c.stroke();
    c.setLineDash([]);
    if (pl.name) {
      const mid = pl.pts[Math.floor(pl.pts.length / 2)],
        m = map.geo(mid[0], mid[1]);
      outlinedText(c, pl.name + ' (gas pipeline)', m.x + 70, m.y, 11, '#e0c9a0', true);
    }
  }
}
export function scorch(t: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = t.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(25,22,16,0.75)');
  g.addColorStop(1, 'rgba(25,22,16,0)');
  t.fillStyle = g;
  t.beginPath();
  t.arc(x, y, r, 0, Math.PI * 2);
  t.fill();
}

export type BasemapMode = 'drawn' | 'street' | 'satellite';
const TILE_Z = 11;
const TILE_SRC: Record<
  Exclude<BasemapMode, 'drawn'>,
  { url: (z: number, x: number, y: number) => string; attrib: string }
> = {
  street: {
    url: (z, x, y) => 'https://a.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + x + '/' + y + '.png',
    attrib: 'Map data © OpenStreetMap contributors, tiles © CARTO',
  },
  satellite: {
    url: (z, x, y) =>
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x,
    attrib: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
};
function lon2tile(lon: number, z: number) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function lat2tile(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}
function tile2lon(x: number, z: number) {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export class TerrainCanvas {
  terrain: HTMLCanvasElement;
  mm: HTMLCanvasElement;
  basemapMode: BasemapMode = 'drawn';
  basemap: HTMLCanvasElement | null = null;
  basemapTiles = 0;
  basemapTotal = 0;
  basemapFailed = 0;
  private basemapGen = 0;
  onMessage: (text: string) => void = () => {};

  constructor(readonly map: WorldMap) {
    const T = getTerrain(map);
    const geo = (lat: number, lon: number) => map.geo(lat, lon);
    this.terrain = document.createElement('canvas');
    this.terrain.width = W;
    this.terrain.height = H;
    const t = this.terrain.getContext('2d')!;
    const R = new Rng(20220224);
    // fields
    t.fillStyle = '#4e5b3c';
    t.fillRect(0, 0, W, H);
    const fields = ['#56643f', '#5f6a41', '#6b6242', '#495837', '#7a7048', '#5a5f3a', '#66603d'];
    for (let i = 0; i < Math.round(230 * MAP_SCALE * MAP_SCALE); i++) {
      const w = px(120 + R.next() * 320),
        h = px(90 + R.next() * 260);
      const x = R.next() * W - w / 2,
        y = R.next() * H - h / 2;
      t.fillStyle = fields[Math.floor(R.next() * fields.length)];
      t.globalAlpha = 0.85;
      t.fillRect(x, y, w, h);
      t.globalAlpha = 0.18;
      t.strokeStyle = '#2f3524';
      t.lineWidth = 1;
      const horiz = R.next() < 0.5;
      for (let k = 8; k < (horiz ? h : w); k += 9) {
        t.beginPath();
        if (horiz) {
          t.moveTo(x, y + k);
          t.lineTo(x + w, y + k);
        } else {
          t.moveTo(x + k, y);
          t.lineTo(x + k, y + h);
        }
        t.stroke();
      }
      t.globalAlpha = 1;
    }
    // woods
    for (const [lat, lon, rad0] of map.forests) {
      const c = geo(lat, lon),
        rad = px(rad0);
      for (let k = 0; k < rad * 1.6 * MAP_SCALE; k++) {
        const a = R.next() * Math.PI * 2,
          d = Math.sqrt(R.next()) * rad;
        t.fillStyle = R.next() < 0.5 ? '#2f4a2a' : '#385a30';
        t.beginPath();
        t.arc(c.x + Math.cos(a) * d * 1.3, c.y + Math.sin(a) * d, 6 + R.next() * 6, 0, Math.PI * 2);
        t.fill();
      }
    }
    // water, roads, rails, bridges
    t.lineCap = 'round';
    t.lineJoin = 'round';
    for (const [, pts] of map.reservoirs) {
      poly(t, map, pts, true);
      t.fillStyle = '#3d6f8f';
      t.fill();
      t.strokeStyle = '#6fa3c4';
      t.lineWidth = 1.5;
      t.stroke();
    }
    for (const [, pts, w0] of map.rivers) {
      const w = px(w0);
      poly(t, map, pts, false);
      t.strokeStyle = '#3d6f8f';
      t.lineWidth = w + 2;
      t.stroke();
      t.strokeStyle = '#6fa3c4';
      t.lineWidth = w;
      t.stroke();
    }
    for (const r of map.roads) {
      poly(t, map, r.pts, false);
      t.strokeStyle = '#75705f';
      t.lineWidth = px(r.w);
      t.stroke();
      if (r.w >= 8) {
        t.strokeStyle = '#a89f86';
        t.lineWidth = 1;
        t.setLineDash([12, 12]);
        t.stroke();
        t.setLineDash([]);
      }
    }
    for (const pts of map.railways) {
      poly(t, map, pts, false);
      t.strokeStyle = '#2a2822';
      t.lineWidth = 3;
      t.stroke();
      t.strokeStyle = '#c8c2ae';
      t.lineWidth = 1.2;
      t.setLineDash([7, 7]);
      t.stroke();
      t.setLineDash([]);
    }
    for (const b of T.bridges) {
      t.fillStyle = '#8a7a5a';
      t.strokeStyle = '#2a2621';
      t.lineWidth = 1.5;
      t.fillRect(b.x - 9, b.y - 5, 18, 10);
      t.strokeRect(b.x - 9, b.y - 5, 18, 10);
    }
    // towns and cities
    for (const [, lat, lon, size0] of map.places) {
      const c = geo(lat, lon),
        size = px(size0);
      t.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2,
          rr = size * (0.7 + R.next() * 0.5);
        const px = c.x + Math.cos(a) * rr * 1.15,
          py = c.y + Math.sin(a) * rr;
        if (i) t.lineTo(px, py);
        else t.moveTo(px, py);
      }
      t.closePath();
      t.fillStyle = '#7d7969';
      t.fill();
      t.strokeStyle = '#4f4c43';
      t.lineWidth = 1.5;
      t.stroke();
      if (size0 >= 14) {
        t.save();
        t.clip();
        t.strokeStyle = 'rgba(60,58,50,0.5)';
        t.lineWidth = 1;
        for (let k = -size * 1.3; k < size * 1.3; k += 9) {
          t.beginPath();
          t.moveTo(c.x + k, c.y - size * 1.2);
          t.lineTo(c.x + k, c.y + size * 1.2);
          t.stroke();
          t.beginPath();
          t.moveTo(c.x - size * 1.4, c.y + k);
          t.lineTo(c.x + size * 1.4, c.y + k);
          t.stroke();
        }
        t.restore();
      }
    }
    // the state border and the scorched ground along it
    poly(t, map, map.border, false);
    t.strokeStyle = '#1a1712';
    t.lineWidth = 4;
    t.stroke();
    t.strokeStyle = '#efe8d2';
    t.lineWidth = 2;
    t.setLineDash([10, 10]);
    t.stroke();
    t.setLineDash([]);
    t.strokeStyle = 'rgba(193,18,31,0.35)';
    t.lineWidth = 14;
    t.stroke();
    for (let i = 0; i < Math.round(110 * MAP_SCALE); i++) {
      const seg = map.border[Math.floor(R.next() * (map.border.length - 1))];
      const c = geo(seg[0], seg[1]);
      scorch(t, c.x + (R.next() - 0.5) * px(260), c.y + (R.next() - 0.5) * px(160), 6 + R.next() * 14);
    }
    drawPipelines(t, map);
    // labels
    for (const [name, lat, lon, size, font] of map.places) {
      const c = geo(lat, lon);
      outlinedText(t, name, c.x, c.y - px(size) - 9, font, size >= 40 ? '#fff6dc' : '#efe8d2');
    }
    for (const [name, pts, , at] of map.rivers) {
      const c = geo(pts[at][0], pts[at][1]);
      outlinedText(t, name, c.x + 26, c.y - 10, 11, '#a9d1ea', true);
    }
    for (const [name, pts] of map.reservoirs) {
      const c = geo(pts[0][0], pts[0][1]);
      outlinedText(t, name, c.x + 60, c.y + 22, 11, '#a9d1ea', true);
    }
    const bl = geo(map.border[map.borderLabelAt][0], map.border[map.borderLabelAt][1]);
    outlinedText(t, 'State border', bl.x + 150, bl.y - 14, 11, '#efe8d2', true);
    for (const [text, lat, lon] of map.labels) {
      const c = geo(lat, lon);
      outlinedText(t, text, c.x, c.y, 14, '#efe8d2', true);
    }
    this.mm = document.createElement('canvas');
    this.mm.width = MM_W;
    this.mm.height = MM_H;
    this.mm.getContext('2d')!.drawImage(this.terrain, 0, 0, MM_W, MM_H);
  }

  scorch(x: number, y: number, r: number) {
    scorch(this.terrain.getContext('2d')!, x, y, r);
    if (this.basemap) scorch(this.basemap.getContext('2d')!, x, y, r);
  }

  attrib(): string {
    return this.basemapMode === 'drawn' ? '' : TILE_SRC[this.basemapMode].attrib;
  }

  loadBasemap(mode: BasemapMode) {
    this.basemapMode = mode;
    if (mode === 'drawn') {
      this.basemap = null;
      return;
    }
    const { map } = this;
    this.basemap = document.createElement('canvas');
    this.basemap.width = W;
    this.basemap.height = H_LAND;
    const b = this.basemap.getContext('2d')!,
      z = TILE_Z,
      src = TILE_SRC[mode],
      gen = ++this.basemapGen;
    this.basemapTiles = 0;
    this.basemapFailed = 0;
    const x0 = Math.floor(lon2tile(map.bounds.lon0, z)),
      x1 = Math.floor(lon2tile(map.bounds.lon1, z)),
      y0 = Math.floor(lat2tile(map.bounds.lat1, z)),
      y1 = Math.floor(lat2tile(map.bounds.lat0, z));
    this.basemapTotal = (x1 - x0 + 1) * (y1 - y0 + 1);
    for (let tx = x0; tx <= x1; tx++)
      for (let ty = y0; ty <= y1; ty++) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const p0 = map.geo(tile2lat(ty, z), tile2lon(tx, z)),
          p1 = map.geo(tile2lat(ty + 1, z), tile2lon(tx + 1, z));
        img.onload = () => {
          if (gen !== this.basemapGen) return;
          b.drawImage(img, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          b.fillStyle = mode === 'street' ? 'rgba(28,32,20,0.26)' : 'rgba(0,0,0,0.14)';
          b.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          this.basemapTiles++;
        };
        img.onerror = () => {
          if (gen !== this.basemapGen) return;
          this.basemapFailed++;
          if (this.basemapFailed === 3) this.onMessage('Map tiles could not be loaded');
        };
        img.src = src.url(z, tx, ty);
      }
    this.onMessage('Loading ' + this.basemapTotal + ' map tiles');
  }
}
