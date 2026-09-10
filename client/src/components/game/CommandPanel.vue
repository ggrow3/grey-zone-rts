<script setup lang="ts">
import { computed } from 'vue';
import type { Controller } from '../../game/controller';
import { UNITS, STRUCTS, BUILDABLE, UPGRADES, HOTKEYS, POWER_PER_GENERATOR, WAVE_COST, STRIKES, upgLabel, RU, UA } from '../../game/data';
import { clamp } from '../../game/dmath';

const props = defineProps<{ ctl: Controller; tick: number }>();
const emit = defineEmits<{ (e: 'tech'): void }>();
const g = () => props.ctl.game;
const fac = computed(() => { void props.tick; const f = props.ctl.selFactories(); return f.length === 1 ? f[0] : null; });
const produces = computed(() => fac.value ? fac.value.def.produces!.filter(k => UNITS[k].side === undefined || UNITS[k].side === props.ctl.team) : []);
const compact = computed(() => produces.value.length > 6);
const locked = (type: string) => { void props.tick; return !!UNITS[type].fixedWing && !g().upgrades[props.ctl.team].launchRail; };
const owned = computed(() => { void props.tick; return Object.keys(UPGRADES).filter(k => g().upgrades[props.ctl.team][k]).length; });
const avail = computed(() => { void props.tick; return Object.entries(UPGRADES).filter(([k]) => g().upgAvailable(props.ctl.team, k)).slice(0, 4); });
function crewText(type: string) { const d = UNITS[type]; return g().needsOperator(d, props.ctl.team) ? 'needs a squad' : d.operated ? 'autonomous' : g().crewLabel(d, props.ctl.team); }
function buildTitle(type: string) {
  const d = STRUCTS[type];
  return d.tunnel ? 'Five nets strung along the nearest road around the point you click: a safe corridor for trucks. Click within ' + 70 + ' of a road.' : d.produces ? 'Produces: ' + d.produces.map(k => UNITS[k].label[props.ctl.team]).join(', ') : d.power ? 'Diesel generators: charging capacity for ' + POWER_PER_GENERATOR + ' more battery drones' : d.heal ? 'Heals troops within ' + d.heal + ' at ' + Math.round((d.healRate || 0) * 100) + '% a second. Put it in a wood behind the line.' : type === 'radar' ? 'Sees ' + d.vision + ' out. Buildings do not shoot; put fire groups and mobile air defense under its coverage.' : d.netR ? 'Catches most FPVs that fly into its ' + d.netR + ' radius. Place over towns and truck routes.' : 'Jams enemy drones within ' + d.jam;
}
function setTab(t: 'build' | 'procure') { props.ctl.cmdTab = t; props.ctl.onSelectionChange(); }
</script>

<template>
  <div id="cmdpanel">
    <template v-if="fac">
      <div id="tabs"><h3>{{ fac.def.label }}{{ fac.build < 1 ? ' (under construction)' : '' }}</h3></div>
      <div id="cmdbody">
        <div id="queue">
          <div v-for="(type, i) in fac.queue" :key="i" class="q" :title="UNITS[type].label[ctl.team] + '. Click to cancel and refund.'" @click="ctl.cancelQueued(fac!, i)">{{ UNITS[type].label[ctl.team][0] }}<i v-if="i === 0" :style="{ width: clamp(fac.progress / UNITS[type].time * 100, 0, 100).toFixed(0) + '%' }" /></div>
          <template v-if="fac.def.heatPer">
            <span class="heat" :title="'Production heat ' + Math.round(fac.heat) + '%'"><i :style="{ width: Math.round(fac.heat) + '%', background: fac.overheated ? 'var(--ru)' : fac.heat > 70 ? 'var(--warn)' : 'var(--ok)' }" /></span>
            <span class="hint">{{ fac.overheated ? 'overheated' : 'heat ' + Math.round(fac.heat) + '%' }}</span>
          </template>
          <span class="hint">{{ fac.queue.length ? fac.queue.length + ' in queue' : 'Queue empty' }} · Shift-click for 5</span>
        </div>
        <button v-for="(type, i) in produces" :key="type" type="button" class="cmd" :class="[fac.type, { compact, locked: locked(type) }]" :title="(locked(type) ? 'Needs Launch rails (research, T). ' : '') + UNITS[type].blurb" @click="ctl.enqueue(fac!, type, $event.shiftKey ? 5 : 1)">
          <div class="name">{{ UNITS[type].label[ctl.team] }}</div>
          <div class="meta"><span>{{ UNITS[type].cost }} funds</span><span>{{ crewText(type) }}</span><span v-if="UNITS[type].kamikaze" class="tag">kamikaze</span><span>{{ UNITS[type].time }}s</span></div>
          <span class="key">{{ HOTKEYS[i] }}</span>
        </button>
      </div>
    </template>
    <template v-else>
      <div id="tabs">
        <button type="button" :class="{ on: ctl.cmdTab === 'build' }" @click="setTab('build')">Build</button>
        <button type="button" :class="{ on: ctl.cmdTab === 'procure' }" @click="setTab('procure')">Procurement</button>
      </div>
      <div id="cmdbody" v-if="ctl.cmdTab === 'build'">
        <button v-for="type in BUILDABLE" :key="type" type="button" class="cmd" :class="[type, { owned: ctl.view.placing === type }]" :title="buildTitle(type)" @click="ctl.startPlacing(type)">
          <div class="name">{{ STRUCTS[type].label }}</div>
          <div class="meta"><span>{{ STRUCTS[type].cost }} funds</span><span>{{ STRUCTS[type].time }}s</span></div>
        </button>
        <button v-if="ctl.team === RU" type="button" class="cmd wave" :disabled="g().waveT > 0" title="Three Geran-2 drones and four Gerbera decoys from the north, east, and south, aimed at Ukrainian buildings, the substation first" @click="ctl.geranWave()">
          <div class="name">Geran wave</div>
          <div class="meta"><span>{{ WAVE_COST }} funds</span><span>{{ g().waveT > 0 ? 'reload ' + Math.ceil(g().waveT) + 's' : 'ready' }}</span></div>
        </button>
        <button type="button" class="cmd strike" :class="{ owned: ctl.strikeMode === 'kab' }" :disabled="g().kabT[ctl.team] > 0" :title="'A ' + STRIKES.kab.dmg + '-damage glide bomb on a map point after a ' + STRIKES.kab.warn + ' second warning: flattens trenches and buildings, trench cover does not help. Enemy mobile air defense within 260 of the point can shoot it down.'" @click="ctl.startStrike('kab')">
          <div class="name">{{ STRIKES.kab.label[ctl.team] }}</div>
          <div class="meta"><span>{{ STRIKES.kab.cost[ctl.team] }} funds</span><span>{{ g().kabT[ctl.team] > 0 ? 'reload ' + Math.ceil(g().kabT[ctl.team]) + 's' : 'click a point' }}</span></div>
        </button>
        <button v-if="ctl.team === RU" type="button" class="cmd strike" :class="{ owned: ctl.strikeMode === 'iskander' }" :disabled="g().missileT > 0" :title="'An Iskander ballistic missile on an enemy building: ' + STRIKES.missile.dmg + ' damage after an ' + STRIKES.missile.warn + ' second warning. Air defense near the target intercepts some.'" @click="ctl.startStrike('iskander')">
          <div class="name">Iskander strike</div>
          <div class="meta"><span>{{ STRIKES.missile.cost }} funds</span><span>{{ g().missileT > 0 ? 'reload ' + Math.ceil(g().missileT) + 's' : 'click a building' }}</span></div>
        </button>
        <button v-if="ctl.team === UA" type="button" class="cmd strike" :disabled="g().deepT > 0 || !!g().deepPending" :title="'Send an idle Liutyi at a refinery inside Russia: ' + Math.round(STRIKES.deep.chance * 100) + '% get through, and each burning refinery cuts Russian income 15% for four minutes and slows their glide bombs.'" @click="ctl.deepStrike()">
          <div class="name">Deep strike (Liutyi)</div>
          <div class="meta"><span>{{ STRIKES.deep.cost }} funds + 1 Liutyi</span><span>{{ g().deepPending ? 'in the air' : g().deepT > 0 ? 'ready in ' + Math.ceil(g().deepT) + 's' : g().refineriesBurning() ? g().refineriesBurning() + ' burning' : 'ready' }}</span></div>
        </button>
      </div>
      <div id="cmdbody" v-else>
        <button type="button" class="cmd" @click="emit('tech')"><div class="name">Open the research tree (T)</div><div class="meta">{{ owned }} of {{ Object.keys(UPGRADES).length }} researched</div></button>
        <button v-for="[key, u] in avail" :key="key" type="button" class="cmd" :title="u.desc" @click="ctl.buyUpgrade(key)">
          <div class="name">{{ upgLabel(ctl.team, key) }}</div>
          <div class="meta"><span>{{ u.cost }} funds</span><span>{{ u.branch }}</span></div>
        </button>
      </div>
    </template>
  </div>
</template>
