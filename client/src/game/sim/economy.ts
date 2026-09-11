// Supply: the power grids (buildings and pylons joined by union-find, each grid sharing its sources) and the
// food, fuel, and drone-charging capacities that scale fire, speed, and recharging when they run short.
import { UA, RU, STRUCTS, FUEL_USERS, GAS_YIELD, FUEL_BASE, FUEL_PER_NODE, POWER } from '../data';
import { dist } from '../dmath';
import type { Struct } from '../types';
import type { Game } from './game';
import { foodRate } from './food';

/** nodes of a side's grid: its finished buildings (not trenches or nets) and its nation's substations */
export function powerNodes(g: Game, T: number, building = false): Struct[] {
  return g.structs.filter(
    s =>
      !s.dead &&
      (building || s.build >= 1) &&
      !s.def.trench &&
      !s.def.netR &&
      (s.civ ? s.type === 'power' && s.nation === T : s.team === T)
  );
}

export function powerLinked(a: Struct, b: Struct): boolean {
  return dist(a, b) <= (a.def.pylon || b.def.pylon ? POWER.pylonR : POWER.linkR) + a.r + b.r;
}

/** a pylon can be placed here: something of the grid is within reach (buildings still going up count) */
export function powerReach(g: Game, team: number, x: number, y: number, r: number): boolean {
  const p = { x, y, r, def: STRUCTS.pylon } as Struct;
  return powerNodes(g, team, true).some(n => powerLinked(n, p));
}

/** union the nodes within reach into grids; each grid shares its supply, and what is left over charges drones */
export function updatePower(g: Game) {
  for (const T of [UA, RU]) {
    const nodes = powerNodes(g, T),
      n = nodes.length,
      parent = nodes.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const edges: [number, number, number, number][] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (powerLinked(nodes[i], nodes[j])) {
          const a = find(i),
            b = find(j);
          if (a !== b) parent[a] = b;
          edges.push([nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y]);
        }
    const supply = new Map<number, number>(),
      demand = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      supply.set(r, (supply.get(r) || 0) + (nodes[i].def.power || 0));
      demand.set(r, (demand.get(r) || 0) + (nodes[i].def.demand || 0));
    }
    let cap = 0;
    for (const [r, s] of supply) cap += Math.max(0, s - (demand.get(r) || 0));
    for (let i = 0; i < n; i++) {
      const s = nodes[i],
        r = find(i),
        sup = supply.get(r) || 0,
        dem = demand.get(r) || 0;
      s.grid = r;
      s.pow = sup <= 0 ? 0 : dem <= sup ? 1 : sup / dem;
      if (s.def.demand && !s.civ) {
        if (s.pow === 0 && !s.unpoweredWarned) {
          s.unpoweredWarned = true;
          g.notify(T, s.def.label + ' has no power: run pylons from the grid or put a generator set beside it');
        } else if (s.pow > 0) s.unpoweredWarned = false;
      }
    }
    g.powerCapGrid[T] = Math.floor(cap);
    g.powerEdges[T] = edges;
  }
}

export function updateSupply(g: Game) {
  for (const T of [UA, RU]) {
    const sp = g.supply[T];
    let squads = 0,
      fed = 0,
      fuelUsed = 0,
      powerUsed = 0;
    for (const u of g.units) {
      if (u.dead || u.team !== T) continue;
      if (u.def.troop) {
        squads++;
        if ((u.rations ?? 1) > 0) fed++;
      }
      if (FUEL_USERS.has(u.type)) fuelUsed++;
      if (u.def.electric) powerUsed++;
    }
    const fuelCap = FUEL_BASE + Math.round((FUEL_PER_NODE * g.gasIncome(T)) / GAS_YIELD);
    const powerCap = g.powerCapGrid[T];
    const food = squads ? fed / squads : 1,
      fuel = fuelUsed > fuelCap ? fuelCap / fuelUsed : 1,
      power = powerUsed > powerCap ? powerCap / powerUsed : 1;
    if (fuel < 1 && sp.fuel >= 1)
      g.notify(
        T,
        'Fuel shortage: ' +
          fuelUsed +
          ' vehicles, fuel for ' +
          fuelCap +
          '. Vehicles slow to ' +
          Math.round((0.35 + 0.65 * fuel) * 100) +
          '%. Hold gas and keep the pipeline whole.'
      );
    if (power < 1 && sp.power >= 1)
      g.notify(
        T,
        'Power shortage: ' +
          powerUsed +
          ' battery drones, charging for ' +
          powerCap +
          '. Recharging takes three times longer and no more battery drones can be built.'
      );
    if (power >= 1 && sp.power < 1) g.notify(T, 'Charging capacity restored');
    if (fuel >= 1 && sp.fuel < 1) g.notify(T, 'Fuel supply restored');
    sp.food = food;
    sp.fuel = fuel;
    sp.power = power;
    sp.foodStock = g.food[T];
    sp.foodRate = foodRate(g, T);
    sp.fuelUsed = fuelUsed;
    sp.fuelCap = fuelCap;
    sp.powerUsed = powerUsed;
    sp.powerCap = powerCap;
  }
}
