// The shape of a teaching level. See docs/MODDING.md for how to write one.
import type { FormationType } from '../data';
import type { Game } from '../sim';
import type { Entity, Pt } from '../types';

export interface Marker {
  x: number;
  y: number;
  r: number;
}
/** what the player has done with the camera and the mouse, for the tutorial steps the simulation cannot see */
export interface LevelCtx {
  camMoved: boolean;
  selection: Entity[];
  /** the formation chosen in the selection panel for the next move */
  formation: FormationType;
  /** how many control groups (Ctrl+1 to 5) hold units */
  groups: number;
}
export interface Objective {
  title: string;
  text: string;
  /** true when the step is complete; checked twice a second */
  done: (g: Game, ctx: LevelCtx) => boolean;
  /** a ring drawn on the map while this step is current */
  marker?: (g: Game) => Marker | null;
  /** runs once when the step becomes current (scripted threats, timers) */
  onStart?: (g: Game) => void;
}
export interface Level {
  id: string;
  title: string;
  blurb: string;
  concepts: string[];
  /** the map it is played on: a key of MAPS */
  map: string;
  side: 0 | 1;
  difficulty: number;
  /** a skirmish start for the level: 'night' or 'winter' (see STARTS); clear morning if absent */
  start?: string;
  /** the bot stays passive / sends no Geran waves while fewer than this many objectives are done (Infinity = whole level) */
  passiveUntil: number;
  noGeransUntil: number;
  /** one line on what this army does differently, shown in the objectives panel */
  sideNote: string;
  /** level script run after the standard setup: pre-captured towns, extra units, funds */
  scenario?: (g: Game) => void;
  /** opening cutscene: narrated lines, and the map points the camera pans between (one per line, cycled) */
  briefing: string[];
  shots: (g: Game) => Pt[];
  objectives: Objective[];
}
