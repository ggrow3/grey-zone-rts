import { UA } from '../data';
import type { Level } from './types';
import { at, bombarding, hqOf, inMode, own, researched, town, townsHeld } from './helpers';

export const level04: Level = {
  id: 'guns',
  map: 'kharkiv',
  title: '4. Guns and logistics',
  side: UA,
  difficulty: 0.5,
  passiveUntil: 0,
  noGeransUntil: 0,
  blurb:
    'A live enemy. Fortify, keep the trucks alive, research, bring up artillery with a spotter, fire missions, shoot and scoot, feed the guns shells, earn from the trade convoys, add rocket artillery, and hold three towns.',
  concepts: [
    'Nets and hospitals',
    'Trucks, trade, and capture',
    'Research tree',
    'Artillery, fire missions, and spotting',
    'Shoot and scoot',
    'Ammunition trucks',
    'Rocket artillery',
    'Holding ground',
  ],
  briefing: [
    'The enemy is awake now, and the border is a kill zone. Anything that drives the highway gets hunted.',
    'Nets over the towns and a field hospital in the woods behind them keep the trucks and the squads alive. Trade convoys pay for everything else.',
    'The artillery depot has a howitzer ready. It carries twelve shells; ammunition trucks and the depot refill it. Put a Mavic ahead of it and it shells whatever the drone sees, and moves after every mission so the counter-battery fire lands on empty ground.',
    'Three towns by the end of the day, commander. Hold all six for three minutes and the war is over.',
  ],
  shots: g => [
    at(g, 'Lyptsi'),
    g.structs.find(s => s.team === 0 && s.type === 'artyDepot') || hqOf(g, UA),
    at(g, 'Kozacha Lopan'),
    at(g, 'Zolochiv'),
  ],
  sideNote: 'Ukraine: your income rises and falls with international support, so keep your strikes off civilians.',
  scenario: g => {
    g.funds[UA] = 1600;
  },
  objectives: [
    {
      title: 'Fortify',
      text: 'Open the Build tab. Place an anti-drone net over a town you hold (it catches FPVs) and a Field hospital in a wood behind it (it heals troops). You can build near the headquarters or any town you hold.',
      done: g =>
        g.structs.some(x => x.team === UA && x.def.netR) && g.structs.some(x => x.team === UA && x.type === 'aidPost'),
    },
    {
      title: 'Logistics',
      text: 'Watch the trucks. Supply trucks bring funds and rations to each town you hold, grain trucks carry rations from the wheat fields to the larder, oil trucks carry funds from the wells, trade convoys go west to the NATO border. All of it is prey for drones, and an enemy squad standing over a truck takes it. Squads at the front eat what the trucks bring; keep three deliveries coming in.',
      done: g => g.stats.deliveries[UA] >= 3,
    },
    {
      title: 'Research',
      text: 'Open Procurement (T) and buy Terminal guidance. Drone swarm control after it lets one squad fly more drones; Full autonomy frees them entirely.',
      done: researched(UA, 'auto1'),
    },
    {
      title: 'Guns',
      text: 'Queue a howitzer at the artillery depot (Z) and move it up behind Lyptsi, into a wood if you can. It carries 12 shells. With a Mavic spotting ahead it shells whatever it sees.',
      done: g => g.typeCount(UA, 'howitzer') >= 1,
      marker: own('artyDepot'),
    },
    {
      title: 'A fire mission',
      text: 'Select the howitzer and Ctrl+right-click a map point (or press B and click): the gun fires on the area, seen or unseen. Unobserved fire scatters 2.4 times wider, and shells do not know whose troops are under them: the game warns DANGER CLOSE when your own units are in the beaten zone.',
      done: bombarding(UA),
    },
    {
      title: 'Shoot and scoot',
      text: 'Every shot shows the gun to enemy radar for a few seconds, and the enemy has guns too. Select the howitzer and switch it to Shoot and scoot (R): after every fire mission it moves 90 to 150, into trees when it can, before it fires again.',
      done: inMode(UA, 'howitzer', 'scoot'),
    },
    {
      title: 'Shells',
      text: 'Twelve shells go quickly. A gun beside the artillery depot or the headquarters refills slowly; a gun in the field below half sends for an ammunition truck from the headquarters. Fire until a truck leaves: it appears with an ammunition cargo, and it is a truck, so escort it.',
      done: g => g.units.some(u => u.team === UA && !u.dead && u.type === 'truck' && u.cargo === 'ammo'),
    },
    {
      title: 'Trade',
      text: 'Every 75 seconds a trade convoy leaves the headquarters for the border in the west and comes back with aid. Its cargo is worth more for every wheat field and gas site you hold. Earn 150 from trade; a fire group on Escort trucks keeps the convoys alive.',
      done: g => g.tradeTotal[UA] >= 150,
    },
    {
      title: 'Rocket artillery',
      text: 'Queue rocket artillery at the depot (X): six rockets a salvo across most of the map, three salvos carried, a long reload. It is the weapon for a trench line or a column in the open, and the widest scatter in the game: never fire it near your own troops.',
      done: g => g.typeCount(UA, 'mlrs') >= 1,
      marker: own('artyDepot'),
    },
    {
      title: 'Hold three towns',
      text: 'Capture and hold three of the six towns at once. Lyptsi, Kozacha Lopan, and Zolochiv are closest. Infantry capture; drones and guns keep them. Hold all six for three minutes and the war is over.',
      done: g => townsHeld(g, UA) >= 3,
      marker: town('Kozacha Lopan'),
    },
  ],
};
