// How the two armies differ, with the numbers taken from the data tables and the map.
import { UA, RU, UNITS, UPGRADES, GAS_YIELD, FUEL_BASE, FUEL_PER_NODE, WAVE_COST, WAVE_COOLDOWN, BARKS } from './data';
import type { WorldMap } from './map';
import { dist } from './dmath';

export interface FactionFact {
  topic: string;
  ua: string;
  ru: string;
  source: string;
}

const autoCost = UPGRADES.auto1.cost + UPGRADES.auto2.cost + UPGRADES.auto3.cost;
const side = (s: number) =>
  Object.entries(UNITS)
    .filter(([, d]) => d.side === s)
    .map(([, d]) => d.label[s])
    .join(', ');

/** the comparison table for the home page and the manual, for the map being played */
export function factionFacts(map: WorldMap): FactionFact[] {
  const uaGas = map.resources.filter(r => r[0] === 'gas' && r[4] === 0).length,
    ruGas = map.resources.filter(r => r[0] === 'gas' && r[4] === 1).length;
  const uaPumps = map.pipelines.filter(p => p.team === 0).reduce((a, p) => a + p.pumps.length, 0),
    ruPumps = map.pipelines.filter(p => p.team === 1).reduce((a, p) => a + p.pumps.length, 0);
  const ruGasName = map.resources.find(r => r[0] === 'gas' && r[4] === 1)?.[1] || 'gas site';
  const ruLine = map.pipelines.find(p => p.team === 1)?.name || 'its pipeline';
  const [uaCity, ruCity] = map.cities;
  const [uaTown, ruTown] = map.firstTowns;
  return [
    { topic: 'Starting funds', ua: '1200', ru: '600 (1000 in a Russia-attacks-first skirmish)', source: 'Game.funds' },
    {
      topic: 'Base income',
      ua: '12 a second scaled by support (40% to 100%), minus 0.5 per Ukrainian civilian site lost, never below 4; Aid package adds 8 once support is 60 or more',
      ru: 'Flat 12 a second plus gas; War economy adds 8. The computer opponent also gets the difficulty multiplier, rising with time',
      source: 'Game.income(), teamMul()',
    },
    {
      topic: 'Gas',
      ua:
        uaGas +
        ' gas well sites at ' +
        GAS_YIELD +
        '/s each on two pipelines with ' +
        uaPumps +
        ' pumping stations to guard',
      ru:
        ruGas +
        ' site, the ' +
        ruGasName +
        ', at ' +
        GAS_YIELD * 2.4 +
        '/s on ' +
        ruPumps +
        ' pump' +
        (ruPumps === 1 ? '' : 's') +
        ' (the ' +
        ruLine +
        ')',
      source: 'map.resources, map.pipelines',
    },
    {
      topic: 'Fuel capacity',
      ua:
        FUEL_BASE +
        ' + ' +
        FUEL_PER_NODE +
        ' per gas site = ' +
        (FUEL_BASE + FUEL_PER_NODE * uaGas) +
        ' vehicles while the line is whole',
      ru:
        FUEL_BASE +
        ' + ' +
        FUEL_PER_NODE +
        ' = ' +
        (FUEL_BASE + FUEL_PER_NODE * ruGas) +
        ' vehicles while whole, ' +
        FUEL_BASE +
        ' when cut',
      source: 'updateSupply()',
    },
    {
      topic: 'Who flies the drones',
      ua:
        'Squads fly them: each operator in a squad (up to four, one person each) flies 3 drones within 650 (500 for fiber), 6 after Drone swarm control; free after Full autonomy, ' +
        autoCost +
        ' funds of research in all',
      ru: 'Autonomous from the first second, no squads, no control range. Fiber FPVs are tethered on both sides',
      source: 'needsOperator(), opCapOf()',
    },
    {
      topic: 'Exclusive units',
      ua: side(UA) + ', plus Russian volunteer squads that arrive on their own',
      ru: side(RU),
      source: 'UNITS[*].side',
    },
    {
      topic: 'Geran waves',
      ua: 'On the receiving end: waves target the substation first, then housing and factories',
      ru:
        'The computer gets free waves from four minutes in. A human commander launches one for ' +
        WAVE_COST +
        ' funds with a ' +
        WAVE_COOLDOWN +
        ' s reload: three Gerans and four decoys',
      source: 'spawnShaheds(), launchWave()',
    },
    {
      topic: 'Civilians and support',
      ua: 'Hitting a Russian civilian site costs 12 support and 200 funds, a Russian car 4 support; support scales income and regenerates slowly, grain trucks add 2',
      ru: 'No support meter. Ukrainian civilian sites you destroy cut Ukrainian income',
      source: 'destroyStruct(), supportHit()',
    },
    {
      topic: 'Defections',
      ua:
        'Cut-off wounded Russian squads near your lines surrender while support is 70 or more; holding ' +
        map.volunteerTowns.join(' or ') +
        ' brings a volunteer squad every 75 s',
      ru: 'Loses them',
      source: 'updateCivilians()',
    },
    {
      topic: 'Morale',
      ua: 'International Legion squads have morale and wages',
      ru: 'North Koreans and mercenaries have morale; Koreans lose 0.8 a second while Russia holds fewer towns',
      source: 'updateMorale()',
    },
    {
      topic: 'Trade convoys',
      ua: 'West to the NATO border, first at 0:30 then every 75 s',
      ru: 'East into the interior, first at 0:45 then every 75 s',
      source: 'tradeEdge(), tradeT',
    },
    {
      topic: 'Nearest town',
      ua: uaTown + ', ' + Math.round(dist(map.hq[UA], map.placePos(uaTown))) + ' px from ' + uaCity,
      ru: ruTown + ', ' + Math.round(dist(map.hq[RU], map.placePos(ruTown))) + ' px from ' + ruCity,
      source: 'map.towns',
    },
    {
      topic: 'Starting forces',
      ua: '5 squads, an IFV, air defense, 2 fire groups, 9 buildings',
      ru: 'The same',
      source: 'sim/setup.ts',
    },
    {
      topic: 'Aviation',
      ua: 'F-16 glide bombs: 500 funds, 90 s reload',
      ru: 'KAB-500 glide bombs: 350 funds, 40 s reload, plus Iskander missiles on buildings (800, 120 s)',
      source: 'STRIKES, callGlideBomb(), launchMissile()',
    },
    {
      topic: 'Deep strike',
      ua: 'A Liutyi and 600 funds sent at a refinery: 60% get through, each burning refinery cuts Russian income 15% for four minutes',
      ru: 'Refineries burn; no equivalent on this map (the grid takes it from Gerans and missiles)',
      source: 'launchDeepStrike(), refineriesBurning()',
    },
    {
      topic: 'Weather and night',
      ua: 'Drones are the defense, so fog, rain, snow, and darkness are the danger: vision and hunting radius shrink, quads are grounded in snow',
      ru: 'The computer halves its assault threshold in bad light and times pushes to fog, rain, and night; Geran waves come at night',
      source: 'updateWeather(), bot.ts',
    },
    {
      topic: 'What the troops shout',
      ua: BARKS.attack[0].join(', ') + '; answered with ' + BARKS.reply[0][0],
      ru: BARKS.attack[1].join(', ') + '; North Koreans shout Manse!',
      source: 'BARKS',
    },
  ];
}
