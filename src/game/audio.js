// Self-created audio: every sound is synthesised at runtime with the Web Audio API (spec 04).
// Graph: voices → sfxBus / musicBus → master → limiter → speakers.

const MAX_VOICES = 24;
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note → Hz

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.settings = { music: 0.6, sfx: 0.8, muted: false };
    this.music = { on: false, bpm: 100, step: 0, nextTime: 0, timer: null, layers: 1, tense: false };
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10; this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003; this.limiter.release.value = 0.25;
      this.limiter.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.connect(this.limiter);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
      // music: bus → low-pass (for pause / game-over muffle) → duck gain → master
      this.musicBus = ctx.createGain();
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
      this.duck = ctx.createGain();
      this.musicBus.connect(this.musicFilter).connect(this.duck).connect(this.master);
      // arpeggio echo
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.225;
      this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.32;
      this.delay.connect(this.delayFb).connect(this.delay);
      this.delay.connect(this.musicBus);
      // one shared white-noise buffer
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSettings(s) { Object.assign(this.settings, s); this.applyVolumes(); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(0.8 * m, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx * 0.9, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.02);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); this.music.nextTime = 0; }

  // ---------- one voice: oscillator (or noise) → filter? → envelope gain → bus ----------
  tone({ type = 'sine', f0, f1 = f0, at = 0, dur = 0.15, a = 0.005, vol = 0.4, bus, filter, q = 1, noise = false, dest }) {
    const ctx = this.ctx;
    if (!ctx || (bus !== 'music' && this.voices >= MAX_VOICES)) return;
    const t = (at || ctx.currentTime);
    let src;
    if (noise) {
      src = ctx.createBufferSource(); src.buffer = this.noise;
    } else {
      src = ctx.createOscillator(); src.type = type;
      src.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type; bq.frequency.value = filter.f; bq.Q.value = q;
      node.connect(bq); node = bq;
    }
    node.connect(g);
    g.connect(dest || (bus === 'music' ? this.musicBus : this.sfxBus));
    if (bus !== 'music') this.voices++;
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => { if (bus !== 'music') this.voices--; g.disconnect(); };
  }

  // ---------- sound effects ----------
  play(name, arg = 0) {
    if (!this.ctx || this.settings.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'flipPos':
        this.tone({ type: 'triangle', f0: 320, f1: 880, dur: 0.12, vol: 0.25 });
        this.tone({ noise: true, dur: 0.08, vol: 0.08, filter: { type: 'highpass', f: 3000 } });
        break;
      case 'flipNeg':
        this.tone({ type: 'triangle', f0: 880, f1: 300, dur: 0.12, vol: 0.25 });
        this.tone({ noise: true, dur: 0.08, vol: 0.08, filter: { type: 'highpass', f: 2000 } });
        break;
      case 'coin': {                 // pitch rises with combo tier (pentatonic on E5)
        const steps = [0, 2, 4, 7, 9];
        const f = 659.25 * Math.pow(2, steps[Math.min(4, arg)] / 12);
        this.tone({ type: 'sine', f0: f, dur: 0.16, vol: 0.28 });
        this.tone({ type: 'sine', f0: f * 1.5, at: t + 0.06, dur: 0.2, vol: 0.2 });
        break;
      }
      case 'prism':
        [0, 4, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', f0: 784 * Math.pow(2, s / 12), at: t + i * 0.05, dur: 0.22, vol: 0.2 }));
        break;
      case 'hit':
        this.tone({ noise: true, dur: 0.35, vol: 0.5, filter: { type: 'lowpass', f: 900 } });
        this.tone({ type: 'square', f0: 180, f1: 40, dur: 0.35, vol: 0.25 });
        this.duckMusic();
        break;
      case 'shieldBlock':
        this.tone({ type: 'sine', f0: 1200, f1: 600, dur: 0.25, vol: 0.25 });
        this.tone({ noise: true, dur: 0.15, vol: 0.15, filter: { type: 'bandpass', f: 2500 }, q: 3 });
        break;
      case 'powerup':
        [0, 4, 7, 11, 14].forEach((s, i) => this.tone({ type: 'square', f0: 523 * Math.pow(2, s / 12), at: t + i * 0.045, dur: 0.12, vol: 0.12 }));
        break;
      case 'powerWarn':
        this.tone({ type: 'square', f0: 1400, dur: 0.05, vol: 0.1 });
        this.tone({ type: 'square', f0: 1400, at: t + 0.12, dur: 0.05, vol: 0.1 });
        break;
      case 'discharge':
        this.tone({ type: 'sawtooth', f0: 400, f1: 1600, dur: 0.15, vol: 0.15, filter: { type: 'lowpass', f: 3000 } });
        break;
      case 'wasted':
        this.tone({ type: 'sine', f0: 440, f1: 220, dur: 0.18, vol: 0.12 });
        break;
      case 'sector':
        this.tone({ noise: true, dur: 0.9, a: 0.4, vol: 0.25, filter: { type: 'bandpass', f: 1200 }, q: 0.8 });
        [0, 7, 12].forEach((s, i) => this.tone({ type: 'sawtooth', f0: 220 * Math.pow(2, s / 12), at: t + 0.3 + i * 0.08, dur: 0.5, vol: 0.08, filter: { type: 'lowpass', f: 2400 } }));
        break;
      case 'gameOver':
        [0, -3, -7, -12].forEach((s, i) => this.tone({ type: 'triangle', f0: 440 * Math.pow(2, s / 12), at: t + i * 0.22, dur: 0.5, vol: 0.22 }));
        break;
      case 'record':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ type: 'triangle', f0: 523 * Math.pow(2, s / 12), at: t + i * 0.07, dur: 0.35, vol: 0.18 }));
        break;
      case 'uiHover':
        this.tone({ type: 'sine', f0: 1800, dur: 0.03, vol: 0.05 });
        break;
      case 'uiClick':
        this.tone({ type: 'triangle', f0: 900, f1: 1300, dur: 0.06, vol: 0.12 });
        break;
      case 'tick':
        this.tone({ type: 'square', f0: 880, dur: 0.06, vol: 0.1 });
        break;
      default:
    }
  }

  duckMusic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.3, t);
    g.linearRampToValueAtTime(1, t + 0.8);
  }

  muffle(on, freq = 350) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? freq : 18000, this.ctx.currentTime, 0.15);
  }

  // ---------- adaptive music: 16-step sequencer with a lookahead scheduler ----------
  startMusic() {
    if (!this.ctx || this.music.on) return;
    this.music.on = true;
    this.music.step = 0;
    this.music.nextTime = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.music.on) return;
      this.schedule();
      this.music.timer = setTimeout(tick, 25);
    };
    tick();
  }

  stopMusic() {
    this.music.on = false;
    clearTimeout(this.music.timer);
  }

  // intensity 0 = menu, 1..n = sector. Takes effect at the next bar.
  setIntensity(sector) {
    this.pending = sector;
  }

  schedule() {
    const m = this.music, ctx = this.ctx;
    const now = ctx.currentTime;
    if (m.nextTime < now - 0.2) m.nextTime = now + 0.02; // fell behind (tab was hidden): skip, don't burst
    while (m.nextTime < now + 0.1) {
      if (m.step % 16 === 0 && this.pending !== undefined) {
        const s = this.pending; this.pending = undefined;
        m.bpm = s === 0 ? 90 : s <= 4 ? 100 + (s - 1) * 6 : Math.min(132, 118 + (s - 4) * 3);
        m.layers = s === 0 ? 1 : Math.min(5, s + 1);
      }
      this.playStep(m.step, m.nextTime);
      m.nextTime += 60 / m.bpm / 4;
      m.step = (m.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const bar = Math.floor(step / 16);             // 4 bars: Am – F – C – G
    const s = step % 16;
    const roots = [57, 53, 48, 55];
    const chords = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]];
    const root = roots[bar];
    const L = this.music.layers;
    const stepDur = 60 / this.music.bpm / 4;

    // bass (always): 8th notes
    if (s % 2 === 0) this.tone({ bus: 'music', type: 'sawtooth', f0: NOTE(root - 12), at: t, dur: stepDur * 1.8, vol: 0.18,
      filter: { type: 'lowpass', f: this.music.tense ? 1400 : 600 }, q: 4 });
    // kick on beats
    if (L >= 2 && s % 4 === 0) this.tone({ bus: 'music', type: 'sine', f0: 140, f1: 45, at: t, dur: 0.22, vol: 0.5 });
    // arpeggio 16ths through the delay
    if (L >= 3) {
      const n = root + 12 + chords[bar][s % 4];
      this.tone({ bus: 'music', type: 'square', f0: NOTE(n), at: t, dur: stepDur * 0.9, vol: 0.05,
        filter: { type: 'lowpass', f: 1500 + L * 500 }, dest: undefined });
      if (s % 4 === 0) this.tone({ bus: 'music', type: 'square', f0: NOTE(n), at: t, dur: stepDur * 0.9, vol: 0.04,
        filter: { type: 'lowpass', f: 2000 }, dest: this.delay });
    }
    // hi-hat on off-beats
    if (L >= 4 && s % 2 === 1) this.tone({ bus: 'music', noise: true, at: t, dur: 0.04, vol: 0.06, filter: { type: 'highpass', f: 7000 } });
    // snare on 2 and 4
    if (L >= 5 && (s === 4 || s === 12)) this.tone({ bus: 'music', noise: true, at: t, dur: 0.16, vol: 0.18, filter: { type: 'bandpass', f: 1800 }, q: 0.7 });
  }
}

export const audio = new AudioEngine();
