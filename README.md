# Lyoko Minigolf

A browser minigolf party game for friends, inspired by Putt Party, with jokes and power-ups.
It's a **Lyoko World Cup**: 9 courses of 6 holes (54 in all) across Code Lyoko's sectors, the Digital Sea and the Network, and XANA monsters get in your way.
Everyone plays at the same time, and there's no ball-to-ball contact.

**Play:** https://huidobroeloy.github.io/minigolf/

Fan-made for private fun among friends. Not affiliated with Code Lyoko or Moonscoop. Not for distribution.

## How to play with friends
1. One person opens the game and clicks **Create room**.
2. They share the 5-letter code, or the invite link from the lobby.
3. Friends click **Join** with that code. Up to 8 players can join.
4. The host picks the format, timer and power-ups, then clicks **Start**.

The host's browser runs the room, so the host has to keep the tab open.
Connections are peer-to-peer (WebRTC via PeerJS), so there's no server to run.

If a friend's connection drops or they reload the page, they're put straight back into the room with their scores kept.
If the host leaves, the room ends.
For friends behind strict networks, the game uses PeerJS's free relay. For more reliable relaying, add your own free TURN credentials to `src/net/ice.js`.

## Formats
- **World Cup:** all 9 courses, 6 holes each. The courses come in a random order, and you play all 6 holes of a course before moving on.
- **Cup of N:** the host picks 1–9 courses, still in random order.
- **Single course** or **single hole**, for practice.

A title card opens each course, and the scoreboard shows a subtotal per course plus the grand total.

## Choose your fighter
Pick your character on the main menu, or change it in the lobby. The roster is **Ulrich, Odd, Yumi, Aelita, William, Jérémie, Franz Hopper and XANA**. Each one has a pixel portrait and a ball with its own colours and detail:

| Character | Ball |
|---|---|
| Ulrich | Katana Gold |
| Odd | Laser Violet |
| Yumi | Geisha Night |
| Aelita | Princess Pink |
| William | Smoke White |
| Jérémie | Supercomputer Blue |
| Franz Hopper | Sphere of Light |
| XANA | Eye of XANA |

Each character can only be picked by one player per room.

## Controls
| Input | Action |
|---|---|
| Hold left mouse and drag down | Set power; release to putt (drag back up to cancel) |
| Drag sideways while aiming | Fine aim |
| Right-drag, A / D, ← / → | Rotate the camera and aim |
| W / S, mouse wheel | Tilt and zoom |
| Space (hold) | Alternative power meter |
| C / 🎥 | Switch camera: **chase**, **first-person (POV)**, **aerial** (wheel or pinch to zoom, drag to pan) |
| 1 2 3 | Use a power-up (Shift + number discards it) |
| Tab / 👁️ | Spectate others after you hole out |
| 7 8 9 0 | Emotes 😂 😡 👏 💀 |
| Esc / ⚙️ | Settings: music, sound effects, mutes, graphics, intro, your soundtrack |
| H, M | Help, mute |
| ⏭️ (host only) | End the current hole for everyone, e.g. if someone is AFK |
| 🚪 | Leave the game |

The aim line **wobbles** a little, and harder shots wobble more. Your putt goes wherever the line points when you release, so time it. Steady Aim removes the wobble.
On a phone or tablet, drag down from anywhere to putt, and use two fingers to rotate the camera.
If your ball ever gets wedged somewhere it can't be shot from, a **Reset ball** button appears: it puts you back at your last safe spot for free.

## Rules
- Standard minigolf scoring: the lowest total strokes wins.
- Falling into the Digital Sea or touching lava costs **+1 stroke**, and you respawn where you last stopped.
- Each hole has a time limit that scales with its par. If time runs out, the hole scores **max(par, strokes so far) + 10**.
- **Ties are broken**, never shared:
  1. countback over the last 3 holes;
  2. the last hole;
  3. most aces;
  4. a sudden-death closest-to-the-pin playoff.
- **Fortune Falls Casino:** every cup ends the hole, but each one adds or removes strokes. The number is written over the cup, for example −2 or +3. The neon pits midway add a random penalty.
- Every hole has a hole-in-one line. On the long holes it's a secret route: a warp pipe, a launcher, a bank shot. It's hard to find.

## XANA's monsters
Monsters telegraph every attack (a charge glow and a red target ring). They fire at random intervals and never at a ball whose owner is aiming. Each one has its own abilities:

| Monster | What it does |
|---|---|
| Kankrelat | Short laser |
| Hornet | Laser, charged laser, or a poison spit that leaves a venom puddle (weaker, shakier next shot) |
| Blok | Laser, rapid fire, a fire ring, or an ice beam that freezes your ball |
| Krabe | Laser or charged laser; two Krabes together fire the mixed laser, which vaporizes |
| Megatank | Opens up and fires its flat blade of light along a line; it **vaporizes** your ball (+1), and so does being run over |
| Tarantula | Rapid double-laser bursts |
| Creeper | Pops out of the floor and fires |
| Manta | Drops mines that vaporize a ball rolling into them |
| Scyphozoa | Grabs your ball and XANA-fies your next shot (inverted controls) |
| Shark | Cruises its lane, then rams you |
| Kongre | Its giant tentacles rise out of the Digital Sea and sweep the lane |
| Kolossus | Smashes the Digital Sea in the background |

## Power-ups
You can carry up to 3. Pick them up from mini Lyoko towers; if your slots are full, the new one is discarded.
The host sets the amount (**Off / Few / Normal / Chaos**). It also scales with the number of players and the size of the hole.

The tower halo tells you the **category**:
- **Blue:** helps you.
- **Red:** sabotages others.
- **Purple:** chaos.

The exact item is a surprise. Players lower on the leaderboard get nastier items (**catch-up luck**), and collected pickups respawn every 25 s.

After you hole out you can still use power-ups that target other players or affect everyone.

**Placing power-ups:** bumpers, black holes, volcanoes, tornadoes, the chicken, wind, the tsunami, the swarm, the Zweihänder and Creativity all open an **aerial tactical view**:
- Click a spot to place it.
- Drag to set a direction (tornado drift, wind, tsunami, Laser Arrow) or draw a line (Creativity).
- Right-click or Esc cancels and keeps the item.

**Fair play:** after a hostile power-up hits you, you're immune to them for 12 s, and nobody can be hit more than twice in 20 s.
Active effects show as chips with a countdown at the top of the screen.

| | Power-up | Effect |
|---|---|---|
| 🎯 | Steady Aim | No aim wobble on your next shot |
| 🧲 | Magnet | Your next shot is pulled toward the cup and grabbed when close |
| 👻 | Ghost | Pass through walls, monsters and pits (but not off the edge) |
| 🦘 | Chip Shot | Your next shot jumps |
| ⏪ | Return to the Past | Undo your last shot (the stroke still counts) |
| ⚔️ | Super Sprint | Ulrich: next shot 60% faster, and monsters can't touch it |
| 🌀 | Telekinesis | Yumi: nudge your resting ball up to 1.5 units, for free |
| 👼 | Angel Wings | Aelita: your next shot glides for 2.5 s over pits, water and gaps |
| 🛩️ | Overwing | Jérémie's vehicle: your next shot flies straight over everything for 8 units |
| 🌟 | Hopper's Light | Franz Hopper cleanses every bad effect on you and shields you for 15 s |
| 🛡️ | Firewall | The next power-up aimed at you bounces back to its sender |
| 🔱 | Triplicate | Your next shot splits into three balls, and the best one is kept |
| 🖥️ | Jérémie's Scanner | Shows the full path of your next shot, bounces included |
| 💗 | Energy Field | Aelita: a shockwave from your ball pushes every nearby ball away |
| 🏹 | Laser Arrow | Odd: fire an arrow; the first ball it hits gets launched |
| 🗡️ | Zweihänder | William: cut a monster or moving obstacle out of the course for 15 s |
| 🗼 | Activate Tower | XANA: every monster attacks twice as often for 15 s |
| 💔 | Unlovaball | For 10 s, other balls are pushed away from yours |
| 🌸 | Aelita | Everyone else moves in slow motion for their next shot |
| 🐜 | Fun Size | Shrinks everyone else's ball |
| 🍔 | Super Size | Everyone else's ball is too big for the cup |
| 🍯 | Sticky Ball | Everyone else sticks to walls on their next shot |
| ⚡ | Zanyball | One player's next shot is far too fast |
| 🦝 | Steal | Take a random power-up from a player |
| 🔄 | Switch | Swap ball positions with a player |
| 🐕 | Leash | A lady walks someone's ball on a leash: weaker shot, with a tether |
| 📺 | Unskippable Ad | A low-res meme video covers most of someone's screen for 20 s (they can still play) |
| 👁️ | XANA Possession | You take someone's next shot for them (15 s, or a random shot fires) |
| 🤢 | Gas Giant | Someone's ball burps random little shoves until they shoot |
| 🧊 | Freeze | Someone's ball is frozen in ice for 6 s |
| 😵 | Stun | Someone's next shot controller goes haywire |
| 🔮 | Lyoko Guardian | XANA traps someone's ball in a Guardian sphere for 8 s |
| 💥 | Devirtualize | Sends one player's ball back to the tee (no extra stroke) |
| 🔴 | Bumper Spawn | Place a bumper that sends balls back where they came from |
| 🕳️ | Black Hole Bumper | A black hole for 20 s: drags passing balls in and flings them out like a bumper |
| 🪲 | Kankrelat Swarm | Five Kankrelats skitter around a spot for 20 s |
| ✨ | Aelita's Creativity | Draw a wall to block a lane, or a bridge across a gap (30 s) |
| 🪤 | Sticky Walls | Every wall is sticky for everyone until the hole ends |
| 🌬️ | Wind | A gust blows the way you drag |
| 🌪️ | Tornado | Drop it and drag where it drifts; it flings balls |
| 🌋 | Volcano | Magma pools that stop balls dead |
| ⛸️ | Ice Rink | The whole floor freezes |
| 🌊 | Tsunami | A giant wave sweeps the way you drag |
| 🐔 | Montapollos | A giant chicken runs around shoving balls |

## The 9 courses
1. **Desert Sector:** tumbleweeds, Kankrelats, a Megatank, kicker banks, sinkholes and mesa switchbacks.
2. **Forest Sector:** Hornets, log ramps, a turntable Blok, a data-stream waterfall, a treehouse and a hollow-log shortcut.
3. **Ice Sector:** almost frictionless floors, a glass bobsled run, crevasses, thin ice and the **Kolossus** in the distance.
4. **Mountain Sector:** crumbling ledges, avalanches, updraft vents, windy ridge bridges and the summit.
5. **Sector 5 · Carthage:** sliding bridges, closing walls, the core elevator, a firewall maze and the Core of Lyoko.
6. **Volcano Replika:** lava rivers with basalt rafts, magma geysers, crumbling basalt, the Replika core and an obsidian maze.
7. **The Digital Sea:** underwater floaty physics, glass tubes and Mario-style warp pipes, currents, bubble lifts, Sharks and Kongre.
8. **The Network:** firewall gates, data highways, gravity launchers, the Skid docking bay, packet storms and the Hub.
9. **Fortune Falls Casino:** pachinko, roulette, a slot machine, neon pinball, a dice table and cyberpunk rooftops. Every cup carries its own stroke bonus or penalty.

## Intro and endings
The game opens with a **XANA alert** on the supercomputer, then:
1. TRANSFER… SCANNER… VIRTUALIZATION!
2. The heroes' balls virtualize onto Lyoko.
3. The title card.

Click or press any key to skip, or turn the intro off in Settings.

At the end, the winner's ball escorts Aelita to the activated tower. She deactivates it, and a Return to the Past sends everyone to the podium.
**If XANA wins**, it goes very differently. The tower's shield throws Aelita back, the Kolossus smashes the sector into the Digital Sea, and XANA escapes into the Network.
Then the awards: Digital Sea Diver, XANA's Favourite Victim, Vaporized, Trigger Happy, Fortune's Fool, and more.

## Your own soundtrack
The built-in music is a procedural synth, made in code. Under **Settings → Soundtrack** you can load your own audio or video files into five slots:
- Intro
- Menu & lobby
- Levels
- Victory
- XANA wins

The files stay in your browser (IndexedDB). They're never uploaded and never part of this repository. When you host, the game streams your tracks to the friends in your room, so everyone hears the same music.

## Development
No build step is needed: it's plain ES modules, with Three.js, Rapier and PeerJS loaded from jsDelivr. Run the bundled no-cache dev server, which makes edited modules always reload:

```bash
python tools/devserver.py 8000
```

Then open `http://localhost:8000`.

Code map:
- `src/holes/*.js`: one file per course. Each hole is plain data: floors, ramps, walls, movers, zones, pits, tubes, warps and monsters.
- `src/course/builder.js`: turns that hole data into meshes and Rapier colliders.
- `src/physics/ball.js`: the rolling model, cup capture, stuck detection and aim wobble.
- `src/net/room.js`: the host-authoritative room, covering the timer, scores, tiebreaks, pickups, power-up routing and soundtrack streaming.
- `src/powerups/`: the power-up registry, the effects on your ball, and the deterministic global hazards.
- `src/monsters/`: the XANA monsters (`looks.js` models, `attacks.js` guns and mines, `index.js` behaviour).
- `src/game/intro.js`, `finale.js`, `xanaFinale.js`: the intro and the two endings.
- `src/core/music.js`, `soundtrack.js`: the procedural music and your own tracks.
- `src/fx/lyoko.js`: the tower, Aelita and Kolossus models.

Debug options:
- `?hole=N` jumps straight into solo practice on hole N.
- `&debug=1` turns on these keys and tools:
  - **P:** grant any power-up.
  - **K:** put the ball near the cup.
  - **L:** log the ball's position.
  - `window.__hio(holeIndex)`: brute-forces hole-in-one shots.

Pushing to `main` redeploys GitHub Pages. Only the repository owner can push to `main`.
