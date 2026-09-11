<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuth } from '../stores/auth';
import { LEVELS } from '../game/levels';
import { factionFacts } from '../game/factions';
import { MAPS, DEFAULT_MAP } from '../game/maps';
import { STARTS } from '../game/data';
import { hasReplay as replaySaved } from '../game/replay';

const auth = useAuth();
const side = ref(0),
  diff = ref(0.7),
  start = ref('standard');
const hasReplay = ref(replaySaved());
const groups = computed(() => [
  { side: 0, name: 'As Ukraine', levels: LEVELS.filter(l => l.side === 0) },
  { side: 1, name: 'As Russia', levels: LEVELS.filter(l => l.side === 1) },
]);
const map = ref(DEFAULT_MAP);
const facts = computed(() => factionFacts(MAPS[map.value]).slice(0, 8));
onMounted(() => auth.refresh());
</script>

<template>
  <div class="page">
    <div class="grid cols2" style="max-width: 1200px; margin: 0 auto">
      <div class="card" style="grid-column: 1/-1">
        <h1>Slava <span>Ukraine</span></h1>
        <div class="subtitle">Drone Wars</div>
        <p class="dim">
          Drones, jammers, trucks, and trenches on the Kharkiv to Belgorod border. Build factories, take the towns, keep
          the pipeline pumping, and destroy the enemy headquarters, or hold every town for three minutes. Start with the
          levels if this is your first game.
        </p>
        <details class="about">
          <summary>What this game is about</summary>
          <p class="dim">
            Since 2022 the war in Ukraine has become the first war decided by small drones: a quadcopter costing a few
            hundred dollars finds a tank, a truck, or a squad, and a second one kills it. Both armies have rebuilt
            themselves around that: infantry squads that are really drone crews, jammers that cut a drone's radio,
            fiber-optic drones no jammer can touch, nets over the roads, Geran waves against the power grid, Lancets
            hunting artillery, interceptors hunting drones, and the trucks, wheat, fuel, and electricity that keep it
            all flying.
          </p>
          <p class="dim">
            This game is a real-time strategy game about that front, on the Kharkiv and Sumy borders, meant to teach by
            playing why the decisions are hard. Seeing is everything: guns and kamikaze drones only hit what your side
            has spotted. Drones are cheap but pilots, batteries, and grid power are not. Logistics is the front line:
            squads eat what trucks bring, guns fire what trucks bring, and every truck is prey. And the sides are not
            mirrors: Ukraine has people, public support, and civilians to protect; Russia has Geran waves, glide bombs,
            North Korean infantry, and defections. The numbers are simplified for play, but every mechanic stands for
            something really being used on that front.
          </p>
        </details>
      </div>

      <div class="card">
        <h2>Learn: {{ LEVELS.length }} levels on two fronts</h2>
        <p class="dim">
          Each teaches a handful of ideas in ten to fifteen minutes, on both sides of the border and on both maps.
          Progress is saved to your account.
        </p>
        <div v-for="grp in groups" :key="grp.side" class="levelgroup">
          <h3 :class="grp.side === 0 ? 'ua' : 'ru'">{{ grp.name }}</h3>
          <div
            v-for="l in grp.levels"
            :key="l.id"
            class="row"
            style="justify-content: space-between; border-top: 1px solid var(--hud-edge); padding: 8px 0"
          >
            <div style="flex: 1; min-width: 220px">
              <div style="font-weight: 500">
                {{ l.title }} <span v-if="auth.completedLevels.includes(l.id)" class="tag won">completed</span>
              </div>
              <div class="dim" style="font-size: 13px; margin: 2px 0">{{ l.blurb }}</div>
              <div class="dim" style="font-size: 12px">{{ l.concepts.join(' · ') }}</div>
            </div>
            <router-link :to="{ name: 'level', params: { id: l.id } }"
              ><button type="button" class="primary">Play</button></router-link
            >
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <div class="card">
          <h2>Play against the computer</h2>
          <p class="dim">The full war against the built-in opponent. Either side is playable.</p>
          <div class="row" style="margin: 10px 0">
            <span class="dim" style="width: 110px">Play as</span>
            <span class="seg row"
              ><button type="button" :class="{ on: side === 0 }" @click="side = 0">Ukraine</button
              ><button type="button" :class="{ on: side === 1 }" @click="side = 1">Russia</button></span
            >
          </div>
          <div class="row" style="margin: 10px 0">
            <span class="dim" style="width: 110px">Enemy strength</span>
            <span class="seg row"
              ><button type="button" :class="{ on: diff === 0.5 }" @click="diff = 0.5">Easy</button
              ><button type="button" :class="{ on: diff === 0.7 }" @click="diff = 0.7">Normal</button
              ><button type="button" :class="{ on: diff === 0.95 }" @click="diff = 0.95">Hard</button></span
            >
          </div>
          <div class="row" style="margin: 10px 0">
            <span class="dim" style="width: 110px">Start</span>
            <span class="seg row"
              ><button
                v-for="(s, k) in STARTS"
                :key="k"
                type="button"
                :class="{ on: start === k }"
                :title="s.desc"
                @click="start = String(k)"
              >
                {{ s.label }}
              </button></span
            >
          </div>
          <div class="dim" style="font-size: 13px; margin: -4px 0 10px 110px">{{ STARTS[start].desc }}</div>
          <div class="row" style="margin: 10px 0">
            <span class="dim" style="width: 110px">Map</span>
            <span class="seg row"
              ><button
                v-for="(m, k) in MAPS"
                :key="k"
                type="button"
                :class="{ on: map === k }"
                :title="m.blurb"
                @click="map = String(k)"
              >
                {{ m.name }}
              </button></span
            >
          </div>
          <div class="dim" style="font-size: 13px; margin: -4px 0 10px 110px">{{ MAPS[map].blurb }}</div>
          <div class="row">
            <router-link :to="{ name: 'skirmish', query: { side, diff, start, map } }"
              ><button type="button" class="primary">Start skirmish</button></router-link
            >
            <router-link :to="{ name: 'skirmish', query: { side, diff, start, map, watch: 1 } }"
              ><button
                type="button"
                title="Both sides played by the computer; you watch from the chosen side's chair, free to look around and select, and no order of yours is obeyed"
              >
                Watch the bots play
              </button></router-link
            >
            <router-link v-if="hasReplay" :to="{ name: 'skirmish', query: { replay: 1 } }"
              ><button type="button" title="Watch your last solo game again, every order replayed">
                Watch last replay
              </button></router-link
            >
          </div>
        </div>
        <div class="card">
          <h2>Play against another commander</h2>
          <p class="dim">
            Match with another player in the lobby. You each take a side and can talk to each other in chat while you
            play. Wins and losses go on the leaderboard.
          </p>
          <router-link v-if="!auth.offline" to="/lobby"
            ><button type="button" class="primary">Go to the lobby</button></router-link
          >
          <p v-else class="dim">
            You are playing offline. Online matches need an account and the game server: use Sign in at the top and
            create one.
          </p>
        </div>
        <div class="card">
          <h2>Two armies</h2>
          <p class="dim">
            The sides are not mirror images. The full table, with the troops' shouts and their meanings, is in the
            in-game manual (M).
          </p>
          <table class="armies">
            <thead>
              <tr>
                <th></th>
                <th class="ua">Ukraine</th>
                <th class="ru">Russia</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in facts" :key="f.topic">
                <td>{{ f.topic }}</td>
                <td>{{ f.ua }}</td>
                <td>{{ f.ru }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
