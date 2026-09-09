// Deterministic math for the simulation. Basic IEEE arithmetic (+ - * / sqrt floor) is bit-identical across
// JavaScript engines, but Math.sin/cos/atan2/hypot are not guaranteed to be, and two lockstep clients must agree
// to the last bit. Everything the simulation needs goes through these.
const PI = Math.PI, TWO_PI = 2 * Math.PI, HALF_PI = Math.PI / 2;

export function hyp(dx: number, dy: number): number { return Math.sqrt(dx * dx + dy * dy); }
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number { return hyp(a.x - b.x, a.y - b.y); }
export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export function dsin(x: number): number {
  x = x - Math.floor((x + PI) / TWO_PI) * TWO_PI;
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}
export function dcos(x: number): number { return dsin(x + HALF_PI); }

function datan(z: number): number {
  // |z| <= 1, max error about 1e-5 rad: plenty for formation headings and sprite rotation
  const z2 = z * z;
  return z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 - z2 * 0.01172120)))));
}
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  const a = ay <= ax ? datan(ay / ax) : HALF_PI - datan(ax / ay);
  const r = x < 0 ? PI - a : a;
  return y < 0 ? -r : r;
}

/** quantize to 1/1000 px so values derived from transcendental map math agree across engines */
export function q3(v: number): number { return Math.round(v * 1000) / 1000; }
