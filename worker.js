// Skoha Worker: serves the static site (assets) and an optional /api/sync endpoint.
// Cloud sync works only when a KV namespace is bound as SYNC (see wrangler.jsonc / README); otherwise /api/sync
// answers 501 and the app hides cloud sync. The client sends only a SHA-256 hash of the user's sync key as the id.
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const MAX = 900 * 1024;
export async function handleSync(request, env) {
  if (!env.SYNC) return J({ enabled: false, error: 'KV namespace SYNC is not bound' }, 501);
  const url = new URL(request.url), id = url.searchParams.get('id') || '';
  if (request.method === 'GET' && !id) return J({ enabled: true });
  if (!/^[a-f0-9]{64}$/.test(id)) return J({ error: 'bad id' }, 400);
  if (request.method === 'GET') { const v = await env.SYNC.get('u:' + id); return v ? new Response(v, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }) : J({ error: 'not found' }, 404); }
  if (request.method === 'PUT') {
    const body = await request.text();
    if (body.length > MAX || !body.startsWith('SK1.')) return J({ error: 'payload too large or invalid' }, 413);
    await env.SYNC.put('u:' + id, body, { expirationTtl: 60 * 60 * 24 * 400 }); return J({ ok: true, at: Date.now() });
  }
  return J({ error: 'method not allowed' }, 405);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
