import { UA } from '../data';
import type { Level } from './types';
import { at, hqOf, inMode, own, piloting, ring, substation, town, unitsNear } from './helpers';

export const level02: Level = {
  id: 'eyes',
  map: 'kharkiv',
  title: '2. Eyes in the sky',
  side: UA,
  difficulty: 0.5,
  passiveUntil: 4,
  noGeransUntil: 4,
  blurb:
    'Drones are most of your army. Build FPVs, put a Mavic up to see, set postures, strike what you see, bind a swarm, guard the substation, fly a drone yourself, and stand up air defense before the Geran waves.',
  concepts: [
    'Drone works and heat',
    'Operators and control range',
    'Recon before strike',
    'Postures: hunt, hold, guard, low',
    'Swarms',
    'Pilot mode',
    'Batteries, recharging, and recall',
    'Charging capacity from the grid',
    'Air defense layers',
  ],
  briefing: [
    'The drone works is running and the operators are ready. Everything that happens on this front happens because somebody saw it first.',
    'Put a Mavic up before you send a single FPV: kamikaze drones and guns can only hit what your side can see.',
    'Every drone here runs on a battery. An FPV has seventy seconds in the air, a Mavic two minutes; then it flies to the nearest squad or back to the works, lands, and charges from the grid. The substation is what charges them, which is why the Gerans want it.',
    'Intelligence says the first Geran wave is coming for the substation east of the city. Fire groups reach the low ones, a Sting hunts the rest. Have both up before it arrives.',
    'Fly carefully, commander. Every drone is a squad on the sticks.',
  ],
  shots: g => [
    g.structs.find(s => s.team === 0 && s.type === 'droneWorks') || hqOf(g, UA),
    at(g, 'Lyptsi'),
    substation(g, 0) || hqOf(g, UA),
    hqOf(g, UA),
  ],
  sideNote:
    'Ukraine: every drone is flown by a squad until you research Full autonomy; each operator in a squad flies three. Russian drones fly themselves from the start.',
  objectives: [
    {
      title: 'Fly FPVs',
      text: 'Click the drone works at your base and press Z three times. Drones are cheap and take a fraction of a second each. Each squad has one drone operator who flies up to three drones; the next level shows how to put more people in a squad. See Operators in the top bar.',
      done: g => g.stats.drones[UA] >= 3,
      marker: own('droneWorks'),
    },
    {
      title: 'Eyes forward',
      text: 'Queue a Mavic recon quad (C at the drone works), select it, and send it north toward Lyptsi. Artillery and kamikaze drones can only hit what your side can see.',
      done: g => g.units.some(u => u.team === UA && u.type === 'mavic' && !u.dead && u.y < at(g, 'Lyptsi').y + 60),
      marker: town('Lyptsi'),
    },
    {
      title: 'Hold, do not hunt',
      text: 'An FPV in Hunt posture dives at anything it sees within 340. Select two FPVs and press R, or click Hold in the panel: they loiter and dive only on your order. Hold keeps your warheads for the target you choose.',
      done: inMode(UA, 'fpv', 'hold', 2),
    },
    {
      title: 'Batteries',
      text: 'Select an FPV and read the panel: an FPV flies 70 seconds on a charge, a Mavic 120, a Sting 80. Rain drains a battery half again as fast and snow twice as fast, and a diving FPV stops draining. At a quarter charge a drone breaks off and flies to its own squad, else the nearest friendly infantry squad, else the drone works; flat with nowhere to land, it falls out of the sky. Keep a squad forward and your drones never fly far to land. Wait for one of your first FPVs to land.',
      done: g => g.units.some(u => u.team === UA && !u.dead && u.def.air && !!u.landed),
    },
    {
      title: 'Charging',
      text: 'A landed drone swaps batteries: 25 seconds for an FPV and 20 for a Mavic at the works, half that beside an infantry squad, and it is airborne again on its own. The swap draws on the grid: each battery drone needs one point of spare power, and your headquarters gives 30 and the Kharkiv substation 60 minus what the buildings use. Read Charging in the top bar. Over the limit, every swap takes three times as long and the works builds no more battery drones. Home (the button in the panel) recalls every battery drone at once: press it before a snow front or when the enemy air defense is awake. Watch a drone take off again.',
      done: g =>
        g.units.some(
          u => u.team === UA && !u.dead && u.def.air && !u.landed && u.rechargeT !== undefined && u.rechargeT <= 0
        ),
    },
    {
      title: 'Air defense',
      text: 'Enemy Geran-2 drones are about to start coming for your buildings. Queue a mobile fire group at the barracks (X) and a Sting interceptor at the drone works (V). Fire groups reach low drones, Stings hunt them.',
      done: g => g.typeCount(UA, 'fireGroup') >= 3 && g.typeCount(UA, 'interceptor') >= 1,
      marker: own('barracks'),
    },
    {
      title: 'Strike',
      text: 'The enemy is moving now. Select your FPVs (double-click one to grab all on screen) and press F: kamikaze drones dive at the nearest target they can see, within range of their squad. Nothing in sight? Push the Mavic north.',
      done: g => g.stats.kills[UA] >= 2,
    },
    {
      title: 'Swarm',
      text: 'Select three or more drones and press G to bind them into a swarm. Pick a formation in the panel. A swarm keeps its shape, and F spreads its dives over everything around a target.',
      done: g => g.swarms.some(s => s.team === UA),
    },
    {
      title: 'Guard the substation',
      text: 'The Gerans go for the substation east of the city first. Move the Sting over it and switch it to Guard (R): it stays at its post, engages within 170, and comes back. Patrol is for hunting; Guard is point defense.',
      done: g => {
        const sub = substation(g, 0);
        return !!sub && unitsNear(g, UA, sub, 260, 'interceptor').some(u => g.modeOf(u) === 'guard');
      },
      marker: g => {
        const sub = substation(g, 0);
        return sub ? ring(sub, 120) : null;
      },
    },
    {
      title: 'Take the sticks',
      text: 'Select one airborne drone and press Y. The camera rides with it and it flies toward your cursor; left-click an enemy to attack, and with an FPV, left-click the ground to dive on that spot. A human on the sticks dodges 15% more and hits 20% harder. Y or Esc hands it back.',
      done: piloting(UA),
    },
    {
      title: 'Low over the woods',
      text: 'A Mavic flies high, out of reach of machine guns, but it cannot see into woods or trenches. Select it and switch to Low (R): it sees dug-in troops and guns anywhere in its view, and IFVs and fire groups can now reach it. Use Low for a look, High for the watch.',
      done: inMode(UA, 'mavic', 'low'),
    },
    {
      title: 'Hold the sky',
      text: 'Shoot down four enemy drones. Keep the fire groups and the Sting over your substation and headquarters; the Gerans go for the power first, and the Gerbera decoys with them are meant to soak up your shots.',
      done: g => g.stats.shotDown[UA] >= 4,
    },
  ],
};
