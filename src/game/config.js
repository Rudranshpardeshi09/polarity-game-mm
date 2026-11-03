// Every tunable number in the game lives here (spec 01 §5 + PLAN.md §3).
// Instructor customizations: add an entry here + one case in applyEffect() / addScore() in engine.js.

export const COLORS = {
  void: '#05070F',
  navy: '#0A1024',
  panel: '#111A33',
  pos: '#00E5FF',     // + charge (cyan)
  posHi: '#B8F7FF',
  neg: '#FF2BD6',     // − charge (magenta)
  negHi: '#FFC2F3',
  gold: '#FFC93C',
  goldHi: '#FFF1B8',
  goldRim: '#B07A12',
  danger: '#FF3B3B',
  shield: '#4D8DFF',
  stasis: '#7CFFB2',
  overload: '#B388FF',
  rock: '#6B7280',
  text: '#F4F8FF',
  textDim: '#7A8BB5',
};

export const CONFIG = {
  world: { width: 600, height: 800 },

  player: {
    radius: 22, y: 720, keySpeed: 380, pointerMaxSpeed: 600,
    lives: 3, maxLives: 5, invulnTime: 1.0, flipCooldown: 0.30,
  },

  magnet: {
    K: 6000000, fieldRadius: 200, minDist: 40, forceMax: 1100,
    lateralDamping: 2.0, minFallSpeed: 40, centreNudge: 4,
  },

  physics: { vy0: 120, gravity: 50, maxFall: 360, hardMaxFall: 520, wallBounce: 0.5 },

  // effect = name of the case in applyEffect()
  items: {
    coin:     { radius: 14, charge: 'random', magnetic: true,  points: 10, effect: 'score' },
    prism:    { radius: 16, charge: 'cycle',  magnetic: true,  points: 50, effect: 'score', cycle: 1.0 },
    mine:     { radius: 16, charge: 'random', magnetic: true,  effect: 'hit', overloadPoints: 20 },
    flicker:  { radius: 16, charge: 'cycle',  magnetic: true,  effect: 'hit', cycle: 1.2, warn: 0.3, overloadPoints: 20 },
    rock:     { radius: 24, charge: 'none',   magnetic: false, effect: 'hit', fallMult: 1.2 },
    powerup:  { radius: 16, charge: 'none',   magnetic: false, effect: 'powerup', fallMult: 0.8 },
  },

  powerups: {
    minGap: 10, firstAt: 20,
    types: {
      shield:   { weight: 40, duration: 0, duplicatePoints: 50 },
      stasis:   { weight: 30, duration: 4.0, slow: 0.5 },
      overload: { weight: 30, duration: 5.0, warn: 1.0 },
    },
  },

  scoring: {
    comboTierSize: 5, maxMult: 5, wastedPenalty: -5,
    sectorClearBase: 100, perfectSectorMult: 2, globalMult: 1,
  },

  spawn: { pressureChance: 0.25, pressureSpread: 80, maxObjects: 60, comebackPowerup: 10 },

  custom: {},  // instructor customizations go here
};

// 8 themed sectors (spec 02 names + spec 01 numbers, PLAN.md D3/D4). After the table: Overdrive N.
// tint = background colour for that sector (spec 03).
export const SECTORS = [
  { name: 'IGNITION',      tint: '#1E5BFF', speed: 1.00, interval: 1.00, maxMines: 3,  signature: 'coinRain',
    weights: { coin: 70, mine: 25, powerup: 5 }, intro: 'Collect coins. Flip to bend them in.' },
  { name: 'PRISM FLUX',    tint: '#8A5CFF', speed: 1.15, interval: 0.85, maxMines: 4,  signature: 'prismLure',
    weights: { coin: 60, prism: 5, mine: 30, powerup: 5 }, intro: 'Prism coins shift charge. Time it.' },
  { name: 'FLICKER BELT',  tint: '#00FFC6', speed: 1.30, interval: 0.70, maxMines: 5,  signature: 'chargeZipper',
    weights: { coin: 52, prism: 5, mine: 25, flicker: 13, powerup: 5 }, intro: 'Flicker mines swap charge mid-air.' },
  { name: 'IRON RAIN',     tint: '#FF7A3C', speed: 1.45, interval: 0.60, maxMines: 6,  signature: 'rockLanes',
    weights: { coin: 45, prism: 6, mine: 24, flicker: 12, rock: 8, powerup: 5 }, intro: 'Grey rocks ignore magnetism. Dodge.' },
  { name: 'CLUSTER STORM', tint: '#FF3D6E', speed: 1.55, interval: 0.55, maxMines: 7,  signature: 'mineWall',
    weights: { coin: 40, prism: 6, mine: 24, flicker: 14, rock: 11, powerup: 5 }, intro: 'Mine walls incoming. Find the gap.' },
  { name: 'DEEP FIELD',    tint: '#1E5BFF', speed: 1.65, interval: 0.50, maxMines: 8,  signature: 'bait',
    weights: { coin: 40, prism: 6, mine: 25, flicker: 14, rock: 10, powerup: 5 }, intro: 'Some coins are bait.' },
  { name: 'NULL ZONE',     tint: '#8A5CFF', speed: 1.75, interval: 0.45, maxMines: 9,  signature: 'flickerPair',
    weights: { coin: 39, prism: 6, mine: 25, flicker: 15, rock: 10, powerup: 5 }, intro: 'Stay sharp.' },
  { name: 'CORE BREACH',   tint: '#00FFC6', speed: 1.85, interval: 0.40, maxMines: 10, signature: 'medley',
    weights: { coin: 38, prism: 6, mine: 26, flicker: 15, rock: 10, powerup: 5 }, intro: 'Everything at once.' },
];
export const BEYOND = { speedStep: 0.10, speedMax: 2.1, intervalStep: -0.05, intervalMin: 0.35, clusterChance: 0.15 };
export const SECTOR_LENGTH = 30;
export const BEYOND_TINTS = ['#FF7A3C', '#FF3D6E', '#1E5BFF', '#8A5CFF', '#00FFC6'];

export function getSector(n) {           // n is 1-based
  if (n <= SECTORS.length) return SECTORS[n - 1];
  const last = SECTORS[SECTORS.length - 1];
  const extra = n - SECTORS.length;
  return {
    ...last,
    name: `OVERDRIVE ${extra}`,
    tint: BEYOND_TINTS[extra % BEYOND_TINTS.length],
    speed: Math.min(BEYOND.speedMax, last.speed + BEYOND.speedStep * extra),
    interval: Math.max(BEYOND.intervalMin, last.interval + BEYOND.intervalStep * extra),
    intro: 'Survive.',
  };
}

// Spawn patterns (spec 02 §4). Event: [time, lane, kind, charge]
// lane: 0-8, 'P' = player lane, 'P+2' = relative, 'G' = gap lane, 'R' = random, 'WALL' = all lanes except gap
// charge: 'O' opposite to player (attracts), 'S' same (repels), 'R' random, '+' / '-' fixed, '0' neutral
export const LANES = 9;
export const PATTERNS = {
  onboarding: { dur: 30, scripted: true, events: [
    [2.0, 'P', 'coin', 'O'], [3.2, 'P', 'coin', 'O'], [4.4, 'P', 'coin', 'O'], [5.6, 'P', 'coin', 'O'],
    [8.0, 2, 'coin', 'O'], [9.4, 6, 'coin', 'O'], [10.8, 2, 'coin', 'O'], [12.2, 6, 'coin', 'O'],
    [14.0, 'P+1', 'mine', 'S'], [16.0, 'P-1', 'mine', 'S'],
    [18.0, 'P', 'coin', 'S'], [19.6, 'P', 'coin', 'S'], [21.2, 'P', 'coin', 'S'],
    [24.0, 'P', 'mine', 'S'], [24.0, 'P+2', 'coin', 'O'],
    [26.5, 'P-2', 'coin', 'R'], [27.5, 'P+1', 'coin', 'R'], [28.5, 'P', 'coin', 'O'],
  ] },
  coinRain: { dur: 1.2, events: [
    [0.00, 2, 'coin', 'O'], [0.15, 3, 'coin', 'O'], [0.30, 4, 'coin', 'O'], [0.45, 5, 'coin', 'O'], [0.60, 6, 'coin', 'O'],
  ] },
  prismLure: { dur: 2.0, events: [[0.0, 4, 'prism', '+'], [0.5, 2, 'mine', 'S'], [0.5, 6, 'mine', 'S']] },
  chargeZipper: { dur: 2.4, events: [
    [0.00, 'P', 'coin', '+'], [0.35, 'P', 'coin', '-'], [0.70, 'P', 'coin', '+'],
    [1.05, 'P', 'coin', '-'], [1.40, 'P', 'coin', '+'], [1.75, 'P', 'coin', '-'],
  ] },
  rockLanes: { dur: 1.6, events: [
    [0.0, 1, 'rock', '0'], [0.0, 4, 'rock', '0'], [0.0, 7, 'rock', '0'],
    [0.3, 2, 'coin', 'O'], [0.3, 6, 'coin', 'O'], [0.8, 'P', 'rock', '0'],
  ] },
  mineWall: { dur: 1.5, warn: 0.6, events: [[0, 'WALL', 'mine', 'S'], [0.4, 'G', 'coin', 'O']] },
  bait: { dur: 1.0, events: [[0.0, 'P+1', 'mine', 'O'], [0.0, 'P+3', 'mine', 'O'], [0.1, 'P+2', 'coin', 'O']] },
  flickerPair: { dur: 1.0, events: [[0.0, 'P+1', 'flicker', 'S'], [0.2, 'P-1', 'coin', 'O']] },
  breather: { dur: 4.0, events: [
    [0.0, 'R', 'coin', 'O'], [0.8, 'R', 'coin', 'R'], [1.6, 'R', 'coin', 'O'], [2.4, 'R', 'powerup', '0'], [3.2, 'R', 'coin', 'R'],
  ] },
};
