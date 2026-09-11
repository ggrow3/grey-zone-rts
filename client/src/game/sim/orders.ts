// Constructors for the orders a unit can carry.
import type { Entity, Order } from '../types';

export const IDLE = (): Order => ({ kind: 'idle', x: 0, y: 0, target: null });
export const MOVE = (x: number, y: number): Order => ({ kind: 'move', x, y, target: null });
export const ATTACK = (t: Entity): Order => ({ kind: 'attack', x: 0, y: 0, target: t });
