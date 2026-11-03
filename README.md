# Skoha v4: the fountain of youth for your chess

## New in v4
- **30 starter repertoires** (14 White, 16 Black), 224 lines, ~1,070 moves to learn, every move annotated. New: Ruy Lopez, Scotch, Vienna, King's Gambit, Evans Gambit, Queen's Gambit, Catalan, English, King's Indian Attack, Bird, Jobava London; Sicilian (Najdorf, Dragon, Sveshnikov, Accelerated Dragon, Anti-Sicilians), French, Scandinavian, Pirc, Alekhine, Petroff, Berlin, King's Indian, Nimzo-Indian, Grünfeld, Slav, Dutch, Benoni, Queen's Indian. Italian, London, Caro-Kann and QGD each got a new chapter. Each has a knowledge-base entry.
- **Home search**: instant, accent-insensitive search by name, variation, ECO code or moves ("Najdorf", "C42", "e4 c5"). `/` focuses, ↑/↓ select, Enter jumps to the opening or chapter, Esc clears.
- **Board-first training**: modes and stats live in a compact top bar; a coach card next to the board (below it on phones) explains every move just played and every new move to play, with arrows.
- Starter PGN sources are numbered PGN; short comments were extended with factual notes (what the moved piece attacks/controls).

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

## Sync across devices

**Works out of the box (no setup): Sync code.** Settings › Your data › *Copy sync code* / *Copy sync link*. Paste the code (or open the link) on the other device and press *Load sync code*. The code is your compressed progress (starter lines are re-downloaded, not included); loading **merges** both devices (per move the more-practised card wins, daily counts take the max).

**Optional cloud sync (Cloudflare free plan).** The site deploys as a Cloudflare **Worker with static assets** (`wrangler.jsonc`). `worker.js` serves `/api/sync` and hands everything else to the static files. Without a KV binding, `/api/sync` answers `501` and the app hides cloud sync, so nothing breaks.

To turn it on:
1. Cloudflare dashboard › *Storage & Databases* › *KV* › **Create namespace** named `skoha-sync`, then copy its **ID**.
2. In `wrangler.jsonc`, uncomment the `kv_namespaces` line and paste the ID: `"kv_namespaces": [{ "binding": "SYNC", "id": "<id>" }]`. Commit and push. Workers Builds redeploys. A binding added only in the dashboard would be removed by the next deploy, because the config file wins.
3. In the app: Settings › Your data › *New key* › *Sync now*. Enter the same key on your other devices.

Free-plan limits: 100k KV reads and 1k writes per day, 1 GB storage; Pages Functions get 100k requests per day. The server only ever sees a SHA-256 hash of the key as the record id. There is no account or password reset: losing the key means losing the cloud copy (the device copy remains).

**What real account sync would need:** a sign-in (email magic link or OAuth via Cloudflare Access, Auth0 or Clerk), a D1 table of users plus per-device change logs for conflict-free merging, background sync, account deletion/export for privacy compliance, and rate limiting. That is beyond a static site.

## Play it out
After a line ends, *Play it out* starts a game from that position against Stockfish 19 lite (single-threaded WASM, vendored in `vendor/stockfish/`, GPL-3.0, from the npm `stockfish` package by Nathan Rugg). It runs in a Web Worker. Easy = Skill 0, 120 ms; Medium = Skill 8, 350 ms; Hard = Skill 20, 900 ms.

## Install & offline (PWA)
`manifest.webmanifest` + `icons/` + `sw.js`. Code and content are fetched network-first, so a new deploy shows on the next online load and the cache is only an offline fallback. Vendor files, sounds and icons are cache-first. `skipWaiting` and `clients.claim` activate a new worker at once; `sw.js` is served `no-store`. Bump `VERSION` in sw.js when the file list changes.
