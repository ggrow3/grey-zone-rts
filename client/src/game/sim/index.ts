// The simulation's public surface. Everything outside the sim imports from here.
export { Game } from './game';
export type { GameOptions } from './game';
export { DT, PACE, HOLD_TO_WIN } from './constants';
export { IDLE, MOVE, ATTACK } from './orders';
export { rankOf, isVehicle, matchup, rOf } from './entity';
