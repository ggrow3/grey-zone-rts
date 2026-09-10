<script setup lang="ts">
import { computed } from 'vue';
import type { Level } from '../../game/levels';
import type { Game } from '../../game/sim';
const props = defineProps<{ level: Level; index: number; game: Game; team: number; tick: number }>();
defineEmits<{ (e: 'skip'): void }>();
/** kills, losses, score, and the resources held, refreshed with the HUD tick */
const tally = computed(() => {
  void props.tick; const g = props.game, T = props.team;
  return { killed: g.stats.kills[T], lost: g.stats.lost[T], score: Math.round(g.stats.score[T]), funds: Math.floor(g.funds[T]), people: Math.floor(g.people[T].total),
    towns: g.depots.filter(d => d.owner === T).length, gas: g.resources.filter(r => r.kind === 'gas' && r.owner === T).length, wheat: g.resources.filter(r => r.kind === 'wheat' && r.owner === T).length };
});
</script>

<template>
  <div id="objectives" class="panel" :class="{ ru: level.side === 1 }">
    <div class="side">{{ level.sideNote }}</div>
    <div class="head"><span class="step">{{ Math.min(index + 1, level.objectives.length) }} / {{ level.objectives.length }}</span><span class="title">{{ level.objectives[Math.min(index, level.objectives.length - 1)].title }}</span></div>
    <div class="text">{{ level.objectives[Math.min(index, level.objectives.length - 1)].text }}</div>
    <ol><li v-for="(o, i) in level.objectives" :key="i" :class="{ done: i < index, now: i === index }">{{ o.title }}</li></ol>
    <div class="tally">
      <span><b>{{ tally.killed }}</b> killed</span><span><b>{{ tally.lost }}</b> lost</span><span><b>{{ tally.score }}</b> score</span>
      <span><b>{{ tally.funds }}</b> funds</span><span><b>{{ tally.people }}</b> people</span><span><b>{{ tally.towns }}</b> towns</span><span><b>{{ tally.gas }}</b> gas</span><span><b>{{ tally.wheat }}</b> wheat</span>
    </div>
    <div style="margin-top:8px"><button type="button" style="padding:3px 9px;font-size:12px" @click="$emit('skip')" v-if="index < level.objectives.length - 1">Skip step</button></div>
  </div>
</template>
