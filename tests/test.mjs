// node test.mjs — starter PGNs (every move legal), PGN parser, SM-2, drill sequencing, sounds.
import { readFileSync } from 'node:fs';
import { Chess } from '../vendor/chess.js';
import { validateLine, parsePgn, userCards, schedule, buildQueue, soundFor, toPgn, dedupe, repMoves, fenKey } from '../core.js';
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } if (process.env.V) console.log((c ? 'PASS ' : 'FAIL ') + m); };
const idx = JSON.parse(readFileSync(new URL('../starters/', import.meta.url).pathname + 'index.json', 'utf8'));
for (const s of idx) {
  const { lines, errors } = parsePgn(readFileSync(new URL('../starters/', import.meta.url).pathname + '' + s.file, 'utf8'));
  ok(errors.length === 0, `${s.name}: all moves legal ${errors.join('; ')}`);
  ok(lines.length >= 5, `${s.name}: ${lines.length} lines`);
  console.log(`  ${s.name}: ${lines.length} lines, ${new Set(lines.map(l => l.ch)).size} chapters, ${new Set(lines.flatMap(l => userCards(l.m, s.color).map(c => c.key))).size} moves to learn`);
}
const reti = parsePgn(readFileSync(new URL('../starters/', import.meta.url).pathname + 'reti.pgn', 'utf8')).lines;
const has = p => reti.some(l => l.m.join(' ').startsWith(p));
for (const p of ['Nf3 d5 c4 e6', 'Nf3 d5 c4 c6', 'Nf3 d5 c4 d4', 'Nf3 d5 c4 dxc4', 'Nf3 d5 g3', 'Nf3 Nf6 c4', 'Nf3 Nf6 g3', 'Nf3 c5', 'Nf3 f5'])
  ok(has(p), 'Réti covers ' + p);
ok(reti.length >= 40, 'Réti has many branches: ' + reti.length);
ok(idx[0].id === 'reti' && idx[0].featured, 'Réti featured first');
// alternatives: Réti intentionally holds 2.c4 and 2.g3 vs 1...d5; drill treats the other as 'also in repertoire'
const rm = repMoves({ color: 'w', lines: reti }); const af = new Chess(); af.move('Nf3'); af.move('d5');
ok(['c4', 'g3'].every(x => rm.get(fenKey(af.fen())).has(x)), 'repMoves lists both 2.c4 and 2.g3 after 1...d5');
const p = parsePgn('[Event "A"]\n\n1. e4 e5 2. Nf3 {main} Nc6 (2... d6 3. d4 (3. Bc4) exd4) 3. Bc4 Bc5!? *\n\n[Event "B"]\n\n1. d4 d5 *');
ok(p.lines.length === 4 && p.errors.length === 0, 'PGN nested variations + 2 games -> ' + p.lines.map(l => l.m.join(' ')).join(' | '));
ok(p.lines.filter(l => l.ch === 'A').length === 3 && p.lines.some(l => l.ch === 'B'), 'PGN chapters from Event header');
ok(p.lines.some(l => l.m.join(' ') === 'e4 e5 Nf3 d6 Bc4'), 'nested variation replaces correct move');
ok(parsePgn('1. e4 e5 2. Kxe8').errors.length === 1, 'illegal move rejected');
ok(parsePgn('1.e4 e5 2.Nf3 $1 Nc6 ; comment\n3.Bb5 a6 1-0').lines[0].m.length === 6, 'compact PGN, NAGs, ; comments');
ok(parsePgn(toPgn({ lines: p.lines })).lines.length === 4, 'toPgn round-trips');
ok(dedupe([['e4'], ['e4', 'e5'], ['e4', 'e5']]).length === 1, 'dedupe prefixes/dupes');
ok(userCards('e4 c6 d4 d5'.split(' '), 'b').map(c => c.san).join() === 'c6,d5', 'userCards black');
let c = schedule(undefined, 5, 0); ok(c.interval === 1, 'SM-2 1 day');
c = schedule(c, 5, 0); ok(c.interval === 6, 'SM-2 6 days');
c = schedule(c, 5, 0); ok(c.interval >= 15, 'SM-2 grows ' + c.interval);
c = schedule(c, 2, 0); ok(c.reps === 0 && c.lapses === 1 && c.due === 600000, 'SM-2 lapse → 10 min');
ok(schedule(undefined, 2, 0).ease >= 1.3, 'ease floor');
// drill sequencing
const rep = { color: 'w', lines: [{ m: ['e4', 'e5', 'Nf3'], ch: 'X' }, { m: ['d4', 'd5', 'c4'], ch: 'Y' }, { m: ['c4', 'e5', 'Nc3'], ch: 'Y' }] };
const k = l => userCards(rep.lines[l].m, 'w');
const cards = {}; k(0).forEach(x => cards[x.key] = { due: 50, lapses: 1, wrong: 5 }); k(1).forEach(x => cards[x.key] = { due: 1e9, lapses: 0 });
ok(buildQueue(rep, cards, 'due', { now: 100 }).join() === '0,2', 'due: overdue first then new, skip not-due');
ok(buildQueue(rep, cards, 'due', { now: 100, newLimit: 0 }).join() === '0', 'newLimit');
ok(buildQueue(rep, cards, 'mistakes').join() === '0', 'mistakes only');
ok(buildQueue(rep, cards, 'chapter', { chapter: 'Y' }).sort().join() === '1,2', 'chapter');
ok(buildQueue(rep, cards, 'random').length === 3, 'random = all');
ok(buildQueue(rep, cards, 'line', { line: 2 }).join() === '2', 'specific line');
// sounds
const ch = new Chess(); const s = san => { const m = ch.move(san); return soundFor(m, ch.inCheck()); };
ok(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'].map(s).join() === 'move,move,move,move,move,move,move,move,capture,capture,capture', 'move/capture sounds');
const c2 = new Chess(); ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'].forEach(x => c2.move(x)); ok(soundFor(c2.move('O-O'), false) === 'castle', 'castle sound');
const c3 = new Chess(); ['e4', 'f6', 'd4', 'g5'].forEach(x => c3.move(x)); ok(soundFor(c3.move('Qh5'), c3.inCheck()) === 'check', 'check sound');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
