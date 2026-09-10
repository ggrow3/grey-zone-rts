// The Grey Zone simulation. Pure and deterministic: no DOM, no Math.random, no player-specific branches.
// The same Game, fed the same seed and the same per-turn commands, produces the same state on every client.
import { UA, RU, UNITS, STRUCTS, CIV_TYPES, CIV_SITES, UPGRADES, COVER, FUEL_USERS, TRUCK_LOAD, TRUCK_PERIOD, TOWN_BUILD_RADIUS, BUILD_RADIUS,
  AUTO_SMALL, AUTO_LARGE, SWARM_CAP, GAS_YIELD, FOOD_BASE, FOOD_PER_FIELD, FUEL_BASE, FUEL_PER_NODE, POWER_BASE, POWER_PER_SUBSTATION, POWER_PER_GENERATOR, upgLabel,
  BARKS, WAVE_COST, WAVE_COOLDOWN, TEAMS, OPS_MAX, DRONES_PER_OP, TRENCH_IN_FOREST, AIR_VS_AIR_EVADE, DIG_TIME, WEATHER_TEXT, STRIKES, modesOf, PILOT, unitPoints, structPoints, SCORE } from './data';
import type { UnitDef, FormationType, TargetClass, BarkKind } from './data';
import { W, H, H_LAND, geo, TOWNS, RESOURCES, PIPELINES, placePos, KHARKIV, BELGOROD, nearestPlace } from './map';
import { Rng } from './rng';
import { hyp, dist, clamp, dsin, dcos, datan2 } from './dmath';
import { getTerrain, Terrain } from './terrain';
import type { Unit, Struct, Entity, Site, PumpSite, Projectile, Effect, Swarm, Supply, Bot, Notice, Scorch, Command, Order, Pt, LogEntry, LogKind, Weather, WeatherKind, PendingStrike } from './types';
import { updateBot, makeBot } from './bot';

export const DT = 1 / 60;

export interface GameOptions {
  seed: number;
  /** which teams are driven by the built-in bot */
  bots: [boolean, boolean];
  /** enemy strength multiplier for bot teams (0.5 easy, 0.7 normal, 0.95 hard) */
  difficulty: number;
  /** bot does not launch attacks or raids (teaching levels) */
  passive?: boolean;
  /** no Geran waves (teaching levels) */
  noGerans?: boolean;
  /** level script run once after the standard setup (solo games only) */
  scenario?: (g: Game) => void;
}

export const HOLD_TO_WIN = 180;
const ADJ = ['Ukrainian', 'Russian'];
export function rankOf(u: Unit): number { return Math.min(3, Math.floor((u.kills || 0) / 2)); }

export const IDLE = (): Order => ({ kind: 'idle', x: 0, y: 0, target: null });
export const MOVE = (x: number, y: number): Order => ({ kind: 'move', x, y, target: null });
export const ATTACK = (t: Entity): Order => ({ kind: 'attack', x: 0, y: 0, target: t });

export class Game {
  rng: Rng; terrain: Terrain;
  units: Unit[] = []; structs: Struct[] = []; projectiles: Projectile[] = []; effects: Effect[] = [];
  depots: Site[] = []; resources: Site[] = []; pumpSites: PumpSite[] = [];
  funds = [1200, 300];
  upgrades: [Record<string, boolean>, Record<string, boolean>] = [{}, {}];
  stats = { built: [0, 0], lost: [0, 0], drones: [0, 0], deliveries: [0, 0], peopleLost: [0, 0], shotDown: [0, 0], kills: [0, 0],
    jammed: [0, 0], waves: [0, 0], structsKilled: [0, 0], trucksKilled: [0, 0], vets: [0, 0], killsOf: [{}, {}] as [Record<string, number>, Record<string, number>],
    kabs: [0, 0], intercepted: [0, 0], refineries: 0, missiles: 0,
    /** points: kills and captures scaled by what the target cost, civilian harm taken away */
    score: [0, 0], friendlyFire: [0, 0] };
  /** strikes from beyond the map: cooldowns, pending impacts, burning refineries (expiry times) */
  kabT = [0, 0]; missileT = 0; deepT = 0; strikes: PendingStrike[] = []; refineryHits: number[] = []; deepPending: { at: number; hit: boolean } | null = null;
  /** ids registered by a level scenario so objectives can find what it placed */
  tags: Record<string, number> = {};
  /** seconds each team has held every town (victory at HOLD_TO_WIN) */
  holdT = [0, 0]; holdWarned = [0, 0];
  /** cooldown of the Russian Geran wave command */
  waveT = 0;
  ammoT = 0;
  log: LogEntry[] = [];
  private barkN = 0; private lastBark: Record<string, number> = {};
  support = 100;
  people = [{ total: 70 }, { total: 70 }];
  civ = { lost: [0, 0], harmedByUA: 0, defectors: 0, carsKilled: [0, 0] };
  defectT = 0; volunteerT = 0; carT = 0;
  /** vision circles per team; a `deep` circle (a Mavic flying low) sees into woods and trenches out to its full radius */
  vision: { x: number; y: number; r: number; deep?: boolean }[][] = [[], []];
  gameTime = 0; gameOver = false; winner = -1;
  /** the weather front over the whole map; fronts roll in on their own */
  weather: Weather = { kind: 'clear', until: 150, next: 'clear', warned: false };
  swarms: Swarm[] = [];
  tradeT = [30, 45]; tradeTotal = [0, 0]; captured = [0, 0];
  supply: Supply[] = [
    { food: 1, fuel: 1, power: 1, foodUsed: 0, foodCap: 0, fuelUsed: 0, fuelCap: 0, powerUsed: 0, powerCap: 0 },
    { food: 1, fuel: 1, power: 1, foodUsed: 0, foodCap: 0, fuelUsed: 0, fuelCap: 0, powerUsed: 0, powerCap: 0 },
  ];
  nextId = 1;
  isBot: [boolean, boolean]; bots: (Bot | null)[] = [null, null]; difficulty: number;
  botPassive: boolean; noGerans: boolean;
  notices: Notice[] = []; scorches: Scorch[] = [];
  private byId = new Map<number, Entity>();

  constructor(opts: GameOptions) {
    this.rng = new Rng(opts.seed);
    this.terrain = getTerrain();
    this.isBot = opts.bots; this.difficulty = opts.difficulty;
    this.botPassive = !!opts.passive; this.noGerans = !!opts.noGerans;
    this.setup();
    if (opts.scenario) { opts.scenario(this); this.computeVision(); this.updateSupply(); }
  }

  // ---------------------------------------------------------------- scenario helpers (levels)
  spawn(type: string, team: number, x: number, y: number, order?: Order): Unit {
    const u = this.makeUnit(type, team, x, y);
    if (order) u.order = order;
    if (this.needsOperator(u.def, team)) { if (!this.relink(u)) { u.grounded = true; u.order = IDLE(); } }
    this.units.push(u); return u;
  }
  capture(name: string, team: number) { const d = this.site(name); d.owner = team; d.cap = 0; d.capTeam = -1; d.supplyT = 6; }
  build(type: string, team: number, x: number, y: number): Struct { const s = this.makeStruct(type, team, x, y, true); this.structs.push(s); return s; }
  grant(team: number, key: string) { this.upgrades[team][key] = true; }
  /** a scenario takes a building off the map without an explosion */
  removeStruct(s: Struct) { s.dead = true; this.byId.delete(s.id); this.structs = this.structs.filter(x => x !== s); }
  removeUnit(u: Unit) { u.dead = true; this.byId.delete(u.id); this.units = this.units.filter(x => x !== u); }
  site(name: string): Site { const d = this.depots.concat(this.resources).find(x => x.name === name); if (!d) throw new Error('no site ' + name); return d; }

  // ---------------------------------------------------------------- barks and battle log
  /** a shout from a unit; throttled per team and kind on game time, phrase chosen by a plain counter so cosmetics never touch the RNG */
  bark(kind: BarkKind, u: Entity, delay?: number) {
    const team = u.team; if (team < 0) return;
    const key = team + ':' + kind, gap = kind === 'ack' ? 2 : kind === 'attack' ? 2.5 : kind === 'kill' ? 3 : kind === 'lost' ? 4 : kind === 'strike' || kind === 'bombard' ? 3 : 0;
    if (gap && this.lastBark[key] !== undefined && this.gameTime - this.lastBark[key] < gap) return;
    this.lastBark[key] = this.gameTime;
    const table = (u.isUnit && u.type === 'dprk') ? ['Manse!'] : BARKS[kind][team as 0 | 1];
    const text = table[this.barkN++ % table.length];
    this.effects.push({ kind: 'bark', x: u.x, y: u.y, t: 0, dur: 2.6 + (delay || 0), team, text, delay, sub: kind });
  }
  addLog(team: number, kind: LogKind, text: string) { this.log.push({ at: this.gameTime, team, kind, text }); if (this.log.length > 200) this.log.shift(); }
  private nearestTroop(team: number, x: number, y: number, maxD: number): Unit | null {
    let best: Unit | null = null, bd = maxD;
    for (const o of this.units) { if (o.dead || o.team !== team || !o.def.troop) continue; const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  // ---------------------------------------------------------------- helpers
  rand(a: number, b: number): number { return this.rng.range(a, b); }
  notify(team: number, text: string) { this.notices.push({ team, text, at: this.gameTime }); }
  drainNotices(team: number): string[] { const out = this.notices.filter(n => n.team === team || n.team < 0).map(n => n.text); this.notices = []; return out; }
  find(id: number): Entity | undefined { const e = this.byId.get(id); return e && !e.dead ? e : undefined; }
  visMul(team: number): number { return this.upgrades[team].thermal ? 1.25 : 1; }
  rangeOf(u: Unit): number {
    let r = u.def.range || 0; if (u.def.indirect && this.upgrades[u.team].shells) r += 90; if (!u.def.air && u.def.targets && u.def.targets.includes('air') && this.upgrades[u.team].aaRange) r += 40;
    const m = this.modeOf(u); if (m === 'passive') r *= 0.6; else if (m === 'hullDown') r *= 1.1;
    return r;
  }
  teamMul(team: number): number { return this.isBot[team] ? this.difficulty * (1 + this.gameTime / 1800) : 1; }
  pipelineIntact(team: number): boolean { return this.pumpSites.filter(ps => ps.team === team).every(ps => ps.struct && !ps.struct.dead && ps.struct.build >= 1); }
  gasIncome(team: number): number { return this.pipelineIntact(team) ? this.resources.filter(r => r.kind === 'gas' && r.owner === team).reduce((a, r) => a + (r.yieldRate || 0), 0) : 0; }
  wheatHeld(team: number): number { return this.resources.filter(r => r.kind === 'wheat' && r.owner === team && r.burnT <= 0).length; }
  income(team: number): number {
    if (team === RU) return (12 + this.gasIncome(RU)) * this.teamMul(RU) * Math.pow(STRIKES.deep.incomeMul, this.refineriesBurning());
    return Math.max(4, 12 * (0.4 + 0.6 * this.support / 100) - Math.min(6, this.civ.lost[0] * 0.5) + (this.upgrades[UA].aid ? 8 : 0)) + this.gasIncome(UA);
  }
  expectedIncome(team: number): number { return this.income(team) + this.depots.filter(d => d.owner === team).length * TRUCK_LOAD / TRUCK_PERIOD * this.teamMul(team); }
  upgAvailable(team: number, key: string): boolean { const u = UPGRADES[key]; return !this.upgrades[team][key] && (!u.requires || !!this.upgrades[team][u.requires]); }
  logiMul(team: number): number { return this.upgrades[team].logistics ? 1.5 : 1; }
  autoTier(team: number): number { return this.upgrades[team].auto3 ? 3 : this.upgrades[team].auto2 ? 2 : this.upgrades[team].auto1 ? 1 : 0; }
  /** drones one operator flies; a squad's capacity is that times its operators */
  opCap(team: number): number { return this.upgrades[team].auto2 ? DRONES_PER_OP * 2 : DRONES_PER_OP; }
  opCapOf(op: Unit): number { return (op.ops || 1) * this.opCap(op.team); }
  typeCount(team: number, type: string): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead && u.type === type) n++;
    for (const st of this.structs) if (st.team === team && !st.dead && st.queue) for (const q of st.queue) if (q === type) n++;
    return n;
  }
  moraleMul(u: Unit): number { return u.def.morale ? 0.5 + 0.5 * (u.morale === undefined ? 100 : u.morale) / 100 : 1; }
  /** the unit's current posture: its chosen mode if the type has one, else the type's default, else '' */
  modeOf(u: Unit): string { const m = modesOf(u.type); if (!m) return ''; return u.mode && m.some(x => x.key === u.mode) ? u.mode : m[0].key; }
  /** a recon drone flying high is out of reach of machine guns; a Mavic in Low mode is not */
  isHigh(u: Unit): boolean { return !!u.def.highAlt && this.modeOf(u) !== 'low'; }
  /** a human has the sticks of this drone right now */
  piloted(u: Unit): boolean { return (u.pilotT || 0) > 0; }
  /** where a shoot-and-scoot gun displaces to after a fire mission: the nearest wood a little way off, else a random spot */
  scootPoint(u: Unit): Pt {
    let best: Pt | null = null, bd = Infinity;
    for (const f of this.terrain.forestPx) { const dd = dist(f, u); if (dd > 70 && dd < 240 && dd < bd) { bd = dd; best = f; } }
    const a = this.rand(0, Math.PI * 2), r = this.rand(90, 150);
    const p = best ? { x: best.x + this.rand(-16, 16), y: best.y + this.rand(-16, 16) } : { x: u.x + dcos(a) * r, y: u.y + dsin(a) * r };
    return { x: clamp(p.x, 20, W - 20), y: clamp(p.y, 20, H_LAND - 20) };
  }
  /** a jammer that is emitting or an air-defense radar that is switched on shows on enemy radar posts */
  emitting(u: Unit): boolean { return (!!u.def.jam && this.modeOf(u) !== 'silent') || (u.type === 'aa' && this.modeOf(u) === 'active'); }
  /** Russian drones are automated from the start; Ukrainian drones need a squad until Full autonomy */
  needsOperator(def: UnitDef, team: number): boolean { if (def.tether) return true; return !!def.operated && team === UA && this.autoTier(UA) < 3; }
  operatorsOf(team: number): Unit[] { return this.units.filter(u => u.team === team && !u.dead && u.def.operator); }
  linkRange(u: Unit): number { return (u.def.link || 650) + (this.upgrades[u.team].auto1 ? 150 : 0) + (this.upgrades[u.team].relay ? 250 : 0); }
  droneCount(op: Unit): number { return op.drones ? op.drones.filter(d => !d.dead).length : 0; }
  freeSlots(team: number): number { let n = 0; for (const op of this.operatorsOf(team)) n += Math.max(0, this.opCapOf(op) - this.droneCount(op)); return n; }
  linkDrone(u: Unit, op: Unit) { u.operator = op; if (!op.drones) op.drones = []; op.drones.push(u); }
  landingSpot(u: Unit): Entity | null {
    if (u.operator && !u.operator.dead) return u.operator;
    let best: Struct | null = null, bd = Infinity;
    for (const st of this.structs) {
      if (st.dead || st.team !== u.team) continue;
      if (!(st.type === 'hq' || st.type === 'droneWorks' || st.type === 'launchSite')) continue;
      const dd = dist(u, st); if (dd < bd) { bd = dd; best = st; }
    }
    return best;
  }
  crashDrone(u: Unit, why: string) { this.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.5 }); this.notify(u.team, 'Drone lost: ' + why); this.killUnit(u, true); }
  relink(u: Unit): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const op of this.operatorsOf(u.team)) {
      if (this.droneCount(op) >= this.opCapOf(op)) continue;
      const dd = dist(u, op); if (dd < 900 && dd < bd) { bd = dd; best = op; }
    }
    if (best) this.linkDrone(u, best);
    return best;
  }
  inLink(u: Unit, t: Pt): boolean { return !this.needsOperator(u.def, u.team) || !u.operator || u.operator.dead || dist(t, u.operator) <= this.linkRange(u); }
  crewOf(def: UnitDef, team: number): number { if (!def.crew) return 0; if (!def.air) return def.crew; return def.crew / (def.large ? AUTO_LARGE : AUTO_SMALL)[this.autoTier(team)]; }
  busyPeople(team: number): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead) n += this.crewOf(u.def, team) + (u.def.operator ? (u.ops || 1) - 1 : 0);
    for (const st of this.structs) if (st.team === team && !st.dead && st.queue) for (const q of st.queue) n += this.crewOf(UNITS[q], team);
    return n;
  }
  freePeople(team: number): number { return this.people[team].total - this.busyPeople(team); }
  crewLabel(def: UnitDef, team: number): string { const c = this.crewOf(def, team); if (!c) return ''; return def.air ? (c < 1 ? '1 operator per ' + Math.round(1 / c) : c + (c > 1 ? ' operators' : ' operator')) : c + ' crew'; }
  foodMul(team: number): number { return team >= 0 ? 0.6 + 0.4 * this.supply[team].food : 1; }
  fuelMul(u: Unit): number { return u.team >= 0 && FUEL_USERS.has(u.type) ? 0.35 + 0.65 * this.supply[u.team].fuel : 1; }
  inVision(team: number, x: number, y: number): boolean {
    const list = this.vision[team];
    for (let i = 0; i < list.length; i++) { const c = list[i]; const dx = c.x - x, dy = c.y - y; if (dx * dx + dy * dy <= c.r * c.r) return true; }
    return false;
  }
  inVisionClose(team: number, x: number, y: number, maxD: number): boolean {
    const list = this.vision[team];
    for (let i = 0; i < list.length; i++) { const c = list[i]; if (hyp(c.x - x, c.y - y) <= (c.deep ? c.r : Math.min(maxD, c.r))) return true; }
    return false;
  }
  canSee(src: Unit, t: Entity): boolean { return !!t.isStruct || t.seenBy[src.team]; }
  trenchAt(x: number, y: number): boolean { return this.structs.some(st => !st.dead && st.def.trench && hyp(st.x - x, st.y - y) <= 28); }
  hq(team: number): Struct | undefined { return this.structs.find(s => s.team === team && s.type === 'hq' && !s.dead); }
  swarmOf(u: Unit): Swarm | null { return u.swarm && !u.swarm.dead ? u.swarm : null; }
  expandSwarms(list: Unit[]): Unit[] {
    const out = list.slice();
    for (const u of list) { const sw = this.swarmOf(u); if (sw) for (const m of sw.members) if (!m.dead && !out.includes(m)) out.push(m); }
    return out;
  }

  makeUnit(type: string, team: number, x: number, y: number): Unit {
    const def = UNITS[type];
    const u: Unit = { id: this.nextId++, isUnit: true, type, def, team, x, y, hp: def.hp * (def.air && team >= 0 && this.upgrades[team].armorDrone ? 1.5 : 1),
      order: IDLE(), target: null, cool: this.rng.next() * 0.5, dead: false, seenBy: [team === UA, team === RU],
      angle: team === UA ? -Math.PI / 2 : Math.PI / 2, netsSeen: [], dest: null, jamT: 0, salvoLeft: 0, salvoT: 0, kills: 0 };
    if (def.ammo) u.ammo = def.ammo;
    if (def.operator) u.ops = 1;
    this.byId.set(u.id, u);
    return u;
  }
  makeStruct(type: string, team: number, x: number, y: number, built: boolean): Struct {
    const def = STRUCTS[type];
    const s: Struct = { id: this.nextId++, isStruct: true, type, def, team, x, y, r: def.r, hp: built ? def.hp : def.hp * 0.1, build: built ? 1 : 0,
      queue: [], progress: 0, rally: { x, y: y + (team === UA ? -140 : 140) }, cool: 0, dead: false, seenBy: [true, true], heat: 0, overheated: false };
    this.byId.set(s.id, s);
    return s;
  }
  makeCiv(type: string, nation: number, x: number, y: number): Struct {
    const def = CIV_TYPES[type];
    const s: Struct = { id: this.nextId++, isStruct: true, civ: true, type, def, nation, team: -1, x, y, r: def.r, hp: def.hp, build: 1, queue: [], progress: 0,
      rally: { x, y }, cool: 0, dead: false, seenBy: [true, true], lastHitBy: -1, heat: 0, overheated: false };
    this.byId.set(s.id, s);
    return s;
  }

  // ---------------------------------------------------------------- setup
  private setup() {
    this.depots = TOWNS.map(([name, lat, lon]) => { const p = geo(lat, lon); return { name, x: p.x, y: p.y, r: 45, owner: -1, capTeam: -1, cap: 0, supplyT: this.rand(8, 20), burnT: 0 }; });
    this.resources = RESOURCES.map(([kind, name, lat, lon, owner]) => { const p = geo(lat, lon); return { kind, name, x: p.x, y: p.y, r: kind === 'wheat' ? 58 : 40, owner, capTeam: -1, cap: 0, burnT: 0, supplyT: this.rand(10, 40), yieldRate: name.includes('depot') ? GAS_YIELD * 2.4 : GAS_YIELD, isRes: true }; });
    for (const pl of PIPELINES) for (const idx of pl.pumps) { const p = geo(pl.pts[idx][0], pl.pts[idx][1]); this.pumpSites.push({ team: pl.team, x: p.x, y: p.y, struct: null, rebuildT: 0 }); }
    for (const ps of this.pumpSites) { ps.struct = this.makeStruct('pump', ps.team, ps.x, ps.y, true); this.structs.push(ps.struct); }

    const kh = KHARKIV, bg = BELGOROD;
    for (const T of [UA, RU]) if (this.isBot[T]) this.bots[T] = makeBot(T, T === RU ? { x: bg.x, y: bg.y + 230 } : { x: kh.x, y: kh.y - 230 });
    const S = (type: string, team: number, x: number, y: number) => this.structs.push(this.makeStruct(type, team, x, y, true));
    S('hq', UA, kh.x, kh.y); S('barracks', UA, kh.x - 100, kh.y - 96); S('droneWorks', UA, kh.x + 110, kh.y - 104); S('armorPlant', UA, kh.x - 230, kh.y + 40);
    S('artyDepot', UA, kh.x + 200, kh.y + 30); S('launchSite', UA, kh.x + 260, kh.y - 20); S('radar', UA, kh.x - 200, kh.y - 40); S('radar', UA, kh.x + 205, kh.y - 60);
    this.units.push(this.makeUnit('aa', UA, kh.x - 60, kh.y - 260));
    for (let i = 0; i < 2; i++) this.units.push(this.makeUnit('fireGroup', UA, kh.x + 40 + i * 40, kh.y - 260));
    S('ewStation', UA, kh.x, kh.y - 130);
    for (let i = 0; i < 5; i++) this.units.push(this.makeUnit('infantry', UA, kh.x - 68 + i * 34, kh.y - 200));
    this.units.push(this.makeUnit('ifv', UA, kh.x, kh.y - 240));

    S('hq', RU, bg.x, bg.y); S('droneWorks', RU, bg.x - 140, bg.y + 94); S('armorPlant', RU, bg.x + 140, bg.y + 84); S('artyDepot', RU, bg.x - 110, bg.y - 46);
    S('barracks', RU, bg.x + 110, bg.y - 46); S('launchSite', RU, bg.x - 260, bg.y + 20); S('radar', RU, bg.x - 200, bg.y + 40); S('radar', RU, bg.x + 205, bg.y + 60);
    for (let i = 0; i < 2; i++) this.units.push(this.makeUnit('fireGroup', RU, bg.x - 40 + i * 40, bg.y + 300));
    S('ewStation', RU, bg.x, bg.y + 130);
    for (const T of [UA, RU]) { const b = this.bots[T]; if (b) for (const s of this.structs) if (s.team === T) s.rally = { x: b.staging.x + this.rand(-80, 80), y: b.staging.y + this.rand(-50, 50) }; }
    for (const [type, nation, place, dx, dy] of CIV_SITES) { const c = placePos(place); this.structs.push(this.makeCiv(type, nation, c.x + dx, c.y + dy)); }
    for (let i = 0; i < 3; i++) { this.spawnCivCar(0); this.spawnCivCar(1); }
    for (let i = 0; i < 5; i++) this.units.push(this.makeUnit('infantry', RU, bg.x - 80 + i * 40, bg.y + 224 + this.rand(-30, 30)));
    this.units.push(this.makeUnit('ifv', RU, bg.x, bg.y + 264));
    this.units.push(this.makeUnit('aa', RU, bg.x, bg.y + 184));
    this.computeVision(); this.updateSupply();
  }

  // ---------------------------------------------------------------- simulation
  tick(dt: number) {
    if (this.gameOver) return;
    this.gameTime += dt;
    this.updateWeather();
    this.funds[UA] += this.income(UA) * dt;
    this.funds[RU] += this.income(RU) * dt;
    for (const T of [UA, RU]) {
      const towns = this.depots.filter(d => d.owner === T).length;
      this.people[T].total = Math.min(200, this.people[T].total + (1 / 15 + towns / 60 + this.wheatHeld(T) * 1.5 / 60) * (this.upgrades[T].training ? 2 : 1) * (this.isBot[T] ? this.difficulty : 1) * this.supply[T].food * dt);
    }
    this.computeVision();
    this.updateSupply();
    this.updateDepots(dt);
    this.updateJamming(dt);
    this.updateNets(dt);
    this.updateCivilians(dt);
    this.updateSwarms(dt);
    this.updateHealing(dt);
    this.updateTrade(dt);
    this.updateMorale(dt);
    for (const s of this.structs) this.updateStruct(s, dt);
    for (const u of this.units) this.updateUnit(u, dt);
    this.separate();
    for (const p of this.projectiles) this.updateProjectile(p, dt);
    for (const e of this.effects) e.t += dt;
    this.updateAmmo(dt);
    this.updateHold(dt);
    if (this.waveT > 0) this.waveT -= dt;
    for (const T of [UA, RU]) if (this.kabT[T] > 0) this.kabT[T] -= dt;
    if (this.missileT > 0) this.missileT -= dt; if (this.deepT > 0) this.deepT -= dt;
    this.updateStrikes();
    this.cleanup();
    for (const b of this.bots) if (b) updateBot(this, b, dt);
  }

  /** holding every town for HOLD_TO_WIN seconds wins outright */
  updateHold(dt: number) {
    for (const T of [UA, RU]) {
      if (this.depots.every(d => d.owner === T)) {
        this.holdT[T] += dt;
        const left = HOLD_TO_WIN - this.holdT[T];
        for (const mark of [120, 60, 10]) if (left <= mark && this.holdWarned[T] < mark) { this.holdWarned[T] = mark; this.notify(-1, TEAMS[T].name + ' holds every town: victory in ' + mark + ' s unless one is taken back'); }
        if (this.holdT[T] >= HOLD_TO_WIN) { this.addLog(-1, 'info', TEAMS[T].name + ' held every town for three minutes'); this.endGame(T); }
      } else { this.holdT[T] = 0; this.holdWarned[T] = 0; }
    }
  }

  /** artillery shells: slow refill beside the depot or headquarters, trucks for guns in the field */
  updateAmmo(dt: number) {
    this.ammoT -= dt; if (this.ammoT > 0) return; this.ammoT = 4;
    for (const T of [UA, RU]) {
      let needy: Unit | null = null, worst = 0.5;
      for (const u of this.units) {
        if (u.dead || u.team !== T || !u.def.ammo) continue;
        const max = u.def.ammo;
        if (u.ammo! < max && this.structs.some(s => !s.dead && s.team === T && s.build >= 1 && (s.type === 'artyDepot' || s.type === 'hq') && dist(s, u) < 140)) { u.ammo = Math.min(max, u.ammo! + 1); u.ammoWarned = false; continue; }
        if (u.ammoTruckId !== undefined && this.find(u.ammoTruckId)) continue;
        u.ammoTruckId = undefined;
        const frac = u.ammo! / max; if (frac < worst) { worst = frac; needy = u; }
      }
      if (needy) this.spawnAmmoTruck(T, needy);
    }
  }
  spawnAmmoTruck(team: number, gun: Unit) {
    const hq = this.hq(team);
    if (!hq || this.freePeople(team) < 1) return;
    const u = this.makeUnit('truck', team, hq.x + this.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
    u.cargo = 'ammo'; u.value = 150; u.dest = gun; u.order = MOVE(gun.x + this.rand(-20, 20), gun.y + this.rand(-20, 20));
    this.planRoute(u, u.order.x, u.order.y);
    this.units.push(u); gun.ammoTruckId = u.id;
    this.notify(team, 'Ammunition truck leaving for the ' + gun.def.label[team].toLowerCase());
  }

  // ---------------------------------------------------------------- strikes from beyond the map
  refineriesBurning(): number { return this.refineryHits.filter(t => t > this.gameTime).length; }
  kabCooldown(team: number): number { return STRIKES.kab.cooldown[team] * (team === RU && this.refineriesBurning() ? 1.5 : 1); }
  /** announce a strike; it lands after the warning unless air defense near the point catches it */
  scheduleStrike(team: number, kind: 'kab' | 'missile', x: number, y: number, targetId?: number) {
    const spec = kind === 'kab' ? STRIKES.kab : STRIKES.missile;
    this.strikes.push({ team, kind, x, y, at: this.gameTime + spec.warn, targetId });
    this.effects.push({ kind: 'alert', x, y, t: 0, dur: spec.warn, team: 1 - team, text: kind === 'kab' ? 'GLIDE BOMB' : 'MISSILE' });
    this.notify(1 - team, (kind === 'kab' ? 'Air raid: glide bomb inbound at ' : 'Ballistic missile inbound at ') + nearestPlace(x, y) + ', ' + spec.warn + ' seconds');
    this.addLog(team, 'info', TEAMS[team].name + (kind === 'kab' ? ' launched a glide bomb at ' : ' fired a ballistic missile at ') + nearestPlace(x, y));
  }
  updateStrikes() {
    for (const s of this.strikes) {
      if (this.gameTime < s.at) continue;
      const E = 1 - s.team, spec = s.kind === 'kab' ? STRIKES.kab : STRIKES.missile;
      const p = s.kind === 'missile' && s.targetId !== undefined ? (this.find(s.targetId) || s) : s;
      const chance = this.upgrades[E].samNet ? spec.interceptUp : spec.intercept;
      let shot = false;
      for (const a of this.units) { if (a.dead || a.team !== E || a.type !== 'aa' || this.modeOf(a) === 'passive') continue; if (dist(a, p) < 260 && this.rng.next() < chance) { shot = true; this.credit(a, a); a.kills = (a.kills || 0); break; } }
      if (shot) {
        this.stats.intercepted[E]++;
        this.effects.push({ kind: 'boom', x: p.x + this.rand(-60, 60), y: p.y - 90, r: 40, t: 0, dur: 0.9 });
        this.notify(E, (s.kind === 'kab' ? 'Glide bomb' : 'Missile') + ' shot down over ' + nearestPlace(p.x, p.y)); this.notify(s.team, 'Strike intercepted');
        this.addLog(E, 'info', TEAMS[E].name + ' shot down a ' + (s.kind === 'kab' ? 'glide bomb' : 'ballistic missile') + ' over ' + nearestPlace(p.x, p.y));
      } else {
        const fromN = s.team === RU;
        const sx = p.x + (fromN ? 120 : -120), sy = fromN ? Math.max(10, p.y - 900) : Math.min(H - 10, p.y + 900);
        const dd = hyp(p.x - sx, p.y - sy);
        this.projectiles.push({ x: sx, y: sy, sx, sy, tx: p.x, ty: p.y, t: 0, dur: dd / (s.kind === 'kab' ? 420 : 900), dmg: spec.dmg, splash: spec.splash, team: s.team, arc: s.kind === 'kab' ? 60 : 140, rocket: s.kind === 'missile', dead: false, strike: s.kind });
      }
    }
    this.strikes = this.strikes.filter(s => this.gameTime < s.at);
    if (this.deepPending && this.gameTime >= this.deepPending.at) {
      const d = this.deepPending; this.deepPending = null;
      if (d.hit) { this.refineryHits.push(this.gameTime + STRIKES.deep.burn); this.stats.refineries++; this.notify(-1, 'A Russian refinery is burning: Russian income down ' + Math.round((1 - Math.pow(STRIKES.deep.incomeMul, this.refineriesBurning())) * 100) + '% for four minutes, glide bombs slower to come'); this.addLog(UA, 'info', 'Deep strike: a refinery inside Russia is burning'); }
      else { this.notify(-1, 'The deep strike was shot down over Russia'); this.addLog(RU, 'info', 'Russian air defense downed a Liutyi over the interior'); }
    }
  }

  // ---------------------------------------------------------------- weather and night
  static DAY_CYCLE = 480; static NIGHT_FROM = 300;
  /** night lasts three minutes of every eight */
  isNight(): boolean { return this.gameTime % Game.DAY_CYCLE >= Game.NIGHT_FROM; }
  /** seconds until the light changes */
  phaseLeft(): number { const p = this.gameTime % Game.DAY_CYCLE; return this.isNight() ? Game.DAY_CYCLE - p : Game.NIGHT_FROM - p; }
  private rollWeather(): WeatherKind { const r = this.rng.next(); return r < 0.6 ? 'clear' : r < 0.8 ? 'rain' : r < 0.92 ? 'fog' : 'snow'; }
  updateWeather() {
    const w = this.weather;
    if (!w.warned && w.until - this.gameTime <= 30) {
      w.warned = true; w.next = this.rollWeather(); if (w.next === w.kind) w.next = w.kind === 'clear' ? 'rain' : 'clear';
      this.notify(-1, WEATHER_TEXT[w.next].coming);
    }
    if (this.gameTime >= w.until) {
      const kind = w.warned ? w.next : this.rollWeather();
      this.weather = { kind, until: this.gameTime + (kind === 'clear' ? this.rand(120, 300) : this.rand(90, 240)), next: kind, warned: false };
      this.notify(-1, WEATHER_TEXT[kind].now); this.addLog(-1, 'weather', WEATHER_TEXT[kind].now);
      if (kind === 'snow') for (const u of this.units) if (!u.dead && u.def.air && u.def.electric && !u.def.large && !u.landed && !(u.def.kamikaze && u.target)) { const spot = this.landingSpot(u); if (spot) { u.order = MOVE(spot.x, spot.y); u.target = null; } }
    }
  }
  /** how far anything sees right now: fog, snow, and night all shorten it */
  visionMul(u: { def: UnitDef; team: number } | null): number {
    const k = this.weather.kind; let m = k === 'fog' ? 0.45 : k === 'snow' ? 0.7 : k === 'rain' ? 0.85 : 1;
    if (this.isNight()) m *= (u && u.def.air) ? (this.upgrades[u.team].nightOps ? 1 : 0.85) : 0.6;
    return m;
  }
  /** drones hunt a shorter way in fog and at night */
  huntMul(): number { return (this.weather.kind === 'fog' ? 0.5 : this.weather.kind === 'snow' ? 0.75 : 1) * (this.isNight() ? 0.85 : 1); }
  /** quads stay down in snow */
  quadsGrounded(): boolean { return this.weather.kind === 'snow'; }
  moveMul(u: Unit): number { return !u.def.air && !u.onRoad && (this.weather.kind === 'rain' || this.weather.kind === 'snow') ? 0.8 : 1; }

  /** cheap state checksum used to detect lockstep desync between clients */
  hash(): string {
    let h = 7;
    const mix = (v: number) => { h = (Math.imul(h, 31) + (v | 0)) | 0; };
    mix(Math.floor(this.gameTime * 10)); mix(Math.floor(this.funds[0])); mix(Math.floor(this.funds[1])); mix(this.nextId); mix(this.units.length); mix(this.structs.length);
    for (const u of this.units) { mix(u.id); mix(Math.floor(u.x * 10)); mix(Math.floor(u.y * 10)); mix(Math.floor(u.hp)); }
    for (const s of this.structs) { mix(s.id); mix(Math.floor(s.hp)); mix(s.queue.length); }
    for (const d of this.depots) mix(d.owner + 2);
    return (h >>> 0).toString(16);
  }

  computeVision() {
    this.vision = [[], []];
    for (const u of this.units) if (!u.dead && u.team >= 0) { const low = u.def.highAlt && !this.isHigh(u) && !u.landed && !u.grounded; this.vision[u.team].push({ x: u.x, y: u.y, r: u.def.vision * this.visMul(u.team) * (u.def.air && this.upgrades[u.team].nightOps ? 1.3 : 1) * this.visionMul(u) * (low ? 0.65 : 1), deep: low || undefined }); }
    for (const s of this.structs) if (!s.dead && s.build >= 1 && s.team >= 0) this.vision[s.team].push({ x: s.x, y: s.y, r: s.def.vision * this.visMul(s.team) * this.visionMul(null) * (this.isNight() && s.type === 'radar' ? 1.4 : 1) });
    for (const u of this.units) {
      if (u.dead) continue;
      u.cover = u.def.air ? 'open' : (u.def.troop && this.trenchAt(u.x, u.y)) ? 'trench' : this.terrain.coverOf(u.x, u.y);
      if (!u.def.air) u.onRoad = this.terrain.onRoadAt(u.x, u.y);
      let hid = (u.def.troop || u.def.indirect) && u.cover !== 'open' ? COVER[u.cover].spot : 0;
      const mode = this.modeOf(u);
      // creeping troops are hard to spot even in the open; an FPV sitting in ambush is a lump in a field
      if (mode === 'creep') hid = hid ? Math.min(hid, 150) : 150;
      if (u.ambushed) hid = 60;
      u.seenBy[UA] = u.team === UA || (hid ? this.inVisionClose(UA, u.x, u.y, hid) : this.inVision(UA, u.x, u.y));
      u.seenBy[RU] = u.team === RU || (hid ? this.inVisionClose(RU, u.x, u.y, hid) : this.inVision(RU, u.x, u.y));
      // counter-battery: a gun that just fired, a jammer that is emitting, or a radar that is on is caught by any enemy radar post within 900
      if (((u.revealT && u.revealT > 0) || this.emitting(u)) && u.team >= 0) { const E = 1 - u.team; if (!u.seenBy[E] && this.structs.some(s => !s.dead && s.build >= 1 && s.type === 'radar' && s.team === E && dist(s, u) < 900)) u.seenBy[E] = true; }
    }
  }

  updateSupply() {
    for (const T of [UA, RU]) {
      const sp = this.supply[T];
      let foodUsed = 0, fuelUsed = 0, powerUsed = 0;
      for (const u of this.units) { if (u.dead || u.team !== T) continue; if (u.def.troop) foodUsed++; if (FUEL_USERS.has(u.type)) fuelUsed++; if (u.def.electric) powerUsed++; }
      const foodCap = FOOD_BASE + FOOD_PER_FIELD * this.wheatHeld(T), fuelCap = FUEL_BASE + Math.round(FUEL_PER_NODE * this.gasIncome(T) / GAS_YIELD);
      const powerCap = POWER_BASE + POWER_PER_SUBSTATION * this.structs.filter(st => st.civ && st.type === 'power' && st.nation === T && !st.dead).length + POWER_PER_GENERATOR * this.structs.filter(st => st.team === T && st.type === 'generator' && !st.dead && st.build >= 1).length;
      const food = foodUsed > foodCap ? foodCap / foodUsed : 1, fuel = fuelUsed > fuelCap ? fuelCap / fuelUsed : 1, power = powerUsed > powerCap ? powerCap / powerUsed : 1;
      if (food < 1 && sp.food >= 1) this.notify(T, 'Food shortage: ' + foodUsed + ' squads, ' + foodCap + ' fed. Hungry troops fight at ' + Math.round((0.6 + 0.4 * food) * 100) + '%. Hold more wheat fields.');
      if (fuel < 1 && sp.fuel >= 1) this.notify(T, 'Fuel shortage: ' + fuelUsed + ' vehicles, fuel for ' + fuelCap + '. Vehicles slow to ' + Math.round((0.35 + 0.65 * fuel) * 100) + '%. Hold gas and keep the pipeline whole.');
      if (power < 1 && sp.power >= 1) this.notify(T, 'Power shortage: ' + powerUsed + ' battery drones, charging for ' + powerCap + '. Recharging takes three times longer and no more battery drones can be built.');
      if (power >= 1 && sp.power < 1) this.notify(T, 'Charging capacity restored');
      if (food >= 1 && sp.food < 1) this.notify(T, 'Food supply restored');
      if (fuel >= 1 && sp.fuel < 1) this.notify(T, 'Fuel supply restored');
      sp.food = food; sp.fuel = fuel; sp.power = power; sp.foodUsed = foodUsed; sp.foodCap = foodCap; sp.fuelUsed = fuelUsed; sp.fuelCap = fuelCap; sp.powerUsed = powerUsed; sp.powerCap = powerCap;
    }
  }

  updateDepots(dt: number) {
    for (const d of this.depots.concat(this.resources)) {
      if (d.burnT > 0) d.burnT -= dt;
      let a = 0, b = 0; const first: (Unit | null)[] = [null, null];
      for (const u of this.units) {
        if (u.dead || !u.def.canCapture) continue;
        if (dist(u, d) <= d.r) { if (u.team === UA) a++; else b++; if (!first[u.team]) first[u.team] = u; }
      }
      let team = -1;
      if (a > 0 && b === 0) team = UA; else if (b > 0 && a === 0) team = RU;
      if (team >= 0 && d.owner !== team) {
        if (d.capTeam !== team) { d.capTeam = team; d.cap = 0; }
        d.cap += dt;
        if (d.cap >= 5) {
          const was = d.owner; d.owner = team; d.cap = 0; d.capTeam = -1; d.supplyT = 6;
          this.notify(team, d.name + ' captured');
          if (was >= 0) this.notify(was, d.name + ' lost' + (d.kind === 'gas' ? ': gas income falls' : d.kind === 'wheat' ? ': fewer recruits' : ''));
          this.addLog(team, 'capture', TEAMS[team].name + ' captured ' + d.name); this.stats.score[team] += SCORE.capture;
          const cap = first[team]; if (cap) { this.bark('capture', cap); const friend = this.units.find(o => o !== cap && !o.dead && o.team === team && o.def.troop && dist(o, cap) < 220); if (friend) this.bark('reply', friend, 0.9); }
        }
      } else { d.cap = Math.max(0, d.cap - dt); if (d.cap === 0) d.capTeam = -1; }
      if (d.owner >= 0 && (!d.isRes || d.burnT <= 0)) {
        d.supplyT -= dt;
        if (d.supplyT <= 0) { d.supplyT = TRUCK_PERIOD; this.spawnTruck(d.owner, d); }
      }
    }
    for (const ps of this.pumpSites) {
      if (ps.struct && !ps.struct.dead) continue;
      ps.rebuildT -= dt;
      if (ps.rebuildT > 0) continue;
      const enemyNear = this.units.some(u => !u.dead && u.team === 1 - ps.team && !u.def.air && !u.def.auto && dist(u, ps) < 250);
      if (enemyNear) continue;
      ps.struct = this.makeStruct('pump', ps.team, ps.x, ps.y, false); this.structs.push(ps.struct);
      this.notify(ps.team, 'Repair crews are rebuilding the pumping station');
    }
  }

  spawnTruck(team: number, d: Site) {
    const hq = this.hq(team);
    if (!hq || this.freePeople(team) < 1) return;
    if (d.isRes) {
      const u = this.makeUnit('truck', team, d.x + this.rand(-20, 20), d.y + this.rand(-20, 20));
      u.cargo = d.kind === 'wheat' ? 'grain' : 'oil'; u.src = d; u.dest = hq;
      u.order = MOVE(hq.x + this.rand(-30, 30), hq.y + (team === UA ? -(hq.r + 24) : hq.r + 24));
      this.planRoute(u, u.order.x, u.order.y);
      this.units.push(u);
      return;
    }
    const u = this.makeUnit('truck', team, hq.x + this.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
    u.cargo = 'supply'; u.dest = d; u.order = MOVE(d.x + this.rand(-20, 20), d.y + this.rand(-20, 20));
    this.planRoute(u, u.order.x, u.order.y);
    this.units.push(u);
  }

  tradeEdge(team: number): Pt { return team === UA ? { x: 12, y: geo(50.16, 35.53).y } : { x: W - 12, y: geo(50.48, 37.86).y }; }
  truckValue(u: Unit): number { return u.value != null ? u.value : u.cargo === 'oil' ? 120 : u.cargo === 'grain' ? 60 : u.cargo === 'aid' ? 100 : TRUCK_LOAD; }
  spawnTradeConvoy(team: number) {
    const hq = this.hq(team);
    if (!hq || this.freePeople(team) < 1) return;
    const u = this.makeUnit('truck', team, hq.x + this.rand(-20, 20), hq.y + (team === UA ? -(hq.r + 22) : hq.r + 22));
    u.cargo = 'export'; u.value = 80 + 40 * this.wheatHeld(team) + 40 * this.resources.filter(r => r.kind === 'gas' && r.owner === team).length;
    const edge = this.tradeEdge(team);
    u.dest = edge; u.order = MOVE(edge.x, edge.y); this.planRoute(u, edge.x, edge.y);
    this.units.push(u);
    this.notify(team, 'Trade convoy leaving for ' + (team === UA ? 'the NATO border' : 'the Russian interior') + ' with ' + u.value + ' worth of grain and gas');
  }
  updateTrade(dt: number) {
    for (const T of [UA, RU]) { this.tradeT[T] -= dt; if (this.tradeT[T] <= 0) { this.tradeT[T] = 75; this.spawnTradeConvoy(T); } }
    for (const u of this.units) {
      if (u.dead || u.type !== 'truck') continue;
      const E = 1 - u.team;
      const captor = this.units.find(o => !o.dead && o.team === E && o.def.troop && dist(o, u) < 45);
      if (!captor) continue;
      if (this.units.some(o => !o.dead && o.team === u.team && !o.def.air && !o.def.auto && dist(o, u) < 120)) continue;
      const val = this.truckValue(u), loser = u.team;
      u.team = E; u.seenBy = [E === UA, E === RU]; u.cargo = 'captured'; u.value = val; u.src = null; u.detour = null; u.path = null;
      const hq = this.hq(E);
      if (!hq) { this.killUnit(u, true); continue; }
      u.dest = hq; u.order = MOVE(hq.x + this.rand(-30, 30), hq.y + (E === UA ? -(hq.r + 24) : hq.r + 24)); this.planRoute(u, u.order.x, u.order.y);
      this.captured[E]++;
      this.addLog(E, 'truck', TEAMS[E].name + ' captured a truck worth ' + val + ' near ' + nearestPlace(u.x, u.y));
      this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8, green: true });
      this.notify(E, 'Captured an enemy truck carrying ' + val + ' worth of supplies: it is driving to your headquarters');
      this.notify(loser, 'Your truck was captured');
    }
  }
  updateTruck(u: Unit, dt: number) {
    const px = u.x, py = u.y;
    const dest = u.dest as (Struct | Site | Pt) & { dead?: boolean; r?: number; owner?: number } | null;
    if (u.cargo === 'export' || u.cargo === 'aid' || u.cargo === 'captured') {
      if (!dest || dest.dead) { this.killUnit(u, true); return; }
      this.stepMove(u, u.order.x, u.order.y, dt);
      if (hyp(u.x - px, u.y - py) < 0.15) { u.stuck = (u.stuck || 0) + dt; if (u.stuck > 12) { this.killUnit(u, true); return; } } else u.stuck = 0;
      const arriveR = u.cargo === 'export' ? 30 : (dest.r || 0) + 40;
      if (dist(u, dest) < arriveR) {
        if (u.cargo === 'export') {
          this.funds[u.team] += (u.value || 0) * this.teamMul(u.team) * this.logiMul(u.team); this.tradeTotal[u.team] += Math.round((u.value || 0) * this.logiMul(u.team));
          this.notify(u.team, 'Trade convoy crossed the border: +' + u.value + ' funds. Supplies are on the way back.');
          const hq = this.hq(u.team);
          if (hq) { const back = this.makeUnit('truck', u.team, u.x, u.y); back.cargo = 'aid'; back.value = 100; back.dest = hq; back.order = MOVE(hq.x + this.rand(-30, 30), hq.y + (u.team === UA ? -(hq.r + 24) : hq.r + 24)); this.planRoute(back, back.order.x, back.order.y); this.units.push(back); }
        } else {
          this.funds[u.team] += (u.value || 0) * this.teamMul(u.team) * this.logiMul(u.team); this.stats.deliveries[u.team]++;
          this.effects.push({ kind: 'text', x: u.x, y: u.y - 14, t: 0, dur: 1.2, team: u.team, text: (u.cargo === 'aid' ? 'aid: +' : 'captured: +') + u.value });
        }
        this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
        this.killUnit(u, true);
      }
      return;
    }
    const stuckCheck = () => { if (hyp(u.x - px, u.y - py) < 0.15) { u.stuck = (u.stuck || 0) + dt; if (u.stuck > 10) { this.killUnit(u, true); return true; } } else u.stuck = 0; return false; };
    if (u.cargo === 'ammo') {
      const gun = dest as Unit | null;
      if (!gun || gun.dead) { this.killUnit(u, true); return; }
      if (hyp(gun.x - u.order.x, gun.y - u.order.y) > 60) { u.order = MOVE(gun.x, gun.y); this.planRoute(u, gun.x, gun.y); }
      this.stepMove(u, u.order.x, u.order.y, dt);
      if (stuckCheck()) return;
      if (dist(u, gun) < 80) {
        let n = 0;
        for (const o of this.units) if (!o.dead && o.team === u.team && o.def.ammo && dist(o, u) < 120) { o.ammo = o.def.ammo; o.ammoWarned = false; o.ammoTruckId = undefined; n++; }
        this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
        this.effects.push({ kind: 'text', x: u.x, y: u.y - 14, t: 0, dur: 1.2, team: u.team, text: 'shells for ' + n + ' gun' + (n === 1 ? '' : 's') });
        this.killUnit(u, true);
      }
      return;
    }
    if (u.cargo === 'grain' || u.cargo === 'oil') {
      if (!dest || dest.dead) { this.killUnit(u, true); return; }
      this.stepMove(u, u.order.x, u.order.y, dt);
      if (stuckCheck()) return;
      if (dist(u, dest) < (dest.r || 0) + 40) {
        const mul = this.teamMul(u.team);
        if (u.cargo === 'grain') { this.people[u.team].total = Math.min(200, this.people[u.team].total + 3); if (u.team === UA) this.support = Math.min(100, this.support + 2); this.funds[u.team] += 30 * mul * this.logiMul(u.team); }
        else this.funds[u.team] += 120 * mul * this.logiMul(u.team);
        this.stats.deliveries[u.team]++;
        this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
        this.effects.push({ kind: 'text', x: u.x, y: u.y - 14, t: 0, dur: 1.2, team: u.team, text: u.cargo === 'grain' ? 'grain: +3 recruits' : 'oil: +120' });
        this.killUnit(u, true);
      }
      return;
    }
    if (!dest || dest.owner !== u.team) { this.killUnit(u, true); return; }
    this.stepMove(u, u.order.x, u.order.y, dt);
    if (stuckCheck()) return;
    if (dist(u, dest) < 40) {
      this.funds[u.team] += TRUCK_LOAD * this.teamMul(u.team) * this.logiMul(u.team); this.stats.deliveries[u.team]++;
      this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, green: true });
      this.effects.push({ kind: 'text', x: u.x, y: u.y - 14, t: 0, dur: 1.2, team: u.team, text: '+' + TRUCK_LOAD });
      this.killUnit(u, true);
    }
  }

  updateHealing(dt: number) {
    for (const st of this.structs) {
      if (st.dead || !st.def.heal || st.build < 1) continue;
      const team = st.civ ? st.nation : st.team;
      for (const u of this.units) {
        if (u.dead || u.team !== team || !u.def.troop || u.hp >= u.def.hp) continue;
        if (dist(u, st) > st.def.heal) continue;
        u.hp = Math.min(u.def.hp, u.hp + u.def.hp * (st.def.healRate || 0) * (this.upgrades[team!].medevac ? 2 : 1) * this.supply[team!].food * dt);
        if (this.rng.next() < dt * 1.5) this.effects.push({ kind: 'heal', x: u.x + this.rand(-6, 6), y: u.y - 8, t: 0, dur: 0.8 });
      }
    }
  }
  updateNets(_dt: number) {
    const nets: Struct[] = [];
    for (const s of this.structs) if (!s.dead && s.build >= 1 && s.def.netR) nets.push(s);
    if (!nets.length) return;
    for (const u of this.units) {
      if (u.dead || !u.def.netted || u.landed || u.ambushed) continue;
      for (const n of nets) {
        if (n.team === u.team || u.netsSeen.includes(n.id)) continue;
        if (dist(u, n) <= n.def.netR!) {
          u.netsSeen.push(n.id);
          if (this.rng.next() < 0.85) { this.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.5 }); this.killUnit(u, true, n.team); break; }
        }
      }
    }
  }
  updateJamming(dt: number) {
    const src: { x: number; y: number; r: number; team: number }[] = [];
    for (const u of this.units) if (!u.dead && u.def.jam && this.modeOf(u) !== 'silent') src.push({ x: u.x, y: u.y, r: u.def.jam, team: u.team });
    for (const s of this.structs) if (!s.dead && s.build >= 1 && s.def.jam) src.push({ x: s.x, y: s.y, r: s.def.jam, team: s.team });
    if (!src.length) return;
    for (const u of this.units) {
      if (u.dead || !u.def.air || !u.def.jammable || u.landed || u.ambushed) continue;
      for (const j of src) {
        if (j.team === u.team) continue;
        if (dist(u, j) <= j.r + (this.upgrades[j.team].ewPlus ? 60 : 0)) { u.hp -= 30 * (this.upgrades[u.team].freqHop ? 0.5 : 1) * dt; u.jamT = 0.2; if (u.hp <= 0) { this.stats.jammed[u.team]++; this.killUnit(u, false, j.team); break; } }
      }
    }
  }

  updateStruct(s: Struct, dt: number) {
    if (s.dead || s.civ) return;
    if (s.build < 1) {
      s.build += dt / s.def.time;
      s.hp = Math.min(s.def.hp, s.hp + s.def.hp * 0.9 * dt / s.def.time);
      if (s.build >= 1) { s.build = 1; this.notify(s.team, s.def.label + ' ready'); }
      return;
    }
    if (s.def.heatPer) {
      s.heat = Math.max(0, s.heat - (s.def.cool || 0) * dt);
      if (s.overheated && s.heat < 35) { s.overheated = false; this.notify(s.team, s.def.label + ' cooled down: backlog moving'); }
    }
    if (s.queue.length) {
      const d = UNITS[s.queue[0]];
      if (!(s.overheated && d.air)) s.progress += dt;
      if (s.progress >= d.time) {
        s.progress = 0; this.spawnFromFactory(s, s.queue.shift()!);
        if (s.def.heatPer && d.air) { s.heat += s.def.heatPer; if (s.heat >= 100) { s.heat = 100; s.overheated = true; this.notify(s.team, s.def.label + ' overheated: production backlog until it cools'); } }
      }
    }
  }
  spawnFromFactory(s: Struct, type: string) {
    const dir = s.team === UA ? -1 : 1;
    const u = this.makeUnit(type, s.team, s.x + this.rand(-14, 14), s.y + dir * (s.r + 16));
    u.order = MOVE(s.rally.x + this.rand(-24, 24), s.rally.y + this.rand(-24, 24));
    this.planRoute(u, u.order.x, u.order.y);
    if (this.needsOperator(u.def, s.team)) {
      let best: Unit | null = null, bd = Infinity;
      for (const op of this.operatorsOf(s.team)) { if (this.droneCount(op) >= this.opCapOf(op)) continue; const dd = dist(op, s); if (dd < bd) { bd = dd; best = op; } }
      if (best) this.linkDrone(u, best); else { u.grounded = true; u.order = IDLE(); u.x = s.x + this.rand(-40, 40); u.y = s.y + (s.team === UA ? -1 : 1) * (s.r + 30 + this.rand(0, 30)); }
    }
    // small battery quads wait out the snow on the ground beside the works
    if (u.def.air && u.def.electric && !u.def.large && this.quadsGrounded()) { u.landed = true; u.rechargeT = 5; u.batt = u.def.endurance; u.order = IDLE(); }
    this.units.push(u); this.stats.built[s.team]++; if (u.def.air) this.stats.drones[s.team]++;
  }

  acquireFor(src: Unit, maxR: number, minR: number): Entity | null {
    const T = src.def.targets;
    if (!T) return null;
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === src.team || e.team < 0 || !e.seenBy[src.team] || !this.canEngage(src.def, e) || e.landed) continue;
      const dd = dist(src, e);
      if (dd <= maxR && dd >= minR && dd < bd) { bd = dd; best = e; }
    }
    if (T.includes('struct')) for (const s of this.structs) {
      if (s.dead || s.team === src.team || s.team < 0) continue;
      const dd = dist(src, s) - s.r * 0.5;
      if (dd <= maxR && dd >= minR && dd < bd) { bd = dd; best = s; }
    }
    return best;
  }
  acquirePreferred(u: Unit, maxR: number): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === u.team || e.team < 0 || !u.def.prefer!.includes(e.type) || !e.seenBy[u.team] || !this.canEngage(u.def, e)) continue;
      const dd = dist(u, e); if (dd <= maxR && dd < bd) { bd = dd; best = e; }
    }
    return best;
  }
  targetClass(e: Entity): TargetClass { return e.isStruct ? 'struct' : e.def.air ? 'air' : e.def.troop ? 'inf' : 'veh'; }
  canEngage(srcDef: UnitDef, e: Entity): boolean {
    if (!srcDef.targets) return false;
    const cls = this.targetClass(e);
    if (!srcDef.targets.includes(cls)) return false;
    if (cls === 'air' && srcDef.lowAlt && this.isHigh(e as Unit)) return false;
    return true;
  }
  canHitTarget(u: Unit, t: Entity): boolean { return (!!u.def.kamikaze || u.def.dmg > 0) && this.canEngage(u.def, t); }

  // ---------------------------------------------------------------- movement
  planRoute(u: Unit, tx: number, ty: number) {
    u.path = null;
    if (u.def.air || !this.terrain.roadEdges.length) return;
    const direct = hyp(tx - u.x, ty - u.y);
    if (direct < 120) return;
    const s0 = this.terrain.nearestRoad(u.x, u.y), s1 = this.terrain.nearestRoad(tx, ty);
    if (!s0 || !s1) return;
    const r = this.terrain.roadPath(s0, s1);
    if (!r) return;
    const mul = u.def.roadMul || 1.4, roadTime = s0.d + s1.d + r.len / mul;
    if (roadTime > direct * 1.1) return;
    u.path = [{ x: s0.px, y: s0.py }].concat(r.path, [{ x: s1.px, y: s1.py }]).filter((w, i, arr) => i === 0 || hyp(w.x - arr[i - 1].x, w.y - arr[i - 1].y) > 4);
  }
  stepMove(u: Unit, tx: number, ty: number, dt: number): boolean | 'stalled' {
    const goal = (u.path && u.path.length) ? u.path[0] : { x: tx, y: ty };
    const key = goal.x + ',' + goal.y;
    if (u.goalKey !== key) { u.goalKey = key; u.bestD = Infinity; u.stallT = 0; }
    if (u.path && u.path.length) {
      this.moveToward(u, goal.x, goal.y, dt);
      const d = hyp(goal.x - u.x, goal.y - u.y);
      if (d < u.bestD! - 1) { u.bestD = d; u.stallT = 0; } else u.stallT = (u.stallT || 0) + dt;
      if (d < 22 || u.stallT! > 1.5) { u.path.shift(); u.goalKey = null; }
      return false;
    }
    this.moveToward(u, tx, ty, dt);
    const d = hyp(tx - u.x, ty - u.y);
    if (d < u.bestD! - 1) { u.bestD = d; u.stallT = 0; } else u.stallT = (u.stallT || 0) + dt;
    if (u.stallT! > 3) { u.stallT = 0; u.detour = null; u.goalKey = null; return 'stalled'; }
    return true;
  }
  moveToward(u: Unit, tx: number, ty: number, dt: number) {
    if (!u.def.air && u.detour) {
      if (hyp(u.detour.x - u.x, u.detour.y - u.y) < 26) u.detour = null;
      else { tx = u.detour.x; ty = u.detour.y; }
    }
    const dx = tx - u.x, dy = ty - u.y, dd = hyp(dx, dy);
    if (dd < 0.5) return;
    const mode = this.modeOf(u), postureMul = mode === 'creep' ? 0.55 : this.piloted(u) ? PILOT.speed : 1;
    const step = Math.min(dd, u.def.speed * (u.onRoad ? (u.def.roadMul || 1.4) : 1) * (u.def.morale ? 0.7 + 0.3 * this.moraleMul(u) : 1) * this.fuelMul(u) * this.moveMul(u) * postureMul * dt);
    const nx = u.x + dx / dd * step, ny = u.y + dy / dd * step;
    if (!u.def.air) {
      const blk = this.terrain.waterBlock(u.x, u.y, nx, ny);
      if (blk) {
        if (blk !== 'poly') {
          const tx_ = blk[1].x - blk[0].x, ty_ = blk[1].y - blk[0].y, L = hyp(tx_, ty_) || 1, ux = tx_ / L, uy = ty_ / L;
          const proj = (dx / dd * step) * ux + (dy / dd * step) * uy;
          const sx = u.x + ux * proj, sy = u.y + uy * proj;
          if (Math.abs(proj) > 0.05 && !this.terrain.waterBlock(u.x, u.y, sx, sy)) { u.x = sx; u.y = sy; u.angle = datan2(uy * Math.sign(proj), ux * Math.sign(proj)); return; }
        }
        if (!u.detour) { const b = this.terrain.nearestBridge(u, 900); if (b) u.detour = b; }
        return;
      }
    }
    u.x = nx; u.y = ny; u.angle = datan2(dy, dx);
  }
  moveAway(u: Unit, t: Pt, dt: number) {
    const dx = u.x - t.x, dy = u.y - t.y, dd = hyp(dx, dy) || 1;
    const step = u.def.speed * dt;
    u.x += dx / dd * step; u.y += dy / dd * step;
  }

  // ---------------------------------------------------------------- units
  updateUnit(u: Unit, dt: number) {
    if (u.dead) return;
    const d = u.def;
    u.cool -= dt; if (u.jamT > 0) u.jamT -= dt; if (u.revealT && u.revealT > 0) u.revealT -= dt;
    if (u.pilotT && u.pilotT > 0) { u.pilotT -= dt; if (u.pilotT <= 0) { u.pilotT = 0; u.diveAt = null; } }
    if (u.target && u.target.dead) u.target = null;
    if (u.order.kind === 'attack' && (!u.order.target || u.order.target.dead)) u.order = IDLE();
    const range = this.rangeOf(u), minR = d.minRange || 0;

    if (d.civ) { this.updateCivCar(u, dt); return; }
    if (d.auto) { this.updateTruck(u, dt); return; }
    if (u.grounded) {
      if (!this.needsOperator(d, u.team)) { u.grounded = false; }
      else if (this.relink(u)) { u.grounded = false; this.notify(u.team, d.label[u.team] + ' has an operator and is airborne'); }
      else return;
    }
    if (d.endurance) {
      if (u.batt === undefined) u.batt = d.endurance;
      if (u.landed) { u.rechargeT! -= dt * (u.team >= 0 && this.supply[u.team].power < 1 ? 1 / 3 : 1); if (u.rechargeT! <= 0 && !(this.quadsGrounded() && d.electric && !d.large)) { u.landed = false; u.batt = d.endurance; u.grace = 0; } return; }
      const diving = (d.kamikaze && u.target && !u.target.dead) || u.ambushed;
      if (!diving) u.batt -= dt * (this.weather.kind === 'rain' ? 1.5 : this.weather.kind === 'snow' ? 2 : 1);
      if (!diving && u.batt < d.endurance * 0.25) {
        const spot = this.landingSpot(u);
        if (!spot) { if (u.batt <= 0) { this.crashDrone(u, 'battery flat, nowhere to land'); return; } }
        else {
          const dd = dist(u, spot);
          if (dd < 50) { u.landed = true; u.rechargeT = d.recharge || 30; u.order = IDLE(); u.target = null; this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6 }); return; }
          if (u.batt <= 0) { u.grace = (u.grace || 0) + dt; if (u.grace > 30) { this.crashDrone(u, 'battery flat before it got home'); return; } }
          if (!u.order || u.order.kind !== 'move' || hyp(u.order.x - spot.x, u.order.y - spot.y) > 40) { u.order = MOVE(spot.x, spot.y); u.target = null; }
          this.moveToward(u, spot.x, spot.y, dt);
          return;
        }
      }
    }
    if (this.needsOperator(d, u.team)) {
      if (!u.operator || u.operator.dead) {
        u.operator = null;
        if (!this.relink(u)) {
          u.lostT = (u.lostT || 0) + dt;
          if (u.lostT > (this.upgrades[u.team].auto1 ? 10 : 4) && !(d.kamikaze && u.target && !u.target.dead)) { u.grounded = true; u.order = IDLE(); u.target = null; u.lostT = 0; this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8 }); this.notify(u.team, d.label[u.team] + ' landed: its squad is gone, it waits for another'); return; }
        } else u.lostT = 0;
      } else {
        const R = this.linkRange(u), dd = dist(u, u.operator);
        if (dd > R && !(d.kamikaze && u.target && !u.target.dead)) {
          const k = (R * 0.85) / dd;
          u.order = MOVE(u.operator.x + (u.x - u.operator.x) * k, u.operator.y + (u.y - u.operator.y) * k); u.target = null;
        }
      }
    }
    // an FPV in ambush sits with the motors off until something worth a warhead comes close
    if (u.ambushed) {
      if (this.modeOf(u) !== 'ambush' || this.piloted(u) || u.order.kind !== 'idle') u.ambushed = false;
      else {
        const t = this.acquireFor(u, PILOT.ambushReach, 0);
        if (t && this.inLink(u, t)) {
          u.ambushed = false; u.target = t; u.order = ATTACK(t);
          this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, red: true, team: u.team });
          this.notify(u.team, 'Ambush sprung near ' + nearestPlace(u.x, u.y) + ': ' + d.label[u.team] + ' pouncing on a ' + (t.isStruct ? t.def.label.toLowerCase() : t.def.label[t.team].toLowerCase()));
        } else return;
      }
    } else if (d.kamikaze && this.modeOf(u) === 'ambush' && !u.target && u.order.kind === 'idle' && !this.piloted(u)) {
      u.ambushed = true; this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.6, team: u.team }); return;
    }
    if (d.kamikaze) { this.updateKamikaze(u, dt); return; }

    if (u.salvoLeft > 0) {
      if (u.salvoAt) { u.salvoT -= dt; if (u.salvoT <= 0) { this.launchShellAt(u, u.salvoAt.x, u.salvoAt.y, u.salvoAt.spread); u.salvoLeft--; u.salvoT = 0.18; } }
      else if (!u.target || u.target.dead) u.salvoLeft = 0;
      else { u.salvoT -= dt; if (u.salvoT <= 0) { this.launchShell(u, u.target); u.salvoLeft--; u.salvoT = 0.18; } }
    }
    if (u.order.kind === 'dig') {
      u.digT = (u.digT === undefined ? DIG_TIME : u.digT) - dt;
      u.target = null;
      if (u.digT <= 0) {
        u.digT = undefined;
        if (!this.trenchAt(u.x, u.y)) { const tr = this.makeStruct('trench', u.team, u.x, u.y, true); tr.hp = tr.def.hp; this.structs.push(tr); this.notify(u.team, 'Trench dug'); this.bark('dig', u); }
        u.order = IDLE();
      }
      return;
    }
    u.digT = undefined;
    // shoot and scoot: after a fire mission the gun displaces before it fires again
    if (d.indirect && this.modeOf(u) === 'scoot') {
      if (u.scootPending && u.salvoLeft <= 0) { u.scootPending = false; u.scoot = this.scootPoint(u); this.effects.push({ kind: 'mark', x: u.scoot.x, y: u.scoot.y, t: 0, dur: 0.6, team: u.team }); }
      if (u.scoot) {
        if (dist(u, u.scoot) < 8) u.scoot = null;
        else { this.moveToward(u, u.scoot.x, u.scoot.y, dt); u.target = null; return; }
      }
    } else { u.scoot = null; u.scootPending = false; }
    if (u.order.kind === 'bombard' && d.indirect) {
      const dd = dist(u, u.order);
      if (dd > range) this.moveToward(u, u.order.x, u.order.y, dt);
      else if (minR && dd < minR) this.moveAway(u, u.order, dt);
      else if (u.cool <= 0 && this.hasAmmo(u)) {
        const vis = this.acquireFor(u, range, minR);
        if (vis && vis.isUnit) this.fireAt(u, vis);
        else {
          u.cool = d.rof || 1; u.angle = datan2(u.order.y - u.y, u.order.x - u.x);
          const spread = this.inVision(u.team, u.order.x, u.order.y) ? 1 : 2.4;
          this.launchShellAt(u, u.order.x, u.order.y, spread);
          if (d.salvo) { u.salvoLeft = d.salvo - 1; u.salvoT = 0.18; u.salvoAt = { x: u.order.x, y: u.order.y, spread }; }
        }
      }
      u.target = null;
      return;
    }
    u.salvoAt = null;

    const mode = this.modeOf(u), piloted = this.piloted(u);
    let tgt: Entity | null = null;
    if (u.order.kind === 'attack') tgt = u.order.target;
    else if (d.dmg > 0) {
      // a guarding interceptor only looks a short way out; a piloted drone shoots what its pilot brings it to
      let hunt = d.acquire ? (d.acquire + (this.upgrades[u.team].repeaters ? 120 : 0)) * (d.air ? this.huntMul() : 1) : range;
      if (mode === 'guard') hunt = Math.min(hunt, PILOT.guardReach);
      if (piloted) hunt = range;
      if (u.target && dist(u, u.target) <= Math.max(range, hunt) && this.canSee(u, u.target)) tgt = u.target;
      else tgt = this.acquireFor(u, u.order.kind === 'idle' ? hunt : range, minR);
      if (tgt && mode === 'guard' && u.post && dist(tgt, u.post) > PILOT.guardReach + 60) tgt = null;
    }
    u.target = tgt;

    if (u.order.kind === 'move') {
      const dd = dist(u, u.order);
      const last = this.stepMove(u, u.order.x, u.order.y, dt);
      if ((last === true && dd < 6) || last === 'stalled') { u.order = IDLE(); u.path = null; this.nextWaypoint(u); }
    } else if (u.order.kind === 'attack' && tgt) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (dd > range * 0.9) this.moveToward(u, tgt.x, tgt.y, dt);
      else if (minR && dd < minR) this.moveAway(u, tgt, dt);
    } else if (u.order.kind === 'idle' && tgt) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (d.acquire && dd > range * 0.9 && !piloted) this.moveToward(u, tgt.x, tgt.y, dt);
      else if (minR && dd < minR) this.moveAway(u, tgt, dt);
    } else if (u.order.kind === 'idle') {
      if (mode === 'guard' && u.post && dist(u, u.post) > 30) this.moveToward(u, u.post.x, u.post.y, dt);
      else if (mode === 'escort') {
        // a fire group on escort shadows the nearest friendly truck
        let tr: Unit | null = null, bd = 700;
        for (const o of this.units) { if (o.dead || o.team !== u.team || o.type !== 'truck') continue; const dd = dist(o, u); if (dd < bd) { bd = dd; tr = o; } }
        if (tr && bd > 34) this.moveToward(u, tr.x, tr.y, dt);
      }
    }

    if (tgt && d.dmg > 0 && u.cool <= 0 && this.hasAmmo(u)) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (dd <= range && dd >= minR && this.canSee(u, tgt) && this.canHitTarget(u, tgt)) this.fireAt(u, tgt);
    }
  }
  /** continue along queued waypoints after a move completes */
  nextWaypoint(u: Unit) {
    if (!u.waypoints || !u.waypoints.length) { u.waypoints = undefined; return; }
    const w = u.waypoints.shift()!;
    u.order = MOVE(w.x, w.y); u.target = null; this.planRoute(u, w.x, w.y);
    if (!u.waypoints.length) u.waypoints = undefined;
  }
  hasAmmo(u: Unit): boolean {
    if (!u.def.ammo) return true;
    if (u.ammo! > 0) return true;
    if (!u.ammoWarned) { u.ammoWarned = true; this.notify(u.team, u.def.label[u.team] + ' out of shells: waiting for an ammunition truck'); }
    return false;
  }

  updateKamikaze(u: Unit, dt: number) {
    const d = u.def;
    if (u.order.kind === 'attack' && u.order.target && !u.order.target.dead) u.target = u.order.target;
    const mode = this.modeOf(u), piloted = this.piloted(u);
    if (!u.target) {
      if (u.order.kind === 'move') {
        const dd = dist(u, u.order);
        this.moveToward(u, u.order.x, u.order.y, dt);
        // a piloted drone flown into a point goes off there: a treeline, a trench, a suspected position
        if (u.diveAt && piloted && dist(u, u.diveAt) < 8) { this.detonate(u, null); return; }
        if (dd < 6) { u.order = IDLE(); this.nextWaypoint(u); }
      }
      // Hunt mode (and every drone without modes) picks its own targets; Hold and Ambush wait for orders, and a pilot chooses
      if (d.acquire! > 0 && (mode === 'hunt' || mode === '') && !piloted) {
        const reach = (d.acquire! + (this.upgrades[u.team].repeaters ? 120 : 0)) * this.huntMul();
        const t = (d.prefer && this.acquirePreferred(u, reach)) || this.acquireFor(u, reach, 0);
        if (t && this.inLink(u, t)) { u.target = t; u.order = ATTACK(t); }
      }
      return;
    }
    this.moveToward(u, u.target.x, u.target.y, dt);
    if (dist(u, u.target) <= rOf(u.target) + 4) this.detonate(u, u.target);
  }
  /** a kamikaze drone goes off: on its target, or on the ground where its pilot flew it */
  detonate(u: Unit, primary: Entity | null) {
    const d = u.def, piloted = this.piloted(u);
    if (d.dmg > 0) {
      this.explosionFx(u.x, u.y, (d.splash || 0) + 14, true);
      this.damageArea(u.x, u.y, d.splash || 0, d.dmg * (piloted ? PILOT.dmg : 1), u.team, primary, d.vsStruct || 1, d.vsVehicle || 1, true, u);
      if (piloted) this.effects.push({ kind: 'text', x: u.x, y: u.y - 16, t: 0, dur: 1.4, team: u.team, text: primary ? 'DIRECT HIT +20%' : 'IMPACT' });
    } else this.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.4 });
    this.killUnit(u, true);
  }

  fireAt(u: Unit, t: Entity) {
    const d = u.def;
    u.cool = d.rof || 1;
    u.angle = datan2(t.y - u.y, t.x - u.x);
    if (d.indirect) {
      this.launchShell(u, t);
      if (d.salvo) { u.salvoLeft = d.salvo - 1; u.salvoT = 0.18; }
    } else {
      this.directHit(u, t, d.dmg * (d.troop ? COVER[u.cover || 'open'].give * this.foodMul(u.team) : 1) * this.moraleMul(u) * (!d.air && this.upgrades[u.team].ammo ? 1.15 : 1) * (1 + 0.06 * rankOf(u)), d.splash || 0);
    }
  }
  directHit(src: Unit, t: Entity, dmg: number, splash: number) {
    this.effects.push({ kind: 'tracer', x: src.x, y: src.y, tx: t.x, ty: t.y, t: 0, dur: 0.12, team: src.team });
    if (t.isUnit && t.def.air) {
      const ev = clamp((t.def.evade || 0) + 0.04 * rankOf(t) + (src.def.air ? AIR_VS_AIR_EVADE : 0) + (this.piloted(t) ? PILOT.evade : 0) - (this.weather.kind === 'rain' ? 0.1 : 0) + (t.team >= 0 && this.upgrades[t.team].evasion ? 0.15 : 0) - (src.team >= 0 && this.upgrades[src.team].gunnery ? 0.15 : 0), 0, 0.9);
      if (this.rng.next() < ev) { this.effects.push({ kind: 'hit', x: t.x + this.rand(-14, 14), y: t.y + this.rand(-14, 14), t: 0, dur: 0.15 }); return; }
    }
    const vs = src.def.vsStruct || 1, vv = src.def.vsVehicle || 1;
    if (splash > 0) { this.explosionFx(t.x, t.y, splash * 0.7, false); this.damageArea(t.x, t.y, splash, dmg, src.team, t, vs, vv, !!src.def.air, src); }
    else { this.applyDamage(t, dmg * matchup(src.def, t), src.team, !!src.def.air, src); this.effects.push({ kind: 'hit', x: t.x + this.rand(-3, 3), y: t.y + this.rand(-3, 3), t: 0, dur: 0.18 }); }
  }
  launchShell(u: Unit, t: Entity) { this.launchShellAt(u, t.x, t.y, 1); }
  launchShellAt(u: Unit, px: number, py: number, spreadMul: number) {
    const d = u.def;
    const spread = (d.salvo ? 34 : 14) * (spreadMul || 1);
    const tx = px + this.rand(-spread, spread), ty = py + this.rand(-spread, spread);
    const dd = hyp(tx - u.x, ty - u.y);
    u.revealT = u.cover === 'forest' ? 2 : u.cover === 'open' ? 6 : 3;
    u.scootPending = true;
    if (d.ammo) { if (u.ammo! <= 0) return; u.ammo!--; if (u.ammo === 0) this.notify(u.team, u.def.label[u.team] + ' fired its last shell'); }
    this.projectiles.push({ x: u.x, y: u.y, sx: u.x, sy: u.y, tx, ty, t: 0, dur: dd / (d.shellSpeed || 260), dmg: d.dmg * (this.upgrades[u.team].ammo ? 1.15 : 1) * (1 + 0.06 * rankOf(u)), splash: d.splash || 0, team: u.team,
      arc: Math.min(110, dd * 0.22), rocket: !!d.salvo, dead: false, srcId: u.id, srcType: u.type });
    this.effects.push({ kind: 'flash', x: u.x + dcos(u.angle) * 14, y: u.y + dsin(u.angle) * 14, t: 0, dur: 0.1 });
  }
  updateProjectile(p: Projectile, dt: number) {
    if (p.dead) return;
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
    if (p.t >= p.dur) {
      p.dead = true;
      this.explosionFx(p.tx, p.ty, p.splash, true);
      if (p.strike) {
        // a glide bomb or missile: trench cover does not help, trenches are erased, buildings crumble
        this.effects.push({ kind: 'boom', x: p.tx, y: p.ty, r: p.splash * 1.4, t: 0, dur: 1.4 }); this.scorches.push({ x: p.tx, y: p.ty, r: p.splash });
        for (const s of this.structs) if (!s.dead && s.def.trench && hyp(s.x - p.tx, s.y - p.ty) < p.splash) this.destroyStruct(s, p.team);
        this.damageArea(p.tx, p.ty, p.splash, p.dmg, p.team, null, 1.5, 1.2, false, undefined, undefined, true);
        return;
      }
      const src = p.srcId !== undefined ? this.find(p.srcId) : undefined;
      const sd = src && src.isUnit ? src.def : (p.srcType ? UNITS[p.srcType] : undefined);
      // artillery does not know whose troops are under the shell: friendly ground units in the splash take it too
      this.damageArea(p.tx, p.ty, p.splash, p.dmg, p.team, null, sd && sd.vsStruct ? sd.vsStruct : 1, sd && sd.vsVehicle ? sd.vsVehicle : 1, false, src && src.isUnit ? src : undefined, sd, false, !!(sd && sd.indirect));
    }
  }
  damageArea(x: number, y: number, r: number, dmg: number, team: number, primary: Entity | null, vsStruct?: number, vsVehicle?: number, drone?: boolean, src?: Unit, srcDef?: UnitDef, heavy = false, friendly = false) {
    const vs = vsStruct || 1, vv = vsVehicle || 1;
    if (dmg >= 30) for (const rs of this.resources) if (rs.kind === 'wheat' && rs.burnT <= 0 && hyp(rs.x - x, rs.y - y) < rs.r) { rs.burnT = 60; if (rs.owner >= 0) this.notify(rs.owner, 'Wheat field burning'); }
    const sd = src ? src.def : srcDef, vi = heavy ? 1.6 : sd && sd.vsInf ? sd.vsInf : 1;
    for (const e of this.units) {
      if (e.dead || (e.team === team && !friendly) || e.def.air) continue;
      const dd = hyp(e.x - x, e.y - y) - e.def.r;
      if (dd <= r) this.applyDamage(e, (e === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * (isVehicle(e) ? vv : e.def.troop ? vi : 1), team, drone, src, heavy);
    }
    for (const s of this.structs) {
      if (s.dead || s.team === team) continue;
      const dd = hyp(s.x - x, s.y - y) - s.r;
      if (dd <= r) this.applyDamage(s, (s === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * vs, team, false, src);
    }
  }
  applyDamage(t: Entity, amt: number, team: number, drone?: boolean, src?: Unit, heavy = false) {
    if (t.dead) return;
    if (drone && t.isUnit && isVehicle(t) && t.team >= 0 && this.upgrades[t.team].cages) amt *= 0.65;
    if (t.isUnit) amt *= 1 - 0.06 * rankOf(t);
    if (t.isUnit) { const m = this.modeOf(t); if (m === 'hullDown' && !heavy) amt *= 0.7; else if (m === 'creep' && drone) amt *= 0.65; }
    if (t.isUnit && t.def.troop && !heavy) { const cv = COVER[t.cover || 'open']; amt *= cv.take; if (drone) { amt *= cv.drone; if (t.cover === 'trench' && this.terrain.coverOf(t.x, t.y) === 'forest') amt *= TRENCH_IN_FOREST; } }
    else if (t.isUnit && t.def.indirect && drone) amt *= COVER[t.cover || 'open'].drone;
    if (t.isUnit && t.def.morale) t.morale = clamp((t.morale === undefined ? 90 : t.morale) - amt * 0.25, 0, 100);
    t.hp -= amt; t.lastHitBy = team;
    if (t.hp <= 0) { if (t.isUnit) this.killUnit(t, false, team, src); else this.destroyStruct(t, team, src); }
  }
  /** a confirmed kill for the unit that scored it: veterancy */
  private credit(src: Unit | undefined, victim: Entity) {
    if (!src || src.dead || src.def.kamikaze) return;
    const before = rankOf(src); src.kills = (src.kills || 0) + 1;
    if (rankOf(src) > before) { this.stats.vets[src.team]++; this.notify(src.team, src.def.label[src.team] + ' is now ' + ['a recruit', 'trained', 'a veteran', 'elite'][rankOf(src)] + (victim.isStruct ? '' : '')); this.bark('kill', src); }
  }
  killUnit(u: Unit, silent?: boolean, byTeam?: number, by?: Unit) {
    if (u.dead) return;
    u.dead = true;
    if (u.team < 0) {
      if (byTeam === UA) { this.civ.carsKilled[0]++; this.supportHit(4, 'A civilian vehicle was hit by your strike.'); this.addLog(UA, 'loss', 'Ukrainian fire hit a civilian vehicle near ' + nearestPlace(u.x, u.y)); }
      else if (byTeam === RU) { this.civ.carsKilled[1]++; this.addLog(RU, 'loss', 'Russian fire hit a civilian vehicle near ' + nearestPlace(u.x, u.y)); }
      if (byTeam !== undefined && byTeam >= 0) this.stats.score[byTeam] += SCORE.civCar;
      this.explosionFx(u.x, u.y, 12, false);
      return;
    }
    this.stats.lost[u.team]++;
    if (u.type === 'truck' && byTeam !== undefined && byTeam >= 0 && byTeam !== u.team) this.stats.trucksKilled[byTeam]++;
    if (byTeam !== undefined && byTeam >= 0 && byTeam !== u.team) {
      this.stats.kills[byTeam]++; if (u.def.air) this.stats.shotDown[byTeam]++; this.stats.score[byTeam] += unitPoints(u.def);
      const ko = this.stats.killsOf[byTeam]; ko[u.type] = (ko[u.type] || 0) + 1;
      this.addLog(byTeam, 'kill', (by ? by.def.label[byTeam] : TEAMS[byTeam].name) + ' destroyed a ' + ADJ[u.team] + ' ' + u.def.label[u.team].toLowerCase() + ' near ' + nearestPlace(u.x, u.y));
      this.credit(by, u);
      if (!u.def.auto) { const shouter = this.nearestTroop(byTeam, u.x, u.y, 260); if (shouter) this.bark('kill', shouter); }
      if (u.def.troop) { const friend = this.nearestTroop(u.team, u.x, u.y, 260); if (friend) this.bark('lost', friend); }
    } else if (byTeam === u.team && by && by.def.indirect && !u.def.auto) { this.stats.friendlyFire[u.team]++; this.addLog(u.team, 'loss', 'Friendly fire: ' + TEAMS[u.team].name + ' lost ' + (/^[aeiou]/i.test(u.def.label[u.team]) ? 'an ' : 'a ') + u.def.label[u.team].toLowerCase() + ' to its own ' + by.def.label[u.team].toLowerCase() + ' near ' + nearestPlace(u.x, u.y)); this.notify(u.team, 'Friendly fire! Your ' + by.def.label[u.team].toLowerCase() + ' destroyed your own ' + u.def.label[u.team].toLowerCase()); }
    else if (!u.def.auto && !silent) this.addLog(u.team, 'loss', TEAMS[u.team].name + ' lost a ' + u.def.label[u.team].toLowerCase() + ' near ' + nearestPlace(u.x, u.y));
    if (u.def.troop) for (const o of this.units) if (!o.dead && o !== u && o.team === u.team && o.def.morale && dist(o, u) < 300) o.morale = clamp((o.morale === undefined ? 90 : o.morale) - 12, 0, 100);
    if (u.operator && u.operator.drones) u.operator.drones = u.operator.drones.filter(x => x !== u);
    if (u.drones) { for (const dr of u.drones) dr.operator = null; u.drones = []; }
    if (!u.def.air && u.def.crew) { const lost = Math.floor((u.def.crew + (u.ops || 1) - 1) * (this.upgrades[u.team].medevac ? 0.25 : 0.5) + this.rng.next()); this.people[u.team].total = Math.max(0, this.people[u.team].total - lost); this.stats.peopleLost[u.team] += lost; }
    if (!silent) this.explosionFx(u.x, u.y, u.def.air ? 10 : u.def.r + 8, !u.def.air);
  }
  destroyStruct(s: Struct, byTeam: number, by?: Unit) {
    if (s.dead) return;
    s.dead = true;
    this.explosionFx(s.x, s.y, s.r + 30, true);
    this.scorches.push({ x: s.x, y: s.y, r: s.r + 18 });
    if (byTeam >= 0 && byTeam !== s.team) { if (!s.def.trench) this.stats.structsKilled[byTeam]++; this.stats.score[byTeam] += s.civ ? SCORE.civSite : structPoints(s.def); this.credit(by, s); if (!s.def.trench) this.addLog(byTeam, 'struct', (by ? by.def.label[byTeam] : TEAMS[byTeam].name) + ' destroyed ' + (s.civ ? 'a ' + ADJ[s.nation!] + ' ' : 'the ' + ADJ[s.team] + ' ') + s.def.label.toLowerCase() + ' at ' + nearestPlace(s.x, s.y)); }
    if (s.civ) {
      this.civ.lost[s.nation!]++;
      if (byTeam === UA) {
        if (s.nation === 1) { this.civ.harmedByUA++; this.funds[UA] = Math.max(0, this.funds[UA] - 200); this.supportHit(12, 'Your strike destroyed a Russian ' + s.def.label.toLowerCase() + '.'); }
        else this.supportHit(6, 'Your own strike destroyed a Ukrainian ' + s.def.label.toLowerCase() + '.');
      } else if (s.nation === 0) this.notify(UA, 'Ukrainian ' + s.def.label.toLowerCase() + ' destroyed by enemy fire');
      return;
    }
    if (s.type === 'pump') { const ps = this.pumpSites.find(x => x.struct === s); if (ps) ps.rebuildT = 120; this.notify(s.team, 'Pumping station destroyed: gas flow stopped'); }
    else if (!s.def.trench) this.notify(s.team, s.def.label + ' destroyed');
    if (s.type === 'hq') this.endGame(1 - s.team);
  }
  supportHit(amount: number, text: string) { this.support = clamp(this.support - amount, 0, 100); this.notify(UA, text + ' Support ' + Math.round(this.support) + '%.'); }
  explosionFx(x: number, y: number, r: number, mark: boolean) {
    this.effects.push({ kind: 'boom', x, y, r, t: 0, dur: 0.45 + r / 120 });
    if (mark && r >= 20) this.scorches.push({ x, y, r: r * 0.8 });
  }
  separate() {
    // only ground units push each other and buildings apart: aircraft (flying, landed, or grounded) pass over everything and nothing pushes them
    const g: Unit[] = [];
    for (const u of this.units) if (!u.dead && !u.def.air) g.push(u);
    for (let i = 0; i < g.length; i++) {
      const a = g[i];
      for (let j = i + 1; j < g.length; j++) {
        const b = g[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.def.r + b.def.r + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.01) {
          const dd = Math.sqrt(d2), push = (min - dd) / 2 * 0.6, nx = dx / dd, ny = dy / dd;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        } else if (d2 <= 0.01) { a.x += this.rand(-1, 1); a.y += this.rand(-1, 1); }
      }
      for (const s of this.structs) {
        if (s.dead || s.def.trench) continue;
        const dx = a.x - s.x, dy = a.y - s.y, min = s.r + a.def.r + 3, d2 = dx * dx + dy * dy;
        if (d2 < min * min) { const dd = Math.sqrt(d2) || 1; a.x = s.x + dx / dd * min; a.y = s.y + dy / dd * min; }
      }
    }
    for (const u of this.units) { u.x = clamp(u.x, 6, W - 6); u.y = clamp(u.y, 6, (u.def.air ? H : H_LAND) - 6); }
  }
  cleanup() {
    for (const u of this.units) if (u.dead) this.byId.delete(u.id);
    for (const s of this.structs) if (s.dead) this.byId.delete(s.id);
    this.units = this.units.filter(u => !u.dead);
    this.structs = this.structs.filter(s => !s.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.effects = this.effects.filter(e => e.t < e.dur);
  }
  endGame(winner: number) {
    if (this.gameOver) return; this.gameOver = true; this.winner = winner;
    const hq = this.hq(winner); if (hq) { this.bark('win', hq); for (const u of this.units) if (!u.dead && u.team === winner && u.def.troop && dist(u, hq) < 400) { this.effects.push({ kind: 'bark', x: u.x, y: u.y, t: 0, dur: 2.4, team: winner, text: BARKS.win[winner as 0 | 1][0], delay: 0.4 }); break; } }
    this.addLog(-1, 'info', TEAMS[winner].name + ' wins');
  }

  // ---------------------------------------------------------------- morale, civilians
  updateMorale(dt: number) {
    const towns = [this.depots.filter(d => d.owner === UA).length, this.depots.filter(d => d.owner === RU).length];
    const hqs = [this.hq(UA), this.hq(RU)];
    for (const u of this.units) {
      if (u.dead || !u.def.morale) continue;
      if (u.morale === undefined) u.morale = 90;
      const losing = towns[u.team] < towns[1 - u.team];
      let dm = losing ? -(u.def.moraleLoss || 0) : 0.3;
      dm -= (1 - this.supply[u.team].food) * 0.8;
      if (u.def.upkeep) { const pay = u.def.upkeep * dt; if (this.funds[u.team] >= pay) this.funds[u.team] -= pay; else dm -= 1.5; }
      const hq = hqs[u.team];
      if ((hq && dist(u, hq) < 260) || this.structs.some(st => !st.dead && st.def.heal && (st.civ ? st.nation === u.team : st.team === u.team) && dist(u, st) < st.def.heal!)) dm += 0.8;
      u.morale = clamp(u.morale + dm * dt, 0, 100);
      if (u.morale <= 0) {
        this.notify(u.team, UNITS[u.type].label[u.team] + (u.type === 'merc' ? ' walked off the job' : ' broke and is gone'));
        this.killUnit(u, true); continue;
      }
      if (u.morale < 30 && !u.shaken) {
        u.shaken = true; u.target = null;
        if (hq) { u.order = MOVE(hq.x + this.rand(-60, 60), hq.y + (u.team === UA ? -160 : 160)); this.planRoute(u, u.order.x, u.order.y); }
        this.notify(u.team, UNITS[u.type].label[u.team] + ' shaken: falling back and not taking orders');
      } else if (u.morale > 50 && u.shaken) u.shaken = false;
    }
  }
  civSites(nation: number): Struct[] { return this.structs.filter(s => s.civ && s.nation === nation && !s.dead); }
  spawnCivCar(nation: number) {
    const sites = this.civSites(nation);
    if (sites.length < 2) return;
    const a = this.rng.pick(sites);
    const u = this.makeUnit('civcar', -1, a.x + this.rand(-30, 30), a.y + this.rand(-30, 30));
    u.nation = nation; u.waitT = this.rand(1, 4); u.seenBy = [false, false];
    this.units.push(u);
  }
  updateCivCar(u: Unit, dt: number) {
    if (u.waitT! > 0) { u.waitT! -= dt; return; }
    const dest = u.dest as Struct | null;
    if (!dest || dest.dead) {
      const sites = this.civSites(u.nation!).filter(sx => dist(sx, u) > 60);
      if (!sites.length) { u.waitT = 5; return; }
      const d = this.rng.pick(sites);
      u.dest = d;
      u.order = MOVE(d.x + this.rand(-30, 30), d.y + this.rand(-30, 30));
      this.planRoute(u, u.order.x, u.order.y);
    }
    this.stepMove(u, u.order.x, u.order.y, dt);
    if (dist(u, u.order) < 8) { u.dest = null; u.waitT = this.rand(3, 9); }
  }
  updateCivilians(dt: number) {
    this.support = Math.min(100, this.support + 0.05 * dt);
    this.carT -= dt;
    if (this.carT <= 0) {
      this.carT = 25;
      for (const nation of [0, 1]) if (this.units.filter(u => u.type === 'civcar' && u.nation === nation && !u.dead).length < 3) this.spawnCivCar(nation);
    }
    this.defectT -= dt;
    if (this.defectT <= 0) {
      this.defectT = 1;
      if (this.support >= 70) for (const u of this.units) {
        if (u.dead || u.team !== RU || (u.type !== 'infantry' && u.type !== 'moto')) continue;
        const friendNear = this.units.some(o => o !== u && !o.dead && o.team === RU && !o.def.air && !o.def.auto && dist(o, u) < 220) || this.structs.some(st => !st.dead && st.team === RU && dist(st, u) < 300);
        if (friendNear) continue;
        const uaNear = this.units.some(o => !o.dead && o.team === UA && !o.def.air && !o.def.auto && dist(o, u) < 200) || this.depots.some(d => d.owner === UA && dist(d, u) < 120);
        if (uaNear && u.hp < u.def.hp * 0.7 && this.rng.next() < 0.02) this.defect(u, 'A cut-off Russian squad surrendered and joined Ukraine.');
      }
    }
    this.volunteerT -= dt;
    if (this.volunteerT <= 0) {
      this.volunteerT = 75;
      const held = this.depots.filter(d => d.owner === UA && (d.name === 'Shebekino' || d.name === 'Zhuravlyovka'));
      if (held.length && this.support >= 70) {
        const d = this.rng.pick(held);
        const u = this.makeUnit('defector', UA, d.x + this.rand(-30, 30), d.y + this.rand(-30, 30));
        this.units.push(u); this.civ.defectors++; this.people[UA].total += UNITS.defector.crew;
        this.notify(-1, 'Russian volunteers joined Ukraine at ' + d.name + '.');
      }
    }
  }
  defect(u: Unit, text: string) {
    if (u.drones) { for (const dr of u.drones) dr.operator = null; u.drones = []; }
    u.team = UA; u.type = 'defector'; u.def = UNITS.defector; u.hp = Math.min(u.def.hp, u.hp + 30);
    u.order = IDLE(); u.target = null; u.seenBy = [true, false]; u.angle = -Math.PI / 2;
    this.civ.defectors++; this.people[UA].total += UNITS.defector.crew;
    this.effects.push({ kind: 'mark', x: u.x, y: u.y, t: 0, dur: 0.8, green: true });
    this.notify(-1, text); this.addLog(-1, 'defect', text);
  }

  /** Geran waves against Ukrainian buildings, launched by the Russian side (bot or timer) */
  spawnShaheds(count?: number, powerFirst = false) {
    const targets = this.structs.filter(s => (s.team === UA || (s.civ && s.nation === 0)) && !s.dead);
    if (!targets.length) return;
    const n = count ?? Math.min(6, 1 + Math.floor(this.gameTime / 200));
    const power = powerFirst ? targets.find(s => s.civ && s.type === 'power') : undefined;
    this.addLog(-1, 'wave', 'Geran wave: ' + n + ' drones and ' + (n + 1) + ' decoys launched at Kharkiv');
    for (let i = 0; i < n * 2 + 1; i++) {
      const type = i < n ? (this.gameTime > 600 && i < Math.max(1, Math.floor(n / 3)) ? 'geran3' : 'geran') : 'gerbera';
      const roll = this.rng.next();
      const u = roll < 0.4 ? this.makeUnit(type, RU, this.rand(W * 0.3, W - 40), 10) : roll < 0.65 ? this.makeUnit(type, RU, W - 10, this.rand(40, H_LAND * 0.5)) : this.makeUnit(type, RU, this.rand(W * 0.35, W - 60), H - 10);
      const pool = targets.flatMap(s => s.type === 'hq' ? [s] : s.civ ? (s.type === 'power' ? [s, s, s, s, s] : [s, s]) : [s, s, s]);
      const t = (i < 2 && power) ? power : this.rng.pick(pool);
      u.order = ATTACK(t); u.target = t;
      this.units.push(u);
    }
    this.notify(UA, 'Gerans and decoys inbound from the north, east, and south');
  }

  // ---------------------------------------------------------------- formations and swarms
  formationOffsets(n: number, type: FormationType, spacing: number): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
      if (type === 'line') out.push({ x: 0, y: (i - (n - 1) / 2) * spacing });
      else if (type === 'column') out.push({ x: -i * spacing, y: 0 });
      else if (type === 'ring') { const R = Math.max(spacing, spacing * n / 6.28), a = i / n * Math.PI * 2; out.push({ x: dcos(a) * R, y: dsin(a) * R }); }
      else { if (i === 0) out.push({ x: 0, y: 0 }); else { const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1; out.push({ x: -k * spacing * 0.9, y: side * k * spacing * 0.8 }); } }
    }
    return out;
  }
  rotOff(o: Pt, h: number): Pt { const c = dcos(h), sn = dsin(h); return { x: o.x * c - o.y * sn, y: o.x * sn + o.y * c }; }
  leashPoint(u: Unit, x: number, y: number): Pt {
    if (!this.needsOperator(u.def, u.team) || !u.operator || u.operator.dead) return { x, y };
    const R = this.linkRange(u) * 0.95, dd = hyp(x - u.operator.x, y - u.operator.y);
    if (dd <= R) return { x, y };
    return { x: u.operator.x + (x - u.operator.x) * R / dd, y: u.operator.y + (y - u.operator.y) * R / dd };
  }
  formationMove(list: Unit[], x: number, y: number, type: FormationType) {
    list = list.filter(u => !u.landed);
    if (!list.length) return;
    const cx = list.reduce((a, u) => a + u.x, 0) / list.length, cy = list.reduce((a, u) => a + u.y, 0) / list.length;
    const h = hyp(x - cx, y - cy) > 10 ? datan2(y - cy, x - cx) : list[0].angle;
    const offs = this.formationOffsets(list.length, type, 26);
    list.forEach((u, i) => {
      const o = this.rotOff(offs[i], h), lp = this.leashPoint(u, x + o.x, y + o.y);
      u.order = MOVE(clamp(lp.x, 6, W - 6), clamp(lp.y, 6, H - 6)); u.target = null;
    });
  }
  formSwarm(team: number, sel: Unit[], formation: FormationType) {
    sel = sel.filter(e => !e.dead && e.def.air && !e.def.auto && !e.grounded);
    if (!sel.length) return this.notify(team, 'Select airborne drones first');
    const one = this.swarmOf(sel[0]);
    if (one && sel.every(u => this.swarmOf(u) === one) && one.members.filter(m => !m.dead).length === sel.length) {
      for (const m of one.members) m.swarm = null; one.dead = true; this.notify(team, 'Swarm disbanded'); return;
    }
    const cap = SWARM_CAP[this.autoTier(team)];
    if (sel.length > cap) return this.notify(team, 'Automation tier ' + this.autoTier(team) + ' controls swarms of up to ' + cap);
    if (sel.length < 2) return this.notify(team, 'A swarm needs at least two drones');
    for (const u of sel) { const old = this.swarmOf(u); if (old) { old.members = old.members.filter(m => m !== u); if (old.members.length < 2) { for (const m of old.members) m.swarm = null; old.dead = true; } } }
    const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length, cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
    sel.sort((a, b) => hyp(a.x - cx, a.y - cy) - hyp(b.x - cx, b.y - cy));
    const sw: Swarm = { id: this.nextId++, team, members: sel.slice(), leader: sel[0], formation, dead: false, t: 0 };
    for (const u of sel) u.swarm = sw;
    this.swarms.push(sw);
    this.notify(team, 'Swarm of ' + sel.length + ' formed');
  }
  updateSwarms(dt: number) {
    for (const sw of this.swarms) {
      if (sw.dead) continue;
      sw.members = sw.members.filter(m => !m.dead);
      if (sw.members.length < 2) { for (const m of sw.members) m.swarm = null; sw.dead = true; continue; }
      if (!sw.leader || sw.leader.dead) sw.leader = sw.members[0];
      sw.t -= dt; if (sw.t > 0) continue; sw.t = 0.5;
      const L = sw.leader, offs = this.formationOffsets(sw.members.length, sw.formation, 26);
      sw.members.forEach((m, i) => {
        if (m === L || m.target || m.order.kind !== 'idle' || m.landed || L.landed || m.ambushed || this.piloted(m)) return;
        const o = this.rotOff(offs[i], L.angle), sx = L.x + o.x, sy = L.y + o.y;
        if (hyp(m.x - sx, m.y - sy) > 28) m.order = MOVE(clamp(sx, 6, W - 6), clamp(sy, 6, H - 6));
      });
    }
    this.swarms = this.swarms.filter(sw => !sw.dead);
  }
  swarmStrike(sw: Swarm): number {
    const L = sw.leader, team = sw.team;
    const T = (L.def.prefer && this.acquirePreferred(L, 1400)) || this.acquireFor(L, 1400, 0);
    if (!T) return 0;
    let n = 0;
    const near: Entity[] = [];
    for (const e of this.units) if (!e.dead && e.team !== team && e.team >= 0 && e.seenBy[team] && dist(e, T) < 140 && this.canEngage(L.def, e)) near.push(e);
    for (const st of this.structs) if (!st.dead && st.team === 1 - team && dist(st, T) < 140 && this.canEngage(L.def, st)) near.push(st);
    if (!near.includes(T)) near.unshift(T);
    sw.members.forEach((m, i) => { if (!m.def.kamikaze) return; const t = near[i % near.length]; if (!this.inLink(m, t)) return; m.order = ATTACK(t); m.target = t; n++; });
    return n;
  }

  // ---------------------------------------------------------------- player commands
  placementError(team: number, type: string, x: number, y: number): string | null {
    const def = STRUCTS[type];
    if (!def) return 'Unknown building';
    const hq = this.hq(team);
    if (!hq) return 'No headquarters';
    const nearTown = this.depots.some(d => d.owner === team && dist(d, { x, y }) <= TOWN_BUILD_RADIUS);
    if (dist(hq, { x, y }) > BUILD_RADIUS && !nearTown) return 'Build near headquarters or a town you hold';
    if (x < def.r + 10 || y < def.r + 10 || x > W - def.r - 10) return 'Too close to the map edge';
    for (const s of this.structs) if (!s.dead && dist(s, { x, y }) < s.r + def.r + 12) return 'Overlaps another building';
    if (!def.netR) for (const d of this.depots) if (dist(d, { x, y }) < d.r + def.r + 12) return 'Overlaps a town';
    if (!def.netR) for (const rs of this.resources) if (dist(rs, { x, y }) < rs.r + def.r + 8) return 'Overlaps ' + rs.name.toLowerCase();
    if (this.funds[team] < def.cost) return 'Not enough funds';
    return null;
  }
  /** own ground units inside a shell's splash around a point */
  dangerClose(team: number, x: number, y: number, r: number): number {
    let n = 0;
    for (const u of this.units) if (!u.dead && u.team === team && !u.def.air && !u.def.indirect && hyp(u.x - x, u.y - y) - u.def.r <= r) n++;
    return n;
  }
  /** a hull-down vehicle that is told to move leaves its scrape */
  private leaveHullDown(team: number, list: Unit[]) {
    let n = 0;
    for (const u of list) if (this.modeOf(u) === 'hullDown') { u.mode = 'mobile'; n++; }
    if (n) this.notify(team, n + ' vehicle' + (n > 1 ? 's' : '') + ' left hull-down to move');
  }
  private ownUnits(team: number, ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) { const e = this.find(id); if (e && e.isUnit && e.team === team && !e.def.auto) out.push(e); }
    return out;
  }
  private findEnemy(team: number, id: number): Entity | null {
    const e = this.find(id);
    if (!e || e.team === team || e.team < 0) return null;
    if (e.isUnit && !e.seenBy[team]) return null;
    return e;
  }

  apply(team: number, cmd: Command) {
    if (this.gameOver) return;
    switch (cmd.kind) {
      case 'move': {
        const sel = this.ownUnits(team, cmd.ids);
        const shakenN = sel.filter(e => e.shaken).length;
        if (shakenN) this.notify(team, shakenN + ' shaken squad' + (shakenN > 1 ? 's' : '') + ' ignored the order');
        const groundedN = sel.filter(e => e.grounded).length;
        if (groundedN) this.notify(team, groundedN + ' grounded drone' + (groundedN > 1 ? 's have' : ' has') + ' no operator and cannot take orders');
        const selUnits = sel.filter(e => !e.shaken && !e.grounded);
        if (!selUnits.length) return;
        if (cmd.queue) {
          // Shift+right-click: append a waypoint; units with nothing to do start on it at once
          const n0 = selUnits.length, cols0 = Math.ceil(Math.sqrt(Math.max(1, n0))), rows0 = Math.ceil(n0 / cols0);
          selUnits.forEach((u, i) => {
            const c = i % cols0, r = Math.floor(i / cols0);
            const wp = { x: clamp(cmd.x + (c - (cols0 - 1) / 2) * 28, 6, W - 6), y: clamp(cmd.y + (r - (rows0 - 1) / 2) * 28, 6, (u.def.air ? H : H_LAND) - 6) };
            if (u.order.kind === 'move' && u.waypoints !== undefined ? true : u.order.kind === 'move') { (u.waypoints ||= []).push(wp); }
            else { u.waypoints = []; u.order = MOVE(wp.x, wp.y); u.target = null; this.planRoute(u, wp.x, wp.y); }
          });
          this.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.5, team });
          return;
        }
        for (const u of selUnits) u.waypoints = undefined;
        this.leaveHullDown(team, selUnits);
        const airSel = selUnits.filter(u => u.def.air), groundSel = selUnits.filter(u => !u.def.air);
        const talker = groundSel.find(u => u.def.troop) || groundSel[0]; if (talker) this.bark('ack', talker);
        if (airSel.length) {
          const seen = new Set<Swarm>();
          for (const u of airSel) { const sw = this.swarmOf(u); if (sw && !seen.has(sw)) { seen.add(sw); this.formationMove(sw.members, cmd.x, cmd.y, sw.formation); } }
          this.formationMove(airSel.filter(u => !this.swarmOf(u)), cmd.x, cmd.y, cmd.formation);
          // a guarding interceptor's post moves with it
          for (const u of airSel) if (this.modeOf(u) === 'guard' && u.order.kind === 'move') u.post = { x: u.order.x, y: u.order.y };
        }
        const n = groundSel.length, cols = Math.ceil(Math.sqrt(Math.max(1, n))), sp = 28, rows = Math.ceil(n / cols);
        groundSel.forEach((u, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          u.order = MOVE(clamp(cmd.x + (c - (cols - 1) / 2) * sp, 6, W - 6), clamp(cmd.y + (r - (rows - 1) / 2) * sp, 6, H_LAND - 6));
          u.target = null; this.planRoute(u, u.order.x, u.order.y);
        });
        this.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.5, team });
        return;
      }
      case 'attack': {
        const enemy = this.findEnemy(team, cmd.targetId);
        if (!enemy) return;
        const selUnits = this.ownUnits(team, cmd.ids).filter(e => !e.shaken && !e.grounded);
        for (const u of selUnits) u.waypoints = undefined;
        this.leaveHullDown(team, selUnits.filter(u => !this.canHitTarget(u, enemy) || dist(u, enemy) > this.rangeOf(u)));
        const shouter = selUnits.find(u => u.def.troop); if (shouter) this.bark('attack', shouter);
        { const guns = selUnits.filter(u => u.def.indirect); if (guns.length) { const close = this.dangerClose(team, enemy.x, enemy.y, Math.max(...guns.map(a => a.def.splash || 0)) + 14); if (close) this.notify(team, 'DANGER CLOSE: ' + close + ' of your own unit' + (close > 1 ? 's are' : ' is') + ' next to that target. Shells splash friend and foe alike'); } }
        let warned = false;
        for (const u of selUnits) {
          if (u.landed) continue;
          if (this.needsOperator(u.def, u.team) && !this.inLink(u, enemy)) { const lp = this.leashPoint(u, enemy.x, enemy.y); u.order = MOVE(lp.x, lp.y); u.target = null; if (!warned) { warned = true; this.notify(team, 'Target is beyond that drone\'s control range: move its squad closer'); } }
          else if (this.canHitTarget(u, enemy)) { u.order = ATTACK(enemy); u.target = enemy; }
          else { u.order = MOVE(enemy.x + this.rand(-30, 30), enemy.y + this.rand(-30, 30)); this.planRoute(u, u.order.x, u.order.y); }
        }
        this.effects.push({ kind: 'mark', x: enemy.x, y: enemy.y, t: 0, dur: 0.5, red: true, team });
        return;
      }
      case 'bombard': {
        const arty = this.ownUnits(team, cmd.ids).filter(e => e.def.indirect);
        if (!arty.length) return this.notify(team, 'Select artillery first');
        const close = this.dangerClose(team, cmd.x, cmd.y, Math.max(...arty.map(a => a.def.splash || 0)) * (this.inVision(team, cmd.x, cmd.y) ? 1 : 2.4));
        if (close) this.notify(team, 'DANGER CLOSE: ' + close + ' of your own unit' + (close > 1 ? 's are' : ' is') + ' inside the beaten zone. Shells do not know whose troops are under them');
        for (const u of arty) { u.order = { kind: 'bombard', x: cmd.x, y: cmd.y, target: null }; u.target = null; u.path = null; }
        this.bark('bombard', arty[0]);
        this.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.8, red: true, team });
        this.notify(team, arty.length + ' gun' + (arty.length > 1 ? 's' : '') + ' firing on the area' + (this.inVision(team, cmd.x, cmd.y) ? '' : ', unobserved: wider scatter'));
        return;
      }
      case 'dig': {
        const troops = this.ownUnits(team, cmd.ids).filter(e => e.def.troop && !e.shaken);
        if (!troops.length) return this.notify(team, 'Select troops first');
        let n = 0;
        for (const u of troops) { if (this.trenchAt(u.x, u.y)) continue; u.order = { kind: 'dig', x: u.x, y: u.y, target: null }; u.target = null; u.path = null; u.digT = DIG_TIME; n++; }
        this.notify(team, n ? n + ' squad' + (n > 1 ? 's' : '') + ' digging in: ' + DIG_TIME + ' seconds' : 'Already in a trench');
        return;
      }
      case 'strike': {
        const sel = this.ownUnits(team, cmd.ids).filter(e => e.def.kamikaze && !e.grounded);
        if (!sel.length) return this.notify(team, 'Select airborne kamikaze drones first');
        let n = 0;
        const done = new Set<Swarm>();
        for (const u of sel) {
          const sw = this.swarmOf(u);
          if (sw) { if (!done.has(sw)) { done.add(sw); n += this.swarmStrike(sw); } continue; }
          const t = (u.def.prefer && this.acquirePreferred(u, 1400)) || this.acquireFor(u, 1400, 0);
          if (t && this.inLink(u, t)) { u.order = ATTACK(t); u.target = t; n++; }
        }
        this.notify(team, n ? n + ' drone' + (n > 1 ? 's' : '') + ' diving' + (done.size ? ' as a swarm' : '') : 'No target in sight for them');
        if (n) { const op = sel[0].operator && !sel[0].operator.dead ? sel[0].operator : this.nearestTroop(team, sel[0].x, sel[0].y, 900); if (op) this.bark('strike', op); }
        return;
      }
      case 'swarm': return this.formSwarm(team, this.ownUnits(team, cmd.ids), cmd.formation);
      case 'swarmFormation': { const sw = this.swarms.find(s => s.id === cmd.swarmId && s.team === team && !s.dead); if (sw) sw.formation = cmd.formation; return; }
      case 'rally': {
        let n = 0;
        for (const id of cmd.ids) { const e = this.find(id); if (e && e.isStruct && e.team === team && e.def.produces) { e.rally = { x: cmd.x, y: cmd.y }; n++; } }
        if (n) this.notify(team, 'Rally point set');
        return;
      }
      case 'place': {
        const err = this.placementError(team, cmd.type, cmd.x, cmd.y);
        if (err) return this.notify(team, err);
        this.funds[team] -= STRUCTS[cmd.type].cost;
        this.structs.push(this.makeStruct(cmd.type, team, cmd.x, cmd.y, false));
        return;
      }
      case 'enqueue': {
        const fac = this.find(cmd.facId);
        if (!fac || !fac.isStruct || fac.team !== team || !fac.def.produces || !fac.def.produces.includes(cmd.type)) return;
        return this.enqueue(team, fac, cmd.type);
      }
      case 'cancel': {
        const fac = this.find(cmd.facId);
        if (!fac || !fac.isStruct || fac.team !== team) return;
        const type = fac.queue[cmd.index]; if (!type) return;
        fac.queue.splice(cmd.index, 1); this.funds[team] += UNITS[type].cost;
        if (cmd.index === 0) fac.progress = 0;
        return;
      }
      case 'upgrade': return this.buyUpgrade(team, cmd.key);
      case 'ops': {
        const squads = this.ownUnits(team, cmd.ids).filter(u => u.def.operator);
        if (!squads.length) return this.notify(team, 'Select an infantry squad first');
        let n = 0;
        for (const u of squads) {
          if (cmd.delta > 0) { if ((u.ops || 1) >= OPS_MAX) continue; if (this.freePeople(team) < 1) { this.notify(team, 'No free personnel to add'); break; } u.ops = (u.ops || 1) + 1; n++; }
          else if ((u.ops || 1) > 1) { u.ops = (u.ops || 1) - 1; n++; }
        }
        if (n) { this.notify(team, cmd.delta > 0 ? n + ' operator' + (n > 1 ? 's' : '') + ' joined: each flies ' + this.opCap(team) + ' drones' : n + ' operator' + (n > 1 ? 's' : '') + ' returned to the pool'); if (cmd.delta > 0) this.bark('ops', squads[0]); }
        else if (cmd.delta > 0) this.notify(team, 'A squad holds at most ' + OPS_MAX + ' operators');
        return;
      }
      case 'kab': {
        const cost = STRIKES.kab.cost[team];
        if (this.kabT[team] > 0) return this.notify(team, 'Aviation reloading: ' + Math.ceil(this.kabT[team]) + ' s');
        if (this.funds[team] < cost) return this.notify(team, 'A glide bomb strike costs ' + cost + ' funds');
        this.funds[team] -= cost; this.kabT[team] = this.kabCooldown(team); this.stats.kabs[team]++;
        this.scheduleStrike(team, 'kab', clamp(cmd.x, 20, W - 20), clamp(cmd.y, 20, H_LAND - 20));
        this.notify(team, 'Glide bomb on the way: ' + STRIKES.kab.warn + ' seconds to impact');
        return;
      }
      case 'deep': {
        if (team !== UA) return this.notify(team, 'Only Ukraine flies deep strikes');
        if (this.deepT > 0) return this.notify(team, 'Deep strike crews preparing: ' + Math.ceil(this.deepT) + ' s');
        if (this.deepPending) return this.notify(team, 'A deep strike is already in the air');
        const li = this.units.find(u => !u.dead && u.team === UA && u.type === 'liutyi' && u.order.kind !== 'attack');
        if (!li) return this.notify(team, 'Needs an idle Liutyi: build one at the launch site');
        if (this.funds[UA] < STRIKES.deep.cost) return this.notify(team, 'A deep strike costs ' + STRIKES.deep.cost + ' funds');
        this.funds[UA] -= STRIKES.deep.cost; this.deepT = STRIKES.deep.cooldown; this.killUnit(li, true);
        this.deepPending = { at: this.gameTime + STRIKES.deep.delay, hit: this.rng.next() < STRIKES.deep.chance };
        this.notify(UA, 'Liutyi away toward a refinery inside Russia: ' + STRIKES.deep.delay + ' seconds of flight'); this.addLog(UA, 'info', 'A Liutyi left for the Russian interior');
        return;
      }
      case 'iskander': {
        if (team !== RU) return this.notify(team, 'Only Russia has Iskanders here');
        if (this.missileT > 0) return this.notify(team, 'Missile brigade reloading: ' + Math.ceil(this.missileT) + ' s');
        if (this.funds[RU] < STRIKES.missile.cost) return this.notify(team, 'A missile strike costs ' + STRIKES.missile.cost + ' funds');
        const t = this.find(cmd.targetId); if (!t || !t.isStruct || t.team === RU) return this.notify(team, 'Pick an enemy building');
        this.funds[RU] -= STRIKES.missile.cost; this.missileT = STRIKES.missile.cooldown; this.stats.missiles++;
        this.scheduleStrike(RU, 'missile', t.x, t.y, t.id);
        this.notify(RU, 'Iskander launched: ' + STRIKES.missile.warn + ' seconds to impact');
        return;
      }
      case 'mode': {
        const sel = this.ownUnits(team, cmd.ids).filter(u => { const m = modesOf(u.type); return !!m && m.some(x => x.key === cmd.mode); });
        if (!sel.length) return;
        let n = 0, label = '';
        for (const u of sel) {
          if (this.modeOf(u) === cmd.mode) continue;
          u.mode = cmd.mode; n++; label = modesOf(u.type)!.find(x => x.key === cmd.mode)!.label;
          if (cmd.mode === 'hullDown') { u.order = IDLE(); u.path = null; u.waypoints = undefined; }
          if (cmd.mode === 'guard') u.post = { x: u.x, y: u.y };
          if (cmd.mode === 'hunt' || cmd.mode === 'hold') u.ambushed = false;
          if (cmd.mode !== 'scoot') { u.scoot = null; u.scootPending = false; }
        }
        if (n) this.notify(team, n + ' unit' + (n > 1 ? 's' : '') + ' switched to ' + label);
        return;
      }
      case 'steer': {
        const u = this.find(cmd.id);
        if (!u || !u.isUnit || u.team !== team || !u.def.air || u.def.auto || u.grounded || u.landed) return;
        u.pilotT = PILOT.hold; u.ambushed = false; u.waypoints = undefined;
        const enemy = cmd.targetId !== undefined ? this.findEnemy(team, cmd.targetId) : null;
        if (enemy && this.canHitTarget(u, enemy) && this.inLink(u, enemy)) { u.order = ATTACK(enemy); u.target = enemy; u.diveAt = null; return; }
        const lp = this.leashPoint(u, clamp(cmd.x, 6, W - 6), clamp(cmd.y, 6, H - 6));
        u.order = MOVE(lp.x, lp.y); u.target = null;
        u.diveAt = cmd.dive && u.def.kamikaze ? { x: lp.x, y: lp.y } : null;
        return;
      }
      case 'wave': {
        if (team !== RU) return this.notify(team, 'Only Russia launches Geran waves');
        if (this.waveT > 0) return this.notify(team, 'Launch crews reloading: ' + Math.ceil(this.waveT) + ' s');
        if (this.funds[RU] < WAVE_COST) return this.notify(team, 'A Geran wave costs ' + WAVE_COST + ' funds');
        this.funds[RU] -= WAVE_COST; this.waveT = WAVE_COOLDOWN; this.stats.waves[RU]++;
        this.spawnShaheds(3, true);
        this.notify(RU, 'Geran wave launched: three drones and four decoys are on their way, the first two at the substation');
        return;
      }
    }
  }

  enqueue(team: number, fac: Struct, type: string) {
    const def = UNITS[type];
    if (!fac || fac.dead || !def) return;
    if (fac.build < 1) return this.notify(team, 'Still under construction');
    if (fac.queue.length >= 5) return this.notify(team, 'Production queue is full');
    if (this.funds[team] < def.cost) return this.notify(team, 'Not enough funds');
    if (this.freePeople(team) < this.crewOf(def, team)) return this.notify(team, 'Not enough personnel: needs ' + this.crewLabel(def, team) + ', ' + Math.floor(this.freePeople(team)) + ' free');
    if (this.needsOperator(def, team) && this.freeSlots(team) < 1) this.notify(team, 'No free operator: this drone will sit grounded at the works until a squad has a free slot');
    if (def.side !== undefined && def.side !== team) return this.notify(team, 'Not available to your side');
    if (FUEL_USERS.has(type) && this.supply[team].fuelUsed + 1 > this.supply[team].fuelCap) return this.notify(team, 'No fuel for another ' + (def.air ? 'aircraft' : 'vehicle') + ': ' + this.supply[team].fuelUsed + ' of ' + this.supply[team].fuelCap + '. Hold gas sites and keep the pipeline pumping.');
    if (def.electric && this.supply[team].powerUsed + 1 > this.supply[team].powerCap) return this.notify(team, 'No charging capacity for another battery drone: ' + this.supply[team].powerUsed + ' of ' + this.supply[team].powerCap + '. Keep the substation standing or build generator sets.');
    if (def.troop && this.supply[team].foodUsed + 1 > this.supply[team].foodCap) this.notify(team, 'Warning: this squad will go hungry, ' + this.supply[team].foodCap + ' can be fed. Take more wheat fields.');
    if (def.cap && this.typeCount(team, type) >= def.cap) return this.notify(team, 'No more ' + def.label[team] + 's available: at most ' + def.cap + ' squads');
    if (def.air && fac.overheated) this.notify(team, 'Works overheated: the drone joins the backlog until it cools');
    this.funds[team] -= def.cost; fac.queue.push(type);
  }
  buyUpgrade(team: number, key: string) {
    const u = UPGRADES[key];
    if (!u || this.upgrades[team][key]) return;
    if (key === 'aid' && team === UA && this.support < 60) return this.notify(team, 'Aid needs support of at least 60%');
    if (u.requires && !this.upgrades[team][u.requires]) return this.notify(team, 'Needs ' + upgLabel(team, u.requires) + ' first');
    if (this.funds[team] < u.cost) return this.notify(team, 'Not enough funds');
    this.funds[team] -= u.cost; this.upgrades[team][key] = true; this.notify(team, upgLabel(team, key) + ' acquired'); this.addLog(team, 'research', TEAMS[team].name + ' researched ' + upgLabel(team, key));
    if (key === 'mobilization') this.people[team].total = Math.min(240, this.people[team].total + 40);
    if (key === 'auto3') for (const d of this.units) if (d.team === team && d.operator && !d.def.tether) { if (d.operator.drones) d.operator.drones = d.operator.drones.filter(x => x !== d); d.operator = null; }
  }
}

export function isVehicle(t: Entity): boolean { return !!t.isUnit && !t.def.air && !t.def.troop; }
/** rock, paper, scissors: how hard a weapon hits this kind of target */
export function matchup(src: UnitDef | undefined, t: Entity): number {
  if (!src) return 1;
  if (t.isStruct) return src.vsStruct || 1;
  if (t.def.air) return (t.def.large || t.def.structuresOnly) ? (src.vsAirLarge || 1) : (src.vsAirSmall || 1);
  if (t.def.troop) return src.vsInf || 1;
  return src.vsVehicle || 1;
}
export function rOf(e: Entity): number { return e.isStruct ? e.r : e.def.r; }
