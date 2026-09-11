import { UA, RU } from '../data';
import { ATTACK } from '../sim';
import type { Level } from './types';
import { at, has, holdFor, hqOf, mark, own, researched, ring, unitsNear } from './helpers';

export const level09: Level = {
  id: 'pipeline',
  map: 'kharkiv',
  title: '9. The Kursk line',
  side: UA,
  difficulty: 0.6,
  passiveUntil: 3,
  noGeransUntil: 3,
  blurb:
    'Enemy FPVs are diving at your pumping stations. Defend the line, build Liutyis, cut the Russian pump north of Belgorod, send a deep strike at a refinery, turn gas into armor, and let the robots do the walking.',
  concepts: [
    'Pumps and fuel',
    'Raids on the line',
    'Liutyi strikes',
    'Deep strikes on refineries',
    'Fuel for vehicles',
    'Hull down',
    'Assault robots',
    'Robot logistics',
  ],
  briefing: [
    'Gas is fuel, and fuel is armor. Two wells south of the city feed two pipelines, and three pumping stations keep them flowing. Enemy FPVs are already diving at the nearest one.',
    'Hold the pumps with fire groups and air defense. While any pump is down, the gas income stops and the vehicles run dry.',
    'Then take the war to their line: the pump north-east of Belgorod is the only one they have. Two Liutyis will do it, if they fly around the city and its guns. A third can go farther still, at a refinery deep inside Russia.',
    'Cut their line, keep yours, and the armor plant can turn out tanks and robots. Slava Ukraini, commander.',
  ],
  shots: g => [
    g.pumpSites[1],
    at(g, 'Gas wells'),
    g.pumpSites.find(p => p.team === 1) || hqOf(g, RU),
    g.structs.find(s => s.team === 0 && s.type === 'armorPlant') || hqOf(g, UA),
  ],
  sideNote:
    'Ukraine: two gas wells on two pipelines with three pumps to guard. Russia has one pump on the line from Kursk.',
  scenario: g => {
    g.funds[UA] = 2600;
    g.grant(UA, 'launchRail');
    g.capture('Lyptsi', UA);
    const p = g.pumpSites[1];
    g.spawn('fireGroup', UA, p.x - 40, p.y - 40);
    g.spawn('fireGroup', UA, p.x + 40, p.y - 40);
    g.spawn('aa', UA, p.x, p.y - 70);
  },
  objectives: [
    {
      title: 'Raid on the pump',
      text: 'Four enemy FPVs are diving at the pumping station south-east of your headquarters. While any pump is down, gas income and fuel stop. Shoot three down.',
      onStart: g => {
        const p = g.pumpSites[1];
        if (p.struct) for (let i = 0; i < 4; i++) g.spawn('fpv', RU, p.x + i * 30 - 45, p.y - 700, ATTACK(p.struct));
      },
      done: g => g.stats.shotDown[UA] >= 3,
      marker: g => ring(g.pumpSites[1], 120),
    },
    {
      title: 'Liutyis',
      text: 'Queue two Liutyi strike drones at the drone works (J): 300 funds each, 2 crew, a 350 warhead, buildings only. A pumping station has 350 hp: one warhead flattens it, the second is insurance against their air defense.',
      done: has(UA, 'liutyi', 2),
      marker: own('droneWorks'),
    },
    {
      title: 'Cut the Kursk line',
      text: "Russia's only pump stands north-east of Belgorod, and Belgorod air defense sits on the straight line to it. A Liutyi with no orders dives at the nearest enemy building within 700 on its own, so keep them well clear of Belgorod: fly both far east past Vovchansk, then north to the state border, and from there right-click the pump. A direct attack order flies straight at its target. Repair crews rebuild it after two quiet minutes.",
      done: g => g.pumpSites.some(ps => ps.team === RU && (!ps.struct || ps.struct.dead || ps.struct.build < 1)),
      marker: g => {
        const p = g.pumpSites.find(ps => ps.team === RU)!;
        return ring(p, 100);
      },
    },
    {
      title: 'A refinery inside Russia',
      text: 'Build one more Liutyi, leave it idle, and press Deep strike in the Build tab (600 funds): the drone flies off the map at a refinery. 60% get through; each burning refinery cuts Russian income 15% for four minutes and slows their glide bombs. The enemy is awake now.',
      done: g => !!g.deepPending || g.deepT > 0 || g.stats.refineries > 0,
      marker: own('droneWorks'),
    },
    {
      title: 'Hold your own line',
      text: 'The enemy raids pumps every 100 seconds. Keep all three of yours standing for 90 seconds: fire groups, a net, a Sting.',
      onStart: mark('pipeline:5'),
      done: holdFor('pipeline:5', 90, g => g.pipelineIntact(UA)),
    },
    {
      title: 'Fuel for armor',
      text: 'Fuel capacity is 3 plus 6 per gas site with a whole pipeline: 15 for you, 9 for Russia. Queue a tank at the armor plant (Z): the main gun aims at vehicles and buildings only, but every round splashes.',
      done: has(UA, 'tank'),
      marker: own('armorPlant'),
    },
    {
      title: 'Hull down at the pump',
      text: 'Drive the tank to the pumping station the FPVs raided and switch it to Hull down (R): it stops in a scrape, takes 30% less damage, and reaches 10% farther. Anti-drone cages (research, Ground branch) would cut the FPV damage another 35%.',
      done: g => unitsNear(g, UA, g.pumpSites[1], 200, 'tank').some(u => g.modeOf(u) === 'hullDown'),
      marker: g => ring(g.pumpSites[1], 120),
    },
    {
      title: 'An assault robot',
      text: 'Queue an assault robot at the armor plant (B): a tracked machine gun driven from the rear. Nobody dies when it is lost, drones hit it 40% less, and it captures towns. It is slow, cannot dig in, and flies no drones.',
      done: has(UA, 'ugv'),
      marker: own('armorPlant'),
    },
    {
      title: 'The robot takes a town',
      text: 'Send the robot to Kozacha Lopan or Zolochiv and let it stand in the ring for five seconds. In April 2026 a Russian position fell to robots and drones alone; here the robot spares the squads the walk through the kill zone.',
      done: g =>
        g.depots.some(d => d.owner === UA && d.name !== 'Lyptsi' && unitsNear(g, UA, d, d.r, 'ugv').length > 0),
      marker: g => ring(at(g, 'Kozacha Lopan'), 80),
    },
    {
      title: 'Robot logistics',
      text: 'On the Economy branch, research Logistics reform and then Robot logistics: every supply, ammunition, and trade truck becomes an unmanned ground robot. No driver needed, and a lost truck loses nobody from your pool.',
      done: researched(UA, 'ugvLogistics'),
    },
  ],
};
