// POLARITY DROP — game engine.
// Fixed-timestep loop (60 updates/s) + requestAnimationFrame rendering.
// States: menu (attract demo) → playing ⇄ paused → countdown → playing … → dying → over
import { CONFIG, COLORS, SECTOR_LENGTH, getSector } from './config.js';
import { buildSprites, drawSprite, hexA } from './sprites.js';
import { Background } from './background.js';
import { Effects, Pool } from './particles.js';
import { Spawner } from './spawner.js';
import { audio } from './audio.js';

const W = CONFIG.world.width, H = CONFIG.world.height;
const STEP = 1 / 60;

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cb = callbacks;
    this.sprites = buildSprites();
    this.bg = new Background(this.sprites);
    this.fx = new Effects(this.sprites);
    this.spawner = new Spawner(this);
    this.objects = new Pool(CONFIG.spawn.maxObjects + 10, () => ({ alive: false }));
    this.settings = { lowFx: false, showFps: false };
    this.keys = new Set();
    this.pointer = { active: false, x: W / 2, touchId: null, startX: 0, startY: 0, startT: 0, offset: 0, moved: false };
    this.fps = { frames: 0, t: 0, value: 60 };
    this.state = 'menu';
    this.resetGame(true);
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
    this.onVisibility = () => {
      if (document.hidden) { if (this.state === 'playing') this.pause(); audio.suspend(); }
      else audio.resume();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle
  resetGame(demo = false) {
    this.demo = demo;
    this.player = { x: W / 2, y: CONFIG.player.y, charge: 1, cooldown: 0, invuln: 0, flipAnim: 0, vx: 0,
      // Volt's animation state: lean angle, mood ('happy' | 'hurt' | ''), blink timer, where the eyes look
      tilt: 0, mood: '', moodT: 0, blinkT: 2, lookX: 0, lookY: 0 };
    this.objects.clear();
    this.fx.clear();
    this.score = 0; this.displayScore = 0;
    this.lives = CONFIG.player.lives;
    this.streak = 0;
    this.sector = demo ? 2 : 1;
    this.sectorTime = demo ? 2 : 0;
    this.runTime = demo ? 30 : 0;
    this.sectorHit = false;
    this.shield = false;
    this.active = {};             // power-up timers: { stasis: 3.2, overload: 1.1 }
    this.warned = {};
    this.flipLock = 0;
    this.freeze = 0; this.shake = 0; this.flash = 0; this.flashColor = COLORS.danger;
    this.warnTimer = 0;
    this.banner = 0;
    this.dyingT = 0;
    this.countdown = 0;
    this.stats = { coins: 0, coinsInField: 0, maxStreak: 0, peakMult: 1, minesRepelled: 0, flips: 0, wasted: 0, time: 0 };
    this.bg.setTint(getSector(this.sector).tint, true);
    this.spawner.reset(demo || this.skipOnboarding);
    if (demo) {                   // title-screen demo: no tutorial script, straight to random spawns
      this.spawner.onboarding = false;
      this.spawner.pattern = null;
    }
  }

  start(skipOnboarding = false) {
    audio.unlock();
    this.skipOnboarding = skipOnboarding;
    this.resetGame(false);
    this.setState('playing');
    this.banner = 2.2;
    audio.muffle(false);
    audio.setIntensity(1);
    audio.startMusic();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    audio.muffle(true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.countdown = 3;
    this.setState('countdown');
    audio.play('tick');
  }

  toMenu() {
    this.resetGame(true);
    this.setState('menu');
    audio.muffle(true, 900);
    audio.setIntensity(0);
  }

  setState(s) {
    this.state = s;
    this.cb.onState?.(s);
  }

  setSettings(s) {
    Object.assign(this.settings, s);
    this.fx.lowFx = this.settings.lowFx;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    audio.stopMusic();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    const cw = parent.clientWidth, ch = parent.clientHeight;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
    this.ox = (this.canvas.width - W * this.scale) / 2;
    // tall phones: anchor the play area to the bottom (thumb zone) and show extra sky above it
    this.oy = this.canvas.height - H * this.scale;
    this.topY = -this.oy / this.scale;         // world y of the top edge of the screen (≤ 0)
    this.cssScale = this.scale / dpr;
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', ' ', 'a', 'd'].includes(k) && this.state !== 'menu') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      this.pointer.active = false;   // keyboard takes over from the mouse
      if (k === ' ' && this.state === 'playing') this.flip();
      if ((k === 'p' || k === 'escape') && this.state === 'playing') this.pause();
      if (k === 'f') { this.settings.showFps = !this.settings.showFps; this.cb.onSettings?.({ showFps: this.settings.showFps }); }
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const c = this.canvas;
    const toWorldX = (e) => {
      const r = c.getBoundingClientRect();
      return ((e.clientX - r.left) * (c.width / r.width) - this.ox) / this.scale;
    };
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.pointer.active = true; this.pointer.x = toWorldX(e); return; }
      if (e.pointerId !== this.pointer.touchId) return;
      const x = toWorldX(e);
      if (Math.abs(x - this.pointer.startX) > 12) this.pointer.moved = true;
      this.pointer.x = x + this.pointer.offset;
    });
    c.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      if (e.pointerType === 'mouse') { if (e.button === 0) this.flip(); return; }
      // touch: drag to move (relative, so the finger doesn't cover the core), tap to flip
      c.setPointerCapture(e.pointerId);
      const x = toWorldX(e);
      Object.assign(this.pointer, { active: true, touchId: e.pointerId, startX: x, startT: performance.now(), moved: false, offset: this.player.x - x, x: this.player.x });
    });
    const end = (e) => {
      if (e.pointerId !== this.pointer.touchId) return;
      if (!this.pointer.moved && performance.now() - this.pointer.startT < 250 && this.state === 'playing') this.flip();
      this.pointer.touchId = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  flip() {
    const p = this.player;
    if (p.cooldown > 0 || this.flipLock > 0) return;
    p.charge *= -1;
    p.cooldown = CONFIG.player.flipCooldown;
    p.flipAnim = 1;
    this.stats.flips++;
    this.fx.ring(p.x, p.y, p.charge > 0 ? 'pos' : 'neg', 20, CONFIG.magnet.fieldRadius, 0.35);
    if (!this.demo) audio.play(p.charge > 0 ? 'flipPos' : 'flipNeg');
  }

  // ---------------------------------------------------------------- spawning helpers
  spawn(kind, x, charge, puType = null) {
    const o = this.objects.get();
    if (!o) return;
    const def = CONFIG.items[kind];
    const sp = getSector(this.sector).speed;
    o.kind = kind; o.def = def;
    o.x = x; o.y = Math.min(0, this.topY) - def.radius - 10;
    o.vx = 0; o.vy = CONFIG.physics.vy0 * sp * (def.fallMult || 1);
    o.r = def.radius; o.charge = charge;
    o.cycleT = Math.random() * 0.5; o.entered = false;
    o.puType = puType; o.spin = Math.random() * Math.PI * 2;
  }

  countMines() {
    let n = 0;
    this.objects.forEachAlive((o) => { if (o.kind === 'mine' || o.kind === 'flicker') n++; });
    return n;
  }

  countKind(kind) {
    let n = 0;
    this.objects.forEachAlive((o) => { if (o.kind === kind) n++; });
    return n;
  }

  // ---------------------------------------------------------------- scoring
  mult() {
    const S = CONFIG.scoring;
    return Math.min(S.maxMult, 1 + Math.floor(this.streak / S.comboTierSize));
  }

  // every score change goes through here (customization hook: e.g. double-points power-up)
  addScore(base) {
    const pts = Math.round(base * CONFIG.scoring.globalMult);
    this.score = Math.max(0, this.score + pts);
    return pts;
  }

  addStreak() {
    const before = this.mult();
    this.streak++;
    this.stats.maxStreak = Math.max(this.stats.maxStreak, this.streak);
    const m = this.mult();
    this.stats.peakMult = Math.max(this.stats.peakMult, m);
    if (m > before) this.fx.text(this.player.x, this.player.y - 70, `×${m} COMBO`, COLORS.goldHi, 22);
  }

  // every collision effect goes through here (customization hook: add a case)
  applyEffect(effect, o) {
    const p = this.player;
    switch (effect) {
      case 'score': {
        const pts = this.addScore(o.def.points * this.mult());
        this.addStreak();
        this.stats.coins++;
        this.fx.burst(o.x, o.y, 'gold', 12);
        this.fx.burst(o.x, o.y, o.charge > 0 ? 'pos' : 'neg', 6, 160);
        this.fx.ring(o.x, o.y, 'gold', 14, 48, 0.25);
        this.fx.text(o.x, o.y - 24, `+${pts}`, o.kind === 'prism' ? '#FFFFFF' : COLORS.gold, o.kind === 'prism' ? 24 : 18);
        this.flash = 0.06; this.flashColor = COLORS.gold;
        this.setMood('happy', 0.45);
        if (!this.demo) audio.play(o.kind === 'prism' ? 'prism' : 'coin', this.mult() - 1);
        return true;
      }
      case 'hit': {
        const isMine = o.kind === 'mine' || o.kind === 'flicker';
        if (isMine && this.active.overload > 0) {           // Overload: mines are discharged → bonus
          const pts = this.addScore(o.def.overloadPoints * this.mult());
          this.addStreak();
          this.fx.burst(o.x, o.y, 'overload', 14);
          this.fx.text(o.x, o.y - 24, `+${pts}`, COLORS.overload, 20);
          if (!this.demo) audio.play('discharge');
          return true;
        }
        if (p.invuln > 0 || this.hitThisTick) return false; // passes through
        this.hitThisTick = true;
        if (this.demo) { this.fx.burst(o.x, o.y, 'red', 10); return true; }
        if (this.shield) {
          this.shield = false;
          p.invuln = 0.5;
          this.fx.ring(p.x, p.y, 'shield', 20, 90, 0.4);
          this.fx.burst(o.x, o.y, 'shield', 16);
          audio.play('shieldBlock');
          return true;
        }
        this.lives--;
        this.streak = 0;
        this.sectorHit = true;
        p.invuln = CONFIG.player.invulnTime;
        this.setMood('hurt', CONFIG.player.invulnTime);
        this.freeze = 0.06; this.shake = 10; this.flash = 0.25; this.flashColor = COLORS.danger;
        this.fx.burst(o.x, o.y, 'red', 22, 320, 10);
        this.fx.ring(o.x, o.y, 'red', 10, 110, 0.4);
        audio.play('hit');
        if (this.lives <= 0) this.die();
        return true;
      }
      case 'powerup': {
        const type = o.puType;
        const def = CONFIG.powerups.types[type];
        this.fx.burst(o.x, o.y, type, 16);
        this.fx.ring(p.x, p.y, type, 24, 120, 0.4);
        this.setMood('happy', 0.8);
        if (!this.demo) audio.play('powerup');
        if (type === 'shield') {
          if (this.shield) this.fx.text(o.x, o.y - 24, `+${this.addScore(def.duplicatePoints)}`, COLORS.shield, 18);
          this.shield = true;
          this.fx.text(p.x, p.y - 70, 'SHIELD', COLORS.shield, 20);
        } else {
          this.active[type] = def.duration;        // same power-up again → refresh, no stacking
          this.warned[type] = false;
          this.fx.text(p.x, p.y - 70, type.toUpperCase(), COLORS[type], 20);
        }
        return true;
      }
      default:
        return true;
    }
  }

  wasteCoin(o) {
    this.addScore(CONFIG.scoring.wastedPenalty);
    const m = this.mult();
    this.streak = Math.max(0, (m - 2) * CONFIG.scoring.comboTierSize);   // drop one combo tier
    this.stats.wasted++;
    this.fx.text(Math.max(30, Math.min(W - 30, o.x)), H - 30, `${CONFIG.scoring.wastedPenalty}`, COLORS.textDim, 16);
    audio.play('wasted');
  }

  die() {
    this.setState('dying');
    this.dyingT = 0.9;
    audio.muffle(true, 200);
    this.fx.burst(this.player.x, this.player.y, this.player.charge > 0 ? 'pos' : 'neg', 40, 420, 12);
  }

  // ---------------------------------------------------------------- update
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;                    // tab was hidden → don't simulate a huge jump
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.fps.frames++; this.fps.t += dt;
    if (this.fps.t >= 0.5) { this.fps.value = Math.round(this.fps.frames / this.fps.t); this.fps.frames = 0; this.fps.t = 0; }
    this.render();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const st = this.state;
    this.bg.update(dt, st === 'paused' ? 0 : getSector(this.sector).speed);

    if (st === 'paused' || st === 'over') return;
    if (st === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) audio.play('tick');
      if (this.countdown <= 0) { this.setState('playing'); audio.muffle(false); }
      return;
    }
    this.fx.update(dt);
    if (st === 'dying') {
      this.dyingT -= dt;
      if (this.dyingT <= 0) {
        this.setState('over');
        audio.play('gameOver');
        audio.stopMusic();
        this.stats.time = this.runTime;
        this.cb.onGameOver?.({ score: this.score, sector: this.sector, ...this.stats });
      }
      return;
    }
    if (this.freeze > 0) { this.freeze -= dt; return; }   // hit-stop

    this.runTime += dt;
    this.sectorTime += dt;
    this.shake *= Math.pow(0.001, dt);
    if (this.flash > 0) this.flash -= dt;
    if (this.banner > 0) this.banner -= dt;
    if (this.warnTimer > 0) this.warnTimer -= dt;
    if (this.flipLock > 0) this.flipLock -= dt;

    // sector progression
    if (this.sectorTime >= SECTOR_LENGTH) this.nextSector();

    // power-up timers
    for (const k in this.active) {
      if (this.active[k] > 0) {
        this.active[k] -= dt;
        const warn = CONFIG.powerups.types[k].warn || 1;
        if (this.active[k] < warn && !this.warned[k]) { this.warned[k] = true; if (!this.demo) audio.play('powerWarn'); }
      }
    }

    this.updatePlayer(dt);
    this.spawner.update(dt);
    this.updateObjects(dt);
  }

  nextSector() {
    if (!this.demo) {
      const bonus = CONFIG.scoring.sectorClearBase * this.sector * (this.sectorHit ? 1 : CONFIG.scoring.perfectSectorMult);
      this.addScore(bonus);
      this.fx.text(W / 2, 300, `SECTOR CLEAR +${bonus}${this.sectorHit ? '' : '  PERFECT'}`, COLORS.goldHi, 22);
      audio.play('sector');
    }
    this.sector++;
    this.sectorTime = 0;
    this.sectorHit = false;
    this.banner = 2.2;
    this.bg.setTint(getSector(this.sector).tint);
    this.spawner.onSectorStart(this.sector);
    if (!this.demo) audio.setIntensity(this.sector);
    if (this.demo && this.sector > 4) { this.sector = 2; }
    this.onSectorStart(this.sector);
  }

  // customization hook: called at the start of every sector
  onSectorStart() {}

  updatePlayer(dt) {
    const p = this.player, P = CONFIG.player;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.flipAnim > 0) p.flipAnim -= dt * 4;

    const oldX = p.x;
    if (this.demo) {
      this.botControl(dt);
    } else {
      let dir = 0;
      if (this.keys.has('arrowleft') || this.keys.has('a')) dir -= 1;
      if (this.keys.has('arrowright') || this.keys.has('d')) dir += 1;
      if (dir !== 0) {
        p.x += dir * P.keySpeed * dt;
        this.pointer.active = false;
      } else if (this.pointer.active) {
        const d = this.pointer.x - p.x;
        const max = P.pointerMaxSpeed * dt;
        p.x += Math.max(-max, Math.min(max, d));
      }
    }
    p.x = Math.max(P.radius, Math.min(W - P.radius, p.x));
    p.vx = (p.x - oldX) / dt;
    audio.music.tense = this.lives === 1 && !this.demo;
    this.animateVolt(dt);
  }

  setMood(mood, time) {
    this.player.mood = mood;
    this.player.moodT = time;
  }

  // Volt's body language: lean into the movement, blink now and then, eyes follow the nearest object
  animateVolt(dt) {
    const p = this.player;
    const targetTilt = Math.max(-0.3, Math.min(0.3, p.vx / 1300));
    p.tilt += (targetTilt - p.tilt) * Math.min(1, dt * 10);
    if (p.moodT > 0) { p.moodT -= dt; if (p.moodT <= 0) p.mood = ''; }
    p.blinkT -= dt;
    if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3;

    let near = null, nd = 300 * 300;
    this.objects.forEachAlive((o) => {
      const dx = o.x - p.x, dy = o.y - p.y, d = dx * dx + dy * dy;
      if (d < nd) { nd = d; near = o; }
    });
    let lx = 0, ly = 0;
    if (near) {
      const dx = near.x - p.x, dy = near.y - (p.y - 35), d = Math.hypot(dx, dy) || 1;
      lx = (dx / d) * 2.5; ly = (dy / d) * 2;
    }
    p.lookX += (lx - p.lookX) * Math.min(1, dt * 8);
    p.lookY += (ly - p.lookY) * Math.min(1, dt * 8);
  }

  // simple AI for the title-screen demo: chase the nearest coin, flip to attract it / repel close mines
  botControl(dt) {
    const p = this.player;
    let coin = null, mine = null, cd = 1e9, md = 1e9;
    this.objects.forEachAlive((o) => {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if ((o.kind === 'coin' || o.kind === 'prism') && o.y < p.y && d < cd) { cd = d; coin = o; }
      if ((o.kind === 'mine' || o.kind === 'flicker') && d < md) { md = d; mine = o; }
    });
    let target = W / 2;
    if (coin) target = coin.x;
    if (mine && md < 140) target = p.x + (p.x > mine.x ? 120 : -120);
    const max = 300 * dt;
    p.x += Math.max(-max, Math.min(max, target - p.x));
    const wantCharge = mine && md < 170 ? mine.charge : coin ? -coin.charge : p.charge;
    if (wantCharge && wantCharge !== p.charge && Math.random() < 0.08) this.flip();
  }

  updateObjects(dt) {
    const p = this.player, M = CONFIG.magnet, PH = CONFIG.physics;
    const sp = getSector(this.sector).speed;
    const odt = dt * (this.active.stasis > 0 ? CONFIG.powerups.types.stasis.slow : 1);
    const R2 = M.fieldRadius * M.fieldRadius;
    const maxFall = Math.min(PH.maxFall * sp, PH.hardMaxFall);
    this.hitThisTick = false;

    this.objects.forEachAlive((o) => {
      // charge cycling (prism coins, flicker mines)
      if (o.def.charge === 'cycle') {
        o.cycleT += odt;
        if (o.cycleT >= o.def.cycle) { o.cycleT = 0; o.charge *= -1; }
      }
      o.spin += odt * (o.kind === 'coin' || o.kind === 'prism' ? 5 : 1.2);

      // gravity
      o.vy = Math.min(o.vy + PH.gravity * sp * odt, maxFall * (o.def.fallMult || 1));

      // magnet: a = ±K / d², only inside the field radius
      const dx = p.x - o.x, dy = p.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        o.entered = true;
        if (o.def.magnetic && o.charge !== 0) {
          const d = Math.sqrt(d2) || 1;
          const sign = o.charge === p.charge ? -1 : 1;        // same → repel, opposite → attract
          const md = Math.max(d, M.minDist);
          const a = Math.min(M.forceMax, M.K / (md * md)) * sign;
          o.vx += (a * dx / d) * odt;
          o.vy += (a * dy / d) * odt;
          if (sign < 0 && Math.abs(dx) < M.centreNudge) o.vx += (o.x < W / 2 ? 60 : -60) * odt;
        }
      }
      o.vx *= 1 - M.lateralDamping * odt;
      o.vy = Math.max(o.vy, M.minFallSpeed);                 // never hover: everything leaves the screen
      o.x += o.vx * odt;
      o.y += o.vy * odt;

      // side walls bounce
      if (o.x < o.r) { o.x = o.r; o.vx = -o.vx * PH.wallBounce; }
      else if (o.x > W - o.r) { o.x = W - o.r; o.vx = -o.vx * PH.wallBounce; }

      // off the bottom
      if (o.y - o.r > H) {
        if ((o.kind === 'coin' || o.kind === 'prism') && o.entered && !this.demo) this.wasteCoin(o);
        if ((o.kind === 'mine' || o.kind === 'flicker') && o.entered) this.stats.minesRepelled++;
        if ((o.kind === 'coin' || o.kind === 'prism') && o.entered) this.stats.coinsInField++;
        o.alive = false;
      }
    });

    // collisions: circle vs circle, no sqrt — order: power-ups, coins, hazards (spec 01 §4)
    const pr = CONFIG.player.radius;
    for (const pass of ['powerup', 'score', 'hit']) {
      this.objects.forEachAlive((o) => {
        if (o.def.effect !== pass) return;
        const dx = p.x - o.x, dy = p.y - o.y, rr = pr + o.r;
        if (dx * dx + dy * dy < rr * rr) {
          if (pass === 'score') this.stats.coinsInField++;
          if (this.applyEffect(o.def.effect, o)) o.alive = false;
        }
      });
      if (this.state === 'dying') return;
    }
  }

  // ---------------------------------------------------------------- render
  render() {
    const ctx = this.ctx, S = this.scale;
    const lowFx = this.settings.lowFx;
    // letterbox fill
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // world (with screen shake)
    const sx = this.shake > 0.3 && !lowFx ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0.3 && !lowFx ? (Math.random() - 0.5) * this.shake : 0;
    this.bx = this.ox + sx * S; this.by = this.oy + sy * S;
    // background is stretched to cover the whole canvas (incl. the extra sky on tall phones)
    ctx.setTransform(S, 0, 0, this.canvas.height / H, this.ox, 0);
    this.bg.draw(ctx, lowFx);
    ctx.setTransform(S, 0, 0, S, this.bx, this.by);
    this.drawField(ctx);
    this.drawObjects(ctx);
    this.drawPlayer(ctx);
    this.fx.drawGlow(ctx);
    this.fx.drawTexts(ctx);

    // full-screen overlays (no shake)
    ctx.setTransform(S, 0, 0, this.canvas.height / H, this.ox, 0);
    this.bg.drawVignette(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash * (this.flashColor === COLORS.danger ? 1.6 : 1));
      ctx.fillStyle = hexA(this.flashColor, this.flashColor === COLORS.danger ? 0.35 : 0.12);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.active.stasis > 0) { ctx.fillStyle = hexA(COLORS.stasis, 0.06); ctx.fillRect(0, 0, W, H); }
    // HUD pinned to the top of the screen; banners etc. in play-area coordinates
    ctx.setTransform(S, 0, 0, S, this.ox, 0);
    if (this.state !== 'menu') this.drawHud(ctx);
    if (this.warnTimer > 0) this.drawWarning(ctx);
    ctx.setTransform(S, 0, 0, S, this.ox, this.oy);
    if (this.banner > 0 && this.state !== 'menu') this.drawBanner(ctx);
    if (this.state === 'countdown') this.drawCountdown(ctx);
    if (this.settings.showFps) {
      ctx.font = '600 12px Rajdhani, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = COLORS.stasis;
      ctx.fillText(`${this.fps.value} FPS`, 10, H - 12);
    }
  }

  drawField(ctx) {
    const p = this.player, R = CONFIG.magnet.fieldRadius;
    const col = p.charge > 0 ? COLORS.pos : COLORS.neg;
    // field ring (rotates clockwise for +, counter-clockwise for −)
    ctx.strokeStyle = hexA(col, 0.22 + (p.flipAnim > 0 ? p.flipAnim * 0.4 : 0));
    ctx.lineWidth = 1.5;
    ctx.setLineDash(p.charge > 0 ? [14, 10] : [4, 8]);
    ctx.lineDashOffset = this.runTime * (p.charge > 0 ? -30 : 30);
    ctx.beginPath(); ctx.arc(p.x, p.y, R, Math.PI, Math.PI * 2); ctx.stroke();
    // field lines to the nearest affected objects (max 8): attract = solid-ish, repel = sparse dashes
    if (!this.settings.lowFx) {
      let n = 0;
      ctx.lineWidth = 1;
      for (const sign of [1, -1]) {
        ctx.beginPath();
        ctx.setLineDash(sign > 0 ? [6, 6] : [2, 10]);
        ctx.lineDashOffset = this.runTime * (sign > 0 ? 40 : -40);
        this.objects.forEachAlive((o) => {
          if (n >= 8 || !o.def.magnetic || o.charge === 0) return;
          const attract = o.charge !== p.charge;
          if ((sign > 0) !== attract) return;
          const dx = o.x - p.x, dy = o.y - p.y;
          if (dx * dx + dy * dy > R * R) return;
          ctx.moveTo(p.x, p.y); ctx.lineTo(o.x, o.y);
          n++;
        });
        ctx.strokeStyle = hexA(sign > 0 ? col : COLORS.danger, 0.35);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  drawObjects(ctx) {
    const S = this.scale, bx = this.bx, by = this.by;
    const s = this.sprites;
    const overload = this.active.overload > 0;
    const overloadBlink = overload && this.active.overload < 1 && Math.floor(this.runTime * 10) % 2 === 0;
    this.objects.forEachAlive((o) => {
      let spr, size, scaleX = 1, rot = 0;
      switch (o.kind) {
        case 'coin':  spr = o.charge > 0 ? s.coin_pos : s.coin_neg; scaleX = 0.55 + 0.45 * Math.abs(Math.cos(o.spin)); break;
        case 'prism': spr = o.charge > 0 ? s.prism_pos : s.prism_neg; scaleX = 0.55 + 0.45 * Math.abs(Math.cos(o.spin)); break;
        case 'mine':
        case 'flicker': {
          const warn = o.kind === 'flicker' && o.cycleT > o.def.cycle - o.def.warn && Math.floor(o.cycleT * 20) % 2 === 0;
          spr = overload && !overloadBlink ? s.mine_off : warn ? s.mine_off : o.charge > 0 ? s.mine_pos : s.mine_neg;
          break;                    // mines don't rotate, so the +/− glyph stays readable
        }
        case 'rock': spr = s.rock; rot = o.spin * 0.5; break;
        case 'powerup': spr = s['pu_' + o.puType]; break;
        default: return;
      }
      size = spr.size;
      const c = Math.cos(rot), n = Math.sin(rot);
      ctx.setTransform(S * c * scaleX, S * n * scaleX, -S * n, S * c, bx + o.x * S, by + o.y * S);
      ctx.drawImage(spr.canvas, -size / 2, -size / 2, size, size);
      if (o.kind === 'flicker') {   // flicker mines get an extra outer pulse ring
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(o.cycleT * 12);
        drawSprite(ctx, s.ring.red, 0, 0, 52);
        ctx.globalAlpha = 1;
      }
    });
    ctx.setTransform(S, 0, 0, S, bx, by);
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (this.state === 'over' || (this.state === 'dying' && this.dyingT < 0.7)) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 15) % 2 === 0) return;      // blink while invulnerable
    this.drawVolt(ctx, p);
    if (this.shield) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + Math.sin(this.runTime * 5) * 0.2;
      drawSprite(ctx, this.sprites.ring.shield, p.x, p.y, 80);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // flip cooldown arc
    if (p.cooldown > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 33, -Math.PI / 2, -Math.PI / 2 + (p.cooldown / CONFIG.player.flipCooldown) * Math.PI * 2);
      ctx.stroke();
    }
  }

  // Volt: baked body sprite, leaned + bobbing, with a flickering thruster and live eyes
  drawVolt(ctx, p) {
    const S = this.scale, s = this.sprites, pos = p.charge > 0;
    const bob = Math.sin(this.runTime * 4) * 2;
    const c = Math.cos(p.tilt), n = Math.sin(p.tilt);
    // local transform: origin = chest core, rotated by the lean angle
    ctx.setTransform(S * c, S * n, -S * n, S * c, this.bx + p.x * S, this.by + (p.y + bob) * S);

    // thruster flame (additive glow, flickers and grows when moving)
    const flame = pos ? s.flame_pos : s.flame_neg;
    const len = 26 + Math.random() * 6 + Math.min(10, Math.abs(p.vx) / 40);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(flame.canvas, -10, 22, 20, len);
    ctx.globalCompositeOperation = 'source-over';

    // body (pops slightly bigger right after a flip)
    const body = pos ? s.robot_pos : s.robot_neg;
    const k = 1 + Math.max(0, p.flipAnim) * 0.12;
    ctx.drawImage(body.canvas, -65 * k, -65 * k, 130 * k, 130 * k);

    // eyes on the visor
    const eye = pos ? COLORS.posHi : COLORS.negHi;
    const dying = this.state === 'dying';
    ctx.strokeStyle = eye; ctx.fillStyle = eye; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const ex of [-8, 8]) {
      const x = ex * k, y = -35 * k;
      ctx.beginPath();
      if (p.mood === 'hurt' || dying) {               // × ×
        ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3);
        ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3);
        ctx.stroke();
      } else if (p.mood === 'happy') {                 // ^ ^
        ctx.moveTo(x - 4, y + 2); ctx.lineTo(x, y - 2.5); ctx.lineTo(x + 4, y + 2);
        ctx.stroke();
      } else if (p.blinkT < 0) {                       // blink
        ctx.moveTo(x - 3.5, y); ctx.lineTo(x + 3.5, y);
        ctx.stroke();
      } else {                                         // open eyes looking at the nearest object
        ctx.fillRect(x - 3 + p.lookX, y - 4 + p.lookY, 6, 8);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 1.5 + p.lookX, y - 2.5 + p.lookY, 2, 2);
        ctx.fillStyle = eye;
      }
    }
    ctx.lineCap = 'butt';
    ctx.setTransform(S, 0, 0, S, this.bx, this.by);
  }

  drawHud(ctx) {
    // score with dim leading zeros (rolling count-up)
    this.displayScore += (this.score - this.displayScore) * 0.2;
    if (Math.abs(this.score - this.displayScore) < 1) this.displayScore = this.score;
    const str = String(Math.round(this.displayScore)).padStart(7, '0');
    const firstSig = str.search(/[1-9]/);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = '600 11px Rajdhani, sans-serif';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('SCORE', 18, 26);
    ctx.font = '900 26px Orbitron, sans-serif';
    for (let i = 0; i < str.length; i++) {
      ctx.fillStyle = firstSig === -1 || i < firstSig ? 'rgba(244,248,255,0.18)' : COLORS.text;
      ctx.fillText(str[i], 18 + i * 21, 56);
    }

    // combo meter: 5 segments + multiplier
    const m = this.mult();
    const tierProg = m >= CONFIG.scoring.maxMult ? 1 : (this.streak % CONFIG.scoring.comboTierSize) / CONFIG.scoring.comboTierSize;
    for (let i = 0; i < 5; i++) {
      const filled = i < m - 1;
      ctx.fillStyle = filled ? COLORS.gold : 'rgba(255,255,255,0.1)';
      ctx.fillRect(18 + i * 24, 66, 20, 5);
      if (i === m - 1 && m < 5) { ctx.fillStyle = hexA(COLORS.gold, 0.6); ctx.fillRect(18 + i * 24, 66, 20 * tierProg, 5); }
    }
    ctx.font = '900 14px Orbitron, sans-serif';
    ctx.fillStyle = m > 1 ? COLORS.goldHi : COLORS.textDim;
    ctx.fillText(`×${m}`, 142, 72);

    // sector name + progress bar (top centre)
    const sec = getSector(this.sector);
    ctx.textAlign = 'center';
    ctx.font = '600 11px Rajdhani, sans-serif';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(`SECTOR ${this.sector}`, W / 2 + 40, 26);
    ctx.font = '700 13px Orbitron, sans-serif';
    ctx.fillStyle = sec.tint;
    ctx.fillText(sec.name, W / 2 + 40, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(W / 2 - 20, 52, 120, 3);
    ctx.fillStyle = sec.tint;
    ctx.fillRect(W / 2 - 20, 52, 120 * Math.min(1, this.sectorTime / SECTOR_LENGTH), 3);

    // lives as reactor cells (top right, left of the pause button)
    const maxL = Math.max(CONFIG.player.lives, this.lives);
    for (let i = 0; i < maxL; i++) {
      const x = W - 82 - (maxL - 1 - i) * 22, y = 22;
      const on = i < this.lives;
      ctx.fillStyle = on ? (this.lives === 1 ? COLORS.danger : COLORS.pos) : 'rgba(255,255,255,0.08)';
      if (on && this.lives === 1) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.runTime * 8);
      ctx.fillRect(x, y, 14, 26);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = on ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, 15, 27);
    }

    // active power-ups: radial timers under the lives
    let px = W - 36;
    const drawTimer = (kind, frac, label) => {
      const y = 78;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS[kind];
      ctx.beginPath(); ctx.arc(px, y, 13, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      ctx.font = '700 11px Orbitron, sans-serif';
      ctx.fillStyle = COLORS[kind];
      ctx.textAlign = 'center';
      ctx.fillText(label, px, y + 4);
      px -= 36;
    };
    if (this.shield) drawTimer('shield', 1, 'S');
    if (this.active.stasis > 0) drawTimer('stasis', this.active.stasis / CONFIG.powerups.types.stasis.duration, 'T');
    if (this.active.overload > 0) drawTimer('overload', this.active.overload / CONFIG.powerups.types.overload.duration, '⚡');
  }

  drawWarning(ctx) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(this.warnTimer * 16));
    ctx.fillStyle = hexA(COLORS.danger, a);
    for (let i = 0; i < 9; i++) {
      const x = ((i + 0.5) / 9) * W;
      ctx.beginPath();
      ctx.moveTo(x - 12, 96); ctx.lineTo(x, 108); ctx.lineTo(x + 12, 96); ctx.lineTo(x + 12, 102); ctx.lineTo(x, 114); ctx.lineTo(x - 12, 102);
      ctx.closePath(); ctx.fill();
    }
  }

  drawBanner(ctx) {
    const t = 2.2 - this.banner;                     // 0 → 2.2
    const inK = Math.min(1, t / 0.35), outK = Math.min(1, this.banner / 0.35);
    const k = Math.min(inK, outK);
    const ease = 1 - Math.pow(1 - k, 3);
    const sec = getSector(this.sector);
    const y = 330;
    ctx.globalAlpha = ease;
    // light bar
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, hexA(sec.tint, 0)); g.addColorStop(0.5, hexA(sec.tint, 0.25)); g.addColorStop(1, hexA(sec.tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 52, W, 110);
    ctx.fillStyle = sec.tint;
    ctx.fillRect(W / 2 - 160 * ease, y - 52, 320 * ease, 1.5);
    ctx.fillRect(W / 2 - 160 * ease, y + 57, 320 * ease, 1.5);
    ctx.textAlign = 'center';
    ctx.font = '600 13px Rajdhani, sans-serif';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(`SECTOR ${String(this.sector).padStart(2, '0')}`, W / 2, y - 22);
    ctx.font = '900 38px Orbitron, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(sec.name, W / 2 + (1 - ease) * 40, y + 18);
    ctx.font = '600 15px Rajdhani, sans-serif';
    ctx.fillStyle = sec.tint;
    ctx.fillText(sec.intro, W / 2, y + 44);
    ctx.globalAlpha = 1;
  }

  drawCountdown(ctx) {
    const n = Math.ceil(this.countdown);
    const k = this.countdown - Math.floor(this.countdown);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = k;
    ctx.font = `900 ${90 + (1 - k) * 30}px Orbitron, sans-serif`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(String(n), W / 2, H / 2 - 40);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }
}
