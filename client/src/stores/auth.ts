import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// The token lives in sessionStorage so two browser tabs can be two different players.
const KEY = 'greyzone.auth';

export const useAuth = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const username = ref<string | null>(null);
  const completedLevels = ref<string[]>([]);
  const wins = ref(0), losses = ref(0);
  try { const s = sessionStorage.getItem(KEY); if (s) { const j = JSON.parse(s); token.value = j.token; username.value = j.username; } } catch { /* ignore */ }

  const loggedIn = computed(() => !!token.value);

  function set(t: string, u: string) { token.value = t; username.value = u; try { sessionStorage.setItem(KEY, JSON.stringify({ token: t, username: u })); } catch { /* ignore */ } }
  function logout() { token.value = null; username.value = null; completedLevels.value = []; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Request failed');
    return j as { token: string; username: string };
  }
  async function login(u: string, p: string) { const r = await post('/api/auth/login', { username: u, password: p }); set(r.token, r.username); await refresh(); }
  async function register(u: string, p: string) { const r = await post('/api/auth/register', { username: u, password: p }); set(r.token, r.username); await refresh(); }
  async function refresh() {
    if (!token.value) return;
    const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token.value } });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) return;
    const me = await res.json();
    username.value = me.username; completedLevels.value = me.completedLevels || []; wins.value = me.wins; losses.value = me.losses;
  }
  function markLevel(id: string) { if (!completedLevels.value.includes(id)) completedLevels.value.push(id); }

  return { token, username, loggedIn, completedLevels, wins, losses, login, register, logout, refresh, markLevel };
});
