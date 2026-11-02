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

// Parse PGN text (many games, nested variations). Each game = a chapter (Event/Chapter header).
// Returns { lines: [{m:[san...], ch}], errors: [] }
export function parsePgn(text, defaultChapter = 'Imported') {
  const games = text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[)/);
  const raw = [];
  for (let g of games) {
    const hdr = {}; g.replace(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm, (_, k, v) => { hdr[k] = v; });
    const ch = hdr.Chapter || (hdr.Event && hdr.Event !== '?' ? hdr.Event : '') || defaultChapter;
    g = g.replace(/^\s*\[[^\]]*\]\s*$/gm, '').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
         .replace(/\$\d+/g, ' ').replace(/\(/g, ' ( ').replace(/\)/g, ' ) ');
    const toks = g.split(/\s+/).filter(Boolean)
      .map(t => t.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, ''))
      .filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\d+\.*$/.test(t));
    let i = 0;
    const walk = prefix => {
      const cur = [...prefix]; const slot = raw.push(null) - 1;
      while (i < toks.length) {
        const t = toks[i++];
        if (t === '(') { walk(cur.slice(0, -1)); continue; }
        if (t === ')') break;
        cur.push(t);
      }
      if (cur.length > prefix.length) raw[slot] = { m: cur, ch };
    };
    walk([]);
  }
  const ok = [], errors = [];
  for (const l of raw.filter(Boolean)) { try { ok.push({ m: validateLine(l.m), ch: l.ch }); } catch (e) { errors.push(`[${l.ch}] ${e.message}`); } }
  return { lines: dedupe(ok), errors };
}

// Accepts lines as arrays (v1) or {m,ch}; drops duplicates and strict prefixes.
export function dedupe(lines) {
  const L = lines.map(l => Array.isArray(l) ? { m: l, ch: 'Main' } : l);
  const s = L.map(l => l.m.join(' '));
  return L.filter((l, i) => !s.some((o, j) => j !== i && (o === s[i] ? j < i : o.startsWith(s[i] + ' '))));
}

export function toPgn(rep) {
  const byCh = {}; rep.lines.forEach(l => (byCh[l.ch] ||= []).push(l.m));
  return Object.entries(byCh).map(([ch, ls]) => ls.map(m =>
    `[Event "${ch.replace(/"/g, "'")}"]\n\n${m.map((s, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + s).join(' ')} *`).join('\n\n')).join('\n\n') + '\n';
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
