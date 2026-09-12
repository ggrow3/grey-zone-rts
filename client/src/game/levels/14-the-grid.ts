import { UA, RU } from '../data';
import type { Level } from './types';
import {
  alive,
  at,
  bombarding,
  holdFor,
  hqOf,
  inMode,
  mark,
  own,
  squads,
  structsNear,
  town,
  townOwned,
} from './helpers';

export const level14: Level = {
  id: 'grid',
  map: 'sumy',
  title: '14. The grid',
  side: RU,
  difficulty: 0.6,
  passiveUntil: 4,
  noGeransUntil: 4,
  blurb:
    'Power is the last supply line. Light a forward base at Sudzha with a generator set and pylons, cut the pylon line that feeds the Ukrainian base at Yunakivka, build a power plant, put a wave into the Sumy substation, bring rockets and mercenaries, and take Yunakivka.',
  concepts: [
    'Generator sets',
    'Buildings that need power',
    'Pylon lines',
    'Cutting the enemy grid',
    'Power plants',
    'Waves at the substation',
    'Truck escorts',
    'Mercenaries and wages',
    'Fleets draw air defense',
  ],
  briefing: [
    'Kursk group. Sudzha is ours but it is dark: the grid ends at Rylsk, and a barracks with no power builds nothing.',
    'A generator set beside a building is the cheap island; a pylon line from the substation is the real thing. The enemy has run one from Sumy to a forward base at Yunakivka: two pylons across open fields.',
    'Two FPVs break a pylon. Everything past the break stops: their radar sees 30%, their barracks stalls, their jammer goes quiet.',
    'Then the plant, the wave at their substation, the rockets, and the mercenaries, and Yunakivka is yours. Za Rodinu, commander.',
    'Intelligence: fly a big FPV fleet and the enemy scales its Stings, air defense, and jammers to it. Keep the fleet small and out of sight until the wave goes in, and it will not have bought the answer in time.',
  ],
  shots: g => [at(g, 'Sudzha'), at(g, 'Yunakivka'), hqOf(g, UA), hqOf(g, RU)],
  sideNote:
    'Russia: the headquarters gives 30 power, the substation 60, a generator set 20, a power plant 90. Every building except nets and trenches draws on the grid it stands on.',
  scenario: g => {
    g.capture('Sudzha', RU);
    const S = g.site('Sudzha');
    squads(g, RU, 'infantry', S.x, S.y + 30, 3, true);
    g.funds[RU] = 3200;
    g.capture('Yunakivka', UA);
    const Y = g.site('Yunakivka');
    squads(g, UA, 'infantry', Y.x, Y.y + 20, 3, true);
    g.build('barracks', UA, Y.x - 80, Y.y + 100);
    g.build('radar', UA, Y.x + 100, Y.y + 80);
    g.build('ewStation', UA, Y.x + 20, Y.y + 150);
    // the pylon line from Sumy: two pylons across the fields
    const H = hqOf(g, UA);
    for (const k of [0.36, 0.68]) g.build('pylon', UA, H.x + (Y.x - H.x) * k, H.y + (Y.y - H.y) * k);
    g.funds[UA] = 400;
  },
  objectives: [
    {
      title: 'A generator set',
      text: "Open the Build tab and place a Generator set (300) beside Sudzha: 20 power for the grid it stands on. A building with demand runs at its grid's supply-to-demand ratio; with no source it runs nothing.",
      done: g => structsNear(g, RU, 'generator', at(g, 'Sudzha'), 320).length > 0,
      marker: town('Sudzha'),
    },
    {
      title: 'A forward barracks',
      text: "Place a Barracks (500) within 150 of the generator so they link: watch for the yellow line between them. It draws 5 of the generator's 20. Queue a squad from it to prove the power is on.",
      done: g =>
        structsNear(g, RU, 'barracks', at(g, 'Sudzha'), 320).some(s => (s.pow ?? 0) > 0) &&
        alive(g, RU, 'infantry').length + g.typeCount(RU, 'infantry') > 8,
      marker: town('Sudzha'),
    },
    {
      title: 'A pylon line',
      text: "Pylons (40 funds) carry the grid 190 at a time and need no headquarters or town nearby, only something of the grid within reach. Run three pylons from Sudzha toward Korenevo: a base on the substation's grid never runs dry.",
      done: g => g.structs.filter(s => s.team === RU && s.type === 'pylon' && !s.dead && s.build >= 1).length >= 3,
    },
    {
      title: 'Cut their line',
      text: 'Two Ukrainian pylons cross the fields between Sumy and Yunakivka. Fly FPVs at them: two drones or one shell break one, and everything past the break stops. The enemy wakes when the line is cut.',
      done: g => g.structs.filter(s => s.team === UA && s.type === 'pylon' && !s.dead).length < 2,
      marker: g => {
        const p = g.structs.find(s => s.team === UA && s.type === 'pylon' && !s.dead);
        return p ? { x: p.x, y: p.y, r: 70 } : null;
      },
    },
    {
      title: 'A power plant',
      text: 'Place a Power plant (900): 90 power, enough for a second base and forty battery drones, and the biggest target after the headquarters. Put it behind Sudzha with a Yolka on guard over it.',
      done: g => g.structs.some(s => s.team === RU && s.type === 'powerPlant' && !s.dead),
      marker: town('Sudzha'),
    },
    {
      title: 'A wave at the substation',
      text: 'Launch a Geran wave (600): the first two drones go for the Sumy substation. Without it Ukraine charges 60 fewer battery drones, and every FPV it cannot charge is one that does not come for your pylons.',
      done: g => g.stats.waves[RU] >= 1,
    },
    {
      title: 'Rockets on Yunakivka',
      text: 'Queue rocket artillery at the depot (X), bring it up behind Sudzha, put a Mavic over Yunakivka, and give it a fire mission on the trench line. Six rockets a salvo; the barracks and the radar are in the beaten zone too.',
      done: bombarding(RU, 'mlrs'),
      marker: town('Yunakivka'),
    },
    {
      title: 'Escort the trucks',
      text: "Your pump at Korenevo and the metering station send oil trucks to Rylsk, and Sumy's FPVs want them. Set a mobile fire group to Escort trucks (R): it shadows the nearest truck with its guns up.",
      done: inMode(RU, 'fireGroup', 'escort'),
    },
    {
      title: 'Mercenaries, paid',
      text: 'Queue a mercenary assault squad at the barracks (V): 100 hp, speed 60, 2 funds a second in wages. Miss the pay or lose towns and their morale drops; at 0% they walk. Keep one above 50% for a minute.',
      onStart: mark('grid:9'),
      done: holdFor('grid:9', 60, g => alive(g, RU, 'merc').some(u => (u.morale ?? 90) >= 50)),
      marker: own('barracks', RU),
    },
    {
      title: 'Yunakivka',
      text: 'With their forward base dark and shelled, cross the border and capture Yunakivka. Hold Sudzha behind you: a hospital in the woods, the rockets scooting, the plant guarded.',
      done: townOwned('Yunakivka', RU),
      marker: town('Yunakivka'),
    },
  ],
};
