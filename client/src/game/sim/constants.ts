/** simulation step in seconds: sixty ticks a second, six per 100 ms multiplayer turn */
export const DT = 1 / 60;
/** holding every town for this many seconds wins outright */
export const HOLD_TO_WIN = 180;
/** the day cycle in seconds, and the second within it at which night falls (three minutes of night in every eight) */
export const DAY_CYCLE = 480;
export const NIGHT_FROM = 300;
