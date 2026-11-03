import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/engine.js';
import { audio } from './game/audio.js';
import { loadLocal, saveLocal, fetchScores, submitScore } from './api.js';
import { Title, HowTo, Settings, Leaderboard, Pause, GameOver } from './ui/Screens.jsx';

const DEFAULT_SETTINGS = { music: 0.6, sfx: 0.8, muted: false, lowFx: false, showFps: false };

// React owns the menus/overlays; the canvas engine owns gameplay + HUD.
// screen: title | how | settings | board | playing | paused | over
export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const stored = useRef(loadLocal()).current;
  const [screen, setScreen] = useState('title');
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(stored.settings || {}) });
  const [best, setBest] = useState(stored.best || { score: 0, sector: 0 });
  const [result, setResult] = useState(null);
  const [isRecord, setIsRecord] = useState(false);
  const [board, setBoard] = useState({ loading: false, online: false, scores: [] });
  const [submitState, setSubmitState] = useState({});
  const backTo = useRef('title');
  const bestRef = useRef(best);
  bestRef.current = best;

  // create the engine once
  useEffect(() => {
    const game = new Game(canvasRef.current, {
      onState: (s) => {
        if (s === 'paused') setScreen('paused');
        if (s === 'playing' || s === 'countdown') setScreen('playing');
      },
      onGameOver: (r) => {
        const b = bestRef.current;
        const record = r.score > (b.score || 0);
        if (record) setBest(saveLocal({ best: { score: r.score, sector: r.sector } }).best);
        setIsRecord(record);
        setResult(r);
        setSubmitState({});
        setScreen('over');
      },
      onSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
    });
    gameRef.current = game;
    if (import.meta.env.DEV) window.__game = game;   // handy for debugging in the dev console
    audio.muffle(true, 900);
    return () => game.destroy();
  }, []);

  // push settings into the engine + audio, and persist them
  useEffect(() => {
    gameRef.current?.setSettings({ lowFx: settings.lowFx, showFps: settings.showFps });
    audio.setSettings({ music: settings.music, sfx: settings.sfx, muted: settings.muted });
    saveLocal({ settings });
  }, [settings]);

  const play = useCallback(() => {
    audio.unlock();
    setScreen('playing');
    gameRef.current.start(bestRef.current.score > 0);
  }, []);

  const toMenu = useCallback(() => {
    gameRef.current.toMenu();
    setScreen('title');
  }, []);

  const openBoard = useCallback(async () => {
    setScreen('board');
    setBoard((b) => ({ ...b, loading: true }));
    const res = await fetchScores();
    setBoard({ loading: false, ...res });
  }, []);

  const openSettings = useCallback((from) => {
    backTo.current = from;
    setScreen('settings');
  }, []);

  const onSubmit = useCallback(async (name) => {
    if (!result) return;
    saveLocal({ name });
    setSubmitState({ busy: true });
    const res = await submitScore({ name, score: result.score, sector: result.sector });
    setSubmitState({ done: true, ...res });
  }, [result]);

  // global keys (menus): Enter on title = play, Esc = back / resume, R = restart, M = mute
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'm') { setSettings((s) => ({ ...s, muted: !s.muted })); return; }
      if (screen === 'paused' && (k === 'escape' || k === 'p')) { gameRef.current.resume(); return; }
      if (screen === 'over' && k === 'r') { play(); return; }
      if (k === 'escape' && ['how', 'board'].includes(screen)) setScreen('title');
      if (k === 'escape' && screen === 'settings') setScreen(backTo.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, play]);

  const inMenu = ['title', 'how', 'settings', 'board'].includes(screen);

  return (
    <div className="stage">
      <div className="ambient" aria-hidden="true" />
      <div className={`frame ${inMenu ? 'is-menu' : ''}`}>
        <canvas ref={canvasRef} className="game-canvas" />
        <div className={`scrim ${inMenu || screen === 'paused' || screen === 'over' ? 'show' : ''}`} />

        {screen === 'playing' && (
          <button className="pause-btn" aria-label="Pause" onClick={() => gameRef.current.pause()}>
            <i /><i />
          </button>
        )}

        {screen === 'title' && (
          <Title best={best} onPlay={play} onHow={() => setScreen('how')} onBoard={openBoard}
            onSettings={() => openSettings('title')} />
        )}
        {screen === 'how' && <HowTo onBack={() => setScreen('title')} />}
        {screen === 'settings' && (
          <Settings settings={settings} onChange={(p) => setSettings((s) => ({ ...s, ...p }))}
            onBack={() => setScreen(backTo.current)} />
        )}
        {screen === 'board' && <Leaderboard board={board} onBack={() => setScreen('title')} />}
        {screen === 'paused' && (
          <Pause onResume={() => gameRef.current.resume()} onRestart={play} onMenu={toMenu} />
        )}
        {screen === 'over' && result && (
          <GameOver result={result} isRecord={isRecord} savedName={loadLocal().name}
            onSubmit={onSubmit} submitState={submitState} onRestart={play} onMenu={toMenu} />
        )}
      </div>
    </div>
  );
}
