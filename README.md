# Polarity Drop

Neon 2D arcade game. You play **Volt**, a hover robot with a magnet in its chest. Flip its charge between **+** and **−** to bend falling objects:
opposite charges attract and same charges repel. Collect coins and dodge mines.

Built with React + HTML5 Canvas, plus a Python serverless API for the leaderboard (Vercel).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```
Deploy: import the repo on Vercel. For an online leaderboard, add Upstash Redis in Vercel Storage. Without it, scores are saved locally.

## Controls

| Action | Keyboard | Mouse / Touch |
|---|---|---|
| Move | ← → / A D | move / drag |
| Flip charge | Space | click / tap |
| Pause | P / Esc | pause button |
| Restart | R | button |

## Rules

- **Coin** +10 × combo · **Prism coin** +50 (switches charge) · **Mine / Rock** −1 life (rocks ignore magnetism)
- Combo multiplier rises every 5 coins in a row (up to ×5). Getting hit resets it.
- A coin that enters your field and then falls past you costs **−5**.
- Power-ups: **Shield** (blocks a hit) · **Stasis** (slow time) · **Overload** (mines become bonus points)
- 3 lives. A new, faster sector starts every 30 s.

## Customization

The **magnet polarity mechanic**: objects curve toward or away from you instead of only falling.
All numbers are in `src/game/config.js`. Collision effects go through `applyEffect()` and every score change goes through `addScore()` in `src/game/engine.js`.

## How it works

- **Game loop:** fixed 60 updates/s plus `requestAnimationFrame` rendering. States: menu → playing ⇄ paused → game over. Restart resets without reloading the page.
- **Magnet:** `a = ±K / d²` inside the field radius (+ for opposite charges, − for same charges), added to gravity.
- **Collision:** circle vs circle, `dx² + dy² < (r1 + r2)²`.
- **Multimedia:** sprites drawn in code once at startup, a parallax background, and sound and music synthesised with the Web Audio API (no asset files).
