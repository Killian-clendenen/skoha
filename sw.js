// Skoha service worker: offline use + home-screen install, without a stale-cache trap.
// App code/content (html, js, css, json, pgn) is NETWORK-FIRST, so a new deploy shows up on the next load whenever
// the device is online; the cache is only a fallback for offline. Big immutable assets (vendor, sounds, icons) are
// cache-first. Bump VERSION to drop old caches; skipWaiting + clients.claim activate a new worker immediately.
const VERSION = 'skoha-20261102n';
const SHELL = ['./', 'index.html', 'app.js', 'core.js', 'kb.js', 'narrator.js', 'engine.js', 'style.css', 'manifest.webmanifest',
  'vendor/chess.js', 'vendor/chessground.min.js', 'vendor/chessground.base.css', 'vendor/chessground.brown.css', 'vendor/chessground.cburnett.css',
  'vendor/stockfish/stockfish-19-lite-single.js', 'vendor/stockfish/stockfish-19-lite-single.wasm',
  'sounds/move.wav', 'sounds/capture.wav', 'sounds/castle.wav', 'sounds/check.wav', 'sounds/error.wav', 'sounds/complete.wav',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'starters/index.json'];
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))));
  try { const idx = await (await fetch('starters/index.json', { cache: 'reload' })).json(); await Promise.allSettled(idx.map(s => c.add(new Request('starters/' + s.file, { cache: 'reload' })))); } catch {}
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
const CACHE_FIRST = /\/(vendor|sounds|icons)\//;
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (CACHE_FIRST.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone())); return r; })));
    return;
  }
  e.respondWith((async () => {
    try {
      const r = await fetch(req, { cache: 'no-cache' });
      if (r.ok) { const c = await caches.open(VERSION); c.put(url.pathname === '/' || req.mode === 'navigate' ? 'index.html' : new Request(url.pathname.replace(/^\//, ''), {}), r.clone()); }
      return r;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await caches.match('index.html')) || await caches.match(url.pathname.replace(/^\//, ''), { ignoreSearch: true });
      return hit || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
    }
  })());
});
