// The maps the game can be played on. A new map is a MapData file beside these (see docs/MODDING.md),
// registered here; skirmishes pick one on the home page and each level names the one it plays on.
import { WorldMap } from '../map';
import { KHARKIV_MAP } from './kharkiv';
import { SUMY_MAP } from './sumy';

export const MAPS: Record<string, WorldMap> = {
  kharkiv: new WorldMap(KHARKIV_MAP),
  sumy: new WorldMap(SUMY_MAP),
};
export const DEFAULT_MAP = 'kharkiv';

export function mapById(id: string | undefined): WorldMap {
  const m = MAPS[id || DEFAULT_MAP];
  if (!m) throw new Error('Unknown map: ' + id);
  return m;
}
