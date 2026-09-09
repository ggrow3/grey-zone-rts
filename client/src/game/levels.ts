// Teaching levels: each is a short scripted game with a checklist of objectives. Completing the list wins the level.
import { UA } from './data';
import { geo } from './map';
import { dist } from './dmath';
import type { Game } from './sim';
import type { Entity } from './types';

export interface Marker { x: number; y: number; r: number }
export interface LevelCtx { camMoved: boolean; selection: Entity[] }
export interface Objective { title: string; text: string; done: (g: Game, ctx: LevelCtx) => boolean; marker?: (g: Game) => Marker | null }
export interface Level {
  id: string; title: string; blurb: string; concepts: string[]; side: 0 | 1; difficulty: number;
  /** the bot stays passive / sends no Geran waves while fewer than this many objectives are done (Infinity = whole level) */
  passiveUntil: number; noGeransUntil: number;
  objectives: Objective[];
}

const lyptsi = (g: Game) => g.depots.find(d => d.name === 'Lyptsi')!;
const town = (name: string) => (g: Game) => { const d = g.depots.find(x => x.name === name)!; return { x: d.x, y: d.y, r: 80 }; };
const own = (type: string) => (g: Game) => { const s = g.structs.find(x => x.team === UA && x.type === type); return s ? { x: s.x, y: s.y, r: 60 } : null; };

export const LEVELS: Level[] = [
  {
    id: 'boots', title: '1. Boots on the ground', side: UA, difficulty: 0.5, passiveUntil: Infinity, noGeransUntil: Infinity,
    blurb: 'Learn to move the camera, select squads, march on a town along the road, capture it, and dig in. The enemy stays quiet.',
    concepts: ['Camera and selection', 'Road movement', 'Capturing towns', 'Trenches and cover'],
    objectives: [
      { title: 'Look around', text: 'Pan with W A S D or the arrow keys, zoom with the mouse wheel, and press Space to jump back to your headquarters in Kharkiv. Move the camera a good distance to continue.',
        done: (_g, ctx) => ctx.camMoved },
      { title: 'Select your squads', text: 'Drag a box around the five infantry squads just north of the headquarters. Squads capture towns, and they fly your drones.',
        done: (_g, ctx) => ctx.selection.filter(e => e.isUnit && e.type === 'infantry').length >= 3, marker: () => { const kh = geo(49.99, 36.23); return { x: kh.x, y: kh.y - 200, r: 110 }; } },
      { title: 'March on Lyptsi', text: 'Right-click the town of Lyptsi, north-east of Kharkiv. The squads route along the road and move faster on it. The dashed line is their route.',
        done: g => g.units.some(u => u.team === UA && u.type === 'infantry' && !u.dead && dist(u, lyptsi(g)) < 140), marker: town('Lyptsi') },
      { title: 'Capture it', text: 'Keep the squads inside the ring for five seconds. A captured town sends supply trucks and pays every time one arrives. You can now build near it.',
        done: g => lyptsi(g).owner === UA, marker: town('Lyptsi') },
      { title: 'Dig in', text: 'Select two or more squads at Lyptsi and press E. After 20 seconds standing still they leave a trench: 45% less damage, 70% less from drones, and hard to spot. Wait for two trenches.',
        done: g => g.structs.filter(s => s.team === UA && s.def.trench).length >= 2, marker: town('Lyptsi') },
    ],
  },
  {
    id: 'eyes', title: '2. Eyes in the sky', side: UA, difficulty: 0.5, passiveUntil: 3, noGeransUntil: 3,
    blurb: 'Drones are most of your army. Build FPVs, put a Mavic up to see, strike what it sees, bind a swarm, and stand up air defense before the first Geran wave.',
    concepts: ['Drone works and heat', 'Operators and control range', 'Recon before strike', 'Swarms', 'Air defense layers'],
    objectives: [
      { title: 'Fly FPVs', text: 'Click the drone works at your base and press Z three times. Drones are cheap and quick, but each one heats the works: watch the heat bar. Each drone is flown by one of your five squads until you research swarm control. See Operator slots in the top bar.',
        done: g => g.stats.drones[UA] >= 3, marker: own('droneWorks') },
      { title: 'Eyes forward', text: 'Queue a Mavic recon quad (C at the drone works), select it, and send it north toward Lyptsi. Artillery and kamikaze drones can only hit what your side can see.',
        done: g => g.units.some(u => u.team === UA && u.type === 'mavic' && !u.dead && u.y < lyptsi(g).y + 60), marker: town('Lyptsi') },
      { title: 'Air defense', text: 'Enemy Geran-2 drones are about to start coming for your buildings. Queue a mobile fire group at the barracks (X) and a Sting interceptor at the drone works (V). Fire groups reach low drones, Stings hunt them.',
        done: g => g.typeCount(UA, 'fireGroup') >= 3 && g.typeCount(UA, 'interceptor') >= 1, marker: own('barracks') },
      { title: 'Strike', text: 'The enemy is moving now. Select your FPVs (double-click one to grab all on screen) and press F: kamikaze drones dive at the nearest target they can see, within range of their squad. Nothing in sight? Push the Mavic north.',
        done: g => g.stats.kills[UA] >= 2 },
      { title: 'Swarm', text: 'Select three or more drones and press G to bind them into a swarm. Pick a formation in the panel. A swarm keeps its shape, and F spreads its dives over everything around a target.',
        done: g => g.swarms.some(s => s.team === UA) },
      { title: 'Hold the sky', text: 'Shoot down four enemy drones. Keep the fire groups and the Sting over your substation and headquarters; the Gerans go for the power first.',
        done: g => g.stats.shotDown[UA] >= 4 },
    ],
  },
  {
    id: 'guns', title: '3. Guns and logistics', side: UA, difficulty: 0.5, passiveUntil: 0, noGeransUntil: 0,
    blurb: 'A live enemy. Fortify, keep the trucks alive, research, bring up artillery with a spotter, and hold three towns along the border.',
    concepts: ['Nets and hospitals', 'Trucks, trade, and capture', 'Research tree', 'Artillery and spotting', 'Holding ground'],
    objectives: [
      { title: 'Fortify', text: 'Open the Build tab. Place an anti-drone net over a town you hold (it catches FPVs) and a Field hospital in a wood behind it (it heals troops). You can build near the headquarters or any town you hold.',
        done: g => g.structs.some(x => x.team === UA && x.def.netR) && g.structs.some(x => x.team === UA && x.type === 'aidPost') },
      { title: 'Logistics', text: 'Watch the trucks. Supply trucks pay when they reach a town, grain and oil trucks carry from the fields and wells, trade convoys go west to the NATO border. All of it is prey for drones, and an enemy squad standing over a truck takes it. Keep three deliveries coming in.',
        done: g => g.stats.deliveries[UA] >= 3 },
      { title: 'Research', text: 'Open Procurement (T) and buy Terminal guidance. Drone swarm control after it lets one squad fly four drones; Full autonomy frees them entirely, the way Russian drones already are.',
        done: g => !!g.upgrades[UA].auto1 },
      { title: 'Guns', text: 'Queue a howitzer at the artillery depot (Z) and move it up behind Lyptsi. With a Mavic spotting ahead it shells whatever it sees. Ctrl+right-click fires on a map point blind. Watch for Lancets: they hunt artillery.',
        done: g => g.typeCount(UA, 'howitzer') >= 1, marker: own('artyDepot') },
      { title: 'Hold three towns', text: 'Capture and hold three of the six towns at once. Lyptsi, Kozacha Lopan, and Zolochiv are closest. Infantry capture; drones and guns keep them.',
        done: g => g.depots.filter(d => d.owner === UA).length >= 3 },
    ],
  },
];

export function levelById(id: string): Level | undefined { return LEVELS.find(l => l.id === id); }
