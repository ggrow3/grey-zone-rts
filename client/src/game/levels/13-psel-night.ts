import { UA, RU } from '../data';
import { MOVE } from '../sim';
import type { Level } from './types';
import { at, inMode, piloting, place, researched, ring, squads, town, townOwned, unitsNear } from './helpers';

export const level13: Level = {
  id: 'pselnight',
  map: 'sumy',
  title: '13. Night on the Psel',
  side: UA,
  difficulty: 0.6,
  start: 'night',
  passiveUntil: 2,
  noGeransUntil: 3,
  blurb:
    'A night defense on the Sumy front. Creep the squads through the dark, lay FPV ambushes on the roads, put a Sting on guard over the wells, go quiet on radar, buy thermal cameras, fly a drone yourself, and hold until dawn, then take Sudzha in daylight.',
  concepts: [
    'Night: vision and hunting',
    'Creep',
    'Ambush posture',
    'Guard posture',
    'Silent jammers and passive air defense',
    'Thermal cameras',
    'Pilot mode dives',
    'The day cycle',
    'Blind the enemy',
  ],
  briefing: [
    'Night on the Psel. Russian squads are probing across the border toward Yunakivka, and in the dark your ground units see 60% as far and your drones 85%.',
    "The dark is the enemy's friend and it can be yours: squads that creep are seen only within 150, an FPV in ambush is seen only within 60, and a jammer that is silent is not seen at all.",
    'Thermal cameras give the drones the night back. Buy them, put a Sting on guard over the wells, and fly one FPV yourself down onto the road they come by.',
    'Hold until the light changes, then take Sudzha before the next night. Slava Ukraini, commander.',
    "Intelligence: the enemy's spotters fly by thermal at night too, and it only buys against what it sees. The fewer of your squads its Mavics find, the less it brings; kill the eyes first.",
  ],
  shots: g => [at(g, 'Yunakivka'), place(g, 'Sverdlikovo'), at(g, 'Gas wells'), at(g, 'Sudzha')],
  sideNote:
    'Ukraine: night lasts three minutes of every eight. Ground vision 60%, drone vision 85% (100% with Thermal cameras), radar posts see farther. Snow grounds the quads.',
  scenario: g => {
    g.capture('Yunakivka', UA);
    const Y = g.site('Yunakivka');
    squads(g, UA, 'infantry', Y.x, Y.y + 30, 3);
    g.spawn('jammer', UA, Y.x + 60, Y.y + 70);
    g.funds[UA] = 3600;
    g.grant(UA, 'auto1');
    g.capture('Sudzha', RU);
    const S = g.site('Sudzha');
    squads(g, RU, 'infantry', S.x, S.y + 30, 2, true);
    // probing squads on the road, attack-moving on Yunakivka
    const P = g.map.placePos('Sverdlikovo');
    for (const dx of [-40, 0, 40]) {
      const o = MOVE(Y.x + dx, Y.y - 40);
      o.amove = true;
      g.spawn('infantry', RU, P.x + dx, P.y, o);
    }
    g.funds[RU] = 500;
  },
  objectives: [
    {
      title: 'Creep',
      text: 'Three Russian squads are coming down the road from Sverdlikovo. Select your squads and switch them to Creep (R): dispersed, 55% speed, seen in the open only within 150, drones hit them 35% less. Move them into the wood beside Yunakivka and dig in.',
      done: inMode(UA, 'infantry', 'creep', 2),
      marker: town('Yunakivka'),
    },
    {
      title: 'Ambush on the road',
      text: 'Queue FPVs at the works, fly two to the Sverdlikovo road north of Yunakivka, and switch them to Ambush (R): motors off, seen only within 60, they pounce on the first enemy within 220. The enemy is awake once the ambush is set.',
      done: g => g.units.filter(u => u.team === UA && !u.dead && u.type === 'fpv' && !!u.ambushed).length >= 2,
      marker: g => ring(place(g, 'Sverdlikovo'), 120),
    },
    {
      title: 'Guard the wells',
      text: 'Their drones will come for the gas wells and the pumps behind you. Queue a Sting (V), fly it over the nearer well field, and switch it to Guard (R): it stays at its post and engages within 170.',
      done: g =>
        g.resources.some(
          r =>
            r.kind === 'gas' &&
            r.owner === UA &&
            unitsNear(g, UA, r, 260, 'interceptor').some(u => g.modeOf(u) === 'guard')
        ),
      marker: g => ring(at(g, 'Gas wells'), 120),
    },
    {
      title: 'Go quiet',
      text: 'Anything that emits is seen: a jammer that is on shows on enemy radar within 900, and so does an air defense radar. Switch the jammer at Yunakivka to Silent and your mobile air defense to Passive (R). Turn them on when their drones are overhead, not before.',
      done: g => inMode(UA, 'jammer', 'silent')(g) && inMode(UA, 'aa', 'passive')(g),
    },
    {
      title: 'Thermal cameras',
      text: 'On the Airframes branch, research Hardened airframes, Evasive flight profiles, and Thermal cameras (2900 in all): your drones see 30% farther, and at night they see as well as by day.',
      done: researched(UA, 'nightOps'),
    },
    {
      title: 'Take the sticks',
      text: 'Select an airborne FPV and press Y. The camera rides with it, it flies to your cursor, and a left-click on the road dives it onto that spot: a treeline, a trench, a column. A human on the sticks dodges 15% more and hits 20% harder. Y or Esc hands it back.',
      done: piloting(UA),
    },
    {
      title: 'Three in the dark',
      text: 'Kill three enemy units before dawn: the probing squads on the road, or whatever the Kursk group sends after them. Ambushes, the Sting, and the FPVs under your own hand.',
      done: g => g.stats.kills[UA] >= 3,
    },
    {
      title: 'Dawn',
      text: 'The light changes three minutes into the night and comes back after five. Hold Yunakivka until it is day: the top bar counts down to dawn.',
      done: g => g.gameTime > 30 && !g.isNight() && townOwned('Yunakivka', UA)(g),
      marker: town('Yunakivka'),
    },
    {
      title: 'Sudzha by daylight',
      text: 'In the light the drones hunt at full reach. Move the squads up under the nets, robots first if you have them, and capture Sudzha before the next night.',
      done: townOwned('Sudzha', UA),
      marker: town('Sudzha'),
    },
  ],
};
