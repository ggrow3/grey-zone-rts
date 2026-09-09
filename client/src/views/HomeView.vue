<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuth } from '../stores/auth';
import { LEVELS } from '../game/levels';

const auth = useAuth();
const side = ref(0), diff = ref(0.7);
onMounted(() => auth.refresh());
</script>

<template>
  <div class="page">
    <div class="grid cols2" style="max-width:1200px;margin:0 auto">
      <div class="card" style="grid-column:1/-1">
        <h1>Grey <span>Zone</span></h1>
        <p class="dim">Drones, jammers, trucks, and trenches on the Kharkiv to Belgorod border. Build factories, take the towns, keep the pipeline pumping, and destroy the enemy headquarters. Start with the levels if this is your first game.</p>
      </div>

      <div class="card">
        <h2>Learn: three short levels</h2>
        <p class="dim">Each one teaches a few ideas with a quiet or gentle enemy. Progress is saved to your account.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
          <div v-for="l in LEVELS" :key="l.id" class="row" style="justify-content:space-between;border-top:1px solid var(--hud-edge);padding-top:10px">
            <div style="flex:1;min-width:220px">
              <div style="font-weight:500">{{ l.title }} <span v-if="auth.completedLevels.includes(l.id)" class="tag won">completed</span></div>
              <div class="dim" style="font-size:13px;margin:2px 0">{{ l.blurb }}</div>
              <div class="dim" style="font-size:12px">{{ l.concepts.join(' · ') }}</div>
            </div>
            <router-link :to="{ name: 'level', params: { id: l.id } }"><button type="button" class="primary">Play</button></router-link>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <h2>Play against the computer</h2>
          <p class="dim">The full war against the built-in opponent. Either side is playable.</p>
          <div class="row" style="margin:10px 0"><span class="dim" style="width:110px">Play as</span>
            <span class="seg row"><button type="button" :class="{ on: side === 0 }" @click="side = 0">Ukraine</button><button type="button" :class="{ on: side === 1 }" @click="side = 1">Russia</button></span>
          </div>
          <div class="row" style="margin:10px 0"><span class="dim" style="width:110px">Enemy strength</span>
            <span class="seg row"><button type="button" :class="{ on: diff === 0.5 }" @click="diff = 0.5">Easy</button><button type="button" :class="{ on: diff === 0.7 }" @click="diff = 0.7">Normal</button><button type="button" :class="{ on: diff === 0.95 }" @click="diff = 0.95">Hard</button></span>
          </div>
          <router-link :to="{ name: 'skirmish', query: { side, diff } }"><button type="button" class="primary">Start skirmish</button></router-link>
        </div>
        <div class="card">
          <h2>Play against another commander</h2>
          <p class="dim">Match with another player in the lobby. You each take a side and can talk to each other in chat while you play. Wins and losses go on the leaderboard.</p>
          <router-link to="/lobby"><button type="button" class="primary">Go to the lobby</button></router-link>
        </div>
      </div>
    </div>
  </div>
</template>
