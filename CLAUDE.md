# Lyoko Minigolf

A browser minigolf party game for friends, not for distribution. It's inspired by Putt Party and themed on Code Lyoko.
- **Repo:** https://github.com/huidobroeloy/minigolf (public).
- **Hosting:** GitHub Pages deploys from `main`.
- **Commits:** commit and push after each milestone. The owner plays the Pages build on a phone and a computer.

## Hard rules
- **Public repo, so no copyrighted assets.** Every model, texture, portrait and piece of music is generated in code:
  - meshes and canvas textures
  - `src/ui/portraits.js` pixel art
  - `src/core/music.js` sequencer

  Never add show images, logos or the Lyoko theme. The owner's own music (show audio included) is loaded by them in
  Settings → Soundtrack: it lives in their browser's IndexedDB and streams host → guests at runtime. It never goes in the repo.
  Reference material lives in the gitignored `.local/` folder (never commit it):
  - `.local/lyoko-intro.mp4`: the opening (style reference for the intro).
  - `.local/monsters.mp4`: every monster moving, shooting and its abilities.
  - `.local/refs/*.webp|jpg|gif`: named monster screenshots and renders (blok, creeper, hornet, kankrelat, krabe, tarantula,
    manta, megatank closed/open/beam, scyphozoa). `.local/refs/earlier/`: the first batch of screenshots.
- **No build step.** Plain ES modules with an importmap in `index.html`. Dependencies come from jsDelivr:
  - Three.js 0.186.1
  - Rapier3d-compat 0.21.0
  - PeerJS 1.5.5 (UMD)
  - MQTT.js 5.10.1 (ESM, imported by `src/net/relay.js` only when the relay is used)
- **Git identity is repo-local:** `huidobroeloy` / `197536980+huidobroeloy@users.noreply.github.com`.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No shortcuts.** No warp pipe or other route may skip a hole's lane or drop the ball near the cup (the owner removed
  the old red secret warps for this). Aces are not required; where one is possible it must stay rare (≤1.5% of the
  search grid, see below).

## Running locally
- **Dev server:** `python tools/devserver.py` (no-cache headers, so ES modules don't go stale). It's served on port 8766; the launch config is "minigolf-dev".
- **Debug flags:** `?hole=N` jumps to a hole in solo; `?debug=1` exposes these globals:
  - `__app`, `__holes`
  - `__sim(def, {yaw, power, t0, trace})`
  - `__hio(index, opts)`
  - `__hioAll()`, which writes its results to `localStorage['lyokogolf.hio']`
  - `__rampTest()`: flags balls stopped or hovering on ramps
  - `__cupWalls()`, `__cupTest({ holes })`: cup regression checks (see Physics)
  - `__monsterAudit()`: rolls balls at every monster type and parks a resting ball in a walker's path (see Monsters)
  - `__greenAudit({ holes })`, `__puttAudit({ holes })`: how easy each hole is from where its lane joins it, and
    how guarded each cup is (putts from 3 units)
  - `__holeMap(i | def)`: a top-down SVG of a hole, for design reviews
- **Screenshots when the pane is hidden:** `computer` screenshots time out. Instead render a frame, then
  `canvas.toBlob` → `fetch('/__shot?name=x', {method:'POST', body})`; the dev server saves `.local/shots/x.png`.
- **Ace searches are CPU-heavy:** 3–4 tabs in parallel make the shell and ripgrep time out; use Read/Edit meanwhile.
- **Hidden or small browser pane:** `requestAnimationFrame` pauses. Step frames by hand with `__app.frame(dt)`.
- **Tooling and shell quirks:**
  - `node` is not installed.
  - Inline heredocs with quotes break in Git Bash. Put patch scripts in the scratchpad as `.py` files and run them.

## Architecture
- **Networking** (`src/net`):
  - `HostRoom` runs in the host's browser and is authoritative for the room, scores, pickups and power-ups.
  - Remote players connect over PeerJS. `ice.js` lists the STUN servers plus the public PeerJS TURN server.
  - **Relay fallback** (`relay.js`): phones on mobile data often can't link directly (carrier NAT, unreliable public
    TURN). `joinPeer` (`transport.js`) tries the direct link, and after `RELAY_AFTER` (6 s), or once ICE fails, also
    `joinRelay`; the first to open wins (whole join `JOIN_TIMEOUT` 30 s, one retry on `peer-unavailable`).
    - The host's `hostRelay` listens on every broker in `BROKERS`: shiftr.io public on 443 first, then EMQX and HiveMQ.
      Topics are `lyokogolf-v1/<CODE>/h` (guest → host, `{f, k: hello|m|ping|bye, m}`) and `/g/<id>` (host → guest).
    - Relayed ids start with `r-`; the room keeps them in `room.relayed` (`relay` flag in the player list, 📡 in the
      lobby) and doesn't stream the soundtrack to them. The host drops a relayed guest after 20 s of silence.
  - **Host keep-alive** (`hostPeer`): a phone suspends the tab when the host switches apps, which drops the PeerJS
    server link (the server forgets the code after ~1 min: guests got "not found"). On `disconnected`/errors and on
    `visibilitychange`/`online`/`pageshow` it calls `peer.reconnect()` with backoff; if that isn't open within 5 s, a new
    Peer takes the same code and the old one stays alive (`ctl.old`) for guests already linked. The lobby shows
    `ui.setRoomStatus` (🟢 open / 🟠 reconnecting). `app.keepAwake` holds a screen Wake Lock while hosting.
  - Test it headless with two browser contexts through the agent proxy: a normal join, a guest with `RTCPeerConnection`
    forced to a dead relay-only TURN (it must join through the relay and play), and the host's socket closed or its
    peer disconnected (it must re-open the same code).
  - `LocalLink` is used for solo play and for the host's own client.
  - Each client simulates only its own ball and broadcasts it at 15 Hz. Other balls are ghosts, with no ball-to-ball collision.
  - Global hazards are deterministic from a seed plus a start time.
- **Physics** (`src/physics`):
  - Rapier, fixed 120 Hz timestep.
  - The ball has zero friction. Rolling deceleration is custom, per surface (`SURFACES` in `world.js`; `glass` is the low-friction surface on the Fortune Falls board).
  - Ground snap is skipped while `launchTimer` is running.
  - **Real cups:** on a flat floor the builder cuts a hole (`CUP_R` 0.36, ball 0.18) into the slab, adds a solid
    liner (a ring of 24 box colliders, `kind: 'floor'`) and a bottom, `CUP_DEPTH` deep. The ball drops in physically
    (rim pull for slow balls, lip-outs for fast ones). In `Ball.postStep` a ball whose centre gets below the floor
    inside a cup it reached over the rim (`rimCup`/`rimT`) is holed at once, before any fall/lava/pit check, and is
    put back on the bottom if it slipped into the wall. Cups not on a flat floor (Fortune trays, bowls) keep the
    formula capture (`cup.physical` false). The cup is drawn as a glowing XANA tower shaft (`makeCupAt`).
  - **Floor slabs are one-sided trimeshes** (`FIX_INTERNAL_EDGES`). `slabGeometry` forces the outline counter-clockwise
    and holes clockwise so hole walls face into the hole. A wall facing into the slab pushes the ball through it:
    that was the v6 "ball goes in the cup, then into the Digital Sea" bug. Check with `__cupWalls()` (must be 0
    bad) and `__cupTest()` (rolls at every real cup with normal, ghost, fun-size and super-size balls; must report 0
    leaks and 0 super-size holes).
  - Ramps: a ball only rests on a slope when `slopeAcc < decel`; otherwise rolling resistance is capped at half the slope
    pull, so it rolls off decisively. Sticky walls only grab on head-on impacts, never right after a shot.
- **Holes** (`src/holes/<sector>.js`):
  - Hole data is a list of parts: floor, ramp, wall, box, cyl, bumper, mover, zone, crumble, teleport, warp, tube, bowl, monster, deco.
  - **Floor walls have tall invisible colliders** (about 1.2 above the visual). Any floor edge a ball arrives at through the
    air (jumps, launchers, bubble lifts), or that a tube or ramp passes through, must be listed in `open`.
  - Movers, crumbles and ramps are separate parts. Raise everything standing on a raised floor with its `y`.
  - `src/course/builder.js` turns the data into meshes and colliders.
  - Motion helpers are in `holes/helpers.js`: patrol, orbit, spin, elevator, shuttle, loop, kicker.
  - Zones: conveyor (clamps speed to the belt), boost (`align` option), vent (geyser launch; keeps the ball's own speed with a
    minimum; at most `MAX_VENT_LAUNCHES` = 2 per shot, `ball.ventLaunches`), wind (`minSpeed`: slower balls are left alone),
    slow, current (pushes along its flow only), bubble (steady lift, `push` near the top), lava (a fall).
    Add `hidden: true` for no visual. Floor movers take `safeRim: true` (pulsing orange rim: volcano-2's rafts). Volcano vents
    smoke and glow as the local ball nears (`setNear`); the biggest volcano lava rects get flickering PointLights (≤3).
  - Parts: `warp` (exit speed is max(entry, `speed`)), `tube` (glass duct), `bowl` (cone ring). `def.water` gives floaty air.
  - Extra finishing cups: `cups: [[x,y,z],…]`. Use `course.nearestCup(p)` and `ball.sinkCup` instead of `course.cup` when the cup that was hit matters.
  - Courses (`COURSES` in `holes/index.js`): Desert, Forest, Ice, Mountain, Sector 5, Volcano Replika, Digital Sea,
    Network, the Cortex (`holes/cortex.js`), Carthage · The Core (`holes/carthage.js`, sector `carthage`), Skidbladnir ·
    The Depths (`holes/skid.js`, sector `skid`, all `water`) and Fortune Falls Casino, 6 holes each (72). `buildPlan(format)` keeps each
    course together, in random course order. **Fortune Falls (`LUCKY`) is not in the World Cup or the random cups**: it
    only plays in the `lucky` format ("Feeling Lucky"). `HOLES` ends with the Kolossus boss (`holes/boss.js`, sector
    `core`, `BOSS_INDEX`): the World Cup is the 11 other courses + the boss (`worldCupLength()`, 67 holes). A new course
    needs entries in `themes.js`, `ROSTER`/`FLAVOUR` (`extend.js`), music `STYLES`, the sector map (`ui.sectorMap`) and the
    per-sector colour tables (`lyoko.js`, `builder.js` slow zones, `renderer.js` sea, `post.js` bloom).
  - **Hand-made openings** (replacing the generated lanes course by course, owner-reviewed): a hole's
    `opening: { parts, tee, route, par, time }` is laid out behind its old tee floor (z below that floor's back edge,
    which `attachOpening` in `extend.js` opens); `route` runs from the new tee to the old start; `par`/`time` add to the
    hole's. `opening: false` keeps a hole on its own. Each design starts from a one-page brief (decision, risk and
    reward, set piece, lore moment from `docs/lore.md`) and a review page of `__holeMap(i)` SVGs (`src/dev/holemap.js`:
    top-down floors by height, ramps, zones, monster paths, tee, cup, route; the opening outlined in cyan).
    Done: Desert (The Bridge, Megatank Crossing, Column Canyon, Tarantula Flats; desert-3 and desert-6 stand alone),
    Forest (The Cut Path, Hollow Stump, Three Paths; forest-1, -3 and -6 stand alone).
  - **Approach lanes** (`holes/extend.js`, `lengthenOne` in `holes/index.js`), for the courses not yet redesigned: every non-Fortune hole gets a winding
    lane in front of its old tee, with hazards per sector and extra shooters (≥2 per hole). Holes up to par 4 get a
    long lane (`SHAPES` S/Z/U/L/zig/hook, ≈41–55 units, +2 par, +60 s); par-5 holes a short one (suffix `0`, ≈22–40,
    +1 par, +30 s). If a lane would cross the hole, the next shape (or mirror) that fits is used, falling back to the
    short shapes with a `[lanes]` console warning. forest-3 (round floor) has no lane. `APPROACH` takes per-hole
    `{ shape, mirror }` overrides. Lanes have **no warps**: the only warps left are sea-3's green pipe maze, which is
    the hole itself (every exit ≥6 from the cup). (Way towers were tried and removed at the owner's request.)
    Lane lava gutters and water currents only go on straight legs (a diagonal leg's box would cover the whole bend);
    currents stop 0.9 short of the walls and 0.6 short of each corner, so they never chain down the whole lane;
    lane winds have `minSpeed: 0.5`. Volcano legs without a gutter get a `magma` monster (`MagmaBombs`: a seeded bomb
    every 6–9 s, ring telegraph 1.5 s, 20 LP + knock, `canTarget` rules).
  - **Monster rosters** (`ROSTER` in `extend.js`): each sector's typical lane monsters. `rollMonsters(def, seed)`
    (`holes/monsterRoll.js`) re-rolls lane monsters each match (`lane` slot on the spec, `laneMonster`), ~30% guests
    from other sectors, and may swap one hand-placed walker (kankrelat/blok/tarantula). Ninjas only appear in the Cortex,
    Kalamars and Sharks only in the Digital Sea. Seeded from the host's hole
    seed, so every client builds the same monsters in the same order; the client loads `rollMonsters(HOLES[i], seed)`.
  - Fortune cups carry a `mod` (strokes added on holing out); Fortune pits roll a random penalty.
- **Power-ups** (`src/powerups`):
  - `registry.js` holds the 48 power-ups (including one per character) with their weights and catch-up luck. From the new
    courses: `torpedo` (one: homing knock + 15 LP after 1 s), `coreshield` (self: `client.coreShield` absorbs the next
    monster hit in `onMonsterHit`), `quake` (global: each client shoves its own ball, seeded per player), `maraseed` (place:
    a 20 s Marabounta in `effects.swarms` with `creep: true`, whose force runs in `effects.forces`).
    Pickup halo colours: self blue, sabotage amber `#ffc21a`, chaos purple. **Never red** (red is the XANA tower cup).
  - `lyoko: true` marks the show's power-ups; the room setting `puSet: 'lyoko'` (lobby "Power-up set") spawns only
    those. It combines with any mode.
  - `hazards.js` covers wind, tornado, volcano, tsunami and the like.
  - `effects.js` holds the per-client effects manager.
  - You can hold up to 3; a 4th is discarded. Pickups respawn, and the host's power-up setting scales how many appear.
- **Game client** (`src/game/client.js`): aiming, the power drag, aerial targeting, celebrations, the camera and the HUD hooks.
  - **Auto-stop** (`watchStuck`, `AUTO_STOP` 15 s): a ball still moving 15 s after the shot is frozen in place if it's
    grounded on safe, still floor, else `respawnAtSafe()`, no penalty. There is no Reset button any more.
  - **Hole preview** (`makeFlyover`/`flyPath`): on holes with a `def.route` the camera flies from the cup back along the
    route to the tee, 6 over the raycast ground (rebuilt each frame until the physics world has stepped), 3.5–6 s, then
    blends behind the ball. It holds while `ui.mapOpen`; `skipFlyover` ignores the tap that closes the map card.
- **Other `src/game` files:**
  - `characters.js`: the 8 characters (ball textures and colours).
  - `finale.js`: the winner animation, where Aelita reaches the tower. `xanaFinale.js`: the catastrophe when XANA wins.
  - `intro.js`: the match intro, after the host clicks Start (pref `intro`; host skip ends it for everyone via `skipIntro`).
  - `stats.js`: per-device stats, achievements and trails. `src/ui/comms.js`: Jérémie's lines (8 s global cooldown).
  - `season.js`: the season cabinet in the host's browser (`localStorage['lyokogolf.season']`). The client records
    each multiplayer `final` once (deduped by the room's `finalMsg.at`); players are keyed by trimmed lower-case name;
    finish points `FINISH_POINTS` 10/7/5/3/1; export/import (merge by `at`) and new season. `ui.showSeason()` from the
    menu and the host's lobby (🏅 Season). Each match also keeps `ids`/`pars` and each player's `scores`/`falls` (the room
    counts falls per hole in `p.falls`); `season.holeTable()` drives the Holes table (avg, ±par, spread, falls per hole),
    the real-play check for hole redesigns.
- **Other `src/fx` files:** `towerCup.js` (tower hologram over cups + the trip inside), `weather.js` (seeded per sector
  from the hole seed and the shared clock), `vehicles.js` (Overbike, Overboard, Overwing meshes), `dissolve.js`
  (`client.dissolve`: one InstancedMesh of additive pixel cubes; `burst(p, color, { r, reverse })` on devirtualize,
  vaporize, falls, and reversed in `virtualize()` and the rewind; half the cubes on Low quality).
- **Sector atmosphere** (`src/course/deco.js`): `ATMOS` per sector `{ shaft, n, a, horizon }` drives `atmosphere()`:
  breathing additive light shafts and a horizon glow cylinder; `lowQuality()` halves the shafts. Carthage and Skid have
  their own scenery branches.
- **Modes** (`settings.mode` in the room): `ffa`, `teams` (average total; XANA's player is always on XANA's side),
  `elim` (3+ players; worst course subtotal is eliminated after each course, `p.out`, they spectate),
  `relay` (teams, one ball each: `room.turns[team] = { order, shooter, pos, strokes }` in `holeMessage.relay`; the
  shooter's `st` sets the whole team's strokes/pos; at rest the client sends `relayRest` and the room's `passTurn`
  broadcasts `turn`; waiting players hide their ball (`state 'gone'`, `client.relayWaiting`) and watch the shooter; a holed
  shot holes the team; standings like `teams`) and `hunter` (3+ players: `p.hunter` rotates per course, XANA's player
  first; the hunter has no ball, `client.hunter.energy` (8/s, max 100) pays for `HUNTER_TOOLS` agent 60 / creativity 25 /
  volcano 35 / swarm 40 as slots `H:id`, keys 1–4; the room refunds traps within 3 of a cup or tee (`refund` with
  `hunter: true`); `golfers()` excludes the hunter; the hunter's hole score = round(mean of the others) − min(3,
  floor(their damage taken / 40)), damage tracked from `st` LP drops in `p.dmg`).
- **Return to the Past** (all modes): one free rewind per course in the ⏪ slot (`'R'`, key 5): `fireShot` snapshots
  `preShot` (pos, safe spot, strokes, LP, inventory) and `rewindShot` restores it all; the room stores the course in
  `p.rewindUsed` (like `specialUsed`). The `returnpast` power-up still exists (it keeps the stroke).
- **Special moves:** `SPECIALS` in `registry.js`, one free use **per course** from the ★ slot (`client.special`, slot
  `'S'`; the room stores the course it was used on in `p.specialUsed`, so reloads and rejoins keep it). Balanced for fairness: Scanner shows only up to the first bounce
  (≤8 units, no landing ring), Telekinesis ≤1 unit and never within 1.5 of a cup, Sprint ×1.35, Wings 1.8 s, Hopper
  10 s immunity, Zweihänder 25 s / range 3, Activate Tower spares XANA's own ball (`course.calmUntil`, checked in `canTarget` and `landHit`).
- **Life points:** cumulative: they carry over from hole to hole (the room keeps `p.lp` from the `st` messages, so
  reloads keep them) and refill to 100 at each new course. `DAMAGE` in `monsters/attacks.js`; `landHit(course, kind,
  t, dmg)`; kind `vaporize` devirtualizes outright. `client.showLP` puts `body.lp-critical` (red screen) on when LP ≤
  `maxHit`, the hole's hardest ordinary hit (one-shot attacks ≥80 don't count).
- **Power-up modes** (`settings.puMode`): `pickups` (default), `draft` (first hole of each course: the room offers each
  player 1 of 3, one per category; `draft`/`draftPick`/`drafted` messages, auto-pick after 12 s), `mirror` (one
  `rollAny` item per hole for everyone in `holeMessage.mirror`, no pickups).
- **XANA's Agent** (`agent` power-up): takes over a monster for 12 s (`m.agent`, `Monster.at` returns the steered
  position). The driver's client picks the monster index (`agentTargetAt`), steers it (`steerAgent`) and relays
  `agentPos` at 15 Hz; it fires twice as often and never at the driver. `AGENT_PROOF` lists monsters it can't take.
- **Marabounta takeover** (`holes/swarmEvent.js` + `monsters/swarm.js`, canon: ep 36, Jérémie's runaway program):
  `rollSwarm(def, seed)` gives 1 in 8 Forest/Mountain/Sector 5/Carthage holes (never with a boss) a swarm at 20 s.
  The front runs along `def.route` from the mother cell (2 behind the tee) to the cup in `max(90, 0.6 × time)` s,
  with a ragged ±1.2 edge; `covered(x, z, t)` is a pure function of the hole clock, so clients agree with no messages.
  It cuts out every non-boss monster it reaches (`effects.cutOut`), slows rolling balls (zone decel ×2.5), and a ball
  resting in it for 2 s is devirtualized (+1, LP 100) and rematerialized on the route just ahead of the front
  (`spawnAhead`, never past cup − 2.5). Once the front passes the cup (`full`), anyone not holed sends `swarmed`: the
  room scores them like a timeout (`timeoutScore`) and marks them done. Dark instanced icosahedra, red as they hatch.
- **Boss events** (`holes/bossEvent.js`): `rollBoss(def, seed)` gives ~1 hole in 6 (not Fortune or the boss hole) a
  boss at 20 s: `kolossus` (`kolossusRoam`, stomp every 7–9 s, ring 1.5 s, r 2.6, 25 LP + knock, solid feet),
  `scyphozoa` (the Scyphozoa at `scale` 1.8, drops the ball at the old tee) or `megatanks` (3). `client.spawnBoss` walks it
  on a seeded `loop` over the green (the floor holding the cup), with waypoints ≥3 and every segment ≥2.5 from any cup,
  via `course.addMonster`. Pure client-side and deterministic from the hole seed and clock; no room messages.
- **Sector map:** `ui.sectorMap` replaces the course card at each new course (SVG drawn in code, tap to skip).
- **Monsters** (`src/monsters`): `attacks.js` has the shared telegraphed guns, mines, hit cooldown and resting-ball grace.
  **What you see is what you hit:** every visible monster has a collider that matches its model and follows it
  (bob and dive included, `kind: 'obst', monster: true` in the physics meta); a ball always bounces off it and a walking
  monster pushes a resting ball. By design: Krabe and Tarantula let a ball roll under the belly between their solid
  legs, Scyphozoa's tentacles grab (its bell is solid). `__monsterAudit()` must report `ok` for every type.
  Show upgrades: lane Creepers are `WallCreeper`s (`spec.wall`: patrol along the lane's side wall top, laser/charged
  down; `laneMonster` builds it from the slot). Scyphozoa's grab uses `canTarget` and sets `out.tpBy`; the client's
  `onGrabbed` steals a random held power-up. The `marabounta` monster class (seeded 26 s patch: drags rolling balls,
  5 LP/s on a resting one) now only comes from the `maraseed` power-up.
  Never let a monster fire at a ball whose owner is aiming. Show-faithful kits (`docs/lore.md`; `DAMAGE` follows
  codelyoko.fr's numbers): Kankrelat weak frequent laser; Hornet laser (20)/charged/acid puddle (slows + venom)/dive
  strafe; Blok laser/ice freeze/fire ring (60)/rapid; Krabe laser (40)/charged (60), two together fire the combined beam
  (60); Tarantula leads rapid volleys (25); Creeper laser (40); Megatank opens for the blade beam (the only devirtualizing
  attack left besides grabs/fists), running a ball over costs 50; Manta laser strafes and mines (60 LP + blast, every
  12–18 s, max 2 live), and its wing gust only pushes moving balls (≥0.6), one 0.3 s gust per pass; Shark laser, ram and
  slow homing torpedoes; **Kongre** (Sea/Skid, also in their rosters): eels in packs of 3 (`kongres(a, b, period, y, n)`
  in `sea.js`/`skid.js`), double eye laser (burst 2, 20 each); **Kalamar**: laser, and its pincers grip a ball that gets
  in front of it (`claws(t)`), drag it 1.6 s and fling it (15 LP, once per 9 s); Ninja (Cortex) dash + sword slash (25)
  and palm laser; **Guardian**: an orange prison sphere (4 s trap), only on Ice and Mountain holes (ice-5, mountain-6).
  **XANA-eye weak point:** a ball faster than `WEAK_SPEED` (6) hitting a monster devirtualizes it for 20 s (+5 LP) via
  `effects.cutOut` (client.js `checkWeakPoints`, not bosses/Guardians), but only from the side its eye is on
  (`EYE_SIDE`: front for most, the back for the Krabe; a toast says where to aim); a Creeper dies to any hit (≥1.5).
  **Kolossus finale** (`KolossusBoss`): two weak points, as in ep 94: the glowing eye low on its leg (`ankle`) and its
  blade, planted and glowing for `PLANT` 3.5 s after each slam (`planted(t)`, its own collider); hit both within
  `BOSS_BOTH` 8 s and it kneels for 15 s.
- **Odd's shield** (season 2+): Odd's ball blocks the first monster hit of each course (`client.oddShield`, HUD chip 🛡️).
- **Music** (`src/core/music.js` + `soundtrack.js`): a slot (intro, menu, levels, finale, xana) with a loaded file plays it;
  otherwise the procedural style plays.
- **UI** (`src/ui/ui.js`, `css/style.css`): arcade character select, VS intro, HUD, awards.

## Lore
`docs/lore.md` is the canon reference (cited: codelyoko.fr, the French episode guide, Wikipedia; Fandom refuses
automated reads). Check "from the show" changes against it, and keep its gap table up to date when a row is done.

## Rules the owner chose
- **Every fall is a devirtualization** (sea, lava, void, black hole): +1 stroke, LP back to 100, rematerialized at the
  last safe spot (`onFall`/`onSwallowed` in `client.js`).
- **Time limit:** per hole (`time`, by par). Running out scores `max(par, strokes)` + 1…8 by the share of the track
  still left (`timeoutScore`/`trackLeft` in `room.js`, along `def.route`), so it always pays to keep playing.
- **Ties:** never shared — countback (last 3, last hole), most aces, then a closest-to-the-pin playoff.
- **Players:** everyone plays simultaneously, up to 8.
- **Power-ups after holing out:** power-ups that affect others can still be used.
- **Camera:** three views cycled with C / 🎥: low chase (default), first-person POV, zoomable aerial.
- **Characters:** Ulrich, Odd, Yumi, Aelita, William, Jérémie, Franz Hopper, XANA, one per player, picked in the lobby.

## Hole-in-one checking
Aces are no longer required (the secret warps that were every lengthened hole's ace route are gone). If a change makes
a hole too easy to ace (more than ~1.5%), the usual causes are: a deterministic funnel (bubble lift, boost or launcher
whose output doesn't depend on the shot) pointing at the cup; a wall or pillar just behind the cup bouncing overshoots
back in; a round bank around the cup. Fix with an off-line cup, a lava strip or sinkhole behind the cup, or straight walls.

Check with `__hio(i, { yawRange: 60, yawStep: 2, pMin: 0.12, pMax: 1, pStep: 0.05, t0s: [0, 2.1] })` (2196 simulated
shots, about 2–5 minutes per hole). To trace a route use `__sim(def, { yaw, power, t0, trace: true })`.

## Stuck-ball probe
Balls never wedge; the old "stuck" bug was balls that never stop (geyser juggling, Manta gusts, lane currents
and winds). After changing zones, vents or monsters that push, roll random shots from points along the track with
`__sim` and count shots still moving after 20 s: aim for 0 on Volcano and Mountain and ≤1 per hole elsewhere
(the 15 s auto-stop covers the rest in game).
