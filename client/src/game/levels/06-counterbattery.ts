import { UA, RU } from '../data';
import { MOVE } from '../sim';
import type { Level } from './types';
import { at, bombarding, dist, inMode, kills, own, squads, town } from './helpers';

export const level06: Level = {
  id: 'counterbattery',
  map: 'kharkiv',
  title: '6. Blind fire and counter-battery',
  side: UA,
  difficulty: 0.6,
  passiveUntil: 5,
  noGeransUntil: Infinity,
  blurb:
    'Two Russian howitzers are shelling Lyptsi. Your radar catches their muzzle flashes; theirs are down, so only their drones can find your gun. Answer blind, then observed, shoot and scoot, hide the air defense from the Lancets, and bring up rockets.',
  concepts: [
    'Unobserved fire',
    'Radar flash spotting',
    'Observed fire',
    'Shoot and scoot',
    'Passive air defense',
    'Lancets hunt guns',
    'Rocket salvos',
  ],
  briefing: [
    'Shells are falling on Lyptsi. Two Russian howitzers north of Zhuravlyovka are working the town blind, and our squads are in their trenches.',
    'Our radar post catches a muzzle flash for a few seconds after every shot. Their radars are down, so they cannot do the same to you.',
    'Answer with the howitzer, blind at first, then fly the Mavic forward and watch the scatter tighten. Twelve shells, then wait for the truck.',
    'When the guns fall silent, the Lancets come for yours. Have a Sting and a fire group with the battery before they do, and switch the air defense radar off until they are close.',
  ],
  shots: g => [at(g, 'Lyptsi'), at(g, 'Zhuravlyovka'), g.find(g.tags.gun) || at(g, 'Lyptsi'), at(g, 'Lyptsi')],
  sideNote:
    'Ukraine: Russian Lancets loiter until a howitzer or air defense shows itself. Keep a Sting and a fire group with every battery.',
  scenario: g => {
    g.capture('Lyptsi', UA);
    const L = g.site('Lyptsi');
    squads(g, UA, 'infantry', L.x, L.y - 30, 3, true);
    const h = g.spawn('howitzer', UA, L.x - 40, L.y + 120);
    g.tags.gun = h.id;
    g.spawn('mavic', UA, L.x, L.y + 60);
    g.build('radar', UA, L.x + 120, L.y + 90);
    g.build('generator', UA, L.x + 170, L.y + 60);
    g.funds[UA] = 2400;
    for (const r of g.structs.filter(x => x.team === RU && x.type === 'radar')) g.removeStruct(r);
    const Z = g.site('Zhuravlyovka');
    g.capture('Zhuravlyovka', RU);
    squads(g, RU, 'infantry', Z.x, Z.y + 30, 2, true);
    for (const dx of [-60, 60])
      g.spawn('howitzer', RU, Z.x + dx, Z.y - 90, { kind: 'bombard', x: L.x, y: L.y, target: null });
    g.funds[RU] = 0;
  },
  objectives: [
    {
      title: 'Incoming',
      text: 'Shells are landing on Lyptsi. Every time a gun fires, your radar post catches the flash and shows the gun for a few seconds: two in a wood, six in the open. Wait for one.',
      done: g => g.units.some(u => u.team === RU && u.type === 'howitzer' && u.seenBy[UA]),
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'Answer blind',
      text: 'Select your howitzer and Ctrl+right-click the flash (or press B and click). Unobserved fire scatters 2.4 times wider, but a battery is a big target. Twelve shells; the depot and ammunition trucks bring more.',
      done: bombarding(UA, 'howitzer'),
    },
    {
      title: 'Eyes on',
      text: 'Fly the Mavic north until the battery is in steady view. Observed fire lands with normal scatter. Switch the Mavic to Low (R) if the guns are in the trees.',
      done: g => g.units.some(u => u.team === UA && u.def.recon && !u.dead && dist(u, at(g, 'Zhuravlyovka')) < 300),
      marker: town('Zhuravlyovka'),
    },
    {
      title: 'Shoot and scoot',
      text: 'Their guns cannot see your flash, but their drones can. Switch your howitzer to Shoot and scoot (R): after every fire mission it displaces 90 to 150, into trees when it can. The shells meant for it land where it was.',
      done: inMode(UA, 'howitzer', 'scoot'),
    },
    {
      title: 'Silence the guns',
      text: 'Destroy both Russian howitzers. If your gun runs dry, pull it back toward the artillery depot or wait for the truck.',
      done: g => kills(g, UA, 'howitzer') >= 2,
    },
    {
      title: 'Radar off',
      text: 'An air defense vehicle with its radar on is seen by enemy radar posts within 900, and it is exactly what a Lancet loiters for. Move your mobile air defense up toward Lyptsi and switch it to Passive (R): hidden, range down to 60%. Switch it back on when the Lancets are in sight.',
      done: inMode(UA, 'aa', 'passive'),
    },
    {
      title: 'Guard the battery',
      text: 'Two Lancets are coming for your howitzer. Queue a Sting (V at the works), keep a fire group with the gun, and turn the air defense radar back on when they show. Shoot both down.',
      onStart: g => {
        const Z = at(g, 'Zhuravlyovka'),
          L = at(g, 'Lyptsi');
        for (const dx of [-80, 80]) g.spawn('lancet', RU, Z.x + dx, Z.y - 200, MOVE(L.x, L.y));
      },
      done: g => kills(g, UA, 'lancet') >= 2,
      marker: own('artyDepot'),
    },
    {
      title: 'Rockets',
      text: 'Queue rocket artillery at the depot (X): six rockets a salvo, range 620, three salvos carried. Bring it up behind Lyptsi into a wood.',
      done: g => g.typeCount(UA, 'mlrs') >= 1,
      marker: own('artyDepot'),
    },
    {
      title: 'A salvo on the trenches',
      text: 'Put the Mavic over Zhuravlyovka and give the rocket launcher a fire mission on the trench line (Ctrl+right-click). Six rockets with wide scatter: rockets are for area targets, howitzers for point targets, and neither for anything near your own troops.',
      done: bombarding(UA, 'mlrs'),
      marker: town('Zhuravlyovka'),
    },
  ],
};
