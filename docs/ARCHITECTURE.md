# How the code is laid out

```
client/                      Vue 3 + TypeScript, built with Vite
  scripts/                   developer tools run with tsx (see docs/MODDING.md)
    validate.ts              checks the data tables and levels
    sim-check.ts             determinism check of the simulation
    sim-play.ts              plays the game headless in the terminal
  src/
    game/
      data/                  THE TABLES: units, buildings, research, postures, rules, barks, manual text
      levels/                one file per teaching level, plus helpers and the shared types
      maps/                  THE MAPS: the Kharkiv and Sumy fronts as latitude/longitude data
      sim/                   THE RULES: the deterministic simulation (see below)
      render/                canvas drawing of the game from one player's view
      map.ts                 the world size and WorldMap: a map's projection, places, and headquarters
      terrain.ts             passable terrain from a map: rivers, bridges, the road graph, cover (one per map)
      terrainCanvas.ts       the painted map and the optional real map tiles (visual only)
      briefings.ts           the opening cutscene for a skirmish (a level brings its own)
      bot.ts                 the computer opponent (part of the simulation: it uses the game's RNG)
      controller.ts          player input: camera, selection, hotkeys, clicks into commands
      session.ts             drives a Game forward: solo, replay, or lockstep online
      audio.ts               synthesized effects and spoken barks (client only)
      summary.ts             the end screen's statistics and score graph
      replay.ts              saving and loading the last solo game
      factions.ts            the "two armies" comparison table, computed from the data
      types.ts               the entity and command types
      dmath.ts, rng.ts       deterministic maths and the seeded random source
    components/game/         the HUD panels (top bar, selection, commands, research, manual, log, chat)
    views/                   the pages: home, login, lobby, history, the game
    net/hub.ts               the SignalR connection
    api.ts, stores/auth.ts   the REST client and the login state
server/GreyZone.Server/      C# ASP.NET Core: accounts, lobby, matchmaking, the match turn clock, the game log
docs/PROTOCOL.md             the REST and SignalR contract between the two
docs/prototype/              the original single-file prototype, for reference only
```

## The simulation (`client/src/game/sim/`)

The whole game runs in the browser as a deterministic lockstep simulation: the same seed and the same
commands produce the same state on every machine, so a multiplayer match only exchanges commands. The
server never simulates; it orders commands into 100 ms turns and relays them (`docs/PROTOCOL.md`).

`game.ts` holds the `Game` class: all state, `tick()`, `apply()` for commands, the entity factories, the
messages (log, toasts, barks), and the queries everything else asks (range, vision, supply, who flies what).
The rules that change the state each tick are plain functions in the sibling files, each taking the game
as its first argument. A game owns its map (`g.map`, a `WorldMap` from `maps/`); the terrain, the opening
position, the trade edges, and the nearest-place names for the log all come from it. `Game.tick()` calls the
systems in order:

| File | Runs |
|---|---|
| `weather.ts` | the weather front and the day cycle |
| `vision.ts` | vision circles, spotting, the kill zone |
| `economy.ts` | the power grids and the food, fuel, and charging capacities |
| `logistics.ts` | towns and captures, trucks, trade convoys, ammunition |
| `structures.ts` | construction, production, repair, hospitals, nets, jamming |
| `civilians.ts` | morale, civilian cars, support, defections |
| `swarms.ts` | formations and drone swarms |
| `goals.ts` | skirmish goals and the hold-every-town victory |
| `units.ts` | one unit's tick: batteries, links, postures, orders, shooting, dives |
| `movement.ts` | routing, stepping, rivers and bridges, separation |
| `combat.ts` | fire, projectiles, damage, kills, veterancy, destroyed buildings |
| `strikes.ts` | glide bombs, missiles, deep strikes, Geran waves |
| `commands.ts` | one handler per player command |
| `setup.ts` | the opening position |

`orders.ts`, `entity.ts`, and `constants.ts` are small leaves (order constructors, rank and matchup helpers,
DT and the day cycle). `index.ts` is the public surface: everything outside the sim imports from `'../game/sim'`.

Rules of the simulation: no `Math.random` (use `g.rng`), no `Math.sin`/`cos`/`atan2`/`hypot` (use `dmath.ts`),
and never branch on which side the local player is. `npm run sim:check` verifies determinism.

## The frame

`views/GameView.vue` builds the `Game` and a `Session`, and runs the frame loop: the session advances the
game (solo: as fast as real time allows; online: only when the next turn has arrived), the controller
handles the camera and input and turns clicks into commands, the renderer draws, and the panels re-read the
game a few times a second via a tick counter. The renderer (`render/renderer.ts`) is a list of drawing
passes; units, buildings, effects, and the pilot HUD each have their own file.

## The server

`Program.cs` wires the pieces. `Api/` has the REST endpoints (accounts, level progress, the game log,
the leaderboard), `Hubs/GameHub.cs` the SignalR entry points, `Lobby/` the online list, and
`Matches/MatchService*.cs` the matchmaking queue, what a player can do inside a match, and the turn loop
and lifecycle, split across partial class files by topic. SQLite through EF Core (`Data/`).
