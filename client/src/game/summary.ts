// The end screen: the statistics table and the score graph, computed from a finished (or paused) game.
import { UA, UNITS } from './data';
import type { Game } from './sim';

/** seconds as m:ss, zero padded (0:00 to 99:59) */
export function fmtTime(t: number): string {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/** [value, label] rows for one side */
export function endScreenStats(game: Game, team: number): [string, string][] {
  const PL = team,
    EN = 1 - PL,
    civTotal = game.map.civSites.filter(c => c[1] === 0).length;
  return [
    [String(Math.round(game.stats.score[PL])) + ' vs ' + Math.round(game.stats.score[EN]), 'Score'],
    [fmtTime(game.gameTime), 'Time'],
    [String(game.stats.kills[PL]), 'Enemy units destroyed'],
    [String(game.stats.lost[PL]), 'Your units lost'],
    [String(game.stats.structsKilled[PL]), 'Enemy buildings destroyed'],
    [String(game.stats.friendlyFire[PL]), 'Lost to your own artillery'],
    [Math.floor(game.funds[PL]) + ' funds, ' + Math.floor(game.people[PL].total) + ' people', 'Resources at the end'],
    [game.depots.filter(d => d.owner === PL).length + ' of ' + game.depots.length, 'Towns held'],
    [civTotal - game.civ.lost[0] + ' of ' + civTotal, 'Ukrainian civilian sites standing'],
    [String(game.civ.harmedByUA + game.civ.carsKilled[0]), 'Russian civilian sites and vehicles hit by Ukraine'],
    [String(game.civ.defectors), 'Russian volunteers and defectors'],
    [
      PL === UA ? Math.round(game.support) + '%' : String(game.captured[PL]),
      PL === UA ? 'Support at the end' : 'Enemy trucks captured',
    ],
    [game.resources.filter(r => r.owner === PL).length + ' of ' + game.resources.length, 'Gas and wheat sites held'],
    [String(game.tradeTotal[PL]), 'Funds from trade convoys'],
    [String(game.missionsDone[PL]), 'Goals met'],
    [String(game.stats.vets[PL]), 'Units that earned a rank'],
    [
      Object.entries(game.stats.killsOf[PL])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, n]) => n + ' ' + (UNITS[k] ? UNITS[k].label[EN].toLowerCase() : k))
        .join(', ') || 'none',
      'Most destroyed',
    ],
  ];
}

export interface ScoreGraph {
  /** SVG polyline points for each side in a 300 x 80 box */
  ua: string;
  ru: string;
  /** the score at the top of the box */
  max: number;
}

/** both sides' score over time, sampled every ten seconds by the game */
export function scoreGraph(game: Game): ScoreGraph {
  const h = game.history.length ? game.history : [{ t: 0, score: [0, 0] as [number, number] }];
  const max = Math.max(10, ...h.map(p => Math.max(p.score[0], p.score[1]))),
    tmax = Math.max(1, h[h.length - 1].t);
  const line = (i: 0 | 1) =>
    h.map(p => ((p.t / tmax) * 300).toFixed(1) + ',' + (80 - (p.score[i] / max) * 76).toFixed(1)).join(' ');
  return { ua: line(0), ru: line(1), max };
}
