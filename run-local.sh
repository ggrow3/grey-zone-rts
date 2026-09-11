#!/usr/bin/env bash
# Start the game on this machine: the C# server on http://localhost:5080 in the background, then the Vite dev
# server. Open http://localhost:5173 when both are up. Ctrl+C stops both. Needs the .NET SDK (10) and Node (22).
set -e
root="$(cd "$(dirname "$0")" && pwd)"
[ -d "$root/client/node_modules" ] || (echo "== installing client packages" && cd "$root/client" && npm install)
echo "== starting the game server on http://localhost:5080"
dotnet run --project "$root/server/GreyZone.Server" &
server=$!
trap 'kill $server 2>/dev/null' EXIT
echo "== starting the client at http://localhost:5173"
cd "$root/client" && npm run dev
