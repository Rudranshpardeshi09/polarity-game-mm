// Parallax background: cached base gradient + 2 star layers + synthwave perspective floor + fog.
// Everything expensive is drawn once into offscreen canvases; each frame only scrolls them.
import { COLORS } from './config.js';
import { hexA } from './sprites.js';

const W = 600, H = 800, RES = 1.5;
const HORIZON = 470;

function cache(draw, w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w * RES; c.height = h * RES;
  const ctx = c.getContext('2d');
  ctx.scale(RES, RES);
  draw(ctx);
  return c;
}

function starLayer(count, maxR, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return cache((ctx) => {
    for (let i = 0; i < count; i++) {
      const x = rnd() * W, y = rnd() * H, r = 0.4 + rnd() * maxR;
      ctx.fillStyle = `rgba(220,235,255,${0.25 + rnd() * 0.6})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Floor rays converge on a vanishing point; drawn in white, then tinted per sector.
function floorRays(color) {
  return cache((ctx) => {
    const g = ctx.createLinearGradient(0, HORIZON, 0, H);
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(1, hexA(color, 0.55));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) {
      ctx.moveTo(W / 2 + i * 8, HORIZON);
      ctx.lineTo(W / 2 + i * 95, H);
    }
    ctx.stroke();
    // horizon glow
    const hg = ctx.createLinearGradient(0, HORIZON - 60, 0, HORIZON + 30);
    hg.addColorStop(0, hexA(color, 0));
    hg.addColorStop(0.7, hexA(color, 0.28));
    hg.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(0, HORIZON - 60, W, 90);
  });
}

function baseGradient(color) {
  return cache((ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.void);
    g.addColorStop(0.55, COLORS.navy);
    g.addColorStop(1, hexA(color, 0.18));
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

function vignette() {
  return cache((ctx) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

export class Background {
  constructor(sprites) {
    this.sprites = sprites;
    this.starsFar = starLayer(140, 0.9, 7);
    this.starsNear = starLayer(50, 1.6, 31);
    this.vignette = vignette();
    this.layers = new Map(); // tint -> {base, rays}
    this.cur = null; this.prev = null; this.fade = 1;
    this.t = 0;
    this.setTint('#1E5BFF', true);
  }

  getLayer(tint) {
    if (!this.layers.has(tint)) this.layers.set(tint, { base: baseGradient(tint), rays: floorRays(tint), tint });
    return this.layers.get(tint);
  }

  setTint(tint, instant = false) {
    const next = this.getLayer(tint);
    if (this.cur === next) return;
    this.prev = instant ? null : this.cur;
    this.cur = next;
    this.fade = instant ? 1 : 0;
  }

  update(dt, speed) {
    this.t += dt * speed;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 1.2);
  }

  drawLayer(ctx, L, alpha, lowFx) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(L.base, 0, 0, W, H);
    ctx.drawImage(L.rays, 0, 0, W, H);
    // horizontal floor lines scroll toward the player (perspective spacing), one path per frame
    ctx.strokeStyle = hexA(L.tint, 0.45 * alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = lowFx ? 8 : 12;
    const phase = (this.t * 0.6) % 1;
    for (let i = 0; i < n; i++) {
      const p = (i + phase) / n;            // 0..1 along the floor
      const y = HORIZON + (H - HORIZON) * p * p;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  draw(ctx, lowFx) {
    if (this.prev && this.fade < 1) this.drawLayer(ctx, this.prev, 1, lowFx);
    this.drawLayer(ctx, this.cur, this.prev ? this.fade : 1, lowFx);
    ctx.globalAlpha = 1;

    // stars: two layers wrap vertically at different speeds (parallax)
    const yFar = (this.t * 12) % H, yNear = (this.t * 34) % H;
    ctx.drawImage(this.starsFar, 0, yFar - H, W, H);
    ctx.drawImage(this.starsFar, 0, yFar, W, H);
    if (!lowFx) {
      ctx.drawImage(this.starsNear, 0, yNear - H, W, H);
      ctx.drawImage(this.starsNear, 0, yNear, W, H);
      // energy fog: two big soft blobs drifting, additive
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      const a = this.sprites.fogA, b = this.sprites.fogB;
      ctx.drawImage(a.canvas, 120 + Math.sin(this.t * 0.17) * 140 - 260, 260 + Math.cos(this.t * 0.11) * 80 - 260, 520, 520);
      ctx.drawImage(b.canvas, 480 + Math.cos(this.t * 0.13) * 140 - 260, 380 + Math.sin(this.t * 0.09) * 90 - 260, 520, 520);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawVignette(ctx) {
    ctx.drawImage(this.vignette, 0, 0, W, H);
  }
}
