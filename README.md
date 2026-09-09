# Grey Zone

A browser real-time strategy game on the Kharkiv to Belgorod border: drones, jammers, trucks, trenches, and two headquarters.
Play three short teaching levels, fight the computer, or match against another commander over the network and talk to them while you play.

- **Client**: Vue 3 + TypeScript (Vite). The whole game simulation runs in the browser as a deterministic lockstep engine.
- **Server**: C# ASP.NET Core (.NET 10) minimal API + SignalR. Accounts (JWT), lobby, matchmaking, chat, the authoritative match turn clock, level progress, and a log of every game played. SQLite via EF Core.

The original single-file prototype is kept as `grey-zone-rts.html`.

## Run it locally

Prerequisites: .NET SDK 10, Node 22.

```bash
# terminal 1: API + SignalR on http://localhost:5080
dotnet run --project server/GreyZone.Server

# terminal 2: Vite dev server on http://localhost:5173 (proxies /api and /hubs to 5080)
cd client && npm install && npm run dev
```

Open http://localhost:5173, create an account, and play. For a two-player test open a second browser tab (the login token is per tab, so each tab can be a different player), create a second account, and have both tabs join the queue in the lobby.

## How multiplayer works

Both players run the same simulation from the same seed. The server never simulates: every 100 ms it closes a turn, orders the commands it received from both players, and broadcasts them. Each client applies that turn's commands and advances the simulation six ticks. Clients hash their state every 50 turns and the server flags a desync if they differ. A disconnected player has 60 s to reconnect; the server replays the missed turns on rejoin.

The rules are in `client/src/game/sim.ts`; the protocol is in `docs/PROTOCOL.md`.

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

Left-drag selects, right-click moves or attacks, `Z X C V B` produce from a selected factory, `F` dives kamikaze drones at the nearest target, `G` forms a swarm, `E` digs in, `B` or Ctrl+right-click fires artillery at a map point, `T` opens research, `M` the manual, `L` the legend, Space jumps to your headquarters, Enter opens chat in multiplayer. The full list is in the in-game manual.
