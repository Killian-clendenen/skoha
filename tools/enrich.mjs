// Rewrites short/generic move notes in starters/*.pgn into 1–2 instructive sentences computed from the
// actual position (what the move develops/controls/attacks/prepares, and what the opponent's last move
// committed to). Usage: node tools/enrich.mjs [--dry]
import fs from 'node:fs'; import { Chess } from '../vendor/chess.js';
const DIR = new URL('../starters/', import.meta.url).pathname, DRY = process.argv.includes('--dry');
const P = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }, V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };
const CENTRE = ['d4', 'e4', 'd5', 'e5'], EXT = ['c4', 'c5', 'f4', 'f5', 'c3', 'f3', 'c6', 'f6', 'd3', 'e3', 'd6', 'e6'];
const GENERIC = /^(Development|Develops|Solid( development)?|King safety|Castles|Recaptures|Takes|Captures|Retreats|Centre|Classical|Symmetry|Black matches|Trades|Defends|Develops and defends|Natural|Flexible|Normal|Useful|Main line|Theory|Standard|Logical)\.?$/i;
const SIDE = c => c === 'w' ? 'White' : 'Black';
const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
function attacksFrom(ch, sq) { // squares the piece on sq attacks (pure geometry)
  const pc = ch.get(sq); if (!pc) return []; const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1, out = [];
  const at = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8 ? String.fromCharCode(97 + x) + (y + 1) : null;
  const step = ds => ds.forEach(([dx, dy]) => { const t = at(f + dx, r + dy); if (t) out.push(t); });
  const ray = ds => ds.forEach(([dx, dy]) => { for (let k = 1; k < 8; k++) { const t = at(f + dx * k, r + dy * k); if (!t) break; out.push(t); if (ch.get(t)) break; } });
  const D = [[1, 1], [1, -1], [-1, 1], [-1, -1]], O = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (pc.type === 'p') step([[-1, pc.color === 'w' ? 1 : -1], [1, pc.color === 'w' ? 1 : -1]]);
  if (pc.type === 'n') step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
  if (pc.type === 'k') step([...D, ...O]);
  if (pc.type === 'b' || pc.type === 'q') ray(D); if (pc.type === 'r' || pc.type === 'q') ray(O);
  return out;
}
const SQS = []; for (const r of '12345678') for (const f of 'abcdefgh') SQS.push(f + r);
const defended = (ch, sq, by) => SQS.some(s => { const p = ch.get(s); return p && p.color === by && s !== sq && attacksFrom(ch, s).includes(sq); });
function rel(after, me, sqs) { // describe squares by what stands there
  const own = [], foe = [], free = [];
  for (const q of sqs) { const p = after.get(q); if (!p) free.push(q); else (p.color === me ? own : foe).push(`the ${P[p.type]} on ${q}`); }
  return [free.length ? 'controls ' + list(free) : '', own.length ? 'supports ' + list(own) : '', foe.length ? 'eyes ' + list(foe) : ''].filter(Boolean);
}
function describe(before, mv, prev) {
  const after = new Chess(before.fen()); after.move(mv.san); const me = mv.color, opp = me === 'w' ? 'b' : 'w', out = [];
  const att = attacksFrom(after, mv.to), cen = att.filter(s => CENTRE.includes(s)), ext = att.filter(s => EXT.includes(s));
  const targets = att.map(s => [s, after.get(s)]).filter(([s, p]) => p && p.color === opp && p.type !== 'k' && (V[p.type] > V[mv.piece] || !defended(after, s, opp)));
  if (mv.flags.includes('k') || mv.flags.includes('q')) {
    const rook = mv.flags.includes('k') ? (me === 'w' ? 'f1' : 'f8') : (me === 'w' ? 'd1' : 'd8');
    out.push(`Castles ${mv.flags.includes('k') ? 'kingside' : 'queenside'}: the king is safe and the rook on ${rook} joins the game.`);
  } else if (mv.captured) {
    const re = prev && prev.to === mv.to && prev.captured;
    const canRe = SQS.some(s => { const p = after.get(s); return p && p.color === opp && attacksFrom(after, s).includes(mv.to); });
    out.push(re ? `Recaptures on ${mv.to}, restoring the material balance.` : `Takes the ${P[mv.captured]} on ${mv.to}${canRe ? `; ${SIDE(opp)} will want to recapture` : ', and it cannot be taken back at once'}.`);
  } else if (mv.piece === 'p') {
    const opened = [];
    const b4 = new Chess(before.fen());
    for (const s of SQS) { const p = after.get(s); if (p && p.color === me && 'bq'.includes(p.type)) { const n1 = attacksFrom(after, s).length, n0 = attacksFrom(b4, s).length; if (n1 > n0 + 1) opened.push(`the ${P[p.type]} on ${s}`); } }
    const r1 = rel(after, me, att);
    if (CENTRE.includes(mv.to)) out.push(`Claims the centre: the pawn on ${mv.to} ${list(r1)}.`);
    else if (cen.length) out.push(`Supports the centre: the pawn on ${mv.to} ${list(r1)}.`);
    else if (Math.abs(mv.to.charCodeAt(0) - mv.from.charCodeAt(0)) === 0 && Math.abs(+mv.to[1] - +mv.from[1]) === 2 && 'abgh'.includes(mv.to[0])) out.push(`Gains space on the ${'ab'.includes(mv.to[0]) ? 'queenside' : 'kingside'}; the pawn on ${mv.to} takes ${list(att)} away from the opponent.`);
    else out.push(`The pawn on ${mv.to} ${list(r1)}.`);
    if (opened.length) out.push(`It also opens a line for ${list(opened.slice(0, 2))}.`);
  } else {
    const home = me === 'w' ? '1' : '8', dev = 'nb'.includes(mv.piece) && mv.from[1] === home;
    const fian = mv.piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(mv.to);
    if (fian) out.push(`Fianchettoes the bishop on ${mv.to}, where it rakes the long diagonal through ${list(att.filter(s => CENTRE.includes(s) || ['c3', 'f3', 'c6', 'f6'].includes(s)).slice(0, 3)) || 'the centre'}.`);
    else if (dev) out.push(`Develops the ${P[mv.piece]} to ${mv.to}${cen.length ? ', where it ' + list(rel(after, me, cen)) : ext.length ? ', where it ' + list(rel(after, me, ext.slice(0, 2))) : ''}.`);
    else {
      const back = me === 'w' ? +mv.to[1] < +mv.from[1] : +mv.to[1] > +mv.from[1];
      const hit = SQS.some(q => { const p = before.get(q); return p && p.color === opp && attacksFrom(before, q).includes(mv.from) && (V[p.type] < V[mv.piece] || !defended(before, mv.from, me)); });
      out.push(`${hit ? `Moves the ${P[mv.piece]} out of attack to ${mv.to}` : back ? `Regroups the ${P[mv.piece]} to ${mv.to}` : `The ${P[mv.piece]} goes to ${mv.to}`}${cen.length ? ' and ' + list(rel(after, me, cen)) : ''}.`);
    }
    // castling preparation
    const k = me === 'w' ? 'e1' : 'e8', ks = me === 'w' ? ['f1', 'g1'] : ['f8', 'g8'];
    if (after.get(k)?.type === 'k' && ks.includes(mv.from) && ks.every(s => !after.get(s)) && (me === 'w' ? /K/ : /k/).test(after.fen().split(' ')[2])) out.push('That clears the way to castle kingside.');
  }
  if (targets.length && !mv.captured && out[0].includes(`the ${P[targets[0][1].type]} on ${targets[0][0]}`)) { const [s, p] = targets[0]; if (!defended(after, s, opp)) out.push(`That ${P[p.type]} is currently undefended.`); }
  else if (targets.length && !mv.captured) { const [s, p] = targets[0]; out.push(`It ${after.inCheck() ? 'gives check and ' : ''}attacks the ${P[p.type]} on ${s}${defended(after, s, opp) ? '' : ', which is undefended'}.`); }
  else if (after.inCheck()) out.push('It gives check.');
  // what the opponent's last move committed to
  if (prev && out.length < 3 && !mv.captured) {
    if (att.includes(prev.to) && !(targets.length && targets[0][0] === prev.to)) out.push(`${SIDE(opp)}'s last move put a ${P[prev.piece]} on ${prev.to}, which this now pressures.`);
  }
  return out.slice(0, 2).join(' ');
}
let changed = 0, kept = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.pgn'))) {
  const src = fs.readFileSync(DIR + f, 'utf8'); let res = '', i = 0;
  const stack = []; let ch = new Chess(), lastBefore = null, lastMv = null, prevMv = null, prevStack = [];
  const re = /(\[Event[^\]]*\])|(\{[^}]*\})|(\()|(\))|(\d+\.(?:\.\.)?)|([NBRQKa-hO][\w\-=+#!?]*)/g; let m, pendingMv = null, pendingBefore = null, pendingPrev = null;
  while ((m = re.exec(src))) {
    if (m[1]) { ch = new Chess(); lastMv = prevMv = null; pendingMv = null; continue; }
    if (m[3]) { stack.push({ fen: ch.fen(), lastMv, prevMv, lastBefore }); ch = new Chess(lastBefore.fen()); lastMv = prevMv; pendingMv = null; continue; }
    if (m[4]) { const s = stack.pop(); ch = new Chess(s.fen); lastMv = s.lastMv; prevMv = s.prevMv; lastBefore = s.lastBefore; pendingMv = null; continue; }
    if (m[5]) continue;
    if (m[6]) { const before = new Chess(ch.fen()); let mv; try { mv = ch.move(m[6].replace(/[!?]+$/, '')); } catch { continue; }
      pendingMv = mv; pendingBefore = before; pendingPrev = lastMv; lastBefore = before; prevMv = lastMv; lastMv = mv; continue; }
    if (m[2] && pendingMv) {
      const body = m[2].slice(1, -1), tags = (body.match(/\[%[^\]]*\]/g) || []).join(' '), txt = body.replace(/\[%[^\]]*\]/g, '').trim();
      const core = txt.replace(/\s*The (pawn|knight|bishop|rook|queen|king) on [a-h][1-8] (eyes|controls)[^.]*\./g, '').trim();
      if (core.length < 45 && core.length < txt.length + 1) {
        let lead = txt.replace(/\s*The (pawn|knight|bishop|rook|queen|king) on [a-h][1-8] (eyes|controls)[^.]*\./g, '').replace(/\s*(Castles|King safety)\.?\s*$/i, '').trim();
        if (GENERIC.test(lead)) lead = '';
        const gen = describe(pendingBefore, pendingMv, pendingPrev);
        let g2 = gen; const L = lead.toLowerCase();
        if (/space/.test(L)) g2 = g2.replace(/^Gains space on the \w+; the/, 'The');
        if (/centre|center/.test(L)) g2 = g2.replace(/^(Claims|Supports) the centre: the/, 'The');
        if (/develop/.test(L)) g2 = g2.replace(/^Develops the (\w+) to ([a-h][1-8]), where it/, 'The $1 on $2');
        if (/fianchetto/.test(L)) g2 = g2.replace(/^Fianchettoes the bishop on ([a-h][1-8]), where it rakes/, 'The bishop on $1 rakes');
        if (/retreat/.test(L)) g2 = g2.replace(/^(Regroups|Moves) the (\w+)( out of attack)? to/, 'The $2 goes to');
        const gen2 = g2;
        const neu = [lead && !/[.!?]$/.test(lead) ? lead + '.' : lead, gen2].filter(Boolean).join(' ');
        if (neu && neu !== txt) { res += src.slice(i, m.index) + '{' + (tags ? tags + ' ' : '') + neu + '}'; i = m.index + m[2].length; changed++; }
      } else kept++;
      pendingMv = null;
    }
  }
  res += src.slice(i); if (!DRY) fs.writeFileSync(DIR + f, res);
}
console.log({ changed, kept });
