<script setup lang="ts">
import type { GameLogEntry } from '../api';
import { LEVELS } from '../game/levels';

defineProps<{ rows: GameLogEntry[]; me: string }>();
const SIDE = ['Ukraine', 'Russia'];
function modeLabel(r: GameLogEntry) {
  if (r.mode === 'level') {
    const l = LEVELS.find(x => x.id === r.levelId);
    return 'Level: ' + (l ? l.title : r.levelId);
  }
  return r.mode === 'skirmish' ? 'Skirmish vs computer' : 'Multiplayer';
}
function when(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function dur(r: GameLogEntry) {
  if (r.durationSeconds == null) return r.endedAt ? '' : 'in progress';
  const m = Math.floor(r.durationSeconds / 60),
    s = Math.floor(r.durationSeconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function resultClass(r: GameLogEntry, me: string) {
  if (!r.result) return '';
  if (r.mode === 'multiplayer')
    return r.winnerUsername === me ? 'won' : r.players.some(p => p.username === me) ? 'lost' : '';
  return r.result === 'won' ? 'won' : r.result === 'lost' ? 'lost' : '';
}
</script>

<template>
  <div style="overflow-x: auto">
    <table class="log">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Mode</th>
          <th>Length</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="dim">{{ when(r.startedAt) }}</td>
          <td>
            <span v-for="(p, i) in r.players" :key="i"
              ><span v-if="i">, </span><b :class="p.side === 0 ? 'ua' : 'ru'">{{ p.username }}</b>
              <small class="dim">({{ SIDE[p.side] }})</small></span
            >
          </td>
          <td>{{ modeLabel(r) }}</td>
          <td class="dim">{{ dur(r) }}</td>
          <td>
            <span class="tag" :class="resultClass(r, me)">{{ r.result || 'playing' }}</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="5" class="dim">No games yet.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
