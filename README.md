# FreeReps v2: free chess opening trainer

A static site using chessground and chess.js. There's no framework and no build step. All data stays in the browser (localStorage), with JSON backup.

## Features
- **Spaced repetition (SM-2)** per position+move.
  - New moves are taught with an arrow.
  - Mistakes relearn in 10 min.
- **Train modes:** Due reviews (+ N new lines/session), Random lines, Mistakes only, Chapter, Pick a specific line. Works for White and Black.
- **Premoves** while the opponent's reply is animating (toggle in Settings).
- **Sounds:** move / capture / castle / check / error / complete from `/sounds/`, with on/off and volume. Swap files freely.
- **Settings:** animation speed, reply delay, legal-move dots, coordinates, auto-advance, flip board, new lines per session.
- **Shortcuts:** `h` hint, `n`/Enter next line, `f` flip.
- **Repertoire building:** play lines on a board, or paste/load PGN.
  - Nested variations become separate lines, and each PGN game (Event header) becomes a chapter.
  - Export to PGN.
- **Starters** (`starters/*.pgn`, listed in `starters/index.json`):

  | Starter | Colour | Lines | Moves to learn |
  |---|---|---|---|
  | **Réti 1.Nf3 (featured)** | White | 43 | 223 |
  | Italian | White | 8 | |
  | London | White | 7 | |
  | Caro-Kann | Black | 9 | |
  | QGD | Black | 7 | |

  The Réti covers 1...d5 2.c4 (…e6/…c6/…d4/…dxc4/…Nf6), the KIA vs 1...d5 2.g3, 1...Nf6 2.c4/2.g3, 1...c5, 1...f5 and odd tries.
  - To add more, drop a PGN in `starters/` and add an entry to `index.json`.

## Files
- `index.html`, `style.css`, `app.js` (UI)
- `core.js` (pure logic: PGN, SM-2, queue, sounds)
- `vendor/`, `sounds/`, `starters/`, `_headers`
- `tests/test.mjs`: `node tests/test.mjs`
- `tests/e2e.mjs`: browser test, needs `npm i playwright-core` and Chrome

See DEPLOY.md for Cloudflare Pages + custom domain and RESEARCH.md for the Chessreps comparison.
