import type { UnitDef, StructDef, FormationType } from './data';

export interface Pt { x: number; y: number }

export type OrderKind = 'idle' | 'move' | 'attack' | 'bombard' | 'dig';
export interface Order { kind: OrderKind; x: number; y: number; target: Entity | null }

export interface Unit {
  id: number; isUnit: true; isStruct?: false; type: string; def: UnitDef; team: number; x: number; y: number; hp: number;
  order: Order; target: Entity | null; cool: number; dead: boolean; seenBy: [boolean, boolean]; angle: number; netsSeen: number[];
  dest: Struct | Site | Pt | null; jamT: number; salvoLeft: number; salvoT: number; salvoAt?: { x: number; y: number; spread: number } | null;
  path?: Pt[] | null; goalKey?: string | null; bestD?: number; stallT?: number; detour?: Pt | null;
  cover?: string; onRoad?: boolean; operator?: Unit | null; drones?: Unit[]; grounded?: boolean; lostT?: number;
  batt?: number; landed?: boolean; rechargeT?: number; grace?: number; digT?: number; morale?: number; shaken?: boolean;
  swarm?: Swarm | null; cargo?: string; src?: Site | null; value?: number; stuck?: number; nation?: number; waitT?: number; idleT?: number; lastHitBy?: number;
  /** confirmed kills (veterancy) */
  kills?: number;
  /** drone operators in a squad (1 to OPS_MAX); each extra one is a person from the pool */
  ops?: number;
  /** rounds left for artillery; ammoTruckId tracks the truck already on its way */
  ammo?: number; ammoTruckId?: number; ammoWarned?: boolean;
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
  scootPending?: boolean; scoot?: Pt | null;
}

export interface Struct {
  id: number; isStruct: true; isUnit?: false; type: string; def: StructDef; team: number; x: number; y: number; r: number; hp: number;
  build: number; queue: string[]; progress: number; rally: Pt; cool: number; dead: boolean; seenBy: [boolean, boolean];
  heat: number; overheated: boolean; civ?: boolean; nation?: number; lastHitBy?: number;
}

export type Entity = Unit | Struct;

/** a town, gas site, or wheat field that troops capture */
export interface Site {
  name: string; x: number; y: number; r: number; owner: number; capTeam: number; cap: number; supplyT: number;
  kind?: 'gas' | 'wheat'; burnT: number; yieldRate?: number; isRes?: boolean;
}

export interface PumpSite { team: number; x: number; y: number; struct: Struct | null; rebuildT: number }

export interface Projectile {
  x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; dmg: number; splash: number; team: number;
  arc: number; rocket: boolean; dead: boolean; srcId?: number; srcType?: string;
  /** a glide bomb or ballistic missile: heavier, ignores trench cover, drawn differently */
  strike?: 'kab' | 'missile';
}
/** a strike announced ahead of impact; interception is rolled when it arrives */
export interface PendingStrike { team: number; kind: 'kab' | 'missile'; x: number; y: number; at: number; targetId?: number }

export interface Effect {
  kind: 'boom' | 'tracer' | 'hit' | 'flash' | 'mark' | 'heal' | 'caught' | 'text' | 'bark' | 'alert';
  x: number; y: number; t: number; dur: number; r?: number; tx?: number; ty?: number; team?: number; red?: boolean; green?: boolean; text?: string; delay?: number;
  /** bark kind, for the voice queue's priorities */
  sub?: string;
}

export type LogKind = 'kill' | 'loss' | 'capture' | 'struct' | 'truck' | 'research' | 'wave' | 'defect' | 'info' | 'weather';
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'snow';
export interface Weather { kind: WeatherKind; until: number; next: WeatherKind; warned: boolean }
/** battle log entry; team is the side the event is about (-1 = both) */
export interface LogEntry { at: number; team: number; kind: LogKind; text: string }

export interface Swarm { id: number; team: number; members: Unit[]; leader: Unit; formation: FormationType; dead: boolean; t: number }

export interface Supply { food: number; fuel: number; power: number; foodUsed: number; foodCap: number; fuelUsed: number; fuelCap: number; powerUsed: number; powerCap: number }

export interface Bot {
  team: number; staging: Pt; spendT: number; attackT: number; shahedT: number; warnT: number; warnName: string; defendT: number; artyT: number;
  pending: string | null; raidT?: number; resT?: number; opsT?: number; coverT?: number; strikeT?: number;
}

export interface Notice { team: number; text: string; at: number }
export interface Scorch { x: number; y: number; r: number }

/** everything a player can ask the simulation to do; ids refer to units/structs owned by the issuing team */
export type Command =
  | { kind: 'move'; ids: number[]; x: number; y: number; formation: FormationType; queue?: boolean }
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
  /** switch the posture of units that have that mode */
  | { kind: 'mode'; ids: number[]; mode: string }
  /** a human pilot's stick input for one drone: fly toward (x, y), attack targetId, or (kamikaze) dive into the point */
  | { kind: 'steer'; id: number; x: number; y: number; targetId?: number; dive?: boolean };
