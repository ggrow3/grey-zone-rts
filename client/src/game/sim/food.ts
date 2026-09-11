// Food: the supply line that feeds the squads. Wheat fields send grain trucks to the headquarters larder,
// the larder fills the supply trucks that stock the held towns, and every squad eats from what is near it:
// the larder within reach of the headquarters, a town's stores at the front, nothing in between. A squad
// carries five minutes of rations; when they run out it fights and moves worse and loses heart.
import { UA, RU, FOOD } from '../data';
import { dist } from '../dmath';
import type { Game } from './game';

export function updateFood(g: Game, dt: number) {
  const hqs = [g.hq(UA), g.hq(RU)];
  const hungry = [0, 0];
  let firstHungry: [{ x: number; y: number } | null, { x: number; y: number } | null] = [null, null];
  // the headquarters' own kitchens
  for (const T of [UA, RU]) g.food[T] += FOOD.kitchens * dt;
  for (const u of g.units) {
    if (u.dead || u.team < 0 || !u.def.troop) continue;
    if (u.rations === undefined) u.rations = FOOD.rations;
    u.rations = Math.max(0, u.rations - FOOD.eat * dt);
    let need = Math.min(FOOD.rations - u.rations, FOOD.resupply * dt);
    // draw on the larder when close to the headquarters
    const hq = hqs[u.team];
    if (need > 0 && hq && dist(u, hq) <= FOOD.hqRange) {
      const take = Math.min(need, g.food[u.team]);
      g.food[u.team] -= take;
      u.rations += take;
      need -= take;
    }
    // else on the stores of a held town the trucks have stocked
    if (need > 0)
      for (const d of g.depots) {
        if (d.owner !== u.team || !d.food || dist(u, d) > d.r + FOOD.townRange) continue;
        const take = Math.min(need, d.food);
        d.food -= take;
        u.rations += take;
        break;
      }
    if (u.rations <= 0) {
      hungry[u.team]++;
      if (!firstHungry[u.team]) firstHungry[u.team] = u;
    }
  }
  for (const T of [UA, RU]) {
    g.supply[T].hungry = hungry[T];
    g.foodWarnT[T] -= dt;
    if (hungry[T] > 0) {
      if (g.foodWarnT[T] <= 0) {
        g.foodWarnT[T] = 25;
        const p = firstHungry[T]!;
        g.notify(
          T,
          hungry[T] +
            ' squad' +
            (hungry[T] > 1 ? 's are' : ' is') +
            ' out of rations near ' +
            g.map.nearestPlace(p.x, p.y) +
            ': fire at ' +
            Math.round(FOOD.hungryFire * 100) +
            '%, speed ' +
            Math.round(FOOD.hungrySpeed * 100) +
            '%. Stock the nearest town with a supply truck or pull them back'
        );
        if (!g.foodWasHungry[T]) g.alert(T, p.x, p.y, 'Squad out of rations');
      }
      g.foodWasHungry[T] = true;
    } else if (g.foodWasHungry[T]) {
      g.foodWasHungry[T] = false;
      g.notify(T, 'Every squad is fed again');
    }
  }
}

/** rations a side's larder gains a second from its kitchens and its wheat fields, minus what its squads eat */
export function foodRate(g: Game, team: number): number {
  const fields = g.resources.filter(r => r.kind === 'wheat' && r.owner === team && r.burnT <= 0).length;
  let squads = 0;
  for (const u of g.units) if (u.team === team && !u.dead && u.def.troop) squads++;
  return FOOD.kitchens + (fields * FOOD.grainLoad * g.logiMul(team)) / FOOD.grainPeriod - squads * FOOD.eat;
}
