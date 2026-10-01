// kind:
//   self   – affects your own next shot
//   aura   – timed effect around your own ball
//   others – every opponent's next shot
//   one    – a single chosen player
//   place  – click on the course to place something (lasts until the hole ends)
//   global – timed, affects everyone including you (dir: uses your camera direction)
export const POWERUPS = {
  steady:      { name: 'Steady Aim',        icon: '🎯', kind: 'self',   desc: 'No aim wobble on your next shot.' },
  magnet:      { name: 'Magnet',            icon: '🧲', kind: 'self',   desc: 'Next shot is pulled toward the cup and grabbed when close.' },
  ghost:       { name: 'Ghost',             icon: '👻', kind: 'self',   desc: 'Next shot passes through walls, monsters and pits. Don\'t overshoot into the Digital Sea!' },
  chip:        { name: 'Chip Shot',         icon: '🦘', kind: 'self',   desc: 'Next shot jumps over obstacles.' },
  unlovaball:  { name: 'Unlovaball',        icon: '💔', kind: 'aura',   desc: 'For 10s, other balls are pushed away from yours. Nobody loves you.' },
  aelita:      { name: 'Aelita',            icon: '🌸', kind: 'others', desc: 'Everyone else moves in slow motion for their next shot.' },
  funsize:     { name: 'Fun Size',          icon: '🐜', kind: 'others', desc: 'Shrinks everyone else for their next shot.' },
  supersize:   { name: 'Super Size',        icon: '🍔', kind: 'others', desc: 'Enlarges everyone else so their ball won\'t fit in the cup.' },
  sticky:      { name: 'Sticky Ball',       icon: '🍯', kind: 'others', desc: 'Everyone else sticks to walls on their next shot.' },
  zany:        { name: 'Zanyball',          icon: '⚡', kind: 'one',    desc: 'One player\'s next shot is WAY too fast.' },
  steal:       { name: 'Steal',             icon: '🦝', kind: 'one',    desc: 'Take a random power-up from a player.', allowHoled: true },
  switch:      { name: 'Switch',            icon: '🔄', kind: 'one',    desc: 'Swap ball positions with a player still on the course.', needSelf: true },
  leash:       { name: 'Leash',             icon: '🐕', kind: 'one',    desc: 'A lady walks their ball on a leash: weaker, tethered next shot.' },
  ad:          { name: 'Unskippable Ad',    icon: '📺', kind: 'one',    desc: 'Forces a player to watch a 5–10s ad. No shooting, no power-ups.', allowHoled: true },
  bumper:      { name: 'Bumper Spawn',      icon: '🔴', kind: 'place',  desc: 'Place a bumper that sends balls back the way they came.' },
  blackhole:   { name: 'Black Hole Bumper', icon: '🕳️', kind: 'place',  desc: 'Place a black hole that pulls in nearby balls (+1 if swallowed).' },
  stickywalls: { name: 'Sticky Walls',      icon: '🪤', kind: 'global', desc: 'All walls are sticky for everyone (you too) until the hole ends.' },
  wind:        { name: 'Wind',              icon: '🌬️', kind: 'global', dir: true, desc: 'A 10s gust blows where your camera faces.' },
  tornado:     { name: 'Tornado',           icon: '🌪️', kind: 'global', desc: 'A tornado drifts around for 15s, flinging balls.' },
  volcano:     { name: 'Volcano',           icon: '🌋', kind: 'global', desc: 'A volcano erupts magma pools that stop balls dead.' },
  icerink:     { name: 'Ice Rink',          icon: '⛸️', kind: 'global', desc: 'The floor freezes for 20s. Everything slides.' },
  tsunami:     { name: 'Tsunami',           icon: '🌊', kind: 'global', dir: true, desc: 'A giant wave sweeps balls where your camera faces.' },
  montapollos: { name: 'Montapollos',       icon: '🐔', kind: 'global', desc: 'A giant chicken runs around shoving balls off the course.' },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

// Relative spawn weights (rarer = more chaotic).
export const WEIGHTS = {
  steady: 10, magnet: 6, ghost: 6, chip: 8, unlovaball: 6, aelita: 6, funsize: 7, supersize: 6, sticky: 7,
  zany: 7, steal: 6, switch: 4, leash: 6, ad: 5, bumper: 7, blackhole: 5, stickywalls: 4,
  wind: 6, tornado: 4, volcano: 4, icerink: 4, tsunami: 3, montapollos: 3,
};
