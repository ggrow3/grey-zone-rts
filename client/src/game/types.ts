import type { UnitDef, StructDef, FormationType } from './data';

export interface Pt {
  x: number;
  y: number;
}

export type OrderKind = 'idle' | 'move' | 'attack' | 'bombard' | 'dig';
export interface Order {
  kind: OrderKind;
  x: number;
  y: number;
  target: Entity | null;
  /** attack-move: stop and fight anything met on the way, then carry on */
  amove?: boolean;
}

export interface Unit {
  id: number;
  isUnit: true;
  isStruct?: false;
  type: string;
  def: UnitDef;
  team: number;
  x: number;
  y: number;
  hp: number;
  order: Order;
  target: Entity | null;
  cool: number;
  dead: boolean;
  seenBy: [boolean, boolean];
  angle: number;
  netsSeen: number[];
  dest: Struct | Site | Pt | null;
  jamT: number;
  salvoLeft: number;
  salvoT: number;
  salvoAt?: { x: number; y: number; spread: number } | null;
  path?: Pt[] | null;
  goalKey?: string | null;
  bestD?: number;
  stallT?: number;
  detour?: Pt | null;
  cover?: string;
  onRoad?: boolean;
  operator?: Unit | null;
  drones?: Unit[];
  grounded?: boolean;
  lostT?: number;
  batt?: number;
  landed?: boolean;
  rechargeT?: number;
  grace?: number;
  digT?: number;
  morale?: number;
  /** rations carried by a squad (0 to FOOD.rations); food carried by a supply truck */
  rations?: number;
  food?: number;
  shaken?: boolean;
  swarm?: Swarm | null;
  cargo?: string;
  src?: Site | null;
  value?: number;
  stuck?: number;
  nation?: number;
  waitT?: number;
  idleT?: number;
  lastHitBy?: number;
  /** confirmed kills (veterancy) */
  kills?: number;
  /** a gun that cannot fire because a net hangs over it (warned once until it moves out) */
  netBlocked?: boolean;
  /** drone operators in a squad (1 to OPS_MAX); each extra one is a person from the pool */
  ops?: number;
  /** rounds left for artillery; ammoTruckId tracks the truck already on its way */
  ammo?: number;
  ammoTruckId?: number;
  ammoWarned?: boolean;
  /** seconds a firing gun stays exposed to enemy radar */
  revealT?: number;
  /** queued move destinations (Shift+right-click) taken in order after the current move */
  waypoints?: Pt[];
  /** posture chosen by the player (see MODE_SETS); undefined means the type's default */
  mode?: string;
  /** seconds a human pilot's last steer input stays in force */
  pilotT?: number;
  /** a piloted kamikaze drone flying into this point explodes there */
  diveAt?: Pt | null;
  /** an FPV sitting on the ground in ambush, motors off */
  ambushed?: boolean;
  /** the spot a guarding interceptor returns to */
  post?: Pt | null;
  /** shoot-and-scoot: a fire mission was just completed; the point the gun is moving to before it fires again */
  scootPending?: boolean;
  scoot?: Pt | null;
  /** a squad's name, for the log and the panel */
  callsign?: string;
  /** seconds of shaken fire (80%) after a veteran squad died nearby */
  grief?: number;
}

export interface Struct {
  id: number;
  isStruct: true;
  isUnit?: false;
  type: string;
  def: StructDef;
  team: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  build: number;
  queue: string[];
  progress: number;
  rally: Pt;
  cool: number;
  dead: boolean;
  seenBy: [boolean, boolean];
  heat: number;
  overheated: boolean;
  civ?: boolean;
  nation?: number;
  lastHitBy?: number;
  /** grid supply-to-demand ratio this building runs at (0 with no source), and which grid it is on */
  pow?: number;
  grid?: number;
  unpoweredWarned?: boolean;
}

export type Entity = Unit | Struct;

/** a town, gas site, or wheat field that troops capture */
export interface Site {
  name: string;
  x: number;
  y: number;
  r: number;
  owner: number;
  capTeam: number;
  cap: number;
  supplyT: number;
  kind?: 'gas' | 'wheat';
  burnT: number;
  yieldRate?: number;
  isRes?: boolean;
  /** rations stocked in a town by the supply trucks; squads nearby eat from them */
  food?: number;
}

export interface PumpSite {
  team: number;
  x: number;
  y: number;
  struct: Struct | null;
  rebuildT: number;
}

export interface Projectile {
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  dmg: number;
  splash: number;
  team: number;
  arc: number;
  rocket: boolean;
  dead: boolean;
  srcId?: number;
  srcType?: string;
  /** a glide bomb or ballistic missile: heavier, ignores trench cover, drawn differently */
  strike?: 'kab' | 'missile';
}
/** a strike announced ahead of impact; interception is rolled when it arrives */
export interface PendingStrike {
  team: number;
  kind: 'kab' | 'missile';
  x: number;
  y: number;
  at: number;
  targetId?: number;
}

export interface Effect {
  kind: 'boom' | 'tracer' | 'hit' | 'flash' | 'mark' | 'heal' | 'caught' | 'text' | 'bark' | 'alert';
  x: number;
  y: number;
  t: number;
  dur: number;
  r?: number;
  tx?: number;
  ty?: number;
  team?: number;
  red?: boolean;
  green?: boolean;
  text?: string;
  delay?: number;
  /** bark kind, for the voice queue's priorities */
  sub?: string;
}

export type LogKind =
  'kill' | 'loss' | 'capture' | 'struct' | 'truck' | 'research' | 'wave' | 'defect' | 'info' | 'weather';
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'snow';
export interface Weather {
  kind: WeatherKind;
  until: number;
  next: WeatherKind;
  warned: boolean;
}
/** battle log entry; team is the side the event is about (-1 = both) */
export interface LogEntry {
  at: number;
  team: number;
  kind: LogKind;
  text: string;
}
/** something that happened to a side somewhere on the map: pinged on the minimap, Backspace jumps to the latest */
export interface Alert {
  team: number;
  x: number;
  y: number;
  at: number;
  text: string;
}
/** an enemy column on its way: the warned side sees an arrow from where it set out toward where it is going */
export interface Incoming {
  team: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
  at: number;
  name: string;
}
/** an optional skirmish goal in progress for one side */
export interface Mission {
  key: string;
  progress: number;
  base: number;
  startedAt: number;
  done: boolean;
}

export interface Swarm {
  id: number;
  team: number;
  members: Unit[];
  leader: Unit;
  formation: FormationType;
  dead: boolean;
  t: number;
}

export interface Supply {
  /** the share of squads that still have rations (0 to 1) */
  food: number;
  fuel: number;
  power: number;
  /** the headquarters larder, its change per second, and the squads out of rations */
  foodStock: number;
  foodRate: number;
  hungry: number;
  fuelUsed: number;
  fuelCap: number;
  powerUsed: number;
  powerCap: number;
}

export interface Bot {
  team: number;
  staging: Pt;
  spendT: number;
  attackT: number;
  shahedT: number;
  warnT: number;
  warnName: string;
  defendT: number;
  artyT: number;
  pending: string | null;
  raidT?: number;
  resT?: number;
  opsT?: number;
  coverT?: number;
  strikeT?: number;
  /** ambush FPVs on the roads, road nets by held towns */
  ambushT?: number;
  netT?: number;
  netted?: string[];
  /** where the announced column is going */
  warnAt?: Pt;
  /** purchases paused while it saves for a road net */
  saving?: boolean;
  /** the personality rolled for this game (see rollTraits in bot.ts) */
  traits?: BotTraits;
}

/** what makes one game's bot differ from the next: rolled from the seeded generator on its first turn */
export interface BotTraits {
  /** multiplies the force it wants before a sortie: under 1 attacks early and often, over 1 masses up */
  patience: number;
  /** chance it goes for the nearest objective rather than one of the next two */
  focus: number;
  /** per-unit multipliers on the shopping list: a drone-heavy, armor-heavy, or infantry-heavy commander */
  taste: Record<string, number>;
  /** multiplies the pauses between raids, strikes, and research: under 1 is a busier commander */
  tempo: number;
  /** how far from the exact spot its columns stop */
  scatter: number;
  /** the arm it leans on this game: guns, air, armor, infantry, or electronic warfare */
  doctrine: 'guns' | 'air' | 'armor' | 'infantry' | 'ew';
}

export interface Notice {
  team: number;
  text: string;
  at: number;
}
export interface Scorch {
  x: number;
  y: number;
  r: number;
}

/** everything a player can ask the simulation to do; ids refer to units/structs owned by the issuing team */
export type Command =
  | {
      kind: 'move';
      ids: number[];
      x: number;
      y: number;
      formation: FormationType;
      queue?: boolean;
      attackMove?: boolean;
    }
  | { kind: 'attack'; ids: number[]; targetId: number }
  | { kind: 'bombard'; ids: number[]; x: number; y: number }
  | { kind: 'dig'; ids: number[] }
  | { kind: 'strike'; ids: number[] }
  | { kind: 'swarm'; ids: number[]; formation: FormationType }
  | { kind: 'swarmFormation'; swarmId: number; formation: FormationType }
  | { kind: 'rally'; ids: number[]; x: number; y: number }
  | { kind: 'place'; type: string; x: number; y: number }
  | { kind: 'enqueue'; facId: number; type: string }
  | { kind: 'cancel'; facId: number; index: number }
  | { kind: 'upgrade'; key: string }
  | { kind: 'wave' }
  | { kind: 'ops'; ids: number[]; delta: 1 | -1 }
  | { kind: 'kab'; x: number; y: number }
  | { kind: 'deep' }
  | { kind: 'iskander'; targetId: number }
  /** every airborne battery drone flies home for fresh batteries (Home) */
  | { kind: 'recall' }
  /** switch the posture of units that have that mode */
  | { kind: 'mode'; ids: number[]; mode: string }
  /** a human pilot's stick input for one drone: fly toward (x, y), attack targetId, or (kamikaze) dive into the point */
  | { kind: 'steer'; id: number; x: number; y: number; targetId?: number; dive?: boolean };
