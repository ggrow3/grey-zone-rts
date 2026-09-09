<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../api';
import type { GameLogEntry, LeaderboardRow } from '../api';
import { useAuth } from '../stores/auth';
import GameLogTable from '../components/GameLogTable.vue';

const auth = useAuth();
const recent = ref<GameLogEntry[]>([]), mine = ref<GameLogEntry[]>([]), board = ref<LeaderboardRow[]>([]), error = ref('');
onMounted(async () => {
  try {
    [recent.value, mine.value, board.value] = await Promise.all([
      api.get<GameLogEntry[]>('/api/games/recent?limit=50'), api.get<GameLogEntry[]>('/api/games/mine?limit=50'), api.get<LeaderboardRow[]>('/api/leaderboard'),
    ]);
  } catch (e) { error.value = (e as Error).message; }
});
</script>

<template>
  <div class="page">
    <div class="grid cols2" style="max-width:1200px;margin:0 auto;grid-template-columns:2fr 1fr">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card"><h2>Who played: every game on this server</h2><div class="err" v-if="error">{{ error }}</div><GameLogTable :rows="recent" :me="auth.username || ''" /></div>
        <div class="card"><h2>My games</h2><GameLogTable :rows="mine" :me="auth.username || ''" /></div>
      </div>
      <div class="card">
        <h2>Leaderboard</h2>
        <table class="log">
          <thead><tr><th>#</th><th>Commander</th><th>W</th><th>L</th><th>Games</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in board" :key="r.username" :class="{ ok: r.username === auth.username }"><td class="dim">{{ i + 1 }}</td><td>{{ r.username }}</td><td>{{ r.wins }}</td><td>{{ r.losses }}</td><td class="dim">{{ r.gamesPlayed }}</td></tr>
            <tr v-if="!board.length"><td colspan="5" class="dim">Nobody has played yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
