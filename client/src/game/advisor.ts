// The commander's advisor: one sentence about the most pressing gap, built from the same situation read the
// bot uses. Nothing here touches the simulation; it only looks.
import type { Game } from './sim';

/** the advice for this moment, or null when nothing needs saying */
export function advise(g: Game, T: number): string | null {
  const E = 1 - T;
  const mine = g.units.filter(u => u.team === T && !u.dead);
  const seen = g.units.filter(u => u.team === E && !u.dead && u.seenBy[T]);
  const n = (f: (u: (typeof mine)[number]) => boolean) => mine.filter(f).length;
  const guns = n(u => !!u.def.indirect),
    recon = n(u => !!u.def.recon),
    airDefense = n(u => u.type === 'aa' || u.type === 'fireGroup' || u.type === 'interceptor'),
    squads = n(u => !!u.def.troop),
    fibers = n(u => u.type === 'fiberFpv' || u.type === 'tank');
  const eAir = seen.filter(u => u.def.air).length,
    eArmor = seen.filter(u => u.type === 'tank' || u.type === 'ifv').length,
    eJam = seen.filter(u => !!u.def.jam).length;
  const sp = g.supply[T];
  const towns = g.depots.filter(d => d.owner === T).length;
  const dark = g.structs.some(s => s.team === T && !s.dead && s.build >= 1 && s.def.demand && s.pow === 0);
  const idleFactory = g.structs.some(
    s => s.team === T && !s.dead && s.build >= 1 && s.def.produces && s.queue.length === 0
  );
  const tips: [boolean, string][] = [
    [
      sp.hungry > 0,
      'Squads are out of rations. Stock the nearest town with a supply truck, or pull them back toward the headquarters.',
    ],
    [
      g.food[T] < 100 && g.wheatHeld(T) === 0 && squads > 0,
      'The larder is nearly empty and you hold no wheat field. Take one, or the barracks stops recruiting.',
    ],
    [
      guns >= 1 && recon === 0,
      'You have ' +
        guns +
        (guns > 1 ? ' guns' : ' gun') +
        ' and no spotter. Queue a Mavic: artillery only shells what your side can see.',
    ],
    [
      eAir >= 4 && airDefense === 0,
      'Enemy drones are over you and you have no air defense. A mobile fire group at the barracks reaches the low ones; a Sting hunts the rest.',
    ],
    [sp.power < 1, 'Charging capacity is short: a generator set or a power plant, or the drones sit on the ground.'],
    [sp.fuel < 1, 'Fuel is short. Hold the gas sites and keep the pipeline whole, or the vehicles crawl.'],
    [dark, 'A building of yours has no power. Run pylons to it from the grid, or park a generator set beside it.'],
    [
      eArmor >= 2 && fibers === 0,
      'Enemy armor is in view and nothing of yours answers it. Fiber-optic FPVs or a tank of your own.',
    ],
    [eJam >= 1 && fibers === 0, 'An enemy jammer is up: your radio drones fall near it. Fiber-optic FPVs fly through.'],
    [
      g.funds[T] > 1500,
      'Funds are piling up: ' + Math.floor(g.funds[T]) + ' unspent. Queue units, or research something (T).',
    ],
    [idleFactory && g.funds[T] > 300, 'A factory stands idle with funds in hand. Queue something.'],
    [
      towns === 0 && g.gameTime > 120,
      'You hold no town. Towns pay by truck and feed the squads at the front: march on the nearest one.',
    ],
    [
      squads > 0 && recon === 0 && g.gameTime > 90,
      'Nothing of yours is watching the front. A Mavic high over the woods is the cheapest insurance there is.',
    ],
  ];
  const hits = tips.filter(t => t[0]).map(t => t[1]);
  if (!hits.length) return null;
  // rotate through what applies so the same line is not repeated every time
  return hits[Math.floor(g.gameTime / 45) % hits.length];
}
