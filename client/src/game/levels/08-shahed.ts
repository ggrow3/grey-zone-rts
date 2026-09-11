import { UA, RU } from '../data';
import type { Level } from './types';
import { at, dist, holdFor, hqOf, inMode, mark, own, ring, substation } from './helpers';

export const level08: Level = {
  id: 'shahed',
  map: 'kharkiv',
  title: '8. Shahed night',
  side: RU,
  difficulty: 0.5,
  start: 'night',
  passiveUntil: 4,
  noGeransUntil: Infinity,
  blurb:
    'It is night. Put an Orlan over Kharkiv, launch a Geran wave with decoys at the substation, follow up with Molniya fixed-wing drones, creep the infantry across the dark fields, lay an FPV ambush on the highway, and hold on when Ukraine answers at dawn.',
  concepts: [
    'Night and vision',
    'Orlan-10 spotting',
    'Geran waves and decoys',
    'The substation',
    'Molniya',
    'Creeping in the dark',
    'FPV ambushes',
    'Hunting trucks',
    'Layered defense',
  ],
  briefing: [
    'Night over Kharkiv. Their air-defense battery has moved east; what stands between you and the city grid tonight is a handful of fire groups and one Sting.',
    'Put an Orlan over the city first. It flies above the machine guns, and it sees everything. Ground units see 60% as far in the dark, which is why the dark is when the infantry moves.',
    'The Geran wave costs six hundred and the crews need ninety seconds to reload: three drones and four decoys, the first two aimed at the substation. Kill the grid and their drones stop charging.',
    'Then send the Molniyas south to hunt over the gas wells, creep the squads up the highway, and be ready. Kharkiv answers at dawn.',
  ],
  shots: g => [hqOf(g, RU), hqOf(g, UA), substation(g, 0) || hqOf(g, UA), at(g, 'Gas wells')],
  sideNote:
    'Russia: Geran waves are a 600-fund command with a 90 s reload. The bot gets them free; a human pays but chooses the moment.',
  // Ukraine's air-defense battery is away tonight: fire groups and a Sting are what stand between the wave and the grid
  scenario: g => {
    g.funds[RU] = 1500;
    g.grant(RU, 'launchRail');
    const kh = hqOf(g, UA);
    g.spawn('interceptor', UA, kh.x + 60, kh.y - 220);
    for (const a of g.units.filter(u => u.team === UA && u.type === 'aa')) g.removeUnit(a);
  },
  objectives: [
    {
      title: 'High eye',
      text: 'Queue an Orlan-10 at the drone works (H) and fly it over Kharkiv. It flies above machine guns; only air defense and Stings reach it. At night every drone sees 85% as far, and ground units 60%.',
      done: g => g.units.some(u => u.team === RU && u.type === 'fwRecon' && !u.dead && dist(u, hqOf(g, UA)) < 600),
      marker: g => ring(hqOf(g, UA), 300),
    },
    {
      title: 'Launch a wave',
      text: 'Press the Geran wave button in the Build tab (600 funds): three Gerans and four Gerbera decoys from the north, east, and south, the first two aimed at the substation. Decoys soak up shots.',
      done: g => g.stats.waves[RU] >= 1,
    },
    {
      title: 'Lights out',
      text: 'The wave goes for the Kharkiv substation first. Without it Ukraine charges 30 fewer battery drones. Launch again when the crews have reloaded.',
      done: g => !substation(g, 0),
      marker: g => {
        const s = substation(g, 0);
        return s ? ring(s, 70) : null;
      },
    },
    {
      title: 'Molniya',
      text: 'Queue two Molniya fixed-wing FPVs at the drone works (U): 60 funds, 500 hunting radius, nets cannot catch them. They hunt on their own within 500: send them over the Ukrainian gas wells south of Kharkiv, where the oil trucks drive. Between the Molniyas and the waves, destroy two Ukrainian units or buildings, or keep the pressure on with a third wave.',
      done: g =>
        g.typeCount(RU, 'molniya') >= 2 &&
        (g.stats.kills[RU] + g.stats.structsKilled[RU] >= 2 || g.stats.waves[RU] >= 3),
      marker: g => ring(at(g, 'Gas wells'), 120),
    },
    {
      title: 'Creep in the dark',
      text: 'Ukraine is awake now, but its drones see poorly at night. Select three squads and switch them to Creep (R): dispersed, at 55% speed, seen in the open only within 150, and drones hit them 35% less. Walk them up the highway toward Kozacha Lopan while it is still dark.',
      done: inMode(RU, 'infantry', 'creep', 3),
    },
    {
      title: 'Ambush on the highway',
      text: 'Fly an FPV to the Kharkiv highway south of the border and switch it to Ambush (R): it lands with the motors off, seen only within 60, and pounces on the first Ukrainian unit within 220. A truck, an IFV, a squad on the road: the ambush takes the first thing that comes.',
      done: g => g.units.some(u => u.team === RU && !u.dead && u.type === 'fpv' && !!u.ambushed),
    },
    {
      title: 'Hunt the trucks',
      text: "Ukraine's money drives the roads: supply trucks to its towns, oil trucks from the wells, trade convoys to the border. Kill one with a drone, or capture one with a squad standing over it.",
      done: g => g.stats.trucksKilled[RU] >= 1 || g.captured[RU] >= 1,
    },
    {
      title: 'Ride out the answer',
      text: 'Dawn is coming and Ukraine with it. Hold your headquarters for two minutes: a fire group and a Yolka over the fuel depot, air defense by the drone works.',
      onStart: mark('shahed:8'),
      done: holdFor('shahed:8', 120, g => !!g.hq(RU)),
      marker: own('hq', RU),
    },
  ],
};
