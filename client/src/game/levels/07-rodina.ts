import { UA, RU } from '../data';
import type { Level } from './types';
import { alive, at, has, hqOf, inMode, own, researched, ring, squads, town, townOwned, townsHeld } from './helpers';

export const level07: Level = {
  id: 'rodina',
  map: 'kharkiv',
  title: '7. Za Rodinu: the road to Kozacha Lopan',
  side: RU,
  difficulty: 0.5,
  passiveUntil: Infinity,
  noGeransUntil: Infinity,
  blurb:
    'Command the Russian side. Your infantry and mercenaries fly the drones, Pyongyang sends infantry that cannot, the Kharkiv highway is full of Ukrainian trucks to take, and the air force is a phone call away: glide bombs, Lancets, and an Iskander.',
  concepts: [
    'Autonomous drones',
    'North Korean infantry',
    'Truck capture',
    'Motorcycle rush',
    'Morale',
    'Glide bombs',
    'Hull down',
    'Launch rails and Lancets',
    'Iskander missiles',
    'The enemy reads your defense',
  ],
  briefing: [
    'Belgorod group, listen up. You hold Zhuravlyovka south of the city, and Kozacha Lopan across the border is Ukrainian, with two squads dug in.',
    'Your drones are flown by squads, like the Ukrainian ones: an operator in an infantry or mercenary squad flies three within 650, and only Full autonomy (T) frees them. Pyongyang has sent infantry; they cost nothing from your pool and they fight, but they do not fly drones, and their morale breaks if you start losing towns.',
    'A Ukrainian supply truck drives the Kharkiv highway every forty seconds. Sit a squad on that road, halfway up and out of sight of the city, and take it, cargo and all.',
    'Then the motorcycles go in, and the aviation follows: a KAB on the trenches, a Lancet for their guns, an Iskander for a building that matters. Za Rodinu, commander.',
    'Intelligence: the Ukrainian commander reads what you show it. Dig your squads in and it buys howitzers, rockets, and assault robots to take the town; raise a power plant and it sends Liutyis for it; fly a fleet and it buys Stings and jammers.',
  ],
  shots: g => [hqOf(g, RU), at(g, 'Zhuravlyovka'), g.map.geo(50.2377, 36.2651), at(g, 'Kozacha Lopan')],
  sideNote:
    'Russia: drones need no squads, North Koreans cost no personnel, and your troops shout "Ura!" But morale breaks when you hold fewer towns than the enemy.',
  scenario: g => {
    g.capture('Zhuravlyovka', RU);
    const Z = g.site('Zhuravlyovka');
    squads(g, RU, 'infantry', Z.x, Z.y + 40, 3);
    g.funds[RU] = 1400;
    g.capture('Kozacha Lopan', UA);
    const K = g.site('Kozacha Lopan');
    squads(g, UA, 'infantry', K.x - 75, K.y + 5, 2, true);
    g.funds[UA] = 0;
    g.people[UA].total = 160;
  },
  objectives: [
    {
      title: 'Squads on the sticks',
      text: 'Click the drone works and press Z three times. Each FPV is flown by an operator in one of your infantry squads (three drones each, within 650); mercenaries fly too, North Koreans do not. Press O on a squad to add operators from your pool. Full autonomy, 4,400 funds down the Drones branch, frees them from the squads.',
      done: g => g.stats.drones[RU] >= 3,
      marker: own('droneWorks', RU),
    },
    {
      title: "Pyongyang's men",
      text: 'Queue two North Korean squads at the barracks (B): 100 funds, no draw on your personnel, ten at most. They are tough, and they have morale.',
      done: has(RU, 'dprk', 2),
      marker: own('barracks', RU),
    },
    {
      title: 'Highway robbery',
      text: 'A Ukrainian supply truck drives from Kharkiv to Kozacha Lopan every 40 seconds. Ambush it halfway up the highway, at the marker. The road south from Hoptivka passes east of Kozacha Lopan, out of range of the trenches on its west side; closer to Kharkiv the IFV and the squads at the headquarters would see you. Park a squad right on the road, press E to dig in, and wait. A squad within 45 of an unescorted truck takes it and its 100 funds.',
      done: g => g.captured[RU] >= 1,
      marker: g => ring(g.map.geo(50.2377, 36.2651), 90),
    },
    {
      title: 'Motorcycle rush',
      text: 'Queue two motorcycle groups (C at the barracks): speed 105, 80% faster on roads. Rush Kozacha Lopan before the trench squads react, and bring the drones.',
      done: g => g.typeCount(RU, 'moto') >= 2 && townOwned('Kozacha Lopan', RU)(g),
      marker: town('Kozacha Lopan'),
    },
    {
      title: 'Keep them steady',
      text: 'Morale falls while Russia holds fewer towns than Ukraine, when a friend dies nearby, and with hunger. Hold two towns and keep every Korean squad above 50%.',
      done: g =>
        townsHeld(g, RU) >= 2 &&
        alive(g, RU, 'dprk').length >= 1 &&
        alive(g, RU, 'dprk').every(u => (u.morale ?? 90) >= 50),
    },
    {
      title: 'A glide bomb',
      text: 'The Ukrainian trenches at Kozacha Lopan are still there. Open the Build tab and press the KAB-500 button (350 funds, 40 s reload), then click the trench line: a 700-damage blast after a six-second warning that erases trenches and ignores cover. Enemy air defense within 260 can shoot it down.',
      done: g => g.stats.kabs[RU] >= 1,
      marker: town('Kozacha Lopan'),
    },
    {
      title: 'Hull down',
      text: 'Drive your IFV up to Kozacha Lopan and switch it to Hull down (R): it stops in a scrape, takes 30% less damage, and reaches 10% farther until you move it again. Armor that holds a town does it hull down.',
      done: inMode(RU, 'ifv', 'hullDown'),
    },
    {
      title: 'Launch rails',
      text: 'Open the research tree (T) and buy Launch rails on the Aircraft branch (600): the drone works can now build the fixed-wing aircraft, the Orlan spotter, the Lancet, and the Molniya.',
      done: researched(RU, 'launchRail'),
    },
    {
      title: 'A Lancet',
      text: "Queue a Lancet at the drone works (J): 120 funds, a 240 warhead, and it loiters until a howitzer, air defense vehicle, jammer, or tank shows itself, then dives. Fly it over Kharkiv's outskirts and let it hunt.",
      done: has(RU, 'lancet'),
      marker: own('droneWorks', RU),
    },
    {
      title: 'Iskander',
      text: 'Press the Iskander button in the Build tab (800 funds, two-minute reload) and click an enemy building: 900 damage after an eight-second warning. The Ukrainian radar post or EW station near their base is a good first target. Air defense near the target intercepts some.',
      done: g => g.stats.missiles >= 1,
      marker: g => ring({ x: hqOf(g, UA).x, y: hqOf(g, UA).y - 130 }, 200),
    },
  ],
};
