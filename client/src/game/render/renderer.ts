// The frame: draws a Game onto the main canvas and the minimap from one player's point of view.
// `render()` is the list of passes in the order they are painted; each pass is a method below.
// Everything here is visual only: it reads the game and never changes it (except handing scorch
// marks to the terrain painter).
import { UA, RU, TEAMS, UNITS, STRUCTS, BUILD_RADIUS, TOWN_BUILD_RADIUS, drawR, PILOT, POWER } from '../data';
import type { Game } from '../sim';
import { W, H, H_LAND, MM_W, MM_H } from '../map';
import { clamp } from '../dmath';
import type { Effect } from '../types';
import { TerrainCanvas, poly, drawPipelines } from '../terrainCanvas';
import { altOf, parallaxOf, toWorld } from './view';
import type { Cam, View } from './view';
import { hpBar } from './shapes';
import { drawUnit, drawModeTag } from './units';
import { drawStruct, drawDepot, drawResource } from './structures';
import { drawEffects, drawProjectiles } from './effects';
import { drawIncoming, drawPilotHud, drawHover } from './hud';

type Ctx = CanvasRenderingContext2D;

/** a dashed circle in the current style */
function dashedCircle(ctx: Ctx, x: number, y: number, r: number, dash: number[], stroke: string, width = 1.5) {
  ctx.strokeStyle = stroke;
  ctx.setLineDash(dash);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

export class Renderer {
  private fog: HTMLCanvasElement;
  private fctx: Ctx;
  private mmFog: HTMLCanvasElement;
  private mmFogCtx: Ctx;
  /** visual-only effects (burning fields) kept apart from the simulation's list */
  private localFx: Effect[] = [];
  private rainSeed = 0;

  constructor(public tc: TerrainCanvas) {
    this.fog = document.createElement('canvas');
    this.fctx = this.fog.getContext('2d')!;
    this.mmFog = document.createElement('canvas');
    this.mmFog.width = MM_W;
    this.mmFog.height = MM_H;
    this.mmFogCtx = this.mmFog.getContext('2d')!;
  }

  // ================================================================== the main canvas
  render(ctx: Ctx, g: Game, v: View, now: number, shake = 0) {
    const { vw, vh, dpr } = v;
    // a hidden or collapsed stage has no size: drawing into a zero-sized canvas throws
    if (ctx.canvas.width <= 0 || ctx.canvas.height <= 0) return;
    let cam: Cam = v.cam;
    if (shake > 0) {
      cam = {
        x: cam.x + ((Math.random() * 2 - 1) * shake) / cam.z,
        y: cam.y + ((Math.random() * 2 - 1) * shake) / cam.z,
        z: cam.z,
      };
    }
    for (const s of g.scorches) this.tc.scorch(s.x, s.y, s.r);
    g.scorches = [];
    if (this.fog.width !== ctx.canvas.width || this.fog.height !== ctx.canvas.height) {
      this.fog.width = ctx.canvas.width;
      this.fog.height = ctx.canvas.height;
    }
    this.localFx = this.localFx.filter(e => (e.t += 1 / 60) < e.dur);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1e2419';
    ctx.fillRect(0, 0, vw, vh);

    // world space, under the fog
    ctx.save();
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    this.drawGround(ctx, g, v);
    this.drawBuildings(ctx, g, v, now);
    this.drawUnitsAndEffects(ctx, g, v, now);
    ctx.restore();

    this.drawFog(ctx, g, v);
    this.drawWeather(ctx, g, v, now);

    // world space, over the fog: selection, orders, rings, ghosts
    ctx.save();
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    this.drawSelection(ctx, g, v, now);
    this.drawCursorModes(ctx, v, now);
    this.drawUnitMarks(ctx, g, v);
    this.drawRadii(ctx, g, v);
    if (v.placing && v.mouse.inside) this.drawPlacementGhost(ctx, g, v);
    ctx.restore();

    // screen space
    drawIncoming(ctx, g, v, now);
    if (v.pilot) drawPilotHud(ctx, g, v, now);
    else drawHover(ctx, g, v);
    this.drawScaleBar(ctx, g, v, cam);
    if (v.drag) this.drawDragBox(ctx, v, cam);
  }

  /** the painted terrain, the optional map tiles, the towns, and the gas and wheat sites */
  private drawGround(ctx: Ctx, g: Game, v: View) {
    ctx.drawImage(this.tc.terrain, 0, 0);
    if (this.tc.basemap && this.tc.basemapTiles > 0) {
      ctx.drawImage(this.tc.basemap, 0, 0);
      poly(ctx, g.map, g.map.border, false);
      ctx.strokeStyle = 'rgba(193,18,31,0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      drawPipelines(ctx, g.map);
    }
    for (const rs of g.resources) drawResource(ctx, rs, this.localFx);
    for (const d of g.depots) drawDepot(ctx, d);
    // the grids: own lines in yellow, the enemy's in red, drawn under the buildings
    const PL = v.team;
    for (const T of [PL, 1 - PL]) {
      const ed = g.powerEdges[T];
      if (!ed.length) continue;
      ctx.strokeStyle = T === PL ? 'rgba(255,214,10,0.32)' : 'rgba(255,107,107,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const e of ed) {
        ctx.moveTo(e[0], e[1]);
        ctx.lineTo(e[2], e[3]);
      }
      ctx.stroke();
    }
  }

  /** buildings, the power warning over the ones short of it, and the rally line of a selected factory */
  private drawBuildings(ctx: Ctx, g: Game, v: View, now: number) {
    const PL = v.team;
    for (const s of g.structs) drawStruct(ctx, s);
    for (const s of g.structs)
      if (!s.dead && s.team === PL && s.build >= 1 && s.def.demand && (s.pow ?? 1) < 1) {
        const p = s.pow ?? 1,
          pulse = 0.5 + 0.5 * Math.sin(now / 250);
        ctx.save();
        ctx.translate(s.x, s.y - s.r - 22);
        ctx.globalAlpha = p === 0 ? 0.6 + 0.4 * pulse : 0.9;
        ctx.strokeStyle = p === 0 ? '#ff6b6b' : '#e0a030';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(3, -9);
        ctx.lineTo(-3, 0);
        ctx.lineTo(2, 0);
        ctx.lineTo(-3, 9);
        ctx.stroke();
        ctx.font = '600 10px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(12,14,10,0.9)';
        const t = p === 0 ? 'NO POWER' : 'POWER ' + Math.round(p * 100) + '%';
        ctx.strokeText(t, 8, 0);
        ctx.fillStyle = p === 0 ? '#ff8a80' : '#ffd08a';
        ctx.fillText(t, 8, 0);
        ctx.restore();
      }
    for (const s of v.selection)
      if (s.isStruct && s.def.produces && !s.dead) {
        ctx.strokeStyle = 'rgba(255,214,10,0.7)';
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.rally.x, s.rally.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(s.rally.x, s.rally.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
  }

  /** ground units, shells in flight, then the aircraft in altitude order, then the effects */
  private drawUnitsAndEffects(ctx: Ctx, g: Game, v: View, now: number) {
    const PL = v.team;
    for (const u of g.units) if (!u.def.air && (u.seenBy[PL] || u.team === PL)) drawUnit(ctx, u, now, v);
    drawProjectiles(ctx, g.projectiles);
    // low aircraft first, then the high ones on top: a layered sky
    for (const u of g.units) if (u.def.air && u.seenBy[PL] && altOf(u) < 2) drawUnit(ctx, u, now, v);
    for (const u of g.units) if (u.def.air && u.seenBy[PL] && altOf(u) === 2) drawUnit(ctx, u, now, v);
    drawEffects(ctx, g.effects, PL, g);
    drawEffects(ctx, this.localFx, PL);
  }

  /** the selected entities: ring, health, shells, ranges, routes, waypoints, links, postures, fire missions */
  private drawSelection(ctx: Ctx, g: Game, v: View, now: number) {
    const PL = v.team;
    for (const e of v.selection) {
      if (e.dead) continue;
      const r = (e.isUnit ? drawR(e.def) : e.r) + 5;
      const sp = e.isUnit ? parallaxOf(e, v) : { x: e.x, y: e.y };
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (e.isUnit) hpBar(ctx, sp.x - 12, sp.y - r - 8, 24, e.hp / e.def.hp);
      if (e.isUnit && e.def.ammo) {
        const max = e.def.ammo,
          n = e.ammo || 0;
        for (let i = 0; i < max; i++) {
          ctx.fillStyle = i < n ? '#f5e9c8' : 'rgba(0,0,0,0.5)';
          ctx.fillRect(e.x - max * 1.5 + i * 3, e.y + r + 3, 2, 3);
        }
      }
      const rng = e.isUnit ? g.rangeOf(e) : e.def.range || 0;
      const jam = e.def.jam || 0;
      if (rng > 100 || jam) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([4, 6]);
        if (rng > 100) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, rng, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (e.isUnit && e.def.minRange) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.def.minRange, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (jam) {
          ctx.strokeStyle = 'rgba(196,139,224,0.6)';
          ctx.beginPath();
          ctx.arc(e.x, e.y, jam, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    for (const e of v.selection) {
      if (!e.isUnit || e.dead) continue;
      if (e.path && e.path.length && e.order.kind === 'move') {
        ctx.strokeStyle = 'rgba(232,228,212,0.45)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        for (const w of e.path) ctx.lineTo(w.x, w.y);
        ctx.lineTo(e.order.x, e.order.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.waypoints && e.waypoints.length) {
        ctx.strokeStyle = 'rgba(255,214,10,0.55)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const start = e.order.kind === 'move' ? e.order : e;
        ctx.moveTo(start.x, start.y);
        for (const w of e.waypoints) ctx.lineTo(w.x, w.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,214,10,0.8)';
        e.waypoints.forEach((w, i) => {
          ctx.fillRect(w.x - 3, w.y - 3, 6, 6);
          ctx.font = '600 9px "Barlow Condensed", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), w.x, w.y - 6);
        });
      }
      if (e.def.operated && e.operator && !e.operator.dead) {
        ctx.strokeStyle = 'rgba(159,214,232,0.5)';
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.operator.x, e.operator.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // postures with a radius: an FPV in ambush, an interceptor guarding its post
      if (e.ambushed) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 500);
        dashedCircle(ctx, e.x, e.y, PILOT.ambushReach, [5, 7], 'rgba(198,228,139,' + (0.3 + 0.3 * pulse) + ')');
      }
      if (e.mode === 'guard' && e.post) {
        dashedCircle(ctx, e.post.x, e.post.y, PILOT.guardReach, [5, 7], 'rgba(159,214,232,0.45)');
      }
      if (e.scoot) {
        ctx.strokeStyle = 'rgba(240,138,93,0.7)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.scoot.x, e.scoot.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // a squad's control range and the drones it is flying
      if (e.def.operator && g.needsOperator(UNITS.fpv, PL)) {
        ctx.strokeStyle = 'rgba(159,214,232,0.35)';
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 650 + (g.upgrades[PL].auto1 ? 150 : 0), 0, Math.PI * 2);
        ctx.stroke();
        for (const dr of e.drones || [])
          if (!dr.dead) {
            ctx.setLineDash([3, 6]);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(dr.x, dr.y);
            ctx.stroke();
          }
        ctx.setLineDash([]);
      }
    }
    // a gun's fire mission: the beaten zone, wider when nobody is watching it
    for (const e of v.selection)
      if (e.isUnit && !e.dead && e.order.kind === 'bombard') {
        ctx.strokeStyle = 'rgba(255,107,107,0.8)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          e.order.x,
          e.order.y,
          (e.def.splash || 30) * (g.inVision(PL, e.order.x, e.order.y) ? 1 : 2.4),
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.order.x - 10, e.order.y);
        ctx.lineTo(e.order.x + 10, e.order.y);
        ctx.moveTo(e.order.x, e.order.y - 10);
        ctx.lineTo(e.order.x, e.order.y + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.order.x, e.order.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
  }

  /** the cursor while an attack-move or a fire mission is being placed, and a level's objective marker */
  private drawCursorModes(ctx: Ctx, v: View, now: number) {
    if (v.amoveMode && v.mouse.inside) {
      const w = toWorld(v, v.mouse.x, v.mouse.y);
      ctx.strokeStyle = '#ff9a80';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.x - 20, w.y);
      ctx.lineTo(w.x + 20, w.y);
      ctx.moveTo(w.x, w.y - 20);
      ctx.lineTo(w.x, w.y + 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (v.bombardMode && v.mouse.inside) {
      const w = toWorld(v, v.mouse.x, v.mouse.y);
      ctx.strokeStyle = '#ff6b6b';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(w.x, w.y, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (v.marker) {
      const m = v.marker,
        pulse = 0.5 + 0.5 * Math.sin(now / 300);
      dashedCircle(ctx, m.x, m.y, m.r + pulse * 10, [10, 8], 'rgba(255,214,10,' + (0.4 + 0.5 * pulse) + ')', 3);
    }
  }

  /** marks over units: swarm rings, posture tags, batteries, enemy pilots, morale, health */
  private drawUnitMarks(ctx: Ctx, g: Game, v: View) {
    const PL = v.team,
      EN = 1 - PL;
    for (const sw of g.swarms) {
      if (sw.team !== PL) continue;
      const ms = sw.members.filter(m => !m.dead);
      if (ms.length < 2) continue;
      const cx = ms.reduce((a, u) => a + u.x, 0) / ms.length,
        cy = ms.reduce((a, u) => a + u.y, 0) / ms.length;
      const rr = Math.max(...ms.map(m => Math.hypot(m.x - cx, m.y - cy))) + 16;
      dashedCircle(ctx, cx, cy, rr, [4, 6], 'rgba(58,134,255,0.55)');
      ctx.fillStyle = 'rgba(232,228,212,0.85)';
      ctx.font = '11px Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('swarm ' + ms.length, cx, cy - rr - 4);
    }
    for (const u of g.units) if (u.team === PL && !u.dead && u.mode) drawModeTag(ctx, u, v);
    // battery on every own drone in the air: green, amber under 40%, red under 15%
    for (const u of g.units)
      if (
        u.team === PL &&
        !u.dead &&
        u.def.endurance &&
        !u.landed &&
        !u.grounded &&
        !u.ambushed &&
        u.batt !== undefined
      ) {
        const k = clamp(u.batt / u.def.endurance, 0, 1),
          sp = parallaxOf(u, v);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(sp.x - 8, sp.y + drawR(u.def) + 4, 16, 3);
        ctx.fillStyle = k < 0.15 ? '#e04040' : k < 0.4 ? '#e0a030' : '#7fd1b9';
        ctx.fillRect(sp.x - 8, sp.y + drawR(u.def) + 4, 16 * k, 3);
      }
    // spotted enemy squads that are flying drones wear a link mark: kill the pilots, ground the drones
    for (const u of g.units)
      if (u.team === EN && !u.dead && u.seenBy[PL] && u.def.operator && g.droneCount(u) > 0) {
        const r = drawR(u.def);
        ctx.save();
        ctx.translate(u.x, u.y - r - 12);
        ctx.strokeStyle = '#ff8a80';
        ctx.fillStyle = '#ff8a80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.lineTo(0, -2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -2, 5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -2, 8, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        ctx.font = '600 9px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('x' + g.droneCount(u), 10, 0);
        ctx.restore();
      }
    for (const u of g.units)
      if (u.team === PL && u.def.morale && u.morale !== undefined) {
        ctx.fillStyle = '#000';
        ctx.fillRect(u.x - 10, u.y - drawR(u.def) - 4, 20, 3);
        ctx.fillStyle = u.morale < 30 ? '#e04040' : '#ffd60a';
        ctx.fillRect(u.x - 10, u.y - u.def.r - 4, (20 * u.morale) / 100, 3);
      }
    for (const u of g.units)
      if (u.team === PL && u.hp < u.def.hp && !v.selection.includes(u)) {
        const sp = parallaxOf(u, v);
        hpBar(ctx, sp.x - 10, sp.y - drawR(u.def) - 9, 20, u.hp / u.def.hp);
      }
    for (const u of g.units)
      if (u.team === EN && u.seenBy[PL] && u.hp < u.def.hp) {
        const sp = parallaxOf(u, v);
        hpBar(ctx, sp.x - 10, sp.y - drawR(u.def) - 9, 20, u.hp / u.def.hp);
      }
  }

  /** standing rings: own jammers and hospitals, relay bubbles, and the kill zone under enemy drones */
  private drawRadii(ctx: Ctx, g: Game, v: View) {
    const PL = v.team,
      EN = 1 - PL;
    for (const s of g.structs)
      if (s.team === PL && s.def.jam && s.build >= 1) {
        ctx.strokeStyle = 'rgba(196,139,224,0.35)';
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.def.jam, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    for (const st of g.structs)
      if (!st.dead && st.def.heal && st.build >= 1 && (st.civ ? st.nation === PL : st.team === PL)) {
        ctx.strokeStyle = 'rgba(139,195,74,0.35)';
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.def.heal, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    for (const u of g.units)
      if (u.team === PL && u.def.jam) {
        ctx.strokeStyle = 'rgba(196,139,224,0.3)';
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.def.jam, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    // relay carriers: the control bubble they project for the squads' drones
    for (const u of g.units)
      if (u.team === PL && !u.dead && u.def.relay)
        dashedCircle(
          ctx,
          u.x,
          u.y,
          u.def.relay,
          [4, 8],
          v.selection.includes(u) ? 'rgba(159,214,232,0.6)' : 'rgba(159,214,232,0.28)'
        );
    // the kill zone: a red ring under every armed enemy drone you can see, as far as it can see
    for (const u of g.units)
      if (u.team === EN && !u.dead && u.seenBy[PL] && g.isKillZoneDrone(u)) {
        const rr = g.visionR(u);
        ctx.strokeStyle = 'rgba(255,90,90,0.28)';
        ctx.fillStyle = 'rgba(255,90,90,0.05)';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(u.x, u.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
  }

  /** the building under the cursor while placing: where building is allowed, its radii, and why it cannot go here */
  private drawPlacementGhost(ctx: Ctx, g: Game, v: View) {
    const PL = v.team;
    const w = toWorld(v, v.mouse.x, v.mouse.y),
      def = STRUCTS[v.placing!];
    const hq = g.hq(PL);
    if (hq) dashedCircle(ctx, hq.x, hq.y, BUILD_RADIUS, [6, 8], 'rgba(255,214,10,0.35)', 1);
    for (const d of g.depots)
      if (d.owner === PL) dashedCircle(ctx, d.x, d.y, TOWN_BUILD_RADIUS, [6, 8], 'rgba(255,214,10,0.35)', 1);
    if (def.netR) dashedCircle(ctx, w.x, w.y, def.netR, [4, 6], '#e6e2cd', 1);
    if (def.heal) dashedCircle(ctx, w.x, w.y, def.heal, [4, 6], '#8bc34a', 1);
    if (def.pylon || def.power)
      dashedCircle(ctx, w.x, w.y, (def.pylon ? POWER.pylonR : POWER.linkR) + def.r, [4, 6], 'rgba(255,214,10,0.6)', 1);
    const err = g.placementError(PL, v.placing!, w.x, w.y);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = err ? '#c1121f' : '#3a86ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w.x, w.y, def.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (def.jam) dashedCircle(ctx, w.x, w.y, def.jam, [4, 6], '#c48be0', 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = '12px Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(err || def.label, w.x, w.y + def.r + 16);
  }

  /** north arrow, ten-kilometre bar, zoom, and the map tiles' attribution */
  private drawScaleBar(ctx: Ctx, g: Game, v: View, cam: Cam) {
    ctx.save();
    ctx.font = '600 13px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(232,228,212,0.9)';
    ctx.strokeStyle = 'rgba(232,228,212,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 46);
    ctx.lineTo(26, 22);
    ctx.moveTo(19, 30);
    ctx.lineTo(26, 22);
    ctx.lineTo(33, 30);
    ctx.stroke();
    ctx.fillText('N', 26, 56);
    const bar = 10 * g.map.pxPerKm * cam.z;
    ctx.beginPath();
    ctx.moveTo(52, 44);
    ctx.lineTo(52 + bar, 44);
    ctx.moveTo(52, 39);
    ctx.lineTo(52, 49);
    ctx.moveTo(52 + bar, 39);
    ctx.lineTo(52 + bar, 49);
    ctx.stroke();
    ctx.fillText('10 km', 52 + bar / 2, 56);
    ctx.textAlign = 'left';
    ctx.fillText('zoom ' + cam.z.toFixed(1) + 'x', 52 + bar + 14, 44);
    if (this.tc.basemap) {
      ctx.font = '11px Barlow, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(232,228,212,0.85)';
      ctx.fillText(
        this.tc.attrib() +
          (this.tc.basemapTiles < this.tc.basemapTotal
            ? ' (' + this.tc.basemapTiles + '/' + this.tc.basemapTotal + ' tiles)'
            : ''),
        10,
        v.vh - 8
      );
    }
    ctx.restore();
  }

  /** the box being dragged to select */
  private drawDragBox(ctx: Ctx, v: View, cam: Cam) {
    const d = v.drag!;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const x = (Math.min(d.x0, d.x1) - cam.x) * cam.z,
      y = (Math.min(d.y0, d.y1) - cam.y) * cam.z;
    ctx.fillRect(x, y, Math.abs(d.x1 - d.x0) * cam.z, Math.abs(d.y1 - d.y0) * cam.z);
    ctx.strokeRect(x, y, Math.abs(d.x1 - d.x0) * cam.z, Math.abs(d.y1 - d.y0) * cam.z);
  }

  /** client-only weather and night overlays in screen space */
  private drawWeather(ctx: Ctx, g: Game, v: View, now: number) {
    const { vw, vh, dpr } = v,
      k = g.weather.kind;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g.isNight()) {
      ctx.fillStyle = 'rgba(8,12,34,0.34)';
      ctx.fillRect(0, 0, vw, vh);
    }
    if (k === 'fog') {
      ctx.fillStyle = 'rgba(214,218,205,0.42)';
      ctx.fillRect(0, 0, vw, vh);
      const t = now / 9000;
      ctx.fillStyle = 'rgba(230,232,224,0.12)';
      for (let i = 0; i < 4; i++) {
        const x = ((t * 80 + i * 300) % (vw + 400)) - 200;
        ctx.beginPath();
        ctx.ellipse(x, vh * (0.2 + i * 0.2), 260, 90, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (k === 'rain') {
      ctx.fillStyle = 'rgba(40,52,64,0.16)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = 'rgba(200,220,240,0.35)';
      ctx.lineWidth = 1;
      const off = (now / 4) % 40;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const x = ((i * 97 + this.rainSeed) % (vw + 40)) - 20,
          y = ((i * 53 + off * (1 + (i % 3))) % (vh + 40)) - 20;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 14);
      }
      ctx.stroke();
    } else if (k === 'snow') {
      ctx.fillStyle = 'rgba(230,236,240,0.22)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const off = now / 40;
      for (let i = 0; i < 70; i++) {
        const x = (i * 131 + Math.sin(now / 900 + i) * 20 + vw) % vw,
          y = (i * 71 + off * (1 + (i % 4) * 0.4)) % vh;
        ctx.beginPath();
        ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** fog of war: the land goes dark except inside the player's vision circles */
  private drawFog(ctx: Ctx, g: Game, v: View) {
    const { cam, vw, vh, dpr } = v,
      fctx = this.fctx;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, vw, vh);
    fctx.fillStyle = 'rgba(8,10,6,0.6)';
    fctx.fillRect(0, 0, vw, Math.min(vh, (H_LAND - cam.y) * cam.z));
    fctx.globalCompositeOperation = 'destination-out';
    const z = cam.z;
    for (const vs of g.vision[v.team]) {
      const x = (vs.x - cam.x) * z,
        y = (vs.y - cam.y) * z,
        r = vs.r * z;
      if (x + r < 0 || y + r < 0 || x - r > vw || y - r > vh) continue;
      const gr = fctx.createRadialGradient(x, y, r * 0.72, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.fillStyle = gr;
      fctx.beginPath();
      fctx.arc(x, y, r, 0, Math.PI * 2);
      fctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fog, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ================================================================== the minimap
  renderMinimap(mmctx: Ctx, g: Game, v: View) {
    const PL = v.team;
    mmctx.setTransform(1, 0, 0, 1, 0, 0);
    mmctx.drawImage(this.tc.mm, 0, 0);
    const sx = MM_W / W,
      sy = MM_H / H;
    mmctx.fillStyle = 'rgba(0,0,0,0.3)';
    mmctx.fillRect(0, 0, MM_W, MM_H);
    for (const d of g.depots) {
      mmctx.fillStyle = d.owner === UA ? TEAMS[UA].color : d.owner === RU ? TEAMS[RU].color : '#c8c4b0';
      mmctx.fillRect(d.x * sx - 3, d.y * sy - 3, 6, 6);
    }
    for (const rs of g.resources) {
      mmctx.fillStyle =
        rs.burnT > 0 ? '#e0552b' : rs.owner === UA ? TEAMS[UA].color : rs.owner === RU ? TEAMS[RU].color : '#c8c4b0';
      mmctx.beginPath();
      mmctx.arc(rs.x * sx, rs.y * sy, 3, 0, Math.PI * 2);
      mmctx.fill();
    }
    for (const s of g.structs) {
      mmctx.fillStyle = s.civ ? '#e8e2cc' : TEAMS[s.team].color;
      mmctx.fillRect(s.x * sx - 2, s.y * sy - 2, s.civ ? 3 : 5, s.civ ? 3 : 5);
    }
    for (const u of g.units)
      if (u.seenBy[PL] || u.team === PL) {
        mmctx.fillStyle = u.team === UA ? '#9cc4ff' : u.team < 0 ? '#e8e2cc' : '#ff7a7a';
        mmctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
      }
    const f = this.mmFogCtx;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, MM_W, MM_H);
    f.fillStyle = 'rgba(4,6,3,0.62)';
    f.fillRect(0, 0, MM_W, H_LAND * sy);
    f.globalCompositeOperation = 'destination-out';
    for (const vs of g.vision[PL]) {
      f.beginPath();
      f.arc(vs.x * sx, vs.y * sy, Math.max(2, vs.r * sx), 0, Math.PI * 2);
      f.fill();
    }
    mmctx.drawImage(this.mmFog, 0, 0);
    // enemy columns announced to you: an arrow from where they set out to where they are going
    for (const inc of g.incoming) {
      if (inc.team !== PL) continue;
      const age = g.gameTime - inc.at;
      if (age > 25) continue;
      const k = Math.min(1, age / 4),
        x0 = inc.fx * sx,
        y0 = inc.fy * sy,
        x1 = inc.x * sx,
        y1 = inc.y * sy,
        hx = x0 + (x1 - x0) * k,
        hy = y0 + (y1 - y0) * k;
      mmctx.strokeStyle = 'rgba(255,107,107,0.85)';
      mmctx.fillStyle = 'rgba(255,107,107,0.85)';
      mmctx.lineWidth = 2;
      mmctx.setLineDash([3, 3]);
      mmctx.beginPath();
      mmctx.moveTo(x0, y0);
      mmctx.lineTo(hx, hy);
      mmctx.stroke();
      mmctx.setLineDash([]);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      mmctx.save();
      mmctx.translate(hx, hy);
      mmctx.rotate(ang);
      mmctx.beginPath();
      mmctx.moveTo(6, 0);
      mmctx.lineTo(-4, -4);
      mmctx.lineTo(-4, 4);
      mmctx.closePath();
      mmctx.fill();
      mmctx.restore();
    }
    // pings: things that just happened to your side, fading over twelve seconds
    for (const a of g.alerts) {
      if (a.team !== PL) continue;
      const age = g.gameTime - a.at;
      if (age > 12) continue;
      const k = age / 12,
        pulse = 0.5 + 0.5 * Math.sin(age * 9);
      mmctx.strokeStyle = 'rgba(255,90,90,' + (0.9 - 0.7 * k) + ')';
      mmctx.lineWidth = 1.5;
      mmctx.beginPath();
      mmctx.arc(a.x * sx, a.y * sy, 4 + pulse * 3 + k * 4, 0, Math.PI * 2);
      mmctx.stroke();
    }
    mmctx.strokeStyle = '#fff';
    mmctx.lineWidth = 1;
    mmctx.strokeRect(v.cam.x * sx + 0.5, v.cam.y * sy + 0.5, (v.vw / v.cam.z) * sx, (v.vh / v.cam.z) * sy);
  }
}
