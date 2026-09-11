import { UA } from '../data';
import type { Level } from './types';
import { at, hqOf, inMode, ring, structsNear, town, townOwned, townsHeld, unitsNear } from './helpers';

export const level01: Level = {
  id: 'boots',
  map: 'kharkiv',
  title: '1. Boots on the ground',
  side: UA,
  difficulty: 0.5,
  passiveUntil: Infinity,
  noGeransUntil: Infinity,
  blurb:
    'Move the camera, select squads, march in column along the road, capture towns, dig in, queue waypoints, set control groups, start the trucks rolling, and light a field hospital: every building needs power. The enemy stays quiet.',
  concepts: [
    'Camera and selection',
    'Formations and road movement',
    'Capturing towns',
    'Trenches and cover',
    'Waypoints and control groups',
    'Trucks, escorts, and hospitals',
    'Buildings need power',
  ],
  briefing: [
    'Kharkiv, early morning. The city is quiet for once, and the line to the north is thin: five squads, an IFV, and whatever we can build.',
    'Command wants the border villages: Lyptsi on the highway, Kozacha Lopan at the crossing, Zolochiv in the west. Every town you hold sends a truck with money, and every truck is something the drones hunt.',
    'The Russians are not moving yet. Use the time: walk the squads up the road in column, hold the ring for five seconds, and dig in the moment they stop, because the drones never sleep.',
    'One more thing: the grid. The headquarters and the Kharkiv substation power everything you build near them, but a hospital in the woods runs on nothing until you run pylons to it or park a generator beside it.',
    'Slava Ukraini, commander. Your squads are waiting north of the headquarters.',
  ],
  shots: g => [hqOf(g, UA), { x: hqOf(g, UA).x, y: hqOf(g, UA).y - 200 }, at(g, 'Lyptsi'), at(g, 'Kozacha Lopan')],
  sideNote:
    'Ukraine: your squads capture towns and fly your drones. Listen for them: they answer orders with "Slava Ukraini!"',
  objectives: [
    {
      title: 'Look around',
      text: 'Pan with W A S D or the arrow keys, zoom with the mouse wheel, and press Space to jump back to your headquarters in Kharkiv. Move the camera a good distance to continue.',
      done: (_g, ctx) => ctx.camMoved,
    },
    {
      title: 'Select your squads',
      text: 'Drag a box around the five infantry squads just north of the headquarters. Squads capture towns, and they fly your drones.',
      done: (_g, ctx) => ctx.selection.filter(e => e.isUnit && e.type === 'infantry').length >= 3,
      marker: g => ring({ x: hqOf(g, UA).x, y: hqOf(g, UA).y - 200 }, 110),
    },
    {
      title: 'Form a column',
      text: 'With the squads selected, the panel at the bottom left offers four formations: wedge, line, column, and block. Pick column before a road march: it keeps the squads on the tarmac, where they move 30% faster, one behind the other.',
      done: (_g, ctx) => ctx.formation === 'column',
    },
    {
      title: 'March on Lyptsi',
      text: 'Right-click the town of Lyptsi, north-east of Kharkiv. The squads route along the road and move faster on it. The dashed line is their route.',
      done: g => unitsNear(g, UA, at(g, 'Lyptsi'), 140, 'infantry').length > 0,
      marker: town('Lyptsi'),
    },
    {
      title: 'Capture it',
      text: 'Keep the squads inside the ring for five seconds. A captured town sends supply trucks and pays every time one arrives. You can now build near it.',
      done: townOwned('Lyptsi', UA),
      marker: town('Lyptsi'),
    },
    {
      title: 'Rations',
      text: 'Squads carry five minutes of rations, drawn from the larder when you recruit them, and eat wherever they stand. Within 300 of the headquarters they draw on its larder; at the front they need a held town with stores. Every 40 seconds a supply truck now leaves Kharkiv for Lyptsi with 100 funds and 100 rations: watch it arrive, and keep the squads within 120 of the town ring so they eat. The top bar shows the larder and any hungry squads.',
      done: g => (at(g, 'Lyptsi').food || 0) > 0,
      marker: town('Lyptsi'),
    },
    {
      title: 'Dig in',
      text: 'Drones kill squads in the open. Select two or more squads at Lyptsi and press E: after 5 seconds standing still they leave a trench, 45% less damage and 75% less from drones (85% less if you dig inside a wood). Towns and woods protect too. Wait for two trenches.',
      done: g => g.structs.filter(s => s.team === UA && s.def.trench).length >= 2,
      marker: town('Lyptsi'),
    },
    {
      title: 'Queue waypoints',
      text: 'Kozacha Lopan lies north-west of Lyptsi, past the Hoptivka crossing. Select two squads, right-click the crossing, then Shift+right-click Kozacha Lopan: the second click queues a waypoint, and the squads take the points in order. Numbered squares show the route.',
      done: g =>
        g.units.some(u => u.team === UA && !u.dead && u.def.troop && !!u.waypoints && u.waypoints.length > 0) ||
        unitsNear(g, UA, at(g, 'Kozacha Lopan'), 140, 'infantry').length > 0,
      marker: town('Kozacha Lopan'),
    },
    {
      title: 'Capture Kozacha Lopan',
      text: 'Hold the ring at Kozacha Lopan for five seconds. Two towns, two truck routes, twice the income; and twice the roads a drone can watch.',
      done: townOwned('Kozacha Lopan', UA),
      marker: town('Kozacha Lopan'),
    },
    {
      title: 'Control groups',
      text: 'Select the squads at Lyptsi and press Ctrl+1. From now on the 1 key selects them wherever the camera is, and . (full stop) cycles through squads that have nothing to do. Set at least one group.',
      done: (_g, ctx) => ctx.groups >= 1,
    },
    {
      title: 'Escort the trucks',
      text: 'Supply trucks now drive from Kharkiv to both towns, and drones love trucks. Select a mobile fire group (the machine-gun pickups by the headquarters) and press R, or click Escort trucks in the panel: it shadows the nearest truck with its guns up.',
      done: inMode(UA, 'fireGroup', 'escort'),
      marker: g => ring({ x: hqOf(g, UA).x + 60, y: hqOf(g, UA).y - 260 }, 90),
    },
    {
      title: 'A field hospital',
      text: 'Open the Build tab at the bottom, pick Field hospital, and place it in the wood south of Lyptsi (you can build near the headquarters or any town you hold). Troops inside its ring heal; put the trenches next to it. Watch the toast when it finishes: it needs power, and the next step gives it some.',
      done: g => structsNear(g, UA, 'aidPost', at(g, 'Lyptsi'), 420).length > 0,
      marker: town('Lyptsi'),
    },
    {
      title: 'Power the hospital',
      text: 'Every building except nets and trenches draws on the grid it stands on: the headquarters gives 30 power, the Kharkiv substation 60, and buildings link when they stand within 150 of each other (a yellow line shows the link). Your hospital is far from both, so it heals no one. Fix it either way: place a Generator set (300) beside it for 20 power of its own, or run Pylons (40 each, 190 reach) from the headquarters up the road until the line arrives. A dark barracks builds nothing and a dark radar sees little, so check every base you build.',
      done: g => structsNear(g, UA, 'aidPost', at(g, 'Lyptsi'), 420).some(s => s.build >= 1 && (s.pow ?? 0) > 0),
      marker: g => structsNear(g, UA, 'aidPost', at(g, 'Lyptsi'), 420)[0] || at(g, 'Lyptsi'),
    },
    {
      title: 'A third town',
      text: 'Zolochiv is west along the road from Derhachi. Take it with the squads you have left, or queue new ones at the barracks (Z). Hold all six towns for three minutes and the war ends without a shot at the enemy headquarters.',
      done: g => townsHeld(g, UA) >= 3,
      marker: town('Zolochiv'),
    },
  ],
};
