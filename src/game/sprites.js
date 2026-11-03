// All graphics are self-made: drawn ONCE into offscreen canvases at startup, then reused with drawImage.
// shadowBlur is only used here (bake time), never in the game loop — that is what keeps rendering fast.
import { COLORS } from './config.js';

const RES = 2; // bake at 2x world resolution so sprites stay crisp on HiDPI screens

function makeSprite(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * RES);
  const ctx = c.getContext('2d');
  ctx.scale(RES, RES);
  ctx.translate(size / 2, size / 2);
  draw(ctx, size);
  return { canvas: c, size };
}

function hexPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function halo(ctx, r, color, alpha = 0.55) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(0.45, hexA(color, alpha * 0.35));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function glyph(ctx, sign, size, color, width = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
  if (sign > 0) { ctx.moveTo(0, -size); ctx.lineTo(0, size); }
  ctx.stroke();
}

// Charge ring: + is a solid ring with 4 ticks, − is a dashed double ring (readable without colour).
function chargeRing(ctx, r, sign) {
  const col = sign > 0 ? COLORS.pos : COLORS.neg;
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.strokeStyle = col;
  if (sign > 0) {
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
      ctx.lineTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3));
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 3.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function coin(sign, prism = false) {
  return makeSprite(56, (ctx) => {
    halo(ctx, 28, prism ? '#FFFFFF' : COLORS.gold, 0.45);
    ctx.save();
    ctx.shadowColor = prism ? '#FFFFFF' : COLORS.gold; ctx.shadowBlur = 10;
    hexPath(ctx, prism ? 15 : 13);
    if (prism) {
      const g = ctx.createLinearGradient(-15, -15, 15, 15);
      ['#FF5C7A', '#FFC93C', '#7CFFB2', '#00E5FF', '#B388FF', '#FF2BD6'].forEach((c, i) => g.addColorStop(i / 5, c));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createLinearGradient(0, -13, 0, 13);
      g.addColorStop(0, COLORS.goldHi); g.addColorStop(0.5, COLORS.gold); g.addColorStop(1, COLORS.goldRim);
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = prism ? '#FFFFFF' : COLORS.goldHi; ctx.lineWidth = 1.5;
    hexPath(ctx, prism ? 15 : 13); ctx.stroke();
    ctx.fillStyle = 'rgba(5,7,15,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    glyph(ctx, sign, 4, sign > 0 ? COLORS.posHi : COLORS.negHi, 2.4);
    chargeRing(ctx, prism ? 21 : 19, sign);
  });
}

function mine(sign, discharged = false) {
  const col = discharged ? COLORS.gold : sign > 0 ? COLORS.pos : COLORS.neg;
  return makeSprite(60, (ctx) => {
    halo(ctx, 30, discharged ? COLORS.gold : COLORS.danger, 0.4);
    // spikes
    ctx.fillStyle = discharged ? COLORS.goldRim : '#3A1220';
    ctx.strokeStyle = discharged ? COLORS.gold : COLORS.danger;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 === 0 ? 20 : 13;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // body
    const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 13);
    g.addColorStop(0, '#4A4F66'); g.addColorStop(1, '#151827');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    // charged core
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (!discharged) glyph(ctx, sign, 3.5, COLORS.void, 2.2);
    else { ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.stroke(); }
    if (!discharged) chargeRing(ctx, 25, sign);
  });
}

function rock() {
  return makeSprite(64, (ctx) => {
    halo(ctx, 32, '#9AA3B5', 0.18);
    const pts = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const r = 22 + Math.sin(i * 2.7) * 3 + Math.cos(i * 1.3) * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    ctx.beginPath(); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
    const g = ctx.createLinearGradient(-20, -20, 20, 20);
    g.addColorStop(0, '#9AA3B5'); g.addColorStop(0.6, COLORS.rock); g.addColorStop(1, '#2B303C');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#C3CAD8'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(20,22,30,0.45)';
    [[-7, -5, 5], [8, 4, 4], [-2, 10, 3], [9, -9, 2.5]].forEach(([x, y, r]) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    });
  });
}

function powerup(kind) {
  const col = COLORS[kind];
  return makeSprite(60, (ctx) => {
    halo(ctx, 30, col, 0.5);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.fillStyle = hexA(col, 0.18);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-5, -7, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'shield') {
      ctx.moveTo(0, -8); ctx.lineTo(7, -5); ctx.lineTo(6, 3); ctx.lineTo(0, 9); ctx.lineTo(-6, 3); ctx.lineTo(-7, -5); ctx.closePath();
      ctx.stroke();
    } else if (kind === 'stasis') {
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.moveTo(0, 0); ctx.lineTo(4, 2);
      ctx.stroke();
    } else {
      ctx.moveTo(2, -9); ctx.lineTo(-5, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 9); ctx.lineTo(5, -1); ctx.lineTo(0, -1); ctx.closePath();
      ctx.fill();
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Volt, the player robot. Origin (0,0) = the magnetic chest core = the collision circle.
// Eyes are NOT baked: the engine draws them live so they can look around, blink and react.
function robot(sign) {
  const col = sign > 0 ? COLORS.pos : COLORS.neg;
  const hi = sign > 0 ? COLORS.posHi : COLORS.negHi;
  const metal = (ctx, y0, y1) => {
    const g = ctx.createLinearGradient(-24, y0, 24, y1);
    g.addColorStop(0, '#3A4466'); g.addColorStop(0.45, '#1B2340'); g.addColorStop(1, '#0E1428');
    return g;
  };
  return makeSprite(130, (ctx) => {
    halo(ctx, 62, col, 0.35);

    // arms: little magnet claws on both sides
    for (const s of [-1, 1]) {
      ctx.fillStyle = metal(ctx, -8, 12);
      roundRect(ctx, s > 0 ? 21 : -29, -8, 8, 20, 4); ctx.fill();
      ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.fillStyle = col;
      roundRect(ctx, s > 0 ? 20 : -30, 11, 10, 4, 2); ctx.fill();
      ctx.restore();
    }

    // torso
    ctx.fillStyle = metal(ctx, -16, 24);
    roundRect(ctx, -21, -15, 42, 38, 11); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 1.6; ctx.stroke();

    // thruster nozzle
    ctx.fillStyle = '#2A3152';
    roundRect(ctx, -9, 21, 18, 7, 3); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 1; ctx.stroke();

    // neck
    ctx.fillStyle = '#141B33';
    ctx.fillRect(-7, -20, 14, 6);

    // head
    ctx.fillStyle = metal(ctx, -52, -18);
    roundRect(ctx, -24, -52, 48, 34, 12); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 1.6; ctx.stroke();
    // ear bolts
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#2A3152';
      ctx.beginPath(); ctx.arc(s * 25, -35, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(s * 25, -35, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // visor glass (eyes are drawn on top of this every frame)
    const vg = ctx.createLinearGradient(0, -46, 0, -24);
    vg.addColorStop(0, '#070A16'); vg.addColorStop(1, hexA(col, 0.25));
    ctx.fillStyle = vg;
    roundRect(ctx, -18, -46, 36, 22, 8); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, -15, -44, 14, 4, 2); ctx.fill();

    // antenna
    ctx.strokeStyle = '#3A4466'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(0, -61); ctx.stroke();
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.arc(0, -63, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // chest core: the actual magnet (same +/− glyph and ring as before, so the charge stays readable)
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.4, hi); g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 2, 11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.translate(0, 2);
    glyph(ctx, sign, 5, COLORS.void, 3);
    chargeRing(ctx, 15, sign);
  });
}

// thruster flame under Volt (drawn additive, stretched + flickered by the engine)
function flame(sign) {
  const col = sign > 0 ? COLORS.pos : COLORS.neg;
  return makeSprite(40, (ctx) => {
    const g = ctx.createRadialGradient(0, -8, 0, 0, 0, 20);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.25, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.quadraticCurveTo(0, 30, 8, -14);
    ctx.closePath();
    ctx.fill();
  });
}

function dot(color) {
  return makeSprite(16, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.3, color); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  });
}

function ring(color) {
  return makeSprite(128, (ctx) => {
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.stroke();
  });
}

function blob(color) {
  return makeSprite(256, (ctx) => halo(ctx, 128, color, 0.35));
}

export function buildSprites() {
  const s = {
    coin_pos: coin(1), coin_neg: coin(-1),
    prism_pos: coin(1, true), prism_neg: coin(-1, true),
    mine_pos: mine(1), mine_neg: mine(-1), mine_off: mine(1, true),
    rock: rock(),
    pu_shield: powerup('shield'), pu_stasis: powerup('stasis'), pu_overload: powerup('overload'),
    robot_pos: robot(1), robot_neg: robot(-1),
    flame_pos: flame(1), flame_neg: flame(-1),
    dot: {}, ring: {},
    fogA: blob(COLORS.pos), fogB: blob(COLORS.neg),
  };
  for (const [k, c] of Object.entries({ pos: COLORS.pos, neg: COLORS.neg, gold: COLORS.gold, red: COLORS.danger,
    white: '#FFFFFF', shield: COLORS.shield, stasis: COLORS.stasis, overload: COLORS.overload, rock: '#9AA3B5' })) {
    s.dot[k] = dot(c);
    s.ring[k] = ring(c);
  }
  return s;
}

// Draw a sprite centred at (x, y) with world size `size` (defaults to the baked size).
export function drawSprite(ctx, spr, x, y, size = spr.size) {
  ctx.drawImage(spr.canvas, x - size / 2, y - size / 2, size, size);
}
