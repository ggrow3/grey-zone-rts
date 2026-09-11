/** simulation step in seconds: sixty ticks a second of game time */
export const DT = 1 / 60;
/** game seconds per real second at normal speed: a little under one, so a fight is readable (five ticks per 100 ms multiplayer turn) */
export const PACE = 5 / 6;
/** holding every town for this many seconds wins outright */
export const HOLD_TO_WIN = 180;
/** the day cycle in seconds, and the second within it at which night falls (three minutes of night in every eight) */
export const DAY_CYCLE = 480;
export const NIGHT_FROM = 300;
