// Drives a Game forward in time and delivers commands to it.
// LocalSession: solo play, commands apply on the next tick.
// NetSession: lockstep multiplayer, commands go to the server and come back ordered inside 100 ms turns.
import { Game, DT } from './sim';
import type { Command } from './types';

export const TURN_MS = 100;
export const TICKS_PER_TURN = Math.round(TURN_MS / 1000 / DT); // 6
const HASH_EVERY = 50;

export interface TurnDto { turn: number; commands: { team: number; payload: string }[] }

export interface Session {
  game: Game; myTeam: number; readonly online: boolean;
  paused: boolean; canPause: boolean;
  /** simulation speed for solo games (1, 2, or 3); ignored online */
  speed: number;
  /** true while the client is stalled waiting for the next turn from the server */
  waiting: boolean;
  submit(cmd: Command): void;
  advance(elapsed: number): void;
  destroy(): void;
}

/** a command and the simulation tick it was applied on: the whole game can be replayed from the seed and this list */
export interface Recorded { tick: number; cmd: Command }

export class LocalSession implements Session {
  online = false; paused = false; canPause = true; waiting = false; speed = 1;
  private pending: Command[] = []; private acc = 0;
  /** ticks simulated so far and every player command with its tick */
  tickN = 0; record: Recorded[] = [];
  constructor(public game: Game, public myTeam: number) {}
  submit(cmd: Command) { this.pending.push(cmd); }
  advance(elapsed: number) {
    if (this.paused || this.game.gameOver) return;
    // up to 15 ticks a frame so a throttled tab (few frames a second) still runs close to real time
    this.acc += Math.min(elapsed, 0.25) * this.speed; let steps = 0;
    const maxSteps = 15 * this.speed;
    while (this.acc >= DT && steps < maxSteps) {
      if (this.pending.length) { for (const c of this.pending) { this.game.apply(this.myTeam, c); this.record.push({ tick: this.tickN, cmd: c }); } this.pending = []; }
      this.game.tick(DT); this.acc -= DT; steps++; this.tickN++;
    }
    if (steps === maxSteps) this.acc = 0;
  }
  destroy() {}
}

/** plays a recorded solo game back: the same seed, the same commands on the same ticks; input is ignored */
export class ReplaySession implements Session {
  online = false; paused = false; canPause = true; waiting = false; speed = 1;
  private acc = 0; private tickN = 0; private next = 0;
  constructor(public game: Game, public myTeam: number, private commands: Recorded[]) {}
  submit(_cmd: Command) { void _cmd; }
  get finished(): boolean { return this.next >= this.commands.length; }
  advance(elapsed: number) {
    if (this.paused || this.game.gameOver) return;
    this.acc += Math.min(elapsed, 0.25) * this.speed; let steps = 0;
    const maxSteps = 15 * this.speed;
    while (this.acc >= DT && steps < maxSteps) {
      while (this.next < this.commands.length && this.commands[this.next].tick === this.tickN) { this.game.apply(this.myTeam, this.commands[this.next].cmd); this.next++; }
      this.game.tick(DT); this.acc -= DT; steps++; this.tickN++;
    }
    if (steps === maxSteps) this.acc = 0;
  }
  destroy() {}
}

export interface NetTransport {
  sendCommand(payload: string): void;
  reportHash(turn: number, hash: string): void;
}

export class NetSession implements Session {
  online = true; paused = false; canPause = false; waiting = false; speed = 1;
  private turns = new Map<number, TurnDto>();
  /** last turn fully simulated */
  turnDone = 0; lastReceived = 0;
  private tickInTurn = 0; private acc = 0;
  private stalledSince = 0;
  constructor(public game: Game, public myTeam: number, private net: NetTransport, history: TurnDto[]) {
    for (const t of history) this.receive(t);
  }
  receive(t: TurnDto) { this.turns.set(t.turn, t); if (t.turn > this.lastReceived) this.lastReceived = t.turn; }
  submit(cmd: Command) { this.net.sendCommand(JSON.stringify(cmd)); }
  /** how far the client lags the newest server turn */
  get lag(): number { return this.lastReceived - this.turnDone; }
  advance(elapsed: number) {
    if (this.game.gameOver) return;
    this.acc += Math.min(elapsed, 0.25);
    // catch up fast after a stall or a background tab, otherwise run in real time
    const maxSteps = this.lag > 3 ? TICKS_PER_TURN * Math.min(this.lag, 40) : 5;
    let steps = 0;
    while (this.acc >= DT && steps < maxSteps) {
      if (this.tickInTurn === 0) {
        const next = this.turns.get(this.turnDone + 1);
        if (!next) { this.waiting = true; this.acc = Math.min(this.acc, DT); return; }
        this.waiting = false;
        for (const c of next.commands) {
          try { this.game.apply(c.team, JSON.parse(c.payload) as Command); } catch (e) { console.warn('bad command', e); }
        }
      }
      this.game.tick(DT); this.acc -= DT; steps++; this.tickInTurn++;
      if (this.tickInTurn >= TICKS_PER_TURN) {
        this.tickInTurn = 0; this.turnDone++;
        this.turns.delete(this.turnDone - 2);
        if (this.turnDone % HASH_EVERY === 0) this.net.reportHash(this.turnDone, this.game.hash());
      }
    }
    if (steps >= maxSteps) this.acc = 0;
    void this.stalledSince;
  }
  destroy() { this.turns.clear(); }
}
