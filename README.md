# Lyoko Minigolf

A browser minigolf party game for friends, inspired by Putt Party, with jokes and power-ups.
It has 18 holes across six Code Lyoko–style sectors, and XANA monsters get in your way.
Everyone plays at the same time, and there's no ball-to-ball contact.

**Play:** https://huidobroeloy.github.io/minigolf/

Fan-made for private fun among friends. Not affiliated with Code Lyoko or Moonscoop. Not for distribution.

## How to play with friends
1. One person opens the game and clicks **Create room**.
2. They share the 5-letter code, or the invite link from the lobby.
3. Friends click **Join** with that code. Up to 8 players can join.
4. The host picks the course and timer, then clicks **Start**.

The host's browser runs the room, so the host has to keep the tab open.
Connections are peer-to-peer (WebRTC via PeerJS), so there's no server to run.

## Controls
| Input | Action |
|---|---|
| Hold left mouse and drag down | Set power; release to putt (drag back up to cancel) |
| Drag sideways while aiming | Fine aim |
| Right-drag, A / D, ← / → | Rotate the camera and aim |
| W / S, mouse wheel | Tilt and zoom |
| Space (hold) | Alternative power meter |
| 1 2 3 | Use a power-up (Shift + number discards it) |
| C | Overhead view |
| Tab / 👁️ | Spectate others after you hole out |
| H, M | Help, mute |
| ⏭️ (host only) | End the current hole for everyone, e.g. if someone is AFK |
| 🚪 | Leave the game |

The aim line **wobbles** a little, and harder shots wobble more. Your putt goes wherever the line points when you release, so time it. Steady Aim removes the wobble.
On a phone or tablet, drag down from anywhere to putt, and use two fingers to rotate the camera.

## Rules
- Standard minigolf scoring: the lowest total strokes wins.
- Falling into the Digital Sea costs **+1 stroke**, and you respawn where you last stopped.
- Each hole has a time limit (about 2 minutes, depending on difficulty). If time runs out, the hole scores **max(par, strokes so far) + 10**.
- **Cyberpunk Fortune Falls:** the neon pits add a random **+1 to +5** (there's a rare jackpot of +0). Then you're dropped at a random spot. It might be next to the cup, or back at the start.
- Every hole has a hole-in-one line. It's hard to find.

## Power-ups
You can carry up to 3. Pick up the floating **?** cubes on the course; if your slots are full, the new one is discarded.
After you hole out you can still use power-ups that target other players or affect everyone.

| | Power-up | Effect |
|---|---|---|
| 🎯 | Steady Aim | No aim wobble on your next shot |
| 🧲 | Magnet | Your next shot is pulled toward the cup |
| 👻 | Ghost | Pass through walls, monsters and pits (but not off the edge) |
| 🦘 | Chip Shot | Your next shot jumps |
| 💔 | Unlovaball | For 10 s, other balls are pushed away from yours |
| 🌸 | Aelita | Everyone else moves in slow motion for their next shot |
| 🐜 | Fun Size | Shrinks everyone else's ball |
| 🍔 | Super Size | Everyone else's ball is too big for the cup |
| 🍯 | Sticky Ball | Everyone else sticks to walls on their next shot |
| ⚡ | Zanyball | One player's next shot is far too fast |
| 🦝 | Steal | Take a random power-up from a player |
| 🔄 | Switch | Swap ball positions with a player |
| 🐕 | Leash | A lady walks someone's ball on a leash: weaker shot, with a tether |
| 📺 | Unskippable Ad | Someone has to watch a 5 to 10 second ad |
| 🔴 | Bumper Spawn | Place a bumper that sends balls back where they came from |
| 🕳️ | Black Hole Bumper | Place a black hole that pulls nearby balls in (+1 if swallowed) |
| 🪤 | Sticky Walls | Every wall is sticky for everyone until the hole ends |
| 🌬️ | Wind | A gust blows the way you're facing |
| 🌪️ | Tornado | A tornado drifts around and flings balls |
| 🌋 | Volcano | Magma pools that stop balls dead |
| ⛸️ | Ice Rink | The whole floor freezes |
| 🌊 | Tsunami | A giant wave sweeps the way you're facing |
| 🐔 | Montapollos | A giant chicken runs around shoving balls |

## Sectors
1. **Desert:** tumbleweeds, Kankrelats, a Megatank, and a chasm to jump.
2. **Forest:** trees, Hornets, a log flume, a turntable Blok, and a hollow ancient tree.
3. **Ice:** almost frictionless floors, thin ice that cracks, and Krabes.
4. **Mountain:** crumbling plateaus, avalanches, and updraft vents.
5. **Sector 5:** sliding bridges, closing walls, Creepers, Mantas, and the Scyphozoa.
6. **Cyberpunk Fortune Falls:** fortune pits, conveyors, teleporters, and sweepers.

## Development
No build step is needed: it's plain ES modules, with Three.js, Rapier and PeerJS loaded from jsDelivr. Run the bundled no-cache dev server, which makes edited modules always reload:

```bash
python tools/devserver.py 8000
```

Then open `http://localhost:8000`.

Code map:
- `src/holes/*.js`: one file per sector. Each hole is plain data: floors, ramps, walls, movers, zones, pits and monsters.
- `src/course/builder.js`: turns that hole data into meshes and Rapier colliders.
- `src/physics/ball.js`: the rolling model, cup capture and aim wobble.
- `src/net/room.js`: the host-authoritative room, covering the timer, scores, pickups and power-up routing.
- `src/powerups/`: the power-up registry, the effects on your ball, and the deterministic global hazards.
- `src/monsters/index.js`: the XANA monsters.

Debug options:
- `?hole=N` jumps straight into solo practice on hole N.
- `&debug=1` turns on these keys and tools:
  - **P:** grant any power-up.
  - **K:** put the ball near the cup.
  - **L:** log the ball's position.
  - `window.__hio(holeIndex)`: brute-forces hole-in-one shots.

Pushing to `main` redeploys GitHub Pages.
