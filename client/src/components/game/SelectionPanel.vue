<script setup lang="ts">
import { computed } from 'vue';
import type { Controller } from '../../game/controller';
import type { Unit, Struct } from '../../game/types';
import { UNITS, FORMATIONS, FUEL_USERS, TARGET_WORDS, RANK_NAMES } from '../../game/data';
import { rankOf } from '../../game/sim';
import { dist, clamp } from '../../game/dmath';

const props = defineProps<{ ctl: Controller; tick: number }>();
const g = () => props.ctl.game;
const sel = computed(() => { void props.tick; return props.ctl.selection.filter(e => !e.dead); });
const one = computed(() => sel.value.length === 1 ? sel.value[0] : null);
const unitsSel = computed(() => sel.value.filter(e => e.isUnit) as Unit[]);
const swarmSel = computed(() => { const u = unitsSel.value; return u.length && u.every(x => g().swarmOf(x) === g().swarmOf(u[0]) && g().swarmOf(x)) ? g().swarmOf(u[0]) : null; });
const counts = computed(() => { const c: Record<string, number> = {}; for (const u of unitsSel.value) c[u.type] = (c[u.type] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5); });
const hpColor = (r: number) => r > 0.5 ? 'var(--ok)' : r > 0.25 ? 'var(--warn)' : 'var(--ru)';

function unitRows(e: Unit): [string, string][] {
  const d = e.def, G = g(), PL = props.ctl.team, rows: [string, string][] = [];
  if (d.kamikaze) { rows.push(['Warhead', String(d.dmg)], ['Attack', 'one-way dive, dies on impact']); }
  else if (d.dmg) { rows.push(['Damage', d.dmg + (d.salvo ? ' x' + d.salvo : '')], ['Range', String(G.rangeOf(e))]); }
  rows.push(['Can hit', d.targets ? d.targets.map(k => TARGET_WORDS[k]).join(', ') : 'nothing']);
  if (d.ammo) rows.push(['Shells', (e.ammo || 0) + ' / ' + d.ammo + (e.ammo === 0 ? ', waiting for a truck' : e.ammoTruckId ? ', truck on the way' : '')]);
  if (e.revealT && e.revealT > 0 && d.indirect) rows.push(['Exposed', 'firing revealed you to radar for ' + Math.ceil(e.revealT) + ' s']);
  if (d.indirect) { const cv = e.cover || 'open'; rows.push(['Position', cv === 'forest' ? 'in a wood: hidden beyond 140, drones -65%, 2 s radar exposure' : cv === 'urban' ? 'in a town: hidden beyond 220, drones -55%' : 'IN THE OPEN: seen from anywhere, drones +45%, 6 s radar exposure. Move into the trees']); }
  if (!d.auto && !d.kamikaze) rows.push(['Rank', RANK_NAMES[rankOf(e)] + ' (' + (e.kills || 0) + ' kills)']);
  if (d.crew) rows.push(['Crew', G.crewLabel(d, e.team) + (d.air ? ', return when it is lost' : ', half are lost with it')]);
  if (!d.air && d.roadMul) rows.push(['Roads', (e.onRoad ? 'on a road, ' : 'off road, ') + Math.round((d.roadMul - 1) * 100) + '% faster on roads']);
  if (d.troop && e.order.kind === 'dig') rows.push(['Digging', Math.ceil(e.digT || 0) + ' s to go']);
  if (d.indirect && e.order.kind === 'bombard') rows.push(['Fire mission', G.inVision(PL, e.order.x, e.order.y) ? 'area fire, observed' : 'area fire, unobserved: scatter x2.4']);
  if (d.electric) rows.push(['Power', 'battery: lands to swap batteries after ' + d.endurance + ' s' + (G.supply[e.team].power < 1 ? ', charging slowed by the power shortage' : '')]);
  if (d.fuelDrone) rows.push(['Power', 'gasoline engine: draws on the fuel supply']);
  if (d.jet) rows.push(['Power', 'turbojet']);
  if (d.troop && G.supply[e.team].food < 1) rows.push(['Supply', 'hungry: fire at ' + Math.round(G.foodMul(e.team) * 100) + '%']);
  if (FUEL_USERS.has(e.type) && G.supply[e.team].fuel < 1) rows.push(['Supply', 'short of fuel: speed ' + Math.round(G.fuelMul(e) * 100) + '%']);
  if (d.morale) rows.push(['Morale', Math.round(e.morale === undefined ? 90 : e.morale) + '%' + (e.shaken ? ', shaken: falling back' : '') + (d.upkeep ? ', wages ' + d.upkeep + '/s' : '')]);
  if (d.troop) { const cv = e.cover || 'open', wood = cv === 'trench' && G.terrain.coverOf(e.x, e.y) === 'forest'; rows.push(['Cover', cv === 'trench' ? (wood ? 'trench in a wood: -45% damage, drones -85%, seen only within 110' : 'trench: -45% damage, drones -75%, seen only within 110') : cv === 'forest' ? 'forest: +50% fire, -40% damage, drones -65%, seen only within 140' : cv === 'urban' ? 'town: +20% fire, -25% damage, drones -55%, seen within 220' : 'OPEN GROUND: +30% damage, drones +45%. Get into a town, a wood, or a trench']); }
  if (d.endurance) rows.push(['Flight time', e.landed ? 'landed, airborne again in ' + Math.ceil(e.rechargeT || 0) + ' s' : Math.ceil(e.batt === undefined ? d.endurance : e.batt) + ' s of ' + d.endurance + (e.batt !== undefined && e.batt < d.endurance * 0.25 ? ', heading home' : '')]);
  if (d.operated) rows.push(['Operator', !G.needsOperator(d, e.team) ? 'autonomous' : e.grounded ? 'none: grounded until a squad within 900 has a free slot' : e.operator && !e.operator.dead ? UNITS[e.operator.type].label[0] + ', ' + Math.round(dist(e, e.operator)) + ' of ' + G.linkRange(e) + ' range' : 'none, searching']);
  if (d.operator) { rows.push(['Operators', (e.ops || 1) + ' of 4, ' + G.opCap(e.team) + ' drones each']); rows.push(['Flying', G.droneCount(e) + ' of ' + G.opCapOf(e) + ' drones']); }
  if (d.jam) rows.push(['Jam radius', String(d.jam)]);
  rows.push(['Vision', String(Math.round(d.vision * G.visMul(e.team)))]);
  if (d.minRange) rows.push(['Minimum range', String(d.minRange)]);
  return rows;
}
function structRows(e: Struct): [string, string][] {
  const d = e.def, rows: [string, string][] = [];
  if (e.build < 1) rows.push(['Construction', Math.floor(e.build * 100) + '%']);
  if (d.produces) rows.push(['Rally', 'right-click on map']);
  if (d.jam) rows.push(['Jam radius', String(d.jam)]);
  if (d.netR) rows.push(['Net radius', String(d.netR)]);
  if (d.heal) rows.push(['Heals troops', 'within ' + d.heal + ', ' + Math.round((d.healRate || 0) * 100) + '% a second']);
  return rows;
}
</script>

<template>
  <div id="selpanel">
    <template v-if="!sel.length">
      <h3>Nothing selected</h3>
      <div class="row dim">Drag to select units. Right-click to move or attack. Click a building to manage it.</div>
    </template>
    <template v-else-if="one">
      <h3>{{ one.isStruct ? one.def.label : one.def.label[one.team] }}</h3>
      <div class="hpbar"><i :style="{ width: (clamp(one.hp / one.def.hp, 0, 1) * 100).toFixed(0) + '%', background: hpColor(one.hp / one.def.hp) }" /></div>
      <div class="row"><span>Health</span><b>{{ Math.ceil(one.hp) }} / {{ one.def.hp }}</b></div>
      <template v-if="one.isStruct"><div class="row" v-for="r in structRows(one as Struct)" :key="r[0]"><span>{{ r[0] }}</span><b>{{ r[1] }}</b></div></template>
      <template v-else>
        <div class="row" v-for="(r, i) in unitRows(one as Unit).slice(0, 7)" :key="i"><span>{{ r[0] }}</span><b>{{ r[1] }}</b></div>
        <div v-if="(one as Unit).def.operator" class="forms"><button type="button" @click="ctl.setOps(1)" title="One person from the pool joins as a drone operator (O)">+ operator (O)</button><button type="button" @click="ctl.setOps(-1)" title="Send one operator back to the pool (Shift+O)">− operator</button></div>
        <button v-if="(one as Unit).def.troop" type="button" class="strike" style="border-color:#7a6a3a" @click="ctl.digIn()">Dig in (E)</button>
        <button v-if="(one as Unit).def.indirect" type="button" class="strike" @click="ctl.startBombard()">Fire on an area (B)</button>
        <button v-if="(one as Unit).def.kamikaze" type="button" class="strike" @click="ctl.strikeNearest()">Dive at nearest target (F)</button>
      </template>
    </template>
    <template v-else>
      <h3>{{ swarmSel ? 'Swarm of ' + unitsSel.length : unitsSel.length + ' units selected' }}</h3>
      <div v-if="unitsSel.some(u => u.def.operator)" class="forms"><button type="button" @click="ctl.setOps(1)">+ operator (O)</button><button type="button" @click="ctl.setOps(-1)">− operator</button></div>
      <button v-if="unitsSel.some(u => u.def.troop)" type="button" class="strike" style="border-color:#7a6a3a" @click="ctl.digIn()">Dig in (E): trench in 20 s</button>
      <button v-if="unitsSel.some(u => u.def.indirect)" type="button" class="strike" @click="ctl.startBombard()">Fire on an area (B, or Ctrl+right-click)</button>
      <template v-if="unitsSel.some(u => u.def.air)">
        <div class="forms"><button v-for="f in FORMATIONS" :key="f" type="button" :class="{ on: (swarmSel ? swarmSel.formation : ctl.formationType) === f }" @click="ctl.setFormation(f)">{{ f }}</button></div>
        <button type="button" class="strike" style="border-color:#3a5a7a" @click="ctl.formSwarm()">{{ swarmSel ? 'Disband swarm (G)' : 'Form swarm (G)' }}</button>
      </template>
      <button v-if="unitsSel.some(u => u.def.kamikaze)" type="button" class="strike" @click="ctl.strikeNearest()">Dive at nearest targets (F)</button>
      <div class="row" v-for="[k, n] in counts" :key="k"><span>{{ UNITS[k].label[ctl.team] }}</span><b>{{ n }}</b></div>
    </template>
  </div>
</template>
