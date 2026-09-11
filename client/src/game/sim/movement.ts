// Movement: routing along roads, stepping toward a goal with stall detection, rivers crossed only at bridges,
// and keeping ground units and buildings apart.
import { PILOT } from '../data';
import { W, H, H_LAND } from '../map';
import { hyp, clamp, datan2 } from '../dmath';
import type { Unit, Pt } from '../types';
import type { Game } from './game';

export function planRoute(g: Game, u: Unit, tx: number, ty: number) {
  u.path = null;
  if (u.def.air || !g.terrain.roadEdges.length) return;
  const direct = hyp(tx - u.x, ty - u.y);
  if (direct < 120) return;
  const s0 = g.terrain.nearestRoad(u.x, u.y),
    s1 = g.terrain.nearestRoad(tx, ty);
  if (!s0 || !s1) return;
  const r = g.terrain.roadPath(s0, s1);
  if (!r) return;
  const mul = u.def.roadMul || 1.4,
    roadTime = s0.d + s1.d + r.len / mul;
  if (roadTime > direct * 1.1) return;
  u.path = [{ x: s0.px, y: s0.py }]
    .concat(r.path, [{ x: s1.px, y: s1.py }])
    .filter((w, i, arr) => i === 0 || hyp(w.x - arr[i - 1].x, w.y - arr[i - 1].y) > 4);
}

export function stepMove(g: Game, u: Unit, tx: number, ty: number, dt: number): boolean | 'stalled' {
  const goal = u.path && u.path.length ? u.path[0] : { x: tx, y: ty };
  const key = goal.x + ',' + goal.y;
  if (u.goalKey !== key) {
    u.goalKey = key;
    u.bestD = Infinity;
    u.stallT = 0;
  }
  if (u.path && u.path.length) {
    moveToward(g, u, goal.x, goal.y, dt);
    const d = hyp(goal.x - u.x, goal.y - u.y);
    if (d < u.bestD! - 1) {
      u.bestD = d;
      u.stallT = 0;
    } else u.stallT = (u.stallT || 0) + dt;
    if (d < 22 || u.stallT! > 1.5) {
      u.path.shift();
      u.goalKey = null;
    }
    return false;
  }
  moveToward(g, u, tx, ty, dt);
  const d = hyp(tx - u.x, ty - u.y);
  if (d < u.bestD! - 1) {
    u.bestD = d;
    u.stallT = 0;
  } else u.stallT = (u.stallT || 0) + dt;
  if (u.stallT! > 3) {
    u.stallT = 0;
    u.detour = null;
    u.goalKey = null;
    return 'stalled';
  }
  return true;
}

export function moveToward(g: Game, u: Unit, tx: number, ty: number, dt: number) {
  if (!u.def.air && u.detour) {
    if (hyp(u.detour.x - u.x, u.detour.y - u.y) < 26) u.detour = null;
    else {
      tx = u.detour.x;
      ty = u.detour.y;
    }
  }
  const dx = tx - u.x,
    dy = ty - u.y,
    dd = hyp(dx, dy);
  if (dd < 0.5) return;
  const mode = g.modeOf(u),
    postureMul = mode === 'creep' ? 0.55 : g.piloted(u) ? PILOT.speed : 1;
  const step = Math.min(
    dd,
    u.def.speed *
      (u.onRoad ? u.def.roadMul || 1.4 : 1) *
      (u.def.morale ? 0.7 + 0.3 * g.moraleMul(u) : 1) *
      g.fuelMul(u) *
      g.moveMul(u) *
      postureMul *
      dt
  );
  const nx = u.x + (dx / dd) * step,
    ny = u.y + (dy / dd) * step;
  if (!u.def.air) {
    const blk = g.terrain.waterBlock(u.x, u.y, nx, ny);
    if (blk) {
      if (blk !== 'poly') {
        const tx_ = blk[1].x - blk[0].x,
          ty_ = blk[1].y - blk[0].y,
          L = hyp(tx_, ty_) || 1,
          ux = tx_ / L,
          uy = ty_ / L;
        const proj = (dx / dd) * step * ux + (dy / dd) * step * uy;
        const sx = u.x + ux * proj,
          sy = u.y + uy * proj;
        if (Math.abs(proj) > 0.05 && !g.terrain.waterBlock(u.x, u.y, sx, sy)) {
          u.x = sx;
          u.y = sy;
          u.angle = datan2(uy * Math.sign(proj), ux * Math.sign(proj));
          return;
        }
      }
      if (!u.detour) {
        const b = g.terrain.nearestBridge(u, 900);
        if (b) u.detour = b;
      }
      return;
    }
  }
  u.x = nx;
  u.y = ny;
  u.angle = datan2(dy, dx);
}

export function moveAway(u: Unit, t: Pt, dt: number) {
  const dx = u.x - t.x,
    dy = u.y - t.y,
    dd = hyp(dx, dy) || 1;
  const step = u.def.speed * dt;
  u.x += (dx / dd) * step;
  u.y += (dy / dd) * step;
}

export function separate(g: Game) {
  // only ground units push each other and buildings apart: aircraft (flying, landed, or grounded) pass over everything and nothing pushes them
  const ground: Unit[] = [];
  for (const u of g.units) if (!u.dead && !u.def.air) ground.push(u);
  for (let i = 0; i < ground.length; i++) {
    const a = ground[i];
    for (let j = i + 1; j < ground.length; j++) {
      const b = ground[j];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        min = a.def.r + b.def.r + 2;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const dd = Math.sqrt(d2),
          push = ((min - dd) / 2) * 0.6,
          nx = dx / dd,
          ny = dy / dd;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      } else if (d2 <= 0.01) {
        a.x += g.rand(-1, 1);
        a.y += g.rand(-1, 1);
      }
    }
    for (const s of g.structs) {
      if (s.dead || s.def.trench) continue;
      const dx = a.x - s.x,
        dy = a.y - s.y,
        min = s.r + a.def.r + 3,
        d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const dd = Math.sqrt(d2) || 1;
        a.x = s.x + (dx / dd) * min;
        a.y = s.y + (dy / dd) * min;
      }
    }
  }
  for (const u of g.units) {
    u.x = clamp(u.x, 6, W - 6);
    u.y = clamp(u.y, 6, (u.def.air ? H : H_LAND) - 6);
  }
}
