// The campaign thread: what a side carries from one level to the next. Veteran squads keep their kills, callsigns
// and records; research bought stays bought; public support carries; and a lost level makes the next one harder
// instead of blocking it. Kept in localStorage per side, so it needs no account.
import { UA, UPGRADES } from './data';
import type { Game } from './sim';

export interface CampaignVet {
  type: string;
  kills: number;
  callsign: string;
  history: string[];
  tours: number;
}

export interface Campaign {
  side: number;
  vets: CampaignVet[];
  upgrades: string[];
  support: number;
  lastLost: boolean;
  levels: string[];
}

const KEY = 'greyzone.campaign.';
/** how much harder the enemy is after a lost level */
export const LOSS_PENALTY = 0.15;

export function loadCampaign(side: number): Campaign | null {
  try {
    const s = localStorage.getItem(KEY + side);
    return s ? (JSON.parse(s) as Campaign) : null;
  } catch {
    return null;
  }
}

export function clearCampaign(side: number) {
  try {
    localStorage.removeItem(KEY + side);
  } catch {
    /* ignore */
  }
}

/** what a finished level leaves behind for the next one */
export function recordCampaign(g: Game, side: number, levelId: string, won: boolean) {
  const prev = loadCampaign(side);
  const vets: CampaignVet[] = g.units
    .filter(u => u.team === side && !u.dead && u.def.troop && (u.kills || 0) > 0)
    .sort((a, b) => (b.kills || 0) - (a.kills || 0))
    .slice(0, 6)
    .map(u => ({
      type: u.type,
      kills: u.kills || 0,
      callsign: u.callsign || '',
      history: (u.history || []).slice(-6),
      tours: (u.tours || 0) + 1,
    }));
  const c: Campaign = {
    side,
    vets,
    upgrades: Object.keys(UPGRADES).filter(k => g.upgrades[side][k]),
    support: side === UA ? Math.round(g.support) : 0,
    lastLost: !won,
    levels: [...(prev ? prev.levels.filter(l => l !== levelId) : []), levelId],
  };
  try {
    localStorage.setItem(KEY + side, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** put the carried squads, research, and support into a freshly built level; returns the line to tell the player */
export function applyCampaign(g: Game, side: number, c: Campaign): string {
  const used = new Set<number>();
  let placed = 0;
  for (const v of c.vets) {
    const u = g.units.find(x => x.team === side && !x.dead && x.type === v.type && !x.kills && !used.has(x.id));
    if (!u) continue;
    used.add(u.id);
    u.kills = v.kills;
    u.callsign = v.callsign || u.callsign;
    u.history = v.history.slice();
    u.tours = v.tours;
    placed++;
  }
  const research: string[] = [];
  for (const k of c.upgrades)
    if (UPGRADES[k] && !g.upgrades[side][k]) {
      g.upgrades[side][k] = true;
      research.push(UPGRADES[k].label);
    }
  if (side === UA && c.support > g.support) g.support = c.support;
  if (c.lastLost) g.difficulty += LOSS_PENALTY;
  const parts: string[] = [];
  if (placed) parts.push(placed + ' veteran squad' + (placed > 1 ? 's' : ''));
  if (research.length) parts.push(research.length > 2 ? research.length + ' research items' : research.join(' and '));
  if (side === UA && c.support) parts.push(c.support + '% support');
  return (
    'Campaign: ' +
    (parts.length ? parts.join(', ') + ' carried over from the last level.' : 'nothing carried over yet.') +
    (c.lastLost ? ' The last level was lost, so the enemy is stronger this time.' : '')
  );
}

/** one line for the home page */
export function describeCampaign(c: Campaign): string {
  const vets = c.vets.length
    ? c.vets
        .slice(0, 3)
        .map(
          v => (v.callsign || v.type) + ' (' + v.kills + ' kills, ' + v.tours + (v.tours > 1 ? ' tours' : ' tour') + ')'
        )
        .join(', ') + (c.vets.length > 3 ? ' and ' + (c.vets.length - 3) + ' more' : '')
    : 'no veterans yet';
  return (
    c.levels.length +
    (c.levels.length > 1 ? ' levels played. ' : ' level played. ') +
    'Veterans: ' +
    vets +
    '. Research carried: ' +
    (c.upgrades.length || 'none') +
    (c.side === UA ? '. Support ' + c.support + '%' : '') +
    (c.lastLost ? '. Last level lost: the next enemy is stronger.' : '.')
  );
}
