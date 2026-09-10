<script setup lang="ts">
import { computed } from 'vue';
import type { Game } from '../../game/sim';
import { UA, RU, UNITS, CIV_SITES, FOOD_PER_FIELD, FOOD_BASE, FUEL_PER_NODE, FUEL_BASE, POWER, WEATHER_TEXT, MISSIONS } from '../../game/data';

const props = defineProps<{ game: Game; team: number; tick: number; paused: boolean; canPause: boolean; speed: number; basemap: string; audio: string; opponent?: string }>();
const emit = defineEmits<{ (e: 'toggle', panel: 'manual' | 'legend' | 'pause' | 'audio' | 'log' | 'speed'): void; (e: 'basemap'): void; (e: 'leave'): void }>();
const sky = computed(() => { void props.tick; const w = g().weather; const left = Math.max(0, Math.ceil(w.until - g().gameTime)); return { label: WEATHER_TEXT[w.kind].label + (g().isNight() ? ', night' : ', day'), sub: (w.warned ? WEATHER_TEXT[w.next].label + ' in ' + left + ' s' : 'for ' + fmtTime(left)) + ' · ' + (g().isNight() ? 'dawn' : 'dusk') + ' in ' + fmtTime(g().phaseLeft()), title: WEATHER_TEXT[w.kind].effect, bad: w.kind !== 'clear' || g().isNight() }; });
const mission = computed(() => { void props.tick; const m = g().missions[PL()]; if (!m || m.done) return null; const d = MISSIONS[m.key]; return { text: d.text, prog: d.timed ? fmtTime(Math.max(0, d.goal - m.progress)) + ' to go' : m.progress + ' / ' + d.goal, reward: d.reward }; });
const hold = computed(() => { void props.tick; for (const T of [0, 1]) if (g().holdT[T] > 0) return { team: T, left: Math.max(0, Math.ceil(180 - g().holdT[T])) }; return null; });

function fmtTime(t: number) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
const g = () => props.game;
const PL = () => props.team;
const forces = computed(() => { void props.tick; let n = 0; for (const u of g().units) if (u.team === PL() && !u.def.auto) n++; return n; });
const slots = computed(() => {
  void props.tick;
  if (!g().needsOperator(UNITS.fpv, PL())) return { text: 'autonomous', color: '' };
  const fs = g().freeSlots(PL()), gr = g().units.filter(u => u.team === PL() && !u.dead && u.grounded).length;
  return { text: fs + ' free (' + g().opCap(PL()) + ' per operator)' + (gr ? ', ' + gr + ' grounded' : ''), color: gr ? 'var(--ru)' : fs < 3 ? 'var(--warn)' : '' };
});
const people = computed(() => { void props.tick; const fp = g().freePeople(PL()); return { text: Math.floor(fp) + ' free / ' + Math.floor(g().people[PL()].total), color: fp < 3 ? 'var(--ru)' : fp < 10 ? 'var(--warn)' : '' }; });
const civTotal = CIV_SITES.filter(c => c[1] === 0).length;
const supply = computed(() => {
  void props.tick; const sp = g().supply[PL()];
  return { text: 'food ' + sp.foodUsed + '/' + sp.foodCap + ', fuel ' + sp.fuelUsed + '/' + sp.fuelCap + ', power ' + sp.powerUsed + '/' + sp.powerCap,
    color: (sp.food < 1 || sp.fuel < 1 || sp.power < 1) ? 'var(--ru)' : (sp.foodUsed >= sp.foodCap - 1 || sp.fuelUsed >= sp.fuelCap - 1 || sp.powerUsed >= sp.powerCap - 2) ? 'var(--warn)' : '' };
});
const supplyTitle = 'Each wheat field held feeds ' + FOOD_PER_FIELD + ' squads (plus ' + FOOD_BASE + ' from stores); each gas site with a working pipeline fuels ' + FUEL_PER_NODE + ' vehicles (plus ' + FUEL_BASE + ' from reserves); power is what the grids have left after the buildings draw theirs (headquarters ' + POWER.hq + ', substation ' + POWER.substation + ', power plant ' + POWER.plant + ', generator set ' + POWER.generator + '), one point per battery drone';
function gasClass(r: { owner: number }) { const intact = g().pipelineIntact(PL()); return r.owner === UA ? (intact || PL() !== UA ? 'ua' : 'cut') : r.owner === RU ? (intact || PL() !== RU ? 'ru' : 'cut') : ''; }
</script>

<template>
  <div id="top" :key="tick">
    <div class="stat"><span class="lbl">Funds</span><span class="val">{{ Math.floor(game.funds[team]) }}</span></div>
    <div class="stat"><span class="lbl">Income</span><span class="val">+{{ game.expectedIncome(team).toFixed(0) }}/s</span></div>
    <div class="stat"><span class="lbl">Towns</span><span class="sq"><i v-for="d in game.depots" :key="d.name" :title="d.name" :class="d.owner === UA ? 'ua' : d.owner === RU ? 'ru' : ''" /></span></div>
    <div class="stat"><span class="lbl">Gas</span><span class="sq"><i v-for="(r, i) in game.resources.filter(x => x.kind === 'gas')" :key="i" :title="r.name" :class="gasClass(r)" /></span>
      <span class="val small" :style="{ color: game.pipelineIntact(team) ? '' : 'var(--ru)' }">{{ game.pipelineIntact(team) ? '+' + game.gasIncome(team).toFixed(0) + '/s' : 'pipeline cut' }}</span></div>
    <div class="stat"><span class="lbl">Wheat</span><span class="sq"><i v-for="(r, i) in game.resources.filter(x => x.kind === 'wheat')" :key="i" :title="r.name" :class="r.burnT > 0 ? 'fire' : r.owner === UA ? 'ua' : r.owner === RU ? 'ru' : ''" /></span></div>
    <div class="stat" :title="'Points for what you destroy and capture, scaled by what it cost (a tank is worth five squads, a headquarters 250); civilian harm takes points away. Enemy: ' + Math.round(game.stats.score[1 - team])"><span class="lbl">Score</span><span class="val">{{ Math.round(game.stats.score[team]) }}</span><span class="val small dim">{{ game.stats.kills[team] }} killed · {{ game.stats.lost[team] }} lost</span></div>
    <div class="stat"><span class="lbl">Forces</span><span class="val">{{ forces }}</span></div>
    <div class="stat"><span class="lbl">Personnel</span><span class="val small" :style="{ color: people.color }">{{ people.text }}</span></div>
    <div class="stat"><span class="lbl">Operators</span><span class="val small" :style="{ color: slots.color }">{{ slots.text }}</span></div>
    <div class="stat" v-if="team === UA"><span class="lbl">Support</span><span class="val" :style="{ color: game.support < 50 ? 'var(--ru)' : game.support < 75 ? 'var(--warn)' : '' }">{{ Math.round(game.support) }}%</span></div>
    <div class="stat" v-if="team === UA"><span class="lbl">Civilian sites</span><span class="val small">{{ civTotal - game.civ.lost[0] }} / {{ civTotal }}</span></div>
    <div class="stat"><span class="lbl">Trade</span><span class="val small">+{{ game.tradeTotal[team] }}<span v-if="game.captured[team]">, {{ game.captured[team] }} trucks taken</span></span></div>
    <div class="stat"><span class="lbl">Supply</span><span class="val small" :style="{ color: supply.color }" :title="supplyTitle">{{ supply.text }}</span></div>
    <div class="spacer" />
    <div class="stat" :title="sky.title"><span class="lbl">Sky</span><span class="val small" :class="{ warn: sky.bad }">{{ sky.label }}</span><span class="dim" style="font-size:11px">{{ sky.sub }}</span></div>
    <div class="stat" v-if="mission" :title="'Optional goal: ' + mission.reward + ' funds and 20 score when met. ' + game.missionsDone[team] + ' met so far.'"><span class="lbl">Goal</span><span class="val small">{{ mission.text }}</span><span class="dim" style="font-size:11px">{{ mission.prog }}</span></div>
    <div class="stat" v-if="hold"><span class="lbl">{{ hold.team === team ? 'All towns held' : 'Enemy holds all towns' }}</span><span class="val small" :class="hold.team === team ? 'ok' : 'ru'">victory in {{ hold.left }} s</span></div>
    <div class="stat" v-if="opponent"><span class="lbl">vs</span><span class="val small">{{ opponent }}</span></div>
    <div class="stat"><span class="val">{{ fmtTime(game.gameTime) }}</span></div>
    <button type="button" @click="emit('basemap')" title="Cycle the background: drawn terrain, street map tiles, satellite imagery">Map: {{ basemap }}</button>
    <button type="button" @click="emit('toggle', 'manual')" title="Every unit, building, and the strategy behind them (M)">Manual</button>
    <button type="button" @click="emit('toggle', 'legend')" title="Unit shapes (L)">Legend</button>
    <button type="button" @click="emit('toggle', 'log')" title="Battle log (K)">Log</button>
    <button type="button" @click="emit('toggle', 'audio')" title="Sound effects and unit voices (N)">Sound: {{ audio === 'on' ? 'on' : audio === 'sfx' ? 'no voice' : 'off' }}</button>
    <button type="button" v-if="canPause" @click="emit('toggle', 'pause')">{{ paused ? 'Resume' : 'Pause' }}</button>
    <button type="button" v-if="canPause" title="Simulation speed for solo games (])" @click="emit('toggle', 'speed')">{{ speed }}x</button>
    <button type="button" class="danger" @click="emit('leave')">Leave</button>
  </div>
</template>
