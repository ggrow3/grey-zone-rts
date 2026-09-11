// The two sides. Team numbers index every per-side array in the game: [Ukraine, Russia].
export const UA = 0;
export const RU = 1;
export type Team = 0 | 1;

export const TEAMS = [
  {
    name: 'Ukraine',
    color: '#3a86ff',
    stroke: '#ffd60a',
    dark: '#1f3d78',
    hud: '#3a86ff',
  },
  {
    name: 'Russia',
    color: '#c1121f',
    stroke: '#2e2e2e',
    dark: '#5a1418',
    hud: '#c1121f',
  },
];
