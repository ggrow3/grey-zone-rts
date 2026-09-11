# Adding units, buildings, levels, and maps

Everything the game knows about its units, buildings, research, levels, and maps is a table in
`client/src/game/data/`, a file in `client/src/game/levels/`, or a file in `client/src/game/maps/`. This page
walks through adding a new troop, a new level, and a new map, and how to check the result without opening
the browser.

All commands below run inside `client/`:

```bash
cd client && npm install
```

## The tools

| Command | What it does |
|---|---|
| `npm run validate` | Checks the tables, maps, and levels for mistakes the compiler cannot see: a unit whose factory does not list it, an unknown shape, a civilian site at a place that is not on the map, a level that names a site that does not exist, an objective that throws or is already complete at the start. Runs every level's script and a few seconds of play. |
| `npm run sim:play -- unit <type>` | Drops one unit in the open against a squad, an IFV, and a radar post and reports what it shot and what it killed. The quickest way to see a new troop fight. |
| `npm run sim:play -- level <id>` | Plays a level headless for three minutes with the bot as the enemy and prints which objectives the situation completes on its own, the armies, and the last log lines. |
| `npm run sim:play -- skirmish --map sumy` | Bot against bot on a map; a status line each minute. |
| `npm run sim:check` | Runs twenty scripted games twice and checks the two runs agree: the simulation must be deterministic for multiplayer to work. |
| `npm run check` | Type-check, validate, and sim:check in one go. Run it before committing. |
| `npm run build` | Type-check and bundle the client (what the deploy does). |

`npm run sim:play -- list` prints the level ids, unit keys, start names, and map ids you can pass.

## Adding a troop

A unit is one entry in `UNITS` in [client/src/game/data/units.ts](../client/src/game/data/units.ts). The entries are
grouped by category (troops, quadcopters, fixed wing, vehicles, artillery, logistics, Geran waves) and every
field is documented on the `UnitDef` interface at the top of the file.

1. **Copy the closest existing entry** and give it a new key. Keys are camelCase and are used everywhere
   the unit is referred to (`'fpv'`, `'howitzer'`). Fill in `label` (the name each side sees), `shape`,
   `r`, the production fields (`factory`, `cost`, `crew`, `time`), toughness (`hp`, `speed`), `vision`,
   and the weapon (`range`, `dmg`, `rof`, `targets`, and the `vs...` multipliers). Leave out what does not
   apply; every optional field has a default.

2. **Let its factory build it.** Add the key to the `produces` list of the building in
   [structures.ts](../client/src/game/data/structures.ts). The position in that list is the hotkey
   (Z X C V B H J U I); a factory can list at most nine units. `side: 0` or `side: 1` on the unit makes it
   Ukrainian or Russian only; the other side's factory hides the button.

3. **Give it a silhouette.** `shape` must be one of the names in `SHAPES` in
   [client/src/game/render/shapes.ts](../client/src/game/render/shapes.ts). To draw a new one, add a
   `case` to `shapePath` (the outline) and optionally `shapeDetail` (the markings), and add the name to
   `SHAPES`. Add the key to the list in [render/legend.ts](../client/src/game/render/legend.ts) if it should
   appear in the legend panel (L).

4. **Optional extras.**
   - Postures (R): map the key to a posture set in `MODE_SET_OF` in [modes.ts](../client/src/game/data/modes.ts),
     or add a new set to `MODE_SETS`. The effect of a posture is wherever the simulation checks
     `g.modeOf(u) === '<key>'`.
   - Fuel: gasoline vehicles and aircraft go in `FUEL_USERS` in units.ts.
   - The bot buys from a weighted table in `botSpend` in [client/src/game/bot.ts](../client/src/game/bot.ts);
     add a row there if the computer should build it.
   - Special rules live in `client/src/game/sim/`: a unit that hunts targets on its own uses `acquire`
     (units.ts), the damage multipliers are applied in `matchup` (entity.ts) and `applyDamage` (combat.ts),
     and how drones are flown by squads is in `needsOperator` and its neighbours in game.ts.

5. **Check it.**

   ```bash
   npm run validate
   npm run sim:play -- unit myUnit
   npm run sim:play -- unit myUnit --vs tank,aa --seconds 90 --side 1
   ```

   The unit report says whether the unit was grounded (a drone with no squad in range), how many shots
   were seen, how much damage it dealt, and what it killed. "Nothing happened" usually means a missing
   `targets`, a `range` of 0, or a drone without an operator.

Then `npm run dev` and try it in the browser: select the factory, press the hotkey, and check the manual (M),
which lists every unit from the same table.

## Adding a building

Buildings are `STRUCTS` in [structures.ts](../client/src/game/data/structures.ts). Add the key to
`BUILDABLE` to put it on the Build tab, give it `cost` and `time`, and a `demand` if it draws power.
A building that makes units gets a `produces` list. Add a `case` to `drawStruct` in
[render/structures.ts](../client/src/game/render/structures.ts) for its picture, and a line in
`BUILDING_NOTES` for the manual. What a building does each tick is in `client/src/game/sim/structures.ts`.

## Adding a level

Each level is one file in [client/src/game/levels/](../client/src/game/levels/), listed in
[levels/index.ts](../client/src/game/levels/index.ts) in the order the home page shows them. The shape of a
level is documented in [levels/types.ts](../client/src/game/levels/types.ts) and the reusable pieces
(spawn squads, "town captured", "units in a posture", "hold for N seconds") in
[levels/helpers.ts](../client/src/game/levels/helpers.ts). The fourteen levels there are the best examples:
`01-boots.ts` is a quiet tutorial, `05-jam.ts` a scripted enemy position, `11-sudzha.ts` an attack on the
Sumy map, `13-psel-night.ts` a night defense.

1. **Copy a level file** to `15-mylevel.ts`. Change the exported constant to `level15` and the `id` to something
   unique; the `id` is what the URL and the progress record use.

2. **Fill in the header**: `title`, `blurb` and `concepts` (shown on the home page), `map` (`'kharkiv'` or
   `'sumy'`, or a map you added), `side` (`UA` or `RU`), `difficulty` (the bot's strength: 0.5 easy, 0.7 normal,
   0.95 hard), `sideNote` (one line in the objectives panel), `briefing` (the narrated lines) with `shots`
   (one map point per line for the camera), and optionally `start: 'night'` or `'winter'`.

3. **`passiveUntil` and `noGeransUntil`**: the bot does not attack, and sends no Geran waves, while fewer than
   this many objectives are complete. `Infinity` keeps it quiet for the whole level; `0` wakes it from the start.
   Tell the player in the objective text when the enemy wakes up.

4. **`scenario`** runs once after the standard setup, before the first frame. It gets the `Game` and can:

   ```ts
   g.capture('Lyptsi', UA);                        // hand a town, gas site, or wheat field to a side
   const L = at(g, 'Lyptsi');                      // a site's position: { x, y }
   const P = place(g, 'Sverdlikovo');              // any named place on the map, not only the sites
   squads(g, RU, 'infantry', L.x, L.y + 20, 3, true); // three dug-in squads (helpers.ts)
   const j = g.spawn('jammer', RU, L.x + 40, L.y); // one unit; the last argument can be an order: MOVE(x, y) or ATTACK(target)
   g.tags.jammer = j.id;                           // remember it so an objective can find it with g.find(g.tags.jammer)
   g.build('radar', UA, L.x + 120, L.y + 90);      // a finished building
   g.grant(UA, 'launchRail');                      // research for free
   g.funds[UA] = 1500;
   g.removeUnit(u); g.removeStruct(s);             // take things off the map quietly
   ```

   Site names are the towns and resource sites of the level's map (`towns` and `resources` in its map file);
   `g.site` throws on a wrong name, which `npm run validate` reports. `hqOf(g, UA)` and `g.map.geo(lat, lon)`
   give map points.

5. **`objectives`**: each has a `title`, the `text` shown to the player, and `done(g, ctx)` returning true when
   the step is complete. `ctx` carries what the simulation cannot see: `camMoved`, `selection`, the chosen
   `formation`, and how many control `groups` are set. Optional: `marker(g)` returns `{ x, y, r }` to draw a
   ring on the map (`town('Lyptsi')`, `own('droneWorks')`, `ring(p, 90)`), and `onStart(g)` runs once when the
   step becomes current (spawn the threat for this step there).

   The helpers cover most conditions: `townOwned(name, team)`, `has(team, type, n)`, `inMode(team, type,
   'scoot')`, `researched(team, key)`, `bombarding(team)`, `piloting(team)`, `unitsNear(g, team, p, r,
   type)`, `structsNear(g, team, type, p, r)`, `kills(g, team, type)`, `townsHeld(g, team)`. For a "hold for N
   seconds" step use `onStart: mark('mylevel:3')` with `done: holdFor('mylevel:3', 90, g => ...)`. Other useful
   reads: `g.stats` (kills, shotDown, kabs, waves, missiles, deliveries), `g.upgrades[team][key]`,
   `g.pipelineIntact(team)`, `g.isNight()`, a unit's `mode`, `ambushed`, `landed`, `waypoints`, `order.amove`.

6. **Register it**: import the file in `levels/index.ts` and add it to the `LEVELS` array.

7. **Check it**:

   ```bash
   npm run validate                       # every level is built and every callback is called once
   npm run sim:play -- level mylevel      # the enemy plays for three minutes; which objectives complete on their own?
   npm run sim:play -- level mylevel --both-bots --minutes 5
   ```

   A step the report marks done straight away probably has a condition the starting position already satisfies
   (the validator refuses those outright). Then `npm run dev`, open the level from the home page, and play it
   through. In development `window.gz` in the browser console holds the running `game`, the `ctl` (controller),
   and the `session`, so `gz.game.funds[0] = 5000` or `gz.session.speed = 3` are handy while testing.

## Adding a map

A map is one `MapData` file in [client/src/game/maps/](../client/src/game/maps/), registered in
[maps/index.ts](../client/src/game/maps/index.ts). Every field is documented on the `MapData` interface in
[client/src/game/map.ts](../client/src/game/map.ts); [maps/sumy.ts](../client/src/game/maps/sumy.ts) is the
smaller of the two examples. Coordinates are latitude and longitude; the projection turns them into pixels, and
every map is the same size on screen.

1. **Copy `sumy.ts`** to `mymap.ts`, rename the constant, and set `id`, `name`, and `blurb`.
2. **`bounds`**: the corners in degrees. Keep the same proportions as the existing maps (a west-east span of
   about 2.8 degrees to a north-south span of 1.05) or the picture stretches. Ukraine must be the southern side:
   the simulation lays out the bases facing each other with Ukraine below.
3. **`places`** are every named point (`[name, lat, lon, size, font]`); size 8 or more gives urban cover. The
   two `cities` are the headquarters and must be in `places`. `labels` are the region captions.
4. **`rivers`** block ground units except where a road or railway crosses them (that makes a bridge), so give
   every river a road across it or the two sides cannot reach each other. `reservoirs` are impassable polygons.
5. **`roads`**: units route along them and move faster on them. `railways` are drawn and make bridges.
6. **`towns`** are the capturable sites (six on both maps; holding all of them for three minutes wins),
   **`resources`** the gas and wheat sites with their starting owners, **`pipelines`** the lines that carry gas to
   a headquarters, with `pumps` as indexes into the line's points where the pumping stations stand.
7. **`civSites`** place the civilian buildings relative to places; `volunteerTowns`, `tradeEdges`, `firstTowns`,
   and `briefing` are the small bits of flavour the simulation and the skirmish briefing read.
8. **Register it** in `maps/index.ts`; it appears in the map chooser on the home page at once.

Check it with `npm run validate` (place names, town names, pump indexes, and the north-south rule), then
`npm run sim:play -- skirmish --map mymap --minutes 6` to watch two bots fight on it: if one side never takes
a town or the trucks never arrive, a river is probably in the way. Then `npm run dev` and look at it.

## Changing the rules

The numbers are in [data/rules.ts](../client/src/game/data/rules.ts) (cover, strikes, power, supply, the
kill zone, score) and the research items in [data/upgrades.ts](../client/src/game/data/upgrades.ts). The
rules themselves are the files in `client/src/game/sim/`; each file's header says what it covers, and
`Game.tick()` in [sim/game.ts](../client/src/game/sim/game.ts) lists the order they run in.

Two things every change to the simulation must respect, because both players in a multiplayer match run
it independently and compare checksums:

- no `Math.random`: use `g.rng` or `g.rand(a, b)`;
- no `Math.sin`, `Math.cos`, `Math.atan2`, or `Math.hypot`: use `dsin`, `dcos`, `datan2`, `hyp` from `dmath.ts`.

`npm run sim:check` catches a slip. When refactoring without meaning to change behaviour, save a digest first
and compare after:

```bash
npm run sim:check -- --write before.json
# ... refactor ...
npm run sim:check -- --compare before.json
```
