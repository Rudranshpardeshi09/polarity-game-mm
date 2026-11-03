import React, { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio.js';

// Menu button with hover/click sounds
export function Btn({ children, onClick, primary, small, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  return (
    <button
      ref={ref}
      className={`btn ${primary ? 'btn-primary' : ''} ${small ? 'btn-small' : ''}`}
      onMouseEnter={() => audio.play('uiHover')}
      onFocus={() => audio.play('uiHover')}
      onClick={() => { audio.unlock(); audio.play('uiClick'); onClick?.(); }}
    >
      <span className="btn-charge" />
      <span className="btn-label">{children}</span>
    </button>
  );
}

// Up/Down arrows move focus between the buttons inside a panel (console-style menus)
export function useMenuNav(ref) {
  useEffect(() => {
    const onKey = (e) => {
      if (!['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) return;
      const btns = [...(ref.current?.querySelectorAll('button, input, select') || [])];
      if (!btns.length) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement);
      const dir = e.key === 'ArrowUp' || e.key === 'w' ? -1 : 1;
      btns[(i + dir + btns.length) % btns.length].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

function Logo() {
  return (
    <h1 className="logo" aria-label="Polarity Drop">
      <span className="logo-line">P<span className="o-pos">O</span>LARITY</span>
      <span className="logo-line logo-sub">DR<span className="o-neg">O</span>P</span>
    </h1>
  );
}

export function Title({ best, onPlay, onHow, onBoard, onSettings }) {
  const ref = useRef(null);
  useMenuNav(ref);
  return (
    <div className="screen screen-title" ref={ref}>
      <Logo />
      <p className="tagline">Bend the rain. Flip your charge.</p>
      <div className="menu">
        <Btn primary autoFocus onClick={onPlay}>PLAY</Btn>
        <Btn onClick={onHow}>HOW TO PLAY</Btn>
        <Btn onClick={onBoard}>LEADERBOARD</Btn>
        <Btn onClick={onSettings}>SETTINGS</Btn>
      </div>
      <div className="best">
        <span className="label">BEST</span>
        <span className="value">{(best.score || 0).toLocaleString()}</span>
        {best.sector ? <span className="label">· SECTOR {best.sector}</span> : null}
      </div>
      <div className="hint"><kbd>↑</kbd><kbd>↓</kbd> select · <kbd>Enter</kbd> confirm</div>
    </div>
  );
}

export function HowTo({ onBack }) {
  const ref = useRef(null);
  useMenuNav(ref);
  const cards = [
    { title: 'MOVE', demo: 'demo-move', text: <>Slide <b>Volt</b>, your magnet robot, with <kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd>, the mouse, or drag on touch.</> },
    { title: 'FLIP', demo: 'demo-flip', text: <>Press <kbd>Space</kbd> / click / tap to flip between <b className="pos">+</b> and <b className="neg">−</b>.</> },
    { title: 'BEND', demo: 'demo-bend', text: <>Opposite charges <b>attract</b>. Same charges <b>repel</b>. Touch decides: coins score, mines hurt.</> },
  ];
  return (
    <div className="screen panel" ref={ref}>
      <h2 className="panel-title">HOW TO PLAY</h2>
      <div className="cards">
        {cards.map((c, i) => (
          <div className="card" key={c.title} style={{ animationDelay: `${i * 80}ms` }}>
            <div className={`card-demo ${c.demo}`}><i className="d-core" /><i className="d-obj" /></div>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </div>
        ))}
      </div>
      <ul className="legend">
        <li><i className="lg lg-coin" /> Coin <b>+10 × combo</b></li>
        <li><i className="lg lg-prism" /> Prism <b>+50</b>, shifts charge</li>
        <li><i className="lg lg-mine" /> Mine <b>−1 life</b></li>
        <li><i className="lg lg-rock" /> Rock <b>−1 life</b>, ignores magnets</li>
        <li><i className="lg lg-shield" /> Shield: blocks one hit</li>
        <li><i className="lg lg-stasis" /> Stasis: slow time 4 s</li>
        <li><i className="lg lg-overload" /> Overload: mines become bonus</li>
        <li><i className="lg lg-wasted" /> Coin you bent but missed <b>−5</b></li>
      </ul>
      <Btn autoFocus onClick={onBack}>BACK</Btn>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="row">
      <span>{label}</span>
      <button className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value}
        onClick={() => { audio.play('uiClick'); onChange(!value); }}>
        <i />
      </button>
    </label>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <label className="row">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={value}
        style={{ '--v': `${value * 100}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="row-val">{Math.round(value * 100)}</span>
    </label>
  );
}

export function Settings({ settings, onChange, onBack }) {
  const ref = useRef(null);
  useMenuNav(ref);
  return (
    <div className="screen panel panel-narrow" ref={ref}>
      <h2 className="panel-title">SETTINGS</h2>
      <div className="rows">
        <Slider label="MUSIC" value={settings.music} onChange={(v) => onChange({ music: v })} />
        <Slider label="SOUND FX" value={settings.sfx} onChange={(v) => onChange({ sfx: v })} />
        <Toggle label="MUTE ALL (M)" value={settings.muted} onChange={(v) => onChange({ muted: v })} />
        <Toggle label="LOW EFFECTS" value={settings.lowFx} onChange={(v) => onChange({ lowFx: v })} />
        <Toggle label="SHOW FPS (F)" value={settings.showFps} onChange={(v) => onChange({ showFps: v })} />
      </div>
      <Btn autoFocus onClick={onBack}>BACK</Btn>
    </div>
  );
}

export function Leaderboard({ board, onBack }) {
  const ref = useRef(null);
  useMenuNav(ref);
  return (
    <div className="screen panel panel-narrow" ref={ref}>
      <h2 className="panel-title">LEADERBOARD</h2>
      <p className={`net ${board.online ? 'on' : ''}`}>
        <i /> {board.loading ? 'CONNECTING…' : board.online ? 'GLOBAL · LIVE' : 'OFFLINE · LOCAL SCORES'}
      </p>
      <ol className="board">
        {board.scores.length === 0 && !board.loading && <li className="empty">No scores yet. Be the first.</li>}
        {board.scores.map((s, i) => (
          <li key={i} className={i < 3 ? `top top-${i + 1}` : ''}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <span className="name">{s.name}</span>
            <span className="sec">S{s.sector}</span>
            <span className="pts">{s.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      <Btn autoFocus onClick={onBack}>BACK</Btn>
    </div>
  );
}

export function Pause({ onResume, onRestart, onMenu }) {
  const ref = useRef(null);
  useMenuNav(ref);
  return (
    <div className="screen panel panel-narrow glass" ref={ref}>
      <h2 className="panel-title">PAUSED</h2>
      <div className="menu">
        <Btn primary autoFocus onClick={onResume}>RESUME</Btn>
        <Btn onClick={onRestart}>RESTART</Btn>
        <Btn onClick={onMenu}>MAIN MENU</Btn>
      </div>
      <div className="hint"><kbd>Esc</kbd> resume</div>
    </div>
  );
}

// counts a number up from 0 over `ms`
function useCountUp(target, ms = 1100, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const tick = (t) => {
      if (start === undefined) start = t + delay;
      const k = Math.max(0, Math.min(1, (t - start) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}

export function GameOver({ result, isRecord, savedName, onSubmit, submitState, onRestart, onMenu }) {
  const ref = useRef(null);
  useMenuNav(ref);
  const score = useCountUp(result.score, 1200, 200);
  const [name, setName] = useState(savedName || '');
  const accuracy = result.coinsInField ? Math.round((result.coins / result.coinsInField) * 100) : 0;
  const mm = Math.floor(result.time / 60), ss = String(Math.floor(result.time % 60)).padStart(2, '0');
  useEffect(() => { if (isRecord) { const t = setTimeout(() => audio.play('record'), 1400); return () => clearTimeout(t); } }, [isRecord]);

  const stats = [
    ['SECTOR', result.sector], ['TIME', `${mm}:${ss}`], ['COINS', result.coins],
    ['BEST STREAK', result.maxStreak], ['PEAK COMBO', `×${result.peakMult}`], ['ACCURACY', `${accuracy}%`],
    ['MINES REPELLED', result.minesRepelled], ['FLIPS', result.flips],
  ];
  const submit = (e) => {
    e.preventDefault();
    const clean = name.trim().toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12);
    if (clean) onSubmit(clean);
  };

  return (
    <div className="screen panel glass screen-over" ref={ref}>
      <h2 className="panel-title glitch" data-text="CORE OFFLINE">CORE OFFLINE</h2>
      <div className="final">
        <span className="label">FINAL SCORE</span>
        <span className="final-score">{score.toLocaleString()}</span>
        {isRecord && <span className="stamp">NEW RECORD</span>}
      </div>
      <div className="stats">
        {stats.map(([k, v], i) => (
          <div className="stat" key={k} style={{ animationDelay: `${600 + i * 70}ms` }}>
            <span className="label">{k}</span><span className="v">{v}</span>
          </div>
        ))}
      </div>
      {submitState.done ? (
        <p className={`net ${submitState.online ? 'on' : ''}`}>
          <i /> {submitState.online ? `SUBMITTED · GLOBAL RANK #${submitState.rank}` : 'SAVED LOCALLY (offline)'}
        </p>
      ) : (
        <form className="submit" onSubmit={submit}>
          <input value={name} maxLength={12} placeholder="YOUR NAME" aria-label="Your name"
            onChange={(e) => setName(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.stopPropagation()} />
          <button className="btn btn-small" type="submit" disabled={submitState.busy || !name.trim()}>
            <span className="btn-charge" /><span className="btn-label">{submitState.busy ? '…' : 'SUBMIT'}</span>
          </button>
        </form>
      )}
      <div className="menu menu-row">
        <Btn primary autoFocus onClick={onRestart}>PLAY AGAIN</Btn>
        <Btn onClick={onMenu}>MENU</Btn>
      </div>
      <div className="hint"><kbd>R</kbd> play again</div>
    </div>
  );
}
