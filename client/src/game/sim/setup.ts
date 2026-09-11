// The opening position on the game's map: towns, gas and wheat sites, pipelines with their pumps, both
// headquarters with their factories and starting forces, the civilian sites, and the first civilian cars.
// Ukraine is always the southern side and Russia the northern one; the bases face each other across the border.
import { UA, RU, GAS_YIELD } from '../data';
import { makeBot } from '../bot';
import type { Game } from './game';
import { computeVision } from './vision';
import { updateSupply } from './economy';
import { spawnCivCar } from './civilians';

export function setup(g: Game) {
  const { map } = g;
  g.depots = map.towns.map(([name, lat, lon]) => {
    const p = map.geo(lat, lon);
    return { name, x: p.x, y: p.y, r: 45, owner: -1, capTeam: -1, cap: 0, supplyT: g.rand(8, 20), burnT: 0 };
  });
  g.resources = map.resources.map(([kind, name, lat, lon, owner]) => {
    const p = map.geo(lat, lon);
    return {
      kind,
      name,
      x: p.x,
      y: p.y,
      r: kind === 'wheat' ? 58 : 40,
      owner,
      capTeam: -1,
      cap: 0,
      burnT: 0,
      supplyT: g.rand(10, 40),
      // a fuel depot or metering station pays more than a well field
      yieldRate: name.includes('depot') || name.includes('station') ? GAS_YIELD * 2.4 : GAS_YIELD,
      isRes: true,
    };
  });
  for (const pl of map.pipelines)
    for (const idx of pl.pumps) {
      const p = map.geo(pl.pts[idx][0], pl.pts[idx][1]);
      g.pumpSites.push({ team: pl.team, x: p.x, y: p.y, struct: null, rebuildT: 0 });
    }
  for (const ps of g.pumpSites) {
    ps.struct = g.makeStruct('pump', ps.team, ps.x, ps.y, true);
    g.structs.push(ps.struct);
  }

  const ua = map.hq[UA],
    ru = map.hq[RU];
  for (const T of [UA, RU])
    if (g.isBot[T]) g.bots[T] = makeBot(T, T === RU ? { x: ru.x, y: ru.y + 230 } : { x: ua.x, y: ua.y - 230 });
  const S = (type: string, team: number, x: number, y: number) => g.structs.push(g.makeStruct(type, team, x, y, true));

  // the Ukrainian base, its front facing north
  S('hq', UA, ua.x, ua.y);
  S('barracks', UA, ua.x - 100, ua.y - 96);
  S('droneWorks', UA, ua.x + 110, ua.y - 104);
  S('armorPlant', UA, ua.x - 230, ua.y + 40);
  S('artyDepot', UA, ua.x + 200, ua.y + 30);
  S('radar', UA, ua.x - 200, ua.y - 40);
  S('radar', UA, ua.x + 205, ua.y - 60);
  g.units.push(g.makeUnit('aa', UA, ua.x - 60, ua.y - 260));
  for (let i = 0; i < 2; i++) g.units.push(g.makeUnit('fireGroup', UA, ua.x + 40 + i * 40, ua.y - 260));
  S('ewStation', UA, ua.x, ua.y - 130);
  for (let i = 0; i < 5; i++) g.units.push(g.makeUnit('infantry', UA, ua.x - 68 + i * 34, ua.y - 200));
  g.units.push(g.makeUnit('ifv', UA, ua.x, ua.y - 240));

  // the Russian base, its front facing south
  S('hq', RU, ru.x, ru.y);
  S('droneWorks', RU, ru.x - 140, ru.y + 94);
  S('armorPlant', RU, ru.x + 140, ru.y + 84);
  S('artyDepot', RU, ru.x - 110, ru.y - 46);
  S('barracks', RU, ru.x + 110, ru.y - 46);
  S('radar', RU, ru.x - 200, ru.y + 40);
  S('radar', RU, ru.x + 205, ru.y + 60);
  for (let i = 0; i < 2; i++) g.units.push(g.makeUnit('fireGroup', RU, ru.x - 40 + i * 40, ru.y + 300));
  S('ewStation', RU, ru.x, ru.y + 130);
  for (const T of [UA, RU]) {
    const b = g.bots[T];
    if (b)
      for (const s of g.structs)
        if (s.team === T) s.rally = { x: b.staging.x + g.rand(-80, 80), y: b.staging.y + g.rand(-50, 50) };
  }
  for (const [type, nation, place, dx, dy] of map.civSites) {
    const c = map.placePos(place);
    g.structs.push(g.makeCiv(type, nation, c.x + dx, c.y + dy));
  }
  for (let i = 0; i < 3; i++) {
    spawnCivCar(g, 0);
    spawnCivCar(g, 1);
  }
  for (let i = 0; i < 5; i++)
    g.units.push(g.makeUnit('infantry', RU, ru.x - 80 + i * 40, ru.y + 224 + g.rand(-30, 30)));
  g.units.push(g.makeUnit('ifv', RU, ru.x, ru.y + 264));
  g.units.push(g.makeUnit('aa', RU, ru.x, ru.y + 184));
  computeVision(g);
  updateSupply(g);
}
