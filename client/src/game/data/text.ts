// Words for the HUD and the manual that are not rules.
import type { TargetClass } from './units';
import type { WeatherKind } from '../types';

export const TARGET_WORDS: Record<TargetClass, string> = {
  inf: 'troops',
  veh: 'vehicles',
  struct: 'buildings',
  air: 'drones',
};
export const RANK_NAMES = ['Recruit', 'Trained', 'Veteran', 'Elite'];

/** what each weather front does, for the top bar and the toasts */
export const WEATHER_TEXT: Record<WeatherKind, { label: string; now: string; coming: string; effect: string }> = {
  clear: {
    label: 'Clear',
    now: 'Skies clearing: drones fly and see again',
    coming: 'Clearing in 30 s',
    effect: 'no penalties',
  },
  rain: {
    label: 'Rain',
    now: 'Rain: batteries drain faster, drones dodge less, everything off the roads slows in the mud',
    coming: 'Rain in 30 s: keep the drones near home',
    effect: 'vision 85%, battery drain x1.5, air evasion -10%, off-road speed 80%',
  },
  fog: {
    label: 'Fog',
    now: 'Fog: nobody sees far, drones hunt half as far, and the enemy infantry moves',
    coming: 'Fog in 30 s: drones will not see, watch the treelines',
    effect: 'vision 45%, drone hunting radius 50%, no Geran waves from the bot',
  },
  snow: {
    label: 'Snow',
    now: 'Snow: quadcopters are grounded, fixed wings ice up, the fields are mud',
    coming: 'Snow in 30 s: land the quads',
    effect: 'quads grounded, vision 70%, battery drain x2, off-road speed 80%',
  },
};

/** the counters, one line each, for the manual */
export const COUNTERS: [string, string][] = [
  [
    'Infantry',
    'beats infantry in the open (cover matters more than numbers); loses to IFVs, bombers, and FPVs; rifles barely scratch armor or buildings',
  ],
  [
    'IFV',
    'beats infantry (autocannon x1.5) and small drones; loses to tanks (its gun does half damage to armor) and to FPVs',
  ],
  [
    'Tank',
    'beats vehicles (x1.4) and buildings (x1.2); cannot shoot drones at all and only splashes infantry (x0.6); seven FPVs kill it',
  ],
  [
    'Mobile fire group',
    'beats small drones (x1.35: FPVs, Mavics, Stings); useless against everything else and reaches nothing high',
  ],
  [
    'Mobile air defense',
    'beats large aircraft (x1.6: Shark, Orlan, bombers, Gerans, Liutyi, Lancet); shoots nothing on the ground; a Lancet target',
  ],
  [
    'Sting / Yolka interceptor',
    'beats slow large aircraft (x1.5, Gerans especially); poor against quads (drones dodge other drones); prey for air defense',
  ],
  [
    'FPV, fiber FPV',
    'beats vehicles (x1.25) and troops in the open; weak against buildings (x0.7); dies to jammers (radio only), nets, fire groups',
  ],
  [
    'Heavy bomber',
    'beats infantry clusters and trenches (x1.4); weak against buildings and vehicles (x0.8); air defense and Stings kill it',
  ],
  [
    'Howitzer, rockets',
    'beats buildings (x1.3) and dug-in infantry (x1.2, rockets x1.3); needs a spotter; helpless against drones; hunted by Lancets and counter-battery radar',
  ],
  [
    'Lancet',
    'beats vehicles (x1.4: guns, air defense, jammers, tanks); weak against infantry (x0.8); air defense and interceptors stop it',
  ],
  [
    'Liutyi, Geran',
    'beats buildings (x1.3 / x1.2); cannot hit units at all; machine guns, interceptors, and air defense all get them',
  ],
  ['Jammer, EW station', 'beats radio drones outright; beaten by fiber FPVs and by anything that shoots the jammer'],
  ['Motorcycles', 'beat empty towns (speed 105); beaten by everything that shoots back'],
  [
    'Assault robot',
    'captures towns and shrugs off 40% of drone damage with nobody aboard; slow, cannot dig in or fly drones; IFVs and tanks kill it like any vehicle',
  ],
  ['Relay carrier', "projects the squads' control range 520 around itself and shoots nothing; hunted like a truck"],
];

/** the strategy tab of the manual */
export const STRATEGY: [string, string][] = [
  [
    'The shape of the war',
    'Everything on this map is either a drone, something that feeds and flies drones, or something drones are hunting. Nothing on the ground survives in the open for long, so the game is about who sees whom first, who has squads to fly, who has power to charge, and who keeps the roads and pipelines running. Wins come from grinding the enemy economy down and then walking artillery and fiber FPVs onto the headquarters, not from a single charge.',
  ],
  [
    'Opening',
    'Send your five squads to the nearest town at once, Lyptsi as Ukraine or Zhuravlyovka as Russia: towns pay by truck and let you build forward. Put a fire group and a Sting over your substation before the first Geran wave (about four minutes). Queue Mavics before FPVs: you can only hit what you see. Take the contested wheat field in the middle early; food is the first supply line you hit.',
  ],
  [
    'Squads and drones',
    "Until Drone swarm control, one squad flies one drone, so your airborne drone force is capped by your infantry count. Build more drones anyway: extras sit grounded and take off the moment a squad is free. Keep squads in woods, trenches, or towns a few hundred pixels behind the point you want to strike; drones cannot go beyond the squad's control range.",
  ],
  [
    'Power, fuel, food',
    'Every building except nets and trenches draws power from the grid it stands on: the headquarters gives 30, the city substation 60, a power plant 90, a generator set 20; a barracks draws 5, the works 10, the armor plant 8, the depot 6, radar 4, an EW station 8, a hospital 3. Buildings link to neighbours within 150; pylons carry the line 190 at a time. A grid short of supply runs every building on it at the ratio, and a grid with no source runs nothing: factories stop, radar sees 30%, jammers go quiet. Whatever supply is left after the buildings charges battery drones, one point each. The enemy cuts pylons and hits the substation first; a generator set beside a forward building is the cheap island. Gasoline aircraft and vehicles draw on gas flowing through an intact pipeline. Squads eat: past the wheat line your infantry fight at 60%.',
  ],
  [
    'The kill zone',
    'Where an armed enemy drone can see, nothing survives in the open: troops and trucks outside cover under its eye bleed 1.5 and 2.2 health a second, on top of the strikes themselves. A red dashed ring under every enemy drone you can see marks its zone. Cover, nets, and road net tunnels are the answer, and the zone is 25 km deep on the real front now.',
  ],
  [
    'Air defense',
    'Drones dodge bullets, so guns need volume and research. Jammers and EW stations do not miss: radio drones inside the bubble fall unless they are fiber-optic. Nets catch FPVs over a spot. Stings hunt on their own. Layer them.',
  ],
  [
    'Ground and cover',
    'Drones kill troops in the open: a squad in a field takes 45% extra from every drone strike. Get them into a town (55% less from drones), a wood (65% less, and hidden beyond 140), or a trench (75% less), and dig the trench inside a wood for the best of all (85% less). Infantry in forest also hit 50% harder. Tanks only shoot vehicles and buildings, IFVs are what shoot at troops.',
  ],
  [
    'Artillery',
    'Howitzers reach 430, rockets 620; both need a spotter to be accurate but will fire on a map point blind (Ctrl+right-click or B) with wide scatter. Guns belong in the trees: a battery in a wood is unseen beyond 140, shows on enemy radar for only two seconds after a shot, and takes 65% less from drones. In the open it is seen from anywhere, exposed for six seconds a shot, and drones hit it 45% harder. Lancets exist to kill your guns: keep a Sting and a fire group with the battery. Shells do not know whose troops are under them: your own ground units inside the splash take full damage, and unobserved fire scatters wide, so shift fire or hold it before your infantry goes in. The game warns DANGER CLOSE when an order puts your own units in the beaten zone.',
  ],
  [
    'Logistics and trade',
    'Supply trucks pay when they reach a town, grain and oil trucks carry from the fields and wells, and every 75 seconds a trade convoy goes to the border and comes back with aid. A squad standing over an unescorted truck takes it and its cargo.',
  ],
  [
    'Civilians, morale, defectors',
    'As Ukraine, every Russian civilian site or vehicle you hit costs support, and support scales your income. Keep support above 70 and hold Shebekino or Zhuravlyovka and Russian volunteers join you. Mercenaries fight well while paid and winning; North Koreans break when Russia is losing.',
  ],
  [
    'Playing Russia',
    'Your drones are autonomous from the start, your Lancets hunt artillery, Molniyas are cheap long reach, and Geran waves cost you nothing. Your weakness is people: defections bleed you, North Koreans break when you lose towns. Take the wheat and gas early, keep the pipeline from Kursk intact.',
  ],
];
