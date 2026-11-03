// Leaderboard client (talks to the Python serverless function in /api/scores.py)
// + localStorage helpers. Storage can throw (private mode, file://), so every access is wrapped.

const LOCAL_KEY = 'polarityDrop.v1';

export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveLocal(patch) {
  const data = { ...loadLocal(), ...patch };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  return data;
}

function localBoard() {
  return (loadLocal().board || []).slice(0, 10);
}

function addLocalScore(entry) {
  const board = [...(loadLocal().board || []), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  saveLocal({ board });
  return board;
}

// returns { online: boolean, scores: [{name, score, sector}] }
export async function fetchScores() {
  try {
    const res = await fetch('/api/scores', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return { online: true, scores: data.scores || [] };
  } catch {
    return { online: false, scores: localBoard() };
  }
}

export async function submitScore(entry) {
  addLocalScore(entry);              // always keep a local copy
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return { online: true, rank: data.rank, scores: data.scores || [] };
  } catch {
    return { online: false, rank: null, scores: localBoard() };
  }
}
