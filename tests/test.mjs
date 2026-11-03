// node test.mjs — starter PGNs (every move legal), PGN parser, SM-2, drill sequencing, sounds.
import { readFileSync } from 'node:fs';
import { Chess } from '../vendor/chess.js';
import { sanToWords, speechText, pickVoice, dayKey, addReview, goalStreak, ringSvg, suggestOpenings, navStep, validateLine, parsePgn, userCards, schedule, buildQueue, soundFor, toPgn, dedupe, repMoves, fenKey, parseComment, describeMove, buildSearchIndex, search, isMoveQuery, norm } from '../core.js';
import { KB } from '../kb.js';
const validSq = q => /^[a-h][1-8]$/.test(q);
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } if (process.env.V) console.log((c ? 'PASS ' : 'FAIL ') + m); };
const idx = JSON.parse(readFileSync(new URL('../starters/', import.meta.url).pathname + 'index.json', 'utf8'));
for (const s of idx) {
  const { lines, errors } = parsePgn(readFileSync(new URL('../starters/', import.meta.url).pathname + '' + s.file, 'utf8'));
  ok(errors.length === 0, `${s.name}: all moves legal ${errors.join('; ')}`);
  ok(lines.length >= 5, `${s.name}: ${lines.length} lines`);
  console.log(`  ${s.name}: ${lines.length} lines, ${new Set(lines.map(l => l.ch)).size} chapters, ${new Set(lines.flatMap(l => userCards(l.m, s.color).map(c => c.key))).size} moves to learn`);
}
// annotations: every starter move has a hand-written comment; every arrow starts on an occupied square
for (const s of idx) {
  const { lines, intros } = parsePgn(readFileSync(new URL('../starters/', import.meta.url).pathname + s.file, 'utf8'));
  let moves = 0, noted = 0, badArrow = [];
  for (const l of lines) { const c = new Chess(); l.m.forEach((san, i) => { c.move(san); moves++; const n = l.n[i]; if (n?.t) noted++;
    for (const [o] of n?.cal || []) if (!c.get(o)) badArrow.push(san + ':' + o);
    for (const [o, d] of n?.cal || []) if (!validSq(o) || !validSq(d)) badArrow.push(san + ':' + o + d); }); }
  ok(noted === moves, `${s.name}: every move annotated (${noted}/${moves})`);
  ok(badArrow.length === 0, `${s.name}: arrows valid ${badArrow.slice(0, 5)}`);
  ok(Object.keys(intros).length === new Set(lines.map(l => l.ch)).size, `${s.name}: every chapter has an intro`);
  ok(KB[s.id] && KB[s.id].overview && KB[s.id].ideas.length && KB[s.id].traps.length, `${s.name}: knowledge base present`);
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
// comment parsing
const pc = parseComment('[%cal Gf3e5,Rd8h4][%csl Yf7] Hits e5 [%clk 0:05:00] now');
ok(pc.t === 'Hits e5 now' && pc.cal.length === 2 && pc.cal[1].join() === 'd8,h4,R' && pc.csl[0].join() === 'f7,Y', 'parseComment cal/csl/text');
const pa = parsePgn('{Intro} 1. e4 {[%csl Gd5] Centre} e5 2. Nf3!? {Hits e5} (2. f4?! {Gambit} exf4) Nc6 *');
ok(pa.intros.Imported === 'Intro', 'chapter intro comment');
const main = pa.lines.find(l => l.m[2] === 'Nf3'), gam = pa.lines.find(l => l.m[2] === 'f4');
ok(main.n[0].t === 'Centre' && main.n[0].csl[0][0] === 'd5' && main.n[2].t === 'Hits e5' && main.n[2].g === '!?' && !main.n[1], 'notes attach to correct plies + glyphs');
ok(gam.n[0].t === 'Centre' && gam.n[2].t === 'Gambit' && gam.n[2].g === '?!', 'variation inherits prefix notes, own note');
const rt = parsePgn(toPgn({ lines: pa.lines }));
ok(rt.lines.find(l => l.m[2] === 'Nf3').n[0].csl[0][0] === 'd5' && rt.lines.find(l => l.m[2] === 'Nf3').n[2].t === 'Hits e5', 'toPgn keeps comments + arrows');
const dm = new Chess(); ok(/development/.test(describeMove(dm.move('Nf3'), false)), 'auto description fallback');
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
// library size + home ties
const W = idx.filter(s => s.color === 'w'), Bk = idx.filter(s => s.color === 'b');
ok(idx.length >= 25 && W.length >= 12 && Bk.length >= 14, `library: ${idx.length} repertoires (${W.length} White, ${Bk.length} Black)`);
ok(new Set(idx.map(s => s.id)).size === idx.length, 'unique starter ids');
for (const b of Bk) ok(W.some(w => b.answers === w.first || (b.vs || []).includes(w.id)), `${b.name} tied to a White opening`);
for (const b of Bk) for (const v of b.vs || []) ok(idx.some(s => s.id === v), `${b.name} vs ${v} exists`);
const all = idx.map(s => ({ id: s.id, name: s.name, color: s.color, starter: s.id, lines: parsePgn(readFileSync(new URL('../starters/', import.meta.url).pathname + s.file, 'utf8')).lines }));
let tl = 0, tm = 0; all.forEach(r => { tl += r.lines.length; tm += new Set(r.lines.flatMap(l => userCards(l.m, r.color).map(c => c.key))).size; });
console.log(`  TOTAL: ${all.length} repertoires, ${tl} lines, ${tm} moves to learn`);
// search
const SI = buildSearchIndex(all, idx);
const top = q => search(SI, q)[0];
ok(norm('1.e4 c5 2.Nf3') === 'e4 c5 nf3' && norm('Grünfeld') === 'grunfeld', 'norm strips numbers + accents');
ok(isMoveQuery('e4 c5') && isMoveQuery('1.d4 Nf6') && !isMoveQuery('Najdorf') && !isMoveQuery('B90'), 'move query detection');
ok(top('Sicilian')?.id === 'sicilian' && top('Sicilian').type === 'opening', 'search "Sicilian" -> Sicilian opening');
ok(top('Najdorf')?.id === 'sicilian' && top('Najdorf').type === 'chapter' && /Najdorf/.test(top('Najdorf').ch), 'search "Najdorf" -> Sicilian Najdorf chapter');
ok(search(SI, 'e4 c5').every(r => r.id === 'sicilian' || r.id === 'kia') && search(SI, 'e4 c5')[0]?.id === 'sicilian', 'search "e4 c5" -> Sicilian first: ' + search(SI, 'e4 c5').map(r => r.id + ':' + (r.ch || '')).slice(0, 4));
ok(top('grunfeld')?.id === 'grunfeld' && top('Grünfeld')?.id === 'grunfeld', 'accent-insensitive search');
ok(top('C42')?.id === 'petroff' && top('b90')?.id === 'sicilian', 'ECO alias search');
ok(top('reti')?.id === 'reti' && top('kings gambit')?.id === 'kingsgambit' && top("king's indian def")?.id === 'kid', 'name search with apostrophes');
ok(top('1.d4 Nf6 2.c4 e6 3.Nc3 Bb4')?.id === 'nimzo', 'moves search -> Nimzo');
ok(top('winawer')?.ch?.includes('Winawer') && top('berlin wall')?.id === 'berlin', 'variation search');
ok(search(SI, 'zzzz').length === 0 && search(SI, '').length === 0, 'no false hits');
ok(navStep(null, 5, -1) === 4 && navStep(4, 5, -1) === 3 && navStep(1, 5, -1) === 0 && navStep(0, 5, -1) === 0 && navStep(null, 1, -1) === 0 && navStep(0, 1, 1) === null && navStep(3, 5, 1) === 4 && navStep(4, 5, 1) === null && navStep(null, 5, 1) === null && navStep(null, 0, -1) === null, 'explanation history navStep');
ok(suggestOpenings('b','advanced').includes('sicilian') && suggestOpenings('w').length === 3 && suggestOpenings('both','intermediate').length === 3 && suggestOpenings('w','x')[0] === 'italian', 'guide suggestions');
for (const l of ['beginner','intermediate','advanced']) for (const sd of ['w','b','both']) ok(suggestOpenings(sd,l).every(id => idx.some(s => s.id === id)), `suggestions exist ${sd}/${l}`);
{ const now = new Date(2026, 10, 2, 20); const d = n => dayKey(new Date(2026, 10, 2 - n, 12));
  ok(dayKey(now) === '2026-11-02', 'dayKey local');
  let h = {}; for (let i = 0; i < 3; i++) h = addReview(h, now); ok(h['2026-11-02'] === 3, 'addReview counts');
  ok(goalStreak({ [d(0)]: 10, [d(1)]: 12, [d(2)]: 10, [d(4)]: 10 }, 10, now) === 3, 'streak counts consecutive goal days');
  ok(goalStreak({ [d(0)]: 3, [d(1)]: 10, [d(2)]: 10 }, 10, now) === 2, 'today unfinished keeps yesterday streak');
  ok(goalStreak({ [d(0)]: 3, [d(2)]: 10 }, 10, now) === 0, 'gap breaks streak');
  ok(goalStreak({}, 10, now) === 0, 'empty streak');
  ok(/3\/10/.test(ringSvg(3, 10)) && /stroke-dasharray/.test(ringSvg(30, 10)), 'ring svg'); }
ok(sanToWords('Nf3') === 'Knight to f3', 'say Nf3'); ok(sanToWords('Bxe5') === 'Bishop takes e5', 'say Bxe5'); ok(sanToWords('O-O') === 'castles kingside', 'say O-O');
ok(sanToWords('O-O-O+') === 'castles queenside, check', 'say O-O-O+'); ok(sanToWords('exd5') === 'e takes d5', 'say exd5'); ok(sanToWords('e4') === 'e4', 'say e4'); ok(sanToWords('Qh5+') === 'Queen to h5, check', 'say check');
ok(sanToWords('e8=Q#') === 'e8, promotes to Queen, checkmate', 'say promo mate'); ok(sanToWords('Nbd2') === 'Knight b to d2', 'say disambig');
ok(speechText('[%cal Gf3e5] Hits e5; prepares 3.Bb5! and ...Nf6') === 'Hits e5; prepares Bishop to b5 and Nf6'.replace('Nf6', 'Knight to f6'), 'speech text strips tags/symbols: ' + speechText('[%cal Gf3e5] Hits e5; prepares 3.Bb5! and ...Nf6'));
ok(pickVoice([{ name: 'Fred', lang: 'en-US' }, { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' }, { name: 'Google français', lang: 'fr-FR' }], 'en-US').name.includes('Natural'), 'prefers natural voice in language');
ok(pickVoice([{ name: 'Fred', lang: 'en-US' }, { name: 'Google US English', lang: 'en-US' }], 'en-GB').name.startsWith('Google'), 'prefers Google voice');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
