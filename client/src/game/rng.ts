// Deterministic pseudo-random source shared by both players in a lockstep match.
// Same seed + same command sequence => identical simulation on every client.
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  /** uniform in [0, 1) */
  next(): number {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<T>(list: T[]): T { return list[this.int(list.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  state(): number { return this.s; }
}
