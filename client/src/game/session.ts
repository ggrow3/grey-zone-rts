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
  /** true while the client is stalled waiting for the next turn from the server */
  waiting: boolean;
  submit(cmd: Command): void;
  advance(elapsed: number): void;
  destroy(): void;
}

export class LocalSession implements Session {
  online = false; paused = false; canPause = true; waiting = false;
  private pending: Command[] = []; private acc = 0;
  constructor(public game: Game, public myTeam: number) {}
  submit(cmd: Command) { this.pending.push(cmd); }
  advance(elapsed: number) {
    if (this.paused || this.game.gameOver) return;
    // up to 15 ticks a frame so a throttled tab (few frames a second) still runs close to real time
    this.acc += Math.min(elapsed, 0.25); let steps = 0;
    while (this.acc >= DT && steps < 15) {
      if (this.pending.length) { for (const c of this.pending) this.game.apply(this.myTeam, c); this.pending = []; }
      this.game.tick(DT); this.acc -= DT; steps++;
    }
    if (steps === 15) this.acc = 0;
  }
  destroy() {}
}

export interface NetTransport {
  sendCommand(payload: string): void;
  reportHash(turn: number, hash: string): void;
}

export class NetSession implements Session {
  online = true; paused = false; canPause = false; waiting = false;
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
