// Buildings: the ones a side builds or starts with, and the civilian sites of the two nations.

export interface StructDef {
  label: string;
  hp: number;
  /** footprint radius in pixels */
  r: number;
  cost: number;
  /** seconds to build; 0 = placed at the start */
  time: number;
  vision: number;
  /** unit keys this factory can build, in the order of the hotkeys Z X C V B H J U I (at most nine) */
  produces?: string[];
  /** power drawn from the grid it stands on; a building with demand runs at the grid's supply-to-demand ratio */
  demand?: number;
  /** power fed into the grid it stands on */
  power?: number;
  /** a pylon: conducts farther than a building and needs no headquarters or town nearby */
  pylon?: boolean;
  /** production heat added per drone built, and heat shed per second; at 100 the works overheats */
  heatPer?: number;
  cool?: number;
  /** jamming radius */
  jam?: number;
  /** anti-drone net radius */
  netR?: number;
  /** placed as a chain of nets along the nearest road */
  tunnel?: boolean;
  /** heals troops within this radius, at healRate of their hp per second */
  heal?: number;
  healRate?: number;
  /** a trench: dug by troops, never bought */
  trench?: boolean;
  range?: number;
}

export const STRUCTS: Record<string, StructDef> = {
  hq: {
    label: 'Headquarters',
    hp: 2000,
    r: 38,
    cost: 0,
    time: 0,
    vision: 260,
    power: 30,
  },
  barracks: {
    label: 'Barracks',
    hp: 480,
    r: 26,
    cost: 500,
    time: 12,
    vision: 180,
    produces: ['infantry', 'fireGroup', 'moto', 'merc', 'dprk'],
    demand: 5,
  },
  droneWorks: {
    label: 'Drone works',
    hp: 520,
    r: 28,
    cost: 700,
    time: 14,
    vision: 180,
    produces: ['fpv', 'fiberFpv', 'mavic', 'interceptor', 'bomber', 'fwRecon', 'liutyi', 'lancet', 'molniya'],
    demand: 10,
  },
  armorPlant: {
    label: 'Armor plant',
    hp: 700,
    r: 32,
    cost: 1000,
    time: 18,
    vision: 180,
    produces: ['tank', 'ifv', 'aa', 'jammer', 'ugv', 'relay'],
    demand: 8,
  },
  artyDepot: {
    label: 'Artillery depot',
    hp: 520,
    r: 28,
    cost: 900,
    time: 16,
    vision: 180,
    produces: ['howitzer', 'mlrs'],
    demand: 6,
  },
  radar: {
    label: 'Radar post',
    hp: 340,
    r: 18,
    cost: 300,
    time: 8,
    vision: 380,
    demand: 4,
  },
  ewStation: {
    label: 'EW station',
    hp: 320,
    r: 18,
    cost: 450,
    time: 10,
    vision: 200,
    demand: 8,
    jam: 240,
  },
  net: {
    label: 'Anti-drone net',
    hp: 220,
    r: 14,
    cost: 250,
    time: 8,
    vision: 80,
    netR: 95,
  },
  netLine: {
    label: 'Road net tunnel',
    hp: 220,
    r: 14,
    cost: 600,
    time: 8,
    vision: 80,
    netR: 95,
    tunnel: true,
  },
  pump: {
    label: 'Pumping station',
    hp: 260,
    r: 14,
    cost: 400,
    time: 10,
    vision: 120,
  },
  aidPost: {
    label: 'Field hospital',
    hp: 210,
    r: 14,
    cost: 350,
    time: 8,
    vision: 100,
    demand: 3,
    heal: 110,
    healRate: 0.04,
  },
  generator: {
    label: 'Generator set',
    hp: 170,
    r: 12,
    cost: 300,
    time: 8,
    vision: 60,
    power: 20,
  },
  powerPlant: {
    label: 'Power plant',
    hp: 450,
    r: 26,
    cost: 900,
    time: 20,
    vision: 120,
    power: 90,
  },
  pylon: {
    label: 'Pylon',
    hp: 120,
    r: 6,
    cost: 40,
    time: 3,
    vision: 40,
    pylon: true,
  },
  trench: {
    label: 'Trench',
    hp: 170,
    r: 10,
    cost: 0,
    time: 0,
    vision: 0,
    trench: true,
  },
};

/** the Build tab, in order */
export const BUILDABLE = [
  'pylon',
  'generator',
  'powerPlant',
  'net',
  'netLine',
  'aidPost',
  'radar',
  'ewStation',
  'barracks',
  'droneWorks',
  'armorPlant',
  'artyDepot',
];

/** civilian sites: belong to a nation (0 Ukrainian, 1 Russian), never to a side */
export const CIV_TYPES: Record<string, StructDef> = {
  apartments: {
    label: 'Apartments',
    hp: 320,
    r: 18,
    cost: 0,
    time: 0,
    vision: 0,
  },
  hospital: {
    label: 'Hospital',
    hp: 270,
    r: 16,
    cost: 0,
    time: 0,
    vision: 0,
    heal: 140,
    healRate: 0.06,
  },
  school: {
    label: 'School',
    hp: 230,
    r: 14,
    cost: 0,
    time: 0,
    vision: 0,
  },
  power: {
    label: 'Substation',
    hp: 240,
    r: 14,
    cost: 0,
    time: 0,
    vision: 0,
    power: 60,
  },
  market: {
    label: 'Market',
    hp: 200,
    r: 12,
    cost: 0,
    time: 0,
    vision: 0,
  },
};

/** score: what destroying a building is worth */
export function structPoints(d: StructDef): number {
  return d.trench ? 0 : d.cost ? Math.round(d.cost / 20) : 250;
}

/** one paragraph per building for the manual */
export const BUILDING_NOTES: Record<string, string> = {
  hq: 'Lose it and the game ends. Rally point for trucks and convoys. Squads recover morale near it.',
  barracks:
    'Troops: infantry, fire groups, motorcycle groups, foreign fighters, and for Russia North Koreans. Slow to build.',
  droneWorks:
    'Quadcopters in a fraction of a second each, as many as you can pay for and fly. With Launch rails researched it also builds the fixed-wing aircraft: the Shark spotter and Liutyi for Ukraine, the Orlan spotter, Lancet, and Molniya for Russia.',
  armorPlant:
    'Tanks, IFVs, mobile air defense, jammers, and for Ukraine assault robots and relay carriers. Vehicles need fuel from the gas supply.',
  artyDepot: 'Howitzers and rocket launchers. Fuel users too.',
  radar: 'Sees far and shoots nothing. Put your shooters under it.',
  ewStation: 'Drops radio-controlled drones inside its bubble. Fiber FPVs and frequency hopping get through.',
  net: 'Catches 85% of the FPVs that fly into it. Bombers and Gerans go over. Steel cable on poles: drone warheads and dropped bombs do a quarter damage to it; a howitzer, rockets, a tank, or a glide bomb bring it down.',
  netLine:
    'Five nets strung along the nearest road in one order: a safe corridor for trucks through the kill zone, as both armies now build by the kilometer.',
  aidPost: 'Heals troops within its radius. Place it in a wood behind the line.',
  generator:
    'A diesel source of 20 power. Put it beside a forward barracks or radar and that building runs with no line to the grid at all; at home it is insurance against losing the substation.',
  powerPlant:
    'A 90-power thermal plant: the biggest source you can build, and the biggest target after the headquarters. Gerans and missiles come for it.',
  pylon:
    'Forty funds of steel that carries the grid 190 farther. A line of them powers a forward base; two FPVs or one shell break one, and a broken line stalls everything past it. Pylons mend themselves when nothing hostile is near.',
  pump: 'Part of the pipeline: while any pump is down, gas income and fuel stop. Repair crews rebuild it after the area is quiet.',
  trench:
    'Dug by troops (E). Troops in it take 45% less damage and 75% less from drones (85% less when dug inside a wood), and are seen only within 110. Anyone can use it.',
};
