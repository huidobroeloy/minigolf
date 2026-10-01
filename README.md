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

If a friend's connection drops or they reload the page, they're put straight back into the room with their scores kept.
If the host leaves, the room ends.
For friends behind strict networks, the game uses PeerJS's free relay. For more reliable relaying, add your own free TURN credentials to `src/net/ice.js`.

## Controls
| Input | Action |
|---|---|
| Hold left mouse and drag down | Set power; release to putt (drag back up to cancel) |
| Drag sideways while aiming | Fine aim |
| Right-drag, A / D, ← / → | Rotate the camera and aim |
| W / S, mouse wheel | Tilt and zoom |
| Space (hold) | Alternative power meter |
| 1 2 3 | Use a power-up (Shift + number discards it) |
| C | Aerial view: drag or WASD to pan, wheel to zoom, Q/E to rotate |
| Tab / 👁️ | Spectate others after you hole out |
| 7 8 9 0 | Emotes 😂 😡 👏 💀 |
| H, M | Help, mute |
| ⏭️ (host only) | End the current hole for everyone, e.g. if someone is AFK |
| 🚪 | Leave the game |
| Click anywhere | Skip the hole flyover and the winner finale |

The aim line **wobbles** a little, and harder shots wobble more. Your putt goes wherever the line points when you release, so time it. Steady Aim removes the wobble.
On a phone or tablet, drag down from anywhere to putt, and use two fingers to rotate the camera.

## Rules
- Standard minigolf scoring: the lowest total strokes wins.
- Falling into the Digital Sea costs **+1 stroke**, and you respawn where you last stopped.
- Each hole has a time limit (about 2 minutes, depending on difficulty). If time runs out, the hole scores **max(par, strokes so far) + 10**.
- **Cyberpunk Fortune Falls:** the neon pits add a random **+1 to +5** (there's a rare jackpot of +0). Then you're dropped at a random spot. It might be next to the cup, or back at the start.
- Every hole has a hole-in-one line. It's hard to find.

## Power-ups
You can carry up to 3. Pick up the glowing orbs in mini Lyoko towers; if your slots are full, the new one is discarded.

The tower halo tells you the **category**:
- **Blue:** helps you.
- **Red:** sabotages others.
- **Purple:** chaos.

The exact item is a surprise. Players lower on the leaderboard get nastier items (**catch-up luck**), and collected pickups respawn every 25 s.

After you hole out you can still use power-ups that target other players or affect everyone.

**Placing power-ups:** bumpers, black holes, volcanoes, tornadoes, the chicken, wind, the tsunami, the swarm and Creativity all open an **aerial tactical view**. It shows every ball and the effect radius:
- Click a spot to place it.
- Drag to set a direction (tornado drift, wind, tsunami) or draw a line (Creativity).
- Right-click or Esc cancels and keeps the item.
- You can't place things right on the cup.

**Fair play:** after a single-target power-up hits you, you're immune to single-target power-ups for 5 s.

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
| ⏪ | Return to the Past | Undo your last shot (the stroke still counts) |
| 🛡️ | Firewall | The next power-up aimed at you bounces back to its sender |
| 🔱 | Triplicate | Your next shot splits into three balls, and the best one is kept |
| 🖥️ | Jérémie's Scanner | Shows the full path of your next shot, bounces included |
| 👁️ | XANA Possession | One player's aim and power controls are inverted for their next shot |
| 💥 | Devirtualize | Sends one player's ball back to the tee (no extra stroke) |
| 🔴 | Bumper Spawn | Place a bumper that sends balls back where they came from |
| 🕳️ | Black Hole Bumper | Place a black hole that pulls nearby balls in (+1 if swallowed) |
| 🪲 | Kankrelat Swarm | Five Kankrelats skitter around a spot for 20 s |
| ✨ | Aelita's Creativity | Draw a wall to block a lane, or a bridge across a gap (30 s) |
| 🪤 | Sticky Walls | Every wall is sticky for everyone until the hole ends |
| 🌬️ | Wind | A gust blows the way you drag |
| 🌪️ | Tornado | Drop it and drag where it drifts; it flings balls |
| 🌋 | Volcano | Magma pools that stop balls dead |
| ⛸️ | Ice Rink | The whole floor freezes |
| 🌊 | Tsunami | A giant wave sweeps the way you drag |
| 🐔 | Montapollos | A giant chicken runs around shoving balls |

## Sectors
1. **Desert:** tumbleweeds, Kankrelats, a Megatank, a chasm to jump, and an unwalled canyon rim with a sand geyser.
2. **Forest:** trees, Hornets, a root slingshot, a log flume, a turntable Blok, and a hollow ancient tree.
3. **Ice:** almost frictionless floors, thin ice that cracks, Krabes, and the **Kolossus** slamming the Digital Sea.
4. **Mountain:** crumbling plateaus, avalanches, and updraft vents.
5. **Sector 5:** sliding bridges, closing walls, Creepers, Mantas, and the Scyphozoa.
6. **Cyberpunk Fortune Falls:** fortune pits, conveyors, teleporters, and sweepers.

## The end
The winner's ball escorts Aelita to a tower XANA has activated. She deactivates it, and a Return to the Past sends everyone to the podium. Then the awards: Digital Sea Diver, XANA's Favourite Victim, Trigger Happy, Fortune's Fool, and more.

On the main menu, set **Graphics** to Low if a laptop struggles. Low turns off glow and shadows.

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
- `src/monsters/index.js`: the XANA monsters, including the Kolossus.
- `src/game/targeting.js`: the aerial tactical view for placing power-ups.
- `src/game/finale.js`: the winner finale.
- `src/fx/lyoko.js`: the tower, Aelita and Kolossus models.

Debug options:
- `?hole=N` jumps straight into solo practice on hole N.
- `&debug=1` turns on these keys and tools:
  - **P:** grant any power-up.
  - **K:** put the ball near the cup.
  - **L:** log the ball's position.
  - `window.__hio(holeIndex)`: brute-forces hole-in-one shots.

Pushing to `main` redeploys GitHub Pages.
