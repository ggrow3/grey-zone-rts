// One SignalR connection per client for lobby, matchmaking, chat, and match turns (see docs/PROTOCOL.md).
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { useAuth } from '../stores/auth';

export interface MatchInfo {
  matchId: string;
  seed: number;
  yourTeam: number;
  players: { username: string; team: number }[];
  turn: number;
  history: { turn: number; commands: { team: number; payload: string }[] }[];
  running: boolean;
}
export interface LobbyState {
  online: string[];
  queue: number;
  recentGames: import('../api').GameLogEntry[];
}
export interface ChatMsg {
  from: string;
  text: string;
  at: string;
  team?: number;
}

class Hub {
  conn: HubConnection | null = null;
  private starting: Promise<void> | null = null;
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  private build(): HubConnection {
    const auth = useAuth();
    const c = new HubConnectionBuilder()
      .withUrl('/hubs/game', { accessTokenFactory: () => auth.token || '' })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 5000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();
    for (const [ev, set] of this.listeners) c.on(ev, (...args: unknown[]) => set.forEach(f => f(...args)));
    c.onreconnected(() => this.emit('$reconnected'));
    c.onreconnecting(() => this.emit('$reconnecting'));
    c.onclose(() => this.emit('$closed'));
    return c;
  }
  private emit(ev: string, ...args: unknown[]) {
    this.listeners.get(ev)?.forEach(f => f(...args));
  }

  async connect(): Promise<void> {
    if (this.conn && this.conn.state === HubConnectionState.Connected) return;
    if (this.starting) return this.starting;
    if (!this.conn) this.conn = this.build();
    this.starting = this.conn.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }
  async disconnect() {
    if (this.conn) {
      const c = this.conn;
      this.conn = null;
      await c.stop().catch(() => {});
    }
  }
  get connected() {
    return !!this.conn && this.conn.state === HubConnectionState.Connected;
  }

  /** subscribe; returns an unsubscribe function */
  on<T extends unknown[]>(ev: string, fn: (...args: T) => void): () => void {
    const f = fn as (...args: unknown[]) => void;
    if (!this.listeners.has(ev)) {
      this.listeners.set(ev, new Set());
      if (this.conn && !ev.startsWith('$'))
        this.conn.on(ev, (...args: unknown[]) => this.listeners.get(ev)?.forEach(g => g(...args)));
    }
    this.listeners.get(ev)!.add(f);
    return () => {
      this.listeners.get(ev)?.delete(f);
    };
  }
  async invoke<T = void>(method: string, ...args: unknown[]): Promise<T> {
    await this.connect();
    return this.conn!.invoke<T>(method, ...args);
  }
  send(method: string, ...args: unknown[]) {
    if (this.connected) this.conn!.send(method, ...args).catch(e => console.warn(method, e));
  }
}

export const hub = new Hub();
