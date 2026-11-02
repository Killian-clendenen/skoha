import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); const T = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.wav': 'audio/wav', '.pgn': 'text/plain' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8765);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('http://localhost:8765/'); await pg.waitForSelector('#starters .featured');
ok(await pg.textContent('#starters .card:first-child b').then(t => t.includes('Réti')), 'Réti featured first');
await pg.click('#starters .featured button'); await pg.waitForSelector('#replist .card');
ok((await pg.textContent('#replist')).includes('43 lines'), 'Réti added with 43 lines');
await pg.evaluate(() => { const s = window.__freereps.db().settings; s.delay = 150; s.anim = 120; s.autoNext = false; });
await pg.click('#replist .card button.primary'); await pg.waitForTimeout(400);
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
await pg.click('#modes [data-mode=line]'); await pg.waitForTimeout(500); await mv('a2', 'a3'); await pg.waitForTimeout(300);
const cards = await pg.evaluate(() => Object.values(Object.values(window.__freereps.db().cards)[0]));
ok(cards.some(c => c.lapses === 1), 'review mistake recorded as SM-2 lapse');
await pg.click('#modes [data-mode=mistakes]'); await pg.waitForTimeout(400);
ok((await pg.textContent('#drillInfo')).match(/line 1\/\d+/), 'mistakes-only mode queues lines containing the missed move');
await mv('g1', 'f3'); await pg.waitForTimeout(300);
await pg.screenshot({ path: root + '/screenshot.png' });
await pg.click('nav [data-tab=settings]'); await pg.click('#testSounds'); await pg.waitForTimeout(400);
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
// mobile
const mp = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await mp.goto('http://localhost:8765/');
await mp.waitForSelector('#starters .featured'); const bw = await mp.evaluate(() => document.documentElement.scrollWidth);
ok(bw <= 390, 'mobile no horizontal overflow (' + bw + ')');
await b.close(); srv.close(); console.log(fail ? fail + ' FAIL' : 'ALL E2E PASS'); process.exit(fail ? 1 : 0);
