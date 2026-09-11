// The teaching levels, in the order the home page lists them. Add a new level file and put it in the list.
import type { Level } from './types';
import { level01 } from './01-boots';
import { level02 } from './02-eyes';
import { level03 } from './03-operators';
import { level04 } from './04-guns';
import { level05 } from './05-jam';
import { level06 } from './06-counterbattery';
import { level07 } from './07-rodina';
import { level08 } from './08-shahed';
import { level09 } from './09-pipeline';
import { level10 } from './10-donets';
import { level11 } from './11-sudzha';
import { level12 } from './12-kursk-group';
import { level13 } from './13-psel-night';
import { level14 } from './14-the-grid';

export type { Level, Objective, Marker, LevelCtx } from './types';

export const LEVELS: Level[] = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
  level11,
  level12,
  level13,
  level14,
];

export function levelById(id: string): Level | undefined {
  return LEVELS.find(l => l.id === id);
}
