import { UA } from '../data';
import type { Level } from './types';
import { at, hqOf, own, researched, ring, town, unitsNear } from './helpers';

export const level03: Level = {
  id: 'operators',
  map: 'kharkiv',
  title: '3. Operators: people in the squad',
  side: UA,
  difficulty: 0.5,
  passiveUntil: Infinity,
  noGeransUntil: Infinity,
  blurb:
    'Every drone needs a human on the sticks. Put more people into a squad, fly a dozen drones from it, research swarm control and repeaters, bind a swarm, and push a relay carrier forward so the squads can stay in cover.',
  concepts: [
    'Operators per squad',
    'Personnel pool',
    'Twelve drones from one squad',
    'Swarm control and repeaters',
    'Swarms',
    'Relay carriers',
  ],
  briefing: [
    'A drone is only as good as the human flying it. One operator, three drones: that is the arithmetic of this war.',
    'Reinforcements have arrived from the mobilization pool. Put them into a squad and that squad flies a dozen drones at once.',
    'Procurement has cleared Terminal guidance, Drone swarm control, and Signal repeaters. Buy them, bind the drones into a swarm, and the squad becomes a squadron.',
    "The armor plant can build a relay carrier: a ground drone with a mast that carries the squads' control range forward. Build the pilots first, commander. The airframes are cheap.",
  ],
  shots: g => [
    { x: hqOf(g, UA).x, y: hqOf(g, UA).y - 200 },
    g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || hqOf(g, UA),
    g.structs.find(s => s.team === 0 && s.type === 'armorPlant') || hqOf(g, UA),
    at(g, 'Lyptsi'),
  ],
  sideNote:
    'Ukraine: a squad holds up to four drone operators, each flying three drones (six after Drone swarm control). Every extra operator is one person from your pool.',
  scenario: g => {
    g.funds[UA] = 3800;
  },
  objectives: [
    {
      title: 'Add a human',
      text: 'Select one infantry squad north of the headquarters and press O (or the Add operator button in the panel). One person leaves your personnel pool and joins the squad as a second drone operator.',
      done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && (u.ops || 1) >= 2),
      marker: g => ring({ x: hqOf(g, UA).x, y: hqOf(g, UA).y - 200 }, 110),
    },
    {
      title: 'A squad of four',
      text: 'Keep pressing O until the squad has four operators. Four is the most a squad can hold; it can now fly twelve drones at once.',
      done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && (u.ops || 1) >= 4),
    },
    {
      title: 'A dozen drones',
      text: 'Click the drone works and queue FPVs (Z) and Mavics (C) until that squad is flying at least nine drones. Drones link to the nearest squad with a free slot, so keep the big squad closest to the works.',
      done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && g.droneCount(u) >= 9),
      marker: own('droneWorks'),
    },
    {
      title: 'Swarm control',
      text: 'Open the research tree (T) and buy Terminal guidance, then Drone swarm control: every operator now flies six drones instead of three. Full autonomy, the last step on that branch, frees the drones from the squads altogether.',
      done: researched(UA, 'auto2'),
    },
    {
      title: 'Bind a swarm',
      text: 'Double-click a drone to select every drone on screen and press G. A swarm of six or more holds formation and spreads its dives over everything around a target.',
      done: g => g.swarms.some(s => s.team === UA && s.members.filter(m => !m.dead).length >= 6),
    },
    {
      title: 'Signal repeaters',
      text: "On the Links branch, buy Signal repeaters: FPVs and interceptors hunt 120 farther. The next item, Relay drones, adds 250 to every squad's control range. Range is what lets the squads stay in the woods.",
      done: researched(UA, 'repeaters'),
    },
    {
      title: 'A relay carrier',
      text: "Click the armor plant and queue a Relay carrier (H): a tracked robot with a repeater mast. Your squads' drones count as in control range anywhere within 520 of it, so the squads can sit in cover while the strikes go forward.",
      done: g => g.typeCount(UA, 'relay') >= 1,
      marker: own('armorPlant'),
    },
    {
      title: 'Push the relay forward',
      text: 'Drive the relay carrier north past Lyptsi and send FPVs ahead of it. Watch the pale ring: inside it the drones ignore the leash to their squad. The carrier is unarmed and drones hunt it like a truck, so keep a fire group with it.',
      done: g => {
        const L = at(g, 'Lyptsi');
        const relay = g.units.find(u => u.team === UA && u.type === 'relay' && !u.dead && u.y < L.y + 60);
        return !!relay && unitsNear(g, UA, relay, 520).some(u => u.def.air && !u.landed);
      },
      marker: town('Lyptsi'),
    },
  ],
};
