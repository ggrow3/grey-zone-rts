// The Game: all simulation state, the tick that advances it, and the questions the rest of the code asks it.
//
// The rules that change the state each tick live in the sibling modules (units.ts, combat.ts, logistics.ts, ...)
// as plain functions that take the game as their first argument; `tick()` below is the list of them in the order
// they run. This class holds the state, builds and removes entities, delivers messages, and answers queries
// (range, vision, supply, who flies what) that the systems, the bot, the renderer, and the panels all share.
//
// Determinism rules, because two lockstep clients must agree to the last bit:
//   * no Math.random: every roll goes through `this.rng` (seeded) or `this.rand()`
//   * no Math.sin/cos/atan2/hypot: use dsin/dcos/datan2/hyp from dmath.ts
//   * nothing may branch on which side the local player is; the sim does not know
//   * cosmetics (barks, callsigns) use plain counters so they never touch the RNG
import {
  UA,
  RU,
  UNITS,
  STRUCTS,
  CIV_TYPES,
  UPGRADES,
  FUEL_USERS,
  TRUCK_LOAD,
  TRUCK_PERIOD,
  TOWN_BUILD_RADIUS,
  BUILD_RADIUS,
  AUTO_SMALL,
  AUTO_LARGE,
  BARKS,
  TEAMS,
  DRONES_PER_OP,
  STRIKES,
  modesOf,
  NET_LINE,
  CALLSIGNS,
  FOOD,
} from '../data';
import type { UnitDef, TargetClass, BarkKind } from '../data';
import { W, H_LAND } from '../map';
import type { WorldMap } from '../map';
import { mapById } from '../maps';
import { Rng } from '../rng';
import { hyp, dist, clamp, dsin, dcos } from '../dmath';
import { getTerrain, Terrain } from '../terrain';
import type {
  Unit,
  Struct,
  Entity,
  Site,
  PumpSite,
  Projectile,
  Effect,
  Swarm,
  Supply,
  Bot,
  Notice,
  Scorch,
  Order,
  Pt,
  LogEntry,
  LogKind,
  Weather,
  PendingStrike,
  Alert,
  Incoming,
  Mission,
  Command,
} from '../types';
import { updateBot } from '../bot';
import { DAY_CYCLE, NIGHT_FROM } from './constants';
import { IDLE } from './orders';
import { applyCommand } from './commands';
import { setup } from './setup';
import { updateWeather } from './weather';
import { computeVision, updateKillZone } from './vision';
import { powerReach, updatePower, updateSupply } from './economy';
import { updateHold, updateMissions } from './goals';
import { updateFood } from './food';
import { updateAmmo, updateDepots, updateTrade } from './logistics';
import { updateStruct, updateHealing, updateNets, updateJamming } from './structures';
import { updateStrikes } from './strikes';
import { updateUnit } from './units';
import { separate } from './movement';
import { updateProjectile, killUnit } from './combat';
import { updateMorale, updateCivilians } from './civilians';
import { updateSwarms } from './swarms';

export interface GameOptions {
  seed: number;
  /** the map to play on: a key of MAPS (the Kharkiv front by default) */
  map?: string;
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
  /** skirmish starting conditions: night, winter, or a Russian rush */
  start?: string;
}

/** seconds between two shouts of the same kind from the same side */
const BARK_GAP: Partial<Record<BarkKind, number>> = { ack: 2, attack: 2.5, kill: 3, lost: 4, strike: 3, bombard: 3 };

export class Game {
  // ------------------------------------------------------------------ the world
  rng: Rng;
  map: WorldMap;
  terrain: Terrain;
  gameTime = 0;
  gameOver = false;
  /** 0 or 1 once the game is over, -1 before */
  winner = -1;
  nextId = 1;
  private byId = new Map<number, Entity>();

  // ------------------------------------------------------------------ everything on the map
  units: Unit[] = [];
  structs: Struct[] = [];
  projectiles: Projectile[] = [];
  /** short-lived visuals the renderer and the audio director read; the sim only appends */
  effects: Effect[] = [];
  /** the towns (capturable, send trucks) and the gas and wheat sites (capturable, feed supply) */
  depots: Site[] = [];
  resources: Site[] = [];
  pumpSites: PumpSite[] = [];
  swarms: Swarm[] = [];
  /** burn marks for the terrain painter to bake in; emptied by the renderer */
  scorches: Scorch[] = [];

  // ------------------------------------------------------------------ each side's economy
  funds = [1200, 600];
  upgrades: [Record<string, boolean>, Record<string, boolean>] = [{}, {}];
  /** the personnel pool: crews, operators, and squads all draw on it */
  people = [{ total: 70 }, { total: 70 }];
  supply: Supply[] = [
    {
      food: 1,
      fuel: 1,
      power: 1,
      foodStock: FOOD.start,
      foodRate: 0,
      hungry: 0,
      fuelUsed: 0,
      fuelCap: 0,
      powerUsed: 0,
      powerCap: 0,
    },
    {
      food: 1,
      fuel: 1,
      power: 1,
      foodStock: FOOD.start,
      foodRate: 0,
      hungry: 0,
      fuelUsed: 0,
      fuelCap: 0,
      powerUsed: 0,
      powerCap: 0,
    },
  ];
  /** rations in each headquarters larder; grain trucks fill it, supply trucks and the squads nearby draw on it */
  food = [FOOD.start, FOOD.start];
  foodWarnT = [0, 0];
  foodWasHungry = [false, false];
  /** international support for Ukraine (0 to 100): scales its income, falls when civilians are hit */
  support = 100;
  civ = { lost: [0, 0], harmedByUA: 0, defectors: 0, carsKilled: [0, 0] };
  /** the power grids: links drawn per side, spare supply (drone charging) per side, recomputed twice a second */
  powerEdges: [[number, number, number, number][], [number, number, number, number][]] = [[], []];
  powerCapGrid = [0, 0];
  powerT = 0;
  /** trade convoys: next departure per side, funds earned, enemy trucks captured */
  tradeT = [30, 45];
  tradeTotal = [0, 0];
  captured = [0, 0];
  ammoT = 0;

  // ------------------------------------------------------------------ the computer opponent
  isBot: [boolean, boolean];
  bots: (Bot | null)[] = [null, null];
  difficulty: number;
  botPassive: boolean;
  noGerans: boolean;
  /** a Russian rush: the bot attacks with half the usual strength */
  rush = false;

  // ------------------------------------------------------------------ weather, light, vision
  /** the weather front over the whole map; fronts roll in on their own */
  weather: Weather = { kind: 'clear', until: 150, next: 'clear', warned: false };
  /** winter start: snow comes back more often */
  winter = false;
  /** seconds added to the clock for the day cycle: a night start begins in the dark */
  dayOffset = 0;
  /** vision circles per team; a `deep` circle (a Mavic flying low) sees into woods and trenches out to its full radius */
  vision: { x: number; y: number; r: number; deep?: boolean; kz?: boolean }[][] = [[], []];
  /** kill-zone attrition runs on a coarse tick; the warning is throttled per team */
  kzT = 0;
  kzWarnT = [0, 0];

  // ------------------------------------------------------------------ strikes from beyond the map
  /** cooldowns: glide bombs per side, the Iskander, the deep strike, the Geran wave */
  kabT = [0, 0];
  missileT = 0;
  deepT = 0;
  waveT = 0;
  strikes: PendingStrike[] = [];
  /** game times at which each burning refinery goes out */
  refineryHits: number[] = [];
  deepPending: { at: number; hit: boolean } | null = null;

  // ------------------------------------------------------------------ civilians and defections
  defectT = 0;
  volunteerT = 0;
  carT = 0;

  // ------------------------------------------------------------------ score, goals, victory
  stats = {
    built: [0, 0],
    lost: [0, 0],
    drones: [0, 0],
    deliveries: [0, 0],
    peopleLost: [0, 0],
    shotDown: [0, 0],
    kills: [0, 0],
    jammed: [0, 0],
    waves: [0, 0],
    structsKilled: [0, 0],
    trucksKilled: [0, 0],
    vets: [0, 0],
    killsOf: [{}, {}] as [Record<string, number>, Record<string, number>],
    kabs: [0, 0],
    intercepted: [0, 0],
    refineries: 0,
    missiles: 0,
    /** points: kills and captures scaled by what the target cost, civilian harm taken away */
    score: [0, 0],
    friendlyFire: [0, 0],
  };
  /** the optional goal each side is working on, the gap before the next, and how many were completed */
  missions: [Mission | null, Mission | null] = [null, null];
  missionGap = [30, 30];
  missionsDone = [0, 0];
  missionT = 0;
  lastMission = ['', ''];
  /** towns captured per side (missions) */
  capturesN = [0, 0];
  /** seconds each team has held every town (victory at HOLD_TO_WIN) */
  holdT = [0, 0];
  holdWarned = [0, 0];
  /** score sampled every ten seconds, for the end-screen graph */
  history: { t: number; score: [number, number] }[] = [];
  historyT = 0;

  // ------------------------------------------------------------------ messages to the players
  log: LogEntry[] = [];
  /** recent things that happened to each side, with a place: losses, buildings hit, towns lost */
  alerts: Alert[] = [];
  /** enemy columns announced to each side */
  incoming: Incoming[] = [];
  /** one-line toasts, drained by the view every frame */
  notices: Notice[] = [];
  /** ids registered by a level scenario so objectives can find what it placed */
  tags: Record<string, number> = {};
  private callsignN = [0, 0];
  private barkN = 0;
  private lastBark: Record<string, number> = {};

  constructor(opts: GameOptions) {
    this.rng = new Rng(opts.seed);
    this.map = mapById(opts.map);
    this.terrain = getTerrain(this.map);
    this.isBot = opts.bots;
    this.difficulty = opts.difficulty;
    this.botPassive = !!opts.passive;
    this.noGerans = !!opts.noGerans;
    setup(this);
    updatePower(this);
    updateSupply(this);
    if (opts.start === 'night') this.dayOffset = NIGHT_FROM;
    else if (opts.start === 'winter') {
      this.weather = { kind: 'snow', until: 200, next: 'snow', warned: false };
      this.winter = true;
      for (const u of this.units)
        if (!u.dead && u.def.air && u.def.electric && !u.def.large) {
          u.landed = true;
          u.rechargeT = 5;
          u.batt = u.def.endurance;
        }
    } else if (opts.start === 'rush') {
      this.rush = true;
      this.funds[RU] += 400;
      const b = this.bots[RU];
      if (b) b.attackT = 40;
    }
    if (opts.scenario) {
      opts.scenario(this);
      computeVision(this);
      updatePower(this);
      updateSupply(this);
    }
  }

  // ================================================================== advancing the game
  /** a player command; the server orders these into turns online, LocalSession applies them at once */
  apply(team: number, cmd: Command) {
    applyCommand(this, team, cmd);
  }

  /** one simulation step of `dt` seconds (DT = 1/60); the systems run in this order every tick */
  tick(dt: number) {
    if (this.gameOver) return;
    this.gameTime += dt;
    updateWeather(this);
    this.funds[UA] += this.income(UA) * dt;
    this.funds[RU] += this.income(RU) * dt;
    for (const T of [UA, RU]) {
      const towns = this.depots.filter(d => d.owner === T).length;
      this.people[T].total = Math.min(
        200,
        this.people[T].total +
          (1 / 15 + towns / 60 + (this.wheatHeld(T) * 1.5) / 60) *
            (this.upgrades[T].training ? 2 : 1) *
            (this.isBot[T] ? this.difficulty : 1) *
            this.supply[T].food *
            dt
      );
    }
    computeVision(this);
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = 0.5;
      updatePower(this);
    }
    updateFood(this, dt);
    updateSupply(this);
    updateDepots(this, dt);
    updateJamming(this, dt);
    updateNets(this, dt);
    updateCivilians(this, dt);
    updateSwarms(this, dt);
    updateHealing(this, dt);
    updateTrade(this, dt);
    updateMorale(this, dt);
    updateKillZone(this, dt);
    updateMissions(this, dt);
    this.historyT -= dt;
    if (this.historyT <= 0) {
      this.historyT = 10;
      this.history.push({ t: this.gameTime, score: [this.stats.score[0], this.stats.score[1]] });
    }
    for (const s of this.structs) updateStruct(this, s, dt);
    for (const u of this.units) updateUnit(this, u, dt);
    separate(this);
    for (const p of this.projectiles) updateProjectile(this, p, dt);
    for (const e of this.effects) e.t += dt;
    updateAmmo(this, dt);
    updateHold(this, dt);
    if (this.waveT > 0) this.waveT -= dt;
    for (const T of [UA, RU]) if (this.kabT[T] > 0) this.kabT[T] -= dt;
    if (this.missileT > 0) this.missileT -= dt;
    if (this.deepT > 0) this.deepT -= dt;
    updateStrikes(this);
    this.cleanup();
    for (const b of this.bots) if (b) updateBot(this, b, dt);
  }

  /** drop dead entities and stale messages; runs at the end of every tick */
  cleanup() {
    for (const u of this.units) if (u.dead) this.byId.delete(u.id);
    for (const s of this.structs) if (s.dead) this.byId.delete(s.id);
    this.units = this.units.filter(u => !u.dead);
    this.structs = this.structs.filter(s => !s.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.effects = this.effects.filter(e => e.t < e.dur);
    if (this.alerts.length && this.gameTime - this.alerts[0].at > 40)
      this.alerts = this.alerts.filter(a => this.gameTime - a.at <= 40);
    if (this.incoming.length && this.gameTime - this.incoming[0].at > 30)
      this.incoming = this.incoming.filter(a => this.gameTime - a.at <= 30);
  }

  endGame(winner: number) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.winner = winner;
    const hq = this.hq(winner);
    if (hq) {
      this.bark('win', hq);
      for (const u of this.units)
        if (!u.dead && u.team === winner && u.def.troop && dist(u, hq) < 400) {
          this.effects.push({
            kind: 'bark',
            x: u.x,
            y: u.y,
            t: 0,
            dur: 2.4,
            team: winner,
            text: BARKS.win[winner as 0 | 1][0],
            delay: 0.4,
          });
          break;
        }
    }
    this.addLog(-1, 'info', TEAMS[winner].name + ' wins');
  }

  /** cheap state checksum used to detect lockstep desync between clients */
  hash(): string {
    let h = 7;
    const mix = (v: number) => {
      h = (Math.imul(h, 31) + (v | 0)) | 0;
    };
    mix(Math.floor(this.gameTime * 10));
    mix(Math.floor(this.funds[0]));
    mix(Math.floor(this.funds[1]));
    mix(Math.floor(this.food[0]));
    mix(Math.floor(this.food[1]));
    mix(this.nextId);
    mix(this.units.length);
    mix(this.structs.length);
    for (const u of this.units) {
      mix(u.id);
      mix(Math.floor(u.x * 10));
      mix(Math.floor(u.y * 10));
      mix(Math.floor(u.hp));
    }
    for (const s of this.structs) {
      mix(s.id);
      mix(Math.floor(s.hp));
      mix(s.queue.length);
    }
    for (const d of this.depots) mix(d.owner + 2);
    return (h >>> 0).toString(16);
  }

  // ================================================================== creating and removing things
  makeUnit(type: string, team: number, x: number, y: number): Unit {
    const def = UNITS[type];
    const u: Unit = {
      id: this.nextId++,
      isUnit: true,
      type,
      def,
      team,
      x,
      y,
      hp: def.hp * (def.air && team >= 0 && this.upgrades[team].armorDrone ? 1.5 : 1),
      order: IDLE(),
      target: null,
      cool: this.rng.next() * 0.5,
      dead: false,
      seenBy: [team === UA, team === RU],
      angle: team === UA ? -Math.PI / 2 : Math.PI / 2,
      netsSeen: [],
      dest: null,
      jamT: 0,
      salvoLeft: 0,
      salvoT: 0,
      kills: 0,
    };
    if (def.ammo) u.ammo = def.ammo;
    if (def.operator) u.ops = 1;
    if (def.troop && team >= 0) {
      const names = CALLSIGNS[team as 0 | 1],
        n = this.callsignN[team]++;
      u.callsign = names[n % names.length] + (n >= names.length ? ' ' + (Math.floor(n / names.length) + 1) : '');
    }
    this.byId.set(u.id, u);
    return u;
  }

  makeStruct(type: string, team: number, x: number, y: number, built: boolean): Struct {
    const def = STRUCTS[type];
    const s: Struct = {
      id: this.nextId++,
      isStruct: true,
      type,
      def,
      team,
      x,
      y,
      r: def.r,
      hp: built ? def.hp : def.hp * 0.1,
      build: built ? 1 : 0,
      queue: [],
      progress: 0,
      rally: { x, y: y + (team === UA ? -140 : 140) },
      cool: 0,
      dead: false,
      seenBy: [true, true],
      heat: 0,
      overheated: false,
    };
    this.byId.set(s.id, s);
    return s;
  }

  makeCiv(type: string, nation: number, x: number, y: number): Struct {
    const def = CIV_TYPES[type];
    const s: Struct = {
      id: this.nextId++,
      isStruct: true,
      civ: true,
      type,
      def,
      nation,
      team: -1,
      x,
      y,
      r: def.r,
      hp: def.hp,
      build: 1,
      queue: [],
      progress: 0,
      rally: { x, y },
      cool: 0,
      dead: false,
      seenBy: [true, true],
      lastHitBy: -1,
      heat: 0,
      overheated: false,
    };
    this.byId.set(s.id, s);
    return s;
  }

  /** an entity by id, or undefined once it is dead */
  find(id: number): Entity | undefined {
    const e = this.byId.get(id);
    return e && !e.dead ? e : undefined;
  }

  // ------------------------------------------------------------------ what a level script can do
  /** put a unit on the map, already linked to a squad if it needs one; see docs/MODDING.md */
  spawn(type: string, team: number, x: number, y: number, order?: Order): Unit {
    const u = this.makeUnit(type, team, x, y);
    if (order) u.order = order;
    if (this.needsOperator(u.def, team)) {
      if (!this.relink(u)) {
        u.grounded = true;
        u.order = IDLE();
      }
    }
    this.units.push(u);
    return u;
  }
  /** a finished building */
  build(type: string, team: number, x: number, y: number): Struct {
    const s = this.makeStruct(type, team, x, y, true);
    this.structs.push(s);
    return s;
  }
  /** hand a town, gas site, or wheat field to a side */
  capture(name: string, team: number) {
    const d = this.site(name);
    d.owner = team;
    d.cap = 0;
    d.capTeam = -1;
    d.supplyT = 6;
  }
  /** give a side a research item for free */
  grant(team: number, key: string) {
    this.upgrades[team][key] = true;
  }
  /** a scenario takes a building off the map without an explosion */
  removeStruct(s: Struct) {
    s.dead = true;
    this.byId.delete(s.id);
    this.structs = this.structs.filter(x => x !== s);
  }
  removeUnit(u: Unit) {
    u.dead = true;
    this.byId.delete(u.id);
    this.units = this.units.filter(x => x !== u);
  }
  /** a town, gas site, or wheat field by its name on the map */
  site(name: string): Site {
    const d = this.depots.concat(this.resources).find(x => x.name === name);
    if (!d) throw new Error('no site ' + name);
    return d;
  }

  // ================================================================== messages
  /** a shout from a unit; throttled per team and kind on game time, phrase chosen by a plain counter so cosmetics never touch the RNG */
  bark(kind: BarkKind, u: Entity, delay?: number) {
    const team = u.team;
    if (team < 0) return;
    const key = team + ':' + kind,
      gap = BARK_GAP[kind] || 0;
    if (gap && this.lastBark[key] !== undefined && this.gameTime - this.lastBark[key] < gap) return;
    this.lastBark[key] = this.gameTime;
    const table = u.isUnit && u.type === 'dprk' ? ['Manse!'] : BARKS[kind][team as 0 | 1];
    const text = table[this.barkN++ % table.length];
    this.effects.push({ kind: 'bark', x: u.x, y: u.y, t: 0, dur: 2.6 + (delay || 0), team, text, delay, sub: kind });
  }
  /** a battle log line; team -1 is about both sides */
  addLog(team: number, kind: LogKind, text: string) {
    this.log.push({ at: this.gameTime, team, kind, text });
    if (this.log.length > 200) this.log.shift();
  }
  /** ping a side about a place; pings within 120 of a recent one for the same side merge into it */
  alert(team: number, x: number, y: number, text: string) {
    if (team < 0) return;
    for (const a of this.alerts)
      if (a.team === team && this.gameTime - a.at < 6 && hyp(a.x - x, a.y - y) < 120) {
        a.at = this.gameTime;
        a.text = text;
        return;
      }
    this.alerts.push({ team, x, y, at: this.gameTime, text });
    if (this.alerts.length > 30) this.alerts.shift();
  }
  /** a toast for one side (or -1 for both) */
  notify(team: number, text: string) {
    this.notices.push({ team, text, at: this.gameTime });
  }
  drainNotices(team: number): string[] {
    const out = this.notices.filter(n => n.team === team || n.team < 0).map(n => n.text);
    this.notices = [];
    return out;
  }
  nearestTroop(team: number, x: number, y: number, maxD: number): Unit | null {
    let best: Unit | null = null,
      bd = maxD;
    for (const o of this.units) {
      if (o.dead || o.team !== team || !o.def.troop) continue;
      const d = hyp(o.x - x, o.y - y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  // ================================================================== queries: the economy
  rand(a: number, b: number): number {
    return this.rng.range(a, b);
  }
  /** the computer opponent's strength multiplier: difficulty, rising with time */
  teamMul(team: number): number {
    return this.isBot[team] ? this.difficulty * (1 + this.gameTime / 1800) : 1;
  }
  pipelineIntact(team: number): boolean {
    return this.pumpSites
      .filter(ps => ps.team === team)
      .every(ps => ps.struct && !ps.struct.dead && ps.struct.build >= 1);
  }
  gasIncome(team: number): number {
    return this.pipelineIntact(team)
      ? this.resources.filter(r => r.kind === 'gas' && r.owner === team).reduce((a, r) => a + (r.yieldRate || 0), 0)
      : 0;
  }
  wheatHeld(team: number): number {
    return this.resources.filter(r => r.kind === 'wheat' && r.owner === team && r.burnT <= 0).length;
  }
  /** funds per second before trucks: Russia flat plus gas, Ukraine scaled by support */
  income(team: number): number {
    if (team === RU)
      return (12 + this.gasIncome(RU)) * this.teamMul(RU) * Math.pow(STRIKES.deep.incomeMul, this.refineriesBurning());
    return (
      Math.max(
        4,
        12 * (0.4 + (0.6 * this.support) / 100) - Math.min(6, this.civ.lost[0] * 0.5) + (this.upgrades[UA].aid ? 8 : 0)
      ) + this.gasIncome(UA)
    );
  }
  expectedIncome(team: number): number {
    return (
      this.income(team) +
      ((this.depots.filter(d => d.owner === team).length * TRUCK_LOAD) / TRUCK_PERIOD) * this.teamMul(team)
    );
  }
  upgAvailable(team: number, key: string): boolean {
    const u = UPGRADES[key];
    return !this.upgrades[team][key] && (!u.requires || !!this.upgrades[team][u.requires]);
  }
  logiMul(team: number): number {
    return this.upgrades[team].logistics ? 1.5 : 1;
  }
  /** a squad out of rations fights at a fraction of its fire */
  rationMul(u: Unit): number {
    return u.def.troop && (u.rations ?? FOOD.rations) <= 0 ? FOOD.hungryFire : 1;
  }
  fuelMul(u: Unit): number {
    return u.team >= 0 && FUEL_USERS.has(u.type) ? 0.35 + 0.65 * this.supply[u.team].fuel : 1;
  }
  refineriesBurning(): number {
    return this.refineryHits.filter(t => t > this.gameTime).length;
  }
  kabCooldown(team: number): number {
    return STRIKES.kab.cooldown[team] * (team === RU && this.refineriesBurning() ? 1.5 : 1);
  }
  /** alive units of a type plus the ones queued in factories */
  typeCount(team: number, type: string): number {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead && u.type === type) n++;
    for (const st of this.structs)
      if (st.team === team && !st.dead && st.queue) for (const q of st.queue) if (q === type) n++;
    return n;
  }
  hq(team: number): Struct | undefined {
    return this.structs.find(s => s.team === team && s.type === 'hq' && !s.dead);
  }

  // ================================================================== queries: people, crews, drone operators
  /** people a unit of this type takes from the pool; aircraft need fewer as automation research comes in */
  crewOf(def: UnitDef, team: number): number {
    if (!def.crew) return 0;
    if (def.auto && team >= 0 && this.upgrades[team].ugvLogistics) return 0;
    if (!def.air) return def.crew;
    return def.crew / (def.large ? AUTO_LARGE : AUTO_SMALL)[this.autoTier(team)];
  }
  busyPeople(team: number): number {
    let n = 0;
    for (const u of this.units)
      if (u.team === team && !u.dead) n += this.crewOf(u.def, team) + (u.def.operator ? (u.ops || 1) - 1 : 0);
    for (const st of this.structs)
      if (st.team === team && !st.dead && st.queue) for (const q of st.queue) n += this.crewOf(UNITS[q], team);
    return n;
  }
  freePeople(team: number): number {
    return this.people[team].total - this.busyPeople(team);
  }
  crewLabel(def: UnitDef, team: number): string {
    const c = this.crewOf(def, team);
    if (!c) return '';
    return def.air
      ? c < 1
        ? '1 operator per ' + Math.round(1 / c)
        : c + (c > 1 ? ' operators' : ' operator')
      : c + ' crew';
  }
  autoTier(team: number): number {
    return this.upgrades[team].auto3 ? 3 : this.upgrades[team].auto2 ? 2 : this.upgrades[team].auto1 ? 1 : 0;
  }
  /** drones on both sides need a squad on the sticks until that side researches Full autonomy */
  needsOperator(def: UnitDef, team: number): boolean {
    if (def.tether) return true;
    return !!def.operated && this.autoTier(team) < 3;
  }
  operatorsOf(team: number): Unit[] {
    return this.units.filter(u => u.team === team && !u.dead && u.def.operator);
  }
  /** drones one operator flies; a squad's capacity is that times its operators */
  opCap(team: number): number {
    return this.upgrades[team].auto2 ? DRONES_PER_OP * 2 : DRONES_PER_OP;
  }
  opCapOf(op: Unit): number {
    return (op.ops || 1) * this.opCap(op.team);
  }
  droneCount(op: Unit): number {
    return op.drones ? op.drones.filter(d => !d.dead).length : 0;
  }
  freeSlots(team: number): number {
    let n = 0;
    for (const op of this.operatorsOf(team)) n += Math.max(0, this.opCapOf(op) - this.droneCount(op));
    return n;
  }
  linkRange(u: Unit): number {
    return (u.def.link || 650) + (this.upgrades[u.team].auto1 ? 150 : 0) + (this.upgrades[u.team].relay ? 250 : 0);
  }
  /** a relay carrier of this team covers the point */
  relayNear(team: number, p: Pt): boolean {
    for (const r of this.units) if (!r.dead && r.team === team && r.def.relay && dist(r, p) <= r.def.relay) return true;
    return false;
  }
  /** the point is inside the drone's control range (or the drone needs none) */
  inLink(u: Unit, t: Pt): boolean {
    return (
      !this.needsOperator(u.def, u.team) ||
      !u.operator ||
      u.operator.dead ||
      dist(t, u.operator) <= this.linkRange(u) ||
      this.relayNear(u.team, t)
    );
  }
  linkDrone(u: Unit, op: Unit) {
    u.operator = op;
    if (!op.drones) op.drones = [];
    op.drones.push(u);
  }
  /** find the nearest squad within 900 with a free slot and link the drone to it */
  relink(u: Unit): Unit | null {
    let best: Unit | null = null,
      bd = Infinity;
    for (const op of this.operatorsOf(u.team)) {
      if (this.droneCount(op) >= this.opCapOf(op)) continue;
      const dd = dist(u, op);
      if (dd < 900 && dd < bd) {
        bd = dd;
        best = op;
      }
    }
    if (best) this.linkDrone(u, best);
    return best;
  }
  /** where a battery drone goes to recharge: its own squad, else the nearest friendly infantry squad, headquarters, or drone works */
  landingSpot(u: Unit): Entity | null {
    if (u.operator && !u.operator.dead) return u.operator;
    let best: Entity | null = null,
      bd = Infinity;
    for (const o of this.units) {
      if (o.dead || o.team !== u.team || !o.def.troop) continue;
      const dd = dist(u, o);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    for (const st of this.structs) {
      if (st.dead || st.team !== u.team) continue;
      if (!(st.type === 'hq' || st.type === 'droneWorks' || st.type === 'launchSite')) continue;
      const dd = dist(u, st);
      if (dd < bd) {
        bd = dd;
        best = st;
      }
    }
    return best;
  }
  crashDrone(u: Unit, why: string) {
    this.effects.push({ kind: 'caught', x: u.x, y: u.y, t: 0, dur: 0.5 });
    this.notify(u.team, 'Drone lost: ' + why);
    killUnit(this, u, true);
  }

  // ================================================================== queries: a unit's state
  /** the unit's current posture: its chosen mode if the type has one, else the type's default, else '' */
  modeOf(u: Unit): string {
    const m = modesOf(u.type);
    if (!m) return '';
    return u.mode && m.some(x => x.key === u.mode) ? u.mode : m[0].key;
  }
  /** a recon drone flying high is out of reach of machine guns; a Mavic in Low mode is not */
  isHigh(u: Unit): boolean {
    return !!u.def.highAlt && this.modeOf(u) !== 'low';
  }
  /** a human has the sticks of this drone right now */
  piloted(u: Unit): boolean {
    return (u.pilotT || 0) > 0;
  }
  /** a jammer that is emitting or an air-defense radar that is switched on shows on enemy radar posts */
  emitting(u: Unit): boolean {
    return (!!u.def.jam && this.modeOf(u) !== 'silent') || (u.type === 'aa' && this.modeOf(u) === 'active');
  }
  moraleMul(u: Unit): number {
    return u.def.morale ? 0.5 + (0.5 * (u.morale === undefined ? 100 : u.morale)) / 100 : 1;
  }
  /** weapon reach after research and posture */
  rangeOf(u: Unit): number {
    let r = u.def.range || 0;
    if (u.def.indirect && this.upgrades[u.team].shells) r += 90;
    if (!u.def.air && u.def.targets && u.def.targets.includes('air') && this.upgrades[u.team].aaRange) r += 40;
    const m = this.modeOf(u);
    if (m === 'passive') r *= 0.6;
    else if (m === 'hullDown') r *= 1.1;
    return r;
  }
  /** where a shoot-and-scoot gun displaces to after a fire mission: the nearest wood a little way off, else a random spot */
  scootPoint(u: Unit): Pt {
    let best: Pt | null = null,
      bd = Infinity;
    for (const f of this.terrain.forestPx) {
      const dd = dist(f, u);
      if (dd > 70 && dd < 240 && dd < bd) {
        bd = dd;
        best = f;
      }
    }
    const a = this.rand(0, Math.PI * 2),
      r = this.rand(90, 150);
    const p = best
      ? { x: best.x + this.rand(-16, 16), y: best.y + this.rand(-16, 16) }
      : { x: u.x + dcos(a) * r, y: u.y + dsin(a) * r };
    return { x: clamp(p.x, 20, W - 20), y: clamp(p.y, 20, H_LAND - 20) };
  }
  trenchAt(x: number, y: number): boolean {
    return this.structs.some(st => !st.dead && st.def.trench && hyp(st.x - x, st.y - y) <= 28);
  }
  swarmOf(u: Unit): Swarm | null {
    return u.swarm && !u.swarm.dead ? u.swarm : null;
  }
  /** the list plus every other member of any swarm in it */
  expandSwarms(list: Unit[]): Unit[] {
    const out = list.slice();
    for (const u of list) {
      const sw = this.swarmOf(u);
      if (sw) for (const m of sw.members) if (!m.dead && !out.includes(m)) out.push(m);
    }
    return out;
  }

  // ================================================================== queries: what can shoot what
  targetClass(e: Entity): TargetClass {
    return e.isStruct ? 'struct' : e.def.air ? 'air' : e.def.troop ? 'inf' : 'veh';
  }
  canEngage(srcDef: UnitDef, e: Entity): boolean {
    if (!srcDef.targets) return false;
    const cls = this.targetClass(e);
    if (!srcDef.targets.includes(cls)) return false;
    if (cls === 'air' && srcDef.lowAlt && this.isHigh(e as Unit)) return false;
    return true;
  }
  canHitTarget(u: Unit, t: Entity): boolean {
    return (!!u.def.kamikaze || u.def.dmg > 0) && this.canEngage(u.def, t);
  }
  /** own ground units inside a shell's splash around a point */
  dangerClose(team: number, x: number, y: number, r: number): number {
    let n = 0;
    for (const u of this.units)
      if (!u.dead && u.team === team && !u.def.air && !u.def.indirect && hyp(u.x - x, u.y - y) - u.def.r <= r) n++;
    return n;
  }

  // ================================================================== queries: light, weather, vision
  /** night lasts three minutes of every eight */
  isNight(): boolean {
    return (this.gameTime + this.dayOffset) % DAY_CYCLE >= NIGHT_FROM;
  }
  /** seconds until the light changes */
  phaseLeft(): number {
    const p = (this.gameTime + this.dayOffset) % DAY_CYCLE;
    return this.isNight() ? DAY_CYCLE - p : NIGHT_FROM - p;
  }
  /** how far anything sees right now: fog, snow, and night all shorten it */
  visionMul(u: { def: UnitDef; team: number } | null): number {
    const k = this.weather.kind;
    let m = k === 'fog' ? 0.45 : k === 'snow' ? 0.7 : k === 'rain' ? 0.85 : 1;
    if (this.isNight()) m *= u && u.def.air ? (this.upgrades[u.team].nightOps ? 1 : 0.85) : 0.6;
    return m;
  }
  /** drones hunt a shorter way in fog and at night */
  huntMul(): number {
    return (this.weather.kind === 'fog' ? 0.5 : this.weather.kind === 'snow' ? 0.75 : 1) * (this.isNight() ? 0.85 : 1);
  }
  /** quads stay down in snow */
  quadsGrounded(): boolean {
    return this.weather.kind === 'snow';
  }
  /** ground speed off the roads in the mud */
  moveMul(u: Unit): number {
    return !u.def.air && !u.onRoad && (this.weather.kind === 'rain' || this.weather.kind === 'snow') ? 0.8 : 1;
  }
  /** the research bonus to everything's vision */
  visMul(team: number): number {
    return this.upgrades[team].thermal ? 1.25 : 1;
  }
  /** how far this unit sees right now */
  visionR(u: Unit): number {
    const low = u.def.highAlt && !this.isHigh(u) && !u.landed && !u.grounded;
    return (
      u.def.vision *
      this.visMul(u.team) *
      (u.def.air && this.upgrades[u.team].nightOps ? 1.3 : 1) *
      this.visionMul(u) *
      (low ? 0.65 : 1)
    );
  }
  /** an airborne armed drone: everything in the open under its eye is in the kill zone */
  isKillZoneDrone(u: Unit): boolean {
    return (
      !!u.def.air &&
      u.def.dmg > 0 &&
      !!u.def.targets &&
      (u.def.targets.includes('inf') || u.def.targets.includes('veh')) &&
      !u.landed &&
      !u.grounded &&
      !u.ambushed
    );
  }
  inVision(team: number, x: number, y: number): boolean {
    const list = this.vision[team];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dx = c.x - x,
        dy = c.y - y;
      if (dx * dx + dy * dy <= c.r * c.r) return true;
    }
    return false;
  }
  /** seen within `maxD` of a watcher, or anywhere inside a low-flying Mavic's circle */
  inVisionClose(team: number, x: number, y: number, maxD: number): boolean {
    const list = this.vision[team];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (hyp(c.x - x, c.y - y) <= (c.deep ? c.r : Math.min(maxD, c.r))) return true;
    }
    return false;
  }
  canSee(src: Unit, t: Entity): boolean {
    return !!t.isStruct || t.seenBy[src.team];
  }

  // ================================================================== queries: building
  /** why a building cannot go here, or null if it can */
  placementError(team: number, type: string, x: number, y: number): string | null {
    const def = STRUCTS[type];
    if (!def) return 'Unknown building';
    if (def.tunnel) {
      const rh = this.terrain.nearestRoad(x, y);
      if (!rh || rh.d > NET_LINE.snap) return 'Road nets go over a road: click closer to one';
    }
    const hq = this.hq(team);
    if (!hq) return 'No headquarters';
    const nearTown = this.depots.some(d => d.owner === team && dist(d, { x, y }) <= TOWN_BUILD_RADIUS);
    if (def.pylon) {
      if (!powerReach(this, team, x, y, def.r))
        return 'A pylon must stand within reach of your grid: a building, another pylon, or a generator set';
    } else if (dist(hq, { x, y }) > BUILD_RADIUS && !nearTown) return 'Build near headquarters or a town you hold';
    if (x < def.r + 10 || y < def.r + 10 || x > W - def.r - 10) return 'Too close to the map edge';
    for (const s of this.structs)
      if (!s.dead && dist(s, { x, y }) < s.r + def.r + 12) return 'Overlaps another building';
    if (!def.netR) for (const d of this.depots) if (dist(d, { x, y }) < d.r + def.r + 12) return 'Overlaps a town';
    if (!def.netR)
      for (const rs of this.resources)
        if (dist(rs, { x, y }) < rs.r + def.r + 8) return 'Overlaps ' + rs.name.toLowerCase();
    if (this.funds[team] < def.cost) return 'Not enough funds';
    return null;
  }
}
