// Decides WHAT falls, WHERE and WHEN (spec 02).
// Inside each 30 s sector: build (slow) → escalate (signature pattern @12 s) → peak (@21 s) → breather (@26 s).
import { CONFIG, PATTERNS, LANES, getSector } from './config.js';

const W = CONFIG.world.width;
const laneX = (lane) => ((lane + 0.5) / LANES) * W;
const SIGNATURE_POOL = ['coinRain', 'prismLure', 'chargeZipper', 'rockLanes', 'mineWall', 'bait', 'flickerPair'];

function pickWeighted(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

export class Spawner {
  constructor(game) {
    this.game = game;
  }

  reset(skipOnboarding) {
    this.timer = 0.5;           // time until next random spawn
    this.pattern = null;        // currently running pattern
    this.patternT = 0;
    this.patternQueue = [];
    this.fired = {};            // which scheduled patterns fired this sector
    this.lastPowerup = -99;
    this.firstMineDone = false;
    this.onboarding = !skipOnboarding;
    if (this.onboarding) this.startPattern('onboarding', 0);
    else this.startPattern('onboarding', 14);     // returning players skip the first lessons
  }

  onSectorStart() {
    this.fired = {};
    this.timer = 1.0;           // 1 s with no new spawns during the transition
  }

  startPattern(name, startAt = 0) {
    const p = PATTERNS[name];
    this.pattern = {
      name, def: p, events: p.events, next: 0,
      mirror: !p.scripted && Math.random() < 0.5,
      gap: null, warn: p.warn || 0,
    };
    this.patternT = startAt;
    // skip events before startAt
    while (this.pattern.next < p.events.length && p.events[this.pattern.next][0] < startAt) this.pattern.next++;
    if (p.warn) this.game.warnTimer = p.warn;
  }

  update(dt) {
    const g = this.game;
    const t = g.sectorTime;
    const sec = getSector(g.sector);

    // scheduled patterns (not during the scripted onboarding)
    if (!this.pattern && !this.onboarding) {
      const sig = sec.signature === 'medley'
        ? SIGNATURE_POOL[Math.floor(Math.random() * SIGNATURE_POOL.length)]
        : sec.signature;
      if (t >= 12 && !this.fired.a) { this.fired.a = true; this.startPattern(sig); }
      else if (t >= 21 && !this.fired.b) { this.fired.b = true; this.startPattern(sig); }
      else if (t >= 26 && !this.fired.c) { this.fired.c = true; this.startPattern('breather'); }
    }

    if (this.pattern) { this.runPattern(dt, sec); return; }  // random spawns pause during patterns

    const mult = t < 10 ? 1.2 : t < 20 ? 1.0 : 0.85;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = sec.interval * mult;
      this.randomSpawn(sec);
    }
  }

  runPattern(dt, sec) {
    const p = this.pattern;
    if (p.warn > 0) { p.warn -= dt; return; }          // wait for the warning chevrons
    // pattern time runs faster in faster sectors (except the onboarding script)
    this.patternT += dt * (p.def.scripted ? 1 : sec.speed);
    while (p.next < p.events.length && p.events[p.next][0] <= this.patternT) {
      this.spawnEvent(p.events[p.next], p, sec);
      p.next++;
    }
    if (p.next >= p.events.length && this.patternT >= p.def.dur) {
      if (p.def.scripted) this.onboarding = false;
      this.pattern = null;
      this.timer = 0.4;
    }
  }

  resolveCharge(c) {
    const pc = this.game.player.charge;
    if (c === 'O') return -pc;
    if (c === 'S') return pc;
    if (c === '+') return 1;
    if (c === '-') return -1;
    if (c === '0') return 0;
    return Math.random() < 0.5 ? 1 : -1;
  }

  resolveLanes(lane, p) {
    const playerLane = Math.max(0, Math.min(LANES - 1, Math.floor((this.game.player.x / W) * LANES)));
    const clamp = (l) => Math.max(0, Math.min(LANES - 1, l));
    if (p.gap === null) {
      // gap always reachable: within 2 lanes of the player (fairness rule)
      p.gap = clamp(playerLane + Math.floor(Math.random() * 5) - 2);
      if (p.gap === LANES - 1) p.gap--;
    }
    if (lane === 'WALL') {
      const out = [];
      for (let l = 0; l < LANES; l++) if (l !== p.gap && l !== p.gap + 1) out.push(l);
      return out;
    }
    if (lane === 'G') return [p.gap];
    if (lane === 'R') return [Math.floor(Math.random() * LANES)];
    if (typeof lane === 'string' && lane[0] === 'P') {
      let off = lane.length > 1 ? parseInt(lane.slice(1), 10) : 0;
      if (p.mirror) off = -off;
      let l = playerLane + off;
      if (l < 0 || l >= LANES) l = playerLane - off;    // bounce off the wall instead of clipping
      return [clamp(l)];
    }
    return [p.mirror ? LANES - 1 - lane : lane];
  }

  spawnEvent([, lane, kind, charge], p, sec) {
    for (const l of this.resolveLanes(lane, p)) {
      let k = kind;
      if (k === 'mine' && lane !== 'WALL' && this.game.countMines() >= sec.maxMines) k = 'coin';
      if (k === 'powerup') { this.spawnPowerup(laneX(l)); continue; }
      const jitter = (Math.random() - 0.5) * 0.3 * (W / LANES);
      this.game.spawn(k, laneX(l) + jitter, this.resolveCharge(charge));
    }
  }

  spawnPowerup(x) {
    const g = this.game;
    const P = CONFIG.powerups;
    const tooSoon = g.runTime < P.firstAt || g.runTime - this.lastPowerup < P.minGap || g.countKind('powerup') > 0;
    if (tooSoon) { g.spawn('coin', x, this.resolveCharge('O')); return; }
    this.lastPowerup = g.runTime;
    const weights = {};
    for (const k in P.types) weights[k] = P.types[k].weight;
    if (g.lives === 1) weights.shield *= 3;          // comeback rule: shield first when on last life
    g.spawn('powerup', x, 0, pickWeighted(weights));
  }

  randomSpawn(sec) {
    const g = this.game;
    if (g.objects.items.filter((o) => o.alive).length >= CONFIG.spawn.maxObjects) return;
    const weights = { ...sec.weights };
    if (g.lives === 1) weights.powerup = CONFIG.spawn.comebackPowerup;
    let kind = pickWeighted(weights);

    // x: 25 % of spawns aim near the player (stops corner camping), the rest are random
    let x = CONFIG.spawn.pressureChance > Math.random()
      ? g.player.x + (Math.random() * 2 - 1) * CONFIG.spawn.pressureSpread
      : 30 + Math.random() * (W - 60);
    x = Math.max(24, Math.min(W - 24, x));

    if (kind === 'powerup') { this.spawnPowerup(x); return; }
    if ((kind === 'mine' || kind === 'flicker') && g.countMines() >= sec.maxMines) kind = 'coin';

    let charge = Math.random() < 0.5 ? 1 : -1;
    if (kind === 'rock') charge = 0;
    if (kind === 'mine' && !this.firstMineDone) { charge = g.player.charge; this.firstMineDone = true; }

    // mine clusters from sector 5: 3 same-charge mines 60 px apart
    if (kind === 'mine' && g.sector >= 5 && Math.random() < 0.15 && g.countMines() + 3 <= sec.maxMines) {
      const cx = Math.max(84, Math.min(W - 84, x));
      for (let i = -1; i <= 1; i++) g.spawn('mine', cx + i * 60, charge);
      return;
    }
    g.spawn(kind, x, charge);
  }
}
