import { Chess, SQUARES } from './vendor/chess.js';
import { Chessground } from './vendor/chessground.min.js';
import { validateLine, parsePgn, dedupe, userCards, schedule, isDue, buildQueue, soundFor, toPgn, repMoves, fenKey, describeMove, buildSearchIndex, search, navStep } from './core.js';
import { KB } from './kb.js';

const KEY = 'freereps.v2';  // same key as v2 so progress carries over
const $ = s => document.querySelector(s);
const DEF = { sound: true, volume: 0.7, anim: 200, delay: 400, premove: true, dests: true, coords: true, autoNext: true, flip: false, newLimit: 10, theme: 'brown', notes: true, autoReply: false };
let db = load();
function load() {
  try {
    let d = JSON.parse(localStorage.getItem(KEY));
    if (!d) { const v1 = JSON.parse(localStorage.getItem('freereps.v1')); if (v1) d = migrate(v1); }
    d ||= { reps: [], cards: {} }; d.settings = { ...DEF, ...d.settings }; return d;
  } catch { return { reps: [], cards: {}, settings: { ...DEF } }; }
}
function migrate(d) { d.reps.forEach(r => r.lines = dedupe(r.lines.map(l => Array.isArray(l) ? { m: l, ch: 'Main' } : l))); return d; }
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
  const nav = { home: 'home', opening: 'home', line: 'home', drill: 'drill', build: 'build', settings: 'settings' }[t];
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
  if (t === 'drill') { renderDrillSelect(); drillCg.redrawAll(); }
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
    if (rep) { rep.lines = pg.lines; rep.intros = pg.intros; }   // refresh annotations; progress is keyed by position so it survives
  }
  save();
}
const metaOf = rep => STARTERS.find(s => s.id === rep.starter) || {};
const chaptersOf = rep => [...new Set(rep.lines.map(l => l.ch))];
function ocard(rep, extra = '') {
  const s = repStats(rep), m = metaOf(rep), el = document.createElement('div');
  el.className = 'ocard' + (m.featured ? ' featured' : ''); el.dataset.id = rep.id;
  el.innerHTML = `<div class="eco">${esc(m.eco || (rep.color === 'w' ? 'White' : 'Black'))}</div>
    <h3>${esc(rep.name)}${m.featured ? '<span class="badge">Featured</span>' : ''}</h3>
    <div class="muted">${esc(KB[rep.starter]?.tagline || m.blurb || '')}</div>
    <div class="chips">${chaptersOf(rep).map(c => `<a class="chip" href="#/opening/${rep.id}" data-ch="${esc(c)}">${esc(c)}</a>`).join('')}</div>${extra}
    <div class="bar"><i style="width:${s.total ? 100 * s.learned / s.total : 0}%"></i></div>
    <div class="muted">${rep.lines.length} lines · ${s.total} moves · ${s.learned} learned · ${s.due} due</div>`;
  el.onclick = e => { if (e.target.closest('a.chip.vs')) return; e.preventDefault(); const ch = e.target.closest('.chip')?.dataset.ch; go('#/opening/' + rep.id); if (ch) setTimeout(() => document.getElementById('ch-' + slug(ch))?.scrollIntoView({ behavior: 'smooth' }), 50); };
  return el;
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function renderHome() {
  const T = { total: 0, due: 0, fresh: 0, learned: 0 };
  db.reps.forEach(r => { const s = repStats(r); for (const k in T) T[k] += s[k]; });
  const st = db.stats || { reviews: 0, correct: 0 };
  $('#stats').innerHTML = [[T.due, 'due now'], [T.learned + '/' + T.total, 'moves learned'],
    [st.reviews ? Math.round(100 * st.correct / st.reviews) + '%' : '–', 'accuracy'], [db.streak?.n || 0, 'day streak']]
    .map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  const W = $('#whiteList'), B = $('#blackList'), C = $('#customList'); W.innerHTML = B.innerHTML = C.innerHTML = '';
  const starters = db.reps.filter(r => r.starter).sort((a, b) => STARTERS.findIndex(s => s.id === a.starter) - STARTERS.findIndex(s => s.id === b.starter));
  const blackFor = w => starters.filter(b => b.color === 'b' && (metaOf(b).answers === metaOf(w).first || (metaOf(b).vs || []).includes(w.starter)));
  const whiteFor = b => starters.filter(w => w.color === 'w' && (metaOf(b).answers === metaOf(w).first || (metaOf(b).vs || []).includes(w.starter)));
  const vsChips = (label, list) => list.length ? `<div class="chips"><span class="muted">${label}</span>${list.map(r => `<a class="chip vs" href="#/opening/${r.id}">${esc(r.name)}</a>`).join('')}</div>` : '';
  starters.filter(r => r.color === 'w').forEach(r => W.append(ocard(r, vsChips('Black answers in your library:', blackFor(r)))));
  starters.filter(r => r.color === 'b').forEach(r => B.append(ocard(r, vsChips(`Answers 1.${metaOf(r).answers || '?'}${whiteFor(r).length ? ' · meets' : ''}`, whiteFor(r)))));
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
    <div class="row"><button class="primary" data-act="due">Train due (${s.due + Math.min(s.fresh, 999)} to go)</button><button data-act="random">Random lines</button><button data-act="mistakes">Mistakes</button>
      <button data-act="edit">Edit</button><button data-act="pgn">Export PGN</button><button data-act="del" class="danger">Remove</button></div>
    <div class="muted">${Object.keys(byCh).length} chapters · ${rep.lines.length} lines · ${s.total} of your moves · ${s.learned} learned · ${s.mistakes} with mistakes</div></div>
  <div class="otabs"><button data-t="lines" class="${openingTab === 'lines' ? 'on' : ''}">Lines</button>${kb ? `<button data-t="kb" class="${openingTab === 'kb' ? 'on' : ''}">Knowledge base</button>` : ''}</div>
  <div id="oBody"></div>`;
  el.querySelectorAll('.otabs button').forEach(b => b.onclick = () => { openingTab = b.dataset.t; renderOpening(rep); });
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (['due', 'random', 'mistakes'].includes(a)) { go('#/train'); $('#drillRep').value = rep.id; setMode(a); }
    if (a === 'edit') editRep(rep);
    if (a === 'pgn') download(rep.name.replace(/\W+/g, '_') + '.pgn', toPgn(rep), 'application/x-chess-pgn');
    if (a === 'del' && confirm('Remove ' + rep.name + ' and its progress?')) { db.reps = db.reps.filter(q => q !== rep); delete db.cards[rep.id]; if (rep.starter) (db.removed ||= []).push(rep.starter); save(); go('#/'); }
  });
  const body = $('#oBody');
  if (openingTab === 'kb' && kb) {
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
const SET = { sSound: 'sound', sVolume: 'volume', sAnim: 'anim', sDelay: 'delay', sPremove: 'premove', sDests: 'dests', sCoords: 'coords', sAutoNext: 'autoNext', sAutoReply: 'autoReply', sFlip: 'flip', sNew: 'newLimit', sNotes: 'notes' };
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
    const d = migrate(JSON.parse(await f.text())); if (!Array.isArray(d.reps)) throw new Error('not a Skoha backup');
    d.reps.forEach(r => r.lines.forEach(l => l.m = validateLine(l.m)));
    if (!confirm('Replace current data with this backup?')) return;
    db = { reps: d.reps, cards: d.cards || {}, stats: d.stats, streak: d.streak, settings: { ...DEF, ...d.settings } }; save(); renderHome(); alert('Backup restored.');
  } catch (err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => { if (confirm('Erase all repertoires and progress?')) { db = { reps: [], cards: {}, settings: S() }; save(); renderHome(); } };

// ---------- drill ----------
const drill = { chess: new Chess(), rep: null, queue: [], qi: 0, li: -1, line: null, ply: 0, missed: false, learning: false, busy: false, mode: 'due', timer: 0, alts: null, done: 0, perfect: 0 };
const drillCg = Chessground($('#drillBoard'), { ...boardOpts(), movable: { ...boardOpts().movable, events: { after: (o, d) => onUserMove(o, d) } } });
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
function setMode(m) {
  document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('primary', x.dataset.mode === m));
  $('#drillChapter').hidden = m !== 'chapter'; $('#drillLine').hidden = m !== 'line';
  startSession(m);
}
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#drillStudy').onclick = () => { if (drill.rep && drill.li >= 0) go(`#/line/${drill.rep.id}/${drill.li}`); };
// coach "cutout": explains the move just played (or the new move to play), with arrows on the board
function coach(ply, upcoming = false) {
  const l = drill.rep.lines[drill.li]; const n = l.n?.[ply]; const el = $('#drillNote');
  if (!S().notes) { el.className = 'bnote empty'; return; }
  const c = new Chess(); l.m.slice(0, ply).forEach(x => c.move(x)); const mv = c.move(l.m[ply]);
  const mine = (ply % 2 === 0 ? 'w' : 'b') === userColor();
  const num = Math.floor(ply / 2) + 1 + (ply % 2 ? '...' : '.');
  const text = n?.t || describeMove(mv, c.inCheck());
  const label = upcoming ? 'New move: why we play it' : mine ? 'Your move' : 'Opponent\'s reply';
  // bubble goes over the top edge (opponent's back ranks) unless the move or its arrows live there
  const whiteView = drillCg.state.orientation === 'white', row = q => whiteView ? 8 - +q[1] : +q[1] - 1;
  const nx = !upcoming && !mine && l.m[ply + 1] ? new Chess(c.fen()).move(l.m[ply + 1]) : null;
  const sqs = [mv.to, ...(nx ? [nx.from, nx.to] : []), ...(n?.cal || []).flatMap(([o, d]) => [o, d]), ...(n?.csl || []).map(([q]) => q)];
  const topHits = sqs.filter(q => row(q) <= 1).length, botHits = sqs.filter(q => row(q) >= 6).length;
  const topHalf = topHits > 0 && topHits >= botHits;
  el.className = `bnote ${topHalf ? 'at-bottom' : 'at-top'} ${upcoming ? 'up' : mine ? 'you' : 'opp'}`;
  el.innerHTML = `<div class="coach-card"><div class="coach-head"><span class="coach-san">${num} ${esc(l.m[ply])}${esc(n?.g || '')}</span><span class="who ${mine ? 'you' : 'opp'}">${label}</span></div><p class="${n?.t ? '' : 'auto'}">${esc(text)}</p></div>`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if ($('#drill').classList.contains('active')) {
    const sh = shapesOf(n);
    if (upcoming) sh.push({ orig: mv.from, dest: mv.to, brush: 'blue' });
    if (upcoming || drill.view != null || !(drill.learning && drill.chess.turn() === userColor())) drillCg.setAutoShapes(sh);
  }
}
const drillNote = ply => { if (drill.view == null) coach(ply); navUi(); };
// ---- explanation history: browse every move played so far (read-only board while browsing) ----
function navUi() {
  const n = drill.line ? drill.ply : 0, v = drill.view ?? n;
  $('#navPos').textContent = n ? `Move ${v} of ${n}${drill.view == null ? '' : ' · browsing'}` : 'No moves yet';
  const done = drill.line && drill.ply >= drill.line.length;
  $('#navBack').disabled = v <= 1;
  $('#navFwd').disabled = !(drill.view != null || drill.waiting || (done && !$('#drillNext').hidden));
  $('#navFwd').classList.toggle('primary', !!drill.waiting || (done && drill.view == null));
  $('#navFwd').textContent = drill.view == null && done ? 'Next line ▶' : 'Next ▶';
  $('#drill').classList.toggle('browsing', drill.view != null);
}
function navGo(v) {
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
  drill.view = nv;
  if (nv == null) {                                  // back to live
    resync(); coach(drill.ply - 1); if (drill.waiting) drillCg.set({ movable: { color: undefined } }); navUi();
    if (drill.ply >= drill.line.length) drillCg.set({ movable: { color: undefined } });
    else if (drill.paused) { drill.paused = false; advance(); }
    else if (drill.learning && drill.chess.turn() === userColor()) coach(drill.ply, true);
    return;
  }
  const c = new Chess(); drill.line.slice(0, nv).forEach(x => c.move(x)); const h = c.history({ verbose: true }).at(-1);
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
function startSession(mode) {
  clearTimeout(drill.timer);
  drill.rep = db.reps.find(r => r.id === $('#drillRep').value) || db.reps[0];
  if (!drill.rep) return msg('Add a repertoire first (Repertoires tab).', 'bad');
  drill.mode = mode; drill.alts = repMoves(drill.rep); drill.done = drill.perfect = 0;
  drill.queue = buildQueue(drill.rep, cardsOf(drill.rep), mode, { chapter: $('#drillChapter').value, line: Number($('#drillLine').value), newLimit: S().newLimit });
  drill.qi = 0;
  if (!drill.queue.length) { $('#drillInfo').textContent = '';
    drillCg.set({ fen: 'start', lastMove: undefined, movable: { color: undefined } });
    return msg(mode === 'mistakes' ? 'No mistakes recorded yet. 🎉' : mode === 'due' ? 'Nothing due — come back later, or try Random lines.' : 'No lines here.', 'ok');
  }
  nextLine();
}
$('#drillNext').onclick = () => nextLine();
function nextLine() {
  clearTimeout(drill.timer); $('#drillNext').hidden = true;
  if (drill.qi >= drill.queue.length) {
    drillCg.set({ movable: { color: undefined } });
    msg(`Session complete: ${drill.done} lines, ${drill.perfect} perfect. ${drill.mode === 'random' ? '' : 'Pick another mode to keep going.'}`, 'ok');
    Sound.play('complete'); renderDrillSelect(); return;
  }
  drill.view = null; drill.paused = false; drill.waiting = false; $('#drillNote').className = 'bnote empty';
  drill.li = drill.queue[drill.qi++]; drill.line = drill.rep.lines[drill.li].m; drill.ply = 0; drill.chess = new Chess(); drill.lineMiss = 0;
  drillCg.cancelPremove(); drillCg.setAutoShapes([]); $('#drillNote').innerHTML = '';
  drillCg.set({ fen: drill.chess.fen(), lastMove: undefined, check: false, turnColor: 'white' }); setOrientation();
  $('#drillInfo').textContent = `${drill.rep.lines[drill.li].ch} · line ${drill.qi}/${drill.queue.length}`; drillStats();
  msg(`Your move as ${userColor() === 'w' ? 'White' : 'Black'}.`);
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
    if (drill.learning) { msg(`New move: play <b>${drill.line[drill.ply]}</b> (blue arrow).`);
      if (drill.ply === 0 || !S().notes) { showArrow(drill.line[drill.ply], 'blue'); coach(drill.ply, true); }
      else if ($('#drill').classList.contains('active')) { const m = new Chess(drill.chess.fen()).move(drill.line[drill.ply]); drillCg.setAutoShapes([...shapesOf(drill.rep.lines[drill.li].n?.[drill.ply - 1]), { orig: m.from, dest: m.to, brush: 'blue' }]); }
      navUi(); } else drillCg.setAutoShapes([]);
    drillCg.playPremove();
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
  else if (!drill.missed && isDue(card)) cs[k] = schedule(card, 5);
  db.stats ||= { reviews: 0, correct: 0 }; if (!drill.learning) { db.stats.reviews++; if (ok) db.stats.correct++; }
  const today = new Date().toDateString(); db.streak ||= { n: 0, day: null };
  if (db.streak.day !== today) { db.streak.n = db.streak.day === new Date(Date.now() - 864e5).toDateString() ? db.streak.n + 1 : 1; db.streak.day = today; }
  save();
}
function resync() {
  drillCg.set({ fen: drill.chess.fen(), lastMove: lastMoveOf(drill.chess), turnColor: turnColor(drill.chess), check: drill.chess.inCheck(),
    movable: { color: cname(userColor()), dests: dests(drill.chess) } });
}
function onUserMove(from, to) {
  if (drill.view != null) return;
  if (!drill.line || drill.busy || drill.chess.turn() !== userColor()) return resync();
  const expected = drill.line[drill.ply];
  const promo = (expected.match(/=([QRBN])/) || [, 'q'])[1].toLowerCase();
  const m = tryMove(drill.chess, from, to, promo);
  if (!m) return resync();
  if (m.san === expected) {
    if (!drill.missed) record(true);
    drill.ply++; drillCg.setAutoShapes([]);
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
    showArrow(expected);
  }
  setTimeout(resync, 120);
}
function lineDone() {
  drill.done++; if (!drill.lineMiss) drill.perfect++; renderDrillSelect();
  drillCg.cancelPremove(); drillCg.set({ movable: { color: undefined } });
  Sound.play('complete');
  msg(drill.lineMiss ? `Line complete (${drill.lineMiss} mistake${drill.lineMiss > 1 ? 's' : ''}).` : 'Line complete — perfect! 🎯', 'ok');
  $('#drillNext').hidden = false;
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
loadStarters().then(route);
window.__freereps.study = study; window.__freereps.lineCg = lineCg;
