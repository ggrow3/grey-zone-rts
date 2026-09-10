<script setup lang="ts">
import { ref } from 'vue';
import { UNITS, STRUCTS, CIV_TYPES, STRATEGY, BUILDING_NOTES, UA, TARGET_WORDS, MODE_SETS, MODE_SET_OF, unitPoints, structPoints, SCORE } from '../../game/data';
import type { UnitDef } from '../../game/data';
import { BARK_GLOSS, COUNTERS } from '../../game/data';
import { FACTION_FACTS } from '../../game/factions';

defineEmits<{ (e: 'close'): void }>();
const tab = ref<'units' | 'buildings' | 'armies' | 'strategy' | 'controls'>('units');
const groups: [string, (k: string) => boolean][] = [['Drones', k => !!UNITS[k].air], ['Troops', k => !!UNITS[k].troop], ['Vehicles and artillery', k => !UNITS[k].air && !UNITS[k].troop && !UNITS[k].auto], ['Logistics and civilians', k => !!UNITS[k].auto]];
function unitStats(d: UnitDef) {
  const bits: string[] = [];
  bits.push(d.cost ? d.cost + ' funds' : 'not built', d.time ? d.time + ' s' : '');
  if (d.crew) bits.push(d.crew + ' crew'); if (d.operated) bits.push('flown by a squad (' + (d.link || 650) + ' range)'); if (d.electric) bits.push('battery ' + d.endurance + ' s'); if (d.fuelDrone) bits.push('gasoline'); if (d.jet) bits.push('turbojet');
  bits.push(d.hp + ' hp', d.speed + ' speed' + (d.roadMul ? ', +' + Math.round((d.roadMul - 1) * 100) + '% on roads' : ''));
  if (d.kamikaze) bits.push('warhead ' + d.dmg + (d.splash ? ', splash ' + d.splash : '')); else if (d.dmg) bits.push('damage ' + d.dmg + (d.salvo ? ' x' + d.salvo : '') + ' every ' + d.rof + ' s, range ' + d.range + (d.minRange ? ' (min ' + d.minRange + ')' : ''));
  if (d.targets) bits.push('hits ' + d.targets.map(t => TARGET_WORDS[t]).join('/'));
  if (d.evade) bits.push('dodges ' + Math.round(d.evade * 100) + '%'); if (d.jam) bits.push('jams within ' + d.jam); if (d.vision) bits.push('sees ' + d.vision);
  if (d.canCapture) bits.push('captures'); if (d.operator) bits.push('flies drones'); if (d.morale) bits.push('has morale'); if (d.upkeep) bits.push('wages ' + d.upkeep + '/s'); if (d.cap) bits.push('max ' + d.cap);
  if (d.side !== undefined) bits.push(d.side === UA ? 'Ukraine only' : 'Russia only');
  if (!d.civ) bits.push('worth ' + unitPoints(d) + (unitPoints(d) === 1 ? ' point' : ' points'));
  return bits.filter(Boolean).join(' · ');
}
/** the postures, grouped for the manual: which units, which modes */
const POSTURES = Object.entries(MODE_SETS).map(([set, defs]) => ({ units: Object.keys(MODE_SET_OF).filter(k => MODE_SET_OF[k] === set).map(k => UNITS[k].label[0] === UNITS[k].label[1] ? UNITS[k].label[0] : UNITS[k].label[0] + ' / ' + UNITS[k].label[1]).join(', '), defs }));
const CONTROLS: [string, string][] = [['Left-drag', 'select units'], ['Right-click', 'move, attack, or set a factory rally point'], ['Shift+right-click', 'queue a waypoint: units go there after finishing their current move, as many as you like'], ['Z X C V B', 'produce from the selected factory'],
  ['Y', 'take the sticks of the selected drone: it flies to your cursor, left-click attacks a target (or dives a kamikaze drone onto a point), right-click lets go, Y or Esc hands the drone back'],
  ['R', 'cycle the posture of the selected units: hunt, hold, or ambush for FPVs; patrol or guard for interceptors; high or low for Mavics; shoot and scoot for guns; hull down for armor; creep for infantry; silent jammers, passive air defense, truck escort for fire groups'],
  ['Q, then click', 'attack-move: units stop to fight anything they meet on the way, then carry on (Shift-click queues it)'],
  ['. and ,', 'cycle through idle squads (.) or idle drones (,), camera and selection jumping to each'],
  ['Backspace', 'jump to the latest thing that happened to your side: a unit lost, a building under attack, a town taken. The minimap pings them in red'],
  [']', 'solo games: simulation speed 1x, 2x, 3x'], ['Home', 'recall every battery drone for fresh batteries: do it before the snow'], ['Shift-click a product', 'queue five'], ['Click a type in a mixed selection', 'keep only that type'],
  ['F', 'selected kamikaze drones dive at the nearest target they can see; a swarm spreads its dives'], ['Ctrl+right-click, or B then click', 'artillery fires on a map point, seen or unseen'], ['E', 'selected troops dig a trench where they stand'],
  ['O / Shift+O', 'add a person to the selected squad as a drone operator, or send one back'], ['M', 'this manual'], ['T', 'research tree'], ['L', 'unit shape legend'], ['K', 'battle log'], ['N', 'sound: effects and voice, effects only, off'], ['Double-click', 'on a unit: select every unit of that type on screen (tanks, squads, drones alike); on empty ground: every drone on screen'], ['G', 'form the selected drones into a swarm, or disband one'],
  ['Ctrl+1 to 5', 'assign a group, digit to recall'], ['W A S D, arrows, screen edge, minimap', 'move the camera'], ['Mouse wheel, + and -', 'zoom'], ['Space', 'jump to headquarters'], ['P', 'pause (solo games)'], ['Enter', 'chat (multiplayer)'], ['Esc', 'cancel or deselect']];
</script>

<template>
  <div id="manual" class="panel">
    <div id="manualHead">
      <h3>Field manual</h3>
      <div id="manualTabs"><button v-for="[k, l] in [['units', 'Units'], ['buildings', 'Buildings'], ['armies', 'Two armies'], ['strategy', 'Strategy'], ['controls', 'Controls']]" :key="k" type="button" :class="{ on: tab === k }" @click="tab = k as typeof tab">{{ l }}</button></div>
      <button type="button" class="close" @click="$emit('close')">Close (M)</button>
    </div>
    <div id="manualBody">
      <template v-if="tab === 'units'">
        <template v-for="[title, f] in groups" :key="title">
          <h4>{{ title }}</h4>
          <div class="uentry" v-for="k in Object.keys(UNITS).filter(f)" :key="k">
            <div><div class="un">{{ UNITS[k].label[0] === UNITS[k].label[1] ? UNITS[k].label[0] : UNITS[k].label[0] + ' / ' + UNITS[k].label[1] }}</div><div class="us">{{ unitStats(UNITS[k]) }}</div></div>
            <div>{{ UNITS[k].blurb }}</div>
          </div>
        </template>
      </template>
      <template v-else-if="tab === 'buildings'">
        <h4>Yours to build or hold</h4>
        <div class="uentry" v-for="(d, k) in STRUCTS" :key="k">
          <div><div class="un">{{ d.label }}</div><div class="us">{{ [d.cost ? d.cost + ' funds, ' + d.time + ' s' : 'placed at start', d.hp + ' hp', d.vision ? 'sees ' + d.vision : '', d.jam ? 'jams ' + d.jam : '', d.netR ? 'net ' + d.netR : '', d.heal ? 'heals ' + d.heal : '', d.power ? 'charges ' + d.power + ' drones' : '', d.heatPer ? 'heats ' + d.heatPer + ' per drone' : ''].filter(Boolean).join(' · ') }}</div></div>
          <div>{{ BUILDING_NOTES[k] }}</div>
        </div>
        <h4>Civilian sites</h4>
        <div class="uentry" v-for="(d, k) in CIV_TYPES" :key="k">
          <div><div class="un">{{ d.label }}</div><div class="us">{{ d.hp }} hp{{ d.heal ? ', heals troops within ' + d.heal : '' }}</div></div>
          <div>{{ k === 'power' ? 'A substation charges 30 battery drones for its nation. The Gerans go for these first.' : k === 'hospital' ? 'Heals that nation\'s troops nearby. Hitting one as Ukraine costs support.' : 'Losing it cuts Ukrainian income; hitting a Russian one costs Ukrainian support.' }}</div>
        </div>
        <h4>Sites on the map</h4>
        <p>Towns: captured by troops, send supply trucks, allow building nearby. Wheat fields: feed 6 squads each, add recruits and support, burn under heavy fire. Gas wells and the Belgorod fuel depot: pay 5 funds a second and fuel 6 vehicles each while the pipeline is intact.</p>
      </template>
      <template v-else-if="tab === 'armies'">
        <h4>How the two armies differ</h4>
        <table class="armies"><thead><tr><th>Topic</th><th class="ua">Ukraine</th><th class="ru">Russia</th></tr></thead>
          <tbody><tr v-for="f in FACTION_FACTS" :key="f.topic"><td>{{ f.topic }}</td><td>{{ f.ua }}</td><td>{{ f.ru }}</td></tr></tbody></table>
        <h4>What the troops shout</h4>
        <p><span v-for="(gloss, phrase) in BARK_GLOSS" :key="phrase" style="display:inline-block;margin:0 14px 4px 0"><b>{{ phrase }}</b> <span class="dim">{{ gloss }}</span></span></p>
        <h4>Veterans and shells</h4>
        <p>Every two confirmed kills raise a unit one rank (Trained, Veteran, Elite): 6% more damage dealt and 6% less taken per rank, and drones dodge a little better. Chevrons under a unit show its rank. Howitzers carry 12 shells and rocket launchers three salvos; guns beside the artillery depot or headquarters refill slowly, and an ammunition truck leaves the headquarters for any gun below half. Trucks are captured and killed like any other. A gun that fires is shown to enemy radar for three seconds: expect counter-battery fire. Artillery is friendly-fire capable: howitzer and rocket splash hits your own ground units as hard as the enemy's, and a friendly-fire loss is named in the battle log.</p>
        <h4>Operators</h4>
        <p>Ukrainian drones are flown by infantry squads. A squad starts with one operator and can take up to four (press O with the squad selected; each one is a person from your pool). Every operator flies three drones, six after Drone swarm control, so a squad of four flies a dozen. Drones link to the nearest squad with a free slot within 900 and must stay inside its control range.</p>
        <h4>Flying a drone yourself</h4>
        <p>Select one airborne drone and press Y to take the sticks. The camera rides with it and it flies toward your cursor; left-click an enemy to put it on target, or, with a kamikaze drone, left-click the ground to dive onto that spot (a treeline, a trench, a road where a truck is about to be). A human on the sticks dodges 15% more of what is fired at it, flies 15% faster, and a piloted FPV hits 20% harder. The squad's control range still applies: the leash is drawn while you fly. Right-click lets go of a target; Y or Esc hands the drone back to its squad.</p>
        <h4>Postures (R)</h4>
        <p>Many units have two or three postures; the selection panel shows the buttons and R steps through them. The first is the default.</p>
        <div class="uentry" v-for="p in POSTURES" :key="p.units"><div class="un">{{ p.units }}</div><div><span v-for="m in p.defs" :key="m.key" style="display:block;margin-bottom:3px"><b>{{ m.label }}</b> <span class="dim">{{ m.desc }}</span></span></div></div>
        <h4>Rock, paper, scissors</h4>
        <p>Every weapon has things it is built to kill and things it only scratches. The selection panel shows a unit's strong and weak matchups; the short version:</p>
        <div class="uentry" v-for="[u, t] in COUNTERS" :key="u"><div class="un">{{ u }}</div><div>{{ t }}</div></div>
        <h4>Cover against drones</h4>
        <p>A squad in an open field takes 45% extra from every drone strike; in a town 55% less, in a wood 65% less (and it cannot be seen beyond 140), in a trench 75% less, and in a trench dug inside a wood 85% less. Drones are hard for other drones to hit: a Sting or Yolka misses a quarter more of its shots than a gun on the ground, so interceptors need numbers and machine guns and air defense do the real shooting. Move squads from cover to cover and dig in the moment they stop. Artillery follows the same rule: a gun in a wood is hidden beyond 140, shows on radar for only two seconds after a shot, and takes 65% less from drones; in the open it is exposed for six seconds a shot and drones hit it 45% harder. Recon drones fly high: the Mavic, Shark, and Orlan are out of reach of machine guns, only air defense and interceptors touch them, and they dodge 65% to 80% of that, so expect them to keep watching. On the map, the higher a drone flies the farther its shadow falls from it, and high drones drift across the ground as the camera moves.</p>
        <h4>Air power and strikes from beyond the map</h4>
        <p>Both sides can call a glide bomb onto any point (Russia's KAB-500 for 350 funds every 40 seconds, Ukraine's F-16 bombs for 500 every 90): a 700-damage blast that erases trenches and does not care about cover, announced six seconds ahead with a red ring so squads can run. Mobile air defense within 260 of the point shoots down a third of them, two thirds with Patriot or S-400 coverage. Russia can also fire an Iskander ballistic missile at a chosen building (800 funds, two-minute reload, 900 damage, eight-second warning). Ukraine can send an idle Liutyi at a refinery inside Russia (600 funds): 60% get through, each burning refinery cuts Russian income 15% for four minutes and slows Russian aviation.</p>
        <h4>2026: robots, relays, nets, and the kill zone</h4>
        <p>Where an armed enemy drone can see, troops and trucks in the open bleed 1.5 and 2.2 health a second on top of any strike; a red ring under every enemy drone you can see marks its zone, and cover or a friendly net stops it. A Road net tunnel strings five nets along the nearest road in one order. Ukraine's armor plant builds assault robots (capture towns, nobody aboard, drones hit them 40% less, cannot dig in) and relay carriers (your squads' drones are in control range anywhere within 520 of one). Robot logistics research makes every truck unmanned. Launch rails research lets the drone works build the fixed-wing aircraft, and AI terminal guidance lets interceptors hit other drones as well as guns do. From fifteen minutes in, a jet Geran-5 leads each wave.</p>
        <h4>Weather and night</h4>
        <p>Fronts roll across the whole map every few minutes, announced 30 seconds ahead in the top bar. Rain: batteries drain half again as fast, drones dodge 10% less, and anything off the roads slows to 80% in the mud. Fog: everything sees less than half as far, drones hunt half as far, and the computer never launches Gerans into it. Snow: quadcopters are grounded until it stops, fixed wings drain twice as fast, and the fields are mud. Night comes three minutes of every eight: ground units see 60%, drones 85% (Thermal cameras remove that), radar posts see farther, and the Russian side moves. Bad weather and darkness are when the enemy attacks; keep the infantry dug in and the fire groups awake.</p>
        <h4>Score</h4>
        <p>Every kill and capture is worth points scaled by what the target cost, so the big things count for more: an infantry squad {{ unitPoints(UNITS.infantry) }}, a tank {{ unitPoints(UNITS.tank) }}, a rocket launcher {{ unitPoints(UNITS.mlrs) }}, an FPV {{ unitPoints(UNITS.fpv) }}, a Geran {{ unitPoints(UNITS.geran) }}, a barracks {{ structPoints(STRUCTS.barracks) }}, the headquarters {{ structPoints(STRUCTS.hq) }}, a town captured {{ SCORE.capture }}. Hitting a civilian site costs {{ -SCORE.civSite }} and a civilian vehicle {{ -SCORE.civCar }}. The top bar shows your score with units killed and lost; the level panel and the end screen show both sides' scores, your kills and losses, and the funds, people, towns, gas, and wheat you hold.</p>
        <h4>Goals, replays, and the rest of the front</h4>
        <p>In a skirmish each side gets one optional goal at a time (hold a wheat field five minutes, keep the pipeline whole ten, shoot down three drones, kill a gun, take a town, bring five loads home) worth funds and score; the top bar shows it. Every squad has a callsign, a lost squad is named in the log, and when a veteran squad dies the squads within 400 fire at 80% for ten seconds. An announced enemy column shows as a red arrow on the minimap and at the screen edge. Spotted enemy squads that are flying drones wear a link mark. Ground units move in the chosen formation: wedge, line, column, or a block. Your last solo game is saved: Watch last replay on the home page runs it again from the same seed. The end screen graphs both scores over time.</p>
        <h4>Repair</h4>
        <p>A damaged vehicle parked beside the armor plant or the headquarters is patched up at 2% a second. A building mends itself at 0.4% a second while no enemy is within 420 of it. Troops still need a hospital or a field hospital.</p>
        <h4>Winning</h4>
        <p>Destroy the enemy headquarters, or hold all six towns for three minutes.</p>
      </template>
      <template v-else-if="tab === 'strategy'">
        <template v-for="[h, t] in STRATEGY" :key="h"><h4>{{ h }}</h4><p>{{ t }}</p></template>
      </template>
      <template v-else>
        <ul style="padding-left:18px"><li v-for="[k, v] in CONTROLS" :key="k" style="margin-bottom:5px"><kbd>{{ k }}</kbd> {{ v }}</li></ul>
      </template>
    </div>
  </div>
</template>
