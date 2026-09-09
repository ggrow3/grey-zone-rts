<script setup lang="ts">
import type { Controller } from '../../game/controller';
import { UPGRADES, TECH_BRANCHES, upgLabel } from '../../game/data';

const props = defineProps<{ ctl: Controller; tick: number }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const nodes = (br: string) => Object.entries(UPGRADES).filter(([, u]) => u.branch === br).sort((a, b) => a[1].tier - b[1].tier);
const state = (key: string) => { void props.tick; const g = props.ctl.game, T = props.ctl.team; return g.upgrades[T][key] ? 'owned' : g.upgAvailable(T, key) ? 'avail' : 'locked'; };
</script>

<template>
  <div id="techpanel" class="panel" :key="tick">
    <div id="techHead"><h3>Research and procurement</h3><span>{{ Math.floor(ctl.game.funds[ctl.team]) }} funds available</span><button type="button" @click="emit('close')">Close (T)</button></div>
    <div id="techGrid">
      <div class="branch" v-for="br in TECH_BRANCHES" :key="br">
        <h4>{{ br }}</h4>
        <template v-for="([key, u], i) in nodes(br)" :key="key">
          <div v-if="i" class="link" />
          <button type="button" class="tech" :class="state(key)" @click="ctl.buyUpgrade(key)">
            <div class="n">{{ upgLabel(ctl.team, key) }}</div>
            <div class="d">{{ u.desc }}</div>
            <div class="c">{{ state(key) === 'owned' ? 'Researched' : state(key) === 'avail' ? u.cost + ' funds' : 'Needs ' + upgLabel(ctl.team, u.requires!) }}</div>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
