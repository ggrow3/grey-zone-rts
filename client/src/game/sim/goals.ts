// Winning by holding every town, and the optional skirmish goals each side works on.
import { UA, RU, TEAMS, MISSIONS, MISSION_SCORE } from '../data';
import type { Game } from './game';
import { HOLD_TO_WIN } from './constants';

/** holding every town for HOLD_TO_WIN seconds wins outright */
export function updateHold(g: Game, dt: number) {
  for (const T of [UA, RU]) {
    if (g.depots.every(d => d.owner === T)) {
      g.holdT[T] += dt;
      const left = HOLD_TO_WIN - g.holdT[T];
      for (const mark of [120, 60, 10])
        if (left <= mark && g.holdWarned[T] < mark) {
          g.holdWarned[T] = mark;
          g.notify(-1, TEAMS[T].name + ' holds every town: victory in ' + mark + ' s unless one is taken back');
        }
      if (g.holdT[T] >= HOLD_TO_WIN) {
        g.addLog(-1, 'info', TEAMS[T].name + ' held every town for three minutes');
        g.endGame(T);
      }
    } else {
      g.holdT[T] = 0;
      g.holdWarned[T] = 0;
    }
  }
}

/** optional goals: one at a time per side, a new one a while after the last is done */
export function updateMissions(g: Game, dt: number) {
  g.missionT -= dt;
  if (g.missionT > 0) return;
  g.missionT = 1;
  const keys = Object.keys(MISSIONS);
  for (const T of [UA, RU]) {
    let m = g.missions[T];
    if (!m || m.done) {
      g.missionGap[T] -= 1;
      if (g.missionGap[T] > 0) continue;
      const pool = keys.filter(
        k =>
          k !== g.lastMission[T] &&
          (k !== 'holdWheat' || g.resources.some(r => r.kind === 'wheat')) &&
          (k !== 'pipeline' || g.pumpSites.some(p => p.team === T))
      );
      const key = g.rng.pick(pool);
      g.lastMission[T] = key;
      m = { key, progress: 0, base: missionStat(g, T, key), startedAt: g.gameTime, done: false };
      g.missions[T] = m;
      if (!g.isBot[T]) g.notify(T, 'New goal: ' + MISSIONS[key].text + ' (+' + MISSIONS[key].reward + ' funds)');
      continue;
    }
    const def = MISSIONS[m.key];
    if (def.timed) m.progress = missionStat(g, T, m.key) ? m.progress + 1 : 0;
    else m.progress = missionStat(g, T, m.key) - m.base;
    if (m.progress >= def.goal) {
      m.done = true;
      m.progress = def.goal;
      g.missionsDone[T]++;
      g.missionGap[T] = 40;
      g.funds[T] += def.reward;
      g.stats.score[T] += MISSION_SCORE;
      g.notify(T, 'Goal met: ' + def.text + '. +' + def.reward + ' funds, +' + MISSION_SCORE + ' score');
      g.addLog(T, 'info', TEAMS[T].name + ' met a goal: ' + def.text.toLowerCase());
      g.effects.push({ kind: 'text', x: 0, y: 0, t: 0, dur: 0.1, team: T, text: '', sub: 'goal' });
    }
  }
}

/** the number a mission watches: 1/0 for timed conditions, a running count otherwise */
export function missionStat(g: Game, T: number, key: string): number {
  switch (key) {
    case 'holdWheat':
      return g.resources.some(r => r.kind === 'wheat' && r.owner === T && r.burnT <= 0) ? 1 : 0;
    case 'pipeline':
      return g.pipelineIntact(T) ? 1 : 0;
    case 'shootDown':
      return g.stats.shotDown[T];
    case 'killGun': {
      const ko = g.stats.killsOf[T];
      return (ko.howitzer || 0) + (ko.mlrs || 0) + (ko.aa || 0);
    }
    case 'capture':
      return g.capturesN[T];
    case 'trucks':
      return g.stats.deliveries[T];
  }
  return 0;
}
