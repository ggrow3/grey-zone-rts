// The tuning numbers of the simulation, grouped by what they govern.

// ---- people and drone operators
/** drones per person by automation tier (0 to 3) for small and large aircraft */
export const AUTO_SMALL = [1, 2, 4, 8];
export const AUTO_LARGE = [1, 1, 2, 4];
/** drone operators a squad can hold, and drones each operator flies (doubled by Drone swarm control) */
export const OPS_MAX = 4;
export const DRONES_PER_OP = 3;
/** a battery drone that lands beside an infantry squad swaps its battery in this fraction of the time the works takes */
export const SQUAD_SWAP = 0.5;
/** squad callsigns, handed out in order per side; a lost squad is named in the log */
export const CALLSIGNS: [string[], string[]] = [
  [
    'Sokil',
    'Vovk',
    'Berkut',
    'Bober',
    'Kit',
    'Lys',
    'Kazhan',
    'Yastrub',
    'Ryś',
    'Tur',
    'Zubr',
    'Orel',
    'Kruk',
    'Sova',
    'Vedmid',
    'Kabán',
  ],
  [
    'Volk',
    'Medved',
    'Sokol',
    'Bars',
    'Tigr',
    'Orel',
    'Yastreb',
    'Ryś',
    'Zubr',
    'Voron',
    'Filin',
    'Lis',
    'Kaban',
    'Lebed',
    'Beluga',
    'Kit',
  ],
];

// ---- swarms and formations
export const FORMATIONS = ['wedge', 'line', 'column', 'ring'] as const;
export type FormationType = (typeof FORMATIONS)[number];
/** largest swarm by automation tier */
export const SWARM_CAP = [6, 12, 24, 48];

// ---- economy
/** funds a supply truck delivers, and seconds between trucks from a town */
export const TRUCK_LOAD = 100;
export const TRUCK_PERIOD = 40;
/** funds per second from a gas site (the Belgorod depot pays 2.4 times this) */
export const GAS_YIELD = 5;
/** rations: what squads eat, where it comes from, and how it gets to them */
export const FOOD = {
  /** rations a squad carries; it eats `eat` a second, so a full squad lasts five minutes in the field */
  rations: 100,
  eat: 1 / 3,
  /** the headquarters larder at the start, and what its kitchens add a second */
  start: 300,
  kitchens: 1.5,
  /** rations a grain truck brings from a wheat field (one every grainPeriod seconds), and a supply truck carries to a town */
  grainLoad: 100,
  grainPeriod: 40,
  truckLoad: 100,
  /** the most rations a town's stores hold; trucks only bring what fits */
  townCap: 300,
  /** how fast a squad restocks, and how close it must be to the headquarters, or to a town's ring, to eat */
  resupply: 25,
  hqRange: 300,
  townRange: 120,
  /** fire and speed of a squad whose rations have run out */
  hungryFire: 0.6,
  hungrySpeed: 0.8,
};
/** vehicles fuelled with no gas, and per gas site on an intact pipeline */
export const FUEL_BASE = 3;
export const FUEL_PER_NODE = 6;
/** the grid: sources and consumers link when their edges are within linkR (a pylon reaches pylonR); one point of spare supply charges one battery drone */
export const POWER = {
  linkR: 150,
  pylonR: 190,
  hq: 30,
  substation: 60,
  plant: 90,
  generator: 20,
};

// ---- building
/** how far from the headquarters, and from a held town, a side may build */
export const BUILD_RADIUS = 500;
export const TOWN_BUILD_RADIUS = 200;
/** nets laid along a road by one Road net tunnel order: how many, how far apart, how close to a road the click must be */
export const NET_LINE = {
  count: 5,
  spacing: 150,
  snap: 70,
  /** the share of a drone's damage a net or net tunnel takes: steel cable shrugs off warheads, shells and tank rounds bring it down */
  droneDamage: 0.25,
};
/** factory hotkeys, in the order of the building's `produces` list */
export const HOTKEYS = ['Z', 'X', 'C', 'V', 'B', 'H', 'J', 'U', 'I'];

// ---- combat
/** cover: fire bonus given, damage taken, damage taken from drones, and how close an enemy must be to spot a unit in it (0 = seen from anywhere) */
export const COVER: Record<string, { give: number; take: number; drone: number; spot: number }> = {
  trench: {
    give: 1.1,
    take: 0.55,
    drone: 0.25,
    spot: 110,
  },
  forest: {
    give: 1.5,
    take: 0.6,
    drone: 0.35,
    spot: 140,
  },
  urban: {
    give: 1.2,
    take: 0.75,
    drone: 0.45,
    spot: 220,
  },
  open: {
    give: 1,
    take: 1.3,
    drone: 1.45,
    spot: 0,
  },
};
/** extra protection from drones for a trench dug inside a wood (multiplies the trench figure) */
export const TRENCH_IN_FOREST = 0.6;
/** drones are small and agile: extra evasion against fire from other drones */
export const AIR_VS_AIR_EVADE = 0.25;
/** seconds a squad stands still to dig a trench */
export const DIG_TIME = 5;
/** the kill zone: troops and trucks in the open under the eye of an armed enemy drone bleed this many hp a second */
export const KILLZONE = {
  troop: 1.5,
  truck: 2.2,
  tick: 0.5,
};
/** a human on the sticks (Y): the drone flies toward the cursor; it dodges more, hits harder, and flies faster while piloted */
export const PILOT = {
  evade: 0.15,
  dmg: 1.2,
  speed: 1.15,
  hold: 0.45,
  ambushReach: 220,
  guardReach: 170,
};

// ---- strikes from beyond the map
/** glide bombs for both sides, ballistic missiles for Russia, deep strikes for Ukraine */
export const STRIKES = {
  kab: {
    cost: [500, 350],
    cooldown: [90, 40],
    warn: 6,
    dmg: 700,
    splash: 80,
    intercept: 0.35,
    interceptUp: 0.65,
    label: ['Glide bomb strike (F-16)', 'Glide bomb strike (KAB-500)'],
  },
  missile: {
    cost: 800,
    cooldown: 120,
    warn: 8,
    dmg: 900,
    splash: 60,
    intercept: 0.3,
    interceptUp: 0.6,
  },
  deep: {
    cost: 600,
    cooldown: 60,
    delay: 20,
    chance: 0.6,
    burn: 240,
    incomeMul: 0.85,
  },
};
/** the Russian Geran wave command */
export const WAVE_COST = 600;
export const WAVE_COOLDOWN = 90;

// ---- score and goals
/** points for a capture, and taken away for civilian harm */
export const SCORE = {
  capture: 25,
  civSite: -30,
  civCar: -10,
};
/** optional skirmish goals, one at a time per side, drawn from this pool; timed goals count seconds */
export interface MissionDef {
  text: string;
  goal: number;
  reward: number;
  timed?: boolean;
}
export const MISSIONS: Record<string, MissionDef> = {
  holdWheat: {
    text: 'Hold a wheat field for five minutes',
    goal: 300,
    reward: 300,
    timed: true,
  },
  pipeline: {
    text: 'Keep your pipeline whole for ten minutes',
    goal: 600,
    reward: 400,
    timed: true,
  },
  shootDown: {
    text: 'Shoot down three enemy drones',
    goal: 3,
    reward: 200,
  },
  killGun: {
    text: 'Destroy an enemy gun or air defense vehicle',
    goal: 1,
    reward: 250,
  },
  capture: {
    text: 'Capture a town',
    goal: 1,
    reward: 200,
  },
  trucks: {
    text: 'Bring five truck loads home',
    goal: 5,
    reward: 150,
  },
};
export const MISSION_SCORE = 20;

// ---- skirmish starting conditions (the `start` option of a Game)
export const STARTS: Record<string, { label: string; desc: string }> = {
  standard: {
    label: 'Standard',
    desc: 'Clear morning, both sides building up',
  },
  night: {
    label: 'Night start',
    desc: 'Darkness for the first three minutes: ground units see 60%, the enemy moves',
  },
  winter: {
    label: 'Winter start',
    desc: 'Snow from the first second: quadcopters grounded, mud off the roads, and more snow to come',
  },
  rush: {
    label: 'Russia attacks first',
    desc: 'The Belgorod group is already moving: an assault in the first minute and a fatter Russian purse',
  },
};
