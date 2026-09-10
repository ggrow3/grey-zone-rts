<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuth } from '../stores/auth';
import { LEVELS } from '../game/levels';
import { FACTION_FACTS } from '../game/factions';
import { STARTS } from '../game/data';

const auth = useAuth();
const side = ref(0), diff = ref(0.7), start = ref('standard');
const hasReplay = ref(false); try { hasReplay.value = !!localStorage.getItem('gz.replay'); } catch { /* ignore */ }
const groups = computed(() => [{ side: 0, name: 'As Ukraine', levels: LEVELS.filter(l => l.side === 0) }, { side: 1, name: 'As Russia', levels: LEVELS.filter(l => l.side === 1) }]);
const facts = FACTION_FACTS.slice(0, 8);
onMounted(() => auth.refresh());
</script>

<template>
  <div class="page">
    <div class="grid cols2" style="max-width:1200px;margin:0 auto">
      <div class="card" style="grid-column:1/-1">
        <h1>Slava <span>Ukraine</span></h1>
        <div class="subtitle">Drone Wars</div>
        <p class="dim">Drones, jammers, trucks, and trenches on the Kharkiv to Belgorod border. Build factories, take the towns, keep the pipeline pumping, and destroy the enemy headquarters, or hold every town for three minutes. Start with the levels if this is your first game.</p>
      </div>

      <div class="card">
        <h2>Learn: ten short levels</h2>
        <p class="dim">Each teaches a few ideas in under ten minutes, on both sides of the border. Progress is saved to your account.</p>
        <div v-for="grp in groups" :key="grp.side" class="levelgroup">
          <h3 :class="grp.side === 0 ? 'ua' : 'ru'">{{ grp.name }}</h3>
          <div v-for="l in grp.levels" :key="l.id" class="row" style="justify-content:space-between;border-top:1px solid var(--hud-edge);padding:8px 0">
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
          <div class="row" style="margin:10px 0"><span class="dim" style="width:110px">Start</span>
            <span class="seg row"><button v-for="(s, k) in STARTS" :key="k" type="button" :class="{ on: start === k }" :title="s.desc" @click="start = String(k)">{{ s.label }}</button></span>
          </div>
          <div class="dim" style="font-size:13px;margin:-4px 0 10px 110px">{{ STARTS[start].desc }}</div>
          <div class="row">
            <router-link :to="{ name: 'skirmish', query: { side, diff, start } }"><button type="button" class="primary">Start skirmish</button></router-link>
            <router-link v-if="hasReplay" :to="{ name: 'skirmish', query: { replay: 1 } }"><button type="button" title="Watch your last solo game again, every order replayed">Watch last replay</button></router-link>
          </div>
        </div>
        <div class="card">
          <h2>Play against another commander</h2>
          <p class="dim">Match with another player in the lobby. You each take a side and can talk to each other in chat while you play. Wins and losses go on the leaderboard.</p>
          <router-link to="/lobby"><button type="button" class="primary">Go to the lobby</button></router-link>
        </div>
        <div class="card">
          <h2>Two armies</h2>
          <p class="dim">The sides are not mirror images. The full table, with the troops' shouts and their meanings, is in the in-game manual (M).</p>
          <table class="armies"><thead><tr><th></th><th class="ua">Ukraine</th><th class="ru">Russia</th></tr></thead>
            <tbody><tr v-for="f in facts" :key="f.topic"><td>{{ f.topic }}</td><td>{{ f.ua }}</td><td>{{ f.ru }}</td></tr></tbody></table>
        </div>
      </div>
    </div>
  </div>
</template>
