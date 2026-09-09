# Grey Zone: client/server protocol

The game simulation runs in the browser (TypeScript, deterministic lockstep). The C# server never simulates
the game. It owns: accounts, the lobby, matchmaking, chat, the authoritative turn clock for a multiplayer
match, the game log (who played what, when, result), and level progress.

All times are UTC ISO-8601 strings. All ids are strings unless noted.

## REST (JSON), prefix `/api`

Auth: `Authorization: Bearer <jwt>` on every endpoint except register/login. Tokens last 30 days.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ "username": string, "password": string }` | `200 { "token", "username" }`, `400 { "error": "..." }` (taken, too short) |
| POST | `/api/auth/login` | `{ "username", "password" }` | `200 { "token", "username" }`, `401 { "error" }` |
| GET | `/api/me` | | `{ "username", "wins", "losses", "completedLevels": string[] }` |
| POST | `/api/progress` | `{ "levelId": string }` | `204` |
| POST | `/api/games` | `{ "mode": "level"\|"skirmish"\|"multiplayer", "levelId"?: string, "side": 0\|1, "difficulty"?: number }` | `200 { "id": string }` — logs that a solo game started |
| POST | `/api/games/{id}/finish` | `{ "result": "won"\|"lost"\|"abandoned", "durationSeconds": number }` | `204` |
| GET | `/api/games/recent?limit=50` | | `GameLogEntry[]` newest first (all users: the public "who played" log) |
| GET | `/api/games/mine?limit=50` | | `GameLogEntry[]` for the caller |
| GET | `/api/leaderboard` | | `[{ "username", "wins", "losses", "gamesPlayed" }]` top 20 by wins |

Username rules: 3-20 chars, letters, digits, `_`, case-insensitive uniqueness. Password: min 6 chars.

```
GameLogEntry {
  id: string, mode: "level"|"skirmish"|"multiplayer", levelId?: string,
  players: [{ username: string, side: 0|1 }],      // 1 entry for solo, 2 for multiplayer
  startedAt: string, endedAt?: string, durationSeconds?: number,
  result?: string,          // solo: "won"|"lost"|"abandoned"; multiplayer: "<winnerUsername> won" | "draw" | "abandoned"
  winnerUsername?: string
}
```

Side: 0 = Ukraine, 1 = Russia.

## SignalR hub at `/hubs/game`

Authenticated with the JWT via `access_token` query string (standard SignalR JS client `accessTokenFactory`).
One connection per client handles both lobby and match traffic.

### Client → server methods

| Method | Args | Returns | Notes |
|---|---|---|---|
| `SendLobbyChat` | `(text: string)` | | broadcast `LobbyChat` to everyone in the lobby |
| `JoinQueue` | `(sidePref: 0\|1\|-1)` | | -1 = any. Matchmaker pairs the two longest-waiting compatible players (two "any", or one UA + one RU, or "any" + either). Sides resolved randomly when both "any". |
| `LeaveQueue` | `()` | | |
| `JoinMatch` | `(matchId: string)` | `MatchInfo` | Adds connection to group `match:{id}`. If both players have joined, the turn clock starts (or resumes). On reconnect returns the full turn history so the client can re-simulate. |
| `SendCommand` | `(matchId: string, payload: string)` | | payload is an opaque JSON string; the server tags it with the sender's team and queues it for the next turn |
| `SendMatchChat` | `(matchId: string, text: string)` | | broadcast `MatchChat` to the match group |
| `ReportHash` | `(matchId: string, turn: number, hash: string)` | | server stores per player; when both reported the same turn with different hashes it broadcasts `Desync` |
| `ReportResult` | `(matchId: string, winnerTeam: 0\|1)` | | first report ends the match; server records win/loss + game log, broadcasts `MatchEnded` |
| `LeaveMatch` | `(matchId: string)` | | forfeit: opponent wins |

### Server → client events

| Event | Payload |
|---|---|
| `LobbyState` | `{ online: string[], queue: number, recentGames: GameLogEntry[] }` sent on connect and whenever online/queue changes |
| `LobbyChat` | `{ from: string, text: string, at: string }` (also `from: "system"` for join/leave notices) |
| `QueueStatus` | `{ inQueue: boolean, position: number }` |
| `MatchFound` | `MatchInfo` |
| `Turn` | `{ turn: number, commands: [{ team: 0\|1, payload: string }] }` one per 100 ms while the match runs |
| `MatchChat` | `{ from: string, team: 0\|1, text: string, at: string }` |
| `OpponentConnection` | `{ connected: boolean, graceSeconds: number }` |
| `Desync` | `{ turn: number }` |
| `MatchEnded` | `{ winnerTeam: 0\|1\|-1, reason: "hq"\|"forfeit"\|"timeout"\|"disconnect", winnerUsername?: string }` |
| `Error` | `{ message: string }` |

```
MatchInfo {
  matchId: string, seed: number (int32), yourTeam: 0|1,
  players: [{ username, team }],
  turn: number,                       // last completed turn (0 before start)
  history: [{ turn, commands }] ,     // all turns so far (empty on a fresh match)
  running: boolean
}
```

### Match lifecycle (server)

1. Matchmaker creates `Match { id, seed = random int32, players[2] with teams, state = WaitingForPlayers }`, sends `MatchFound` to both.
2. Each client navigates to the match page and calls `JoinMatch`. When both have joined, state = Running and a
   100 ms `PeriodicTimer` loop starts: each tick swaps the pending command list, increments `turn`, appends
   `{turn, commands}` to history, broadcasts `Turn`.
3. If a player disconnects, the loop pauses, the opponent gets `OpponentConnection{connected:false, graceSeconds:60}`.
   If they call `JoinMatch` again within 60 s, they get `MatchInfo` with the full history and the loop resumes
   (`OpponentConnection{connected:true}`). Otherwise the match ends: `MatchEnded{reason:"disconnect"}` with the
   remaining player as winner.
4. If both players have not joined within 60 s of `MatchFound`, the match is cancelled (`MatchEnded{winnerTeam:-1, reason:"timeout"}`).
5. `ReportResult` or `LeaveMatch` ends the match, records `wins/losses`, writes the game log entry, broadcasts `MatchEnded`.
6. Finished matches are kept in memory for 10 minutes for late joiners, then dropped.

## Storage (SQLite via EF Core)

- `Users`: Id, Username, NormalizedUsername (unique), PasswordHash, CreatedAt, Wins, Losses
- `LevelProgress`: Id, UserId, LevelId, CompletedAt (unique on UserId+LevelId)
- `GameLogs`: Id, Mode, LevelId, StartedAt, EndedAt, DurationSeconds, Result, WinnerUserId
- `GameLogPlayers`: Id, GameLogId, UserId, Side

## Hosting

- Development: server on `http://localhost:5080`, Vite dev server on `http://localhost:5173` proxies `/api` and `/hubs` (ws) to 5080.
- Production: the server serves the built client from `wwwroot` (copied from `client/dist`) with an SPA fallback to `index.html`. WebSockets must be enabled on the host.
- SQLite file: `Data/greyzone.db` relative to content root, overridable with `ConnectionStrings:Default`. On Azure App Service put it under `$HOME/data`.
- JWT signing key from configuration `Jwt:Key` (min 32 chars); if missing, a random key is generated at startup (tokens then die with a restart), and a warning is logged.
