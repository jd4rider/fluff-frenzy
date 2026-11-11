# Fluff Frenzy

A sliding match puzzle starring fluffy pom-pom creatures, built with Phaser 3, TypeScript and Vite for [Little Joy Arcade](https://littlejoyarcade.site).

**Slide the row. Free the fluff. Chase the frenzy.**

- Live build: <https://jd4rider.github.io/fluff-frenzy/play/>
- Journey: 500 levels across ten themed worlds, every one proven
- Modes: Classic Arcade, Timed Frenzy, Zen Garden, Daily Challenge, Puzzle Journey

## The game

You never swap two neighbours. You grab a **whole row or column** and slide it: every fluff in the line moves together, wrapping cleanly around the board edge so the one leaving the right reappears on the left. Release and the line snaps to the nearest cell.

Three or more matching fluffs in a straight line burst into a cloud of colour. Everything above falls, new fluffs drop in, and any matches they form continue the chain. Chains are where the scoring and the noise live.

Filling the **Fluff Fever** meter buys twelve seconds of double points, a glowing board frame and heavier effects.

### Modes

| Mode | Rule |
| --- | --- |
| Classic Arcade | 25-move bank; only a five-fluff run or a deep cascade refunds a move |
| Timed Frenzy | Two minutes, maximum score |
| Zen Garden | No timer and no losing; the board reshuffles itself out of deadlocks |
| Daily Challenge | One seeded ninety-second run per day |
| Puzzle Journey | 500 objective levels with move limits and star ratings |

### Special fluffs

Rainbow (wildcard), bomb (3×3 blast), lightning (whole row and column), golden (bonus points), frozen (ice that blocks its line until a neighbouring match thaws it) and locked (an anchor that a neighbouring match releases). They appear from world three onward and are placed by level data, so the solver accounts for them like any other cell.

### Controls

- **Touch** — drag any fluff; the whole line follows your finger and wraps
- **Mouse** — same drag, with the highlighted line following the pointer
- **Keyboard** — hover a cell, then arrow keys or WASD slide that line; R restarts, P/Esc pauses
- **Gamepad** — the pointer is the cursor; the D-pad moves it and A drags in that direction

## Engineering

The simulation lives in `src/game/` and never imports Phaser:

- `board.ts` — grid model, wraparound sliding, run detection, special expansion, gravity and refill
- `resolve.ts` — cascade loop, starved of any rendering concern, capped so a refill can never spin
- `session.ts` — mode rules, move bank, fever, objectives, deep `clone()` for lookahead
- `solver.ts` — deterministic greedy autoplayer used to author and prove levels and to power the in-game hint
- `rng.ts` — clonable mulberry32 state; cloning a session clones the sequence, so scoring a candidate move cannot disturb the live run

Rendering reads snapshots from the simulation. All art is drawn procedurally at runtime — fluff bodies with fur strands, faces in three expressions, all ten world backdrops, every particle — and all audio is synthesised with the Web Audio API. There are no image or sound downloads, so the game loads instantly and plays offline.

### Why the clone matters

Level authoring evaluates hundreds of candidate moves per turn. A session copy that shared the RNG closure would consume the real run's refill sequence while merely *scoring* a candidate, and the recorded solution would no longer replay. `Rand.clone()` exists for that reason, and a test pins it.

### Journey validation

`npm run levels` regenerates `src/data/journey.json`.

1. Build a quiet opening board from the level seed (no runs waiting, at least one legal move).
2. Let the solver play with the objective disabled and sample its progress after every move.
3. Read the objective target off that curve at the number of moves the level is designed to take — difficulty is measured in moves found, not an invented number.
4. Rebuild the finished level from its stored data and replay the recorded moves.
5. Write the level only if that replay wins inside its move limit; otherwise try another objective family or seed.

`tests/journey.test.ts` replays all 500 recorded solutions on the production rules, asserts each wins inside its limit, and checks every opening board is quiet. Board logic is integer-only, so this is an exact replay rather than a statistical one.

## Development

```bash
npm install
npm run dev        # http://localhost:5177
npm run test       # 30 unit, journey replay and save tests
npm run typecheck
npm run build
npm run levels     # regenerate + validate all 500 Journey levels
```

## Deployment

GitHub Pages is the only deployment. `.github/workflows/pages.yml` runs the tests, builds the production bundle and publishes it to `/play/` on `jd4rider.github.io/fluff-frenzy`. The catalogue row lives in the arcade's `public.games` table and mirrors `arcade-manifest.json`.

`public/arcade-client.js` mirrors the game's storage keys into a signed-in player's arcade account. When it is absent or offline the game plays normally and saves locally.

## Known limitations

- Giant 2×2 fluffs and portal pairs are not implemented; both were deliberately deferred rather than shipped half-working. Anchored (frozen/locked) pieces cover the same design ground for now.
- Special fluffs are placed by level data, not created by large matches.
- Rewarded advertising and cosmetic purchases are not wired up: the arcade client in use exposes no ad or purchase endpoint, so the game does not pretend to offer them.

Fluff Frenzy is an original Little Joy Arcade game inspired by the sliding match genre. All artwork, audio, level content and copy are original to this project.
