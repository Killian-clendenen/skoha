# FreeReps v3: the fountain of youth for your chess

A static site using chessground and chess.js. There's no framework and no build step. All data stays in the browser (localStorage), with JSON backup.

## New in v3
- **Home.** White openings and Black defences are shown as separate sections.
  - Each White card lists its defences as chips that link to that opening's chapters (Réti: vs 1...d5 2.c4, KIA, 1...Nf6, 1...c5, 1...f5…).
  - Each White card also shows the Black answers in your library, and each Black card shows what it answers (QGD ↔ London, Caro-Kann answers 1.e4).
- **Navigation.** Home → Opening page (lines grouped by chapter, plus a Knowledge base tab) → Line page.
  - URLs: `#/opening/reti`, `#/line/reti/0`.
- **Line page.**
  - Board plus annotation panel: every move gets an explanation of its idea and of what the opponent's move concedes.
  - Clickable move chips, and ◀ ▶ / ← → / Home / End to step through.
  - Previous/next line, and a "Drill this line" button.
- **Annotations are PGN comments `{…}`.** Your own imported PGNs with comments display too. On-board arrows and highlights come from `[%cal Gf3e5,Rd8h4]` and `[%csl Gd5]` (G = idea, R = threat/weakness, Y = alternative, B = new move).
  - Moves without a comment get a plain auto-description.
  - Annotations also show during drills (toggle in Settings).
- **Knowledge base per starter** (`kb.js`): overview, history, key ideas, pawn structures, plans for both sides, traps, model games, tips.
- **Look and sound.**
  - New dark "aurora" look with an aqua → violet → gold gradient, plus five board themes (Settings).
  - Softer, woodier synthesized sounds.

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
- `index.html`, `style.css`, `app.js` (UI), `kb.js` (knowledge base)
- `core.js` (pure logic: PGN, SM-2, queue, sounds)
- `vendor/`, `sounds/`, `starters/`, `_headers`
- `tests/test.mjs`: `node tests/test.mjs`
- `tests/e2e.mjs`: browser test, needs `npm i playwright-core` and Chrome

Local: `cd chess-trainer-v3 && python3 -m http.server 8000`, then open http://localhost:8000. To update, replace the folder's files and hard-refresh (Ctrl/Cmd+Shift+R). Progress is kept because it's stored in the browser under the same key.

See DEPLOY.md for Cloudflare Pages + custom domain and RESEARCH.md for the Chessreps comparison.
