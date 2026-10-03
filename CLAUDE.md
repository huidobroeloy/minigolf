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
  Reference clips and screenshots live in the gitignored `.local/` folder.
- **No build step.** Plain ES modules with an importmap in `index.html`. Dependencies come from jsDelivr:
  - Three.js 0.186.1
  - Rapier3d-compat 0.21.0
  - PeerJS 1.5.5 (UMD)
- **Git identity is repo-local:** `huidobroeloy` / `197536980+huidobroeloy@users.noreply.github.com`.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Every hole needs a hole-in-one that is hard but possible.** Target at least 1 hit and roughly ≤1.5% of the search grid (see below).

## Running locally
- **Dev server:** `python tools/devserver.py` (no-cache headers, so ES modules don't go stale). It's served on port 8766; the launch config is "minigolf-dev".
- **Debug flags:** `?hole=N` jumps to a hole in solo; `?debug=1` exposes these globals:
  - `__app`, `__holes`
  - `__sim(def, {yaw, power, t0, trace})`
  - `__hio(index, opts)`
  - `__hioAll()`, which writes its results to `localStorage['lyokogolf.hio']`
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
  - The cup is a drawn disc, not a hole in the geometry. Capture is in `Ball.postStep`, which loops over `course.cups`.
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
  - Fortune cups carry a `mod` (strokes added on holing out); Fortune pits roll a random penalty.
- **Power-ups** (`src/powerups`):
  - `registry.js` holds the 44 power-ups (including one per character) with their weights and catch-up luck.
  - `hazards.js` covers wind, tornado, volcano, tsunami and the like.
  - `effects.js` holds the per-client effects manager.
  - You can hold up to 3; a 4th is discarded. Pickups respawn, and the host's power-up setting scales how many appear.
- **Game client** (`src/game/client.js`): aiming, the power drag, aerial targeting, celebrations, the camera and the HUD hooks.
- **Other `src/game` files:**
  - `characters.js`: the 8 characters (ball textures and colours).
  - `finale.js`: the winner animation, where Aelita reaches the tower. `xanaFinale.js`: the catastrophe when XANA wins.
  - `intro.js`: the click-to-start intro cinematic (pref `intro`).
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
Common ways a hole gets too many aces (more than ~1.5%): a deterministic funnel (bubble lift, boost or launcher whose
output doesn't depend on the shot) pointing at the cup; a wall or pillar just behind the cup bouncing overshoots back in;
a round bank around the cup. Fix with an off-line cup, a lava strip or sinkhole behind the cup, or straight walls.

Run `__hio(i, { yawRange: 60, yawStep: 2, pMin: 0.12, pMax: 1, pStep: 0.05, t0s: [0, 2.1] })`. That is 2196 simulated shots, about 2–5 minutes per hole.

Last full run: every hole has an ace.
- **Highest:** Avalanche Alley at about 1.9% (42 hits), acceptable for a short par 3.
- **Frozen U-Turn:** 1.4% after squaring off the far end. A round bank funnels every shot into the cup, so don't bring it back.
- **Fortune Falls:** about 0.2%, by design a luck hole.
- **Kankrelat Canyon:** shows 0 on the coarse grid but has a narrow full-power line (yaw −1° to −1.25°). Hornet Grove, Megatank Mesa, Krabe Crossing, Arena Entry and Closing Walls also needed the automatic finer re-search to find theirs.
