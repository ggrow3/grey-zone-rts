// The Grey Zone simulation. Pure and deterministic: no DOM, no Math.random, no player-specific branches.
// The same Game, fed the same seed and the same per-turn commands, produces the same state on every client.
import { UA, RU, UNITS, STRUCTS, CIV_TYPES, CIV_SITES, UPGRADES, COVER, FUEL_USERS, TRUCK_LOAD, TRUCK_PERIOD, TOWN_BUILD_RADIUS, BUILD_RADIUS,
  AUTO_SMALL, AUTO_LARGE, OP_CAP, SWARM_CAP, GAS_YIELD, FOOD_BASE, FOOD_PER_FIELD, FUEL_BASE, FUEL_PER_NODE, POWER_BASE, POWER_PER_SUBSTATION, POWER_PER_GENERATOR, upgLabel } from './data';
import type { UnitDef, FormationType, TargetClass } from './data';
import { W, H, H_LAND, geo, TOWNS, RESOURCES, PIPELINES, placePos, KHARKIV, BELGOROD } from './map';
import { Rng } from './rng';
import { hyp, dist, clamp, dsin, dcos, datan2 } from './dmath';
import { getTerrain, Terrain } from './terrain';
import type { Unit, Struct, Entity, Site, PumpSite, Projectile, Effect, Swarm, Supply, Bot, Notice, Scorch, Command, Order, Pt } from './types';
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
}

export const IDLE = (): Order => ({ kind: 'idle', x: 0, y: 0, target: null });
export const MOVE = (x: number, y: number): Order => ({ kind: 'move', x, y, target: null });
export const ATTACK = (t: Entity): Order => ({ kind: 'attack', x: 0, y: 0, target: t });

export class Game {
  rng: Rng; terrain: Terrain;
  units: Unit[] = []; structs: Struct[] = []; projectiles: Projectile[] = []; effects: Effect[] = [];
  depots: Site[] = []; resources: Site[] = []; pumpSites: PumpSite[] = [];
  funds = [1200, 300];
  upgrades: [Record<string, boolean>, Record<string, boolean>] = [{}, {}];
  stats = { built: [0, 0], lost: [0, 0], drones: [0, 0], deliveries: [0, 0], peopleLost: [0, 0], shotDown: [0, 0], kills: [0, 0] };
  support = 100;
  people = [{ total: 70 }, { total: 70 }];
  civ = { lost: [0, 0], harmedByUA: 0, defectors: 0, carsKilled: [0, 0] };
  defectT = 0; volunteerT = 0; carT = 0;
  vision: { x: number; y: number; r: number }[][] = [[], []];
  gameTime = 0; gameOver = false; winner = -1;
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
  }

  // ---------------------------------------------------------------- helpers
  rand(a: number, b: number): number { return this.rng.range(a, b); }
  notify(team: number, text: string) { this.notices.push({ team, text, at: this.gameTime }); }
  drainNotices(team: number): string[] { const out = this.notices.filter(n => n.team === team || n.team < 0).map(n => n.text); this.notices = []; return out; }
  find(id: number): Entity | undefined { const e = this.byId.get(id); return e && !e.dead ? e : undefined; }
  visMul(team: number): number { return this.upgrades[team].thermal ? 1.25 : 1; }
  rangeOf(u: Unit): number { let r = u.def.range || 0; if (u.def.indirect && this.upgrades[u.team].shells) r += 90; if (!u.def.air && u.def.targets && u.def.targets.includes('air') && this.upgrades[u.team].aaRange) r += 40; return r; }
  teamMul(team: number): number { return this.isBot[team] ? this.difficulty * (1 + this.gameTime / 1800) : 1; }
  pipelineIntact(team: number): boolean { return this.pumpSites.filter(ps => ps.team === team).every(ps => ps.struct && !ps.struct.dead && ps.struct.build >= 1); }
  gasIncome(team: number): number { return this.pipelineIntact(team) ? this.resources.filter(r => r.kind === 'gas' && r.owner === team).reduce((a, r) => a + (r.yieldRate || 0), 0) : 0; }
  wheatHeld(team: number): number { return this.resources.filter(r => r.kind === 'wheat' && r.owner === team && r.burnT <= 0).length; }
  income(team: number): number {
    if (team === RU) return (12 + this.gasIncome(RU)) * this.teamMul(RU);
    return Math.max(4, 12 * (0.4 + 0.6 * this.support / 100) - Math.min(6, this.civ.lost[0] * 0.5) + (this.upgrades[UA].aid ? 8 : 0)) + this.gasIncome(UA);
  }
  expectedIncome(team: number): number { return this.income(team) + this.depots.filter(d => d.owner === team).length * TRUCK_LOAD / TRUCK_PERIOD * this.teamMul(team); }
  upgAvailable(team: number, key: string): boolean { const u = UPGRADES[key]; return !this.upgrades[team][key] && (!u.requires || !!this.upgrades[team][u.requires]); }
  logiMul(team: number): number { return this.upgrades[team].logistics ? 1.5 : 1; }
  autoTier(team: number): number { return this.upgrades[team].auto3 ? 3 : this.upgrades[team].auto2 ? 2 : this.upgrades[team].auto1 ? 1 : 0; }
  opCap(team: number): number { return OP_CAP[this.autoTier(team)]; }
  typeCount(team: number, type: string): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead && u.type === type) n++;
    for (const st of this.structs) if (st.team === team && !st.dead && st.queue) for (const q of st.queue) if (q === type) n++;
    return n;
  }
  moraleMul(u: Unit): number { return u.def.morale ? 0.5 + 0.5 * (u.morale === undefined ? 100 : u.morale) / 100 : 1; }
  /** Russian drones are automated from the start; Ukrainian drones need a squad until Full autonomy */
  needsOperator(def: UnitDef, team: number): boolean { if (def.tether) return true; return !!def.operated && team === UA && this.autoTier(UA) < 3; }
  operatorsOf(team: number): Unit[] { return this.units.filter(u => u.team === team && !u.dead && u.def.operator); }
  linkRange(u: Unit): number { return (u.def.link || 650) + (this.upgrades[u.team].auto1 ? 150 : 0) + (this.upgrades[u.team].relay ? 250 : 0); }
  droneCount(op: Unit): number { return op.drones ? op.drones.filter(d => !d.dead).length : 0; }
  freeSlots(team: number): number { let n = 0; for (const op of this.operatorsOf(team)) n += Math.max(0, this.opCap(team) - this.droneCount(op)); return n; }
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
      if (this.droneCount(op) >= this.opCap(u.team)) continue;
      const dd = dist(u, op); if (dd < 900 && dd < bd) { bd = dd; best = op; }
    }
    if (best) this.linkDrone(u, best);
    return best;
  }
  inLink(u: Unit, t: Pt): boolean { return !this.needsOperator(u.def, u.team) || !u.operator || u.operator.dead || dist(t, u.operator) <= this.linkRange(u); }
  crewOf(def: UnitDef, team: number): number { if (!def.crew) return 0; if (!def.air) return def.crew; return def.crew / (def.large ? AUTO_LARGE : AUTO_SMALL)[this.autoTier(team)]; }
  busyPeople(team: number): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead) n += this.crewOf(u.def, team);
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
    for (let i = 0; i < list.length; i++) { const c = list[i]; if (hyp(c.x - x, c.y - y) <= Math.min(maxD, c.r)) return true; }
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
      angle: team === UA ? -Math.PI / 2 : Math.PI / 2, netsSeen: [], dest: null, jamT: 0, salvoLeft: 0, salvoT: 0 };
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
    this.cleanup();
    for (const b of this.bots) if (b) updateBot(this, b, dt);
  }

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
    for (const u of this.units) if (!u.dead && u.team >= 0) this.vision[u.team].push({ x: u.x, y: u.y, r: u.def.vision * this.visMul(u.team) * (u.def.air && this.upgrades[u.team].nightOps ? 1.3 : 1) });
    for (const s of this.structs) if (!s.dead && s.build >= 1 && s.team >= 0) this.vision[s.team].push({ x: s.x, y: s.y, r: s.def.vision * this.visMul(s.team) });
    for (const u of this.units) {
      if (u.dead) continue;
      u.cover = u.def.air ? 'open' : (u.def.troop && this.trenchAt(u.x, u.y)) ? 'trench' : this.terrain.coverOf(u.x, u.y);
      if (!u.def.air) u.onRoad = this.terrain.onRoadAt(u.x, u.y);
      const hid = u.def.troop && u.cover !== 'open' ? COVER[u.cover].spot : 0;
      u.seenBy[UA] = u.team === UA || (hid ? this.inVisionClose(UA, u.x, u.y, hid) : this.inVision(UA, u.x, u.y));
      u.seenBy[RU] = u.team === RU || (hid ? this.inVisionClose(RU, u.x, u.y, hid) : this.inVision(RU, u.x, u.y));
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
      let a = 0, b = 0;
      for (const u of this.units) {
        if (u.dead || !u.def.canCapture) continue;
        if (dist(u, d) <= d.r) { if (u.team === UA) a++; else b++; }
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
      if (u.dead || !u.def.netted || u.landed) continue;
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
    for (const u of this.units) if (!u.dead && u.def.jam) src.push({ x: u.x, y: u.y, r: u.def.jam, team: u.team });
    for (const s of this.structs) if (!s.dead && s.build >= 1 && s.def.jam) src.push({ x: s.x, y: s.y, r: s.def.jam, team: s.team });
    if (!src.length) return;
    for (const u of this.units) {
      if (u.dead || !u.def.air || !u.def.jammable || u.landed) continue;
      for (const j of src) {
        if (j.team === u.team) continue;
        if (dist(u, j) <= j.r + (this.upgrades[j.team].ewPlus ? 60 : 0)) { u.hp -= 30 * (this.upgrades[u.team].freqHop ? 0.5 : 1) * dt; u.jamT = 0.2; if (u.hp <= 0) { this.killUnit(u, false, j.team); break; } }
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
      for (const op of this.operatorsOf(s.team)) { if (this.droneCount(op) >= this.opCap(s.team)) continue; const dd = dist(op, s); if (dd < bd) { bd = dd; best = op; } }
      if (best) this.linkDrone(u, best); else { u.grounded = true; u.order = IDLE(); u.x = s.x + this.rand(-40, 40); u.y = s.y + (s.team === UA ? -1 : 1) * (s.r + 30 + this.rand(0, 30)); }
    }
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
    if (cls === 'air' && (e as Unit).def.highAlt && srcDef.lowAlt) return false;
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
    const step = Math.min(dd, u.def.speed * (u.onRoad ? (u.def.roadMul || 1.4) : 1) * (u.def.morale ? 0.7 + 0.3 * this.moraleMul(u) : 1) * this.fuelMul(u) * dt);
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
    u.cool -= dt; if (u.jamT > 0) u.jamT -= dt;
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
      if (u.landed) { u.rechargeT! -= dt * (u.team >= 0 && this.supply[u.team].power < 1 ? 1 / 3 : 1); if (u.rechargeT! <= 0) { u.landed = false; u.batt = d.endurance; u.grace = 0; } return; }
      const diving = d.kamikaze && u.target && !u.target.dead;
      if (!diving) u.batt -= dt;
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
    if (d.kamikaze) { this.updateKamikaze(u, dt); return; }

    if (u.salvoLeft > 0) {
      if (u.salvoAt) { u.salvoT -= dt; if (u.salvoT <= 0) { this.launchShellAt(u, u.salvoAt.x, u.salvoAt.y, u.salvoAt.spread); u.salvoLeft--; u.salvoT = 0.18; } }
      else if (!u.target || u.target.dead) u.salvoLeft = 0;
      else { u.salvoT -= dt; if (u.salvoT <= 0) { this.launchShell(u, u.target); u.salvoLeft--; u.salvoT = 0.18; } }
    }
    if (u.order.kind === 'dig') {
      u.digT = (u.digT === undefined ? 20 : u.digT) - dt;
      u.target = null;
      if (u.digT <= 0) {
        u.digT = undefined;
        if (!this.trenchAt(u.x, u.y)) { const tr = this.makeStruct('trench', u.team, u.x, u.y, true); tr.hp = tr.def.hp; this.structs.push(tr); this.notify(u.team, 'Trench dug'); }
        u.order = IDLE();
      }
      return;
    }
    u.digT = undefined;
    if (u.order.kind === 'bombard' && d.indirect) {
      const dd = dist(u, u.order);
      if (dd > range) this.moveToward(u, u.order.x, u.order.y, dt);
      else if (minR && dd < minR) this.moveAway(u, u.order, dt);
      else if (u.cool <= 0) {
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

    let tgt: Entity | null = null;
    if (u.order.kind === 'attack') tgt = u.order.target;
    else if (d.dmg > 0) {
      const hunt = d.acquire ? d.acquire + (this.upgrades[u.team].repeaters ? 120 : 0) : range;
      if (u.target && dist(u, u.target) <= Math.max(range, hunt) && this.canSee(u, u.target)) tgt = u.target;
      else tgt = this.acquireFor(u, u.order.kind === 'idle' ? hunt : range, minR);
    }
    u.target = tgt;

    if (u.order.kind === 'move') {
      const dd = dist(u, u.order);
      const last = this.stepMove(u, u.order.x, u.order.y, dt);
      if ((last === true && dd < 6) || last === 'stalled') { u.order = IDLE(); u.path = null; }
    } else if (u.order.kind === 'attack' && tgt) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (dd > range * 0.9) this.moveToward(u, tgt.x, tgt.y, dt);
      else if (minR && dd < minR) this.moveAway(u, tgt, dt);
    } else if (u.order.kind === 'idle' && tgt) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (d.acquire && dd > range * 0.9) this.moveToward(u, tgt.x, tgt.y, dt);
      else if (minR && dd < minR) this.moveAway(u, tgt, dt);
    }

    if (tgt && d.dmg > 0 && u.cool <= 0) {
      const dd = dist(u, tgt) - (tgt.isStruct ? tgt.r * 0.5 : 0);
      if (dd <= range && dd >= minR && this.canSee(u, tgt) && this.canHitTarget(u, tgt)) this.fireAt(u, tgt);
    }
  }

  updateKamikaze(u: Unit, dt: number) {
    const d = u.def;
    if (u.order.kind === 'attack' && u.order.target && !u.order.target.dead) u.target = u.order.target;
    if (!u.target) {
      if (u.order.kind === 'move') {
        const dd = dist(u, u.order);
        this.moveToward(u, u.order.x, u.order.y, dt);
        if (dd < 6) u.order = IDLE();
      }
      if (d.acquire! > 0) {
        const reach = d.acquire! + (this.upgrades[u.team].repeaters ? 120 : 0);
        const t = (d.prefer && this.acquirePreferred(u, reach)) || this.acquireFor(u, reach, 0);
        if (t && this.inLink(u, t)) { u.target = t; u.order = ATTACK(t); }
      }
      return;
    }
    this.moveToward(u, u.target.x, u.target.y, dt);
    if (dist(u, u.target) <= rOf(u.target) + 4) {
      if (d.dmg > 0) { this.explosionFx(u.x, u.y, (d.splash || 0) + 14, true); this.damageArea(u.x, u.y, d.splash || 0, d.dmg, u.team, u.target, 1, 1, true); }
      else this.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.4 });
      this.killUnit(u, true);
    }
  }

  fireAt(u: Unit, t: Entity) {
    const d = u.def;
    u.cool = d.rof || 1;
    u.angle = datan2(t.y - u.y, t.x - u.x);
    if (d.indirect) {
      this.launchShell(u, t);
      if (d.salvo) { u.salvoLeft = d.salvo - 1; u.salvoT = 0.18; }
    } else {
      this.directHit(u, t, d.dmg * (d.troop ? COVER[u.cover || 'open'].give * this.foodMul(u.team) : 1) * this.moraleMul(u) * (!d.air && this.upgrades[u.team].ammo ? 1.15 : 1), d.splash || 0);
    }
  }
  directHit(src: Unit, t: Entity, dmg: number, splash: number) {
    this.effects.push({ kind: 'tracer', x: src.x, y: src.y, tx: t.x, ty: t.y, t: 0, dur: 0.12, team: src.team });
    if (t.isUnit && t.def.air) {
      const ev = clamp((t.def.evade || 0) + (t.team >= 0 && this.upgrades[t.team].evasion ? 0.15 : 0) - (src.team >= 0 && this.upgrades[src.team].gunnery ? 0.15 : 0), 0, 0.85);
      if (this.rng.next() < ev) { this.effects.push({ kind: 'hit', x: t.x + this.rand(-14, 14), y: t.y + this.rand(-14, 14), t: 0, dur: 0.15 }); return; }
    }
    const vs = src.def.vsStruct || 1, vv = src.def.vsVehicle || 1;
    if (splash > 0) { this.explosionFx(t.x, t.y, splash * 0.7, false); this.damageArea(t.x, t.y, splash, dmg, src.team, t, vs, vv, !!src.def.air); }
    else { this.applyDamage(t, t.isStruct ? dmg * vs : isVehicle(t) ? dmg * vv : dmg, src.team, !!src.def.air); this.effects.push({ kind: 'hit', x: t.x + this.rand(-3, 3), y: t.y + this.rand(-3, 3), t: 0, dur: 0.18 }); }
  }
  launchShell(u: Unit, t: Entity) { this.launchShellAt(u, t.x, t.y, 1); }
  launchShellAt(u: Unit, px: number, py: number, spreadMul: number) {
    const d = u.def;
    const spread = (d.salvo ? 34 : 14) * (spreadMul || 1);
    const tx = px + this.rand(-spread, spread), ty = py + this.rand(-spread, spread);
    const dd = hyp(tx - u.x, ty - u.y);
    this.projectiles.push({ x: u.x, y: u.y, sx: u.x, sy: u.y, tx, ty, t: 0, dur: dd / (d.shellSpeed || 260), dmg: d.dmg * (this.upgrades[u.team].ammo ? 1.15 : 1), splash: d.splash || 0, team: u.team,
      arc: Math.min(110, dd * 0.22), rocket: !!d.salvo, dead: false });
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
      this.damageArea(p.tx, p.ty, p.splash, p.dmg, p.team, null);
    }
  }
  damageArea(x: number, y: number, r: number, dmg: number, team: number, primary: Entity | null, vsStruct?: number, vsVehicle?: number, drone?: boolean) {
    const vs = vsStruct || 1, vv = vsVehicle || 1;
    if (dmg >= 30) for (const rs of this.resources) if (rs.kind === 'wheat' && rs.burnT <= 0 && hyp(rs.x - x, rs.y - y) < rs.r) { rs.burnT = 60; if (rs.owner >= 0) this.notify(rs.owner, 'Wheat field burning'); }
    for (const e of this.units) {
      if (e.dead || e.team === team || e.def.air) continue;
      const dd = hyp(e.x - x, e.y - y) - e.def.r;
      if (dd <= r) this.applyDamage(e, (e === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * (isVehicle(e) ? vv : 1), team, drone);
    }
    for (const s of this.structs) {
      if (s.dead || s.team === team) continue;
      const dd = hyp(s.x - x, s.y - y) - s.r;
      if (dd <= r) this.applyDamage(s, (s === primary ? dmg : dmg * (1 - 0.6 * clamp(dd / r, 0, 1))) * vs, team);
    }
  }
  applyDamage(t: Entity, amt: number, team: number, drone?: boolean) {
    if (t.dead) return;
    if (drone && t.isUnit && isVehicle(t) && t.team >= 0 && this.upgrades[t.team].cages) amt *= 0.65;
    if (t.isUnit && t.def.troop) { const cv = COVER[t.cover || 'open']; amt *= cv.take; if (drone) amt *= cv.drone; }
    if (t.isUnit && t.def.morale) t.morale = clamp((t.morale === undefined ? 90 : t.morale) - amt * 0.25, 0, 100);
    t.hp -= amt; t.lastHitBy = team;
    if (t.hp <= 0) { if (t.isUnit) this.killUnit(t, false, team); else this.destroyStruct(t, team); }
  }
  killUnit(u: Unit, silent?: boolean, byTeam?: number) {
    if (u.dead) return;
    u.dead = true;
    if (u.team < 0) {
      if (byTeam === UA) { this.civ.carsKilled[0]++; this.supportHit(4, 'A civilian vehicle was hit by your strike.'); }
      else if (byTeam === RU) this.civ.carsKilled[1]++;
      this.explosionFx(u.x, u.y, 12, false);
      return;
    }
    this.stats.lost[u.team]++;
    if (byTeam !== undefined && byTeam >= 0 && byTeam !== u.team) { this.stats.kills[byTeam]++; if (u.def.air) this.stats.shotDown[byTeam]++; }
    if (u.def.troop) for (const o of this.units) if (!o.dead && o !== u && o.team === u.team && o.def.morale && dist(o, u) < 300) o.morale = clamp((o.morale === undefined ? 90 : o.morale) - 12, 0, 100);
    if (u.operator && u.operator.drones) u.operator.drones = u.operator.drones.filter(x => x !== u);
    if (u.drones) { for (const dr of u.drones) dr.operator = null; u.drones = []; }
    if (!u.def.air && u.def.crew) { const lost = Math.floor(u.def.crew * (this.upgrades[u.team].medevac ? 0.25 : 0.5) + this.rng.next()); this.people[u.team].total = Math.max(0, this.people[u.team].total - lost); this.stats.peopleLost[u.team] += lost; }
    if (!silent) this.explosionFx(u.x, u.y, u.def.air ? 10 : u.def.r + 8, !u.def.air);
  }
  destroyStruct(s: Struct, byTeam: number) {
    if (s.dead) return;
    s.dead = true;
    this.explosionFx(s.x, s.y, s.r + 30, true);
    this.scorches.push({ x: s.x, y: s.y, r: s.r + 18 });
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
  endGame(winner: number) { if (this.gameOver) return; this.gameOver = true; this.winner = winner; }

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
    this.notify(-1, text);
  }

  /** Geran waves against Ukrainian buildings, launched by the Russian side (bot or timer) */
  spawnShaheds() {
    const targets = this.structs.filter(s => (s.team === UA || (s.civ && s.nation === 0)) && !s.dead);
    if (!targets.length) return;
    const n = Math.min(6, 1 + Math.floor(this.gameTime / 200));
    for (let i = 0; i < n * 2 + 1; i++) {
      const type = i < n ? (this.gameTime > 600 && i < Math.max(1, Math.floor(n / 3)) ? 'geran3' : 'geran') : 'gerbera';
      const roll = this.rng.next();
      const u = roll < 0.4 ? this.makeUnit(type, RU, this.rand(W * 0.3, W - 40), 10) : roll < 0.65 ? this.makeUnit(type, RU, W - 10, this.rand(40, H_LAND * 0.5)) : this.makeUnit(type, RU, this.rand(W * 0.35, W - 60), H - 10);
      const pool = targets.flatMap(s => s.type === 'hq' ? [s] : s.civ ? (s.type === 'power' ? [s, s, s, s, s] : [s, s]) : [s, s, s]);
      const t = this.rng.pick(pool);
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
        if (m === L || m.target || m.order.kind !== 'idle' || m.landed || L.landed) return;
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
        const airSel = selUnits.filter(u => u.def.air), groundSel = selUnits.filter(u => !u.def.air);
        if (airSel.length) {
          const seen = new Set<Swarm>();
          for (const u of airSel) { const sw = this.swarmOf(u); if (sw && !seen.has(sw)) { seen.add(sw); this.formationMove(sw.members, cmd.x, cmd.y, sw.formation); } }
          this.formationMove(airSel.filter(u => !this.swarmOf(u)), cmd.x, cmd.y, cmd.formation);
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
        for (const u of arty) { u.order = { kind: 'bombard', x: cmd.x, y: cmd.y, target: null }; u.target = null; u.path = null; }
        this.effects.push({ kind: 'mark', x: cmd.x, y: cmd.y, t: 0, dur: 0.8, red: true, team });
        this.notify(team, arty.length + ' gun' + (arty.length > 1 ? 's' : '') + ' firing on the area' + (this.inVision(team, cmd.x, cmd.y) ? '' : ', unobserved: wider scatter'));
        return;
      }
      case 'dig': {
        const troops = this.ownUnits(team, cmd.ids).filter(e => e.def.troop && !e.shaken);
        if (!troops.length) return this.notify(team, 'Select troops first');
        let n = 0;
        for (const u of troops) { if (this.trenchAt(u.x, u.y)) continue; u.order = { kind: 'dig', x: u.x, y: u.y, target: null }; u.target = null; u.path = null; u.digT = 20; n++; }
        this.notify(team, n ? n + ' squad' + (n > 1 ? 's' : '') + ' digging in: 20 seconds' : 'Already in a trench');
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
    this.funds[team] -= u.cost; this.upgrades[team][key] = true; this.notify(team, upgLabel(team, key) + ' acquired');
    if (key === 'mobilization') this.people[team].total = Math.min(240, this.people[team].total + 40);
    if (key === 'auto3') for (const d of this.units) if (d.team === team && d.operator && !d.def.tether) { if (d.operator.drones) d.operator.drones = d.operator.drones.filter(x => x !== d); d.operator = null; }
  }
}

export function isVehicle(t: Entity): boolean { return !!t.isUnit && !t.def.air && t.type !== 'infantry'; }
export function rOf(e: Entity): number { return e.isStruct ? e.r : e.def.r; }
