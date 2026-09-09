// Client-only sound: synthesized effects (no audio files) and spoken barks via the browser's speech synthesis.
// Reads game.effects, never writes to the simulation.
import { BARKS_TTS } from './data';
import type { Game } from './sim';
import type { Effect } from './types';
import type { View } from './render';

const KEY = 'gz.audio';
const COOLDOWN_MS: Record<string, number> = { tracer: 70, hit: 120, flash: 90, boom: 50, caught: 150, mark: 200, bark: 0, text: 300, heal: 9999 };
const PRIORITY: Record<string, number> = { win: 7, capture: 6, lost: 5, attack: 4, strike: 4, bombard: 4, kill: 3, reply: 3, ack: 2, ops: 2, dig: 1 };

export class AudioDirector {
  sfx = true; voice = true;
  private ctx: AudioContext | null = null; private master: GainNode | null = null; private noise: AudioBuffer | null = null;
  private heard = new WeakSet<Effect>(); private lastKind: Record<string, number> = {}; private lastSpeech = 0; private queued: { text: string; team: number; pri: number } | null = null;
  played = 0; spoken = 0; dropped = 0;
  /** camera shake amplitude, consumed by the renderer */
  shake = 0;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor() {
    try { const s = localStorage.getItem(KEY); if (s) { const j = JSON.parse(s); this.sfx = j.sfx !== false; this.voice = j.voice !== false; } } catch { /* ignore */ }
  }
  get mode(): 'on' | 'sfx' | 'off' { return this.sfx && this.voice ? 'on' : this.sfx ? 'sfx' : 'off'; }
  cycle() { if (this.sfx && this.voice) this.voice = false; else if (this.sfx) this.sfx = false; else { this.sfx = true; this.voice = true; } if (!this.voice) this.cancelSpeech(); this.save(); }
  private save() { try { localStorage.setItem(KEY, JSON.stringify({ sfx: this.sfx, voice: this.voice })); } catch { /* ignore */ } }

  /** create the AudioContext on the first user gesture (browsers refuse to start audio otherwise) */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  /** look at every effect the simulation produced since the last frame */
  scan(g: Game, v: View, now: number) {
    const cx = v.cam.x + v.vw / (2 * v.cam.z), cy = v.cam.y + v.vh / (2 * v.cam.z), viewR = Math.max(v.vw, v.vh) / v.cam.z;
    let budget = 10, biggestBoom: Effect | null = null;
    for (const e of g.effects) {
      if (this.heard.has(e)) continue;
      this.heard.add(e);
      if (e.kind === 'bark') { this.onBark(e, g, v); continue; }
      if (e.kind === 'boom') { const own = Math.hypot(e.x - cx, e.y - cy) < viewR; if (own && (!biggestBoom || (e.r || 0) > (biggestBoom.r || 0))) biggestBoom = e; }
      if (!this.sfx || !this.ctx || budget <= 0) { this.dropped++; continue; }
      const cd = COOLDOWN_MS[e.kind] ?? 100;
      if (now - (this.lastKind[e.kind] || 0) < cd) { this.dropped++; continue; }
      const d = Math.hypot(e.x - cx, e.y - cy), gain = Math.max(0.06, 1 - d / (0.9 * viewR));
      if (d > viewR * 1.6) continue;
      this.lastKind[e.kind] = now; budget--;
      this.play(e, gain);
    }
    this.weatherLoop(g.weather.kind === 'rain' || g.weather.kind === 'snow' ? (g.weather.kind === 'rain' ? 0.12 : 0.04) : 0);
    if (biggestBoom) this.shake = Math.max(this.shake, Math.min(7, (biggestBoom.r || 0) / 12));
    this.shake *= 0.85; if (this.shake < 0.2) this.shake = 0;
    if (this.queued && this.voice && now - this.lastSpeech > 2600 && !window.speechSynthesis?.speaking) { const q = this.queued; this.queued = null; this.say(q.text, q.team, now); }
  }

  private play(e: Effect, gain: number) {
    const c = this.ctx!, t = c.currentTime;
    switch (e.kind) {
      case 'tracer': this.burst(0.04, 1, e.team === 0 ? 2200 : 1600, 'bandpass', gain * 0.35, t); break;
      case 'hit': this.burst(0.06, 1, 1200, 'bandpass', gain * 0.2, t); break;
      case 'flash': this.burst(0.03, 1, 3000, 'lowpass', gain * 0.4, t); this.tone(110, 0.15, gain * 0.5, t, 'sine'); break;
      case 'boom': { const r = e.r || 20, dur = 0.25 + Math.min(1, r / 150); this.burst(dur, 900, 90, 'lowpass', gain * Math.min(1, 0.35 + r / 60), t, true); this.tone(55, dur * 0.8, gain * 0.6, t, 'sine'); break; }
      case 'caught': this.sweep(1200, 300, 0.2, gain * 0.3, t); break;
      case 'mark': if (e.green) { this.tone(880, 0.09, gain * 0.25, t, 'square'); this.tone(1320, 0.09, gain * 0.25, t + 0.09, 'square'); } else if (e.red) this.tone(330, 0.07, gain * 0.2, t, 'square'); break;
      case 'text': this.tone(660, 0.06, gain * 0.2, t, 'triangle'); break;
    }
    this.played++;
  }
  private weatherLoop(level: number) {
    if (!this.ctx) return;
    if (!this.sfx) level = 0;
    if (level > 0 && !this.rain) { const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const gn = c.createGain(); gn.gain.value = 0; src.connect(f); f.connect(gn); gn.connect(this.master!); src.start(); this.rain = { src, gain: gn }; }
    if (this.rain) { this.rain.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8); if (level === 0 && this.rain.gain.gain.value < 0.002) { try { this.rain.src.stop(); } catch { /* ignore */ } this.rain = null; } }
  }
  blip() { if (!this.sfx || !this.ctx) return; this.tone(660, 0.06, 0.25, this.ctx.currentTime, 'triangle'); }

  private burst(dur: number, f0: number, f1: number, type: BiquadFilterType, gain: number, t: number, sweepDown = false) {
    const c = this.ctx!, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(sweepDown ? f0 : f1, t); if (sweepDown) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = type === 'bandpass' ? 2 : 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master!); src.start(t); src.stop(t + dur + 0.02);
  }
  private tone(freq: number, dur: number, gain: number, t: number, type: OscillatorType) {
    const c = this.ctx!, o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }
  private sweep(f0: number, f1: number, dur: number, gain: number, t: number) {
    const c = this.ctx!, o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }

  // ---- speech
  private onBark(e: Effect, g: Game, v: View) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    const own = e.team === v.team;
    if (!own && !g.inVision(v.team, e.x, e.y)) return;
    const kind = e.sub || 'ack';
    const pri = (PRIORITY[kind] || 1) - (own ? 0 : 1);
    if (!this.queued || pri >= this.queued.pri) this.queued = { text: e.text || '', team: e.team ?? 0, pri };
  }
  private say(text: string, team: number, now: number) {
    try {
      const synth = window.speechSynthesis; if (!synth) return;
      const voices = synth.getVoices();
      const want = team === 0 ? 'uk' : 'ru';
      const voice = voices.find(vc => vc.lang.toLowerCase().startsWith(want)) || null;
      const u = new SpeechSynthesisUtterance(voice ? (BARKS_TTS[text] || text) : text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-US'; u.rate = 1.05; u.pitch = team === 0 ? 1.0 : 0.85; u.volume = 0.9;
      synth.speak(u); this.lastSpeech = now; this.spoken++;
    } catch { /* ignore */ }
  }
  cancelSpeech() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } this.queued = null; this.narrating = false; }
  /** true while a briefing line is being read aloud */
  narrating = false;
  /** true once the current line actually started being spoken (so a silent engine falls back to reading time) */
  narrateSpoke = false;
  /** briefing narration in the default (English) voice; `narrating` clears when the line ends (or on error/cancel) */
  narrate(text: string) {
    this.narrating = false; this.narrateSpoke = false;
    if (!this.voice || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis; synth.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.0; u.pitch = 0.95; u.volume = 0.9;
      u.onstart = () => { this.narrating = true; this.narrateSpoke = true; };
      u.onend = () => { this.narrating = false; }; u.onerror = () => { this.narrating = false; };
      this.narrating = true; synth.speak(u); this.lastSpeech = performance.now();
      // if the engine never starts (no voices, blocked audio), do not hold the briefing forever
      setTimeout(() => { if (this.narrating && !synth.speaking && !synth.pending) this.narrating = false; }, 2500);
    } catch { this.narrating = false; }
  }
  dispose() { this.cancelSpeech(); try { this.rain?.src.stop(); } catch { /* ignore */ } this.rain = null; try { this.ctx?.close(); } catch { /* ignore */ } this.ctx = null; }
}
