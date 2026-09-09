// Unit, building, and research definitions (from the original game, unchanged numbers).
export const UA = 0, RU = 1;
export type Team = 0 | 1;
export type TargetClass = 'inf' | 'veh' | 'struct' | 'air';

export const TEAMS = [
  { name: 'Ukraine', color: '#3a86ff', stroke: '#ffd60a', dark: '#1f3d78', hud: '#3a86ff' },
  { name: 'Russia', color: '#c1121f', stroke: '#2e2e2e', dark: '#5a1418', hud: '#c1121f' },
];

export interface UnitDef {
  label: [string, string]; shape: string; r: number; hp: number; speed: number; roadMul?: number; range?: number; dmg: number; rof?: number;
  cost: number; crew: number; time: number; factory: string | null; vision: number;
  canCapture?: boolean; operator?: boolean; troop?: boolean; targets?: TargetClass[]; vsStruct?: number; vsVehicle?: number;
  morale?: boolean; moraleLoss?: number; side?: number; cap?: number; upkeep?: number; lowAlt?: boolean; highAlt?: boolean;
  evade?: number; kamikaze?: boolean; splash?: number; operated?: boolean; endurance?: number; recharge?: number; electric?: boolean; link?: number;
  air?: boolean; jammable?: boolean; netted?: boolean; acquire?: number; tether?: boolean; recon?: boolean; fuelDrone?: boolean; large?: boolean;
  structuresOnly?: boolean; prefer?: string[]; minRange?: number; indirect?: boolean; shellSpeed?: number; salvo?: number; jam?: number;
  auto?: boolean; civ?: boolean; jet?: boolean; hollow?: boolean; blurb?: string;
  /** rounds carried by artillery; resupplied by trucks and near the depot */
  ammo?: number;
}

export const UNITS: Record<string, UnitDef> = {
  infantry: { label: ['Infantry squad', 'Infantry squad'], shape: 'circle', r: 7, hp: 70, speed: 42, roadMul: 1.3, range: 95, dmg: 7, rof: 0.55,
    cost: 180, crew: 6, time: 12, factory: 'barracks', vision: 170, canCapture: true, operator: true, troop: true, targets: ['inf', 'veh', 'struct'], vsStruct: 0.3, vsVehicle: 0.25,
    blurb: 'Holds ground and captures towns. Rifles barely scratch armor or buildings, and FPVs eat squads alive.' },
  dprk: { label: ['North Korean infantry', 'North Korean infantry'], shape: 'dprk', r: 7, hp: 90, speed: 42, roadMul: 1.3, range: 95, dmg: 9, rof: 0.5,
    cost: 100, crew: 0, time: 12, factory: 'barracks', vision: 160, canCapture: true, troop: true, targets: ['inf', 'veh', 'struct'], vsStruct: 0.3, vsVehicle: 0.25,
    morale: true, moraleLoss: 0.8, side: 1, cap: 10,
    blurb: 'Korean People\'s Army infantry, as sent to Kursk in 2024: fit, disciplined, hard-hitting, and new to drones. They come from Pyongyang, not your pool, at most ten squads. Morale falls when their side is losing, when they take fire, and when friends die nearby; below 30% they fall back, at 0% the squad is gone.' },
  merc: { label: ['International Legion squad', 'Mercenary assault squad'], shape: 'merc', r: 7, hp: 100, speed: 60, roadMul: 1.4, range: 100, dmg: 11, rof: 0.5,
    cost: 260, crew: 0, time: 10, factory: 'barracks', vision: 190, canCapture: true, troop: true, targets: ['inf', 'veh', 'struct'], vsStruct: 0.3, vsVehicle: 0.3,
    morale: true, moraleLoss: 0.6, upkeep: 2, cap: 6,
    blurb: 'Foreign fighters: experienced, fast, and well armed, but they fight for pay and for a winning side. Each squad costs 2 funds a second in wages; miss the pay or start losing towns and morale drops, below 30% they stop taking orders and fall back, at 0% they leave.' },
  fireGroup: { label: ['Mobile fire group', 'Mobile fire group'], shape: 'gun', r: 7, hp: 60, speed: 40, roadMul: 1.5, range: 130, dmg: 16, rof: 0.35,
    cost: 140, crew: 3, time: 10, factory: 'barracks', vision: 200, troop: true, targets: ['air'], lowAlt: true,
    blurb: 'Machine guns and shotguns on a pickup. Shoots down drones and nothing else. Park them over trucks and towns.' },
  moto: { label: ['Motorcycle assault group', 'Motorcycle assault group'], shape: 'moto', r: 7, hp: 40, speed: 105, roadMul: 1.8, range: 70, dmg: 6, rof: 0.4,
    cost: 130, crew: 3, time: 8, factory: 'barracks', vision: 160, canCapture: true, troop: true, targets: ['inf', 'struct'], vsStruct: 0.2,
    blurb: 'Fast and fragile. Rushes through the kill zone to grab a town before the drones react.' },
  fpv: { label: ['FPV quadcopter', 'FPV quadcopter'], shape: 'tri', r: 6, hp: 30, evade: 0.35, speed: 190, kamikaze: true, dmg: 165, splash: 28,
    cost: 25, crew: 0, operated: true, endurance: 70, recharge: 25, electric: true, link: 650, time: 0.2, factory: 'droneWorks', vision: 170, air: true, jammable: true, netted: true, targets: ['inf', 'veh', 'struct'], acquire: 340,
    blurb: 'Seven to ten inch racing-style quads built by the hundred thousand a month. One to two kilo warhead, radio link, ten or so kilometers of reach. Jammers drop it and nets catch it.' },
  fiberFpv: { label: ['Fiber-optic FPV', 'Knyaz Vandal fiber FPV'], shape: 'tritail', r: 6, hp: 30, evade: 0.35, speed: 140, kamikaze: true, dmg: 165, splash: 28,
    cost: 45, crew: 0, operated: true, tether: true, endurance: 60, recharge: 25, electric: true, link: 500, time: 0.25, factory: 'droneWorks', vision: 170, air: true, jammable: false, netted: true, targets: ['inf', 'veh', 'struct'], acquire: 340,
    blurb: 'A spool of fiber instead of a radio link. Nothing to jam; the spool limits speed. Nets still catch it.' },
  mavic: { label: ['Mavic recon quad', 'Mavic recon quad'], shape: 'diamond', r: 6, hp: 45, evade: 0.7, speed: 145, dmg: 0, cost: 40, crew: 0, operated: true, endurance: 110, recharge: 30, electric: true, link: 650, time: 0.25, recon: true,
    factory: 'droneWorks', vision: 360, air: true, jammable: true,
    blurb: 'DJI Mavic 3 with a thermal camera: the standard tactical eye on both sides. Cheap, everywhere, easily jammed, and small enough to dodge 70% of what is fired at it. Artillery can only fire at what your side can see.' },
  fwRecon: { label: ['Shark recon plane', 'Orlan-10 recon plane'], shape: 'plane', r: 8, hp: 90, evade: 0.65, speed: 165, dmg: 0, cost: 150, fuelDrone: true, crew: 0, operated: true, endurance: 600, recharge: 60, link: 1400, large: true, time: 1, recon: true,
    factory: 'launchSite', vision: 520, air: true, jammable: true, highAlt: true,
    blurb: 'Fixed-wing spotter. Flies too high for machine guns, and high and small enough to dodge two thirds of what air defense and interceptors send up. Its vision is what makes the artillery accurate.' },
  interceptor: { label: ['Sting interceptor', 'Yolka interceptor'], shape: 'star', r: 7, hp: 35, evade: 0.4, speed: 215, range: 70, dmg: 22, rof: 0.5,
    cost: 35, crew: 0, operated: true, endurance: 80, recharge: 25, electric: true, link: 650, time: 0.2, factory: 'droneWorks', vision: 260, air: true, jammable: true, targets: ['air'], acquire: 330,
    blurb: 'Purpose-built high-speed quad that rams or shoots drones. Patrols on its own. Drones are hard for other drones to hit, so Stings need numbers; easy prey for air defense.' },
  bomber: { label: ['Vampire heavy bomber (Baba Yaga)', 'Heavy bomber hexacopter'], shape: 'hex', r: 9, hp: 140, evade: 0.15, speed: 130, range: 80, dmg: 65, splash: 40, rof: 2.0,
    cost: 120, crew: 0, operated: true, endurance: 160, recharge: 45, electric: true, link: 650, large: true, time: 0.6, factory: 'droneWorks', vision: 190, air: true, jammable: true, targets: ['inf', 'veh', 'struct'],
    blurb: 'Carries mortar bombs, drops them, flies home for more. Slow, reusable, brutal against infantry clusters and nets.' },
  liutyi: { label: ['Liutyi strike drone (An-196)', 'Liutyi strike drone'], shape: 'plane', r: 9, hp: 120, evade: 0.2, speed: 150, kamikaze: true, dmg: 350, splash: 45,
    cost: 300, fuelDrone: true, crew: 2, large: true, time: 2, factory: 'launchSite', vision: 120, air: true, jammable: true, targets: ['struct'], structuresOnly: true, acquire: 700, side: 0,
    blurb: 'Ukraine\'s workhorse deep-strike drone with a 50 kg warhead. Here it flies at enemy buildings. Only air defense and interceptors stop it.' },
  lancet: { label: ['Lancet loitering munition', 'Lancet loitering munition'], shape: 'plane', r: 7, hp: 60, evade: 0.3, speed: 165, kamikaze: true, dmg: 240, splash: 34,
    cost: 120, crew: 0, operated: true, endurance: 240, recharge: 60, electric: true, link: 1400, time: 0.6, factory: 'launchSite', vision: 200, air: true, jammable: true, targets: ['veh', 'struct', 'inf'], acquire: 420, side: 1, prefer: ['howitzer', 'mlrs', 'aa', 'jammer', 'tank'],
    blurb: 'Russia\'s counter-battery and air-defense killer: it loiters until a howitzer, jammer, or launcher shows itself, then dives. Nets do not catch it.' },
  molniya: { label: ['Molniya fixed-wing FPV', 'Molniya fixed-wing FPV'], shape: 'plane', r: 7, hp: 55, evade: 0.3, speed: 150, kamikaze: true, dmg: 190, splash: 34,
    cost: 60, crew: 0, operated: true, endurance: 200, recharge: 60, electric: true, link: 1400, time: 0.4, factory: 'launchSite', vision: 160, air: true, jammable: true, targets: ['inf', 'veh', 'struct'], acquire: 500, side: 1,
    blurb: 'Plywood-and-foam fixed-wing drone with a few kilos of explosive and 40 km of reach. Cheap, jammable, not caught by nets.' },
  tank: { label: ['Main battle tank', 'Main battle tank'], shape: 'rect', r: 13, hp: 420, speed: 52, roadMul: 1.25, range: 160, dmg: 60, splash: 44, rof: 2.4,
    cost: 900, crew: 3, time: 30, factory: 'armorPlant', vision: 190, targets: ['veh', 'struct'],
    blurb: 'Main gun aims at vehicles and buildings only, but every round splashes, so troops near the target get hit. Cannot engage drones. Seven FPVs kill it. Buy cages first.' },
  ifv: { label: ['IFV', 'IFV'], shape: 'rrect', r: 11, hp: 230, speed: 78, roadMul: 1.5, range: 140, dmg: 12, rof: 0.45,
    cost: 550, crew: 3, time: 22, factory: 'armorPlant', vision: 200, targets: ['inf', 'veh', 'air', 'struct'], vsStruct: 0.4, vsVehicle: 0.5,
    blurb: 'Fast autocannon carrier. The vehicle that shoots at troops, and it can reach low-flying drones.' },
  aa: { label: ['Mobile air defense', 'Mobile air defense'], shape: 'cross', r: 11, hp: 190, speed: 58, roadMul: 1.5, range: 240, dmg: 28, rof: 0.6,
    cost: 450, crew: 2, time: 18, factory: 'armorPlant', vision: 260, targets: ['air'],
    blurb: 'Shoots down drones at range. Useless against ground targets.' },
  jammer: { label: ['EW jammer', 'EW jammer'], shape: 'ring', r: 10, hp: 130, speed: 48, roadMul: 1.5, dmg: 0, jam: 190,
    cost: 400, crew: 2, time: 18, factory: 'armorPlant', vision: 180,
    blurb: 'Disrupts radio-controlled drones inside its radius until they fall. Cannot stop fiber-optic FPVs.' },
  howitzer: { label: ['Howitzer', 'Howitzer'], shape: 'pent', r: 11, hp: 160, speed: 34, roadMul: 1.4, range: 430, minRange: 110, dmg: 95, splash: 42, rof: 5.5,
    cost: 700, crew: 4, time: 28, factory: 'artyDepot', vision: 130, targets: ['inf', 'veh', 'struct'], indirect: true, shellSpeed: 260, ammo: 12,
    blurb: 'Long range, slow reload, splash damage. Needs a recon drone to see its targets. Carries 12 shells: ammunition trucks and the artillery depot refill it. Park it in a wood: in the open a gun is seen from far off, every shot shows it to radar for six seconds, and drones hit it 45% harder.' },
  mlrs: { label: ['Rocket artillery', 'Rocket artillery'], shape: 'wedge', r: 12, hp: 170, speed: 50, roadMul: 1.4, range: 620, minRange: 220, dmg: 55, splash: 38, rof: 14, salvo: 6,
    cost: 1200, crew: 3, time: 36, factory: 'artyDepot', vision: 130, targets: ['inf', 'veh', 'struct'], indirect: true, shellSpeed: 340, ammo: 18,
    blurb: 'Six-rocket salvos across most of the map. Long reload. Carries three salvos; trucks bring more. Fire from a wood and move after every mission.' },
  truck: { label: ['Supply truck', 'Supply truck'], shape: 'truck', r: 9, hp: 80, speed: 70, roadMul: 1.8, dmg: 0, cost: 0, crew: 1, time: 0, factory: null, vision: 120, auto: true,
    blurb: 'Carries funds from headquarters to each town you hold. Drones love them.' },
  defector: { label: ['Russian volunteer squad', 'Russian volunteer squad'], shape: 'band', r: 7, hp: 80, speed: 42, roadMul: 1.3, range: 95, dmg: 8, rof: 0.55,
    cost: 150, crew: 6, time: 0, factory: null, vision: 170, canCapture: true, operator: true, troop: true, targets: ['inf', 'veh', 'struct'], vsStruct: 0.3, vsVehicle: 0.25,
    blurb: 'Russians fighting for Ukraine. They arrive when your conduct toward civilians is clean and you hold ground on their side of the border.' },
  civcar: { label: ['Civilian vehicle', 'Civilian vehicle'], shape: 'car', r: 7, hp: 40, speed: 60, roadMul: 1.8, dmg: 0, cost: 0, crew: 0, time: 0, factory: null, vision: 0, auto: true, civ: true,
    blurb: 'Evacuation buses and family cars moving between towns. Nobody should be shooting at these.' },
  geran: { label: ['Geran-2 (Shahed-136)', 'Geran-2 (Shahed-136)'], shape: 'dart', r: 8, hp: 80, evade: 0.15, speed: 135, kamikaze: true, dmg: 220, splash: 40,
    cost: 300, crew: 0, time: 0, factory: null, vision: 100, air: true, jammable: true, targets: ['struct'], structuresOnly: true, acquire: 900, side: 1,
    blurb: 'Slow and loud with a 50 kg warhead, aimed at power, housing, and factories. Machine guns, interceptors, and air defense all get it.' },
  geran3: { label: ['Geran-3 jet drone', 'Geran-3 jet drone'], shape: 'dart', r: 9, hp: 100, evade: 0.25, speed: 240, kamikaze: true, dmg: 260, splash: 44,
    cost: 900, crew: 0, time: 0, factory: null, vision: 100, air: true, jammable: true, targets: ['struct'], structuresOnly: true, acquire: 900, side: 1, jet: true,
    blurb: 'The turbojet Geran: twice the speed of the piston version, harder to catch, same job. Appears in the later waves.' },
  gerbera: { label: ['Gerbera decoy', 'Gerbera decoy'], shape: 'dart', hollow: true, r: 8, hp: 35, evade: 0.2, speed: 135, kamikaze: true, dmg: 0, splash: 0,
    cost: 60, crew: 0, time: 0, factory: null, vision: 60, air: true, jammable: true, targets: ['struct'], structuresOnly: true, acquire: 900,
    blurb: 'Foam-and-plywood decoy flown with the Gerans to soak up air defense fire.' },
};

export interface StructDef {
  label: string; hp: number; r: number; cost: number; time: number; vision: number;
  produces?: string[]; heatPer?: number; cool?: number; jam?: number; netR?: number; heal?: number; healRate?: number; power?: number; trench?: boolean; range?: number;
}
export const STRUCTS: Record<string, StructDef> = {
  hq: { label: 'Headquarters', hp: 4500, r: 38, cost: 0, time: 0, vision: 260 },
  barracks: { label: 'Barracks', hp: 1000, r: 26, cost: 500, time: 12, vision: 180, produces: ['infantry', 'fireGroup', 'moto', 'merc', 'dprk'] },
  droneWorks: { label: 'Drone works', hp: 1100, r: 28, cost: 700, time: 14, vision: 180, produces: ['fpv', 'fiberFpv', 'mavic', 'interceptor', 'bomber'] },
  launchSite: { label: 'Launch site', hp: 900, r: 24, cost: 600, time: 12, vision: 180, produces: ['fwRecon', 'liutyi', 'lancet', 'molniya'] },
  armorPlant: { label: 'Armor plant', hp: 1500, r: 32, cost: 1000, time: 18, vision: 180, produces: ['tank', 'ifv', 'aa', 'jammer'] },
  artyDepot: { label: 'Artillery depot', hp: 1100, r: 28, cost: 900, time: 16, vision: 180, produces: ['howitzer', 'mlrs'] },
  radar: { label: 'Radar post', hp: 700, r: 18, cost: 300, time: 8, vision: 380 },
  ewStation: { label: 'EW station', hp: 650, r: 18, cost: 450, time: 10, vision: 200, jam: 240 },
  net: { label: 'Anti-drone net', hp: 300, r: 14, cost: 250, time: 8, vision: 80, netR: 95 },
  pump: { label: 'Pumping station', hp: 500, r: 14, cost: 400, time: 10, vision: 120 },
  aidPost: { label: 'Field hospital', hp: 400, r: 14, cost: 350, time: 8, vision: 100, heal: 110, healRate: 0.04 },
  generator: { label: 'Generator set', hp: 300, r: 12, cost: 300, time: 8, vision: 60, power: 15 },
  trench: { label: 'Trench', hp: 300, r: 10, cost: 0, time: 0, vision: 0, trench: true },
};
export const BUILDABLE = ['net', 'generator', 'aidPost', 'radar', 'ewStation', 'barracks', 'droneWorks', 'launchSite', 'armorPlant', 'artyDepot'];
export const CIV_TYPES: Record<string, StructDef> = {
  apartments: { label: 'Apartments', hp: 600, r: 18, cost: 0, time: 0, vision: 0 },
  hospital: { label: 'Hospital', hp: 500, r: 16, cost: 0, time: 0, vision: 0, heal: 140, healRate: 0.06 },
  school: { label: 'School', hp: 400, r: 14, cost: 0, time: 0, vision: 0 },
  power: { label: 'Substation', hp: 450, r: 14, cost: 0, time: 0, vision: 0 },
  market: { label: 'Market', hp: 350, r: 12, cost: 0, time: 0, vision: 0 },
};
// [type, nation (0 Ukrainian, 1 Russian), place, dx, dy]
export const CIV_SITES: [string, number, string, number, number][] = [
  ['apartments', 0, 'Kharkiv', 90, 60], ['apartments', 0, 'Kharkiv', -70, 86], ['hospital', 0, 'Kharkiv', 70, 146], ['school', 0, 'Kharkiv', -140, 126],
  ['power', 0, 'Kharkiv', 150, 126], ['market', 0, 'Kharkiv', 0, 196], ['apartments', 0, 'Kharkiv', 70, -184],
  ['school', 0, 'Derhachi', 30, 30], ['apartments', 0, 'Tsyrkuny', 30, -30], ['school', 0, 'Lyptsi', 50, 40],
  ['hospital', 0, 'Vovchansk', -40, 42], ['apartments', 0, 'Vovchansk', 50, 32], ['apartments', 0, 'Zolochiv', -40, 37], ['hospital', 0, 'Chuhuiv', 0, -38],
  ['apartments', 1, 'Belgorod', -60, -96], ['apartments', 1, 'Belgorod', 60, -96], ['hospital', 1, 'Belgorod', 40, 184], ['school', 1, 'Belgorod', -50, 184],
  ['power', 1, 'Belgorod', 210, -36], ['market', 1, 'Belgorod', -200, -36], ['apartments', 1, 'Razumnoye', 0, 36],
  ['apartments', 1, 'Shebekino', -30, 39], ['school', 1, 'Shebekino', 40, 29], ['school', 1, 'Zhuravlyovka', 40, 33], ['market', 1, 'Maslova Pristan', 0, 31],
];

export interface UpgradeDef { label: string; labelRU?: string; desc: string; cost: number; requires?: string; branch: string; tier: number }
export const UPGRADES: Record<string, UpgradeDef> = {
  auto1: { label: 'Terminal guidance', desc: 'Drones finish their own approach: control range +150, and a drone survives losing its squad long enough to find another', cost: 800, branch: 'Drones', tier: 1 },
  auto2: { label: 'Drone swarm control', desc: 'Each operator in a squad flies 6 drones instead of 3', cost: 1400, requires: 'auto1', branch: 'Drones', tier: 2 },
  auto3: { label: 'Full autonomy', desc: 'Your drones fly themselves like the Russian ones: no squad, no control range', cost: 2200, requires: 'auto2', branch: 'Drones', tier: 3 },
  armorDrone: { label: 'Hardened airframes', desc: 'New drones leave the works with 50% more health', cost: 900, branch: 'Airframes', tier: 1 },
  evasion: { label: 'Evasive flight profiles', desc: 'Your drones dodge 15% more of the shots fired at them', cost: 1200, requires: 'armorDrone', branch: 'Airframes', tier: 2 },
  nightOps: { label: 'Thermal cameras', desc: 'Your drones see 30% farther', cost: 800, requires: 'evasion', branch: 'Airframes', tier: 3 },
  repeaters: { label: 'Signal repeaters', desc: 'FPV and interceptor hunting radius +120', cost: 700, branch: 'Links', tier: 1 },
  relay: { label: 'Relay drones', desc: 'Squad control range +250', cost: 1000, requires: 'repeaters', branch: 'Links', tier: 2 },
  freqHop: { label: 'Frequency hopping', desc: 'Your radio-controlled drones take half the jamming damage', cost: 1400, requires: 'relay', branch: 'Links', tier: 3 },
  aaRange: { label: 'Radar-cued gunnery', desc: 'Fire groups, air defense, and IFV autocannons reach 40 farther against drones', cost: 900, branch: 'Air defense', tier: 1 },
  gunnery: { label: 'Drone gunnery school', desc: 'Your shooters ignore 15% of a drone\'s evasion', cost: 1100, requires: 'aaRange', branch: 'Air defense', tier: 2 },
  ewPlus: { label: 'Stronger jammers', desc: 'Your jammers and EW stations reach 60 farther', cost: 1000, requires: 'gunnery', branch: 'Air defense', tier: 3 },
  cages: { label: 'Anti-drone cages', desc: 'Your vehicles take 35% less damage from drones', cost: 900, branch: 'Ground', tier: 1 },
  ammo: { label: 'Ammunition stocks', desc: 'Your ground units hit 15% harder', cost: 1000, requires: 'cages', branch: 'Ground', tier: 2 },
  shells: { label: 'Extended-range shells', desc: 'Howitzers and rocket artillery reach 90 farther', cost: 900, requires: 'ammo', branch: 'Ground', tier: 3 },
  training: { label: 'Training center', desc: 'Recruits arrive twice as fast', cost: 900, branch: 'People', tier: 1 },
  medevac: { label: 'Medevac and stabilization', desc: 'Hospitals heal twice as fast, and a lost squad or crew loses a quarter of its people instead of half', cost: 900, requires: 'training', branch: 'People', tier: 2 },
  mobilization: { label: 'Mobilization wave', desc: '40 personnel arrive at once', cost: 1200, requires: 'medevac', branch: 'People', tier: 3 },
  logistics: { label: 'Logistics reform', desc: 'Every truck and convoy delivers 50% more', cost: 900, branch: 'Economy', tier: 1 },
  thermal: { label: 'Satellite feeds', desc: 'Every unit and building sees 25% farther', cost: 800, requires: 'logistics', branch: 'Economy', tier: 2 },
  aid: { label: 'Aid package', labelRU: 'War economy', desc: 'Permanent +8 funds per second', cost: 1500, requires: 'thermal', branch: 'Economy', tier: 3 },
};
export const TECH_BRANCHES = ['Drones', 'Airframes', 'Links', 'Air defense', 'Ground', 'People', 'Economy'];
export function upgLabel(team: number, k: string): string { const u = UPGRADES[k]; return team === RU && u.labelRU ? u.labelRU : u.label; }

export const AUTO_SMALL = [1, 2, 4, 8], AUTO_LARGE = [1, 1, 2, 4];
/** drone operators a squad can hold, and drones each operator flies (doubled by Drone swarm control) */
export const OPS_MAX = 4, DRONES_PER_OP = 3;
export const HOTKEYS = ['Z', 'X', 'C', 'V', 'B'];
export const TRUCK_LOAD = 100, TRUCK_PERIOD = 40, TOWN_BUILD_RADIUS = 200, BUILD_RADIUS = 500;
export const FORMATIONS = ['wedge', 'line', 'column', 'ring'] as const;
export type FormationType = typeof FORMATIONS[number];
export const SWARM_CAP = [6, 12, 24, 48];
export const GAS_YIELD = 5;
export const FOOD_BASE = 4, FOOD_PER_FIELD = 6, FUEL_BASE = 3, FUEL_PER_NODE = 6;
export const FUEL_USERS = new Set(['tank', 'ifv', 'aa', 'jammer', 'howitzer', 'mlrs', 'moto', 'liutyi', 'fwRecon']);
export const POWER_BASE = 24, POWER_PER_SUBSTATION = 30, POWER_PER_GENERATOR = 15;
// drones are the killer of troops in the open: cover is the counter, and a trench dug under trees is the best of all
export const COVER: Record<string, { give: number; take: number; drone: number; spot: number }> = {
  trench: { give: 1.1, take: 0.55, drone: 0.25, spot: 110 }, forest: { give: 1.5, take: 0.6, drone: 0.35, spot: 140 },
  urban: { give: 1.2, take: 0.75, drone: 0.45, spot: 220 }, open: { give: 1, take: 1.3, drone: 1.45, spot: 0 },
};
/** extra protection from drones for a trench dug inside a wood (multiplies the trench figure) */
export const TRENCH_IN_FOREST = 0.6;
/** drones are small and agile: extra evasion against fire from other drones */
export const AIR_VS_AIR_EVADE = 0.25;
export const TARGET_WORDS: Record<TargetClass, string> = { inf: 'troops', veh: 'vehicles', struct: 'buildings', air: 'drones' };

// what the troops shout: transliterated for the screen, Cyrillic for the speech voice, indexed [team][kind]
export type BarkKind = 'ack' | 'attack' | 'capture' | 'reply' | 'kill' | 'dig' | 'win' | 'strike' | 'bombard' | 'lost' | 'ops';
export const BARKS: Record<BarkKind, [string[], string[]]> = {
  ack: [['Zrozumilo, vykonuiemo!', 'Pryiniav, rukhaiemosia!', 'Idemo, khloptsi, za mnoiu!', 'Ye, komandyre, vystupaiemo!'], ['Ponyal, vypolnyayu!', 'Prinyal, vydvigayemsya!', 'Poshli, muzhiki, za mnoy!', 'Yest, komandir, vystupayem!']],
  attack: [['Slava Ukraini! Vohon po vorohu!', 'Za voliu Ukrainy, vpered!', 'Volia abo smert!', 'Za Ukrainu, vpered!', 'Trymaiemo stryi, b\'iemo!', 'Kontakt! Vohon!'], ['Ura! Ogon po protivniku!', 'Vperyod, za Rodinu!', 'Derzhim stroy, b\'yom!', 'Kontakt! Ogon!']],
  capture: [['Misto nashe! Slava Ukraini!', 'Prapor pidniato! Ukraina bude vilnoiu!', 'Za voliu Ukrainy! Misto nashe!'], ['Gorod nash! Ura!', 'Flag podnyat! Ura!']],
  reply: [['Heroiam slava!', 'Heroiam slava, brate!'], ['Ura! Ura! Ura!', 'Ura, bratishka!']],
  kill: [['Mynus odyn, prodovzhuiemo!', 'Tsil urazhena!', 'Ye kontakt, vorog znyshchenyi!'], ['Minus odin, rabotayem dalshe!', 'Tsel porazhena!', 'Yest popadaniye, protivnik unichtozhen!']],
  dig: [['Okopuiemos, khloptsi, bo dron ne spyt!', 'Riemo okopy, tut i stoimo!'], ['Okapyvayemsya, muzhiki, dron ne spit!', 'Royem okopy, zdes i stoim!']],
  win: [['Peremoha! Slava Ukraini! Ukraina bude vilnoiu!'], ['Pobeda! Ura!']],
  strike: [['Ptashka pishla na tsil!', 'FPV v roboti, trymaite!'], ['Ptichka poshla na tsel!', 'FPV v rabote, derzhites!']],
  bombard: [['Artyleriia, vohon po koordynatakh!', 'Harmaty pratsiuiut, khovaites!'], ['Artilleriya, ogon po koordinatam!', 'Pushki rabotayut, ukroytes!']],
  lost: [['Vtratyly hrupu, potribna dopomoha!', 'Try-sotyi! Evakuatsiia!'], ['Poteryali gruppu, nuzhna pomoshch!', 'Trekhsotyy! Evakuatsiya!']],
  ops: [['Novi operatory v stroiu!', 'Shche odyn pilot u hrupi!'], ['Novyye operatory v stroyu!', 'Yeshchyo odin pilot v gruppe!']],
};
export const BARKS_TTS: Record<string, string> = {
  'Zrozumilo, vykonuiemo!': 'Зрозуміло, виконуємо!', 'Pryiniav, rukhaiemosia!': 'Прийняв, рухаємося!', 'Idemo, khloptsi, za mnoiu!': 'Ідемо, хлопці, за мною!', 'Ye, komandyre, vystupaiemo!': 'Є, командире, виступаємо!',
  'Slava Ukraini! Vohon po vorohu!': 'Слава Україні! Вогонь по ворогу!', 'Za voliu Ukrainy, vpered!': 'За волю України, вперед!', 'Volia abo smert!': 'Воля або смерть!', 'Ukraina bude vilnoiu!': 'Україна буде вільною!', 'Prapor pidniato! Ukraina bude vilnoiu!': 'Прапор піднято! Україна буде вільною!', 'Za voliu Ukrainy! Misto nashe!': 'За волю України! Місто наше!', 'Peremoha! Slava Ukraini! Ukraina bude vilnoiu!': 'Перемога! Слава Україні! Україна буде вільною!', 'Za Ukrainu, vpered!': 'За Україну, вперед!', 'Trymaiemo stryi, b\'iemo!': 'Тримаємо стрій, б\'ємо!', 'Kontakt! Vohon!': 'Контакт! Вогонь!',
  'Misto nashe! Slava Ukraini!': 'Місто наше! Слава Україні!', 'Prapor pidniato! Slava Ukraini!': 'Прапор піднято! Слава Україні!', 'Heroiam slava!': 'Героям слава!', 'Heroiam slava, brate!': 'Героям слава, брате!',
  'Mynus odyn, prodovzhuiemo!': 'Мінус один, продовжуємо!', 'Tsil urazhena!': 'Ціль уражена!', 'Ye kontakt, vorog znyshchenyi!': 'Є контакт, ворог знищений!',
  'Okopuiemos, khloptsi, bo dron ne spyt!': 'Окопуємось, хлопці, бо дрон не спить!', 'Riemo okopy, tut i stoimo!': 'Риємо окопи, тут і стоїмо!', 'Peremoha! Slava Ukraini!': 'Перемога! Слава Україні!',
  'Ptashka pishla na tsil!': 'Пташка пішла на ціль!', 'FPV v roboti, trymaite!': 'FPV в роботі, тримайте!', 'Artyleriia, vohon po koordynatakh!': 'Артилерія, вогонь по координатах!', 'Harmaty pratsiuiut, khovaites!': 'Гармати працюють, ховайтесь!',
  'Vtratyly hrupu, potribna dopomoha!': 'Втратили групу, потрібна допомога!', 'Try-sotyi! Evakuatsiia!': 'Трьохсотий! Евакуація!', 'Novi operatory v stroiu!': 'Нові оператори в строю!', 'Shche odyn pilot u hrupi!': 'Ще один пілот у групі!',
  'Ponyal, vypolnyayu!': 'Понял, выполняю!', 'Prinyal, vydvigayemsya!': 'Принял, выдвигаемся!', 'Poshli, muzhiki, za mnoy!': 'Пошли, мужики, за мной!', 'Yest, komandir, vystupayem!': 'Есть, командир, выступаем!',
  'Ura! Ogon po protivniku!': 'Ура! Огонь по противнику!', 'Vperyod, za Rodinu!': 'Вперёд, за Родину!', 'Derzhim stroy, b\'yom!': 'Держим строй, бьём!', 'Kontakt! Ogon!': 'Контакт! Огонь!',
  'Gorod nash! Ura!': 'Город наш! Ура!', 'Flag podnyat! Ura!': 'Флаг поднят! Ура!', 'Ura! Ura! Ura!': 'Ура! Ура! Ура!', 'Ura, bratishka!': 'Ура, братишка!',
  'Minus odin, rabotayem dalshe!': 'Минус один, работаем дальше!', 'Tsel porazhena!': 'Цель поражена!', 'Yest popadaniye, protivnik unichtozhen!': 'Есть попадание, противник уничтожен!',
  'Okapyvayemsya, muzhiki, dron ne spit!': 'Окапываемся, мужики, дрон не спит!', 'Royem okopy, zdes i stoim!': 'Роем окопы, здесь и стоим!', 'Pobeda! Ura!': 'Победа! Ура!',
  'Ptichka poshla na tsel!': 'Птичка пошла на цель!', 'FPV v rabote, derzhites!': 'FPV в работе, держитесь!', 'Artilleriya, ogon po koordinatam!': 'Артиллерия, огонь по координатам!', 'Pushki rabotayut, ukroytes!': 'Пушки работают, укройтесь!',
  'Poteryali gruppu, nuzhna pomoshch!': 'Потеряли группу, нужна помощь!', 'Trekhsotyy! Evakuatsiya!': 'Трёхсотый! Эвакуация!', 'Novyye operatory v stroyu!': 'Новые операторы в строю!', 'Yeshchyo odin pilot v gruppe!': 'Ещё один пилот в группе!',
  'Manse!': 'Мансе!',
};
export const BARK_GLOSS: Record<string, string> = {
  'Zrozumilo, vykonuiemo!': 'Understood, on it!', 'Pryiniav, rukhaiemosia!': 'Copy, moving out!', 'Idemo, khloptsi, za mnoiu!': "Let's go, boys, follow me!", 'Ye, komandyre, vystupaiemo!': 'Yes, commander, we move!',
  'Slava Ukraini! Vohon po vorohu!': 'Glory to Ukraine! Fire on the enemy!', 'Za voliu Ukrainy, vpered!': 'For the freedom of Ukraine, forward!', 'Volia abo smert!': 'Freedom or death!', 'Ukraina bude vilnoiu!': 'Ukraine will be free!', 'Prapor pidniato! Ukraina bude vilnoiu!': 'Flag raised! Ukraine will be free!', 'Za voliu Ukrainy! Misto nashe!': 'For the freedom of Ukraine! The town is ours!', 'Peremoha! Slava Ukraini! Ukraina bude vilnoiu!': 'Victory! Glory to Ukraine! Ukraine will be free!', 'Za Ukrainu, vpered!': 'For Ukraine, forward!', "Trymaiemo stryi, b'iemo!": 'Hold the line, hit them!', 'Kontakt! Vohon!': 'Contact! Fire!',
  'Misto nashe! Slava Ukraini!': 'The town is ours! Glory to Ukraine!', 'Prapor pidniato! Slava Ukraini!': 'Flag raised! Glory to Ukraine!', 'Heroiam slava!': 'Glory to the heroes!', 'Heroiam slava, brate!': 'Glory to the heroes, brother!',
  'Mynus odyn, prodovzhuiemo!': 'One down, we go on!', 'Tsil urazhena!': 'Target hit!', 'Ye kontakt, vorog znyshchenyi!': 'Contact, enemy destroyed!',
  'Okopuiemos, khloptsi, bo dron ne spyt!': "Dig in, boys, the drone doesn't sleep!", 'Riemo okopy, tut i stoimo!': 'Digging trenches, here we stand!', 'Peremoha! Slava Ukraini!': 'Victory! Glory to Ukraine!',
  'Ptashka pishla na tsil!': 'The bird is on its way to the target!', 'FPV v roboti, trymaite!': 'FPV at work, hold on!', 'Artyleriia, vohon po koordynatakh!': 'Artillery, fire on the coordinates!', 'Harmaty pratsiuiut, khovaites!': 'Guns working, take cover!',
  'Vtratyly hrupu, potribna dopomoha!': 'We lost a group, we need help!', 'Try-sotyi! Evakuatsiia!': 'Wounded! Medevac!', 'Novi operatory v stroiu!': 'New operators in the ranks!', 'Shche odyn pilot u hrupi!': 'One more pilot in the group!',
  'Ponyal, vypolnyayu!': 'Got it, doing it!', 'Prinyal, vydvigayemsya!': 'Copy, moving out!', 'Poshli, muzhiki, za mnoy!': "Let's go, men, follow me!", 'Yest, komandir, vystupayem!': 'Yes, commander, we move!',
  'Ura! Ogon po protivniku!': 'Hurrah! Fire on the enemy!', 'Vperyod, za Rodinu!': 'Forward, for the Motherland!', "Derzhim stroy, b'yom!": 'Hold the line, hit them!', 'Kontakt! Ogon!': 'Contact! Fire!',
  'Gorod nash! Ura!': 'The town is ours! Hurrah!', 'Flag podnyat! Ura!': 'Flag raised! Hurrah!', 'Ura! Ura! Ura!': 'Hurrah!', 'Ura, bratishka!': 'Hurrah, little brother!',
  'Minus odin, rabotayem dalshe!': 'One down, we work on!', 'Tsel porazhena!': 'Target hit!', 'Yest popadaniye, protivnik unichtozhen!': 'Hit, enemy destroyed!',
  'Okapyvayemsya, muzhiki, dron ne spit!': "Dig in, men, the drone doesn't sleep!", 'Royem okopy, zdes i stoim!': 'Digging trenches, here we stand!', 'Pobeda! Ura!': 'Victory! Hurrah!',
  'Ptichka poshla na tsel!': 'The bird is on its way to the target!', 'FPV v rabote, derzhites!': 'FPV at work, hold on!', 'Artilleriya, ogon po koordinatam!': 'Artillery, fire on the coordinates!', 'Pushki rabotayut, ukroytes!': 'Guns working, take cover!',
  'Poteryali gruppu, nuzhna pomoshch!': 'We lost a group, we need help!', 'Trekhsotyy! Evakuatsiya!': 'Wounded! Medevac!', 'Novyye operatory v stroyu!': 'New operators in the ranks!', 'Yeshchyo odin pilot v gruppe!': 'One more pilot in the group!',
  'Manse!': 'Long live! (Korean)',
};
export const RANK_NAMES = ['Recruit', 'Trained', 'Veteran', 'Elite'];
export const WAVE_COST = 600, WAVE_COOLDOWN = 90;

export const BUILDING_NOTES: Record<string, string> = { hq: 'Lose it and the game ends. Rally point for trucks and convoys. Squads recover morale near it.', barracks: 'Troops: infantry, fire groups, motorcycle groups, foreign fighters, and for Russia North Koreans. Slow to build.', droneWorks: 'Quadcopters in a fraction of a second each, as many as you can pay for and fly.', launchSite: 'Fixed-wing aircraft: the Shark spotter and Liutyi strike drone for Ukraine; the Orlan spotter, Lancet, and Molniya for Russia.', armorPlant: 'Tanks, IFVs, mobile air defense, jammers. Each needs fuel from the gas supply.', artyDepot: 'Howitzers and rocket launchers. Fuel users too.', radar: 'Sees far and shoots nothing. Put your shooters under it.', ewStation: 'Drops radio-controlled drones inside its bubble. Fiber FPVs and frequency hopping get through.', net: 'Catches 85% of the FPVs that fly into it. Bombers and Gerans go over.', aidPost: 'Heals troops within its radius. Place it in a wood behind the line.', generator: 'Charging capacity for 15 more battery drones. Insurance against losing the substation.', pump: 'Part of the pipeline: while any pump is down, gas income and fuel stop. Repair crews rebuild it after the area is quiet.', trench: 'Dug by troops (E). Troops in it take 45% less damage and 75% less from drones (85% less when dug inside a wood), and are seen only within 110. Anyone can use it.' };

export const STRATEGY: [string, string][] = [
  ['The shape of the war', 'Everything on this map is either a drone, something that feeds and flies drones, or something drones are hunting. Nothing on the ground survives in the open for long, so the game is about who sees whom first, who has squads to fly, who has power to charge, and who keeps the roads and pipelines running. Wins come from grinding the enemy economy down and then walking artillery and fiber FPVs onto the headquarters, not from a single charge.'],
  ['Opening', 'Send your five squads to the nearest town at once, Lyptsi as Ukraine or Zhuravlyovka as Russia: towns pay by truck and let you build forward. Put a fire group and a Sting over your substation before the first Geran wave (about four minutes). Queue Mavics before FPVs: you can only hit what you see. Take the contested wheat field in the middle early; food is the first supply line you hit.'],
  ['Squads and drones', 'Until Drone swarm control, one squad flies one drone, so your airborne drone force is capped by your infantry count. Build more drones anyway: extras sit grounded and take off the moment a squad is free. Keep squads in woods, trenches, or towns a few hundred pixels behind the point you want to strike; drones cannot go beyond the squad\'s control range.'],
  ['Power, fuel, food', 'Battery drones need charging capacity: base generators plus your substation plus generator sets. The enemy targets the substation first. Gasoline aircraft and vehicles draw on gas flowing through an intact pipeline. Squads eat: past the wheat line your infantry fight at 60%.'],
  ['Air defense', 'Drones dodge bullets, so guns need volume and research. Jammers and EW stations do not miss: radio drones inside the bubble fall unless they are fiber-optic. Nets catch FPVs over a spot. Stings hunt on their own. Layer them.'],
  ['Ground and cover', 'Drones kill troops in the open: a squad in a field takes 45% extra from every drone strike. Get them into a town (55% less from drones), a wood (65% less, and hidden beyond 140), or a trench (75% less), and dig the trench inside a wood for the best of all (85% less). Infantry in forest also hit 50% harder. Tanks only shoot vehicles and buildings, IFVs are what shoot at troops.'],
  ['Artillery', 'Howitzers reach 430, rockets 620; both need a spotter to be accurate but will fire on a map point blind (Ctrl+right-click or B) with wide scatter. Guns belong in the trees: a battery in a wood is unseen beyond 140, shows on enemy radar for only two seconds after a shot, and takes 65% less from drones. In the open it is seen from anywhere, exposed for six seconds a shot, and drones hit it 45% harder. Lancets exist to kill your guns: keep a Sting and a fire group with the battery.'],
  ['Logistics and trade', 'Supply trucks pay when they reach a town, grain and oil trucks carry from the fields and wells, and every 75 seconds a trade convoy goes to the border and comes back with aid. A squad standing over an unescorted truck takes it and its cargo.'],
  ['Civilians, morale, defectors', 'As Ukraine, every Russian civilian site or vehicle you hit costs support, and support scales your income. Keep support above 70 and hold Shebekino or Zhuravlyovka and Russian volunteers join you. Mercenaries fight well while paid and winning; North Koreans break when Russia is losing.'],
  ['Playing Russia', 'Your drones are autonomous from the start, your Lancets hunt artillery, Molniyas are cheap long reach, and Geran waves cost you nothing. Your weakness is people: defections bleed you, North Koreans break when you lose towns. Take the wheat and gas early, keep the pipeline from Kursk intact.'],
];
