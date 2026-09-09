// Thin fetch wrapper for the C# REST API (see docs/PROTOCOL.md).
import { useAuth } from './stores/auth';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const auth = useAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && auth.token && !path.startsWith('/api/auth/')) auth.logout();
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* no body */ }
    throw new ApiError(res.status, msg || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};

export interface GameLogEntry {
  id: string; mode: 'level' | 'skirmish' | 'multiplayer'; levelId?: string;
  players: { username: string; side: number }[];
  startedAt: string; endedAt?: string; durationSeconds?: number; result?: string; winnerUsername?: string;
}
export interface Me { username: string; wins: number; losses: number; completedLevels: string[] }
export interface LeaderboardRow { username: string; wins: number; losses: number; gamesPlayed: number }
