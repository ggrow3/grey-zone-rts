// Postures: the stances a unit can be switched to (R cycles them, the selection panel shows buttons).
// The first posture in each set is the default. MODE_SET_OF maps a unit type to its set.
// The effect of a posture is wherever the sim checks `g.modeOf(u) === '<key>'`.
export interface ModeDef {
  key: string;
  label: string;
  /** tag drawn under the unit while in this posture; '' for the default */
  short: string;
  desc: string;
}

export const MODE_SETS: Record<string, ModeDef[]> = {
  fpv: [
    {
      key: 'hunt',
      label: 'Hunt',
      short: '',
      desc: 'Dives on its own at anything it sees inside its hunting radius',
    },
    {
      key: 'hold',
      label: 'Hold',
      short: 'HOLD',
      desc: 'Loiters where it is and dives only on your order: right-click a target, press F, or take the sticks',
    },
    {
      key: 'ambush',
      label: 'Ambush',
      short: 'AMBUSH',
      desc: 'Lands where it is with the motors off: no battery drain, seen only within 60, and it pounces on the first enemy that comes within 220. The road ambush',
    },
  ],
  interceptor: [
    {
      key: 'patrol',
      label: 'Patrol',
      short: '',
      desc: 'Hunts enemy drones up to 330 out and chases them',
    },
    {
      key: 'guard',
      label: 'Guard',
      short: 'GUARD',
      desc: 'Stays over its post, engages only within 170, and comes back: point defense for a substation or a battery',
    },
  ],
  recon: [
    {
      key: 'high',
      label: 'High',
      short: '',
      desc: 'Flies high: out of reach of machine guns and sees far, but cannot see into woods and trenches',
    },
    {
      key: 'low',
      label: 'Low',
      short: 'LOW',
      desc: 'Drops to treetop height: sees troops and guns hidden in woods and trenches anywhere in its view (65% as wide), but machine guns and IFVs can reach it',
    },
  ],
  jammer: [
    {
      key: 'emit',
      label: 'Emitting',
      short: '',
      desc: 'Jams enemy radio drones in its bubble; the emission shows it to any enemy radar post within 900',
    },
    {
      key: 'silent',
      label: 'Silent',
      short: 'SILENT',
      desc: 'Jammer off: hidden from radar, jams nothing. Switch on when the drones come',
    },
  ],
  aa: [
    {
      key: 'active',
      label: 'Radar on',
      short: '',
      desc: 'Full range, and it can intercept glide bombs and missiles; the radar shows it to enemy radar posts within 900 (Lancet bait)',
    },
    {
      key: 'passive',
      label: 'Passive',
      short: 'PASSIVE',
      desc: 'Radar off: hidden from radar, range down to 60%, cannot intercept strikes',
    },
  ],
  arty: [
    {
      key: 'static',
      label: 'Stay put',
      short: '',
      desc: 'Fires from where it stands',
    },
    {
      key: 'scoot',
      label: 'Shoot and scoot',
      short: 'SCOOT',
      desc: 'After every fire mission the gun moves 90 to 150 (into trees when it can) before firing again: counter-battery shells land on empty ground',
    },
  ],
  troop: [
    {
      key: 'march',
      label: 'March',
      short: '',
      desc: 'Moves at full speed as a group',
    },
    {
      key: 'creep',
      label: 'Creep',
      short: 'CREEP',
      desc: 'Dispersed in twos and threes at 55% speed: in the open seen only within 150 and drones hit 35% less. How to cross a field alive',
    },
  ],
  armor: [
    {
      key: 'mobile',
      label: 'Mobile',
      short: '',
      desc: 'Moves and fights normally',
    },
    {
      key: 'hullDown',
      label: 'Hull down',
      short: 'HULL DOWN',
      desc: 'Stops in a scrape: takes 30% less damage and reaches 10% farther until it gets a move order',
    },
  ],
  fireGroup: [
    {
      key: 'post',
      label: 'Post',
      short: '',
      desc: 'Stays where it is put',
    },
    {
      key: 'escort',
      label: 'Escort trucks',
      short: 'ESCORT',
      desc: 'Shadows the nearest friendly truck within 700, guns up. Drones love trucks',
    },
  ],
};

export const MODE_SET_OF: Record<string, string> = {
  fpv: 'fpv',
  fiberFpv: 'fpv',
  interceptor: 'interceptor',
  mavic: 'recon',
  jammer: 'jammer',
  aa: 'aa',
  howitzer: 'arty',
  mlrs: 'arty',
  infantry: 'troop',
  merc: 'troop',
  dprk: 'troop',
  defector: 'troop',
  tank: 'armor',
  ifv: 'armor',
  fireGroup: 'fireGroup',
};

export function modesOf(type: string): ModeDef[] | null {
  const s = MODE_SET_OF[type];
  return s ? MODE_SETS[s] : null;
}
