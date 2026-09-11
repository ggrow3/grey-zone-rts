import { UA, RU } from '../data';
import type { Level } from './types';
import { at, bombarding, has, holdFor, mark, own, squads, town, townOwned, unitsNear } from './helpers';

export const level10: Level = {
  id: 'donets',
  map: 'kharkiv',
  title: '10. Across the Vovcha',
  side: RU,
  difficulty: 0.6,
  passiveUntil: 7,
  noGeransUntil: Infinity,
  blurb:
    'From Shebekino, cross the river at the bridge, bomb the netted trenches of Vovchansk from above, hire mercenaries, walk rockets and a glide bomb onto the line, take the town, and hold the crossing hull down behind a net tunnel.',
  concepts: [
    'Rivers and bridges',
    'Heavy bombers over nets',
    'Mercenaries',
    'Rocket fire missions',
    'Glide bombs on trenches',
    'Hull down at a crossing',
    'Road net tunnels',
    'Holding a crossing',
  ],
  briefing: [
    'Shebekino, on the Nezhegol. Across the river, Vovchansk is Ukrainian, three squads in trenches under an anti-drone net.',
    'Rivers stop everything on the ground. The only way across is the bridge on the Vovchansk road; the squads will find it on their own.',
    'The net eats FPVs, so this is a job for the heavy bomber, the rockets, and a KAB: they all come down from above. Hire a mercenary squad to lead the crossing; they are good, as long as they are paid.',
    'Take the town and hold the crossing when they come back for it: armor hull down at the bridge and a net tunnel over the road behind it. Ura, commander.',
  ],
  shots: g => [
    at(g, 'Shebekino'),
    { x: (at(g, 'Shebekino').x + at(g, 'Vovchansk').x) / 2, y: (at(g, 'Shebekino').y + at(g, 'Vovchansk').y) / 2 },
    at(g, 'Vovchansk'),
    at(g, 'Vovchansk'),
  ],
  sideNote: 'Russia: mercenary assault squads fight well while paid and winning. Miss their wages and they walk.',
  scenario: g => {
    g.capture('Shebekino', RU);
    const S = g.site('Shebekino');
    squads(g, RU, 'infantry', S.x, S.y + 40, 4);
    g.funds[RU] = 2600;
    g.capture('Vovchansk', UA);
    const V = g.site('Vovchansk');
    squads(g, UA, 'infantry', V.x, V.y + 20, 3, true);
    g.build('net', UA, V.x, V.y - 20);
    g.funds[UA] = 300;
  },
  objectives: [
    {
      title: 'Find the bridge',
      text: 'Rivers block ground units; a blocked unit walks to the nearest bridge on its own. Send a squad south along the Shebekino road to the crossing.',
      done: g =>
        g.units.some(
          u =>
            u.team === RU &&
            u.def.troop &&
            !u.dead &&
            u.y > at(g, 'Shebekino').y + 40 &&
            g.terrain.nearBridge(u.x, u.y, 70)
        ),
      marker: town('Vovchansk'),
    },
    {
      title: 'Over the net',
      text: 'Vovchansk is netted: 85% of FPVs die in it. Queue a heavy bomber hexacopter (V at the works): 120 funds, drops 65-damage bombs, flies home for more.',
      done: has(RU, 'bomber'),
      marker: own('droneWorks', RU),
    },
    {
      title: 'Hired guns',
      text: 'Queue a mercenary assault squad at the barracks (V): 100 hp, speed 60, 2 funds a second in wages, gone at 0% morale.',
      done: has(RU, 'merc'),
      marker: own('barracks', RU),
    },
    {
      title: 'Rockets',
      text: 'Queue rocket artillery at the artillery depot (X): 1200 funds, six rockets a salvo, range 620. Bring it to Shebekino; the trench line at Vovchansk is well inside its reach.',
      done: has(RU, 'mlrs'),
      marker: own('artyDepot', RU),
    },
    {
      title: 'A salvo on the trenches',
      text: 'Put a Mavic or the bomber over Vovchansk so the target is observed, then give the rocket launcher a fire mission on the trench line (Ctrl+right-click, or B and click). Rockets are for a line, not a point.',
      done: bombarding(RU, 'mlrs'),
      marker: town('Vovchansk'),
    },
    {
      title: 'A glide bomb',
      text: 'Press the KAB-500 button in the Build tab (350 funds) and click the net at Vovchansk: 700 damage after six seconds, the trenches under it erased and cover ignored. Nets stop drones, not bombs.',
      done: g => g.stats.kabs[RU] >= 1,
      marker: town('Vovchansk'),
    },
    {
      title: 'Vovchansk',
      text: 'Cross with everything. There is a hospital in the town: its loss cuts Ukrainian income, so expect them to fight for it. The enemy is awake once the town is yours.',
      done: townOwned('Vovchansk', RU),
      marker: town('Vovchansk'),
    },
    {
      title: 'Hull down at the crossing',
      text: 'Queue an IFV or a tank at the armor plant, drive it to the bridge on the Vovchansk road, and switch it to Hull down (R). The crossing is where they must come; the scrape is where it waits.',
      done: g =>
        unitsNear(g, RU, at(g, 'Vovchansk'), 420).some(
          u => (u.type === 'tank' || u.type === 'ifv') && g.modeOf(u) === 'hullDown'
        ),
      marker: town('Vovchansk'),
    },
    {
      title: 'A net tunnel',
      text: 'Open the Build tab, pick Road net tunnel (600), and click the road between Shebekino and Vovchansk: five nets go up along it, a corridor your trucks and reinforcements can drive through under the enemy drones.',
      done: g => g.structs.filter(s => s.team === RU && s.type === 'net' && !s.dead).length >= 3,
    },
    {
      title: 'Hold the crossing',
      text: 'Ukraine counterattacks. Hold the town for 90 seconds; dig in on the far bank and keep the bomber flying.',
      onStart: mark('donets:10'),
      done: holdFor('donets:10', 90, townOwned('Vovchansk', RU)),
      marker: town('Vovchansk'),
    },
  ],
};
