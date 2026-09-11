import { UA, RU } from '../data';
import type { Level } from './types';
import {
  at,
  has,
  holdFor,
  hqOf,
  mark,
  own,
  ring,
  squads,
  structsNear,
  town,
  townOwned,
  unitsNear,
  wheatHeld,
} from './helpers';

export const level11: Level = {
  id: 'sudzha',
  map: 'sumy',
  title: '11. Sudzha: into Kursk',
  side: UA,
  difficulty: 0.6,
  passiveUntil: 7,
  noGeransUntil: 7,
  blurb:
    'A new map: the Sumy front. Attack-move up the Sudzha road under a net tunnel, take the wheat by the border, push a relay and the robots into the salient, capture Sudzha and its gas metering station, and hold them when the Kursk group counterattacks.',
  concepts: [
    'The Sumy front',
    'Attack-move',
    'The kill zone and road nets',
    'Recon before the push',
    'Assault robots and relay carriers',
    'Capturing gas',
    'Holding a salient',
  ],
  briefing: [
    'Sumy group. This is the Kursk salient: open wheat country between the Psel behind you and the Seym behind them, and one good road through Yunakivka to Sudzha.',
    'The fields are the kill zone. Anything in the open under an armed enemy drone bleeds. The road goes under nets, the squads go through the woods, and the robots go first.',
    'Sudzha holds three dug-in squads under a net and an air defense vehicle, and just north-east of it the gas metering station that pays Russia twelve funds a second.',
    'Take the town, take the station, and hold both. The Kursk group at Rylsk will want them back. Slava Ukraini, commander.',
  ],
  shots: g => [hqOf(g, UA), at(g, 'Yunakivka'), at(g, 'Sudzha'), at(g, 'Sudzha gas metering station')],
  sideNote:
    'Ukraine on the Sumy front: two well fields with three pumps behind you, the metering station in front of you, and Sudzha and Korenevo bring Russian volunteers when you hold them.',
  scenario: g => {
    g.capture('Yunakivka', UA);
    const Y = g.site('Yunakivka');
    squads(g, UA, 'infantry', Y.x, Y.y + 30, 3);
    g.funds[UA] = 3000;
    g.grant(UA, 'auto1');
    g.capture('Sudzha', RU);
    const S = g.site('Sudzha');
    squads(g, RU, 'infantry', S.x, S.y + 30, 3, true);
    g.build('net', RU, S.x, S.y - 10);
    g.spawn('aa', RU, S.x + 50, S.y - 70);
    g.funds[RU] = 400;
  },
  objectives: [
    {
      title: 'Attack-move',
      text: 'Select the squads at Yunakivka, press Q, and click the road half way to Sudzha. An attack-move stops to fight anything met on the way and then carries on; a plain move walks past the enemy. Q is how a column advances.',
      done: g =>
        g.units.some(u => u.team === UA && !u.dead && u.def.troop && u.order.kind === 'move' && !!u.order.amove),
      marker: town('Yunakivka'),
    },
    {
      title: 'A net tunnel over the road',
      text: 'Open the Build tab, pick Road net tunnel (600), and click the Sudzha road north of Yunakivka: five nets go up along it. Troops and trucks under a net are safe from the kill zone and from FPVs. The tunnel is how the 2026 front moves.',
      done: g => g.structs.filter(s => s.team === UA && s.type === 'net' && !s.dead).length >= 3,
      marker: g =>
        ring(
          { x: (at(g, 'Yunakivka').x + at(g, 'Sudzha').x) / 2, y: (at(g, 'Yunakivka').y + at(g, 'Sudzha').y) / 2 },
          150
        ),
    },
    {
      title: 'The wheat by the border',
      text: 'A neutral wheat field lies just north of Yunakivka, on the border. Stand a squad in it for five seconds: each field feeds six squads and adds recruits. You hold two fields already; make it three.',
      done: g => wheatHeld(g, UA) >= 3,
      marker: g => {
        const w = g.resources
          .filter(r => r.kind === 'wheat')
          .sort((a, b) => Math.abs(a.y - at(g, 'Yunakivka').y) - Math.abs(b.y - at(g, 'Yunakivka').y));
        const n = w.find(r => r.owner !== UA);
        return n ? ring(n, 90) : null;
      },
    },
    {
      title: 'A Mavic over Sudzha',
      text: 'Queue a Mavic at the drone works (C) and put it over Sudzha. Strikes and guns hit only what your side sees; switch it to Low (R) to see the squads in the trenches.',
      done: g => unitsNear(g, UA, at(g, 'Sudzha'), 320, 'mavic').length > 0,
      marker: town('Sudzha'),
    },
    {
      title: 'Robots first',
      text: 'Queue two assault robots at the armor plant (B). Nobody is inside, drones hit them 40% less, and they capture towns. Send them up the road ahead of the squads.',
      done: has(UA, 'ugv', 2),
      marker: own('armorPlant'),
    },
    {
      title: 'A relay forward',
      text: "Queue a relay carrier (H at the armor plant) and drive it up to within 400 of Sudzha: inside its ring your squads' drones need no leash, so the squads can stay in the woods by the road while the FPVs work the trenches.",
      done: g => unitsNear(g, UA, at(g, 'Sudzha'), 400, 'relay').length > 0,
      marker: town('Sudzha'),
    },
    {
      title: 'Sudzha',
      text: "The net stops FPVs, not bombers, not glide bombs: an F-16 KAB from the Build tab (500) or a heavy bomber from the works (V) clears the trenches, and the air defense vehicle is a job for a Liutyi or the robots' guns. Then capture the town. The Kursk group wakes up when you do.",
      done: townOwned('Sudzha', UA),
      marker: town('Sudzha'),
    },
    {
      title: 'The metering station',
      text: 'The gas metering station north-east of the town pays 12 a second to whoever holds it. Stand a squad or a robot in its ring for five seconds; it counts against your fuel too, if its pipeline were yours.',
      done: g => g.resources.some(r => r.kind === 'gas' && r.name.includes('metering') && r.owner === UA),
      marker: g => ring(at(g, 'Sudzha gas metering station'), 90),
    },
    {
      title: 'A hospital in the woods',
      text: 'Build a field hospital in the wood south-west of Sudzha (you can build near a town you hold): the squads in the trenches heal inside its ring, and a Sting on Guard over it keeps the drones off.',
      done: g => structsNear(g, UA, 'aidPost', at(g, 'Sudzha'), 420).length > 0,
      marker: town('Sudzha'),
    },
    {
      title: 'Hold the salient',
      text: 'Hold Sudzha for two minutes against the counterattack: trenches dug inside the woods, nets over the road behind you, the relay up, and FPVs in ambush on the Korenevo road.',
      onStart: mark('sudzha:10'),
      done: holdFor('sudzha:10', 120, townOwned('Sudzha', UA)),
      marker: town('Sudzha'),
    },
  ],
};
