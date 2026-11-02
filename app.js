import { Chess, SQUARES } from './vendor/chess.js';
import { Chessground } from './vendor/chessground.min.js';
import { validateLine, parsePgn, dedupe, userCards, schedule, isDue, buildQueue, soundFor, toPgn, repMoves, fenKey } from './core.js';

const KEY = 'freereps.v2';
const $ = s => document.querySelector(s);
const DEF = { sound: true, volume: 0.7, anim: 200, delay: 400, premove: true, dests: true, coords: true, autoNext: true, flip: false, newLimit: 10 };
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

// ---------- tabs ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === t));
  if (t === 'home') renderHome();
  if (t === 'drill') { renderDrillSelect(); drillCg.redrawAll(); }
  if (t === 'build') buildCg.redrawAll();
  if (t === 'settings') renderSettings();
}

// ---------- home ----------
function repStats(rep, now = Date.now()) {
  const cs = cardsOf(rep); const keys = new Set();
  rep.lines.forEach(l => userCards(l.m, rep.color).forEach(c => keys.add(c.key)));
  let due = 0, fresh = 0, learned = 0, mistakes = 0;
  keys.forEach(k => { const c = cs[k]; if (!c) fresh++; else { if (c.due <= now) due++; if (c.interval >= 1) learned++; if (c.lapses) mistakes++; } });
  return { total: keys.size, due, fresh, learned, mistakes, chapters: new Set(rep.lines.map(l => l.ch)).size };
}
let STARTERS = [];
fetch('starters/index.json').then(r => r.json()).then(j => { STARTERS = j; renderHome(); }).catch(() => {});
async function addStarter(s) {
  const { lines, errors } = parsePgn(await (await fetch('starters/' + s.file)).text(), s.name);
  if (errors.length) console.warn(errors);
  const rep = { id: uid(), name: s.name, color: s.color, lines, starter: s.id }; db.reps.push(rep); save(); return rep;
}
function renderHome() {
  const T = { total: 0, due: 0, fresh: 0, learned: 0 };
  db.reps.forEach(r => { const s = repStats(r); for (const k in T) T[k] += s[k]; });
  const st = db.stats || { reviews: 0, correct: 0 };
  $('#stats').innerHTML = [[T.due, 'due now'], [T.fresh, 'new moves'], [T.learned + '/' + T.total, 'moves learned'],
    [st.reviews ? Math.round(100 * st.correct / st.reviews) + '%' : '–', 'accuracy (' + st.reviews + ' answers)'], [db.streak?.n || 0, 'day streak']]
    .map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  $('#replist').innerHTML = db.reps.length ? '' : '<p class="muted">No repertoires yet — add a starter below or build your own.</p>';
  db.reps.forEach(r => {
    const s = repStats(r); const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<b>${esc(r.name)}</b><span class="muted">${r.color === 'w' ? 'White' : 'Black'} · ${s.chapters} chapters · ${r.lines.length} lines · ${s.total} moves</span>
      <div class="bar"><i style="width:${s.total ? 100 * s.learned / s.total : 0}%"></i></div>
      <span class="muted">${s.due} due · ${s.fresh} new · ${s.mistakes} with mistakes</span>
      <div class="row"><button class="primary">Train</button><button>Edit</button><button>PGN</button><button class="danger">Delete</button></div>`;
    const [d, e, p, x] = el.querySelectorAll('button');
    d.onclick = () => { showTab('drill'); $('#drillRep').value = r.id; startSession('due'); };
    e.onclick = () => editRep(r);
    p.onclick = () => download(r.name.replace(/\W+/g, '_') + '.pgn', toPgn(r), 'application/x-chess-pgn');
    x.onclick = () => { if (confirm('Delete ' + r.name + '?')) { db.reps = db.reps.filter(q => q !== r); delete db.cards[r.id]; save(); renderHome(); } };
    $('#replist').append(el);
  });
  $('#starters').innerHTML = '';
  STARTERS.forEach(s => {
    const el = document.createElement('div'); el.className = 'card' + (s.featured ? ' featured' : '');
    const have = db.reps.some(r => r.starter === s.id);
    el.innerHTML = `<b>${esc(s.name)}${s.featured ? '<span class="badge">Featured</span>' : ''}</b><span class="muted">${s.color === 'w' ? 'White' : 'Black'} · ${esc(s.blurb || '')}</span>
      <div class="row"><button ${s.featured ? 'class="primary"' : ''}>${have ? 'Add again' : 'Add'}</button></div>`;
    el.querySelector('button').onclick = async () => { await addStarter(s); renderHome(); };
    $('#starters').append(el);
  });
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}

// ---------- settings ----------
const SET = { sSound: 'sound', sVolume: 'volume', sAnim: 'anim', sDelay: 'delay', sPremove: 'premove', sDests: 'dests', sCoords: 'coords', sAutoNext: 'autoNext', sFlip: 'flip', sNew: 'newLimit' };
function renderSettings() {
  for (const [id, k] of Object.entries(SET)) { const el = $('#' + id); if (el.type === 'checkbox') el.checked = S()[k]; else el.value = S()[k]; }
}
for (const [id, k] of Object.entries(SET)) $('#' + id).onchange = e => {
  const el = e.target; S()[k] = el.type === 'checkbox' ? el.checked : Number(el.value); save(); applyBoardSettings();
};
function applyBoardSettings() { drillCg.set(boardOpts()); buildCg.set({ ...boardOpts(), premovable: { enabled: false } }); setOrientation(); drillCg.redrawAll(); buildCg.redrawAll(); }
$('#testSounds').onclick = () => { Sound.init(); ['move', 'capture', 'castle', 'check', 'error', 'complete'].forEach((n, i) => setTimeout(() => Sound.play(n), 60 + i * 450)); };
$('#exportBtn').onclick = () => download('freereps-backup-' + new Date().toISOString().slice(0, 10) + '.json',
  JSON.stringify({ app: 'FreeReps', version: 2, exported: new Date().toISOString(), ...db }, null, 1), 'application/json');
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = migrate(JSON.parse(await f.text())); if (!Array.isArray(d.reps)) throw new Error('not a FreeReps backup');
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
$('#drillRep').onchange = fillPickers;
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => {
  const m = b.dataset.mode; document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('primary', x === b));
  $('#drillChapter').hidden = m !== 'chapter'; $('#drillLine').hidden = m !== 'line';
  startSession(m);
});
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
  drill.li = drill.queue[drill.qi++]; drill.line = drill.rep.lines[drill.li].m; drill.ply = 0; drill.chess = new Chess(); drill.lineMiss = 0;
  drillCg.cancelPremove(); drillCg.setAutoShapes([]);
  drillCg.set({ fen: drill.chess.fen(), lastMove: undefined, check: false, turnColor: 'white' }); setOrientation();
  $('#drillInfo').textContent = `${drill.rep.lines[drill.li].ch} · line ${drill.qi}/${drill.queue.length}`;
  msg(`Your move as ${userColor() === 'w' ? 'White' : 'Black'}.`);
  advance();
}
function renderMoves() { $('#drillMoves').innerHTML = fmt(drill.chess.history()); }

function advance() {
  renderMoves();
  if (drill.ply >= drill.line.length) return lineDone();
  const myTurn = drill.chess.turn() === userColor();
  if (myTurn) {
    drillCg.set({ turnColor: turnColor(drill.chess), check: drill.chess.inCheck(), movable: { color: cname(userColor()), dests: dests(drill.chess) } });
    const card = cardsOf(drill.rep)[cardKey()];
    drill.missed = false; drill.learning = !card;
    if (drill.learning) { showArrow(drill.line[drill.ply], 'blue'); msg(`New move: play <b>${drill.line[drill.ply]}</b>.`); } else drillCg.setAutoShapes([]);
    drillCg.playPremove();
  } else {
    // opponent to move: user may premove meanwhile
    drillCg.set({ turnColor: turnColor(drill.chess), movable: { color: S().premove ? cname(userColor()) : undefined, dests: new Map() } });
    drill.busy = true;
    drill.timer = setTimeout(() => {
      const m = drill.chess.move(drill.line[drill.ply++]); drill.busy = false;
      drillCg.move(m.from, m.to);
      if (m.flags.includes('e') || m.flags.includes('p')) drillCg.set({ fen: drill.chess.fen() });
      drillCg.set({ lastMove: [m.from, m.to] });
      Sound.play(soundFor(m, drill.chess.inCheck()));
      advance();
    }, drill.ply === 0 ? 300 : S().delay);
  }
}
const cardKey = () => userCards(drill.line, userColor()).find(c => c.ply === drill.ply).key;
function showArrow(san, brush = 'green') { const m = new Chess(drill.chess.fen()).move(san); drillCg.setAutoShapes([{ orig: m.from, dest: m.to, brush }]); }
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
    msg(drill.learning ? `✔ ${m.san} — learned.` : drill.missed ? `✔ ${m.san}` : `✔ ${m.san}`, 'ok');
    return advance();
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
  if (S().autoNext) drill.timer = setTimeout(nextLine, 900);
}
addEventListener('keydown', e => { if (e.target.matches('input,textarea,select')) return; if (e.key === 'h') $('#drillHint').click(); if (e.key === 'n' || e.key === 'Enter') { if (!$('#drillNext').hidden) nextLine(); } if (e.key === 'f') drillCg.toggleOrientation(); });

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
  const { lines, errors } = parsePgn(text, $('#buildChapter').value.trim() || 'Imported');
  build.lines = dedupe([...build.lines, ...lines]);
  bmsg(`Added ${lines.length} line(s).` + (errors.length ? ` Skipped ${errors.length}: ` + errors.slice(0, 5).join('; ') : ''), errors.length ? 'bad' : 'ok'); buildSync();
}
$('#pgnAdd').onclick = () => addPgn($('#pgn').value);
$('#pgnFile').onchange = async e => { const f = e.target.files[0]; if (f) addPgn(await f.text()); e.target.value = ''; };
$('#buildCommit').onclick = () => {
  if (!build.lines.length) return bmsg('Add at least one line.', 'bad');
  const name = $('#buildName').value.trim() || 'My repertoire';
  if (build.editing) Object.assign(build.editing, { name, color: buildColor(), lines: build.lines });
  else db.reps.push({ id: uid(), name, color: buildColor(), lines: build.lines });
  save(); build.lines = []; build.editing = null; bmsg('Repertoire saved!', 'ok'); showTab('home');
};
function editRep(r) {
  build.editing = r; build.lines = r.lines.map(l => ({ m: [...l.m], ch: l.ch })); build.chess = new Chess();
  $('#buildName').value = r.name; document.querySelector(`input[name=color][value=${r.color}]`).checked = true;
  showTab('build'); buildSync(); bmsg('Editing "' + r.name + '". Add/remove lines, then Save repertoire.');
}
buildSync(); renderHome(); renderSettings();
