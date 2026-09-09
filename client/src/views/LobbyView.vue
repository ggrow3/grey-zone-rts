<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { hub } from '../net/hub';
import type { LobbyState, MatchInfo, ChatMsg } from '../net/hub';
import { useAuth } from '../stores/auth';
import GameLogTable from '../components/GameLogTable.vue';

const router = useRouter(); const auth = useAuth();
const online = ref<string[]>([]), queueCount = ref(0), recent = ref<LobbyState['recentGames']>([]);
const inQueue = ref(false), position = ref(0), sidePref = ref(-1), status = ref('connecting'), error = ref('');
const chat = ref<ChatMsg[]>([]), text = ref(''), logEl = ref<HTMLElement | null>(null);
const offs: (() => void)[] = [];

function push(m: ChatMsg) { chat.value.push(m); if (chat.value.length > 200) chat.value.shift(); nextTick(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; }); }

onMounted(async () => {
  offs.push(hub.on<[LobbyState]>('LobbyState', s => { online.value = s.online; queueCount.value = s.queue; recent.value = s.recentGames || []; }));
  offs.push(hub.on<[ChatMsg]>('LobbyChat', m => push(m)));
  offs.push(hub.on<[{ inQueue: boolean; position: number }]>('QueueStatus', q => { inQueue.value = q.inQueue; position.value = q.position; }));
  offs.push(hub.on<[MatchInfo]>('MatchFound', m => { inQueue.value = false; router.push({ name: 'match', params: { id: m.matchId } }); }));
  offs.push(hub.on<[{ message: string }]>('Error', e => { error.value = e.message; }));
  offs.push(hub.on('$reconnecting', () => { status.value = 'reconnecting'; }));
  offs.push(hub.on('$reconnected', () => { status.value = 'online'; }));
  offs.push(hub.on('$closed', () => { status.value = 'disconnected'; }));
  try { await hub.connect(); status.value = 'online'; } catch (e) { status.value = 'disconnected'; error.value = 'Could not reach the server: ' + (e as Error).message; }
});
onUnmounted(() => { offs.forEach(f => f()); });

async function toggleQueue() {
  error.value = '';
  try { if (inQueue.value) await hub.invoke('LeaveQueue'); else await hub.invoke('JoinQueue', sidePref.value); }
  catch (e) { error.value = (e as Error).message; }
}
async function send() {
  const t = text.value.trim(); if (!t) return; text.value = '';
  try { await hub.invoke('SendLobbyChat', t); } catch (e) { error.value = (e as Error).message; }
}
</script>

<template>
  <div class="page">
    <div class="grid cols2" style="max-width:1200px;margin:0 auto;grid-template-columns:2fr 1fr">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <h2>Find a match</h2>
          <p class="dim">Join the queue and the next compatible commander is matched with you. Sides are assigned when the match is made. In the game, press Enter or click the chat box to talk to your opponent.</p>
          <div class="row" style="margin:10px 0"><span class="dim" style="width:110px">I want to play</span>
            <span class="seg row"><button type="button" :class="{ on: sidePref === -1 }" @click="sidePref = -1" :disabled="inQueue">Either side</button><button type="button" :class="{ on: sidePref === 0 }" @click="sidePref = 0" :disabled="inQueue">Ukraine</button><button type="button" :class="{ on: sidePref === 1 }" @click="sidePref = 1" :disabled="inQueue">Russia</button></span>
          </div>
          <div class="row">
            <button type="button" class="primary" @click="toggleQueue" :disabled="status !== 'online'">{{ inQueue ? 'Leave queue' : 'Join the queue' }}</button>
            <span v-if="inQueue" class="warn">Waiting for an opponent… position {{ position }}</span>
            <span class="dim">{{ queueCount }} in queue · {{ online.length }} online · {{ status }}</span>
          </div>
          <div class="err" v-if="error">{{ error }}</div>
        </div>
        <div class="card chat" style="height:340px;padding:0">
          <div style="padding:8px 12px;border-bottom:1px solid var(--hud-edge)"><h2 style="margin:0">Lobby chat</h2></div>
          <div class="log" ref="logEl">
            <div v-for="(m, i) in chat" :key="i" class="m" :class="{ sys: m.from === 'system' }"><b v-if="m.from !== 'system'">{{ m.from }}</b> {{ m.text }} <small>{{ new Date(m.at).toLocaleTimeString() }}</small></div>
            <div v-if="!chat.length" class="dim">Say hello.</div>
          </div>
          <form @submit.prevent="send"><input type="text" v-model="text" maxlength="400" placeholder="Message everyone in the lobby" :disabled="status !== 'online'" /><button type="submit" :disabled="status !== 'online'">Send</button></form>
        </div>
        <div class="card">
          <h2>Recent games</h2>
          <GameLogTable :rows="recent" :me="auth.username || ''" />
        </div>
      </div>
      <div class="card">
        <h2>Online now</h2>
        <ul style="padding-left:18px;line-height:1.6"><li v-for="u in online" :key="u" :class="{ ok: u === auth.username }">{{ u }}</li></ul>
        <p class="dim" v-if="!online.length">Nobody yet.</p>
      </div>
    </div>
  </div>
</template>
