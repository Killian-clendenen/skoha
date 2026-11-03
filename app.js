import { Chess, SQUARES } from './vendor/chess.js';
import { Chessground } from './vendor/chessground.min.js';
import { mistakeSpots, validateLine, parsePgn, dedupe, userCards, schedule, isDue, buildQueue, soundFor, toPgn, repMoves, fenKey, describeMove, buildSearchIndex, search, navStep, suggestOpenings, dayKey, addReview, goalStreak, ringSvg, guidedPass, syncPayload, mergeData, encodeSync, decodeSync } from './core.js?v=20261103d';
import { TRAPS } from './traps.js?v=20261103d';
import { KB } from './kb.js?v=20261103d';
import { Engine } from './engine.js?v=20261103d';
import { Narrator } from './narrator.js?v=20261103d';

const KEY = 'freereps.v2';  // same key as v2 so progress carries over
const $ = s => document.querySelector(s);
const DEF = { sound: true, volume: 0.7, anim: 200, delay: 400, premove: true, dests: true, coords: true, autoNext: true, flip: false, newLimit: 10, theme: 'brown', notes: true, autoReply: false, dailyGoal: 10, narrator: false, voice: '', voiceRate: 1, voicePitch: 1, narrOpp: true, confirm: false, help: 'guided' };
let db = load();
function load() {
  try {
    let d = JSON.parse(localStorage.getItem(KEY));
    if (!d) { const v1 = JSON.parse(localStorage.getItem('freereps.v1')); if (v1) d = migrate(v1); }
    d ||= { reps: [], cards: {} }; return repair(d);
  } catch { return { reps: [], cards: {}, settings: { ...DEF } }; }
}
// repair data saved by any older version so one bad record can never break an opening
function repair(d) {
  if (!d || typeof d !== 'object') d = {};
  d.reps = Array.isArray(d.reps) ? d.reps.filter(r => r && typeof r === 'object') : []; d.cards = d.cards && typeof d.cards === 'object' ? d.cards : {};
  const seen = new Map();
  for (const r of d.reps) {
    r.id = String(r.id || r.starter || Math.random().toString(36).slice(2, 10)); r.color = r.color === 'b' ? 'b' : 'w'; r.name = String(r.name || 'Repertoire');
    r.lines = (Array.isArray(r.lines) ? r.lines : []).map(l => Array.isArray(l) ? { m: l, ch: 'Main' } : l).filter(l => l && Array.isArray(l.m) && l.m.length);
    r.lines.forEach(l => { l.m = l.m.map(String); l.ch = String(l.ch || 'Main'); });
    if (r.starter) { r.starter = String(r.starter).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const first = seen.get(r.starter);
      if (first) { const A = d.cards[first.id] ||= {}, B = d.cards[r.id] || {}; for (const [k, c] of Object.entries(B)) if (!A[k] || (c.reps || 0) > (A[k].reps || 0)) A[k] = c; delete d.cards[r.id]; r._dup = true; }
      else seen.set(r.starter, r); }
  }
  d.reps = d.reps.filter(r => !r._dup);
  if (!Array.isArray(d.removed)) d.removed = [];
  const st = d.settings = { ...DEF, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) };
  const num = (k, lo, hi) => { const v = Number(st[k]); st[k] = Number.isFinite(v) && v >= lo && v <= hi ? v : DEF[k]; };
  num('newLimit', 1, 100); num('dailyGoal', 1, 500); num('delay', 0, 5000); num('anim', 0, 2000); num('volume', 0, 1); num('voiceRate', 0.3, 3); num('voicePitch', 0.3, 2);
  for (const k of Object.keys(DEF)) if (typeof DEF[k] === 'boolean') st[k] = typeof st[k] === 'boolean' ? st[k] : DEF[k];
  if (!['guided', 'none'].includes(st.help)) st.help = 'guided';
  return d;
}
function migrate(d) { d.reps.forEach(r => r.lines = dedupe(r.lines.map(l => Array.isArray(l) ? { m: l, ch: 'Main' } : l))); return d; }
function toast(t) { let e = document.querySelector('.toast'); if (!e) { e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); document.body.append(e); } e.textContent = t; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 3200); }
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
const S = () => db.settings;
const cardsOf = rep => db.cards[rep.id] ||= {};
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (sans, hi = -1) => sans.map((s, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + (i === hi ? `<b>${s}</b>` : s)).join(' ');

// ---------- sounds (Web Audio, low latency; files in /sounds/ are swappable) ----------
const SOUNDS = ['move', 'capture', 'castle', 'check', 'error', 'complete'];
const Sound = {
  ctx: null, buf: {}, log: [],
  init() {
    if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    SOUNDS.forEach(n => fetch(`sounds/${n}.wav`).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(a => this.buf[n] = a).catch(() => {}));
  },
  play(n) {
    this.log.push(n); if (!S().sound) return;
    try {
      this.init(); if (!this.ctx) return; if (this.ctx.state === 'suspended') this.ctx.resume();
      const b = this.buf[n] || (n === 'check' ? this.buf.move : null); if (!b) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = S().volume;
      src.buffer = b; src.connect(g).connect(this.ctx.destination); src.start();
    } catch (e) { console.warn('sound', e); }
  },
};
addEventListener('pointerdown', () => Sound.init(), { once: true, capture: true });
addEventListener('keydown', () => Sound.init(), { once: true });

// ---------- board helpers ----------
function dests(chess) {
  const d = new Map();
  for (const s of SQUARES) { const ms = chess.moves({ square: s, verbose: true }); if (ms.length) d.set(s, [...new Set(ms.map(m => m.to))]); }
  return d;
}
const cname = c => c === 'w' ? 'white' : 'black';
const turnColor = c => cname(c.turn());
function lastMoveOf(chess) { const h = chess.history({ verbose: true }); const l = h[h.length - 1]; return l ? [l.from, l.to] : undefined; }
function boardOpts() {
  return { animation: { enabled: S().anim > 0, duration: S().anim }, coordinates: S().coords,
    movable: { showDests: S().dests, free: false }, premovable: { enabled: S().premove, showDests: S().dests }, draggable: { showGhost: true } };
}
function tryMove(chess, from, to, promo = 'q') { try { return chess.move({ from, to, promotion: promo }); } catch { return null; } }

// ---------- router: #/  #/opening/<id>  #/line/<id>/<n>  #/train  #/build  #/settings ----------
function showTab(t) {
  if (t !== 'drill') drillCg.setAutoShapes([]); if (t !== 'line') lineCg.setAutoShapes([]);
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === t));
  const nav = { home: 'home', opening: 'home', line: 'home', drill: 'drill', build: 'settings', settings: 'settings', data: 'settings' }[t];
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
  if (t === 'drill') { renderDrillSelect(); drillCg.redrawAll(); requestAnimationFrame(() => cueNew());
    // opening the Train screen must never leave an idle board: start the selected opening if nothing is running
    if (!drill.line && !play && db.reps.length) setTimeout(() => { if (!drill.line && $('#drill').classList.contains('active')) startSession(drill.mode || 'due'); }, 0); }
  if (t === 'build') buildCg.redrawAll();
  if (t === 'line') lineCg.redrawAll();
  if (t === 'settings') renderSettings();
  scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}
const go = h => { if (location.hash !== h) history.pushState(null, '', h); route(); };
function route() {
  const [, p, a, b] = (location.hash || '#/').split('/');
  if (p === 'opening' && repById(a)) { showTab('opening'); renderOpening(repById(a)); }
  else if (p === 'line' && repById(a)) { showTab('line'); openLine(repById(a), Number(b) || 0); }
  else if (p === 'train') showTab('drill');
  else if (p === 'build') showTab('build');
  else if (p === 'settings') showTab('settings');
  else if (p === 'data') showTab('data');
  else if (p === 'sync' && a) { showTab('data'); $('#syncCode').value = decodeURIComponent(location.hash.slice(7)); history.replaceState(null, '', '#/data'); $('#codeStatus').textContent = 'Sync code received: press “Load sync code” to merge it into this device.'; }
  else { showTab('home'); renderHome(); }
}
addEventListener('popstate', route); addEventListener('hashchange', route);
const repById = id => db.reps.find(r => r.id === id || r.starter === id);

// ---------- home ----------
function repStats(rep, now = Date.now()) {
  const cs = cardsOf(rep); const keys = new Set();
  rep.lines.forEach(l => userCards(l.m, rep.color).forEach(c => keys.add(c.key)));
  let due = 0, fresh = 0, learned = 0, mistakes = 0;
  keys.forEach(k => { const c = cs[k]; if (!c) fresh++; else { if (c.due <= now) due++; if (c.interval >= 1) learned++; if (c.lapses) mistakes++; } });
  return { total: keys.size, due, fresh, learned, mistakes, chapters: new Set(rep.lines.map(l => l.ch)).size };
}
let STARTERS = [];
async function loadStarters() {
  try { STARTERS = await (await fetch('starters/index.json')).json(); } catch { STARTERS = []; }
  db.removed ||= [];
  for (const s of STARTERS) {
    let pg; try { pg = parsePgn(await (await fetch('starters/' + s.file)).text(), s.name); } catch { continue; }
    if (pg.errors.length) console.warn(s.id, pg.errors);
    let rep = db.reps.find(r => r.starter === s.id);
    if (!rep && !db.removed.includes(s.id)) { rep = { id: s.id, name: s.name, color: s.color, starter: s.id }; db.reps.push(rep); }
    if (rep) { rep.lines = pg.lines; rep.intros = pg.intros; rep.name = s.name; rep.color = s.color; }   // refresh annotations; progress is keyed by position so it survives
  }
  save();
}
const metaOf = rep => STARTERS.find(s => s.id === rep.starter) || {};
const chaptersOf = rep => [...new Set(rep.lines.map(l => l.ch))];
function ocard(rep, extra = '') { try { return ocard0(rep, extra); } catch (e) { console.warn('card', rep?.id, e); const el = document.createElement('div'); el.className = 'ocard'; el.innerHTML = `<h3>${esc(rep?.name || '?')}</h3><p class="muted">This repertoire's saved data looks damaged. <a href="#/data">Back up / repair</a></p>`; return el; } }
function ocard0(rep, extra = '') {
  const s = repStats(rep), m = metaOf(rep), el = document.createElement('div');
  el.className = 'ocard' + (m.featured ? ' featured' : ''); el.dataset.id = rep.id;
  el.innerHTML = `<div class="eco">${esc(m.eco || (rep.color === 'w' ? 'White' : 'Black'))}</div>
    <h3>${esc(rep.name)}${m.featured ? '<span class="badge">Featured</span>' : ''}</h3>
    <div class="muted">${esc(KB[rep.starter]?.tagline || m.blurb || '')}</div>
    <div class="chips">${chaptersOf(rep).slice(0, m.featured ? 99 : 4).map(c => `<a class="chip" href="#/opening/${rep.id}" data-ch="${esc(c)}" title="${esc(c)}">${esc(shortCh(rep, c))}</a>`).join('')}${!m.featured && chaptersOf(rep).length > 4 ? `<span class="chip more">+${chaptersOf(rep).length - 4}</span>` : ''}</div>${extra}
    <div class="bar"><i style="width:${s.total ? 100 * s.learned / s.total : 0}%"></i></div>
    <div class="muted">${rep.lines.length} lines · ${s.total} moves · ${s.learned} learned · ${s.due} due</div>`;
  el.onclick = e => { if (e.target.closest('a.chip.vs')) return; e.preventDefault(); const ch = e.target.closest('.chip')?.dataset.ch; go('#/opening/' + rep.id); if (ch) setTimeout(() => document.getElementById('ch-' + slug(ch))?.scrollIntoView({ behavior: 'smooth' }), 50); };
  return el;
}
const shortCh = (rep, c) => { const p = c.split(':')[0]; return c.includes(':') && rep.name.toLowerCase().includes(p.toLowerCase().split(/[ ']/)[0]) ? c.slice(p.length + 1).trim() : c; };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function renderHome() {
  const T = { total: 0, due: 0, fresh: 0, learned: 0 };
  db.reps.forEach(r => { const s = repStats(r); for (const k in T) T[k] += s[k]; });
  const st = db.stats || { reviews: 0, correct: 0 };
  { const goal = S().dailyGoal || 10, done = (db.history || {})[dayKey()] || 0, sk = goalStreak(db.history, goal);
  $('#stats').innerHTML = `<div class="goal" id="goalRing">${ringSvg(done, goal)}<div><div class="l">Today's goal</div><div class="gsub">${done >= goal ? 'Done for today ✓' : (goal - done) + ' reviews to go'}</div><div class="streak" id="streakN">🔥 <b>${sk}</b> day streak</div></div></div>` +
    [[T.due, 'due now'], [T.learned + '/' + T.total, 'moves learned'], [st.reviews ? Math.round(100 * st.correct / st.reviews) + '%' : '–', 'accuracy']]
    .map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join(''); }
  { const n = recentMistakes(db.reps).length, b = $('#homeFix'); b.hidden = !n; b.textContent = `🎯 Fix my mistakes (${n})`; }
  const W = $('#whiteList'), B = $('#blackList'), C = $('#customList'); W.innerHTML = B.innerHTML = C.innerHTML = '';
  const starters = db.reps.filter(r => r.starter).sort((a, b) => STARTERS.findIndex(s => s.id === a.starter) - STARTERS.findIndex(s => s.id === b.starter));
  const tied = (b, w) => (metaOf(b).vs || []).includes(w.starter) ? 0 : 1;
  const blackFor = w => starters.filter(b => b.color === 'b' && (metaOf(b).answers === metaOf(w).first || (metaOf(b).vs || []).includes(w.starter))).sort((a, b) => tied(a, w) - tied(b, w));
  const whiteFor = b => starters.filter(w => w.color === 'w' && (metaOf(b).answers === metaOf(w).first || (metaOf(b).vs || []).includes(w.starter))).sort((x, y) => tied(b, x) - tied(b, y));
  const vsChips = (label, list) => list.length ? `<div class="chips vsrow"><span class="vslabel">${label}</span>${list.slice(0, 4).map(r => `<a class="chip vs" href="#/opening/${r.id}">${esc(r.name)}</a>`).join('')}${list.length > 4 ? `<span class="chip more" title="${esc(list.slice(4).map(r => r.name).join(', '))}">+${list.length - 4}</span>` : ''}</div>` : '';
  starters.filter(r => r.color === 'w').forEach(r => W.append(ocard(r, vsChips('Defences', blackFor(r)))));
  starters.filter(r => r.color === 'b').forEach(r => B.append(ocard(r, vsChips(`vs 1.${metaOf(r).answers || '?'}`, whiteFor(r)))));
  SIDX = null; if ($('#search').value.trim()) runSearch();
  const custom = db.reps.filter(r => !r.starter); $('#customWrap').hidden = !custom.length; custom.forEach(r => C.append(ocard(r)));
  const removed = STARTERS.filter(s => (db.removed || []).includes(s.id));
  if (removed.length) { const d = document.createElement('div'); d.className = 'muted'; d.innerHTML = 'Removed starters: ' + removed.map(s => `<button data-restore="${s.id}">Restore ${esc(s.name)}</button>`).join(' ');
    d.querySelectorAll('button').forEach(b => b.onclick = async () => { db.removed = db.removed.filter(x => x !== b.dataset.restore); await loadStarters(); renderHome(); }); C.after(d); $('#customWrap').hidden = false; }
}

// ---------- home search: instant filter + keyboard-friendly results ----------
let SIDX = null, sSel = 0, sRes = [];
const sIndex = () => SIDX ||= buildSearchIndex(db.reps, STARTERS);
function runSearch() {
  const q = $('#search').value, box = $('#searchResults');
  sRes = q.trim() ? search(sIndex(), q, 10) : []; sSel = 0;
  const hit = new Set(sRes.map(r => r.id));
  document.querySelectorAll('#home .ocard').forEach(c => c.hidden = !!q.trim() && !hit.has(c.dataset.id));
  document.querySelectorAll('#home .ocards').forEach(l => { const h = l.previousElementSibling; if (h?.classList.contains('sect')) h.hidden = !!q.trim() && ![...l.children].some(c => !c.hidden); });
  $('#searchEmpty').hidden = !q.trim() || sRes.length > 0;
  box.hidden = !sRes.length;
  box.innerHTML = sRes.map((r, i) => `<a role="option" class="sres${i === sSel ? ' on' : ''}" data-i="${i}" href="#/opening/${r.id}">
    <span class="dot ${r.color}"></span><span class="st"><b>${esc(r.type === 'chapter' ? r.ch : r.name)}</b><small>${r.type === 'chapter' ? 'Chapter · ' + esc(r.name) : (r.color === 'w' ? 'White opening' : 'Black defence') + (r.eco ? ' · ' + esc(r.eco) : '')}</small></span><span class="kind">${r.type === 'chapter' ? 'Chapter' : 'Opening'}</span></a>`).join('');
  box.querySelectorAll('.sres').forEach(a => { a.onclick = e => { e.preventDefault(); pickResult(sRes[+a.dataset.i]); }; a.onmouseenter = () => markSel(+a.dataset.i); });
}
function markSel(i) { sSel = i; $('#searchResults').querySelectorAll('.sres').forEach((a, k) => a.classList.toggle('on', k === i)); $('#searchResults .sres.on')?.scrollIntoView({ block: 'nearest' }); }
function pickResult(r) {
  if (!r) return; $('#searchResults').hidden = true; openingTab = 'lines'; $('#search').value = ''; $('#search').blur(); runSearch();
  go('#/opening/' + r.id);
  if (r.type === 'chapter') setTimeout(() => { const el = document.getElementById('ch-' + slug(r.ch)); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } }, 60);
}
$('#search').addEventListener('input', runSearch);
$('#search').addEventListener('focus', () => { if ($('#search').value.trim()) runSearch(); });
$('#search').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); markSel(Math.min(sRes.length - 1, sSel + 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); markSel(Math.max(0, sSel - 1)); }
  else if (e.key === 'Enter') { e.preventDefault(); pickResult(sRes[sSel]); }
  else if (e.key === 'Escape') { $('#search').value = ''; runSearch(); $('#search').blur(); }
});
document.addEventListener('click', e => { if (!e.target.closest('.searchwrap')) $('#searchResults').hidden = true; });
addEventListener('keydown', e => { if (e.key === '/' && $('#home').classList.contains('active') && !e.target.matches('input,textarea,select')) { e.preventDefault(); $('#search').focus(); } });

// ---------- opening page ----------
let openingTab = 'lines';
function renderOpening(rep) {
  const m = metaOf(rep), kb = KB[rep.starter], s = repStats(rep), el = $('#opening');
  const byCh = {}; rep.lines.forEach((l, i) => (byCh[l.ch] ||= []).push(i));
  el.innerHTML = `<div class="crumbs"><a href="#/">Home</a> › ${esc(rep.name)}</div>
  <div class="ohero"><div class="eco">${esc(m.eco || '')} · ${rep.color === 'w' ? 'You play White' : 'You play Black'}</div><h1 class="grad">${esc(rep.name)}</h1>
    <p class="lead">${esc(kb?.tagline || m.blurb || '')}</p>
    <div class="row"><button class="primary" data-act="due">Train due (${s.due + Math.min(s.fresh, 999)} to go)</button><button data-act="random">Random lines</button><button data-act="fix">🎯 Fix mistakes (${recentMistakes([rep]).length})</button>
      <details class="omore"><summary aria-label="More actions">⋯</summary><div class="omenu"><button data-act="mistakes">Replay lines with mistakes</button><button data-act="edit">Edit lines</button><button data-act="pgn">Export PGN</button><button data-act="reset">Reset this opening's progress</button><button data-act="del" class="danger">Remove from library</button></div></details></div>
    <div class="muted">${Object.keys(byCh).length} chapters · ${rep.lines.length} lines · ${s.total} of your moves · ${s.learned} learned · ${s.mistakes} with mistakes</div></div>
  <div class="otabs"><button data-t="lines" class="${openingTab === 'lines' ? 'on' : ''}">Lines</button>${kb ? `<button data-t="kb" class="${openingTab === 'kb' ? 'on' : ''}">Knowledge base</button>` : ''}${trapsOf(rep).length ? `<button data-t="traps" class="${openingTab === 'traps' ? 'on' : ''}">Punish this (${trapsOf(rep).length})</button>` : ''}</div>
  <div id="oBody"></div>`;
  el.querySelectorAll('.otabs button').forEach(b => b.onclick = () => { openingTab = b.dataset.t; renderOpening(rep); });
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'fix') { go('#/train'); $('#drillRep').value = rep.id; startSpots(recentMistakes([rep]), 'Fix my mistakes'); }
    else if (['due', 'random', 'mistakes'].includes(a)) { go('#/train'); $('#drillRep').value = rep.id; setMode(a); }
    if (a === 'edit') editRep(rep);
    if (a === 'reset' && confirm(`Reset all progress for ${rep.name}? Its lines stay; every move becomes new again.`)) { delete db.cards[rep.id]; save(); toast('Progress reset for ' + rep.name); renderOpening(rep); }
    if (a === 'pgn') download(rep.name.replace(/\W+/g, '_') + '.pgn', toPgn(rep), 'application/x-chess-pgn');
    if (a === 'del' && confirm('Remove ' + rep.name + ' and its progress?')) { db.reps = db.reps.filter(q => q !== rep); delete db.cards[rep.id]; if (rep.starter) (db.removed ||= []).push(rep.starter); save(); go('#/'); }
  });
  const body = $('#oBody');
  if (openingTab === 'traps' && trapsOf(rep).length) {
    const tr = trapRep(rep);
    body.innerHTML = `<p class="muted">Common mistakes your opponents make in this opening, and how to punish them. Every line is checked with Stockfish.</p><div class="row"><button class="primary" data-trap="all">Practise all</button></div>` +
      tr.lines.map((l, i) => `<div class="chapter trap"><h3>${esc(trapsOf(rep)[i].name)}</h3><p class="mono">${fmt(l.m)}</p><p class="muted">${esc(l.n[trapsOf(rep)[i].b]?.t || '')}</p><div class="row"><button data-trap="${i}">Practise</button></div></div>`).join('');
    body.querySelectorAll('[data-trap]').forEach(b => b.onclick = () => startTraps(rep, b.dataset.trap === 'all' ? null : +b.dataset.trap));
  } else if (openingTab === 'kb' && kb) {
    const list = a => a?.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
    body.innerHTML = `<div class="kb"><div class="box wide"><h3>Overview</h3><p>${esc(kb.overview)}</p></div>
      <div class="box wide"><h3>History</h3><p>${esc(kb.history)}</p></div>
      <div class="box"><h3>Key ideas</h3>${list(kb.ideas)}</div><div class="box"><h3>Typical pawn structures</h3>${list(kb.structures)}</div>
      <div class="box"><h3>Plans for White</h3>${list(kb.plansWhite)}</div><div class="box"><h3>Plans for Black</h3>${list(kb.plansBlack)}</div>
      <div class="box"><h3>Traps &amp; tricks</h3>${list(kb.traps)}</div><div class="box"><h3>Model games</h3>${list(kb.games)}</div>
      <div class="box wide"><h3>Tips</h3>${list(kb.tips)}</div></div>`;
  } else {
    body.innerHTML = Object.entries(byCh).map(([ch, idx]) => `<div class="chapter" id="ch-${slug(ch)}"><h3>${esc(ch)}</h3>
      ${rep.intros?.[ch] ? `<p class="muted">${esc(rep.intros[ch])}</p>` : ''}
      <div class="row"><button data-chapter="${esc(ch)}">Drill this chapter</button></div>
      <div class="lines">${idx.map((i, k) => `<a class="lineitem" href="#/line/${rep.id}/${i}"><span class="num">${k + 1}</span><span class="mv">${fmt(rep.lines[i].m)}</span><span class="muted">${rep.lines[i].m.length} ply</span></a>`).join('')}</div></div>`).join('');
    body.querySelectorAll('[data-chapter]').forEach(b => b.onclick = () => { go('#/train'); $('#drillRep').value = rep.id; fillPickers(); $('#drillChapter').value = b.dataset.chapter; setMode('chapter'); });
  }
}

// ---------- line page (study view with annotations + arrows) ----------
const BRUSH = { G: 'green', R: 'red', Y: 'yellow', B: 'blue' };
const shapesOf = n => n ? [...(n.cal || []).map(([o, d, c]) => ({ orig: o, dest: d, brush: BRUSH[c] || 'green' })), ...(n.csl || []).map(([o, c]) => ({ orig: o, brush: BRUSH[c] || 'green' }))] : [];
const lineCg = Chessground($('#lineBoard'), { viewOnly: true, coordinates: true, animation: { enabled: true, duration: 200 }, drawable: { enabled: true, visible: true } });
const study = { rep: null, li: 0, ply: 0, chess: null, verbose: [] };
function noteHtml(rep, line, ply, mv, inCheck) {
  const n = line.n?.[ply]; const mine = (ply % 2 === 0 ? 'w' : 'b') === rep.color;
  const num = Math.floor(ply / 2) + 1 + (ply % 2 ? '...' : '.');
  const txt = n?.t ? `<p>${esc(n.t)}</p>` : `<p class="auto">${esc(describeMove(mv, inCheck))}</p>`;
  return `<div><span class="san">${num} ${esc(line.m[ply])}${esc(n?.g || '')}</span><span class="who ${mine ? 'you' : 'opp'}">${mine ? 'Your move' : 'Opponent'}</span></div>${txt}`;
}
function openLine(rep, li) {
  study.rep = rep; study.li = Math.min(li, rep.lines.length - 1); const line = rep.lines[study.li];
  const c = new Chess(); study.verbose = line.m.map(s => { const m = c.move(s); return { m, check: c.inCheck(), fen: c.fen() }; });
  const idx = rep.lines.map((l, i) => i).filter(i => rep.lines[i].ch === line.ch); const k = idx.indexOf(study.li) + 1;
  $('#lineCrumbs').innerHTML = `<a href="#/">Home</a> › <a href="#/opening/${rep.id}">${esc(rep.name)}</a> › ${esc(line.ch)} › Line ${k}`;
  $('#lnChapter').textContent = `${rep.name} · ${line.ch}`; $('#lnTitle').textContent = `Line ${k} of ${idx.length}`;
  lineCg.set({ orientation: cname(rep.color) });
  $('#lnMoves').innerHTML = line.m.map((s, i) => `${i % 2 ? '' : `<span class="n">${i / 2 + 1}.</span>`}<button data-p="${i + 1}" class="${(i % 2 === 0 ? 'w' : 'b') === rep.color ? 'you' : ''} ${line.n?.[i]?.t ? 'has' : ''}">${esc(s)}${esc(line.n?.[i]?.g || '')}</button>`).join('');
  $('#lnMoves').querySelectorAll('button').forEach(b => b.onclick = () => studyGo(Number(b.dataset.p)));
  studyGo(0, true);
}
function studyGo(p, silent) {
  const line = study.rep.lines[study.li]; p = Math.max(0, Math.min(line.m.length, p)); const fwd = p === study.ply + 1; study.ply = p;
  const v = study.verbose[p - 1];
  lineCg.set({ fen: v ? v.fen : 'start', lastMove: v ? [v.m.from, v.m.to] : undefined, check: v?.check || false, turnColor: p % 2 ? 'black' : 'white' });
  lineCg.setAutoShapes(v ? shapesOf(line.n?.[p - 1]) : []);
  $('#lnNote').innerHTML = v ? noteHtml(study.rep, line, p - 1, v.m, v.check)
    : `<div><span class="san">Start</span><span class="who opp">${esc(line.ch)}</span></div><p>${esc(study.rep.intros?.[line.ch] || 'Step through the line with ▶ or the → key. Every move comes with its idea.')}</p>`;
  $('#lnMoves').querySelectorAll('button').forEach(b => b.classList.toggle('cur', Number(b.dataset.p) === p));
  $('#lnMoves').querySelector('button.cur')?.scrollIntoView({ block: 'nearest' });
  if (!silent && v && fwd) Sound.play(soundFor(v.m, v.check));
  if (!silent) { if (v) Narrator.say(v.m.san, line.n?.[p - 1]?.t || ''); else Narrator.cancel(); }
}
$('#lnFirst').onclick = () => studyGo(0); $('#lnPrev').onclick = () => studyGo(study.ply - 1); $('#lnNext').onclick = () => studyGo(study.ply + 1); $('#lnLast').onclick = () => studyGo(99);
$('#lnDrill').onclick = () => { const r = study.rep, li = study.li; go('#/train'); $('#drillRep').value = r.id; fillPickers(); $('#drillLine').value = li; setMode('line'); };
const lineStep = d => { const r = study.rep, n = (study.li + d + r.lines.length) % r.lines.length; go(`#/line/${r.id}/${n}`); };
$('#lnPrevLine').onclick = () => lineStep(-1); $('#lnNextLine').onclick = () => lineStep(1);
addEventListener('keydown', e => {
  if (!$('#line').classList.contains('active') || e.target.matches('input,textarea,select')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); studyGo(study.ply + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); studyGo(study.ply - 1); }
  if (e.key === 'Home') studyGo(0); if (e.key === 'End') studyGo(99);
});

function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}

// ---------- settings ----------
const SET = { sSound: 'sound', sVolume: 'volume', sAnim: 'anim', sDelay: 'delay', sPremove: 'premove', sDests: 'dests', sCoords: 'coords', sAutoNext: 'autoNext', sAutoReply: 'autoReply', sFlip: 'flip', sNew: 'newLimit', sNotes: 'notes', sGoal: 'dailyGoal', sNarr: 'narrator', sRate: 'voiceRate', sPitch: 'voicePitch', sNarrOpp: 'narrOpp', sConfirm: 'confirm' };
function renderSettings() {
  $('#sTheme').value = S().theme || 'brown';
  for (const [id, k] of Object.entries(SET)) { const el = $('#' + id); if (el.type === 'checkbox') el.checked = S()[k]; else el.value = S()[k]; }
}
for (const [id, k] of Object.entries(SET)) $('#' + id).onchange = e => {
  const el = e.target; S()[k] = el.type === 'checkbox' ? el.checked : Number(el.value); save(); applyBoardSettings();
};
$('#sTheme').onchange = e => { S().theme = e.target.value; save(); applyTheme(); };
function applyTheme() { document.body.className = document.body.className.replace(/\bbt-\S+/g, '').trim() + (S().theme && S().theme !== 'brown' ? ' bt-' + S().theme : ''); }
function applyBoardSettings() { drillCg.set(boardOpts()); buildCg.set({ ...boardOpts(), premovable: { enabled: false } }); setOrientation(); drillCg.redrawAll(); buildCg.redrawAll(); }
$('#testSounds').onclick = () => { Sound.init(); ['move', 'capture', 'castle', 'check', 'error', 'complete'].forEach((n, i) => setTimeout(() => Sound.play(n), 60 + i * 450)); };
$('#exportBtn').onclick = () => download('skoha-backup-' + new Date().toISOString().slice(0, 10) + '.json',
  JSON.stringify({ app: 'Skoha', version: 2, exported: new Date().toISOString(), ...db }, null, 1), 'application/json');
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = repair(migrate(JSON.parse(await f.text()))); if (!Array.isArray(d.reps)) throw new Error('not a Skoha backup');
    d.reps.forEach(r => r.lines.forEach(l => l.m = validateLine(l.m)));
    if (!confirm('Replace current data with this backup?')) return;
    db = { reps: d.reps, cards: d.cards || {}, stats: d.stats, streak: d.streak, history: d.history || {}, profile: d.profile, guided: true, removed: d.removed, settings: { ...DEF, ...d.settings } }; save(); renderHome(); alert('Backup restored.');
  } catch (err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => { if (confirm('Erase all repertoires and progress?')) { db = { reps: [], cards: {}, settings: S() }; save(); renderHome(); } };

// ---------- drill ----------
const drill = { chess: new Chess(), rep: null, queue: [], qi: 0, li: -1, line: null, ply: 0, missed: false, learning: false, busy: false, mode: 'due', timer: 0, alts: null, done: 0, perfect: 0 };
const drillCg = Chessground($('#drillBoard'), { ...boardOpts(), movable: { ...boardOpts().movable, events: { after: (o, d) => askMove(o, d) } } });
window.__freereps = { drill, db: () => db, sounds: Sound.log, cg: drillCg };   // hooks for automated tests
const userColor = () => drill.rep?.color || 'w';
function setOrientation() { const c = userColor(); drillCg.set({ orientation: cname(S().flip ? (c === 'w' ? 'b' : 'w') : c) }); }
$('#drillFlip').onclick = () => drillCg.toggleOrientation();

function renderDrillSelect() {
  const sel = $('#drillRep'); const cur = sel.value;
  sel.innerHTML = db.reps.map(r => { const s = repStats(r); return `<option value="${r.id}">${esc(r.name)} (${s.due} due, ${s.fresh} new)</option>`; }).join('') || '<option value="">No repertoires yet</option>';
  if (cur && db.reps.some(r => r.id === cur)) sel.value = cur;
  fillPickers();
}
function fillPickers() {
  const r = db.reps.find(r => r.id === $('#drillRep').value); if (!r) return;
  const chs = [...new Set(r.lines.map(l => l.ch))];
  $('#drillChapter').innerHTML = chs.map(c => `<option>${esc(c)}</option>`).join('');
  $('#drillLine').innerHTML = r.lines.map((l, i) => `<option value="${i}">${esc(l.ch)}: ${fmt(l.m.slice(0, 14)).replace(/<\/?b>/g, '')}${l.m.length > 14 ? '…' : ''}</option>`).join('');
}
$('#drillRep').onchange = () => { fillPickers(); startSession(drill.mode || 'due'); };
$('#modeBox').addEventListener('toggle', () => requestAnimationFrame(() => drillCg.redrawAll()));
function setMode(m) {
  document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('primary', x.dataset.mode === m));
  { const lb = document.querySelector('#modes [data-mode=' + m + ']'); if (lb) $('#modeLabel').textContent = lb.textContent; $('#modeBox').open = m === 'chapter' || m === 'line'; }
  $('#drillChapter').hidden = m !== 'chapter'; $('#drillLine').hidden = m !== 'line';
  startSession(m);
}
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#drillStudy').onclick = () => { if (drill.rep && drill.li >= 0) go(`#/line/${drill.rep.id}/${drill.li}`); };
// coach "cutout": explains the move just played (or the new move to play), with arrows on the board
function coach(ply, upcoming = false) {
  const l = drill.rep.lines[drill.li]; const n = l.n?.[ply]; const el = $('#drillNote');
  if (!S().notes && !upcoming) { el.className = 'bnote empty'; return; }
  const c = new Chess(); l.m.slice(0, ply).forEach(x => c.move(x)); const mv = c.move(l.m[ply]);
  const mine = (ply % 2 === 0 ? 'w' : 'b') === userColor();
  const num = Math.floor(ply / 2) + 1 + (ply % 2 ? '...' : '.');
  const text = n?.t || describeMove(mv, c.inCheck());
  const label = upcoming ? (drill.learning ? 'New move: why we play it' : 'Guided: your move') : mine ? 'Your move' : 'Opponent\'s reply';
  // bubble goes over the top edge (opponent's back ranks) unless the move or its arrows live there
  const whiteView = drillCg.state.orientation === 'white', row = q => whiteView ? 8 - +q[1] : +q[1] - 1;
  const nx = !upcoming && !mine && l.m[ply + 1] ? new Chess(c.fen()).move(l.m[ply + 1]) : null;
  const sqs = [mv.to, ...(nx ? [nx.from, nx.to] : []), ...(n?.cal || []).flatMap(([o, d]) => [o, d]), ...(n?.csl || []).map(([q]) => q)];
  const topHits = sqs.filter(q => row(q) <= 1).length, botHits = sqs.filter(q => row(q) >= 6).length;
  const topHalf = topHits > 0 && topHits >= botHits;
  el.className = `bnote ${topHalf ? 'at-bottom' : 'at-top'} ${upcoming ? 'up' : mine ? 'you' : 'opp'}`;
  let body = `<p class="${n?.t ? '' : 'auto'}">${esc(text)}</p>`;
  if (upcoming) {
    const prev = ply > 0 ? l.n?.[ply - 1] : null, pc = new Chess(); l.m.slice(0, Math.max(0, ply - 1)).forEach(x => pc.move(x));
    const pm = ply > 0 ? pc.move(l.m[ply - 1]) : null;
    body = `<p class="play" id="playLead"><b>${esc(playLead(mv))}</b></p>` + (S().notes ? `<p class="${n?.t ? '' : 'auto'}">${esc(text)}</p>` : '') +
      (S().notes && pm && (prev?.t) ? `<p class="prevnote">After ${Math.floor((ply - 1) / 2) + 1}${(ply - 1) % 2 ? '...' : '.'}${esc(l.m[ply - 1])}: ${esc(prev.t)}</p>` : '');
  }
  el.innerHTML = `<div class="coach-card"><div class="coach-head"><span class="coach-san">${num} ${esc(l.m[ply])}${esc(n?.g || '')}</span><span class="who ${mine ? 'you' : 'opp'}">${label}</span></div>${body}</div>`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if ($('#drill').classList.contains('active') && (mine || upcoming || S().narrOpp)) Narrator.say(upcoming ? null : l.m[ply], upcoming ? `New move: ${playLead(mv)}. ${S().notes ? text : ''}` : (S().notes ? text : ''));
  if ($('#drill').classList.contains('active')) {
    const sh = shapesOf(n);
    if (upcoming) sh.push(...cueShapes(mv));
    if (upcoming || drill.view != null || !(guided() && drill.chess.turn() === userColor())) drillCg.setAutoShapes(sh);
  }
}
const guided = () => drill.learning || S().help !== 'none';
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function playLead(m) {
  if (m.flags.includes('k') || m.flags.includes('q')) return `Play ${m.san}: castle ${m.flags.includes('k') ? 'kingside' : 'queenside'} (king from ${m.from} to ${m.to})`;
  return `Play ${m.san}: move the ${PIECE[m.piece]} from ${m.from} to ${m.to}${m.captured ? ', capturing the ' + PIECE[m.captured] : ''}`;
}
const cueShapes = m => [{ orig: m.from, dest: m.to, brush: 'blue', modifiers: { lineWidth: 14 } }, { orig: m.from, brush: 'blue' }, { orig: m.to, brush: 'blue' }];
// show the move to play for a new (unlearned) move: bold blue arrow, ringed from/to squares, pulsing target, "Play X" bubble
function cueNew() {
  const p = $('#drillPulse'); if (p) p.hidden = true;
  if (!drill.line || drill.view != null || !guided() || drill.waiting || drill.ply >= drill.line.length || drill.chess.turn() !== userColor()) return;
  if (!$('#drill').classList.contains('active')) return;
  const m = new Chess(drill.chess.fen()).move(drill.line[drill.ply]); if (!m) return;
  coach(drill.ply, true); drillCg.setAutoShapes([...cueShapes(m)]);
  drillCg.set({ highlight: { lastMove: true, check: true } });
  const bd = $('#drillBoard').getBoundingClientRect(), st = $('#drillBoard').parentElement.getBoundingClientRect(), w = bd.width / 8;
  const f = m.to.charCodeAt(0) - 97, r = +m.to[1] - 1, white = drillCg.state.orientation === 'white';
  const x = (white ? f : 7 - f) * w, y = (white ? 7 - r : r) * w;
  let el = p; if (!el) { el = document.createElement('div'); el.id = 'drillPulse'; el.className = 'pulse'; $('#drillBoard').parentElement.append(el); }
  Object.assign(el.style, { left: bd.left - st.left + x + 'px', top: bd.top - st.top + y + 'px', width: w + 'px', height: w + 'px' }); el.hidden = false; el.dataset.sq = m.to;
}
window.__freereps.cueNew = () => cueNew();
function helpUi() { const b = $('#helpToggle'), on = S().help !== 'none'; b.textContent = on ? '🧭 Help: Guided' : '🎯 No help (test yourself)'; b.setAttribute('aria-pressed', String(!on)); b.classList.toggle('nohelp', !on);
  b.title = on ? 'Blue guides show every move. Click to test yourself from memory.' : 'Moves you have learned are hidden. Click to show guides again.'; }
$('#helpToggle').onclick = () => { S().help = S().help === 'none' ? 'guided' : 'none'; save(); helpUi();
  if (drill.line && drill.view == null && !play && drill.chess.turn() === userColor() && drill.ply < drill.line.length) {
    if (guided()) { cueNew(); } else { drillCg.setAutoShapes([]); if ($('#drillPulse')) $('#drillPulse').hidden = true; if (drill.ply) coach(drill.ply - 1); else { $('#drillNote').className = 'bnote empty'; $('#drillNote').innerHTML = ''; } msg('No help: play the move from memory.'); } } };
helpUi();
// ---------- PWA: offline + install ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { r.update().catch(() => {}); setInterval(() => r.update().catch(() => {}), 30 * 60e3); }).catch(() => {});
}
// ---------- play it out against a light engine ----------
let play = null, engine = null;
function playUi() { const c = play.chess; drillCg.set({ fen: c.fen(), turnColor: turnColor(c), check: c.inCheck(), lastMove: lastMoveOf(c), movable: { color: c.turn() === play.me && !c.isGameOver() ? cname(play.me) : undefined, dests: dests(c) } }); renderMovesPlay(); }
function renderMovesPlay() { $('#drillMoves').innerHTML = fmt(play.chess.history()); }
function playOver() { const c = play.chess; if (!c.isGameOver()) return false;
  msg(c.isCheckmate() ? (c.turn() === play.me ? 'Checkmate. The engine wins this one.' : 'Checkmate! You win. 🎉') : 'Draw.', c.isCheckmate() && c.turn() !== play.me ? 'ok' : ''); Sound.play('complete'); return true; }
async function engineMove() {
  if (!play || playOver()) return; const g = play.gen; $('#playInfo').textContent = 'Engine is thinking…';
  let uci; try { uci = await engine.best(play.chess.fen(), play.level); } catch { uci = null; }
  if (!play || g !== play.gen) return;
  let m = uci && uci !== '(none)' ? tryMove(play.chess, uci.slice(0, 2), uci.slice(2, 4), uci[4] || 'q') : null;
  if (!m) { const ms = play.chess.moves({ verbose: true }); if (!ms.length) return playOver(); m = play.chess.move(ms[Math.floor(Math.random() * ms.length)]); }
  Sound.play(soundFor(m, play.chess.inCheck())); playUi(); $('#playInfo').textContent = `Engine played ${m.san}. Your move.`; playOver();
}
function playMove(from, to) {
  const m = tryMove(play.chess, from, to); if (!m) return playUi();
  Sound.play(soundFor(m, play.chess.inCheck())); playUi(); if (!playOver()) setTimeout(engineMove, 150);
}
function startPlay() {
  engine ||= new Engine(); clearTimeout(drill.timer); Narrator.cancel();
  play = { chess: new Chess(drill.chess.fen()), me: userColor(), level: $('#playLevel').value, gen: 1, back: drill.chess.fen() };
  $('#playBar').hidden = true; $('#playOn').hidden = false; $('#drillNext').hidden = true; $('#drillNote').className = 'bnote empty'; $('#drillNote').innerHTML = '';
  drillCg.setAutoShapes([]); if ($('#drillPulse')) $('#drillPulse').hidden = true; $('#drill').classList.add('playing');
  msg(`Playing it out against Stockfish (${$('#playLevel').selectedOptions[0].text}). You are ${play.me === 'w' ? 'White' : 'Black'}.`); $('#playInfo').textContent = '';
  playUi(); if (play.chess.turn() !== play.me) engineMove();
}
function endPlay(silent) {
  if (!play) return; play.gen = 0; play = null; engine?.stop(); $('#playOn').hidden = true; $('#drill').classList.remove('playing');
  if (silent) return;
  drillCg.set({ fen: drill.chess.fen(), lastMove: lastMoveOf(drill.chess), check: drill.chess.inCheck(), turnColor: turnColor(drill.chess), movable: { color: undefined } });
  renderMoves(); $('#drillNext').hidden = false; $('#playBar').hidden = false; coach(drill.ply - 1); msg('Back to training. Press Next line → when ready.', 'ok'); navUi();
}
$('#playOut').onclick = startPlay; $('#backTrain').onclick = () => endPlay();
window.__freereps.play = () => play;
// ---------- sync across devices ----------
async function applyRemote(remote) { db = repair(mergeData(db, repair(remote))); db.settings = { ...DEF, ...db.settings }; save(); await loadStarters(); save(); renderHome(); applyTheme(); renderSettings(); }
const copy = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
$('#codeMake').onclick = async () => { const c = await encodeSync(syncPayload(db)); $('#syncCode').value = c; $('#codeStatus').textContent = (await copy(c) ? 'Copied. ' : 'Select and copy the code above. ') + `${(c.length / 1024).toFixed(1)} KB. Paste it on your other device under Settings › Your data.`; };
$('#linkMake').onclick = async () => { const l = location.origin + location.pathname + '#/sync/' + await encodeSync(syncPayload(db)); $('#syncCode').value = l; $('#codeStatus').textContent = (await copy(l) ? 'Link copied. ' : 'Copy the link above. ') + 'Open it on the other device to bring your progress over.'; };
$('#codeLoad').onclick = async () => { try { const r = await decodeSync($('#syncCode').value); if (r.app !== 'Skoha') throw new Error('not a Skoha sync code'); await applyRemote(r); $('#codeStatus').textContent = '✓ Merged. Progress from both devices is kept.'; } catch (e) { $('#codeStatus').textContent = 'Could not load: ' + e.message; } };
// optional cloud sync (Cloudflare Pages Function + KV binding "SYNC"); hidden when not configured
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('skoha:' + t.trim().toUpperCase())))].map(x => x.toString(16).padStart(2, '0')).join('');
const newKey = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(20)); return [...r].map(x => A[x % A.length]).join('').match(/.{5}/g).join('-'); };
async function cloudSync() {
  const k = $('#syncKey').value.trim(); if (k.length < 16) { $('#syncStatus').textContent = 'Enter or create a sync key first.'; return; }
  db.syncKey = k; save(); $('#syncStatus').textContent = 'Syncing…';
  try { const id = await sha(k), u = 'api/sync?id=' + id; const g = await fetch(u, { cache: 'no-store' });
    if (g.ok) await applyRemote(await decodeSync(await g.text())); else if (g.status !== 404) throw new Error('server ' + g.status);
    const p = await fetch(u, { method: 'PUT', body: await encodeSync(syncPayload(db)) }); if (!p.ok) throw new Error('upload ' + p.status);
    db.lastSync = Date.now(); save(); $('#syncStatus').textContent = '✓ Synced ' + new Date().toLocaleTimeString(); } catch (e) { $('#syncStatus').textContent = 'Sync failed: ' + e.message; }
}
$('#syncNew').onclick = () => { $('#syncKey').value = newKey(); $('#syncStatus').textContent = 'Write this key down: it is the only way to reach your synced data.'; };
$('#syncNow').onclick = cloudSync;
fetch('api/sync', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j?.enabled) { $('#cloudBox').hidden = false; $('#syncKey').value = db.syncKey || ''; if (db.syncKey) cloudSync(); } }).catch(() => {}); window.__freereps.narrator = Narrator;
Narrator.init(S);
function fillVoices() { const sel = $('#sVoice'); if (!sel) return; const vs = Narrator.voices(), best = Narrator.voice();
  sel.innerHTML = `<option value="">Automatic${best ? ' (' + esc(best.name) + ')' : ''}</option>` + vs.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join(''); sel.value = S().voice || ''; }
if (Narrator.supported()) { fillVoices(); speechSynthesis.addEventListener?.('voiceschanged', fillVoices); } else { $('#narrBox') && ($('#narrBox').hidden = false, $('#narrBox').querySelector('.muted').textContent = 'This browser has no speech support.'); }
$('#sVoice').onchange = e => { S().voice = e.target.value; save(); Narrator.say('Nf3', 'This is how the narrator sounds.', 0); };
$('#testVoice').onclick = () => { const o = S().narrator; S().narrator = true; Narrator.say('Nf3', 'Develops the knight and controls the centre.', 0); S().narrator = o; };
function speakUi() { const b = $('#drillSpeak'); b.textContent = S().narrator ? '🔊' : '🔇'; b.setAttribute('aria-pressed', S().narrator); b.title = S().narrator ? 'Narrator on (click to mute)' : 'Narrator off (click to turn on)'; }
$('#drillSpeak').onclick = () => { S().narrator = !S().narrator; save(); speakUi(); renderSettings(); if (!S().narrator) Narrator.cancel(); }; speakUi();
$('#sNarr').addEventListener('change', () => { speakUi(); if (!S().narrator) Narrator.cancel(); });
// keep the explanation box exactly as tall as the board beside it
{ const fit = () => [['#drillBoard', '#drill .tnote'], ['#lineBoard', '#line .tnote']].forEach(([b, n]) => { const bd = $(b), nt = $(n); if (bd && nt) nt.style.setProperty('--bh', innerWidth > 900 ? bd.getBoundingClientRect().height + 'px' : 'auto'); });
  const ro = new ResizeObserver(fit); ro.observe($('#drillBoard')); ro.observe($('#lineBoard')); addEventListener('resize', fit); } addEventListener('resize', () => cueNew());
const drillNote = ply => { if (drill.view == null) coach(ply); navUi(); };
// ---- explanation history: browse every move played so far (read-only board while browsing) ----
function navUi() {
  const n = drill.line ? drill.ply : 0, v = drill.view ?? n;
  $('#navPos').textContent = n ? `Move ${v} of ${n}${drill.view == null ? '' : ' · browsing'}` : 'No moves yet';
  const done = drill.line && drill.ply >= drill.line.length;
  $('#navBack').disabled = v <= 0;
  $('#navFwd').disabled = !(drill.view != null || drill.waiting || (done && !$('#drillNext').hidden));
  $('#navFwd').classList.toggle('primary', !!drill.waiting || (done && drill.view == null));
  $('#navFwd').textContent = drill.view == null && done ? 'Next line ▶' : 'Next ▶';
  $('#drill').classList.toggle('browsing', drill.view != null);
}
function navGo(v) {
  Narrator.cancel(); if (play) return;
  if (v > 0 && drill.view == null) {                 // live "Next": opponent's reply, or the next line
    if (drill.waiting) { drill.waiting = false; drillCg.set({ movable: { color: S().premove ? cname(userColor()) : undefined, dests: new Map() } }); drill.busy = true; drill.timer = setTimeout(playReply, 60); navUi(); return; }
    if (drill.line && drill.ply >= drill.line.length && !$('#drillNext').hidden) return nextLine();
    return;
  }
  if (!drill.line || !drill.ply) return;
  const nv = navStep(drill.view, drill.ply, v);
  if (nv === drill.view) return;
  if (nv != null && drill.view == null) {          // leaving live: pause the opponent's reply
    clearTimeout(drill.timer); drill.paused = drill.busy; drill.busy = false; drillCg.cancelPremove();
  }
  drill.view = nv; if (nv != null && $('#drillPulse')) $('#drillPulse').hidden = true;
  if (nv == null) {                                  // back to live
    resync(); coach(drill.ply - 1); cueNew(); if (drill.waiting) drillCg.set({ movable: { color: undefined } }); navUi();
    if (drill.ply >= drill.line.length) drillCg.set({ movable: { color: undefined } });
    else if (drill.paused) { drill.paused = false; advance(); }
    else if (guided() && drill.chess.turn() === userColor()) coach(drill.ply, true);
    return;
  }
  const c = new Chess(); drill.line.slice(0, nv).forEach(x => c.move(x)); const h = c.history({ verbose: true }).at(-1);
  if (!h) { drillCg.set({ fen: c.fen(), lastMove: undefined, check: false, turnColor: 'white', movable: { color: undefined, dests: new Map() } }); drillCg.setAutoShapes([]);
    const ch = drill.rep.lines[drill.li].ch; $('#drillNote').className = 'bnote at-bottom opp pop';
    $('#drillNote').innerHTML = `<div class="coach-card"><div class="coach-head"><span class="coach-san">Start</span><span class="who opp">${esc(ch)}</span></div><p>${esc(drill.rep.intros?.[ch] || 'Starting position of this line.')}</p></div>`; navUi(); return; }
  drillCg.set({ fen: c.fen(), lastMove: [h.from, h.to], check: c.inCheck(), turnColor: turnColor(c), movable: { color: undefined, dests: new Map() } });
  coach(nv - 1); navUi();
}
$('#navBack').onclick = () => navGo(-1); $('#navFwd').onclick = () => navGo(1);
addEventListener('keydown', e => {
  if (!$('#drill').classList.contains('active') || e.target.matches('input,textarea,select')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); navGo(-1); } if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); navGo(1); }
});
function drillStats() {
  if (!drill.rep) { $('#drillStats').innerHTML = ''; return; }
  const s = repStats(drill.rep);
  $('#drillStats').innerHTML = `<span class="tchip"><b>${s.due}</b> due</span><span class="tchip"><b>${s.fresh}</b> new</span><span class="tchip"><b>${s.learned}</b>/${s.total} learned</span>${drill.queue.length ? `<span class="tchip hi">line <b>${Math.min(drill.qi, drill.queue.length)}</b>/${drill.queue.length}</span>` : ''}`;
  $('#drillProg').style.width = drill.line ? (100 * drill.ply / drill.line.length) + '%' : '0';
}
$('#drillChapter').onchange = () => startSession('chapter');
$('#drillLine').onchange = () => startSession('line');

const msg = (t, cls = '') => { $('#drillMsg').innerHTML = t; $('#drillMsg').className = 'msg ' + cls; };
function firstIllegal(m) { if (!m.length) return 0; const c = new Chess(); for (let i = 0; i < m.length; i++) { try { c.move(m[i]); } catch { return i; } } return null; }
// self-check: when it's the user's live turn the board must accept their pieces; log why if not and repair
function boardCheck(where) {
  if (!drill.line || play || drill.view != null || drill.waiting || drill.busy || drill.ply >= drill.line.length || drill.chess.turn() !== userColor() || !$('#drill').classList.contains('active')) return true;
  const st = drillCg.state, why = [];
  if (st.movable.color !== cname(userColor())) why.push(`movable.color=${st.movable.color} expected ${cname(userColor())}`);
  if (!st.movable.dests || !st.movable.dests.size) why.push('no legal destinations');
  if (st.turnColor !== cname(userColor())) why.push(`turnColor=${st.turnColor}`);
  if (drillCg.getFen() !== drill.chess.fen().split(' ')[0]) why.push('board pieces differ from game');
  if (!why.length) return true;
  console.warn('[skoha] board not movable at', where, '→', why.join('; '), { rep: drill.rep?.id, li: drill.li, ply: drill.ply });
  resync(); drillCg.state.dom.bounds.clear?.(); return false;
}
window.__freereps.boardCheck = boardCheck;
// keep chessground's cached board position in sync with layout changes (explanation box, menus, scrolling)
{ const fix = () => { drillCg.state.dom.bounds.clear?.(); lineCg.state.dom.bounds.clear?.(); };
  new ResizeObserver(fix).observe(document.querySelector('#drill .tsplit')); addEventListener('scroll', fix, { passive: true, capture: true });
  $('#drillBoard').addEventListener('pointerdown', () => drillCg.state.dom.bounds.clear?.(), { capture: true }); }
function startSession(mode) {
  endPlay(true); $('#playBar').hidden = true;
  clearTimeout(drill.timer);
  drill.rep = db.reps.find(r => r.id === $('#drillRep').value) || db.reps[0];
  if (!drill.rep) return msg('Add a repertoire first (Repertoires tab).', 'bad');
  drill.mode = mode; drill.alts = repMoves(drill.rep); drill.done = drill.perfect = 0;
  drill.queue = buildQueue(drill.rep, cardsOf(drill.rep), mode, { chapter: $('#drillChapter').value, line: Number($('#drillLine').value), newLimit: S().newLimit });
  drill.qi = 0; drill.notice = '';
  if (!drill.queue.length && mode === 'due') {   // never leave the board dead: nothing due -> new lines, else random practice
    const fresh = buildQueue(drill.rep, cardsOf(drill.rep), 'due', { newLimit: 999 });
    drill.queue = fresh.length ? fresh : buildQueue(drill.rep, cardsOf(drill.rep), 'random', {});
    drill.notice = fresh.length ? 'Nothing due right now, so here are new lines.' : 'Nothing due right now, so here is free practice with random lines.';
  }
  if (!drill.queue.length) { $('#drillInfo').textContent = '';
    drillCg.set({ fen: 'start', lastMove: undefined, movable: { color: undefined } });
    return msg(mode === 'mistakes' ? 'No mistakes recorded yet. 🎉' : mode === 'due' ? 'Nothing due — come back later, or try Random lines.' : 'No lines here.', 'ok');
  }
  nextLine();
}
// "Punish this": engine-verified trap lines per opening, drilled like normal lines (own progress bucket)
const trapsOf = rep => TRAPS.filter(t => t.rep === rep.starter);
const TRAPREP = {};
function trapRep(rep) {
  return TRAPREP[rep.id] ||= { id: rep.id + '~traps', name: rep.name + ' · Punish this', color: rep.color, intros: {}, trap: true,
    lines: trapsOf(rep).map(t => { const m = t.m.split(' '); return { m, ch: 'Punish this: ' + t.name, n: m.map((_, i) => t.n[i] || i === t.b ? { t: t.n[i] || '', cal: [], csl: [], g: i === t.b ? '?' : '' } : null) }; }) };
}
function startTraps(rep, i) {
  const r = trapRep(rep); go('#/train'); endPlay(true); $('#playBar').hidden = true; clearTimeout(drill.timer);
  drill.rep = r; drill.mode = 'traps'; drill.alts = repMoves(r); drill.done = drill.perfect = 0; drill.qi = 0;
  drill.queue = i == null ? r.lines.map((_, k) => k) : [i]; drill.notice = 'Punish this: your opponent is about to go wrong.';
  $('#modeLabel').textContent = 'Punish this'; document.querySelectorAll('#modes button').forEach(x => x.classList.remove('primary')); nextLine();
}
window.__freereps.startTraps = (id, i) => startTraps(repById(id), i);
// drill single positions (recent mistakes, or spots from imported games) across one or many openings
function startSpots(spots, label) {
  endPlay(true); $('#playBar').hidden = true; clearTimeout(drill.timer);
  drill.mode = 'spots'; drill.done = drill.perfect = 0; drill.queue = spots.filter(e => repById(e.rep)); drill.qi = 0; drill.notice = label + ':';
  $('#modeLabel').textContent = label; document.querySelectorAll('#modes button').forEach(x => x.classList.remove('primary'));
  if (!drill.queue.length) { drill.line = null; $('#drillInfo').textContent = ''; drillCg.set({ fen: 'start', lastMove: undefined, movable: { color: undefined } }); navUi(); return msg('No recent mistakes to fix. 🎉 Train a few lines and come back.', 'ok'); }
  drill.rep = repById(drill.queue[0].rep); drill.alts = repMoves(drill.rep); $('#drillRep').value = drill.rep.id; nextLine();
}
const recentMistakes = reps => mistakeSpots(reps, cardsOf);
window.__freereps.startSpots = startSpots; window.__freereps.mistakeSpots = () => recentMistakes(db.reps);
$('#homeFix').onclick = () => { go('#/train'); startSpots(recentMistakes(db.reps), 'Fix my mistakes'); };
$('#drillNext').onclick = () => nextLine();
function nextLine() {
  endPlay(true); clearTimeout(drill.timer); $('#drillNext').hidden = true; $('#playBar').hidden = true;
  if (drill.qi >= drill.queue.length) {
    drillCg.set({ movable: { color: undefined } });
    msg(`Session complete: ${drill.done} lines, ${drill.perfect} perfect. ${drill.mode === 'random' ? '' : 'Pick another mode to keep going.'}`, 'ok');
    Sound.play('complete'); renderDrillSelect(); return;
  }
  drill.view = null; drill.paused = false; drill.waiting = false; $('#drillNote').className = 'bnote empty';
  let spot = null; { const e = drill.queue[drill.qi++];
    if (e && typeof e === 'object') {           // a single position to fix (mistake drill / game import)
      const r = repById(e.rep); if (!r || !r.lines[e.li]) return nextLine();
      if (r !== drill.rep) { drill.rep = r; drill.alts = repMoves(r); $('#drillRep').value = r.id; }
      drill.li = e.li; spot = e.ply; } else drill.li = e; }
  drill.line = drill.rep.lines[drill.li]?.m || []; if (spot != null) drill.line = drill.line.slice(0, spot + 1); drill.ply = 0; drill.chess = new Chess(); drill.lineMiss = 0;
  drill.busy = false; drill.missed = false; clearTimeout(drill.wrongT); $('#confirmBar').hidden = true;
  { const bad = firstIllegal(drill.line); if (bad != null) { console.warn('[skoha] skipping line', drill.li, 'illegal move at ply', bad, drill.line[bad]); toast(`Skipped a damaged line (${drill.line.slice(0, bad + 1).join(' ')}).`); return nextLine(); } }
  Narrator.cancel(); drillCg.cancelPremove(); drillCg.setAutoShapes([]); $('#drillNote').innerHTML = ''; if ($('#drillPulse')) $('#drillPulse').hidden = true;
  drillCg.set({ fen: drill.chess.fen(), lastMove: undefined, check: false, turnColor: 'white' }); setOrientation();
  if (spot) { for (let i = 0; i < spot; i++) drill.chess.move(drill.line[i]); drill.ply = spot; drillCg.set({ fen: drill.chess.fen(), lastMove: lastMoveOf(drill.chess), check: drill.chess.inCheck() }); coach(spot - 1); }
  $('#drillInfo').textContent = spot != null ? `${drill.rep.name} · ${drill.rep.lines[drill.li].ch} · spot ${drill.qi}/${drill.queue.length}` : `${drill.rep.lines[drill.li].ch} · line ${drill.qi}/${drill.queue.length}`; drillStats();
  msg(`${drill.notice ? drill.notice + ' ' : ''}Your move as ${userColor() === 'w' ? 'White' : 'Black'}.${S().flip ? ' (The board is turned around: Settings › Board.)' : ''}`); drill.notice = ''; navUi();
  advance();
}
function renderMoves() { $('#drillMoves').innerHTML = fmt(drill.chess.history()); drillStats(); }

function advance() {
  renderMoves();
  if (drill.ply >= drill.line.length) return lineDone();
  const myTurn = drill.chess.turn() === userColor();
  if (myTurn) {
    drillCg.set({ turnColor: turnColor(drill.chess), check: drill.chess.inCheck(), movable: { color: cname(userColor()), dests: dests(drill.chess) } });
    const card = cardsOf(drill.rep)[cardKey()];
    drill.missed = false; drill.learning = !card;
    if (drill.learning) { msg(`New move: play <b>${drill.line[drill.ply]}</b> (follow the blue arrow).`); cueNew(); navUi(); }
    else if (S().help !== 'none') { msg(`Your move: play <b>${drill.line[drill.ply]}</b> (guided). Switch to <b>No help</b> to test yourself.`); cueNew(); navUi(); }
    else { drillCg.setAutoShapes([]); cueNew(); }
    drillCg.playPremove(); setTimeout(() => boardCheck('advance'), 0);
  } else {
    // step-by-step flow: after the user's move, wait for Next ▶ before the reply (unless auto-play is on)
    if (!S().autoReply && drill.ply > 0) {
      drill.waiting = true; drill.busy = false;
      drillCg.set({ turnColor: turnColor(drill.chess), movable: { color: undefined, dests: new Map() } });
      msg(`${$('#drillMsg').textContent.startsWith('✔') ? $('#drillMsg').innerHTML + ' · ' : ''}Read the idea, then <b>Next ▶</b> (Space) for the reply.`, 'ok'); navUi(); return;
    }
    // opponent to move: user may premove meanwhile
    drillCg.set({ turnColor: turnColor(drill.chess), movable: { color: S().premove ? cname(userColor()) : undefined, dests: new Map() } });
    drill.busy = true;
    drill.timer = setTimeout(playReply, drill.ply === 0 ? 300 : S().delay);
  }
}
function playReply() {
  const m = drill.chess.move(drill.line[drill.ply++]); drill.busy = false; drill.waiting = false;
  drillCg.move(m.from, m.to);
  if (m.flags.includes('e') || m.flags.includes('p')) drillCg.set({ fen: drill.chess.fen() });
  drillCg.set({ lastMove: [m.from, m.to] });
  Sound.play(soundFor(m, drill.chess.inCheck())); drillNote(drill.ply - 1);
  advance();
}
const cardKey = () => userCards(drill.line, userColor()).find(c => c.ply === drill.ply).key;
function showArrow(san, brush = 'green') { if (!$('#drill').classList.contains('active')) return; const m = new Chess(drill.chess.fen()).move(san); drillCg.setAutoShapes([{ orig: m.from, dest: m.to, brush }]); }
$('#drillHint').onclick = () => {
  if (!drill.line || drill.ply >= drill.line.length || drill.chess.turn() !== userColor()) return;
  if (!drill.missed && !drill.learning) { drill.missed = true; record(false); }
  showArrow(drill.line[drill.ply]); msg(`Hint: <b>${drill.line[drill.ply]}</b>`, 'bad');
};
function record(ok) {
  const cs = cardsOf(drill.rep), k = cardKey(), card = cs[k];
  if (!ok) cs[k] = schedule(card, 2);
  else if (drill.learning) cs[k] = schedule(card, 4);
  else if (!drill.missed && S().help !== 'none' && isDue(card)) cs[k] = guidedPass(card);
  else if (!drill.missed && isDue(card)) cs[k] = schedule(card, 5);
  db.stats ||= { reviews: 0, correct: 0 }; if (!drill.learning) { db.stats.reviews++; if (ok) db.stats.correct++; }
  { const was = (db.history || {})[dayKey()] || 0; db.history = addReview(db.history); if (was + 1 === (S().dailyGoal || 10)) setTimeout(() => toast('🎯 Daily goal reached! Streak: ' + goalStreak(db.history, S().dailyGoal) + ' day(s)'), 50); }
  const today = new Date().toDateString(); db.streak ||= { n: 0, day: null };
  if (db.streak.day !== today) { db.streak.n = db.streak.day === new Date(Date.now() - 864e5).toDateString() ? db.streak.n + 1 : 1; db.streak.day = today; }
  save();
}
function resync() {
  drillCg.set({ fen: drill.chess.fen(), lastMove: lastMoveOf(drill.chess), turnColor: turnColor(drill.chess), check: drill.chess.inCheck(),
    movable: { color: cname(userColor()), dests: dests(drill.chess) } });
}
function onUserMove(from, to) {
  if (play) return playMove(from, to);
  if (drill.view != null) return;
  if (!drill.line || drill.busy || drill.chess.turn() !== userColor()) return resync();
  const expected = drill.line[drill.ply];
  const promo = (expected.match(/=([QRBN])/) || [, 'q'])[1].toLowerCase();
  const m = tryMove(drill.chess, from, to, promo);
  if (!m) return resync();
  if (m.san === expected) {
    if (!drill.missed) record(true);
    drill.ply++; drillCg.setAutoShapes([]); cueNew();
    if (m.flags.includes('e') || m.flags.includes('p') || m.flags.includes('k') || m.flags.includes('q')) drillCg.set({ fen: drill.chess.fen() });
    Sound.play(soundFor(m, drill.chess.inCheck()));
    msg(drill.learning ? `✔ ${m.san}: learned.` : `✔ ${m.san}`, 'ok');
    drillNote(drill.ply - 1); advance(); return;
  }
  drill.chess.undo();
  const pos = fenKey(drill.chess.fen());
  if (drill.alts.get(pos)?.has(m.san)) {
    msg(`${m.san} is also in your repertoire, but this line continues with <b>${expected}</b>.`, '');
    showArrow(expected, 'yellow');
  } else {
    if (!drill.missed && !drill.learning) record(false);
    drill.missed = true; drill.lineMiss++;
    Sound.play('error');
    msg(`✘ ${m.san} isn't in your repertoire. The move is <b>${expected}</b> — play it.`, 'bad');
    wrongCard(m, expected);
  }
  setTimeout(resync, 120);
}
// wrong move: say clearly what the right move is and why, with a red arrow for the try and a green one for the answer
function wrongCard(m, expected) {
  const l = drill.rep.lines[drill.li], ok = new Chess(drill.chess.fen()).move(expected), why = l.n?.[drill.ply]?.t || describeMove(ok, false);
  const el = $('#drillNote'); el.className = 'bnote wrong';
  el.innerHTML = `<div class="coach-card"><div class="coach-head"><span class="coach-san">${esc(m.san)} ✘</span><span class="who bad">Not this move</span></div><p class="play" id="wrongLead"><b>The move is ${esc(expected)}: ${esc(playLead(ok).replace(/^Play \S+: /, ''))}.</b></p><p>${esc(why)}</p><p class="prevnote">Try it now: follow the green arrow.</p></div>`;
  if ($('#drill').classList.contains('active')) drillCg.setAutoShapes([{ orig: m.from, dest: m.to, brush: 'red' }, { orig: ok.from, dest: ok.to, brush: 'green', modifiers: { lineWidth: 14 } }, { orig: ok.to, brush: 'green' }]);
  Narrator.say(null, `Not quite. The move is ${expected}. ${why}`);
  if ($('#drillPulse')) $('#drillPulse').hidden = true;
  const at = drill.ply, li = drill.li; clearTimeout(drill.wrongT);
  drill.wrongT = setTimeout(() => { if (drill.ply === at && drill.li === li && drill.view == null && !play) cueNew(); }, 2600);
}
// optional tap-to-move confirm on touch screens
const coarse = () => matchMedia('(pointer: coarse)').matches;
function askMove(o, d) {
  if (!S().confirm || !coarse()) return onUserMove(o, d);
  const bar = $('#confirmBar'); bar.hidden = false; $('#confirmTxt').textContent = `Move ${o} → ${d}?`;
  $('#confirmYes').onclick = () => { bar.hidden = true; onUserMove(o, d); };
  $('#confirmNo').onclick = () => { bar.hidden = true; if (play) playUi(); else resync(); };
}
window.__freereps.wrong = () => $('#drillNote').textContent;
function lineDone() {
  drill.done++; if (!drill.lineMiss) drill.perfect++; renderDrillSelect();
  drillCg.cancelPremove(); drillCg.set({ movable: { color: undefined } });
  Sound.play('complete');
  msg(drill.lineMiss ? `Line complete (${drill.lineMiss} mistake${drill.lineMiss > 1 ? 's' : ''}).` : 'Line complete — perfect! 🎯', 'ok');
  $('#drillNext').hidden = false; $('#playBar').hidden = false;
  if (S().autoNext && S().autoReply) drill.timer = setTimeout(nextLine, 900);
  navUi();
}
addEventListener('keydown', e => { if (e.target.matches('input,textarea,select')) return; if (e.key === 'h') $('#drillHint').click(); if (e.key === 'n') { if (!$('#drillNext').hidden) nextLine(); } if (e.key === 'f') drillCg.toggleOrientation(); });

// ---------- build ----------
const build = { chess: new Chess(), lines: [], editing: null };
const buildCg = Chessground($('#buildBoard'), { ...boardOpts(), premovable: { enabled: false },
  movable: { free: false, color: 'white', dests: dests(build.chess), showDests: true, events: { after: (o, d) => { const m = tryMove(build.chess, o, d); if (m) Sound.play(soundFor(m, build.chess.inCheck())); buildSync(); } } } });
const buildColor = () => document.querySelector('input[name=color]:checked').value;
function buildSync() {
  buildCg.set({ fen: build.chess.fen(), turnColor: turnColor(build.chess), check: build.chess.inCheck(), lastMove: lastMoveOf(build.chess),
    movable: { color: turnColor(build.chess), dests: dests(build.chess) }, orientation: cname(buildColor()) });
  $('#buildMoves').innerHTML = fmt(build.chess.history()) || 'Start position';
  const box = $('#buildLines'); box.innerHTML = build.lines.length ? `<span class="muted">${build.lines.length} lines</span>` : '<span class="muted">No lines yet.</span>';
  build.lines.slice(0, 300).forEach((l, i) => {
    const d = document.createElement('div'); d.innerHTML = `<span class="lineitem">${esc(l.ch)}: ${fmt(l.m)}</span><button>✕</button>`;
    d.querySelector('button').onclick = () => { build.lines.splice(i, 1); buildSync(); };
    d.querySelector('span').onclick = () => { build.chess = new Chess(); l.m.forEach(s => build.chess.move(s)); buildSync(); };
    box.append(d);
  });
}
document.querySelectorAll('input[name=color]').forEach(r => r.onchange = buildSync);
$('#buildUndo').onclick = () => { build.chess.undo(); buildSync(); };
$('#buildReset').onclick = () => { build.chess = new Chess(); buildSync(); };
const bmsg = (t, cls = '') => { $('#buildMsg').textContent = t; $('#buildMsg').className = 'msg ' + cls; };
$('#buildSave').onclick = () => {
  const h = build.chess.history(); if (!h.length) return bmsg('Play some moves first.', 'bad');
  build.lines = dedupe([...build.lines, { m: h, ch: $('#buildChapter').value.trim() || 'Main' }]); build.chess = new Chess(); bmsg('Line saved.', 'ok'); buildSync();
};
function addPgn(text) {
  const { lines, errors, intros } = parsePgn(text, $('#buildChapter').value.trim() || 'Imported'); build.intros = { ...(build.intros || {}), ...intros };
  build.lines = dedupe([...build.lines, ...lines]);
  bmsg(`Added ${lines.length} line(s).` + (errors.length ? ` Skipped ${errors.length}: ` + errors.slice(0, 5).join('; ') : ''), errors.length ? 'bad' : 'ok'); buildSync();
}
$('#pgnAdd').onclick = () => addPgn($('#pgn').value);
$('#pgnFile').onchange = async e => { const f = e.target.files[0]; if (f) addPgn(await f.text()); e.target.value = ''; };
$('#buildCommit').onclick = () => {
  if (!build.lines.length) return bmsg('Add at least one line.', 'bad');
  const name = $('#buildName').value.trim() || 'My repertoire';
  if (build.editing) Object.assign(build.editing, { name, color: buildColor(), lines: build.lines, intros: { ...(build.editing.intros || {}), ...(build.intros || {}) } });
  else db.reps.push({ id: uid(), name, color: buildColor(), lines: build.lines, intros: {} });
  save(); const saved = build.editing || db.reps[db.reps.length - 1]; build.lines = []; build.editing = null; bmsg('Repertoire saved!', 'ok'); go('#/opening/' + saved.id);
};
function editRep(r) {
  build.editing = r; build.lines = r.lines.map(l => ({ ...l, m: [...l.m] })); build.chess = new Chess();
  $('#buildName').value = r.name; document.querySelector(`input[name=color][value=${r.color}]`).checked = true;
  go('#/build'); buildSync(); bmsg('Editing "' + r.name + '". Add/remove lines, then Save repertoire.');
}
buildSync(); renderSettings(); applyTheme();
loadStarters().then(() => { route(); if (!db.guided) { if (Object.values(db.cards || {}).some(c => c && Object.keys(c).length)) { db.guided = true; save(); } else openGuide(); } });
// ---------- first-visit guide ----------
const G = { side: 'both', level: 'beginner', tour: 0, pick: null };
const TOUR = [
  ['♟', 'The board', 'Play your repertoire moves by dragging or tapping. New moves are shown with a blue arrow first.'],
  ['💬', 'The bubble', 'Every move, yours and your opponent\'s, comes with a short explanation and arrows right on the board.'],
  ['▶', 'Next & Back', 'After your move, press Next ▶ (or Space) to see the reply. ◀ Back steps through earlier moves and explanations.'],
];
function gStep(n) { document.querySelectorAll('#guide .gstep').forEach(s => s.hidden = +s.dataset.step !== n); }
function openGuide() { $('#guide').hidden = false; gStep(0); }
function closeGuide(goTo) { $('#guide').hidden = true; db.guided = true; db.profile = { side: G.side, level: G.level }; save(); const r = goTo && repById(goTo); if (r) { go('#/train'); $('#drillRep').value = r.id; setMode('due'); } }
window.__freereps.openGuide = openGuide;
$('#replayGuide').onclick = () => { go('#/'); openGuide(); };
document.querySelectorAll('#guide .gopts').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
  g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); G[g.dataset.k] = b.dataset.v; }));
$('#gSkip').onclick = () => closeGuide();
$('#gNext0').onclick = () => {
  const ids = suggestOpenings(G.side, G.level); G.pick = ids[0];
  $('#gSugg').innerHTML = ids.map((id, i) => { const m = STARTERS.find(s => s.id === id) || {}; return `<button class="gpick${i ? '' : ' on'}" data-id="${id}"><span class="dot ${m.color}"></span><span><b>${esc(m.name || id)}</b><small>${esc(KB[id]?.tagline || m.blurb || '')}</small></span></button>`; }).join('');
  $('#gSugg').querySelectorAll('.gpick').forEach(b => b.onclick = () => { G.pick = b.dataset.id; $('#gSugg').querySelectorAll('.gpick').forEach(x => x.classList.toggle('on', x === b)); });
  gStep(1);
};
$('#gBack1').onclick = () => gStep(0);
function tourShow() { const [i, t, d] = TOUR[G.tour]; $('#gTour').innerHTML = `<div class="gicon">${i}</div><h2>${t}</h2><p>${d}</p>`; $('#gTourPos').textContent = `${G.tour + 1} / ${TOUR.length}`; $('#gTourNext').textContent = G.tour === TOUR.length - 1 ? 'Start training' : 'Next'; }
$('#gNext1').onclick = () => { G.tour = 0; tourShow(); gStep(2); };
$('#gTourNext').onclick = () => { if (G.tour < TOUR.length - 1) { G.tour++; tourShow(); } else closeGuide(G.pick); };
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#guide').hidden) closeGuide(); });
window.__freereps.study = study; window.__freereps.lineCg = lineCg;
