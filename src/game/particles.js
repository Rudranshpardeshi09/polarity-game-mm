// Visual effects with object pools: everything is allocated once, then recycled (no garbage-collector stutter).
import { drawSprite } from './sprites.js';

export class Pool {
  constructor(size, make) {
    this.items = Array.from({ length: size }, make);
  }
  // returns a dead item (or null if all are busy), marking it alive
  get() {
    for (const it of this.items) if (!it.alive) { it.alive = true; return it; }
    return null;
  }
  forEachAlive(fn) {
    for (const it of this.items) if (it.alive) fn(it);
  }
  clear() { for (const it of this.items) it.alive = false; }
}

export class Effects {
  constructor(sprites) {
    this.sprites = sprites;
    this.particles = new Pool(300, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 8, color: 'white' }));
    this.rings = new Pool(24, () => ({ alive: false, x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, color: 'white' }));
    this.texts = new Pool(24, () => ({ alive: false, x: 0, y: 0, life: 0, max: 1, text: '', color: '#fff', size: 18 }));
    this.lowFx = false;
  }

  burst(x, y, color, count = 12, speed = 220, size = 8) {
    if (this.lowFx) count = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      const p = this.particles.get();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.max = p.life = 0.35 + Math.random() * 0.25;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = color;
    }
  }

  ring(x, y, color, r0, r1, dur = 0.3) {
    const r = this.rings.get();
    if (!r) return;
    r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.max = r.life = dur; r.color = color;
  }

  text(x, y, text, color, size = 18) {
    const t = this.texts.get();
    if (!t) return;
    t.x = x; t.y = y; t.text = text; t.color = color; t.size = size; t.max = t.life = 0.8;
  }

  update(dt) {
    this.particles.forEachAlive((p) => {
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; return; }
      p.vx *= 0.9; p.vy *= 0.9;
      p.x += p.vx * dt; p.y += p.vy * dt;
    });
    this.rings.forEachAlive((r) => { r.life -= dt; if (r.life <= 0) r.alive = false; });
    this.texts.forEachAlive((t) => { t.life -= dt; t.y -= 50 * dt; if (t.life <= 0) t.alive = false; });
  }

  // additive pass: particles + rings
  drawGlow(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    this.particles.forEachAlive((p) => {
      ctx.globalAlpha = p.life / p.max;
      drawSprite(ctx, this.sprites.dot[p.color], p.x, p.y, p.size * 2);
    });
    this.rings.forEachAlive((r) => {
      const k = 1 - r.life / r.max;
      const e = 1 - (1 - k) * (1 - k); // ease-out
      ctx.globalAlpha = 1 - k;
      const rad = r.r0 + (r.r1 - r.r0) * e;
      drawSprite(ctx, this.sprites.ring[r.color], r.x, r.y, rad * (128 / 56));
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.texts.forEachAlive((t) => {
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${t.size}px Orbitron, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    });
    ctx.globalAlpha = 1;
  }

  clear() { this.particles.clear(); this.rings.clear(); this.texts.clear(); }
}
