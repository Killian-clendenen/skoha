import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); const T = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.wav': 'audio/wav', '.pgn': 'text/plain', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { if (q.url.startsWith('/api/')) { r.writeHead(501, { 'content-type': 'application/json' }); return r.end('{"enabled":false}'); } let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); if (p.endsWith('index.html') && global.__marker) d = Buffer.from(String(d).replace('</body>', global.__marker + '</body>')); r.end(d); } }); }).listen(8765);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await chromium.launch({ executablePath: process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/status of 501/.test(m.text())) errs.push(m.text()); });
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
    ok((await pg.textContent('#drillMsg')).includes("isn't in your repertoire"), 'mistake detected');
    ok(/^The move is \S+: (move the|castle)/.test(await pg.textContent('#wrongLead')) && await pg.evaluate(() => { const sh = window.__freereps.cg.state.drawable.autoShapes; return sh.some(s => s.brush === 'red' && s.dest) && sh.some(s => s.brush === 'green' && s.dest); }), 'wrong move: box shows the right move + why, red/green arrows: ' + await pg.textContent('#wrongLead'));
    await pg.screenshot({ path: '/workspace/skoha-wrong.png' }); }
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
ok(await pg.locator('nav a').count() === 4, 'four-item nav (Home, Train, Progress, Settings)');
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
  const c2 = await cueState(p); cueOk(c2, 'Guided (default): learned move still guided'); ok(c2.learning === false, 'that move is a learned card');
  ok((await p.textContent('#helpToggle')).includes('Guided'), 'help toggle shows Guided'); await p.screenshot({ path: '/workspace/skoha-guided.png' });
  await p.click('#helpToggle'); await p.waitForTimeout(200);
  const c3 = await cueState(p); ok(c3.arrows.length === 0 && c3.pulse === null && !c3.lead && !(await p.textContent('#drillMsg')).includes(c3.exp), 'No help: no arrow, pulse or answer text ' + JSON.stringify(c3));
  ok(await p.evaluate(() => window.__freereps.db().settings.help === 'none'), 'No help persisted'); await p.screenshot({ path: '/workspace/skoha-nohelp.png' });
  await p.evaluate(() => document.querySelector('#modeBox').open = true); await p.click('#modes [data-mode=random]'); await p.waitForTimeout(800);
  ok((await cueState(p)).arrows.length === 0, 'No help stays off on the next line');
  { // wrong move in No help: green answer + red attempt, no blue pulse; answer then stays (no blue cue in No help)
    const bad = await p.evaluate(() => { const d = window.__freereps.drill, ms = d.chess.moves({ verbose: true }); const q = ms.find(m => m.san !== d.line[d.ply] && !(d.alts?.get?.(d.chess.fen().split(' ').slice(0, 4).join(' '))?.has(m.san))); return q.from + q.to; });
    await clickSq(p, bad.slice(0, 2)); await clickSq(p, bad.slice(2)); await p.waitForTimeout(300);
    const w = await p.evaluate(() => { const sh = window.__freereps.cg.state.drawable.autoShapes, pu = document.querySelector('#drillPulse'); return { red: sh.some(s => s.brush === 'red' && s.dest), green: sh.some(s => s.brush === 'green' && s.dest), blue: sh.some(s => s.brush === 'blue'), pulse: !!(pu && !pu.hidden) }; });
    ok(w.red && w.green && !w.blue && !w.pulse, 'wrong move visuals consistent ' + JSON.stringify(w)); }
  await p.click('#helpToggle');
  { // wrong move in Guided: same visuals, then the normal blue cue returns
    const bad = await p.evaluate(() => { const d = window.__freereps.drill, ms = d.chess.moves({ verbose: true }); return ms.filter(m => m.san !== d.line[d.ply]).map(m => m.from + m.to).at(-1); });
    await clickSq(p, bad.slice(0, 2)); await clickSq(p, bad.slice(2)); await p.waitForTimeout(300);
    const w = await p.evaluate(() => { const sh = window.__freereps.cg.state.drawable.autoShapes, pu = document.querySelector('#drillPulse'); return { green: sh.some(s => s.brush === 'green' && s.dest), blue: sh.some(s => s.brush === 'blue'), pulse: !!(pu && !pu.hidden) }; });
    ok(w.green && !w.blue && !w.pulse, 'Guided wrong move: green answer, blue pulse cleared ' + JSON.stringify(w));
    await p.waitForTimeout(2800); cueOk(await cueState(p), 'normal cue restored after wrong-move feedback'); }
  await p.context().close(); }
{ const p = await fresh(); await p.click('#gSkip'); await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForSelector('#line.active #lnNote'); await p.waitForTimeout(400);
  const g = await p.evaluate(() => { const b = document.querySelector('#lineBoard').getBoundingClientRect(), n = document.querySelector('#lnNote').getBoundingClientRect(); return { left: n.right <= b.left, h: Math.abs(n.height - b.height) < 4 }; });
  ok(g.left && g.h, 'study page: explanation box left of board ' + JSON.stringify(g)); await p.screenshot({ path: '/workspace/skoha-line-leftbox.png' }); await p.context().close(); }
{ // narrator with a speechSynthesis stub
  const c = await b.newContext({ viewport: { width: 1200, height: 820 } });
  await c.addInitScript(() => { window.__spoken = []; window.__cancels = 0;
    class U { constructor(t) { this.text = t; } } Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => { if (u.text.trim()) window.__spoken.push({ t: u.text, v: u.voice?.name, r: u.rate }); }, cancel: () => window.__cancels++, addEventListener() {},
      getVoices: () => [{ name: 'Fred', lang: 'en-US', voiceURI: 'f' }, { name: 'Google US English', lang: 'en-US', voiceURI: 'g' }] } }); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:8765/'); await p.waitForSelector('#guide:not([hidden])'); await p.click('#gSkip');
  await p.evaluate(() => { const s = window.__freereps.db().settings; s.autoReply = false; s.narrator = true; s.narrOpp = true; s.voiceRate = 1.2; });
  await p.goto('http://localhost:8765/#/opening/carokann'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(1300);
  const sp = await p.evaluate(() => window.__spoken); ok(sp.some(x => /^New move: Play c6: move the pawn from c7 to c6/.test(x.t)) && sp.every(x => x.v === 'Google US English' && x.r === 1.2), 'narrator reads the new move with the Google voice: ' + JSON.stringify(sp.slice(-1)));
  ok(sp.every(x => !/[\[\]{}%]/.test(x.t)), 'narration has no PGN tags');
  const c0 = await p.evaluate(() => window.__cancels); await p.click('#navBack'); ok(await p.evaluate(() => window.__cancels) > c0, 'Back cancels speech');
  await p.click('#drillSpeak'); ok(await p.textContent('#drillSpeak') === '🔇' && !(await p.evaluate(() => window.__freereps.db().settings.narrator)), 'speaker toggle mutes');
  await p.click('#drillSpeak');
  await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForSelector('#line.active'); await p.evaluate(() => window.__spoken.length = 0); await p.click('#lnNext'); await p.waitForTimeout(500);
  const s2 = await p.evaluate(() => window.__spoken); ok(s2.length === 1 && /^Knight to f3\. /.test(s2[0].t), 'study page reads Knight to f3 + note: ' + JSON.stringify(s2));
  await p.click('nav [data-nav=settings]'); ok((await p.textContent('#sVoice')).includes('Automatic (Google US English)'), 'voice picker lists voices, auto picks Google');
  await p.screenshot({ path: '/workspace/skoha-settings-narrator.png', fullPage: true }); await c.close(); }
{ // sync code: device A -> device B
  const A = await fresh(); await A.click('#gSkip'); await A.evaluate(() => { const d = window.__freereps.db(); d.cards.reti = { 'x|Nf3': { reps: 4, due: 1, ease: 2.5, interval: 6, lapses: 0 } }; d.history = { '2026-11-02': 7 }; });
  await A.goto('http://localhost:8765/#/data'); await A.waitForSelector('#data.active'); ok(await A.isHidden('#cloudBox'), 'cloud sync hidden when no Function/KV (static site still works)');
  await A.click('#linkMake'); await A.waitForFunction(() => document.querySelector('#syncCode').value.includes('#/sync/SK1.')); const link = await A.inputValue('#syncCode');
  await A.screenshot({ path: '/workspace/skoha-sync.png', fullPage: true });
  const B = await fresh(); await B.click('#gSkip'); await B.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:8765')); await B.waitForSelector('#data.active');
  ok((await B.inputValue('#syncCode')).startsWith('SK1.'), 'sync link fills the code'); await B.click('#codeLoad'); await B.waitForFunction(() => /Merged/.test(document.querySelector('#codeStatus').textContent));
  ok(await B.evaluate(() => window.__freereps.db().cards.reti?.['x|Nf3']?.reps === 4 && window.__freereps.db().history['2026-11-02'] === 7 && window.__freereps.db().reps.find(r => r.id === 'reti').lines.length > 5), 'progress merged on device B, starter lines restored');
  await A.context().close(); await B.context().close(); }
{ // play it out vs Stockfish after a finished line
  const p = await fresh(); await p.click('#gSkip'); await p.evaluate(() => { const s = window.__freereps.db().settings; s.autoReply = true; s.delay = 150; s.autoNext = false; s.anim = 0; });
  await p.goto('http://localhost:8765/#/opening/italian'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(700);
  for (let i = 0; i < 40; i++) { const c = await cueState(p); if (!c.exp) break; if (!c.arrows.length) { await p.waitForTimeout(250); continue; } await clickSq(p, c.arrows[0].slice(0, 2)); await clickSq(p, c.arrows[0].slice(2)); await p.waitForTimeout(450); }
  await p.waitForSelector('#playBar:not([hidden])'); ok(true, 'Play it out offered when the line ends');
  const fen0 = await p.evaluate(() => window.__freereps.drill.chess.fen()); const n0 = await p.evaluate(() => window.__freereps.drill.chess.history().length);
  await p.selectOption('#playLevel', 'easy'); await p.click('#playOut'); await p.waitForSelector('#playOn:not([hidden])');
  const mine = await p.evaluate(() => { const pl = window.__freereps.play(); return pl.chess.turn() === pl.me; });
  if (!mine) await p.waitForFunction(() => window.__freereps.play().chess.turn() === window.__freereps.play().me, null, { timeout: 15000 });
  const lm = await p.evaluate(() => { const c = window.__freereps.play().chess; const ms = c.moves({ verbose: true }); const q = ms.find(m => m.piece === 'p') || ms[0]; return q.from + q.to; });
  const h0 = await p.evaluate(() => window.__freereps.play().chess.history().length);
  await clickSq(p, lm.slice(0, 2), await p.evaluate(() => window.__freereps.play().me === 'w')); await clickSq(p, lm.slice(2, 4), await p.evaluate(() => window.__freereps.play().me === 'w'));
  await p.waitForFunction(h => window.__freereps.play().chess.history().length >= h + 2, h0, { timeout: 20000 }).then(() => ok(true, 'Stockfish (Web Worker) replied to a real-click move'), () => ok(false, 'Stockfish replied'));
  ok(/Engine played/.test(await p.textContent('#playInfo')), 'engine move reported'); await p.screenshot({ path: '/workspace/skoha-playout.png' });
  await p.click('#backTrain'); await p.waitForTimeout(300);
  ok(await p.evaluate(f => window.__freereps.play() === null && window.__freereps.cg.state.pieces.size > 0 && window.__freereps.drill.chess.fen() === f, fen0) && await p.isVisible('#drillNext'), 'Back to training restores the finished line');
  await p.context().close(); }
{ // tap-to-move confirm on touch
  await mp.evaluate(() => { const s = window.__freereps.db().settings; s.confirm = true; });
  const c = await cueState(mp); const white = await mp.evaluate(() => window.__freereps.cg.state.orientation === 'white');
  const tap = async s => { const bb = await mp.locator('#drillBoard cg-board').boundingBox(); const f = s.charCodeAt(0) - 97, r = +s[1] - 1, w = bb.width / 8; await mp.touchscreen.tap(bb.x + ((white ? f : 7 - f) + .5) * w, bb.y + ((white ? 7 - r : r) + .5) * w); };
  const ply0 = await mp.evaluate(() => window.__freereps.drill.ply);
  await tap(c.arrows[0].slice(0, 2)); await tap(c.arrows[0].slice(2)); await mp.waitForTimeout(250);
  ok(await mp.isVisible('#confirmBar') && await mp.evaluate(p => window.__freereps.drill.ply === p, ply0), 'touch: move waits for confirmation');
  const cb = await mp.locator('#confirmYes').boundingBox(); ok(cb.height >= 48, 'confirm button is a big target');
  await mp.screenshot({ path: '/workspace/skoha-confirm-mobile.png' });
  await mp.tap('#confirmYes'); await mp.waitForTimeout(250); ok(await mp.evaluate(p => window.__freereps.drill.ply === p + 1, ply0), 'touch: confirmed move counts');
  const small = await mp.evaluate(() => [...document.querySelectorAll('#drill button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.id || b.textContent)); ok(small.length === 0, 'touch: all training buttons ≥44px ' + small.join(',')); }
{ // PWA: manifest, icons, service worker, offline reload, prompt update
  const c = await b.newContext({ viewport: { width: 1000, height: 800 } }); const p = await c.newPage();
  await p.goto('http://localhost:8765/'); await p.waitForSelector('#guide:not([hidden])'); await p.click('#gSkip');
  const man = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  ok(man.display === 'standalone' && man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && man.icons.some(i => i.sizes === '192x192'), 'manifest with 192/512/maskable icons');
  ok(await p.evaluate(async () => (await Promise.all(['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'].map(u => fetch(u).then(r => r.ok && r.headers.get('content-type') === 'image/png')))).every(Boolean)), 'icons served');
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  ok(true, 'service worker controls the page');
  await p.waitForTimeout(1500); await c.setOffline(true); await p.reload(); await p.waitForSelector('#whiteList .ocard', { timeout: 15000 }).then(() => ok(true, 'app loads offline from the service worker'), () => ok(false, 'offline load'));
  await p.goto('http://localhost:8765/#/opening/italian'); await p.waitForSelector('#opening.active [data-act=due]'); await p.click('[data-act=due]'); await p.waitForTimeout(700);
  ok((await cueState(p)).arrows.length === 1, 'training works offline');
  await c.setOffline(false);
  // new deploy: change served index.html; network-first means the very next load shows it (no stale cache)
  global.__marker = '<!--deploy-2-->'; await p.goto('http://localhost:8765/#/'); await p.reload(); await p.waitForSelector('#whiteList .ocard');
  ok((await p.content()).includes('deploy-2'), 'new deploy is picked up on the next online load'); global.__marker = '';
  await c.close(); }
// ---- regression: the Réti must work for fresh users AND with data saved by older versions ----
async function retiFlow(tag, seed, vp = { width: 1200, height: 820 }) {
  const c = await b.newContext({ viewport: vp }); const pe = [];
  if (seed) await c.addInitScript(s => { if (!localStorage.getItem('freereps.v2')) localStorage.setItem('freereps.v2', s); }, seed);
  const p = await c.newPage(); p.on('pageerror', e => pe.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForSelector('#whiteList .ocard'); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  const card = p.locator('#whiteList .ocard').filter({ hasText: 'Réti Opening' }); ok(await card.count() === 1, tag + ': exactly one Réti card');
  await card.locator('.chip').first().click(); await p.waitForSelector('#opening.active [data-act=due]');
  await p.click('#opening [data-act=due]'); await p.waitForTimeout(800);
  const d = await p.evaluate(() => ({ name: window.__freereps.drill.rep?.name, first: window.__freereps.drill.line?.[0] }));
  ok(d.name === 'Réti Opening' && d.first === 'Nf3', tag + ': Réti training starts on 1.Nf3 ' + JSON.stringify(d));
  ok((await cueState(p)).arrows.length === 1, tag + ': guide arrow shown');
  await p.click('#helpToggle'); await p.waitForTimeout(150); await p.click('#helpToggle');
  await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForSelector('#line.active'); await p.click('#lnNext'); await p.waitForTimeout(300);
  ok((await p.textContent('#lnNote')).length > 20, tag + ': study page works');
  for (const q of ['Reti', 'Réti', 'Nf3']) { await p.goto('http://localhost:8765/#/'); await p.fill('#search', q); await p.waitForTimeout(200); ok((await p.textContent('#searchResults')).includes('Réti Opening'), tag + ': search ' + q); }
  ok(pe.length === 0, tag + ': no page errors ' + pe.join(' | '));
  const db = await p.evaluate(() => window.__freereps.db()); await c.close(); return db;
}
await retiFlow('fresh');
await retiFlow('fresh mobile', null, { width: 390, height: 844 });
{ const db = await retiFlow('legacy v3 data', fs.readFileSync(root + '/tests/fixtures/legacy-v3.json', 'utf8'));
  const r = db.reps.find(x => x.starter === 'reti'); ok(r.id === 'rh39tz7m' && Object.values(db.cards[r.id] || {}).some(c => c.reps >= 2), 'legacy: old Réti id + progress kept'); }
{ const db = await retiFlow('legacy damaged data', fs.readFileSync(root + '/tests/fixtures/legacy-broken.json', 'utf8'));
  ok(db.reps.filter(x => x.starter === 'reti').length === 1 && Object.values(db.cards).some(cs => cs.k?.reps === 5), 'damaged: duplicate Réti merged, progress kept');
  ok(db.reps.find(x => x.id === 'c9')?.lines.length === 1, 'damaged: custom repertoire repaired'); }
// ---- regression: Réti board must accept moves (click-click, drag, touch) for every past version's saved data ----
async function retiMoves(tag, seed, { touch = false, learnAll = false } = {}) {
  const c = await b.newContext(touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 768 } });
  if (seed) await c.addInitScript(s => { if (!localStorage.getItem('freereps.v2')) localStorage.setItem('freereps.v2', s); }, seed);
  const p = await c.newPage(); const pe = [], warn = []; p.on('pageerror', e => pe.push(e.message)); p.on('console', m => { if (m.type() === 'warning' && m.text().includes('[skoha] board not movable')) warn.push(m.text()); });
  await p.goto('http://localhost:8765/'); await p.waitForSelector('#whiteList .ocard'); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  if (learnAll) await p.evaluate(() => { const db = window.__freereps.db(), r = db.reps.find(x => x.starter === 'reti'), cs = db.cards[r.id] ||= {};
    // every White move of every line learned and not due for a month
    for (const l of r.lines) { const C = window.__freereps.drill.chess.constructor, g = new C(); l.m.forEach((s, i) => { if (i % 2 === 0) cs[g.fen().split(' ').slice(0, 4).join(' ') + '|' + s] = { ease: 2.5, interval: 30, reps: 4, lapses: 0, due: Date.now() + 30 * 864e5 }; g.move(s); }); } });
  await p.locator('#whiteList .ocard').filter({ hasText: 'Réti Opening' }).locator('.chip').first().click(); await p.waitForSelector('#opening.active [data-act=due]');
  await p.click('#opening [data-act=due]'); await p.waitForTimeout(900);
  const results = [];
  for (const how of touch ? ['tap', 'tap'] : ['click', 'drag', 'click']) {
    await p.waitForTimeout(500);
    if (await p.evaluate(() => window.__freereps.drill.waiting)) { await p.click('#navFwd'); await p.waitForTimeout(700); }
    const e = await p.evaluate(() => { const d = window.__freereps.drill; if (!d.line || d.ply >= d.line.length) return null; const C = d.chess.constructor, m = new C(d.chess.fen()).move(d.line[d.ply]); return { from: m.from, to: m.to, ply: d.ply }; });
    if (!e) { results.push('no-move'); break; }
    const white = await p.evaluate(() => window.__freereps.cg.state.orientation === 'white'); const bb = await p.locator('#drillBoard cg-board').boundingBox(), w = bb.width / 8;
    const xy = s => { const f = s.charCodeAt(0) - 97, r = +s[1] - 1; return [bb.x + ((white ? f : 7 - f) + .5) * w, bb.y + ((white ? 7 - r : r) + .5) * w]; };
    const [x1, y1] = xy(e.from), [x2, y2] = xy(e.to);
    if (how === 'click') { await p.mouse.click(x1, y1); await p.mouse.click(x2, y2); }
    else if (how === 'drag') { await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move(x2, y2, { steps: 8 }); await p.mouse.up(); }
    else { await p.touchscreen.tap(x1, y1); await p.touchscreen.tap(x2, y2); if (await p.isVisible('#confirmBar')) await p.tap('#confirmYes'); }
    await p.waitForTimeout(350); results.push(await p.evaluate(pl => window.__freereps.drill.ply > pl, e.ply) ? 'ok' : 'STUCK');
  }
  ok(results.length >= 2 && results.every(r => r === 'ok') && !pe.length && !warn.length, `Réti moves (${touch ? 'touch' : 'click/drag'}) with ${tag}: ${results.join(',')} ${pe.join('|')} ${warn.join('|')}`);
  await c.close();
}
// the reported bug: opening the Train screen (nav or hero) showed Réti selected but never started a session
for (const [tag, f] of [['fresh', null], ['narrator-era data', 'ls-c2e3afe.json']]) for (const via of ['nav [data-nav=drill]', '#heroTrain']) {
  const c = await b.newContext({ viewport: { width: 1366, height: 768 } }); const sd = f && fs.readFileSync(root + '/tests/fixtures/' + f, 'utf8');
  if (sd) await c.addInitScript(s => { if (!localStorage.getItem('freereps.v2')) localStorage.setItem('freereps.v2', s); }, sd);
  const p = await c.newPage(); await p.goto('http://localhost:8765/'); await p.waitForSelector('#whiteList .ocard'); await p.waitForTimeout(300); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  await p.click(via); await p.waitForTimeout(900);
  const st = await p.evaluate(() => ({ rep: window.__freereps.drill.rep?.name, line: !!window.__freereps.drill.line, mov: window.__freereps.cg.state.movable.color, dests: window.__freereps.cg.state.movable.dests?.size }));
  const bb = await p.locator('#drillBoard cg-board').boundingBox(), w = bb.width / 8; await p.mouse.click(bb.x + 6.5 * w, bb.y + 7.5 * w); await p.mouse.click(bb.x + 5.5 * w, bb.y + 5.5 * w); await p.waitForTimeout(350);
  ok(st.rep === 'Réti Opening' && st.line && st.mov === 'white' && st.dests > 0 && await p.evaluate(() => window.__freereps.drill.ply === 1), `Train screen via ${via} (${tag}) starts Réti and 1.Nf3 can be played ${JSON.stringify(st)}`);
  await c.close(); }
const FX = n => fs.existsSync(root + '/tests/fixtures/' + n) ? fs.readFileSync(root + '/tests/fixtures/' + n, 'utf8') : null;
for (const [tag, f] of [['fresh profile', null], ['v2 data', 'ls-d155fcc.json'], ['v3 data', 'ls-08e12b3.json'], ['v4 data', 'ls-238d7c3.json'], ['narrator-era data', 'ls-c2e3afe.json'], ['v2→v3→v4→narrator chain', 'ls-d155fcc-08e12b3-238d7c3-c2e3afe.json'], ['damaged data', 'legacy-broken.json'], ['bad settings', 'legacy-badsettings.json']]) {
  await retiMoves(tag, f && FX(f)); await retiMoves(tag, f && FX(f), { touch: true }); }
await retiMoves('everything learned, nothing due', FX('ls-c2e3afe.json'), { learnAll: true });
{ // ⋯ menu: Reset this opening's progress
  const c = await b.newContext({ viewport: { width: 1200, height: 820 } }); await c.addInitScript(s => { if (!localStorage.getItem('freereps.v2')) localStorage.setItem('freereps.v2', s); }, FX('legacy-v3.json'));
  const p = await c.newPage(); p.on('dialog', d => d.accept()); await p.goto('http://localhost:8765/#/opening/reti'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) await p.click('#gSkip'); await p.waitForSelector('#opening.active .omore');
  await p.click('#opening .omore summary'); await p.click('#opening [data-act=reset]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const db = window.__freereps.db(), r = db.reps.find(x => x.starter === 'reti'); return !db.cards[r.id] || !Object.keys(db.cards[r.id]).length; }), 'Reset this opening\'s progress clears only its cards');
  await c.close(); }
{ const c = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }); const p = await c.newPage();
  await p.goto('http://localhost:8765/#/opening/reti'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) await p.click('#gSkip'); await p.waitForSelector('#opening.active .lineitem');
  const w = await p.evaluate(() => Math.max(...[...document.querySelectorAll('#opening .lineitem')].map(e => e.getBoundingClientRect().right)));
  ok(w <= 360, `phone: opening line list fits the screen (right edge ${Math.round(w)})`);
  await c.close(); await (async () => { const c2 = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const q = await c2.newPage();
    await q.goto('http://localhost:8765/#/opening/reti'); await q.waitForTimeout(1200); if (await q.isVisible('#gSkip')) await q.click('#gSkip'); await q.click('[data-act=due]'); await q.waitForTimeout(800);
    const bb = await q.locator('#drillBoard').boundingBox(); ok(bb.height <= 390, `landscape phone: board fits screen height (${Math.round(bb.height)})`); await c2.close(); })(); }
{ const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage();
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  ok(await p.isHidden('#homeFix'), 'no Fix-mistakes button without mistakes');
  await p.evaluate(() => { const db = window.__freereps.db(), r = db.reps.find(x => x.starter === 'sicilian'); const l = r.lines[0].m; db.cards[r.id] ||= {};
    // fake a recent wrong answer at Black's 2nd move
    import('./core.js').then(m => { const k = m.userCards(l, 'b')[1]; db.cards[r.id][k.key] = m.schedule(undefined, 2); localStorage.setItem('freereps.v2', JSON.stringify(db)); }); });
  await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(1200);
  ok(/Fix my mistakes \(1\)/.test(await p.textContent('#homeFix')), 'home shows Fix my mistakes (1)');
  await p.click('#homeFix'); await p.waitForTimeout(700);
  const st = await p.evaluate(() => { const d = window.__freereps.drill; return { ply: d.ply, len: d.line.length, rep: d.rep.starter, turn: d.chess.turn() }; });
  ok(st.rep === 'sicilian' && st.ply === 3 && st.len === 4 && st.turn === 'b', 'mistake drill jumps straight to the missed position');
  const exp = await p.evaluate(() => window.__freereps.drill.line.at(-1));
  const mv = await p.evaluate(s => import('./vendor/chess.js').then(m => { const c = new m.Chess(window.__freereps.drill.chess.fen()); return c.move(s); }), exp);
  const bb = await p.locator('#drillBoard cg-board').boundingBox(), w = bb.width / 8; const pt = q => [bb.x + (7 - (q.charCodeAt(0) - 97) + .5) * w, bb.y + ((+q[1] - 1) + .5) * w];
  await p.touchscreen.tap(...pt(mv.from)); await p.waitForTimeout(100); await p.touchscreen.tap(...pt(mv.to)); await p.waitForTimeout(500);
  ok(/complete/i.test(await p.textContent('#drillMsg')), 'fixing the spot completes it');
  await p.screenshot({ path: '/workspace/skoha-feat-mistakes.png' });
  await p.goto('http://localhost:8765/#/opening/sicilian'); await p.waitForTimeout(500);
  ok(/Fix mistakes/.test(await p.textContent('#opening [data-act=fix]')), 'opening page has Fix mistakes');
  await c.close(); }
{ const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/#/opening/italian'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  await p.click('.otabs [data-t=traps]'); ok(/Legal/.test(await p.textContent('#oBody')), 'Italian has a Punish this tab with Legal\'s mate');
  await p.screenshot({ path: '/workspace/skoha-feat-traps.png' });
  await p.click('#oBody [data-trap="0"]'); await p.waitForTimeout(600);
  for (let k = 0; k < 40; k++) { const st = await p.evaluate(() => { const d = window.__freereps.drill; return { ply: d.ply, n: d.line.length, fen: d.chess.fen(), turn: d.chess.turn(), busy: d.busy, waiting: d.waiting }; });
    if (st.ply >= st.n) break; if (st.busy) { await p.waitForTimeout(150); continue; }
    if (st.waiting || st.turn !== 'w') { if (await p.isEnabled('#navFwd')) await p.click('#navFwd'); await p.waitForTimeout(250); continue; }
    const mv = await p.evaluate(() => import('./vendor/chess.js').then(m => { const d = window.__freereps.drill; return new m.Chess(d.chess.fen()).move(d.line[d.ply]); }));
    const bb = await p.locator('#drillBoard cg-board').boundingBox(), w = bb.width / 8; const pt = q => [bb.x + (q.charCodeAt(0) - 97 + .5) * w, bb.y + (8 - +q[1] + .5) * w];
    await p.touchscreen.tap(...pt(mv.from)); await p.waitForTimeout(80); await p.touchscreen.tap(...pt(mv.to)); await p.waitForTimeout(400); }
  ok(await p.evaluate(() => window.__freereps.drill.chess.isCheckmate()), 'Legal\'s mate trap played to checkmate on a phone'); ok(!errs.length, 'no page errors in traps ' + errs.join());
  await c.close(); }
{ const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) { await p.click('#gSkip'); await p.goto('http://localhost:8765/#/line/reti/0'); await p.waitForTimeout(600); }
  const bb = await p.locator('#lineBoard cg-board').boundingBox(), w = bb.width / 8; const pt = q => [bb.x + (q.charCodeAt(0) - 97 + .5) * w, bb.y + (8 - +q[1] + .5) * w];
  const tap2 = async (a, z) => { await p.touchscreen.tap(...pt(a)); await p.waitForTimeout(80); await p.touchscreen.tap(...pt(z)); await p.waitForTimeout(350); };
  ok(await p.locator('#lineBoard svg line, #lineBoard svg path').count() > 0, 'study: blue guide arrow for the first move');
  await tap2('e2', 'e4'); ok(/Not this line/.test(await p.textContent('#lnNote')) && await p.evaluate(() => window.__freereps.study?.ply ?? -1) === 0, 'study: wrong move snaps back with the right one named');
  await tap2('g1', 'f3'); ok(/Réti starts flexibly/.test(await p.textContent('#lnNote')), 'study: playing Nf3 on the board advances the line'); ok(await p.evaluate(() => scrollY) === 0, 'study: stepping does not scroll the page on phones');
  await p.click('#lnNext'); await p.waitForTimeout(250); await tap2('c2', 'c4'); ok(/signature Réti move/.test(await p.textContent('#lnNote')), 'study: play the next own move after Next');
  await p.click('#lnPrev'); await p.click('#lnPrev'); await p.click('#lnPrev'); await p.waitForTimeout(200); ok(/Start/.test(await p.textContent('#lnNote')), 'study: Back returns to the start');
  await p.screenshot({ path: '/workspace/skoha-feat-study.png' }); ok(!errs.length, 'no page errors in study ' + errs.join());
  await c.close(); }
{ const c = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1200); if (await p.isVisible('#gSkip')) await p.click('#gSkip');
  await p.click('nav a[data-nav=progress]'); await p.waitForTimeout(400);
  ok(/day streak/.test(await p.textContent('#progressBody')) && await p.locator('.pcol').count() === 14, 'progress page: streak + 14-day chart');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'progress page fits a 360px phone');
  await p.screenshot({ path: '/workspace/skoha-feat-progress.png', fullPage: true }); ok(!errs.length, 'no page errors on progress ' + errs.join());
  await c.close(); }
await b.close(); srv.close(); console.log(fail ? fail + ' FAIL' : 'ALL E2E PASS'); process.exit(fail ? 1 : 0);
