<script setup lang="ts">
import { ref, shallowRef, markRaw, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Game } from '../game/sim';
import { LocalSession, NetSession } from '../game/session';
import type { Session, TurnDto } from '../game/session';
import { Controller } from '../game/controller';
import { Renderer } from '../game/render';
import { TerrainCanvas } from '../game/terrainCanvas';
import { AudioDirector } from '../game/audio';
import type { BasemapMode } from '../game/terrainCanvas';
import { levelById } from '../game/levels';
import type { Level } from '../game/levels';
import { CIV_SITES, UA, TEAMS, UNITS } from '../game/data';
import { MM_W, MM_H, W, H } from '../game/map';
import { hub } from '../net/hub';
import type { MatchInfo, ChatMsg } from '../net/hub';
import { api } from '../api';
import { useAuth } from '../stores/auth';
import TopBar from '../components/game/TopBar.vue';
import SelectionPanel from '../components/game/SelectionPanel.vue';
import CommandPanel from '../components/game/CommandPanel.vue';
import TechPanel from '../components/game/TechPanel.vue';
import ManualPanel from '../components/game/ManualPanel.vue';
import ObjectivesPanel from '../components/game/ObjectivesPanel.vue';
import ChatPanel from '../components/game/ChatPanel.vue';
import LegendPanel from '../components/game/LegendPanel.vue';
import BattleLog from '../components/game/BattleLog.vue';
import Cutscene from '../components/game/Cutscene.vue';

const props = defineProps<{ mode: 'level' | 'skirmish' | 'multiplayer'; levelId?: string; side?: number; difficulty?: number; matchId?: string }>();
const router = useRouter(); const auth = useAuth();

const ready = ref(false), error = ref(''), hudTick = ref(0), msgText = ref(''), msgShow = ref(false);
const showTech = ref(false), showManual = ref(false), showLegend = ref(false), showLog = ref(false), paused = ref(false);
const audio = new AudioDirector(); const audioMode = ref(audio.mode);
const objIdx = ref(0), chat = ref<ChatMsg[]>([]), opponent = ref(''), netStatus = ref(''), basemap = ref<BasemapMode>('drawn');
const result = ref<{ won: boolean; title: string; text: string; stats: [string, string][] } | null>(null);
const level = shallowRef<Level | null>(null);
const cut = ref<{ title: string; lines: string[]; index: number } | null>(null);
let cutShots: { x: number; y: number }[] = []; let cutT = 0, cutDone = 0;
const SKIRMISH_BRIEF: string[][] = [
  ['Kharkiv group. The full war: no scripted enemy, no pauses. Belgorod is building from the first second, and its drones fly themselves.', 'Take Lyptsi first, put a Mavic and a Sting over the substation before the four-minute mark, and keep your strikes off civilians: support is income.', 'Destroy the headquarters in Belgorod, or hold all six towns for three minutes. Slava Ukraini, commander.'],
  ['Belgorod group. The full war: Kharkiv is researching and building from the first second, and every one of its drones has a human on the sticks until it buys autonomy.', 'Your drones need nobody. Take Zhuravlyovka, hunt their trucks, keep the pump on the Kursk line standing, and launch the waves when the crews are ready.', 'Destroy the headquarters in Kharkiv, or hold all six towns for three minutes. Za Rodinu, commander.'],
];
const canvas = ref<HTMLCanvasElement | null>(null), minimap = ref<HTMLCanvasElement | null>(null), stage = ref<HTMLElement | null>(null), chatPanel = ref<InstanceType<typeof ChatPanel> | null>(null);
const ctl = shallowRef<Controller | null>(null);
const team = ref(0);

let game: Game, session: Session, renderer: Renderer, tc: TerrainCanvas, ctx: CanvasRenderingContext2D, mmctx: CanvasRenderingContext2D;
let raf = 0, last = 0, msgTimer = 0, hudT = 0, objT = 0, gameLogId: string | null = null, finished = false, camStart = { x: 0, y: 0 };
const offs: (() => void)[] = [];
const cleanups: (() => void)[] = [];

function msg(text: string) { msgText.value = text; msgShow.value = true; msgTimer = 2.6; }
const speed = ref(1);
function onToggle(p: 'tech' | 'manual' | 'legend' | 'pause' | 'audio' | 'log' | 'speed') {
  if (p === 'speed') { if (!session.canPause) return; speed.value = speed.value >= 3 ? 1 : speed.value + 1; session.speed = speed.value; msg('Speed ' + speed.value + 'x'); return; }
  if (p === 'tech') showTech.value = !showTech.value; else if (p === 'manual') showManual.value = !showManual.value; else if (p === 'legend') showLegend.value = !showLegend.value;
  else if (p === 'pause') togglePause(); else if (p === 'log') showLog.value = !showLog.value;
  else if (p === 'audio') { audio.cycle(); audioMode.value = audio.mode; msg('Sound: ' + (audio.mode === 'on' ? 'effects and voice' : audio.mode === 'sfx' ? 'effects only' : 'off')); }
}
const isNet = computed(() => props.mode === 'multiplayer');
const piloting = computed(() => { void hudTick.value; return !!ctl.value?.view.pilot; });

onMounted(async () => {
  try {
    tc = new TerrainCanvas(); tc.onMessage = msg; renderer = new Renderer(tc);
    if (props.mode === 'multiplayer') await setupMatch(); else setupSolo();
    ready.value = true;
    await nextTick();
    attach();
    last = performance.now(); raf = requestAnimationFrame(frame);
  } catch (e) { error.value = (e as Error).message || String(e); console.error(e); }
});

function setupSolo() {
  let side = props.side ?? 0, difficulty = props.difficulty ?? 0.7, passive = false, noGerans = false;
  if (props.mode === 'level') {
    const l = levelById(props.levelId || ''); if (!l) throw new Error('Unknown level');
    level.value = l; side = l.side; difficulty = l.difficulty; passive = 0 < l.passiveUntil; noGerans = 0 < l.noGeransUntil;
  }
  team.value = side;
  game = markRaw(new Game({ seed: (Math.random() * 0x7fffffff) | 0, bots: [side === 1, side === 0], difficulty, passive, noGerans, scenario: level.value?.scenario }));
  session = new LocalSession(game, side);
  api.post<{ id: string }>('/api/games', { mode: props.mode, levelId: props.levelId, side, difficulty }).then(r => { gameLogId = r.id; }).catch(e => console.warn('game log', e));
}

async function setupMatch() {
  const id = props.matchId!;
  offs.push(hub.on<[TurnDto]>('Turn', t => { (session as NetSession).receive(t); if (netStatus.value === 'Waiting for the opponent to join') netStatus.value = ''; }));
  offs.push(hub.on<[ChatMsg]>('MatchChat', m => { chat.value.push(m); if (chat.value.length > 200) chat.value.shift(); }));
  offs.push(hub.on<[{ connected: boolean; graceSeconds: number }]>('OpponentConnection', o => { netStatus.value = o.connected ? '' : 'Opponent disconnected: waiting up to ' + o.graceSeconds + ' s for them to return'; if (o.connected) msg('Opponent reconnected'); }));
  offs.push(hub.on<[{ turn: number }]>('Desync', d => { netStatus.value = 'Simulations diverged at turn ' + d.turn + ': the result may not match your opponent\'s screen'; }));
  offs.push(hub.on<[{ winnerTeam: number; reason: string; winnerUsername?: string }]>('MatchEnded', m => onMatchEnded(m)));
  offs.push(hub.on('$reconnecting', () => { netStatus.value = 'Reconnecting to the server…'; }));
  offs.push(hub.on('$reconnected', async () => {
    try { const info = await hub.invoke<MatchInfo>('JoinMatch', id); for (const t of info.history) (session as NetSession).receive(t); netStatus.value = ''; msg('Reconnected'); }
    catch (e) { netStatus.value = 'Could not rejoin the match: ' + (e as Error).message; }
  }));
  await hub.connect();
  const info = await hub.invoke<MatchInfo>('JoinMatch', id);
  team.value = info.yourTeam;
  opponent.value = info.players.find(p => p.team !== info.yourTeam)?.username || 'opponent';
  game = markRaw(new Game({ seed: info.seed, bots: [false, false], difficulty: 1 }));
  session = new NetSession(game, info.yourTeam, {
    sendCommand: p => hub.send('SendCommand', id, p),
    reportHash: (t, h) => hub.send('ReportHash', id, t, h),
  }, info.history);
  if (!info.running && info.history.length === 0) netStatus.value = 'Waiting for the opponent to join';
  chat.value.push({ from: 'system', text: 'You are ' + TEAMS[info.yourTeam].name + ' against ' + opponent.value + '. Destroy their headquarters.', at: new Date().toISOString() });
}

function attach() {
  const c = canvas.value!, mm = minimap.value!, st = stage.value!;
  ctx = c.getContext('2d')!; mmctx = mm.getContext('2d')!;
  const controller = markRaw(new Controller(session, team.value));
  controller.onMessage = msg;
  controller.onSelectionChange = () => { hudTick.value++; };
  controller.onToggle = onToggle;
  ctl.value = controller;
  if (import.meta.env.DEV) (window as unknown as { gz: unknown }).gz = { game, ctl: controller, session, audio };
  level.value?.objectives[0]?.onStart?.(game);
  const resize = () => { const vw = st.clientWidth, vh = st.clientHeight, dpr = window.devicePixelRatio || 1; c.width = Math.floor(vw * dpr); c.height = Math.floor(vh * dpr); controller.resize(vw, vh, dpr); };
  resize(); const ro = new ResizeObserver(resize); ro.observe(st); cleanups.push(() => ro.disconnect());
  const hq = game.hq(team.value); if (hq) controller.centerOn(hq.x, hq.y + (team.value === UA ? -60 : 60));
  camStart = { x: controller.view.cam.x, y: controller.view.cam.y };
  if (!isNet.value) startCutscene();
  const pos = (e: MouseEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => { el.addEventListener(ev, fn as EventListener, opts); cleanups.push(() => el.removeEventListener(ev, fn as EventListener, opts)); };
  on(c, 'mousedown', e => { audio.unlock(); if (result.value) return; const p = pos(e); controller.mouseDown(p.x, p.y, e.button, e.shiftKey); if (e.button === 1) e.preventDefault(); });
  on(c, 'mousemove', e => { const p = pos(e); controller.mouseMove(p.x, p.y); });
  on(c, 'mouseleave', () => controller.mouseLeave());
  on(c, 'dblclick', e => { if (result.value) return; const p = pos(e); controller.doubleClick(p.x, p.y); });
  on(c, 'contextmenu', e => { e.preventDefault(); if (result.value) return; const p = pos(e); controller.contextMenu(p.x, p.y, e.ctrlKey || e.altKey, e.shiftKey); });
  on(c, 'wheel', e => { e.preventDefault(); const p = pos(e); controller.wheel(e.deltaY, p.x, p.y); }, { passive: false });
  on(window, 'mouseup', e => controller.mouseUp(e.button));
  on(mm, 'mousedown', e => { if (result.value) return; const r = mm.getBoundingClientRect(); controller.minimapDown((e.clientX - r.left) / MM_W, (e.clientY - r.top) / MM_H, e.button); });
  on(mm, 'contextmenu', e => e.preventDefault());
  on(window, 'keydown', e => {
    audio.unlock();
    if (cut.value) { if (e.code === 'Escape' || e.code === 'Enter') endCutscene(); else if (e.code === 'Space') nextCutLine(); e.preventDefault(); return; }
    const t = e.target as HTMLElement | null, typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.code === 'Enter' && !typing && isNet.value) { chatPanel.value?.focus(); e.preventDefault(); return; }
    if (typing) { if (e.code === 'Escape') (t as HTMLElement).blur(); return; }
    if (result.value) return;
    if (controller.keyDown(e)) e.preventDefault();
  });
  on(window, 'keyup', e => controller.keyUp(e));
  // a closed tab still gets logged as abandoned: keepalive lets the request outlive the page
  const onHide = () => {
    if (isNet.value || finished || !gameLogId || game.gameOver) return; finished = true;
    fetch(`/api/games/${gameLogId}/finish`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token }, body: JSON.stringify({ result: 'abandoned', durationSeconds: Math.round(game.gameTime) }) }).catch(() => {});
  };
  window.addEventListener('pagehide', onHide); cleanups.push(() => window.removeEventListener('pagehide', onHide));
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const elapsed = Math.min(0.25, (now - last) / 1000); last = now;
  const controller = ctl.value!;
  if (cut.value) {
    // slow pan toward this line's map point; lines advance on their own after a while
    cutT += elapsed;
    const shot = cutShots[Math.min(cut.value.index, cutShots.length - 1)];
    if (shot) { const v = controller.view, tx = shot.x - v.vw / (2 * v.cam.z), ty = shot.y - v.vh / (2 * v.cam.z); v.cam.x += (tx - v.cam.x) * Math.min(1, elapsed * 1.2); v.cam.y += (ty - v.cam.y) * Math.min(1, elapsed * 1.2); controller.clampCam(); }
    // a line stays until it has been read out (plus a beat); with voice off, long enough to read it silently
    const line = cut.value.lines[cut.value.index] || '';
    const readTime = 2.5 + line.length * 0.055;
    if (audio.narrating) cutDone = 0; else cutDone += elapsed;
    const advance = audio.narrating ? false : audio.narrateSpoke ? cutDone > 1.2 : cutT > readTime;
    if (advance) nextCutLine();
  }
  if (!result.value) session.advance(elapsed);
  audio.scan(game, controller.view, now);
  controller.handleCamera(elapsed); controller.prune();
  for (const n of game.drainNotices(team.value)) msg(n);
  if (msgTimer > 0) { msgTimer -= elapsed; if (msgTimer <= 0) msgShow.value = false; }
  objT -= elapsed; if (objT <= 0) { objT = 0.5; checkLevel(); }
  if (game.gameOver && !result.value) onGameOver();
  renderer.render(ctx, game, controller.view, now, audio.shake);
  renderer.renderMinimap(mmctx, game, controller.view);
  hudT -= elapsed; if (hudT <= 0) { hudT = 0.25; hudTick.value++; }
}

function startCutscene() {
  const l = level.value, hq = game.hq(team.value);
  const lines = l ? l.briefing : SKIRMISH_BRIEF[team.value];
  cutShots = l ? l.shots(game) : [hq || { x: W / 2, y: H / 2 }, game.site(team.value === UA ? 'Lyptsi' : 'Zhuravlyovka'), game.hq(1 - team.value) || { x: W / 2, y: H / 2 }];
  cut.value = { title: l ? l.title : (team.value === UA ? 'Skirmish: the Kharkiv front' : 'Skirmish: the Belgorod front'), lines, index: 0 };
  session.paused = true; cutT = 0; cutDone = 0;
  if (cutShots[0]) ctl.value!.centerOn(cutShots[0].x, cutShots[0].y);
  audio.narrate(lines[0]);
}
function nextCutLine() {
  const c = cut.value; if (!c) return;
  if (c.index >= c.lines.length - 1) return endCutscene();
  c.index++; cutT = 0; cutDone = 0; audio.narrate(c.lines[c.index]);
}
function endCutscene() {
  if (!cut.value) return;
  cut.value = null; audio.cancelSpeech(); session.paused = paused.value;
  const controller = ctl.value!; controller.view.cam.z = 1; controller.goHome(); if (team.value === UA) controller.view.cam.y -= 60; else controller.view.cam.y += 60; controller.clampCam();
  camStart = { x: controller.view.cam.x, y: controller.view.cam.y };
  msg(level.value ? 'Mission started' : 'Skirmish started');
}
function checkLevel() {
  const l = level.value, controller = ctl.value; if (!l || !controller || result.value || cut.value) return;
  game.botPassive = objIdx.value < l.passiveUntil; game.noGerans = objIdx.value < l.noGeransUntil;
  if (objIdx.value >= l.objectives.length) return;
  const o = l.objectives[objIdx.value];
  controller.view.marker = o.marker ? o.marker(game) : null;
  const cam = controller.view.cam;
  const ctx = { camMoved: Math.abs(cam.x - camStart.x) > 250 || Math.abs(cam.y - camStart.y) > 250 || cam.z !== 1, selection: controller.selection };
  if (o.done(game, ctx)) advanceObjective();
}
function advanceObjective() {
  const l = level.value!; msg('Step done: ' + l.objectives[objIdx.value].title); audio.blip(); objIdx.value++;
  if (objIdx.value < l.objectives.length) l.objectives[objIdx.value].onStart?.(game);
  if (objIdx.value >= l.objectives.length) { ctl.value!.view.marker = null; showResult(true, 'Level complete', l.title + ' finished. The enemy is fully awake from here: keep playing or move on to the next level.'); api.post('/api/progress', { levelId: l.id }).then(() => auth.markLevel(l.id)).catch(() => {}); }
}

function statsFor(): [string, string][] {
  const PL = team.value, EN = 1 - PL, civTotal = CIV_SITES.filter(c => c[1] === 0).length;
  const fmt = (t: number) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };
  return [[String(Math.round(game.stats.score[PL])) + ' vs ' + Math.round(game.stats.score[EN]), 'Score'], [fmt(game.gameTime), 'Time'], [String(game.stats.kills[PL]), 'Enemy units destroyed'], [String(game.stats.lost[PL]), 'Your units lost'],
    [String(game.stats.structsKilled[PL]), 'Enemy buildings destroyed'], [String(game.stats.friendlyFire[PL]), 'Lost to your own artillery'], [Math.floor(game.funds[PL]) + ' funds, ' + Math.floor(game.people[PL].total) + ' people', 'Resources at the end'], [game.depots.filter(d => d.owner === PL).length + ' of ' + game.depots.length, 'Towns held'],
    [(civTotal - game.civ.lost[0]) + ' of ' + civTotal, 'Ukrainian civilian sites standing'], [String(game.civ.harmedByUA + game.civ.carsKilled[0]), 'Russian civilian sites and vehicles hit by Ukraine'], [String(game.civ.defectors), 'Russian volunteers and defectors'],
    [PL === UA ? Math.round(game.support) + '%' : String(game.captured[PL]), PL === UA ? 'Support at the end' : 'Enemy trucks captured'], [game.resources.filter(r => r.owner === PL).length + ' of ' + game.resources.length, 'Gas and wheat sites held'], [String(game.tradeTotal[PL]), 'Funds from trade convoys'],
    [String(game.stats.vets[PL]), 'Units that earned a rank'], [Object.entries(game.stats.killsOf[PL]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => n + ' ' + (UNITS[k] ? UNITS[k].label[EN].toLowerCase() : k)).join(', ') || 'none', 'Most destroyed']];
}
function showResult(won: boolean, title: string, text: string) { result.value = { won, title, text, stats: statsFor() }; ctl.value!.view.placing = null; ctl.value!.view.bombardMode = false; }

function onGameOver() {
  const won = game.winner === team.value;
  if (isNet.value) { hub.send('ReportResult', props.matchId, game.winner); }
  const text = won ? 'The enemy command post is gone. ' + TEAMS[team.value].name + ' holds the field.' : 'Enemy forces broke through and reached your command post.';
  showResult(won, won ? 'Enemy headquarters destroyed' : 'Headquarters lost', text);
  finishSolo(won ? 'won' : 'lost');
}
function onMatchEnded(m: { winnerTeam: number; reason: string; winnerUsername?: string }) {
  auth.refresh();
  if (result.value) return;
  const won = m.winnerTeam === team.value;
  const why = m.reason === 'forfeit' ? (won ? 'Your opponent forfeited.' : 'You forfeited.') : m.reason === 'disconnect' ? (won ? 'Your opponent dropped and did not return.' : 'You were disconnected too long.') : m.reason === 'timeout' ? 'The match was cancelled before both players joined.' : (won ? 'The enemy command post is gone.' : 'Your command post fell.');
  showResult(won, m.winnerTeam < 0 ? 'Match cancelled' : won ? 'Victory' : 'Defeat', why + (m.winnerUsername ? ' Winner: ' + m.winnerUsername + '.' : ''));
}
function finishSolo(res: 'won' | 'lost' | 'abandoned') {
  if (isNet.value || finished) return; finished = true;
  const send = () => api.post(`/api/games/${gameLogId}/finish`, { result: res, durationSeconds: Math.round(game.gameTime), score: Math.round(game.stats.score[team.value]), kills: game.stats.kills[team.value], losses: game.stats.lost[team.value] }).catch(() => {});
  if (gameLogId) send(); else setTimeout(() => { if (gameLogId) send(); }, 1500);
}
function togglePause() { if (!session.canPause || result.value || cut.value) return; session.paused = !session.paused; paused.value = session.paused; }
function cycleBasemap() { const modes: BasemapMode[] = ['drawn', 'street', 'satellite']; basemap.value = modes[(modes.indexOf(basemap.value) + 1) % modes.length]; tc.loadBasemap(basemap.value); }
function sendChat(text: string) { hub.send('SendMatchChat', props.matchId, text); }
async function leave() {
  if (isNet.value && !result.value && !game.gameOver) { if (!confirm('Leave the match? Your opponent wins by forfeit.')) return; try { await hub.invoke('LeaveMatch', props.matchId); } catch { /* ignore */ } }
  finishSolo('abandoned');
  router.push(isNet.value ? '/lobby' : '/');
}
function playAgain() { if (isNet.value) router.push('/lobby'); else router.replace({ path: router.currentRoute.value.path, query: { ...router.currentRoute.value.query, r: String(Date.now()) } }); }
function continuePlaying() { result.value = null; }

onUnmounted(() => { cancelAnimationFrame(raf); cleanups.forEach(f => f()); offs.forEach(f => f()); if (!game?.gameOver) finishSolo('abandoned'); session?.destroy(); audio.dispose(); });
</script>

<template>
  <div id="game-root">
    <div v-if="error" class="page"><div class="card"><h2>Could not start the game</h2><p class="err">{{ error }}</p><router-link to="/"><button type="button">Back</button></router-link></div></div>
    <template v-else-if="ready">
      <TopBar :game="game" :team="team" :tick="hudTick" :paused="paused" :can-pause="!isNet" :speed="speed" :basemap="basemap" :audio="audioMode" :opponent="opponent || undefined" @toggle="onToggle" @basemap="cycleBasemap" @leave="leave" />
      <div id="stage" ref="stage">
        <canvas id="game" ref="canvas" :class="{ pilot: piloting }" />
        <div id="msg" :class="{ show: msgShow }">{{ msgText }}</div>
        <div id="paused" v-if="paused">Paused</div>
        <div id="netstatus" v-if="netStatus || (isNet && (session as any)?.waiting)">{{ netStatus || 'Waiting for the server…' }}</div>
        <ObjectivesPanel v-if="level && objIdx < level.objectives.length && !cut" :level="level" :index="objIdx" :game="game" :team="team" :tick="hudTick" @skip="advanceObjective" />
        <Cutscene v-if="cut" :title="cut.title" :side="team" :lines="cut.lines" :index="cut.index" @next="nextCutLine" @skip="endCutscene" />
        <LegendPanel v-if="showLegend" />
        <BattleLog v-if="showLog" :game="game" :team="team" :tick="hudTick" @close="showLog = false" />
        <BattleLog v-else :game="game" :team="team" :tick="hudTick" feed />
        <TechPanel v-if="showTech && ctl" :ctl="ctl" :tick="hudTick" @close="showTech = false" />
        <ManualPanel v-if="showManual" @close="showManual = false" />
        <ChatPanel v-if="isNet" ref="chatPanel" :messages="chat" :opponent="opponent" @send="sendChat" />
        <div id="overlay" v-if="result">
          <div class="card">
            <h1>{{ result.title }}</h1>
            <p class="result">{{ result.text }}</p>
            <div class="stats"><div v-for="[v, l] in result.stats" :key="l"><b>{{ v }}</b><span>{{ l }}</span></div></div>
            <div class="row">
              <button type="button" class="primary" @click="playAgain">{{ isNet ? 'Back to the lobby' : 'Play again' }}</button>
              <button type="button" v-if="!game.gameOver" @click="continuePlaying">Keep playing</button>
              <router-link to="/"><button type="button">Main menu</button></router-link>
            </div>
          </div>
        </div>
      </div>
      <div id="bottom">
        <SelectionPanel v-if="ctl" :ctl="ctl" :tick="hudTick" />
        <CommandPanel v-if="ctl" :ctl="ctl" :tick="hudTick" @tech="showTech = true" />
        <div id="mapwrap"><canvas id="minimap" ref="minimap" :width="MM_W" :height="MM_H" /></div>
      </div>
    </template>
    <div v-else class="page" style="display:flex;align-items:center;justify-content:center"><div class="card"><h2>{{ isNet ? 'Joining the match…' : 'Preparing the map…' }}</h2></div></div>
  </div>
</template>
