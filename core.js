// Pure logic (no DOM): PGN parsing (chapters + nested variations), SM-2, drill sequencing. Shared by app and tests.
import { Chess } from './vendor/chess.js';

export const fenKey = fen => fen.split(' ').slice(0, 4).join(' ');

export function validateLine(moves) {
  const c = new Chess(); const out = [];
  for (const m of moves) {
    let r; try { r = c.move(m); } catch { r = null; }
    if (!r) throw new Error(`Illegal move "${m}" after: ${out.join(' ') || '(start)'}`);
    out.push(r.san);
  }
  return out;
}

// Parse a PGN comment: returns { t: text, cal: [[from,to,color]], csl: [[sq,color]] }
export function parseComment(raw) {
  const cal = [], csl = [];
  let t = raw.replace(/\[%cal\s+([^\]]*)\]/g, (_, v) => { v.split(',').forEach(x => { const m = x.trim().match(/^([GRYB])([a-h][1-8])([a-h][1-8])$/); if (m) cal.push([m[2], m[3], m[1]]); }); return ''; })
             .replace(/\[%csl\s+([^\]]*)\]/g, (_, v) => { v.split(',').forEach(x => { const m = x.trim().match(/^([GRYB])([a-h][1-8])$/); if (m) csl.push([m[2], m[1]]); }); return ''; })
             .replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  return { t, cal, csl };
}
const mergeNote = (a, b) => !a ? b : { t: [a.t, b.t].filter(Boolean).join(' '), cal: [...a.cal, ...b.cal], csl: [...a.csl, ...b.csl], g: a.g || b.g };

// Parse PGN text (many games, nested variations, comments). Each game = a chapter (Event/Chapter header).
// Returns { lines: [{m:[san...], ch, n:[note|null per ply]}], errors: [], intros: {chapter: text} }
export function parsePgn(text, defaultChapter = 'Imported') {
  const games = text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[)/);
  const raw = [], intros = {};
  for (let g of games) {
    const hdr = {}; g.replace(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm, (_, k, v) => { hdr[k] = v; });
    const ch = hdr.Chapter || (hdr.Event && hdr.Event !== '?' ? hdr.Event : '') || defaultChapter;
    g = g.replace(/^\s*\[[^\]]*\]\s*$/gm, '');
    const toks = (g.match(/\{[^}]*\}|;[^\n]*|\(|\)|[^\s(){};]+/g) || []);
    let i = 0;
    const walk = (prefix, pnotes) => {
      const cur = [...prefix], notes = [...pnotes]; const slot = raw.push(null) - 1;
      while (i < toks.length) {
        let t = toks[i++];
        if (t === '(') { walk(cur.slice(0, -1), notes.slice(0, -1)); continue; }
        if (t === ')') break;
        if (t[0] === '{' || t[0] === ';') {
          const c = parseComment(t[0] === '{' ? t.slice(1, -1) : t.slice(1));
          if (!cur.length) { if (c.t) intros[ch] = (intros[ch] ? intros[ch] + ' ' : '') + c.t; }
          else if (cur.length > prefix.length) notes[cur.length - 1] = mergeNote(notes[cur.length - 1], c);
          continue;
        }
        if (/^\$\d+$/.test(t) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue;
        t = t.replace(/^\d+\.(\.\.)?/, ''); if (!t || /^\d+\.*$/.test(t)) continue;
        const gl = (t.match(/[!?]+$/) || [''])[0]; t = t.slice(0, t.length - gl.length);
        cur.push(t); notes.push(gl ? { t: '', cal: [], csl: [], g: gl } : null);
      }
      if (cur.length > prefix.length) raw[slot] = { m: cur, ch, n: notes };
    };
    walk([], []);
  }
  const ok = [], errors = [];
  for (const l of raw.filter(Boolean)) { try { ok.push({ m: validateLine(l.m), ch: l.ch, n: l.n }); } catch (e) { errors.push(`[${l.ch}] ${e.message}`); } }
  // a move repeated in several variations shares its annotation (write it once, shown everywhere)
  const byPrefix = new Map();
  ok.forEach(l => l.m.forEach((_, i) => { const n = l.n[i]; if (n?.t || n?.cal?.length || n?.csl?.length) { const k = l.m.slice(0, i + 1).join(' '); if (!byPrefix.has(k)) byPrefix.set(k, n); } }));
  ok.forEach(l => l.m.forEach((_, i) => { const n = l.n[i]; if (!n?.t) { const f = byPrefix.get(l.m.slice(0, i + 1).join(' ')); if (f) l.n[i] = { ...f, g: n?.g || f.g }; } }));
  return { lines: dedupe(ok), errors, intros };
}

// Plain-language fallback when a move has no annotation.
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export function describeMove(m, inCheck) {
  if (m.flags.includes('k')) return 'Castles kingside: the king gets safe and the rook comes toward the centre.';
  if (m.flags.includes('q')) return 'Castles queenside: the king is tucked away and the rook lands on the d-file at once.';
  let s = m.captured ? `The ${PIECE[m.piece]} captures on ${m.to}.` : m.piece === 'p' ? `Pawn to ${m.to}${'de'.includes(m.to[0]) ? ', fighting for the centre' : ''}.` : `The ${PIECE[m.piece]} goes to ${m.to}${'nb'.includes(m.piece) && '18'.includes(m.from[1]) ? ' (development)' : ''}.`;
  if (inCheck) s += ' Check!';
  return s;
}

// Accepts lines as arrays (v1) or {m,ch}; drops duplicates and strict prefixes.
export function dedupe(lines) {
  const L = lines.map(l => Array.isArray(l) ? { m: l, ch: 'Main' } : l);
  const s = L.map(l => l.m.join(' '));
  return L.filter((l, i) => !s.some((o, j) => j !== i && (o === s[i] ? j < i : o.startsWith(s[i] + ' '))));
}

export function toPgn(rep) {
  const byCh = {}; rep.lines.forEach(l => (byCh[l.ch] ||= []).push(l));
  const note = n => { if (!n) return ''; const tags = (n.cal?.length ? `[%cal ${n.cal.map(([a, b, c]) => c + a + b).join(',')}]` : '') + (n.csl?.length ? `[%csl ${n.csl.map(([a, c]) => c + a).join(',')}]` : '');
    return (n.g || '') + (n.t || tags ? ` {${tags}${tags && n.t ? ' ' : ''}${(n.t || '').replace(/[{}]/g, '')}}` : ''); };
  return Object.entries(byCh).map(([ch, ls]) => ls.map(l =>
    `[Event "${ch.replace(/"/g, "'")}"]\n\n${l.m.map((s, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + s + note(l.n?.[i])).join(' ')} *`).join('\n\n')).join('\n\n') + '\n';
}

// Cards = (position before user's move, user's move).
export function userCards(line, color) {
  const c = new Chess(); const cards = [];
  line.forEach((san, ply) => {
    if ((ply % 2 === 0 ? 'w' : 'b') === color) cards.push({ key: fenKey(c.fen()) + '|' + san, san, ply });
    c.move(san);
  });
  return cards;
}

const DAY = 864e5;
// SM-2. quality: 5 perfect, 4 learned with hint (new move), 2 = wrong.
export function schedule(card, quality, now = Date.now()) {
  const c = { ease: 2.5, interval: 0, reps: 0, lapses: 0, ...card };
  if (quality < 3) { c.reps = 0; c.lapses++; c.interval = 0; c.due = now + 10 * 60e3; c.wrong = now; }
  else {
    c.reps++;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 6 : Math.round(c.interval * c.ease);
    c.due = now + c.interval * DAY;
  }
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  c.last = now;
  return c;
}
export const isDue = (card, now = Date.now()) => !card || card.due <= now;

const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Build a drill queue (array of line indexes) for a repertoire.
// mode: 'due' | 'random' | 'chapter' | 'line' | 'mistakes'
export function buildQueue(rep, cards, mode, { now = Date.now(), chapter, line, newLimit = 10, rnd = Math.random } = {}) {
  const idx = rep.lines.map((_, i) => i);
  const info = i => {
    const cs = userCards(rep.lines[i].m, rep.color).map(c => cards[c.key]);
    const due = cs.filter(c => c && c.due <= now);
    return { i, fresh: cs.some(c => !c), due: due.length, minDue: Math.min(...cs.map(c => c ? c.due : Infinity)),
      lapses: cs.reduce((s, c) => s + (c?.lapses || 0), 0), recentWrong: Math.max(0, ...cs.map(c => c?.wrong || 0)) };
  };
  if (mode === 'line') return rep.lines[line] ? [line] : [];
  if (mode === 'chapter') return shuffle(idx.filter(i => rep.lines[i].ch === chapter), rnd);
  if (mode === 'random') return shuffle(idx, rnd);
  const I = idx.map(info);
  if (mode === 'mistakes') return I.filter(x => x.lapses > 0).sort((a, b) => b.recentWrong - a.recentWrong || b.lapses - a.lapses).map(x => x.i);
  // due: reviews first (most overdue first), then up to newLimit lines that introduce new moves (in PGN order)
  const rev = I.filter(x => x.due > 0).sort((a, b) => a.minDue - b.minDue).map(x => x.i);
  const fresh = I.filter(x => x.due === 0 && x.fresh).slice(0, newLimit).map(x => x.i);
  return [...rev, ...fresh];
}

// Sound for a chess.js move result.
export function soundFor(m, inCheck) {
  if (inCheck) return 'check';
  if (m.flags.includes('k') || m.flags.includes('q')) return 'castle';
  if (m.captured) return 'capture';
  return 'move';
}

// Map position → set of repertoire moves for the user (repertoires may hold alternatives, e.g. Réti 2.c4 and 2.g3).
export function repMoves(rep) {
  const map = new Map();
  for (const l of rep.lines) for (const c of userCards(l.m, rep.color)) {
    const [pos, san] = c.key.split('|'); (map.get(pos) || map.set(pos, new Set()).get(pos)).add(san);
  }
  return map;
}
