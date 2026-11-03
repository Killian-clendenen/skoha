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

// ---------- search (home screen) ----------
export const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b\d+\.(\.\.)?\s*/g, '').replace(/[’'`"+#!?]/g, '').replace(/[^a-z0-9\-=\s]/g, ' ').replace(/\s+/g, ' ').trim();
const SAN_RE = /^([nbrqk]?[a-h]?[1-8]?x?[a-h][1-8](=[nbrq])?|o-o(-o)?)$/;
export const isMoveQuery = q => { const t = norm(q).split(' ').filter(Boolean); return t.length > 0 && t.every(x => SAN_RE.test(x)) && t.some(x => /[1-8]/.test(x)); };
// metas: starters/index.json entries; reps: [{id, name, color, starter, lines}]
export function buildSearchIndex(reps, metas = []) {
  const items = [];
  for (const r of reps) {
    const m = metas.find(s => s.id === r.starter) || {};
    const chs = [...new Set(r.lines.map(l => l.ch))];
    const moves = r.lines.map(l => norm(l.m.join(' ')));
    const base = [r.name, m.eco || '', ...(m.aliases || []), m.blurb || ''].map(norm);
    items.push({ type: 'opening', id: r.id, name: r.name, color: r.color, eco: m.eco || '', name_n: norm(r.name), keys: base, aliases: (m.aliases || []).map(norm), text: [...base, ...chs.map(norm)].join(' | '), moves });
    for (const ch of chs) items.push({ type: 'chapter', id: r.id, name: r.name, ch, color: r.color, name_n: norm(ch), keys: [norm(ch)], aliases: [], text: norm(ch) + ' | ' + norm(r.name),
      moves: r.lines.filter(l => l.ch === ch).map(l => norm(l.m.join(' '))) });
  }
  return items;
}
export function search(items, q, limit = 12) {
  const n = norm(q); if (!n) return [];
  const toks = n.split(' ');
  const moveQ = isMoveQuery(q);
  const out = [];
  for (const it of items) {
    let s = 0;
    if (moveQ) {
      const hits = it.moves.filter(m => m === n || m.startsWith(n + ' ')).length;
      if (hits) s = (it.type === 'opening' ? 92 : 90) + Math.min(hits, 9) / 10;
      if (it.aliases.some(a => a === n)) s = Math.max(s, 95);
    } else {
      if (it.name_n === n) s = 120;
      else if (it.name_n.startsWith(n)) s = 100;
      else if (it.name_n.split(/[\s:&()-]+/).some(w => w.startsWith(n))) s = it.type === 'chapter' ? 97 : 85;
      if (it.aliases.some(a => a === n)) s = Math.max(s, 95);
      else if (it.aliases.some(a => a.startsWith(n))) s = Math.max(s, 75);
      if (!s && toks.every(t => it.text.includes(t))) s = 50 + (it.name_n.includes(toks[0]) ? 10 : 0);
    }
    if (s) out.push({ ...it, score: s });
  }
  // a chapter hit makes its opening relevant too; dedupe openings
  return out.sort((a, b) => b.score - a.score || (a.type === 'opening' ? -1 : 1) - (b.type === 'opening' ? -1 : 1) || a.name.localeCompare(b.name)).slice(0, limit);
}

// Explanation-history navigation. view = ply count shown (0 = start position .. ply) or null = live. d = -1 back, +1 forward.
export function navStep(view, ply, d) {
  if (!ply) return null;
  const cur = view ?? ply, nv = Math.max(0, Math.min(ply, cur + d));
  return nv >= ply ? null : nv;
}

// ---------- first-visit guide: opening suggestions ----------
const SUGG = {
  w: { beginner: ['italian', 'london', 'scotch'], intermediate: ['italian', 'qg', 'vienna'], advanced: ['ruy', 'catalan', 'english'] },
  b: { beginner: ['carokann', 'scandi', 'qgd'], intermediate: ['french', 'slav', 'kid'], advanced: ['sicilian', 'nimzo', 'grunfeld'] },
};
export function suggestOpenings(side, level = 'beginner') {
  const L = SUGG.w[level] ? level : 'beginner';
  if (side === 'w' || side === 'b') return SUGG[side][L].slice();
  return [SUGG.w[L][0], SUGG.b[L][0], SUGG.b[L][1]];
}

// ---------- daily goal & streak ----------
export function dayKey(d = new Date()) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
export function addReview(hist = {}, now = new Date()) { const k = dayKey(now); return { ...hist, [k]: (hist[k] || 0) + 1 }; }
// consecutive days (ending today, or yesterday if today's goal isn't met yet) on which the goal was reached
export function goalStreak(hist = {}, goal = 10, now = new Date()) {
  const g = Math.max(1, goal | 0); const d = new Date(now); d.setHours(12, 0, 0, 0);
  if ((hist[dayKey(d)] || 0) < g) d.setDate(d.getDate() - 1);
  let n = 0; while ((hist[dayKey(d)] || 0) >= g) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function ringSvg(done, goal, size = 92) {
  const r = size / 2 - 7, c = 2 * Math.PI * r, f = Math.min(1, done / Math.max(1, goal));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${done} of ${goal} reviews today"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle class="ringfg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#ringg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><defs><linearGradient id="ringg"><stop offset="0" stop-color="#3ef0d0"/><stop offset="1" stop-color="#8a7dff"/></linearGradient></defs><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${size / 4.6}" font-weight="700">${done}/${goal}</text></svg>`;
}

// ---------- narrator text ----------
const PN = { N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
export function sanToWords(san) {
  let s = String(san || '').replace(/[!?]+$/, ''); const mate = s.endsWith('#'), chk = s.endsWith('+'); s = s.replace(/[+#]$/, '');
  let w;
  if (/^O-O-O/.test(s)) w = 'castles queenside'; else if (/^O-O/.test(s)) w = 'castles kingside';
  else {
    const m = s.match(/^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([NBRQ]))?$/); if (!m) return s;
    const [, pc, ff, fr, x, to, pr] = m; const piece = pc ? PN[pc] : (x ? ff + ' pawn' : 'pawn');
    w = pc ? `${piece}${ff || fr ? ' ' + (ff || '') + (fr || '') : ''} ${x ? 'takes' : 'to'} ${to}` : x ? `${ff} takes ${to}` : to;
    if (pr) w += `, promotes to ${PN[pr]}`;
  }
  return w + (mate ? ', checkmate' : chk ? ', check' : '');
}
export function speechText(t) {
  return String(t || '').replace(/\[%[^\]]*\]/g, '').replace(/[{}]/g, '').replace(/<[^>]+>/g, '').replace(/[!?]{1,2}(?=\s|$)/g, '')
    .replace(/\b(\d+)\.\.\.\s?/g, '').replace(/\b(\d+)\.\s?(?=[NBRQKa-hO])/g, '').replace(/\.\.\./g, ' ')
    .replace(/\b(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)(?=[\s,.;:)!?]|$)/g, m => /^[a-h][1-8]$/.test(m) ? m : sanToWords(m))
    .replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim();
}
export function pickVoice(voices, lang = 'en-US') {
  const base = lang.split('-')[0].toLowerCase(); const L = voices.filter(v => (v.lang || '').toLowerCase().startsWith(base)); const pool = L.length ? L : voices;
  const score = v => (/natural|neural|enhanced|premium/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 3 : 0) + ((v.lang || '').toLowerCase() === lang.toLowerCase() ? 1 : 0) + (v.localService === false ? .5 : 0);
  return pool.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

// ---------- sync payload / merge ----------
export function syncPayload(db) {
  const reps = db.reps.map(r => r.starter ? { id: r.id, name: r.name, color: r.color, starter: r.starter } : r);
  const { syncKey, ...rest } = db; return { app: 'Skoha', v: 1, at: Date.now(), ...rest, reps };
}
const better = (a, b) => !a ? b : !b ? a : ((b.reps || 0) + (b.lapses || 0) > (a.reps || 0) + (a.lapses || 0) || ((b.reps || 0) + (b.lapses || 0) === (a.reps || 0) + (a.lapses || 0) && (b.due || 0) > (a.due || 0))) ? b : a;
// merge two progress snapshots without losing work: per card keep the more-practised one, per day keep the higher count
export function mergeData(local, remote) {
  if (!remote) return local; const out = { ...local, ...remote };
  const ids = new Set([...(local.reps || []).map(r => r.id), ...(remote.reps || []).map(r => r.id)]);
  out.reps = [...ids].map(id => (local.reps || []).find(r => r.id === id && r.lines) || (remote.reps || []).find(r => r.id === id && r.lines) || (local.reps || []).find(r => r.id === id) || (remote.reps || []).find(r => r.id === id));
  out.cards = {}; for (const rid of new Set([...Object.keys(local.cards || {}), ...Object.keys(remote.cards || {})])) {
    const A = local.cards?.[rid] || {}, B = remote.cards?.[rid] || {}; out.cards[rid] = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out.cards[rid][k] = better(A[k], B[k]);
  }
  out.history = { ...(local.history || {}) }; for (const [d, n] of Object.entries(remote.history || {})) out.history[d] = Math.max(out.history[d] || 0, n);
  const ls = local.stats || {}, rs = remote.stats || {}; out.stats = (rs.reviews || 0) > (ls.reviews || 0) ? rs : ls;
  out.removed = [...new Set([...(local.removed || []), ...(remote.removed || [])])].filter(id => !out.reps.some(r => r.starter === id));
  out.settings = (remote.at || 0) >= (local.at || 0) ? { ...local.settings, ...remote.settings } : { ...remote.settings, ...local.settings };
  out.guided = local.guided || remote.guided; if (local.syncKey) out.syncKey = local.syncKey; else delete out.syncKey;
  delete out.app; delete out.v; return out;
}
export const b64u = { enc: u8 => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)) };
async function pipe(u8, T) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new T('deflate-raw'))).arrayBuffer()); }
export async function encodeSync(obj) { return 'SK1.' + b64u.enc(await pipe(new TextEncoder().encode(JSON.stringify(obj)), CompressionStream)); }
export async function decodeSync(code) {
  const c = String(code).trim().replace(/^.*#\/sync\//, '').replace(/\s+/g, ''); if (!c.startsWith('SK1.')) throw new Error('not a Skoha sync code');
  return JSON.parse(new TextDecoder().decode(await pipe(b64u.dec(c.slice(4)), DecompressionStream)));
}

// Guided pass (the answer was shown): keeps the card in daily rotation but never grows its interval;
// only a No-help pass (schedule(card, 5)) advances spaced repetition.
export function guidedPass(card, now = Date.now()) {
  const c = { ease: 2.5, interval: 0, reps: 0, lapses: 0, ...card };
  c.guided = (c.guided || 0) + 1; c.due = Math.min(c.due ?? Infinity, now + DAY); if (c.due < now) c.due = now + DAY; return c;
}

// Positions the user got wrong recently: one spot per (position, move) card, newest mistake first.
// Each spot = { rep: repId, li: lineIndex, ply } where ply is the user's move to find.
export function mistakeSpots(reps, cardsFor, { now = Date.now(), days = 30, limit = 40 } = {}) {
  const out = [], seen = new Set();
  for (const rep of reps) {
    const cs = cardsFor(rep) || {};
    (rep.lines || []).forEach((l, li) => {
      let cards; try { cards = userCards(l.m, rep.color); } catch { return; }
      for (const c of cards) {
        const card = cs[c.key]; if (!card || !card.lapses) continue;
        const recent = card.wrong && now - card.wrong <= days * 864e5, shaky = (card.reps || 0) < 3;
        if (!(recent || (shaky && !card.wrong)) || seen.has(rep.id + c.key)) continue;
        seen.add(rep.id + c.key); out.push({ rep: rep.id, li, ply: c.ply, t: card.wrong || card.last || 0 });
      }
    });
  }
  return out.sort((a, b) => b.t - a.t).slice(0, limit);
}
