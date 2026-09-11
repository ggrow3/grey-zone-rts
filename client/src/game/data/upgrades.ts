// Research. Each item hangs on a branch at a tier; `requires` is the item below it on the branch.
// The effect of an item is wherever the sim checks `g.upgrades[team].<key>`.
import { RU } from './teams';

export interface UpgradeDef {
  label: string;
  /** Russia's name for it, when the sides call it something different */
  labelRU?: string;
  desc: string;
  cost: number;
  requires?: string;
  branch: string;
  tier: number;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  auto1: {
    label: 'Terminal guidance',
    desc: 'Drones finish their own approach: control range +150, and a drone survives losing its squad long enough to find another',
    cost: 800,
    branch: 'Drones',
    tier: 1,
  },
  auto2: {
    label: 'Drone swarm control',
    desc: 'Each operator in a squad flies 6 drones instead of 3',
    cost: 1400,
    requires: 'auto1',
    branch: 'Drones',
    tier: 2,
  },
  auto3: {
    label: 'Full autonomy',
    desc: 'Your drones fly themselves: no squad, no control range',
    cost: 2200,
    requires: 'auto2',
    branch: 'Drones',
    tier: 3,
  },
  armorDrone: {
    label: 'Hardened airframes',
    desc: 'New drones leave the works with 50% more health',
    cost: 900,
    branch: 'Airframes',
    tier: 1,
  },
  evasion: {
    label: 'Evasive flight profiles',
    desc: 'Your drones dodge 15% more of the shots fired at them',
    cost: 1200,
    requires: 'armorDrone',
    branch: 'Airframes',
    tier: 2,
  },
  nightOps: {
    label: 'Thermal cameras',
    desc: 'Your drones see 30% farther',
    cost: 800,
    requires: 'evasion',
    branch: 'Airframes',
    tier: 3,
  },
  repeaters: {
    label: 'Signal repeaters',
    desc: 'FPV and interceptor hunting radius +120',
    cost: 700,
    branch: 'Links',
    tier: 1,
  },
  relay: {
    label: 'Relay drones',
    desc: 'Squad control range +250',
    cost: 1000,
    requires: 'repeaters',
    branch: 'Links',
    tier: 2,
  },
  freqHop: {
    label: 'Frequency hopping',
    desc: 'Your radio-controlled drones take half the jamming damage',
    cost: 1400,
    requires: 'relay',
    branch: 'Links',
    tier: 3,
  },
  aaRange: {
    label: 'Radar-cued gunnery',
    desc: 'Fire groups, air defense, and IFV autocannons reach 40 farther against drones',
    cost: 900,
    branch: 'Air defense',
    tier: 1,
  },
  gunnery: {
    label: 'Drone gunnery school',
    desc: "Your shooters ignore 15% of a drone's evasion",
    cost: 1100,
    requires: 'aaRange',
    branch: 'Air defense',
    tier: 2,
  },
  ewPlus: {
    label: 'Stronger jammers',
    desc: 'Your jammers and EW stations reach 60 farther',
    cost: 1000,
    requires: 'gunnery',
    branch: 'Air defense',
    tier: 3,
  },
  cages: {
    label: 'Anti-drone cages',
    desc: 'Your vehicles take 35% less damage from drones',
    cost: 900,
    branch: 'Ground',
    tier: 1,
  },
  ammo: {
    label: 'Ammunition stocks',
    desc: 'Your ground units hit 15% harder',
    cost: 1000,
    requires: 'cages',
    branch: 'Ground',
    tier: 2,
  },
  shells: {
    label: 'Extended-range shells',
    desc: 'Howitzers and rocket artillery reach 90 farther',
    cost: 900,
    requires: 'ammo',
    branch: 'Ground',
    tier: 3,
  },
  training: {
    label: 'Training center',
    desc: 'Recruits arrive twice as fast',
    cost: 900,
    branch: 'People',
    tier: 1,
  },
  medevac: {
    label: 'Medevac and stabilization',
    desc: 'Hospitals heal twice as fast, and a lost squad or crew loses a quarter of its people instead of half',
    cost: 900,
    requires: 'training',
    branch: 'People',
    tier: 2,
  },
  mobilization: {
    label: 'Mobilization wave',
    desc: '40 personnel arrive at once',
    cost: 1200,
    requires: 'medevac',
    branch: 'People',
    tier: 3,
  },
  logistics: {
    label: 'Logistics reform',
    desc: 'Every truck and convoy delivers 50% more',
    cost: 900,
    branch: 'Economy',
    tier: 1,
  },
  ugvLogistics: {
    label: 'Robot logistics',
    desc: 'Supply, ammunition, and trade trucks become unmanned ground robots: no driver needed, and a lost truck loses nobody',
    cost: 900,
    requires: 'logistics',
    branch: 'Economy',
    tier: 2,
  },
  thermal: {
    label: 'Satellite feeds',
    desc: 'Every unit and building sees 25% farther',
    cost: 800,
    requires: 'ugvLogistics',
    branch: 'Economy',
    tier: 3,
  },
  aid: {
    label: 'Aid package',
    labelRU: 'War economy',
    desc: 'Permanent +8 funds per second',
    cost: 1500,
    requires: 'thermal',
    branch: 'Economy',
    tier: 4,
  },
  launchRail: {
    label: 'Launch rails',
    desc: 'The drone works builds fixed-wing aircraft: the Shark spotter and Liutyi for Ukraine, the Orlan spotter, Lancet, and Molniya for Russia',
    cost: 600,
    branch: 'Aircraft',
    tier: 1,
  },
  aiIntercept: {
    label: 'AI terminal guidance',
    desc: 'Interceptors find and track their target on their own: they no longer miss the extra quarter of shots that drone-on-drone fire usually does',
    cost: 1100,
    requires: 'launchRail',
    branch: 'Aircraft',
    tier: 2,
  },
  samNet: {
    label: 'Patriot coverage',
    labelRU: 'S-400 coverage',
    desc: 'Your mobile air defense intercepts glide bombs at 65% and ballistic missiles at 60% instead of 35% and 30%',
    cost: 1500,
    requires: 'ewPlus',
    branch: 'Air defense',
    tier: 4,
  },
};

/** the columns of the research tree, left to right */
export const TECH_BRANCHES = ['Drones', 'Aircraft', 'Airframes', 'Links', 'Air defense', 'Ground', 'People', 'Economy'];

export function upgLabel(team: number, k: string): string {
  const u = UPGRADES[k];
  return team === RU && u.labelRU ? u.labelRU : u.label;
}
