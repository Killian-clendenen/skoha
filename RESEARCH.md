# Chessreps research (Nov 2, 2026)

Sources: chessreps.com/about, chessreps.com/plans, App Store listing, chessdir.app review, chesslogix.com comparison. Only public descriptions were used. No Chessreps code, branding or assets were copied.

## What Chessreps is
- A web, iOS and Android opening trainer built on spaced repetition ("Reps" = repetitions + repertoire).
- It has 500+ prebuilt courses, some credited to GMs (Wei Yi, Esipenko, Gelfand…), plus community courses and a course creator.
- Pricing is a 7-day trial, then about $34.99/yr. Only the first line of a course is free.

## Modes
| Chessreps | What it does | FreeReps v2 |
|---|---|---|
| Learn | Play vs bot with short witty hints. An adaptive "cohort" of lines grows over time | **Matched (simpler):** a new move shows a blue arrow and "New move: play X", and "Due reviews" adds N new lines per session (setting) |
| Practice | Recall without hints | **Matched:** reviewed moves have no arrow. Hint costs the card |
| Drill | Streak of consecutive correct lines, leaderboards | **Partial:** session summary shows perfect lines. No streak counter or leaderboard |
| Time Trials | 60 s clock, correct answers add time | **Skipped** (easy next addition) |
| Puzzles | Tactics from real games in the opening | **Skipped** (needs a puzzle DB, e.g. the Lichess puzzle CSV, CC0) |
| Arena | Competitive mode | Skipped |
| Spaced repetition | Core | **Matched:** SM-2 per (position, move) card |
| Both colours | Yes | **Matched** |
| Build your own / combine lines | Course creator | **Matched:** board builder + PGN import (variations → lines, games → chapters), PGN export |
| Real-game opponent moves (Lichess stats) | Yes | Skipped (lines are authored) |
| Sync, accounts, leaderboards | Yes | Skipped. Local-only storage with JSON backup |
| Progress tracking | Yes | Basic: due/new/learned, accuracy, day streak |

## Extras FreeReps has
- Free, no account.
- Premoves.
- Swappable sound files.
- Mistakes-only mode, plus chapter and specific-line drilling.
- Alternative-move tolerance: if you play a move that's in your repertoire but belongs to a different line, you're told so and not penalised.
