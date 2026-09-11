# Slava Ukraine: Drone Wars

A browser real-time strategy game on the Kharkiv to Belgorod border: drones, jammers, trucks, trenches, and two headquarters.
Play fourteen teaching levels on both sides of the border and on two fronts (Kharkiv and Sumy), fight the computer on either map, or match against another commander over the network and talk to them while you play.

What makes it feel like the real front: the two armies are not mirrors (drones on both sides are flown by squads until Full autonomy, and North Koreans do not fly; Geran waves, Lancets, North Koreans, defections, civilian support), squads shout "Slava Ukraini!" and "Ura!" (text bubbles, plus spoken voice through the browser's speech synthesis), units earn veteran ranks, squads carry rations that supply trucks and wheat fields keep filled (a squad out of food fights and walks worse), artillery runs on shells that trucks bring up, radar spots guns that fire, every kill and capture goes into a battle log, and a squad can take on up to four drone operators, each flying three drones (six after Drone swarm control). Holding every town for three minutes wins outright.

You can also fly a drone yourself: select one and press Y to take the sticks. The camera rides with it, it flies toward your cursor, and a click puts it on a target or dives it onto a treeline; a human on the sticks dodges more and hits harder. Many units have postures (R cycles them): FPVs hunt, hold, or land in ambush with the motors off; interceptors patrol or guard a post; Mavics fly high or drop low to see into woods; guns shoot and scoot; armor goes hull down; infantry creeps across open ground; jammers and air defense go silent to hide from radar; fire groups escort trucks.

The 2026 front is in here too: a kill zone where anything in the open under an armed enemy drone bleeds, road net tunnels laid five nets at a time, assault robots that take towns with nobody aboard, relay carriers that project a squad's control range, robot logistics trucks, launch rails that let the drone works build fixed-wing aircraft, AI-guided interceptors, and the jet Geran-5 leading the late waves.

- **Client**: Vue 3 + TypeScript (Vite). The whole game simulation runs in the browser as a deterministic lockstep engine.
- **Server**: C# ASP.NET Core (.NET 10) minimal API + SignalR. Accounts (JWT), lobby, matchmaking, chat, the authoritative match turn clock, level progress, and a log of every game played. SQLite via EF Core.

The game was called Grey Zone in its first version; the original single-file prototype is kept as `docs/prototype/grey-zone-rts.html`, and internal names (`GreyZone.Server`, the Azure app `greyzone-rts`) still use it.

## What the game is about

Since 2022 the war in Ukraine has become the first war decided by small drones. A quadcopter that costs a few hundred dollars finds a tank, a truck, or a squad, and a second one kills it; most of what dies on the front now dies to drones, not to guns. Both sides have rebuilt their armies around that fact: squads of infantry who are really drone crews, jammers that cut a drone's radio, fiber-optic drones that trail a spool of glass so no jammer can touch them, nets over the roads, long-range Shahed and Geran waves against the power grid, Lancets hunting artillery, interceptor drones hunting other drones, and the trucks, wheat, fuel, and electricity that keep all of it flying.

This game is a real-time strategy game about that front, on the Kharkiv and Sumy borders. Its purpose is to teach, by playing, what the conflict has turned into and why the decisions are hard:

- **Seeing is everything.** Guns and kamikaze drones can only hit what your side has spotted, so the first fight is for eyes: Mavics high over the woods, radar that catches a howitzer the moment it fires, jammers that blind the enemy's drones, and a kill zone where anything in the open under an armed drone bleeds.
- **Drones are cheap, pilots and power are not.** A drone works turns out an FPV in a fraction of a second, but every drone needs an operator in a squad, a slot on the grid to charge, and a battery that lasts a minute. Losing your substation, your squads, or your control range grounds a fleet that cost almost nothing.
- **Logistics is the front line.** Squads eat rations that supply trucks bring, guns fire shells that ammunition trucks bring, vehicles run on gas that a pipeline pumps, and every truck is prey. Holding wheat fields, gas wells, towns, and pylons matters more than any single battle.
- **The sides are not mirrors.** Ukraine has people, public support, civilians to protect, and Western aid; Russia has Geran waves, glide bombs, Iskanders, North Korean infantry, and defections to worry about. Each side's strategy is different because its constraints are.

Fourteen teaching levels walk through it one idea at a time: moving in column, capturing towns, flying and recharging drones, postures like ambush and hull-down, artillery and counter-battery fire, jamming, the pipeline, the power grid, night fighting, and the deep strikes that end a game. Skirmishes against the computer and matches against another commander put it all together. The units, their prices, their ranges, and the wider rules are simplified for play, but every mechanic stands for something that is really being used on that front.

## Run it locally

Prerequisites: .NET SDK 10, Node 22.

```bash
# terminal 1: API + SignalR on http://localhost:5080
dotnet run --project server/GreyZone.Server

# terminal 2: Vite dev server on http://localhost:5173 (proxies /api and /hubs to 5080)
cd client && npm install && npm run dev
```

Or start both with one command from the repository root: `.un-local.ps1` on Windows, `./run-local.sh` on macOS and Linux.

Open http://localhost:5173, create an account, and play. Accounts live in a local SQLite file (`greyzone.db` under your home directory's `data` folder), so any username and password work the first time. For a two-player test open a second browser tab (the login token is per tab, so each tab can be a different player), create a second account, and have both tabs join the queue in the lobby.

No .NET, or only interested in the solo game? Run the client alone (`cd client && npm run dev`) and press **Play offline** on the sign-in page: the levels and skirmishes run entirely in the browser; only the lobby and the game log need the server.

## Where things are, and how to change them

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the layout of the code and how the simulation, the frame, and the server fit together.
- [docs/MODDING.md](docs/MODDING.md): step by step, how to add a troop, a building, a level, or a map, and how to test it from the terminal.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): the REST and SignalR contract between client and server.

The short version: the tables are in `client/src/game/data/` (units, buildings, research, postures, rules), the maps are `client/src/game/maps/`, the levels are one file each in `client/src/game/levels/`, and the rules are the files in `client/src/game/sim/`.

Developer commands, all in `client/`:

```bash
npm run check                          # type-check, validate the tables and levels, and check determinism
npm run validate                       # just the tables and levels
npm run sim:play -- unit fpv           # drop one unit against a few enemies and see it fight
npm run sim:play -- level jam          # play a level headless for three minutes
npm run sim:play -- skirmish --minutes 5 --map sumy
npm run sim:check                      # the simulation must be deterministic for multiplayer
npm run format                         # prettier
```

## How multiplayer works

Both players run the same simulation from the same seed. The server never simulates: every 100 ms it closes a turn, orders the commands it received from both players, and broadcasts them. Each client applies that turn's commands and advances the simulation six ticks. Clients hash their state every 50 turns and the server flags a desync if they differ. A disconnected player has 60 s to reconnect; the server replays the missed turns on rejoin.

## Production build

The server hosts the built client from `wwwroot`:

```bash
cd client && npm run build
rm -rf server/GreyZone.Server/wwwroot && cp -r client/dist server/GreyZone.Server/wwwroot
dotnet publish server/GreyZone.Server -c Release -o publish
```

Configuration (environment variables or `appsettings.json`):

| Setting | Purpose |
|---|---|
| `Jwt__Key` | signing key for login tokens, at least 32 characters (a random one is generated at startup if missing, which logs everyone out on restart) |
| `ConnectionStrings__Default` | SQLite connection string; defaults to `Data/greyzone.db`, or `$HOME/data/greyzone.db` on Azure |
| `PORT` | listen port (App Service sets it) |

WebSockets must be enabled on the host for SignalR.

## Deploy to Azure App Service

`deploy/github-workflow-deploy.yml` is a GitHub Actions workflow that builds the client, publishes the server with the client inside, and deploys to the App Service named in `AZURE_WEBAPP_NAME` on every push to `main`. To enable it, copy it to `.github/workflows/deploy.yml` (pushing workflow files needs a GitHub token with the `workflow` scope: `gh auth refresh -h github.com -s workflow`) and add one repository secret, `AZURE_WEBAPP_PUBLISH_PROFILE`, containing the app's publish profile (`az webapp deployment list-publishing-profiles --xml`).

Manual deploy from a machine with the Azure CLI:

```bash
cd client && npm run build && cd ..
rm -rf server/GreyZone.Server/wwwroot/* && cp -r client/dist/. server/GreyZone.Server/wwwroot/
dotnet publish server/GreyZone.Server -c Release -o publish
cd publish && zip -r ../deploy.zip . && cd ..
az webapp deploy --resource-group greyzone-rts-rg --name greyzone-rts --src-path deploy.zip --type zip
```

## Controls

Left-drag selects, right-click moves or attacks, `Z X C V B` produce from a selected factory, `F` dives kamikaze drones at the nearest target, `G` forms a swarm, `E` digs in, `O` adds a person to the selected squad as a drone operator (Shift+O removes one), `B` or Ctrl+right-click fires artillery at a map point, `T` opens research, `M` the manual (its "Two armies" tab lists every difference between the sides and what the troops shout), `K` the battle log, `L` the legend, `N` cycles sound (effects and voice, effects only, off), Space jumps to your headquarters, Enter opens chat in multiplayer. The full list is in the in-game manual.
