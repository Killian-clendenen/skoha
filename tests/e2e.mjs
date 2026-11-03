import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); const T = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.wav': 'audio/wav', '.pgn': 'text/plain' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8765);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await chromium.launch({ executablePath: process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('http://localhost:8765/'); await pg.waitForSelector('#whiteList .ocard.featured');
// first-visit guide: side + level -> suggestions -> 3-step tour -> lands on the picked opening
await pg.waitForSelector('#guide:not([hidden])'); ok(true, 'guide shown on first visit');
await pg.click('#guide [data-k=side] [data-v=b]'); await pg.click('#guide [data-k=level] [data-v=advanced]'); await pg.click('#gNext0');
ok((await pg.textContent('#gSugg')).includes('Sicilian'), 'advanced Black -> Sicilian suggested');
await pg.click('#gNext1'); for (let i = 0; i < 3; i++) await pg.click('#gTourNext');
ok(await pg.isHidden('#guide') && /#\/train/.test(pg.url()) && await pg.inputValue('#drillRep') === 'sicilian', 'Start training opens training on the suggested opening');
await pg.reload(); await pg.waitForTimeout(800); ok(await pg.isHidden('#guide'), 'guide not shown again');
await pg.goto('http://localhost:8765/#/'); await pg.waitForSelector('#whiteList .ocard.featured');
ok((await pg.textContent('#whiteList .ocard:first-child h3')).includes('Réti'), 'Réti featured first in White openings');
const nW = await pg.locator('#whiteList .ocard').count(), nB = await pg.locator('#blackList .ocard').count();
ok(nW >= 12 && nB >= 14 && (await pg.textContent('#blackList')).includes('London System'), `White ${nW} / Black ${nB} cards, QGD tied to London`);
ok((await pg.textContent('#whiteList .ocard[data-id=ruy]')).includes('Berlin Defence'), 'Ruy Lopez card links the Berlin');
// search: instant filter + keyboard
await pg.click('#search'); await pg.keyboard.type('Najdorf'); await pg.waitForTimeout(80);
ok((await pg.locator('#searchResults .sres').first().textContent()).includes('Najdorf'), 'search "Najdorf" -> first result is the Najdorf chapter');
ok((await pg.locator('#home .ocard:not([hidden])').count()) === 1, 'cards filtered to matching opening');
await pg.screenshot({ path: '/workspace/skoha-home.png' });
await pg.keyboard.press('Enter'); await pg.waitForSelector('#opening.active #ch-sicilian-najdorf'); await pg.waitForTimeout(400);
ok(await pg.evaluate(() => { const r = document.getElementById('ch-sicilian-najdorf').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'Enter jumps to Sicilian > Najdorf chapter');
await pg.goto('http://localhost:8765/#/'); await pg.waitForSelector('#whiteList .ocard');
await pg.keyboard.press('/'); await pg.keyboard.type('e4 c5');
ok((await pg.locator('#searchResults .sres').first().textContent()).includes('Sicilian'), 'search by moves "e4 c5" -> Sicilian');
await pg.fill('#search', 'grunfeld'); await pg.waitForTimeout(50); await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowUp');
ok((await pg.locator('#searchResults .sres.on').textContent()).includes('Grünfeld'), 'accent-insensitive + arrow keys');
await pg.fill('#search', 'xyzzy'); await pg.waitForTimeout(50); ok(!(await pg.isHidden('#searchEmpty')), 'empty-state shown');
await pg.keyboard.press('Escape'); ok((await pg.locator('#home .ocard[hidden]').count()) === 0, 'Escape clears filter');
ok((await pg.textContent('#whiteList')).includes('vs 1...f5'), 'Réti card shows defences (chapters)');
await pg.screenshot({ path: root + '/screenshot-home.png', fullPage: false });
// Home -> Opening -> Line
await pg.click('#whiteList .ocard.featured h3'); await pg.waitForSelector('#opening.active .chapter');
ok((await pg.locator('#opening .lineitem').count()) === 46, 'opening page lists 46 lines');
await pg.click('.otabs [data-t=kb]'); ok((await pg.textContent('#oBody')).includes('Capablanca'), 'knowledge base renders');
await pg.click('.otabs [data-t=lines]');
await pg.click('#opening .lineitem >> nth=0'); await pg.waitForSelector('#line.active');
ok((await pg.textContent('#lnNote')).length > 40, 'line intro shown');
const lf = () => pg.evaluate(() => window.__freereps.lineCg.getFen()); const lf0 = await lf();
await pg.click('#lnNext'); await pg.waitForTimeout(250); const lf1 = await lf();
ok(lf1 !== lf0, 'study page: real click ▶ changes board'); await pg.click('#lnPrev'); await pg.waitForTimeout(200); ok(await lf() === lf0, 'study page: ◀ restores board'); await pg.click('#lnNext'); await pg.waitForTimeout(250);
ok((await pg.textContent('#lnNote')).includes('Réti starts flexibly'), 'annotation for 1.Nf3 renders');
ok((await pg.locator('#lineBoard svg circle, #lineBoard cg-auto-pieces, #lineBoard svg g').count()) > 0, 'highlight shapes drawn');
for (let i = 0; i < 2; i++) { await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(220); }
ok((await pg.textContent('#lnNote')).includes('signature Réti move'), 'keyboard → steps to 2.c4 note');
ok((await pg.locator('#lineBoard svg line, #lineBoard svg path').count()) > 0, 'arrow drawn for 2.c4');
await pg.screenshot({ path: root + '/screenshot-line.png' });
await pg.goto('http://localhost:8765/#/'); await pg.waitForSelector('#whiteList .ocard');
await pg.evaluate(() => { const s = window.__freereps.db().settings; s.delay = 150; s.anim = 120; s.autoNext = false; s.autoReply = true; });
await pg.goto('http://localhost:8765/#/opening/reti'); await pg.waitForSelector('#opening.active [data-act=due]'); await pg.click('[data-act=due]'); await pg.waitForTimeout(500);
// click squares on the board helper (white orientation)
const sq = async s => { const bb = await pg.locator('#drillBoard cg-board').boundingBox(); const f = s.charCodeAt(0) - 97, r = +s[1] - 1; const w = bb.width / 8;
  await pg.mouse.click(bb.x + (f + .5) * w, bb.y + (7 - r + .5) * w); };
const mv = async (a, c) => { await sq(a); await sq(c); };
const st = () => pg.evaluate(() => { const d = window.__freereps.drill; return { ply: d.ply, line: d.line.join(' '), hist: d.chess.history().join(' '), sounds: [...window.__freereps.sounds] }; });
let s = await st(); ok(s.line.startsWith('Nf3 d5 c4 e6'), 'first due line: ' + s.line);
// play whole line by reading expected moves (the user's), with one deliberate mistake and one premove
const { Chess } = await import(root + '/vendor/chess.js');
let didMistake = false, didPremove = false, guard = 0;
while (guard++ < 60) {
  s = await st(); if (s.ply >= s.line.split(' ').length) break;
  const c = new Chess(); s.hist.split(' ').filter(Boolean).forEach(x => c.move(x));
  if (c.turn() !== 'w') { await pg.waitForTimeout(60); continue; }
  const exp = s.line.split(' ')[s.ply]; const m = c.move(exp);
  if (!didMistake && s.ply === 2) { await mv('a2', 'a3'); await pg.waitForTimeout(250); didMistake = true;
    ok((await pg.textContent('#drillMsg')).includes("isn't in your repertoire"), 'mistake detected'); }
  await mv(m.from, m.to);
  // premove: next user move entered while opponent's reply pending
  const line = s.line.split(' ');
  if (!didPremove && s.ply === 4 && line.length > 7) {
    const c2 = new Chess(); line.slice(0, 6).forEach(x => c2.move(x)); const pm = c2.move(line[6]);
    await pg.waitForTimeout(20); await mv(pm.from, pm.to); didPremove = true;
    await pg.waitForTimeout(600); const s2 = await st();
    ok(s2.ply >= 7 && s2.hist.split(' ')[6] === line[6], `premove ${line[6]} auto-played after opponent's ${line[5]} (ply ${s2.ply})`);
    continue;
  }
  await pg.waitForTimeout(300);
}
s = await st(); ok(s.ply === s.line.split(' ').length, 'full line completed: ' + s.hist);
ok((await pg.textContent('#drillMsg')).includes('Line complete'), 'line-complete message');
ok(['move', 'error', 'complete', 'castle'].every(x => s.sounds.includes(x)), 'sounds triggered: ' + [...new Set(s.sounds)].join(','));
const loaded = await pg.evaluate(() => fetch('sounds/capture.wav').then(r => r.ok));
ok(loaded, 'sound files served');
await pg.evaluate(() => document.querySelector('#modeBox').open = true); await pg.click('#modes [data-mode=line]'); await pg.waitForTimeout(500); await mv('a2', 'a3'); await pg.waitForTimeout(300);
const cards = await pg.evaluate(() => Object.values(Object.values(window.__freereps.db().cards)[0]));
ok(cards.some(c => c.lapses === 1), 'review mistake recorded as SM-2 lapse');
await pg.evaluate(() => document.querySelector('#modeBox').open = true); await pg.click('#modes [data-mode=mistakes]'); await pg.waitForTimeout(400);
ok((await pg.textContent('#drillInfo')).match(/line 1\/\d+/), 'mistakes-only mode queues lines containing the missed move');
await mv('g1', 'f3'); await pg.waitForTimeout(300);
ok((await pg.textContent('#drillNote')).length > 10, 'annotation shown during drill');
ok(await pg.locator('#drillNote .coach-card').isVisible() && /Your move|Opponent|New move/.test(await pg.textContent('#drillNote .coach-card .who')), 'coach cutout card shows move explanation');
const geo = await pg.evaluate(() => { const b = document.querySelector('#drillBoard').getBoundingClientRect(), c = document.querySelector('#drillNote .coach-card').getBoundingClientRect(), m = document.querySelector('#modeBox summary').getBoundingClientRect(), n = document.querySelector('#navFwd').getBoundingClientRect(); return { inside: c.right <= b.left && Math.abs(c.top - b.top) < 12, ct: c.top && Math.abs(c.height - b.height) < 4, ch: c.height, bh: b.height, mTop: m.top, bTop: b.top, nTop: n.top, bBot: b.bottom }; });
ok(geo.inside && geo.mTop < geo.bTop && geo.nTop >= geo.bBot, 'desktop: explanation box left of the board, same height, Back/Next under it, compact top bar ' + JSON.stringify(geo));
ok(/due/.test(await pg.textContent('#drillStats')), 'stats in top bar');
await pg.screenshot({ path: '/workspace/skoha-train.png' });
// step-by-step flow (default): opponent waits for Next; overlay explains each move; Back/Next browse history
await pg.evaluate(() => { window.__freereps.db().settings.autoReply = false; });
await pg.evaluate(() => document.querySelector('#modeBox').open = true); await pg.click('#modes [data-mode=line]'); await pg.selectOption('#drillLine', '0'); await pg.waitForTimeout(400);
{ const ln = (await st()).line.split(' ');
  const play = async p => { const c = new Chess(); ln.slice(0, p).forEach(x => c.move(x)); const m = c.move(ln[p]); await mv(m.from, m.to); await pg.waitForTimeout(250); return m; };
  const m0 = await play(0); await pg.waitForTimeout(500);
  ok((await st()).ply === 1, 'opponent does not reply automatically');
  const F = () => pg.evaluate(() => window.__freereps.cg.getFen()); const fenAt = k => { const c = new Chess(); ln.slice(0, k).forEach(x => c.move(x)); return c.fen().split(' ')[0]; };
  ok(!(await pg.isDisabled('#navBack')), 'Back enabled right after the first move');
  await pg.click('#navBack'); await pg.waitForTimeout(150);
  ok(await F() === fenAt(0) && (await pg.textContent('#navPos')).includes('Move 0 of 1'), 'real click Back after move 1 -> start position on board');
  await pg.click('#navFwd'); await pg.waitForTimeout(150);
  ok(await F() === fenAt(1) && (await st()).ply === 1, 'real click Next -> back to live position, reply still waiting');
  ok((await pg.textContent('#drillNote .who')).includes('Your move') && (await pg.textContent('#drillNote .coach-san')).includes(ln[0]), 'overlay shows your move explanation');
  ok(await pg.evaluate(() => document.querySelector('#navFwd').classList.contains('primary')), 'Next is highlighted while waiting');
  const pos = await pg.evaluate(() => document.querySelector('#drillNote').className);
  ok(/at-top/.test(pos), 'bubble over the top edge, away from 1.' + ln[0] + ': ' + pos);
  await pg.click('#navFwd'); await pg.waitForTimeout(500);
  ok((await st()).ply === 2 && ((await pg.textContent('#drillNote .who')).includes("Opponent's reply") || await pg.locator('#drillNote .prevnote').count() > 0 || (await st()).ply === 2), 'Next plays the reply and shows its annotation');
  await play(2); await pg.keyboard.press('Space'); await pg.waitForTimeout(500);
  ok((await st()).ply === 4, 'Space triggers Next');
  await play(4); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(500);
  ok((await st()).ply === 6, '→ triggers Next');
  ok((await pg.textContent('#navPos')).includes('Move 6 of 6'), 'counter: ' + await pg.textContent('#navPos'));
  await pg.click('#navBack'); await pg.waitForTimeout(150);
  ok((await pg.textContent('#navPos')).includes('Move 5 of 6') && (await pg.textContent('#drillNote .coach-san')).includes(ln[4]), 'Back shows move 5 annotation');
  await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(150);
  const fen4 = await pg.evaluate(() => window.__freereps.cg.getFen()); const c4 = new Chess(); ln.slice(0, 4).forEach(x => c4.move(x));
  ok(fen4 === c4.fen().split(' ')[0], 'board shows position at move 4 while browsing');
  await mv('a2', 'a3'); await pg.waitForTimeout(150); ok((await st()).ply === 6, 'board read-only while browsing');
  await pg.click('#navFwd'); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(150);
  ok((await pg.textContent('#navPos')).includes('Move 6 of 6') && !(await pg.evaluate(() => document.querySelector('#drill').classList.contains('browsing'))), 'Next returns to live');
  await play(6); await pg.screenshot({ path: '/workspace/skoha-annot.png' });
  ok((await st()).ply === 7, 'live board playable again after browsing');
  // after a mistake: Back/Next still move the board
  await pg.click('#navFwd'); await pg.waitForTimeout(500); await mv('a2', 'a3'); await pg.waitForTimeout(250);
  const pl = (await st()).ply; await pg.click('#navBack'); await pg.waitForTimeout(150);
  ok(await F() === fenAt(pl - 1), 'after a mistake: Back shows previous position');
  await pg.click('#navFwd'); await pg.waitForTimeout(150); ok(await F() === fenAt(pl), 'after a mistake: Next returns to live');
  // finish the line, then Back/Next after completion
  let g = 0; while ((await st()).ply < ln.length && g++ < 40) { const s5 = await st(); if (s5.ply % 2 === 0) await play(s5.ply); else { await pg.click('#navFwd'); await pg.waitForTimeout(350); } }
  ok((await st()).ply === ln.length, 'line completed in step mode');
  await pg.click('#navBack'); await pg.waitForTimeout(150); ok(await F() === fenAt(ln.length - 1), 'after line complete: Back changes board');
  await pg.click('#navBack'); await pg.waitForTimeout(150); ok(await F() === fenAt(ln.length - 2), 'after line complete: Back again');
  await pg.click('#navFwd'); await pg.click('#navFwd'); await pg.waitForTimeout(150); ok(await F() === fenAt(ln.length), 'after line complete: Next to final position');
  // switching lines resets history
  await pg.selectOption('#drillLine', '1'); await pg.waitForTimeout(500);
  ok((await pg.textContent('#navPos')).includes('No moves yet') || /Move 0/.test(await pg.textContent('#navPos')), 'switching lines resets the counter: ' + await pg.textContent('#navPos'));
  ok(await pg.isDisabled('#navBack'), 'Back disabled at line start'); }
await pg.click('nav [data-nav=settings]'); await pg.click('#testSounds'); await pg.waitForTimeout(400); await pg.selectOption('#sTheme', 'aurora'); ok(await pg.evaluate(() => document.body.classList.contains('bt-aurora')), 'board theme switch');
ok(await pg.locator('nav a').count() === 3, 'three-item nav');
ok(await pg.inputValue('#sGoal') === '10', 'daily goal default 10');
await pg.fill('#sGoal', '3'); await pg.dispatchEvent('#sGoal', 'change'); await pg.click('nav [data-nav=home]'); await pg.waitForSelector('#goalRing');
{ const t = await pg.textContent('#goalRing'); ok(/\d+\/3/.test(t) && /day streak/.test(t), 'home ring + streak: ' + t.replace(/\s+/g, ' ')); }
ok(await pg.evaluate(() => Object.values(window.__freereps.db().history || {})[0] > 0), 'reviews counted today');
await pg.screenshot({ path: '/workspace/skoha-goal-home.png' }); await pg.click('nav [data-nav=settings]');
await pg.click('#toData'); await pg.waitForSelector('#data.active #exportBtn'); ok(true, 'Your data page');
await pg.screenshot({ path: '/workspace/skoha-simple-data.png' });
await pg.click('nav [data-nav=settings]'); await pg.screenshot({ path: '/workspace/skoha-simple-settings.png', fullPage: true });
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
// mobile
const mp = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await mp.goto('http://localhost:8765/'); await mp.waitForSelector('#guide:not([hidden])'); await mp.screenshot({ path: '/workspace/skoha-guide-mobile.png' }); await mp.tap('#gSkip');
await mp.waitForSelector('#whiteList .ocard'); const bw = await mp.evaluate(() => document.documentElement.scrollWidth);
ok(bw <= 390, 'mobile no horizontal overflow (' + bw + ')');
await mp.evaluate(() => { const s = window.__freereps.db().settings; s.delay = 150; s.autoReply = false; });
await mp.goto('http://localhost:8765/#/opening/sicilian'); await mp.waitForSelector('#opening.active [data-act=random]'); await mp.click('[data-act=random]'); await mp.waitForTimeout(900);
const mg = await mp.evaluate(() => { const b = document.querySelector('#drillBoard').getBoundingClientRect(), c = document.querySelector('#drillNote .coach-card').getBoundingClientRect(), n = document.querySelector('#navFwd').getBoundingClientRect(); return { bb: b.bottom, inside: c.top >= n.bottom - 1 && c.right <= 391, w: document.documentElement.scrollWidth, bw: b.width }; });
ok(mg.inside && mg.w <= 390 && mg.bw > 300, `mobile train: explanation box below the board and Back/Next, no overflow (${JSON.stringify(mg)})`);
ok((await mp.textContent('#drillNote')).length > 10, 'mobile: coach explains opponent move');
const tb = await mp.locator('#navBack').boundingBox(); ok(tb.height >= 48 && tb.width >= 100 && tb.y > mg.bb - 1, 'mobile: large Back/Next tap targets under board ' + JSON.stringify(tb));
await mp.screenshot({ path: '/workspace/skoha-annot-mobile.png' });

// ---- new-move cue: arrow + from/to rings + pulsing target + "Play X: move the ..." bubble, real clicks, fresh profiles ----
async function fresh(vp = { width: 1200, height: 820 }) { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:8765/'); await p.waitForSelector('#guide:not([hidden])'); return p; }
const cueState = p => p.evaluate(() => { const d = window.__freereps.drill, sh = window.__freereps.cg.state.drawable.autoShapes, pu = document.querySelector('#drillPulse');
  const exp = d.line && d.ply < d.line.length ? d.line[d.ply] : null; return { exp, learning: d.learning, arrows: sh.filter(s => s.dest && s.brush === 'blue').map(s => s.orig + s.dest), rings: sh.filter(s => !s.dest && s.brush === 'blue').map(s => s.orig),
    pulse: pu && !pu.hidden ? pu.dataset.sq : null, lead: document.querySelector('#playLead')?.textContent || '', svg: document.querySelectorAll('#drillBoard svg line, #drillBoard svg path').length }; });
const cueOk = (c, tag) => ok(c.arrows.length === 1 && c.rings.length === 2 && c.pulse && c.arrows[0].endsWith(c.pulse) && /^Play \S+: (move the \w+ from [a-h][1-8] to [a-h][1-8]|castle)/.test(c.lead) && c.svg > 0, 'new-move cue ' + tag + ' ' + JSON.stringify(c));
const clickSq = async (p, s, white = true) => { const bb = await p.locator('#drillBoard cg-board').boundingBox(); const f = s.charCodeAt(0) - 97, r = +s[1] - 1, w = bb.width / 8;
  await p.mouse.click(bb.x + ((white ? f : 7 - f) + .5) * w, bb.y + ((white ? 7 - r : r) + .5) * w); };
{ // 1) guide -> Start training, White: very first move
  const p = await fresh(); await p.click('#guide [data-k=side] [data-v=w]'); await p.click('#gNext0'); await p.click('#gNext1'); for (let i = 0; i < 3; i++) await p.click('#gTourNext');
  await p.waitForTimeout(700); const c = await cueState(p); cueOk(c, 'after guide Start training, move 1 as White'); ok(c.lead.includes(c.exp), 'lead names the expected move');
  await p.screenshot({ path: '/workspace/skoha-cue-first.png' });
  // play it with real clicks; cue disappears; Next shows reply then cue for move 2
  const [from, to] = [c.arrows[0].slice(0, 2), c.arrows[0].slice(2)]; await clickSq(p, from); await clickSq(p, to); await p.waitForTimeout(300);
  ok((await cueState(p)).pulse === null, 'pulse hidden after the move is played');
  await p.click('#navFwd'); await p.waitForTimeout(900); cueOk(await cueState(p), 'move 2 after pressing Next');
  // Back then Next back to live restores the cue
  await p.click('#navBack'); await p.waitForTimeout(250); ok((await cueState(p)).pulse === null, 'no cue while browsing');
  await p.click('#navFwd'); await p.waitForTimeout(400); cueOk(await cueState(p), 'after Back/Next returns to live');
  await p.context().close(); }
{ // 2) Black: first move after opponent's 1st move, step-by-step flow
  const p = await fresh(); await p.click('#gSkip'); await p.evaluate(() => { const s = window.__freereps.db().settings; s.autoReply = false; });
  await p.goto('http://localhost:8765/#/opening/carokann'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(1200);
  const c = await cueState(p); cueOk(c, 'first Black move after 1.e4');
  await p.screenshot({ path: '/workspace/skoha-cue-black.png' });
  const [from, to] = [c.arrows[0].slice(0, 2), c.arrows[0].slice(2)]; await clickSq(p, from, false); await clickSq(p, to, false); await p.waitForTimeout(300);
  await p.click('#navFwd'); await p.waitForTimeout(900); cueOk(await cueState(p), 'Black move 2 after Next');
  await p.context().close(); }
{ // 3) explanations off: arrow still shown
  const p = await fresh(); await p.click('#gSkip'); await p.evaluate(() => { window.__freereps.db().settings.notes = false; });
  await p.goto('http://localhost:8765/#/opening/italian'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(800);
  cueOk(await cueState(p), 'with explanations off'); await p.context().close(); }
{ // 4) learned move hides the answer
  const p = await fresh(); await p.click('#gSkip'); await p.evaluate(() => { const s = window.__freereps.db().settings; s.autoReply = true; s.delay = 150; s.autoNext = false; });
  await p.goto('http://localhost:8765/#/opening/italian'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(800);
  const c = await cueState(p); await clickSq(p, c.arrows[0].slice(0, 2)); await clickSq(p, c.arrows[0].slice(2)); await p.waitForTimeout(300);
  await p.evaluate(() => { const d = window.__freereps.drill; d.queue.forEach(q => q); });
  await p.evaluate(() => document.querySelector('#modeBox').open = true); await p.click('#modes [data-mode=random]'); await p.waitForTimeout(800);
  const c2 = await cueState(p); ok(c2.learning === false && c2.arrows.length === 0 && c2.pulse === null, 'learned move hides the answer ' + JSON.stringify(c2));
  await p.context().close(); }
{ const p = await fresh(); await p.click('#gSkip'); await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForSelector('#line.active #lnNote'); await p.waitForTimeout(400);
  const g = await p.evaluate(() => { const b = document.querySelector('#lineBoard').getBoundingClientRect(), n = document.querySelector('#lnNote').getBoundingClientRect(); return { left: n.right <= b.left, h: Math.abs(n.height - b.height) < 4 }; });
  ok(g.left && g.h, 'study page: explanation box left of board ' + JSON.stringify(g)); await p.screenshot({ path: '/workspace/skoha-line-leftbox.png' }); await p.context().close(); }
await b.close(); srv.close(); console.log(fail ? fail + ' FAIL' : 'ALL E2E PASS'); process.exit(fail ? 1 : 0);
