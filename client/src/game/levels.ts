// Teaching levels: each is a short scripted game with a checklist of objectives. Completing the list wins the level.
import { UA, RU } from './data';
import { geo, KHARKIV, BELGOROD } from './map';
import { dist } from './dmath';
import type { Game } from './sim';
import { MOVE, ATTACK } from './sim';
import type { Entity, Unit } from './types';

export interface Marker { x: number; y: number; r: number }
export interface LevelCtx { camMoved: boolean; selection: Entity[] }
export interface Objective {
  title: string; text: string;
  done: (g: Game, ctx: LevelCtx) => boolean;
  marker?: (g: Game) => Marker | null;
  /** runs once when the step becomes current (scripted threats, timers) */
  onStart?: (g: Game) => void;
}
export interface Level {
  id: string; title: string; blurb: string; concepts: string[]; side: 0 | 1; difficulty: number;
  /** the bot stays passive / sends no Geran waves while fewer than this many objectives are done (Infinity = whole level) */
  passiveUntil: number; noGeransUntil: number;
  /** one line on what this army does differently, shown in the objectives panel */
  sideNote: string;
  /** level script run after the standard setup: pre-captured towns, extra units, funds */
  scenario?: (g: Game) => void;
  /** opening cutscene: narrated lines, and the map points the camera pans between (one per line, cycled) */
  briefing: string[];
  shots: (g: Game) => Pt[];
  objectives: Objective[];
}
export interface Pt { x: number; y: number }

const at = (g: Game, name: string) => g.site(name);
const townOwned = (name: string, team: number) => (g: Game) => at(g, name).owner === team;
const has = (team: number, type: string, n = 1) => (g: Game) => g.typeCount(team, type) >= n;
const alive = (g: Game, team: number, type: string) => g.units.filter(u => u.team === team && u.type === type && !u.dead);
const town = (name: string) => (g: Game) => { const d = at(g, name); return { x: d.x, y: d.y, r: 80 }; };
const own = (type: string, team = UA) => (g: Game) => { const s = g.structs.find(x => x.team === team && x.type === type && !x.dead); return s ? { x: s.x, y: s.y, r: 60 } : null; };
const lyptsi = (g: Game) => at(g, 'Lyptsi');
const kills = (g: Game, team: number, type: string) => g.stats.killsOf[team][type] || 0;
/** spawn n squads of a type around a point, optionally dug in */
function squads(g: Game, team: number, type: string, x: number, y: number, n: number, trench = false): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) { const u = g.spawn(type, team, x - (n - 1) * 17 + i * 34, y); out.push(u); if (trench) g.build('trench', team, u.x, u.y); }
  return out;
}
/** game time when a step started, keyed by level:step (client-side timers for "hold for N seconds" steps) */
const startedAt: Record<string, number> = {};
const holdFor = (key: string, seconds: number, cond: (g: Game) => boolean): Objective['done'] => g => cond(g) && g.gameTime - (startedAt[key] ?? g.gameTime) >= seconds;
const mark = (key: string) => (g: Game) => { startedAt[key] = g.gameTime; };

export const LEVELS: Level[] = [
  {
    id: 'boots', title: '1. Boots on the ground', side: UA, difficulty: 0.5, passiveUntil: Infinity, noGeransUntil: Infinity,
    blurb: 'Learn to move the camera, select squads, march on a town along the road, capture it, and dig in. The enemy stays quiet.',
    concepts: ['Camera and selection', 'Road movement', 'Capturing towns', 'Trenches and cover'],
    briefing: [
      'Kharkiv, early morning. The city is quiet for once, and the line to the north is thin: five squads, an IFV, and whatever we can build.',
      'Command wants Lyptsi, the village on the highway north-east of the city. Take it and the trucks start moving, and the enemy loses a staging point on our doorstep.',
      'The Russians are not moving yet. Use the time: walk the squads up the road, hold the ring for five seconds, and dig in the moment they stop, because the drones never sleep.',
      'Slava Ukraini, commander. Your squads are waiting north of the headquarters.',
    ],
    shots: g => [KHARKIV, { x: KHARKIV.x, y: KHARKIV.y - 200 }, g.site('Lyptsi'), KHARKIV],
    sideNote: 'Ukraine: your squads capture towns and fly your drones. Listen for them: they answer orders with "Slava Ukraini!"',
    objectives: [
      { title: 'Look around', text: 'Pan with W A S D or the arrow keys, zoom with the mouse wheel, and press Space to jump back to your headquarters in Kharkiv. Move the camera a good distance to continue.',
        done: (_g, ctx) => ctx.camMoved },
      { title: 'Select your squads', text: 'Drag a box around the five infantry squads just north of the headquarters. Squads capture towns, and they fly your drones.',
        done: (_g, ctx) => ctx.selection.filter(e => e.isUnit && e.type === 'infantry').length >= 3, marker: () => { const kh = geo(49.99, 36.23); return { x: kh.x, y: kh.y - 200, r: 110 }; } },
      { title: 'March on Lyptsi', text: 'Right-click the town of Lyptsi, north-east of Kharkiv. The squads route along the road and move faster on it. The dashed line is their route.',
        done: g => g.units.some(u => u.team === UA && u.type === 'infantry' && !u.dead && dist(u, lyptsi(g)) < 140), marker: town('Lyptsi') },
      { title: 'Capture it', text: 'Keep the squads inside the ring for five seconds. A captured town sends supply trucks and pays every time one arrives. You can now build near it.',
        done: g => lyptsi(g).owner === UA, marker: town('Lyptsi') },
      { title: 'Dig in', text: 'Drones kill squads in the open. Select two or more squads at Lyptsi and press E: after 20 seconds standing still they leave a trench, 45% less damage and 75% less from drones (85% less if you dig inside a wood). Towns and woods protect too. Wait for two trenches.',
        done: g => g.structs.filter(s => s.team === UA && s.def.trench).length >= 2, marker: town('Lyptsi') },
    ],
  },
  {
    id: 'eyes', title: '2. Eyes in the sky', side: UA, difficulty: 0.5, passiveUntil: 3, noGeransUntil: 3,
    blurb: 'Drones are most of your army. Build FPVs, put a Mavic up to see, strike what it sees, bind a swarm, and stand up air defense before the first Geran wave.',
    concepts: ['Drone works and heat', 'Operators and control range', 'Recon before strike', 'Swarms', 'Air defense layers'],
    briefing: [
      'The drone works is running and the operators are ready. Everything that happens on this front happens because somebody saw it first.',
      'Put a Mavic up before you send a single FPV: kamikaze drones and guns can only hit what your side can see.',
      'Intelligence says the first Geran wave is coming for the substation east of the city. Fire groups reach the low ones, a Sting hunts the rest. Have both up before it arrives.',
      'Fly carefully, commander. Every drone is a squad on the sticks.',
    ],
    shots: g => [g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || KHARKIV, g.site('Lyptsi'), { x: KHARKIV.x + 150, y: KHARKIV.y + 126 }, KHARKIV],
    sideNote: 'Ukraine: every drone is flown by a squad until you research Full autonomy; each operator in a squad flies three. Russian drones fly themselves from the start.',
    objectives: [
      { title: 'Fly FPVs', text: 'Click the drone works at your base and press Z three times. Drones are cheap and take a fraction of a second each. Each squad has one drone operator who flies up to three drones; the next level shows how to put more people in a squad. See Operators in the top bar.',
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
    id: 'operators', title: '3. Operators: people in the squad', side: UA, difficulty: 0.5, passiveUntil: Infinity, noGeransUntil: Infinity,
    blurb: 'Every drone needs a human on the sticks. Put more people into a squad, fly a dozen drones from it, research swarm control, and bind them into a swarm.',
    concepts: ['Operators per squad', 'Personnel pool', 'Twelve drones from one squad', 'Swarm control', 'Swarms'],
    briefing: [
      'A drone is only as good as the human flying it. One operator, three drones: that is the arithmetic of this war.',
      'Reinforcements have arrived from the mobilization pool. Put them into a squad and that squad flies a dozen drones at once.',
      'Procurement has cleared Terminal guidance and Drone swarm control. Buy them, bind the drones into a swarm, and the squad becomes a squadron.',
      'Build the pilots first, commander. The airframes are cheap.',
    ],
    shots: g => [{ x: KHARKIV.x, y: KHARKIV.y - 200 }, g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || KHARKIV, KHARKIV, { x: KHARKIV.x, y: KHARKIV.y - 200 }],
    sideNote: 'Ukraine: a squad holds up to four drone operators, each flying three drones (six after Drone swarm control). Every extra operator is one person from your pool.',
    scenario: g => { g.funds[UA] = 2600; },
    objectives: [
      { title: 'Add a human', text: 'Select one infantry squad north of the headquarters and press O (or the Add operator button in the panel). One person leaves your personnel pool and joins the squad as a second drone operator.',
        done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && (u.ops || 1) >= 2), marker: () => { const kh = geo(49.99, 36.23); return { x: kh.x, y: kh.y - 200, r: 110 }; } },
      { title: 'A squad of four', text: 'Keep pressing O until the squad has four operators. Four is the most a squad can hold; it can now fly twelve drones at once.',
        done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && (u.ops || 1) >= 4) },
      { title: 'A dozen drones', text: 'Click the drone works and queue FPVs (Z) and Mavics (C) until that squad is flying at least nine drones. Drones link to the nearest squad with a free slot, so keep the big squad closest to the works.',
        done: g => g.units.some(u => u.team === UA && u.def.operator && !u.dead && g.droneCount(u) >= 9), marker: own('droneWorks') },
      { title: 'Swarm control', text: 'Open the research tree (T) and buy Terminal guidance, then Drone swarm control: every operator now flies six drones instead of three.',
        done: g => !!g.upgrades[UA].auto2 },
      { title: 'Bind a swarm', text: 'Double-click a drone to select every drone on screen and press G. A swarm of six or more holds formation and spreads its dives over everything around a target.',
        done: g => g.swarms.some(s => s.team === UA && s.members.filter(m => !m.dead).length >= 6) },
    ],
  },
  {
    id: 'guns', title: '4. Guns and logistics', side: UA, difficulty: 0.5, passiveUntil: 0, noGeransUntil: 0,
    blurb: 'A live enemy. Fortify, keep the trucks alive, research, bring up artillery with a spotter, and hold three towns along the border.',
    concepts: ['Nets and hospitals', 'Trucks, trade, and capture', 'Research tree', 'Artillery, shells, and spotting', 'Holding ground'],
    briefing: [
      'The enemy is awake now, and the border is a kill zone. Anything that drives the highway gets hunted.',
      'Nets over the towns and a field hospital in the woods behind them keep the trucks and the squads alive. Trade convoys pay for everything else.',
      'The artillery depot has a howitzer ready. It carries twelve shells; ammunition trucks and the depot refill it. Put a Mavic ahead of it and it shells whatever the drone sees.',
      'Three towns by the end of the day, commander. Hold all six for three minutes and the war is over.',
    ],
    shots: g => [g.site('Lyptsi'), g.structs.find(s => s.team === 0 && s.type === 'artyDepot') || KHARKIV, g.site('Kozacha Lopan'), g.site('Zolochiv')],
    sideNote: 'Ukraine: your income rises and falls with international support, so keep your strikes off civilians.',
    objectives: [
      { title: 'Fortify', text: 'Open the Build tab. Place an anti-drone net over a town you hold (it catches FPVs) and a Field hospital in a wood behind it (it heals troops). You can build near the headquarters or any town you hold.',
        done: g => g.structs.some(x => x.team === UA && x.def.netR) && g.structs.some(x => x.team === UA && x.type === 'aidPost') },
      { title: 'Logistics', text: 'Watch the trucks. Supply trucks pay when they reach a town, grain and oil trucks carry from the fields and wells, trade convoys go west to the NATO border. All of it is prey for drones, and an enemy squad standing over a truck takes it. Keep three deliveries coming in.',
        done: g => g.stats.deliveries[UA] >= 3 },
      { title: 'Research', text: 'Open Procurement (T) and buy Terminal guidance. Drone swarm control after it lets one squad fly four drones; Full autonomy frees them entirely, the way Russian drones already are.',
        done: g => !!g.upgrades[UA].auto1 },
      { title: 'Guns', text: 'Queue a howitzer at the artillery depot (Z) and move it up behind Lyptsi. It carries 12 shells; ammunition trucks and the depot refill it. With a Mavic spotting ahead it shells whatever it sees. Ctrl+right-click fires on a map point blind.',
        done: g => g.typeCount(UA, 'howitzer') >= 1, marker: own('artyDepot') },
      { title: 'Hold three towns', text: 'Capture and hold three of the six towns at once. Lyptsi, Kozacha Lopan, and Zolochiv are closest. Infantry capture; drones and guns keep them. Hold all six for three minutes and the war is over.',
        done: g => g.depots.filter(d => d.owner === UA).length >= 3 },
    ],
  },
  {
    id: 'jam', title: '5. Under the jammer', side: UA, difficulty: 0.5, passiveUntil: 4, noGeransUntil: Infinity,
    blurb: 'A Russian jammer sits over Zhuravlyovka. Learn why radio FPVs fall out of the sky there, spool up fiber-optic drones, kill the jammer, and take the town.',
    concepts: ['EW bubbles', 'Fiber-optic FPVs', 'Tether range', 'Killing the jammer'],
    briefing: [
      'Zhuravlyovka, just over the border. A Russian jammer truck has parked there with three dug-in squads around it, and every radio drone we send falls out of the sky.',
      'The answer is a spool of fiber. Fiber-optic FPVs cannot be jammed, but they are tethered to the squad that flies them, five hundred pixels and not one more.',
      'Bring the squads up to Lyptsi first, then queue the fibers. Kill the jammer, and the radio drones work again.',
      'Then take the town, commander. The enemy will not stay quiet after that.',
    ],
    shots: g => [g.site('Zhuravlyovka'), g.site('Lyptsi'), g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || KHARKIV, g.site('Zhuravlyovka')],
    sideNote: 'Ukraine: fiber FPVs are tethered to a squad within 500, so the squads have to walk up before the drones can reach.',
    scenario: g => {
      g.capture('Lyptsi', UA); const L = g.site('Lyptsi'); squads(g, UA, 'infantry', L.x, L.y - 30, 3); g.funds[UA] = 1500;
      g.capture('Zhuravlyovka', RU); const Z = g.site('Zhuravlyovka'); squads(g, RU, 'infantry', Z.x, Z.y + 20, 3, true);
      const j = g.spawn('jammer', RU, Z.x + 40, Z.y + 60); g.tags.jammer = j.id; g.funds[RU] = 0;
    },
    objectives: [
      { title: 'Spot the bubble', text: 'Queue a Mavic (C at the drone works) and send it north toward Zhuravlyovka. The purple dashed ring is jamming: radio drones inside lose 30 hp a second.',
        done: g => { const j = g.find(g.tags.jammer); return !!(j && j.isUnit && (j.seenBy[UA] || g.stats.jammed[UA] > 0 || g.units.some(u => u.team === UA && u.def.air && !u.dead && dist(u, j) < 380))); }, marker: town('Zhuravlyovka') },
      { title: 'Learn the hard way', text: 'Queue an FPV (Z) and fly it at the town. Watch it flicker white and fall. That is what jamming does to every radio drone you own.',
        done: g => g.stats.jammed[UA] >= 1 || g.units.some(u => u.team === UA && u.def.jammable && u.jamT > 0) },
      { title: 'Spool the fiber', text: 'Fiber FPVs are flown by the squad nearest the works with a free slot and tethered to it within 500. First march every squad at Kharkiv up to Lyptsi (404 from the town), then queue three fiber-optic FPVs (X at the works): 45 funds, immune to jamming.',
        done: g => g.typeCount(UA, 'fiberFpv') >= 3 && g.units.filter(u => u.team === UA && u.def.operator && !u.dead && dist(u, lyptsi(g)) < 200).length >= 5, marker: town('Lyptsi') },
      { title: 'Kill the jammer', text: 'Select the fiber FPVs and right-click the jammer, or press F to dive at the nearest target in sight. Nets still catch fiber drones, jammers never do.',
        done: g => kills(g, UA, 'jammer') >= 1 || !g.find(g.tags.jammer), marker: town('Zhuravlyovka') },
      { title: 'Take the town', text: 'With the bubble gone, radio FPVs work again. Move the squads up and capture Zhuravlyovka. The enemy is awake now.',
        done: townOwned('Zhuravlyovka', UA), marker: town('Zhuravlyovka') },
    ],
  },
  {
    id: 'counterbattery', title: '6. Blind fire and counter-battery', side: UA, difficulty: 0.6, passiveUntil: 4, noGeransUntil: Infinity,
    blurb: 'Two Russian howitzers are shelling Lyptsi. Your radar catches their muzzle flashes; theirs are down, so only their drones can find your gun. Answer blind, then observed, then guard your gun against the Lancets that come for it.',
    concepts: ['Unobserved fire', 'Radar flash spotting', 'Observed fire', 'Ammunition', 'Lancets hunt guns'],
    briefing: [
      'Shells are falling on Lyptsi. Two Russian howitzers north of Zhuravlyovka are working the town blind, and our squads are in their trenches.',
      'Our radar post catches a muzzle flash for three seconds after every shot. Their radars are down, so they cannot do the same to you.',
      'Answer with the howitzer, blind at first, then fly the Mavic forward and watch the scatter tighten. Twelve shells, then wait for the truck.',
      'When the guns fall silent, the Lancets come for yours. Have a Sting and a fire group with the battery before they do.',
    ],
    shots: g => [g.site('Lyptsi'), g.site('Zhuravlyovka'), g.find(g.tags.gun) || g.site('Lyptsi'), g.site('Lyptsi')],
    sideNote: 'Ukraine: Russian Lancets loiter until a howitzer or air defense shows itself. Keep a Sting and a fire group with every battery.',
    scenario: g => {
      g.capture('Lyptsi', UA); const L = g.site('Lyptsi'); squads(g, UA, 'infantry', L.x, L.y - 30, 3, true);
      const h = g.spawn('howitzer', UA, L.x - 40, L.y + 120); g.tags.gun = h.id;
      g.spawn('mavic', UA, L.x, L.y + 60); g.build('radar', UA, L.x + 120, L.y + 90); g.funds[UA] = 1200;
      for (const r of g.structs.filter(x => x.team === RU && x.type === 'radar')) g.removeStruct(r);
      const Z = g.site('Zhuravlyovka'); g.capture('Zhuravlyovka', RU); squads(g, RU, 'infantry', Z.x, Z.y + 30, 2, true);
      for (const dx of [-60, 60]) g.spawn('howitzer', RU, Z.x + dx, Z.y - 90, { kind: 'bombard', x: L.x, y: L.y, target: null });
      g.funds[RU] = 0;
    },
    objectives: [
      { title: 'Incoming', text: 'Shells are landing on Lyptsi. Every time a gun fires, your radar post catches the flash and shows the gun for three seconds. Wait for one.',
        done: g => g.units.some(u => u.team === RU && u.type === 'howitzer' && u.seenBy[UA]), marker: town('Zhuravlyovka') },
      { title: 'Answer blind', text: 'Select your howitzer and Ctrl+right-click the flash (or press B and click). Unobserved fire scatters 2.4 times wider, but a battery is a big target. Twelve shells; the depot and ammunition trucks bring more.',
        done: g => g.units.some(u => u.team === UA && u.def.indirect && u.order.kind === 'bombard') },
      { title: 'Eyes on', text: 'Fly the Mavic north until the battery is in steady view. Observed fire lands with normal scatter.',
        done: g => g.units.some(u => u.team === UA && u.def.recon && !u.dead && dist(u, at(g, 'Zhuravlyovka')) < 300), marker: town('Zhuravlyovka') },
      { title: 'Silence the guns', text: 'Destroy both Russian howitzers. If your gun runs dry, pull it back toward the artillery depot or wait for the truck.',
        done: g => kills(g, UA, 'howitzer') >= 2 },
      { title: 'Guard the battery', text: 'Two Lancets are coming for your howitzer. Queue a Sting (V at the works) and keep a fire group with the gun. Shoot both down.',
        onStart: g => { const Z = at(g, 'Zhuravlyovka'), L = at(g, 'Lyptsi'); for (const dx of [-80, 80]) g.spawn('lancet', RU, Z.x + dx, Z.y - 200, MOVE(L.x, L.y)); },
        done: g => kills(g, UA, 'lancet') >= 2, marker: own('artyDepot') },
    ],
  },
  {
    id: 'rodina', title: '7. Za Rodinu: the road to Kozacha Lopan', side: RU, difficulty: 0.5, passiveUntil: Infinity, noGeransUntil: Infinity,
    blurb: 'Command the Russian side. Your drones fly themselves, Pyongyang sends infantry, and the Kharkiv highway is full of Ukrainian trucks to take.',
    concepts: ['Autonomous drones', 'North Korean infantry', 'Truck capture', 'Motorcycle rush', 'Morale'],
    briefing: [
      'Belgorod group, listen up. You hold Zhuravlyovka south of the city, and Kozacha Lopan across the border is Ukrainian, with two squads dug in.',
      'Your drones fly themselves: no operators, no control range. Pyongyang has sent infantry; they cost nothing from your pool and they fight, but their morale breaks if you start losing towns.',
      'A Ukrainian supply truck drives the Kharkiv highway every forty seconds. Sit a squad on that road and take it, cargo and all.',
      'Then the motorcycles go in. Grab the town before the trenches react. Za Rodinu, commander.',
    ],
    shots: g => [BELGOROD, g.site('Zhuravlyovka'), { x: 1445, y: 1119 }, g.site('Kozacha Lopan')],
    sideNote: 'Russia: drones need no squads, North Koreans cost no personnel, and your troops shout "Ura!" But morale breaks when you hold fewer towns than the enemy.',
    scenario: g => {
      g.capture('Zhuravlyovka', RU); const Z = g.site('Zhuravlyovka'); squads(g, RU, 'infantry', Z.x, Z.y + 40, 3); g.funds[RU] = 900;
      g.capture('Kozacha Lopan', UA); const K = g.site('Kozacha Lopan'); squads(g, UA, 'infantry', K.x, K.y + 20, 2, true); g.funds[UA] = 0; g.people[UA].total = 160;
    },
    objectives: [
      { title: 'They fly themselves', text: 'Click the drone works and press Z three times. Your drones need no squad: Ukraine pays 4,400 funds of research to get that.',
        done: g => g.stats.drones[RU] >= 3, marker: own('droneWorks', RU) },
      { title: 'Pyongyang\'s men', text: 'Queue two North Korean squads at the barracks (B): 100 funds, no draw on your personnel, ten at most. They are tough, and they have morale.',
        done: has(RU, 'dprk', 2), marker: own('barracks', RU) },
      { title: 'Highway robbery', text: 'A Ukrainian supply truck drives from Kharkiv to Kozacha Lopan every 40 seconds. Park a squad on the road south of the town: a squad within 45 of an unescorted truck takes it and its 100 funds.',
        done: g => g.captured[RU] >= 1, marker: () => ({ x: 1500, y: 1120, r: 120 }) },
      { title: 'Motorcycle rush', text: 'Queue two motorcycle groups (C at the barracks): speed 105, 80% faster on roads. Rush Kozacha Lopan before the trench squads react, and bring the drones.',
        done: g => g.typeCount(RU, 'moto') >= 2 && townOwned('Kozacha Lopan', RU)(g), marker: town('Kozacha Lopan') },
      { title: 'Keep them steady', text: 'Morale falls while Russia holds fewer towns than Ukraine, when a friend dies nearby, and with hunger. Hold two towns and keep every Korean squad above 50%.',
        done: g => g.depots.filter(d => d.owner === RU).length >= 2 && alive(g, RU, 'dprk').length >= 1 && alive(g, RU, 'dprk').every(u => (u.morale ?? 90) >= 50) },
    ],
  },
  {
    id: 'shahed', title: '8. Shahed night', side: RU, difficulty: 0.5, passiveUntil: 4, noGeransUntil: Infinity,
    blurb: 'Put an Orlan over Kharkiv, launch a Geran wave with decoys at the substation, and follow up with Molniya fixed-wing drones. Then hold on when Ukraine answers.',
    concepts: ['Orlan-10 spotting', 'Geran waves and decoys', 'The substation', 'Molniya', 'Layered defense'],
    briefing: [
      'Night over Kharkiv. Their air-defense battery has moved east; what stands between you and the city grid tonight is a handful of fire groups and one Sting.',
      'Put an Orlan over the city first. It flies above the machine guns, and it sees everything.',
      'The Geran wave costs six hundred and the crews need ninety seconds to reload: three drones and four decoys, the first two aimed at the substation. Kill the grid and their drones stop charging.',
      'Then send the Molniyas south to hunt over the gas wells, and be ready. Kharkiv answers at dawn.',
    ],
    shots: g => [BELGOROD, KHARKIV, { x: KHARKIV.x + 150, y: KHARKIV.y + 126 }, g.site('Gas wells')],
    sideNote: 'Russia: Geran waves are a 600-fund command with a 90 s reload. The bot gets them free; a human pays but chooses the moment.',
    // Ukraine's air-defense battery is away tonight: fire groups and a Sting are what stand between the wave and the grid
    scenario: g => { g.funds[RU] = 1500; const kh = KHARKIV; g.spawn('interceptor', UA, kh.x + 60, kh.y - 220); for (const a of g.units.filter(u => u.team === UA && u.type === 'aa')) g.removeUnit(a); },
    objectives: [
      { title: 'High eye', text: 'Queue an Orlan-10 at the launch site (Z) and fly it over Kharkiv. It flies above machine guns; only air defense and Stings reach it.',
        done: g => g.units.some(u => u.team === RU && u.type === 'fwRecon' && !u.dead && dist(u, KHARKIV) < 600), marker: () => ({ x: KHARKIV.x, y: KHARKIV.y, r: 300 }) },
      { title: 'Launch a wave', text: 'Press the Geran wave button in the Build tab (600 funds): three Gerans and four Gerbera decoys from the north, east, and south, the first two aimed at the substation. Decoys soak up shots.',
        done: g => g.stats.waves[RU] >= 1 },
      { title: 'Lights out', text: 'The wave goes for the Kharkiv substation first. Without it Ukraine charges 30 fewer battery drones. Launch again when the crews have reloaded.',
        done: g => !g.structs.some(s => s.civ && s.nation === 0 && s.type === 'power' && !s.dead), marker: () => { return { x: KHARKIV.x + 150, y: KHARKIV.y + 126, r: 70 }; } },
      { title: 'Molniya', text: 'Queue two Molniya fixed-wing FPVs at the launch site (C): 60 funds, 500 hunting radius, nets cannot catch them. They hunt on their own within 500: send them over the Ukrainian gas wells south of Kharkiv, where the oil trucks drive. Between the Molniyas and the waves, destroy two Ukrainian units or buildings, or keep the pressure on with a third wave.',
        done: g => g.typeCount(RU, 'molniya') >= 2 && (g.stats.kills[RU] + g.stats.structsKilled[RU] >= 2 || g.stats.waves[RU] >= 3), marker: g => { const w = g.site('Gas wells'); return { x: w.x, y: w.y, r: 120 }; } },
      { title: 'Ride out the answer', text: 'Ukraine is awake. Hold your headquarters for two minutes: a fire group and a Yolka over the fuel depot, air defense by the drone works.',
        onStart: mark('shahed:5'), done: holdFor('shahed:5', 120, g => !!g.hq(RU)), marker: own('hq', RU) },
    ],
  },
  {
    id: 'pipeline', title: '9. The Kursk line', side: UA, difficulty: 0.6, passiveUntil: 3, noGeransUntil: 3,
    blurb: 'Enemy FPVs are diving at your pumping stations. Defend the line, build a Liutyi, cut the Russian pump north of Belgorod, and turn gas into armor.',
    concepts: ['Pumps and fuel', 'Raids on the line', 'Liutyi deep strike', 'Fuel for vehicles'],
    briefing: [
      'Gas is fuel, and fuel is armor. Two wells south of the city feed two pipelines, and three pumping stations keep them flowing. Enemy FPVs are already diving at the nearest one.',
      'Hold the pumps with fire groups and air defense. While any pump is down, the gas income stops and the vehicles run dry.',
      'Then take the war to their line: the pump north-east of Belgorod is the only one they have. Two Liutyis will do it, if they fly around the city and its guns.',
      'Cut their line, keep yours, and the armor plant can turn out tanks. Slava Ukraini, commander.',
    ],
    shots: g => [g.pumpSites[1], g.site('Gas wells'), g.pumpSites.find(p => p.team === 1) || BELGOROD, g.structs.find(s => s.team === 0 && s.type === 'armorPlant') || KHARKIV],
    sideNote: 'Ukraine: two gas wells on two pipelines with three pumps to guard. Russia has one pump on the line from Kursk.',
    scenario: g => { g.funds[UA] = 1800; g.capture('Lyptsi', UA); const p = g.pumpSites[1]; g.spawn('fireGroup', UA, p.x - 40, p.y - 40); g.spawn('fireGroup', UA, p.x + 40, p.y - 40); g.spawn('aa', UA, p.x, p.y - 70); },
    objectives: [
      { title: 'Raid on the pump', text: 'Four enemy FPVs are diving at the pumping station south-east of your headquarters. While any pump is down, gas income and fuel stop. Shoot three down.',
        onStart: g => { const p = g.pumpSites[1]; if (p.struct) for (let i = 0; i < 4; i++) g.spawn('fpv', RU, p.x + i * 30 - 45, p.y - 700, ATTACK(p.struct)); },
        done: g => g.stats.shotDown[UA] >= 3, marker: g => ({ x: g.pumpSites[1].x, y: g.pumpSites[1].y, r: 120 }) },
      { title: 'Deep strike', text: 'Queue two Liutyi strike drones at the launch site (X): 300 funds each, 2 crew, a 350 warhead, buildings only. A pumping station has 500 hp, so it takes two.',
        done: has(UA, 'liutyi', 2), marker: own('launchSite') },
      { title: 'Cut the Kursk line', text: 'Russia\'s only pump stands north-east of Belgorod, and Belgorod air defense sits on the straight line to it. A Liutyi with no orders dives at the nearest enemy building within 700 on its own, so keep them well clear of Belgorod: fly both far east past Vovchansk, then north to the state border, and from there right-click the pump. A direct attack order flies straight at its target. Repair crews rebuild it after two quiet minutes.',
        done: g => g.pumpSites.some(ps => ps.team === RU && (!ps.struct || ps.struct.dead || ps.struct.build < 1)), marker: g => { const p = g.pumpSites.find(ps => ps.team === RU)!; return { x: p.x, y: p.y, r: 100 }; } },
      { title: 'Hold your own line', text: 'The enemy is awake and raids pumps every 100 seconds. Keep all three of yours standing for 90 seconds: fire groups, a net, a Sting.',
        onStart: mark('pipeline:4'), done: holdFor('pipeline:4', 90, g => g.pipelineIntact(UA)) },
      { title: 'Fuel for armor', text: 'Fuel capacity is 3 plus 6 per gas site with a whole pipeline: 15 for you, 9 for Russia. Queue a tank at the armor plant (Z).',
        done: has(UA, 'tank'), marker: own('armorPlant') },
    ],
  },
  {
    id: 'donets', title: '10. Across the Vovcha', side: RU, difficulty: 0.6, passiveUntil: 4, noGeransUntil: Infinity,
    blurb: 'From Shebekino, cross the river at the bridge, bomb the netted trenches of Vovchansk from above, hire mercenaries, and hold the crossing.',
    concepts: ['Rivers and bridges', 'Heavy bombers over nets', 'Mercenaries', 'Holding a crossing'],
    briefing: [
      'Shebekino, on the Nezhegol. Across the river, Vovchansk is Ukrainian, three squads in trenches under an anti-drone net.',
      'Rivers stop everything on the ground. The only way across is the bridge on the Vovchansk road; the squads will find it on their own.',
      'The net eats FPVs, so this is a job for the heavy bomber: it drops on the trenches from above and flies home for more. Hire a mercenary squad to lead the crossing; they are good, as long as they are paid.',
      'Take the town and hold the crossing when they come back for it. Ura, commander.',
    ],
    shots: g => [g.site('Shebekino'), { x: (g.site('Shebekino').x + g.site('Vovchansk').x) / 2, y: (g.site('Shebekino').y + g.site('Vovchansk').y) / 2 }, g.site('Vovchansk'), g.site('Vovchansk')],
    sideNote: 'Russia: mercenary assault squads fight well while paid and winning. Miss their wages and they walk.',
    scenario: g => {
      g.capture('Shebekino', RU); const S = g.site('Shebekino'); squads(g, RU, 'infantry', S.x, S.y + 40, 4); g.funds[RU] = 1400;
      g.capture('Vovchansk', UA); const V = g.site('Vovchansk'); squads(g, UA, 'infantry', V.x, V.y + 20, 3, true); g.build('net', UA, V.x, V.y - 20); g.funds[UA] = 300;
    },
    objectives: [
      { title: 'Find the bridge', text: 'Rivers block ground units; a blocked unit walks to the nearest bridge on its own. Send a squad south along the Shebekino road to the crossing.',
        done: g => g.units.some(u => u.team === RU && u.def.troop && !u.dead && u.y > at(g, 'Shebekino').y + 40 && g.terrain.nearBridge(u.x, u.y, 70)), marker: town('Vovchansk') },
      { title: 'Over the net', text: 'Vovchansk is netted: 85% of FPVs die in it. Queue a heavy bomber hexacopter (V at the works): 120 funds, drops 50-damage bombs, flies home for more.',
        done: has(RU, 'bomber'), marker: own('droneWorks', RU) },
      { title: 'Hired guns', text: 'Queue a mercenary assault squad at the barracks (V): 100 hp, speed 60, 2 funds a second in wages, gone at 0% morale.',
        done: has(RU, 'merc'), marker: own('barracks', RU) },
      { title: 'Vovchansk', text: 'Bomb the trenches, then cross with everything. There is a hospital in the town: its loss cuts Ukrainian income, so expect them to fight for it.',
        done: townOwned('Vovchansk', RU), marker: town('Vovchansk') },
      { title: 'Hold the crossing', text: 'Ukraine counterattacks. Hold the town for 90 seconds; dig in on the far bank and keep the bomber flying.',
        onStart: mark('donets:5'), done: holdFor('donets:5', 90, townOwned('Vovchansk', RU)), marker: town('Vovchansk') },
    ],
  },
];

export function levelById(id: string): Level | undefined { return LEVELS.find(l => l.id === id); }
