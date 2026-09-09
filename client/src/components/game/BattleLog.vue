<script setup lang="ts">
import { computed } from 'vue';
import type { Game } from '../../game/sim';
import type { LogEntry } from '../../game/types';

const props = defineProps<{ game: Game; team: number; tick: number; feed?: boolean }>();
defineEmits<{ (e: 'close'): void }>();
function fmt(t: number) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
function cls(e: LogEntry) { return e.team < 0 ? 'both' : e.team === props.team ? (e.kind === 'loss' ? 'bad' : 'good') : (e.kind === 'loss' ? 'good' : 'bad'); }
const entries = computed(() => { void props.tick; const l = props.game.log; return props.feed ? l.slice(-6) : l.slice().reverse(); });
</script>

<template>
  <div v-if="feed" id="killfeed">
    <div v-for="(e, i) in entries" :key="e.at + ':' + i" class="m" :class="cls(e)"><span class="t">{{ fmt(e.at) }}</span> {{ e.text }}</div>
  </div>
  <div v-else id="battlelog" class="panel">
    <div class="head"><h3>Battle log</h3><button type="button" @click="$emit('close')">Close (K)</button></div>
    <div class="body">
      <div v-for="(e, i) in entries" :key="e.at + ':' + i" class="m" :class="cls(e)"><span class="t">{{ fmt(e.at) }}</span> {{ e.text }}</div>
      <div v-if="!entries.length" class="dim">Nothing has happened yet.</div>
    </div>
  </div>
</template>
