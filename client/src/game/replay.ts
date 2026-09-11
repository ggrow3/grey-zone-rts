// The last solo game, kept in localStorage so it can be watched again: the seed, the options, and every
// command with the tick it was applied on. ReplaySession (session.ts) plays it back.
import type { Recorded } from './session';

export interface SavedReplay {
  seed: number;
  side: number;
  difficulty: number;
  start?: string;
  levelId?: string;
  map?: string;
  /** Date.now() when it was saved */
  at: number;
  commands: Recorded[];
}

const KEY = 'gz.replay';

export function loadReplay(): SavedReplay | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveReplay(replay: SavedReplay) {
  try {
    localStorage.setItem(KEY, JSON.stringify(replay));
  } catch {
    /* storage full or blocked */
  }
}

export function hasReplay(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
