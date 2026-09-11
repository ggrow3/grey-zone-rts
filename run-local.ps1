# Start the game on this machine: the C# server on http://localhost:5080 in a second window, then the Vite dev server.
# Open http://localhost:5173 when both are up. Needs the .NET SDK (10) and Node (22); see README "Run it locally".
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path "$root/client/node_modules")) {
  Write-Host "== installing client packages"
  Push-Location "$root/client"; npm install; Pop-Location
}
Write-Host "== starting the game server (its own window; close it to stop)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "dotnet run --project '$root/server/GreyZone.Server'"
Write-Host "== starting the client at http://localhost:5173 (Ctrl+C stops it)"
Push-Location "$root/client"; npm run dev; Pop-Location
