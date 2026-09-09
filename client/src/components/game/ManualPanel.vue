<script setup lang="ts">
import { ref } from 'vue';
import { UNITS, STRUCTS, CIV_TYPES, STRATEGY, BUILDING_NOTES, UA, TARGET_WORDS } from '../../game/data';
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
  return bits.filter(Boolean).join(' · ');
}
const CONTROLS: [string, string][] = [['Left-drag', 'select units'], ['Right-click', 'move, attack, or set a factory rally point'], ['Z X C V B', 'produce from the selected factory'],
  ['F', 'selected kamikaze drones dive at the nearest target they can see; a swarm spreads its dives'], ['Ctrl+right-click, or B then click', 'artillery fires on a map point, seen or unseen'], ['E', 'selected troops dig a trench where they stand'],
  ['O / Shift+O', 'add a person to the selected squad as a drone operator, or send one back'], ['M', 'this manual'], ['T', 'research tree'], ['L', 'unit shape legend'], ['K', 'battle log'], ['N', 'sound: effects and voice, effects only, off'], ['Double-click', 'select every drone on screen; double-click a drone to select all of that type'], ['G', 'form the selected drones into a swarm, or disband one'],
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
        <p>Every two confirmed kills raise a unit one rank (Trained, Veteran, Elite): 6% more damage dealt and 6% less taken per rank, and drones dodge a little better. Chevrons under a unit show its rank. Howitzers carry 12 shells and rocket launchers three salvos; guns beside the artillery depot or headquarters refill slowly, and an ammunition truck leaves the headquarters for any gun below half. Trucks are captured and killed like any other. A gun that fires is shown to enemy radar for three seconds: expect counter-battery fire.</p>
        <h4>Operators</h4>
        <p>Ukrainian drones are flown by infantry squads. A squad starts with one operator and can take up to four (press O with the squad selected; each one is a person from your pool). Every operator flies three drones, six after Drone swarm control, so a squad of four flies a dozen. Drones link to the nearest squad with a free slot within 900 and must stay inside its control range.</p>
        <h4>Rock, paper, scissors</h4>
        <p>Every weapon has things it is built to kill and things it only scratches. The selection panel shows a unit's strong and weak matchups; the short version:</p>
        <div class="uentry" v-for="[u, t] in COUNTERS" :key="u"><div class="un">{{ u }}</div><div>{{ t }}</div></div>
        <h4>Cover against drones</h4>
        <p>A squad in an open field takes 45% extra from every drone strike; in a town 55% less, in a wood 65% less (and it cannot be seen beyond 140), in a trench 75% less, and in a trench dug inside a wood 85% less. Drones are hard for other drones to hit: a Sting or Yolka misses a quarter more of its shots than a gun on the ground, so interceptors need numbers and machine guns and air defense do the real shooting. Move squads from cover to cover and dig in the moment they stop. Artillery follows the same rule: a gun in a wood is hidden beyond 140, shows on radar for only two seconds after a shot, and takes 65% less from drones; in the open it is exposed for six seconds a shot and drones hit it 45% harder. Recon drones (Mavic, Shark, Orlan) dodge 65% to 70% of what is fired at them, so expect them to keep watching.</p>
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
