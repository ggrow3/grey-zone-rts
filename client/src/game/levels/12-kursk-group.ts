import { UA, RU } from '../data';
import type { Level } from './types';
import { at, has, holdFor, inMode, kills, mark, own, researched, squads, town, townOwned, unitsNear } from './helpers';

export const level12: Level = {
  id: 'kursk',
  map: 'sumy',
  title: '12. Kursk group: hold the salient',
  side: RU,
  difficulty: 0.6,
  passiveUntil: 5,
  noGeransUntil: 5,
  blurb:
    'The Russian side of the Sumy front. Ukraine has a howitzer in the fields north of Yunakivka shelling Sudzha, with air defense and a radar post behind it. Go hull down, catch the gun on radar, answer with a glide bomb and a Lancet, shoot and scoot with your own guns, put an Iskander into their forward base, and take Yunakivka.',
  concepts: [
    'Hull down in a town',
    'Radar catches the flash',
    'Glide bombs on trenches',
    'Lancets against guns',
    'Shoot and scoot',
    'Iskander on a base',
    'Geran waves',
    'Taking a fortified town',
  ],
  briefing: [
    'Kursk group, forward headquarters Rylsk. Sudzha is ours, with three squads in the trenches, and it is being shelled from Yunakivka.',
    'The Ukrainian howitzer fires from the fields between Yunakivka and Sudzha, with a radar post and air defense behind it at the village. Our radar at Rylsk catches its flash for a few seconds after every shot.',
    'Aviation is ready: a KAB for their trenches, a Lancet for the gun, an Iskander for the radar. Your own howitzer answers from the woods and moves after every mission.',
    'Then take Yunakivka and the war comes to Sumy. Za Rodinu, commander.',
  ],
  shots: g => [at(g, 'Sudzha'), at(g, 'Yunakivka'), g.find(g.tags.gun) || at(g, 'Yunakivka'), at(g, 'Sudzha')],
  sideNote:
    "Russia on the Sumy front: one pump at Korenevo on the Urengoy line, the metering station in front of it, and Sumy's wells beyond the border.",
  scenario: g => {
    g.capture('Sudzha', RU);
    const S = g.site('Sudzha');
    squads(g, RU, 'infantry', S.x, S.y + 30, 3, true);
    g.spawn('ifv', RU, S.x - 40, S.y - 120);
    g.build('radar', RU, S.x + 90, S.y + 90);
    g.build('generator', RU, S.x + 140, S.y + 60);
    g.funds[RU] = 2600;
    g.capture('Yunakivka', UA);
    const Y = g.site('Yunakivka');
    squads(g, UA, 'infantry', Y.x, Y.y - 30, 3, true);
    const h = g.spawn('howitzer', UA, Y.x + (S.x - Y.x) * 0.5, Y.y + (S.y - Y.y) * 0.5, {
      kind: 'bombard',
      x: S.x,
      y: S.y,
      target: null,
    });
    g.tags.gun = h.id;
    g.spawn('aa', UA, Y.x + 60, Y.y + 80);
    g.build('radar', UA, Y.x + 130, Y.y + 50);
    g.build('generator', UA, Y.x + 180, Y.y + 20);
    g.funds[UA] = 700;
  },
  objectives: [
    {
      title: 'Hull down',
      text: 'Shells are landing on Sudzha. Select the IFV in the town and switch it to Hull down (R): 30% less damage, 10% more reach. Armor holding a town does it hull down, behind the trenches.',
      done: g => unitsNear(g, RU, at(g, 'Sudzha'), 300, 'ifv').some(u => g.modeOf(u) === 'hullDown'),
      marker: town('Sudzha'),
    },
    {
      title: 'Catch the flash',
      text: 'Your radar post at Sudzha shows an enemy gun for a few seconds after every shot: six in the open, two in a wood. Wait until the Ukrainian howitzer shows.',
      done: g => g.units.some(u => u.team === UA && u.type === 'howitzer' && u.seenBy[RU]),
      marker: town('Yunakivka'),
    },
    {
      title: 'A KAB on the trenches',
      text: 'Press the KAB-500 button in the Build tab (350 funds) and click the Ukrainian trench line at Yunakivka. 700 damage after six seconds, trenches erased. Their air defense vehicle within 260 may shoot it down; that is what the next step is for.',
      done: g => g.stats.kabs[RU] >= 1,
      marker: town('Yunakivka'),
    },
    {
      title: 'A Lancet for the gun',
      text: 'Research Launch rails (T, Aircraft branch, 600), then queue a Lancet at the drone works (J). It loiters until a howitzer, air defense vehicle, or jammer shows itself, then dives. Fly it toward Yunakivka and wait for the next flash.',
      done: g => researched(RU, 'launchRail')(g) && has(RU, 'lancet')(g),
      marker: own('droneWorks', RU),
    },
    {
      title: 'Kill the gun',
      text: 'Destroy the Ukrainian howitzer. A Lancet dives on its own; a bombard order from your own howitzer on the flash works too. The enemy wakes up when its gun dies.',
      done: g => kills(g, RU, 'howitzer') >= 1 || !g.find(g.tags.gun),
      marker: town('Yunakivka'),
    },
    {
      title: 'Shoot and scoot',
      text: 'Queue a howitzer at the artillery depot (Z), bring it to the wood south of Sudzha, and switch it to Shoot and scoot (R): after every fire mission it displaces before it fires again. Their radar post at Yunakivka is watching for your flash exactly as yours watched for theirs.',
      done: inMode(RU, 'howitzer', 'scoot'),
      marker: own('artyDepot', RU),
    },
    {
      title: 'Iskander',
      text: 'Press Iskander in the Build tab (800 funds) and click the Ukrainian radar post at Yunakivka: 900 damage after eight seconds. Without the radar their air defense cannot be cued, and without the generator beside it the post would have had no power anyway; both are targets.',
      done: g => g.stats.missiles >= 1,
      marker: town('Yunakivka'),
    },
    {
      title: 'A wave at Sumy',
      text: 'Launch a Geran wave (600, Build tab): three Gerans and four decoys at the Sumy substation. Their battery drones charge off that substation; without it the FPVs stay on the ground.',
      done: g => g.stats.waves[RU] >= 1,
    },
    {
      title: 'Yunakivka',
      text: 'Cross the border with the squads, the IFV hull down behind them once they arrive, FPVs hunting ahead. Capture Yunakivka.',
      done: townOwned('Yunakivka', RU),
      marker: town('Yunakivka'),
    },
    {
      title: 'Hold both towns',
      text: 'Sumy answers. Hold Sudzha and Yunakivka for 90 seconds: trenches, nets, the howitzer scooting behind the line, a Lancet loitering for whatever shoots.',
      onStart: mark('kursk:10'),
      done: holdFor('kursk:10', 90, g => townOwned('Sudzha', RU)(g) && townOwned('Yunakivka', RU)(g)),
      marker: town('Yunakivka'),
    },
  ],
};
