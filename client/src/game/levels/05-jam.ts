import { UA, RU } from '../data';
import type { Level } from './types';
import { at, dist, holdFor, kills, mark, own, squads, town, townOwned, unitsNear } from './helpers';

export const level05: Level = {
  id: 'jam',
  map: 'kharkiv',
  title: '5. Under the jammer',
  side: UA,
  difficulty: 0.5,
  passiveUntil: 4,
  noGeransUntil: Infinity,
  blurb:
    'A Russian jammer sits over Zhuravlyovka. Learn why radio FPVs fall out of the sky there, spool up fiber-optic drones, kill the jammer, take the town, then build electronic warfare of your own and lay a fiber ambush for the counterattack.',
  concepts: [
    'EW bubbles',
    'Fiber-optic FPVs',
    'Tether range',
    'Killing the jammer',
    'Your own jammers and EW stations',
    'Silent posture',
    'Ambush posture',
  ],
  briefing: [
    'Zhuravlyovka, just over the border. A Russian jammer truck has parked there with three dug-in squads around it, and every radio drone we send falls out of the sky.',
    'The answer is a spool of fiber. Fiber-optic FPVs cannot be jammed, but they are tethered to the squad that flies them, five hundred pixels and not one more.',
    'Bring the squads up to Lyptsi first, then queue the fibers. Kill the jammer, and the radio drones work again.',
    'Then take the town and make it theirs to lose: a jammer of your own, an EW station, and fibers sitting in ambush on the road. The enemy will not stay quiet after that.',
  ],
  shots: g => [
    at(g, 'Zhuravlyovka'),
    at(g, 'Lyptsi'),
    g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || at(g, 'Lyptsi'),
    at(g, 'Zhuravlyovka'),
  ],
  sideNote:
    'Ukraine: fiber FPVs are tethered to a squad within 500, so the squads have to walk up before the drones can reach.',
  scenario: g => {
    g.capture('Lyptsi', UA);
    const L = g.site('Lyptsi');
    squads(g, UA, 'infantry', L.x, L.y - 30, 3);
    g.funds[UA] = 2400;
    g.capture('Zhuravlyovka', RU);
    const Z = g.site('Zhuravlyovka');
    squads(g, RU, 'infantry', Z.x, Z.y + 20, 3, true);
    const j = g.spawn('jammer', RU, Z.x + 40, Z.y + 60);
    g.tags.jammer = j.id;
    g.funds[RU] = 0;
  },
  objectives: [
    {
      title: 'Spot the bubble',
      text: 'Queue a Mavic (C at the drone works) and send it north toward Zhuravlyovka. The purple dashed ring is jamming: radio drones inside lose 30 hp a second.',
      done: g => {
        const j = g.find(g.tags.jammer);
        return !!(
          j &&
          j.isUnit &&
          (j.seenBy[UA] ||
            g.stats.jammed[UA] > 0 ||
            g.units.some(u => u.team === UA && u.def.air && !u.dead && dist(u, j) < 380))
        );
      },
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'Learn the hard way',
      text: 'Queue an FPV (Z) and fly it at the town. Watch it flicker white and fall. That is what jamming does to every radio drone you own.',
      done: g => g.stats.jammed[UA] >= 1 || g.units.some(u => u.team === UA && u.def.jammable && u.jamT > 0),
    },
    {
      title: 'Spool the fiber',
      text: 'Fiber FPVs are flown by the squad nearest the works with a free slot and tethered to it within 500. First march every squad at Kharkiv up to Lyptsi (404 from the town), then queue three fiber-optic FPVs (X at the works): 45 funds, immune to jamming.',
      done: g =>
        g.typeCount(UA, 'fiberFpv') >= 3 &&
        g.units.filter(u => u.team === UA && u.def.operator && !u.dead && dist(u, at(g, 'Lyptsi')) < 200).length >= 5,
      marker: town('Lyptsi'),
    },
    {
      title: 'Kill the jammer',
      text: 'Select the fiber FPVs and right-click the jammer, or press F to dive at the nearest target in sight. Nets still catch fiber drones, jammers never do.',
      done: g => kills(g, UA, 'jammer') >= 1 || !g.find(g.tags.jammer),
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'Take the town',
      text: 'With the bubble gone, radio FPVs work again. Move the squads up and capture Zhuravlyovka. The enemy is awake now.',
      done: townOwned('Zhuravlyovka', UA),
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'A jammer of your own',
      text: 'Queue an EW jammer at the armor plant (V) and drive it to Zhuravlyovka: every Russian radio drone inside its 190 bubble falls. Then switch it to Silent (R): an emitting jammer shows on enemy radar posts within 900 and draws Lancets; switch it on when the drones come.',
      done: g => {
        const Z = at(g, 'Zhuravlyovka');
        return unitsNear(g, UA, Z, 300, 'jammer').some(u => g.modeOf(u) === 'silent');
      },
      marker: own('armorPlant'),
    },
    {
      title: 'An EW station',
      text: 'A jammer moves; an EW station stands. Build one from the Build tab near Zhuravlyovka: a 240 bubble that drops radio drones and never runs out of fuel. Fiber FPVs and frequency hopping are the only things that get through.',
      done: g => g.structs.filter(s => s.team === UA && s.type === 'ewStation' && !s.dead).length >= 2,
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'Fiber ambush',
      text: 'Fly a fiber FPV to the road north of the town and switch it to Ambush (R): it lands with the motors off, drains no battery, is seen only within 60, and pounces on the first enemy within 220. The road ambush of 2025.',
      done: g => g.units.some(u => u.team === UA && !u.dead && u.type === 'fiberFpv' && !!u.ambushed),
    },
    {
      title: 'Hold Zhuravlyovka',
      text: 'The counterattack is coming. Hold the town for 90 seconds: squads in the trenches, the jammer emitting when their drones arrive, the fibers in ambush on the road.',
      onStart: mark('jam:9'),
      done: holdFor('jam:9', 90, townOwned('Zhuravlyovka', UA)),
      marker: town('Zhuravlyovka'),
    },
  ],
};
