// Every unit in the game. To add one, copy the closest entry, give it a new key, and read docs/MODDING.md
// for the other places a unit shows up (its factory's `produces` list, a shape, the bot's shopping list).
// Numbers are game units: pixels for distances, seconds for times, hit points for damage.
import type { Team } from './teams';

/** what a weapon may be pointed at: troops, vehicles, buildings, aircraft */
export type TargetClass = 'inf' | 'veh' | 'struct' | 'air';

export interface UnitDef {
  // ---- identity
  /** name shown to each side: [as Ukraine sees it, as Russia sees it] */
  label: [string, string];
  /** only this side can build it (see `side` on the factory buttons); absent = both */
  side?: Team;
  /** the silhouette drawn on the map; the list of shapes is in render/shapes.ts */
  shape: string;
  /** collision and click radius in pixels; the drawn size is r x UNIT_SCALE x sizeMul */
  r: number;
  /** drawn this much larger again (visual only): the big vehicles read as big */
  sizeMul?: number;
  /** drawn as an outline: decoys */
  hollow?: boolean;

  // ---- production
  /** the building that makes it (a key of STRUCTS, and that building's `produces` list must include this unit); null = never built */
  factory: string | null;
  cost: number;
  /** people it takes from the pool; for aircraft this is divided by the automation tier (AUTO_SMALL / AUTO_LARGE) */
  crew: number;
  /** seconds to build */
  time: number;
  /** at most this many alive or queued per side */
  cap?: number;

  // ---- toughness and movement
  hp: number;
  /** pixels per second */
  speed: number;
  /** speed multiplier on a road */
  roadMul?: number;
  /** chance (0 to 1) that a shot at this aircraft misses */
  evade?: number;
  /** flies: passes over everything, only anti-air weapons reach it */
  air?: boolean;
  /** flies above machine guns unless switched to Low; lowAlt shooters cannot reach it */
  highAlt?: boolean;
  /** a shooter that only reaches low aircraft (machine guns) */
  lowAlt?: boolean;
  /** a big aircraft: hit by vsAirLarge, needs more operators per automation tier */
  large?: boolean;
  /** an unmanned ground vehicle: nobody inside, drones hit it 40% less */
  robot?: boolean;

  // ---- senses
  /** sight radius */
  vision: number;
  /** a spotter: the bot keeps it over the artillery */
  recon?: boolean;

  // ---- weapon
  range?: number;
  /** artillery cannot fire closer than this */
  minRange?: number;
  /** damage per shot, or the warhead of a kamikaze drone; 0 = unarmed */
  dmg: number;
  /** seconds between shots */
  rof?: number;
  /** splash radius: everything inside takes damage, fading with distance */
  splash?: number;
  /** rockets per salvo (rocket artillery) */
  salvo?: number;
  /** shell flight speed for indirect fire */
  shellSpeed?: number;
  /** indirect fire: shoots at map points it cannot see, needs a spotter for accuracy */
  indirect?: boolean;
  /** rounds carried; refilled by ammunition trucks and near the artillery depot */
  ammo?: number;
  /** dives into its target and dies */
  kamikaze?: boolean;
  /** a kamikaze that only goes for buildings (Gerans, Liutyi) */
  structuresOnly?: boolean;
  /** hunting radius: how far it looks for targets on its own */
  acquire?: number;
  /** what it can shoot; absent = nothing */
  targets?: TargetClass[];
  /** unit types it goes for first when hunting (Lancets and guns) */
  prefer?: string[];
  /** damage multipliers by what it hits: troops, vehicles, buildings, small drones, large aircraft (1 when absent) */
  vsInf?: number;
  vsVehicle?: number;
  vsStruct?: number;
  vsAirSmall?: number;
  vsAirLarge?: number;

  // ---- drone control and power
  /** flown by a squad (Ukraine) until Full autonomy is researched */
  operated?: boolean;
  /** fiber-optic: always tethered to its squad, cannot be jammed */
  tether?: boolean;
  /** control range from its squad (650 by default) */
  link?: number;
  /** seconds of flight before it must land to recharge or refuel */
  endurance?: number;
  /** seconds on the ground recharging */
  recharge?: number;
  /** battery powered: counts against the grid's charging capacity, grounded in snow if small */
  electric?: boolean;
  /** gasoline engine: counts against the fuel supply (see FUEL_USERS) */
  fuelDrone?: boolean;
  jet?: boolean;
  /** needs the Launch rails research to be built */
  fixedWing?: boolean;
  /** radio controlled: jammers drop it */
  jammable?: boolean;
  /** anti-drone nets catch it */
  netted?: boolean;

  // ---- roles
  /** infantry: eats, uses cover, can dig in, walks into towns */
  troop?: boolean;
  /** captures towns and sites by standing in them */
  canCapture?: boolean;
  /** a squad that flies drones (O adds operators) */
  operator?: boolean;
  /** has a morale bar; moraleLoss is the drain per second while its side holds fewer towns */
  morale?: boolean;
  moraleLoss?: number;
  /** funds per second in wages */
  upkeep?: number;
  /** jamming radius */
  jam?: number;
  /** relay carrier: drones count as in control range within this radius of it */
  relay?: number;
  /** drives itself and takes no orders: trucks and civilian cars */
  auto?: boolean;
  /** a civilian: belongs to a nation, not a side */
  civ?: boolean;

  /** the sentence in the manual and on the factory button */
  blurb?: string;
}

export const UNITS: Record<string, UnitDef> = {
  // ------------------------------------------------------------ Troops: built at the barracks, capture towns, and (Ukraine) fly the drones
  infantry: {
    label: ['Infantry squad', 'Infantry squad'],
    shape: 'circle',
    r: 7,
    factory: 'barracks',
    cost: 180,
    crew: 6,
    time: 12,
    hp: 70,
    speed: 42,
    roadMul: 1.3,
    vision: 170,
    range: 95,
    dmg: 7,
    rof: 0.55,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.1,
    vsVehicle: 0.25,
    vsStruct: 0.3,
    troop: true,
    canCapture: true,
    operator: true,
    blurb: 'Holds ground and captures towns. Rifles barely scratch armor or buildings, and FPVs eat squads alive.',
  },
  dprk: {
    label: ['North Korean infantry', 'North Korean infantry'],
    side: 1,
    shape: 'dprk',
    r: 7,
    factory: 'barracks',
    cost: 100,
    crew: 0,
    time: 12,
    cap: 10,
    hp: 90,
    speed: 42,
    roadMul: 1.3,
    vision: 160,
    range: 95,
    dmg: 9,
    rof: 0.5,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.2,
    vsVehicle: 0.25,
    vsStruct: 0.3,
    troop: true,
    canCapture: true,
    morale: true,
    moraleLoss: 0.8,
    blurb:
      "Korean People's Army infantry, as sent to Kursk in 2024: fit, disciplined, hard-hitting, and new to drones. They come from Pyongyang, not your pool, at most ten squads. Morale falls when their side is losing, when they take fire, and when friends die nearby; below 30% they fall back, at 0% the squad is gone.",
  },
  merc: {
    label: ['International Legion squad', 'Mercenary assault squad'],
    shape: 'merc',
    r: 7,
    factory: 'barracks',
    cost: 260,
    crew: 0,
    operator: true,
    time: 10,
    cap: 6,
    hp: 100,
    speed: 60,
    roadMul: 1.4,
    vision: 190,
    range: 100,
    dmg: 11,
    rof: 0.5,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.25,
    vsVehicle: 0.3,
    vsStruct: 0.3,
    troop: true,
    canCapture: true,
    morale: true,
    moraleLoss: 0.6,
    upkeep: 2,
    blurb:
      'Foreign fighters: experienced, fast, and well armed, but they fight for pay and for a winning side. Each squad costs 2 funds a second in wages; miss the pay or start losing towns and morale drops, below 30% they stop taking orders and fall back, at 0% they leave.',
  },
  fireGroup: {
    label: ['Mobile fire group', 'Mobile fire group'],
    shape: 'gun',
    r: 7,
    factory: 'barracks',
    cost: 140,
    crew: 3,
    time: 10,
    hp: 60,
    speed: 40,
    roadMul: 1.5,
    lowAlt: true,
    vision: 200,
    range: 130,
    dmg: 16,
    rof: 0.35,
    targets: ['air'],
    vsAirSmall: 1.35,
    vsAirLarge: 0.5,
    troop: true,
    blurb:
      'Machine guns and shotguns on a pickup. Shoots down drones and nothing else. Park them over trucks and towns.',
  },
  moto: {
    label: ['Motorcycle assault group', 'Motorcycle assault group'],
    shape: 'moto',
    r: 7,
    factory: 'barracks',
    cost: 130,
    crew: 3,
    time: 8,
    hp: 40,
    speed: 105,
    roadMul: 1.8,
    vision: 160,
    range: 70,
    dmg: 6,
    rof: 0.4,
    targets: ['inf', 'struct'],
    vsInf: 1.2,
    vsStruct: 0.2,
    troop: true,
    canCapture: true,
    blurb: 'Fast and fragile. Rushes through the kill zone to grab a town before the drones react.',
  },
  defector: {
    label: ['Russian volunteer squad', 'Russian volunteer squad'],
    shape: 'band',
    r: 7,
    factory: null,
    cost: 150,
    crew: 6,
    time: 0,
    hp: 80,
    speed: 42,
    roadMul: 1.3,
    vision: 170,
    range: 95,
    dmg: 8,
    rof: 0.55,
    targets: ['inf', 'veh', 'struct'],
    vsVehicle: 0.25,
    vsStruct: 0.3,
    troop: true,
    canCapture: true,
    operator: true,
    blurb:
      'Russians fighting for Ukraine. They arrive when your conduct toward civilians is clean and you hold ground on their side of the border.',
  },

  // ------------------------------------------------------------ Quadcopters: built at the drone works in a fraction of a second
  fpv: {
    label: ['FPV quadcopter', 'FPV quadcopter'],
    shape: 'quad',
    r: 6,
    factory: 'droneWorks',
    cost: 25,
    crew: 0,
    time: 0.2,
    hp: 30,
    speed: 190,
    evade: 0.35,
    air: true,
    vision: 170,
    dmg: 165,
    splash: 28,
    kamikaze: true,
    acquire: 340,
    targets: ['inf', 'veh', 'struct'],
    vsVehicle: 1.25,
    vsStruct: 0.7,
    operated: true,
    link: 650,
    endurance: 70,
    recharge: 25,
    electric: true,
    jammable: true,
    netted: true,
    blurb:
      'Seven to ten inch racing-style quads built by the hundred thousand a month. One to two kilo warhead, radio link, ten or so kilometers of reach. Jammers drop it and nets catch it.',
  },
  fiberFpv: {
    label: ['Fiber-optic FPV', 'Knyaz Vandal fiber FPV'],
    shape: 'quadtail',
    r: 6,
    factory: 'droneWorks',
    cost: 45,
    crew: 0,
    time: 0.25,
    hp: 30,
    speed: 140,
    evade: 0.35,
    air: true,
    vision: 170,
    dmg: 165,
    splash: 28,
    kamikaze: true,
    acquire: 340,
    targets: ['inf', 'veh', 'struct'],
    vsVehicle: 1.25,
    vsStruct: 0.7,
    operated: true,
    tether: true,
    link: 500,
    endurance: 60,
    recharge: 25,
    electric: true,
    jammable: false,
    netted: true,
    blurb: 'A spool of fiber instead of a radio link. Nothing to jam; the spool limits speed. Nets still catch it.',
  },
  mavic: {
    label: ['Mavic recon quad', 'Mavic recon quad'],
    shape: 'mavic',
    r: 6,
    factory: 'droneWorks',
    cost: 40,
    crew: 0,
    time: 0.25,
    hp: 110,
    speed: 175,
    evade: 0.85,
    air: true,
    highAlt: true,
    vision: 360,
    recon: true,
    dmg: 0,
    operated: true,
    link: 650,
    endurance: 120,
    recharge: 20,
    electric: true,
    jammable: true,
    blurb:
      'DJI Mavic 3 with a thermal camera: the standard tactical eye on both sides. Fast, and it watches from high up: machine guns cannot reach it, only air defense and interceptors can, and it dodges 85% of what they send. Jamming still drops it. Artillery can only fire at what your side can see.',
  },
  interceptor: {
    label: ['Sting interceptor', 'Yolka interceptor'],
    shape: 'quadnose',
    r: 7,
    factory: 'droneWorks',
    cost: 35,
    crew: 0,
    time: 0.2,
    hp: 35,
    speed: 215,
    evade: 0.4,
    air: true,
    vision: 260,
    range: 70,
    dmg: 22,
    rof: 0.5,
    acquire: 330,
    targets: ['air'],
    vsAirSmall: 0.8,
    vsAirLarge: 1.5,
    operated: true,
    link: 650,
    endurance: 80,
    recharge: 25,
    electric: true,
    jammable: true,
    blurb:
      'Purpose-built high-speed quad that rams or shoots drones. Patrols on its own. Drones are hard for other drones to hit, so Stings need numbers; easy prey for air defense.',
  },
  bomber: {
    label: ['Vampire heavy bomber (Baba Yaga)', 'Heavy bomber hexacopter'],
    shape: 'hexa',
    r: 9,
    factory: 'droneWorks',
    cost: 120,
    crew: 0,
    time: 0.6,
    hp: 140,
    speed: 130,
    evade: 0.15,
    air: true,
    large: true,
    vision: 190,
    range: 80,
    dmg: 65,
    rof: 2,
    splash: 40,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.4,
    vsVehicle: 0.8,
    vsStruct: 0.8,
    operated: true,
    link: 650,
    endurance: 160,
    recharge: 45,
    electric: true,
    jammable: true,
    blurb:
      'Carries mortar bombs, drops them, flies home for more. Slow, reusable, brutal against infantry clusters and nets.',
  },

  // ------------------------------------------------------------ Fixed-wing aircraft: the drone works builds them once Launch rails are researched
  fwRecon: {
    label: ['Shark recon plane', 'Orlan-10 recon plane'],
    shape: 'plane',
    r: 8,
    factory: 'droneWorks',
    cost: 150,
    crew: 0,
    time: 1,
    hp: 90,
    speed: 165,
    evade: 0.65,
    air: true,
    highAlt: true,
    large: true,
    vision: 520,
    recon: true,
    dmg: 0,
    operated: true,
    link: 1400,
    endurance: 600,
    recharge: 60,
    fuelDrone: true,
    fixedWing: true,
    jammable: true,
    blurb:
      'Fixed-wing spotter. Flies too high for machine guns, and high and small enough to dodge two thirds of what air defense and interceptors send up. Its vision is what makes the artillery accurate.',
  },
  liutyi: {
    label: ['Liutyi strike drone (An-196)', 'Liutyi strike drone'],
    side: 0,
    shape: 'plane',
    r: 9,
    factory: 'droneWorks',
    cost: 300,
    crew: 2,
    time: 2,
    hp: 120,
    speed: 150,
    evade: 0.2,
    air: true,
    large: true,
    vision: 120,
    dmg: 350,
    splash: 45,
    kamikaze: true,
    structuresOnly: true,
    acquire: 700,
    targets: ['struct'],
    vsStruct: 1.3,
    fuelDrone: true,
    fixedWing: true,
    jammable: true,
    blurb:
      "Ukraine's workhorse deep-strike drone with a 50 kg warhead. Here it flies at enemy buildings. Only air defense and interceptors stop it.",
  },
  lancet: {
    label: ['Lancet loitering munition', 'Lancet loitering munition'],
    side: 1,
    shape: 'plane',
    r: 7,
    factory: 'droneWorks',
    cost: 120,
    crew: 0,
    time: 0.6,
    hp: 60,
    speed: 165,
    evade: 0.3,
    air: true,
    vision: 200,
    dmg: 240,
    splash: 34,
    kamikaze: true,
    acquire: 420,
    targets: ['veh', 'struct', 'inf'],
    prefer: ['howitzer', 'mlrs', 'aa', 'jammer', 'tank'],
    vsInf: 0.8,
    vsVehicle: 1.4,
    operated: true,
    link: 1400,
    endurance: 240,
    recharge: 60,
    electric: true,
    fixedWing: true,
    jammable: true,
    blurb:
      "Russia's counter-battery and air-defense killer: it loiters until a howitzer, jammer, or launcher shows itself, then dives. Nets do not catch it.",
  },
  molniya: {
    label: ['Molniya fixed-wing FPV', 'Molniya fixed-wing FPV'],
    side: 1,
    shape: 'plane',
    r: 7,
    factory: 'droneWorks',
    cost: 60,
    crew: 0,
    time: 0.4,
    hp: 55,
    speed: 150,
    evade: 0.3,
    air: true,
    vision: 160,
    dmg: 190,
    splash: 34,
    kamikaze: true,
    acquire: 500,
    targets: ['inf', 'veh', 'struct'],
    operated: true,
    link: 1400,
    endurance: 200,
    recharge: 60,
    electric: true,
    fixedWing: true,
    jammable: true,
    blurb:
      'Plywood-and-foam fixed-wing drone with a few kilos of explosive and 40 km of reach. Cheap, jammable, not caught by nets.',
  },

  // ------------------------------------------------------------ Vehicles: built at the armor plant, run on fuel
  tank: {
    label: ['Main battle tank', 'Main battle tank'],
    shape: 'rect',
    r: 13,
    sizeMul: 1.45,
    factory: 'armorPlant',
    cost: 900,
    crew: 3,
    time: 30,
    hp: 420,
    speed: 52,
    roadMul: 1.25,
    vision: 190,
    range: 160,
    dmg: 60,
    rof: 2.4,
    splash: 44,
    targets: ['veh', 'struct'],
    vsInf: 0.6,
    vsVehicle: 1.4,
    vsStruct: 1.2,
    blurb:
      'Main gun aims at vehicles and buildings only, but every round splashes, so troops near the target get hit. Cannot engage drones. Seven FPVs kill it. Buy cages first.',
  },
  ifv: {
    label: ['IFV', 'IFV'],
    shape: 'rrect',
    r: 11,
    sizeMul: 1.15,
    factory: 'armorPlant',
    cost: 550,
    crew: 3,
    time: 22,
    hp: 230,
    speed: 78,
    roadMul: 1.5,
    vision: 200,
    range: 140,
    dmg: 12,
    rof: 0.45,
    targets: ['inf', 'veh', 'air', 'struct'],
    vsInf: 1.5,
    vsVehicle: 0.5,
    vsStruct: 0.4,
    vsAirSmall: 1,
    vsAirLarge: 0.7,
    blurb: 'Fast autocannon carrier. The vehicle that shoots at troops, and it can reach low-flying drones.',
  },
  aa: {
    label: ['Mobile air defense', 'Mobile air defense'],
    shape: 'cross',
    r: 11,
    sizeMul: 1.15,
    factory: 'armorPlant',
    cost: 450,
    crew: 2,
    time: 18,
    hp: 190,
    speed: 58,
    roadMul: 1.5,
    vision: 260,
    range: 240,
    dmg: 28,
    rof: 0.6,
    targets: ['air'],
    vsAirSmall: 0.9,
    vsAirLarge: 1.6,
    blurb: 'Shoots down drones at range. Useless against ground targets.',
  },
  jammer: {
    label: ['EW jammer', 'EW jammer'],
    shape: 'ring',
    r: 10,
    factory: 'armorPlant',
    cost: 400,
    crew: 2,
    time: 18,
    hp: 130,
    speed: 48,
    roadMul: 1.5,
    vision: 180,
    dmg: 0,
    jam: 190,
    blurb: 'Disrupts radio-controlled drones inside its radius until they fall. Cannot stop fiber-optic FPVs.',
  },
  ugv: {
    label: ['Assault robot (Ratel)', 'Assault robot'],
    side: 0,
    shape: 'ugv',
    r: 8,
    factory: 'armorPlant',
    cost: 220,
    crew: 0,
    time: 14,
    hp: 130,
    speed: 30,
    roadMul: 1.5,
    robot: true,
    vision: 140,
    range: 90,
    dmg: 8,
    rof: 0.5,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1,
    vsVehicle: 0.3,
    vsStruct: 0.3,
    canCapture: true,
    blurb:
      'A tracked ground robot with a machine gun, driven from the rear. Nobody dies when it is lost, it captures towns, and drones hit it 40% less; but it is slow, cannot dig in, and flies no drones. In April 2026 a Russian position fell to robots and drones alone.',
  },
  relay: {
    label: ['Relay carrier (Gnom-DC)', 'Relay carrier'],
    side: 0,
    shape: 'relay',
    r: 9,
    factory: 'armorPlant',
    cost: 380,
    crew: 1,
    time: 16,
    hp: 110,
    speed: 55,
    roadMul: 1.5,
    robot: true,
    vision: 200,
    dmg: 0,
    relay: 520,
    blurb:
      "A ground drone carrier with a repeater mast: your squads' drones count as in control range anywhere within 520 of it, so the squads can stay in cover while the strikes go forward. Drones love it as much as trucks.",
  },

  // ------------------------------------------------------------ Artillery: built at the artillery depot, needs a spotter and shells
  howitzer: {
    label: ['Howitzer', 'Howitzer'],
    shape: 'pent',
    r: 11,
    sizeMul: 1.4,
    factory: 'artyDepot',
    cost: 700,
    crew: 4,
    time: 28,
    hp: 160,
    speed: 34,
    roadMul: 1.4,
    vision: 130,
    range: 430,
    minRange: 110,
    dmg: 95,
    rof: 5.5,
    splash: 42,
    shellSpeed: 260,
    indirect: true,
    ammo: 12,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.2,
    vsStruct: 1.3,
    blurb:
      'Long range, slow reload, splash damage. Needs a recon drone to see its targets. Carries 12 shells: ammunition trucks and the artillery depot refill it. Park it in a wood: in the open a gun is seen from far off, every shot shows it to radar for six seconds, and drones hit it 45% harder. Shells splash friend and foe alike: keep your own troops out of the beaten zone. It cannot fire from under an anti-drone net; park it beside one, not inside.',
  },
  mlrs: {
    label: ['Rocket artillery', 'Rocket artillery'],
    shape: 'wedge',
    r: 12,
    sizeMul: 1.45,
    factory: 'artyDepot',
    cost: 1200,
    crew: 3,
    time: 36,
    hp: 170,
    speed: 50,
    roadMul: 1.4,
    vision: 130,
    range: 620,
    minRange: 220,
    dmg: 55,
    rof: 14,
    splash: 38,
    salvo: 6,
    shellSpeed: 340,
    indirect: true,
    ammo: 18,
    targets: ['inf', 'veh', 'struct'],
    vsInf: 1.3,
    vsStruct: 1.1,
    blurb:
      'Six-rocket salvos across most of the map. Long reload. Carries three salvos; trucks bring more. Fire from a wood and move after every mission. Six rockets with wide scatter: your own troops near the target die with the enemy. It cannot fire from under an anti-drone net; park it beside one, not inside.',
  },

  // ------------------------------------------------------------ Logistics and civilians: never built by the player
  truck: {
    label: ['Supply truck', 'Supply truck'],
    shape: 'truck',
    r: 9,
    factory: null,
    cost: 0,
    crew: 1,
    time: 0,
    hp: 80,
    speed: 70,
    roadMul: 1.8,
    vision: 120,
    dmg: 0,
    auto: true,
    blurb: 'Carries funds from headquarters to each town you hold. Drones love them.',
  },
  civcar: {
    label: ['Civilian vehicle', 'Civilian vehicle'],
    shape: 'car',
    r: 7,
    factory: null,
    cost: 0,
    crew: 0,
    time: 0,
    hp: 40,
    speed: 60,
    roadMul: 1.8,
    vision: 0,
    dmg: 0,
    auto: true,
    civ: true,
    blurb: 'Evacuation buses and family cars moving between towns. Nobody should be shooting at these.',
  },

  // ------------------------------------------------------------ Geran waves: spawned by the wave, never built
  geran: {
    label: ['Geran-2 (Shahed-136)', 'Geran-2 (Shahed-136)'],
    side: 1,
    shape: 'dart',
    r: 8,
    factory: null,
    cost: 300,
    crew: 0,
    time: 0,
    hp: 80,
    speed: 135,
    evade: 0.15,
    air: true,
    vision: 100,
    dmg: 220,
    splash: 40,
    kamikaze: true,
    structuresOnly: true,
    acquire: 900,
    targets: ['struct'],
    vsStruct: 1.2,
    jammable: true,
    blurb:
      'Slow and loud with a 50 kg warhead, aimed at power, housing, and factories. Machine guns, interceptors, and air defense all get it.',
  },
  geran3: {
    label: ['Geran-3 jet drone', 'Geran-3 jet drone'],
    side: 1,
    shape: 'dart',
    r: 9,
    factory: null,
    cost: 900,
    crew: 0,
    time: 0,
    hp: 100,
    speed: 240,
    evade: 0.25,
    air: true,
    vision: 100,
    dmg: 260,
    splash: 44,
    kamikaze: true,
    structuresOnly: true,
    acquire: 900,
    targets: ['struct'],
    jet: true,
    jammable: true,
    blurb:
      'The turbojet Geran: twice the speed of the piston version, harder to catch, same job. Appears in the later waves.',
  },
  geran5: {
    label: ['Geran-5 jet drone', 'Geran-5 jet drone'],
    side: 1,
    shape: 'dart',
    r: 9,
    factory: null,
    cost: 1200,
    crew: 0,
    time: 0,
    hp: 110,
    speed: 300,
    evade: 0.35,
    air: true,
    vision: 100,
    dmg: 280,
    splash: 46,
    kamikaze: true,
    structuresOnly: true,
    acquire: 900,
    targets: ['struct'],
    vsStruct: 1.2,
    jet: true,
    jammable: true,
    blurb:
      'The 2026 jet Geran: faster again than the Geran-3, harder to catch, better shielded against jamming. Leads the late waves.',
  },
  gerbera: {
    label: ['Gerbera decoy', 'Gerbera decoy'],
    shape: 'dart',
    r: 8,
    hollow: true,
    factory: null,
    cost: 60,
    crew: 0,
    time: 0,
    hp: 35,
    speed: 135,
    evade: 0.2,
    air: true,
    vision: 60,
    dmg: 0,
    splash: 0,
    kamikaze: true,
    structuresOnly: true,
    acquire: 900,
    targets: ['struct'],
    jammable: true,
    blurb: 'Foam-and-plywood decoy flown with the Gerans to soak up air defense fire.',
  },
};

/** units that draw on the fuel supply (gas sites and the pipeline) */
export const FUEL_USERS = new Set(['tank', 'ifv', 'aa', 'jammer', 'howitzer', 'mlrs', 'moto', 'liutyi', 'fwRecon']);

/** units are drawn this much larger than their simulation radius (visual only) */
const UNIT_SCALE = 1.3;
/** the radius a unit is drawn and clicked at */
export function drawR(d: UnitDef): number {
  return d.r * UNIT_SCALE * (d.sizeMul || 1);
}

/** score: what destroying a unit is worth, scaled by what it cost (a tank is worth five squads); trucks and free units by their toughness */
export function unitPoints(d: UnitDef): number {
  return Math.max(1, Math.round((d.cost || d.hp * 2.5) / 20));
}
