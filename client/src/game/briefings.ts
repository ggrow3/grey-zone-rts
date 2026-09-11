// The opening briefing: narrated lines with a map point the camera pans to for each. Levels bring their own
// (see levels/); a skirmish uses the lines the map provides.
import { UA } from './data';
import { W, H } from './map';
import type { Game } from './sim';
import type { Level } from './levels';
import type { Pt } from './types';

export interface Briefing {
  title: string;
  lines: string[];
  /** where the camera looks while each line is read; cycled if there are fewer points than lines */
  shots: Pt[];
}

export function briefingFor(game: Game, team: number, level: Level | null): Briefing {
  if (level) return { title: level.title, lines: level.briefing, shots: level.shots(game) };
  const centre = { x: W / 2, y: H / 2 };
  const { map } = game;
  return {
    title:
      team === UA ? 'Skirmish: the ' + map.cities[UA] + ' front' : 'Skirmish: the ' + map.cities[1 - UA] + ' front',
    lines: map.briefing[team as 0 | 1],
    shots: [game.hq(team) || centre, game.site(map.firstTowns[team as 0 | 1]), game.hq(1 - team) || centre],
  };
}
