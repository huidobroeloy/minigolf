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
  - `__tuneWarp(i)`, `__warpEntries(i)`, `__probeWarp(i)`: old secret-warp tuning (unused since the warps were removed)
  - `__rampTest()`: flags balls stopped or hovering on ramps
  - `__cupWalls()`, `__cupTest({ holes })`: cup regression checks (see Physics)
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
    minimum), wind, slow, current (pushes along its flow only), bubble (steady lift, `push` near the top), lava (a fall).
    Add `hidden: true` for no visual.
  - Parts: `warp` (exit speed is max(entry, `speed`)), `tube` (glass duct), `bowl` (cone ring). `def.water` gives floaty air.
  - Extra finishing cups: `cups: [[x,y,z],…]`. Use `course.nearestCup(p)` and `ball.sinkCup` instead of `course.cup` when the cup that was hit matters.
  - Courses (`COURSES` in `holes/index.js`): Desert, Forest, Ice, Mountain, Sector 5, Volcano Replika, Digital Sea,
    Network and Fortune Falls Casino, 6 holes each (54). `buildPlan(format)` keeps each course together, in random course order.
    `HOLES` ends with the Kolossus boss (`holes/boss.js`, sector `core`, `BOSS_INDEX`): the World Cup appends it (55 holes).
  - **Approach lanes** (`holes/extend.js`, `lengthenOne` in `holes/index.js`): every non-Fortune hole gets a winding
    lane in front of its old tee, with hazards per sector and extra shooters (≥2 per hole). Holes up to par 4 get a
    long lane (`SHAPES` S/Z/U/L/zig/hook, ≈41–55 units, +2 par, +60 s); par-5 holes a short one (suffix `0`, ≈22–40,
    +1 par, +30 s). If a lane would cross the hole, the next shape (or mirror) that fits is used, falling back to the
    short shapes with a `[lanes]` console warning. forest-3 (round floor) has no lane. `APPROACH` takes per-hole
    `{ shape, mirror }` overrides. Lanes have **no warps**: the only warps left are sea-3's green pipe maze, which is
    the hole itself.
  - Fortune cups carry a `mod` (strokes added on holing out); Fortune pits roll a random penalty.
- **Power-ups** (`src/powerups`):
  - `registry.js` holds the 44 power-ups (including one per character) with their weights and catch-up luck.
    Pickup halo colours: self blue, sabotage amber `#ffc21a`, chaos purple. **Never red** (red is the XANA tower cup).
  - `lyoko: true` marks the show's power-ups; the room setting `puSet: 'lyoko'` (lobby "Power-up set") spawns only
    those. It combines with any mode.
  - `hazards.js` covers wind, tornado, volcano, tsunami and the like.
  - `effects.js` holds the per-client effects manager.
  - You can hold up to 3; a 4th is discarded. Pickups respawn, and the host's power-up setting scales how many appear.
- **Game client** (`src/game/client.js`): aiming, the power drag, aerial targeting, celebrations, the camera and the HUD hooks.
- **Other `src/game` files:**
  - `characters.js`: the 8 characters (ball textures and colours).
  - `finale.js`: the winner animation, where Aelita reaches the tower. `xanaFinale.js`: the catastrophe when XANA wins.
  - `intro.js`: the match intro, after the host clicks Start (pref `intro`; host skip ends it for everyone via `skipIntro`).
  - `stats.js`: per-device stats, achievements and trails. `src/ui/comms.js`: Jérémie's lines (8 s global cooldown).
- **Other `src/fx` files:** `towerCup.js` (tower hologram over cups + the trip inside), `weather.js` (seeded per sector
  from the hole seed and the shared clock), `vehicles.js` (Overbike, Overboard, Overwing meshes).
- **Modes** (`settings.mode` in the room): `ffa`, `teams` (average total; XANA's player is always on XANA's side),
  `elim` (3+ players; worst course subtotal is eliminated after each course, `p.out`, they spectate).
- **Special moves:** `SPECIALS` in `registry.js`, one free use **per course** from the ★ slot (`client.special`, slot
  `'S'`; it resets when the hole's sector changes). Balanced for fairness: Scanner shows only up to the first bounce
  (≤8 units, no landing ring), Telekinesis ≤1 unit and never within 1.5 of a cup, Sprint ×1.35, Wings 1.8 s, Hopper
  10 s immunity, Zweihänder 25 s / range 3, Activate Tower spares XANA's own ball (`course.calmUntil`).
- **Life points:** 100 per hole; `DAMAGE` in `monsters/attacks.js`; `landHit(course, kind, t, dmg)`; kind `vaporize`
  devirtualizes outright.
- **Monsters** (`src/monsters`): `attacks.js` has the shared telegraphed guns, mines, hit cooldown and resting-ball grace.
  Never let a monster fire at a ball whose owner is aiming.
- **Music** (`src/core/music.js` + `soundtrack.js`): a slot (intro, menu, levels, finale, xana) with a loaded file plays it;
  otherwise the procedural style plays.
- **UI** (`src/ui/ui.js`, `css/style.css`): arcade character select, VS intro, HUD, awards.

## Rules the owner chose
- **Time limit:** per hole (`time`, 120–170 s by par). Running out scores `max(par, strokes) + 10`.
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
