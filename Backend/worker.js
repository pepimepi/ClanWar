// ---------------------------------------------------------------------
// Clash Royale war-data proxy (Cloudflare Worker)
//
// Why this exists: api.clashroyale.com locks each key to one fixed IP.
// Cloudflare Workers don't have a fixed outbound IP, so calling the
// official API directly from here would get rejected with a 403.
// RoyaleAPI runs a static-IP relay (proxy.royaleapi.dev) made exactly
// for serverless setups like this one — you whitelist THEIR IP on your
// key instead of your own, and this Worker forwards requests through it.
//
// Your real API key never reaches the browser. It's stored as a
// Worker secret and attached to the outgoing request here.
// ---------------------------------------------------------------------

const CR_PROXY_BASE = 'https://proxy.royaleapi.dev/v1';

// Lock this down to your actual site once it's live, e.g.
// 'https://yourname.github.io'. '*' is fine while you're testing locally.
const ALLOWED_ORIGIN = 'https://pepimepi.github.io/ClanWar/';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCORS(new Response(null, { status: 204 }));
    }

    if (request.method !== 'GET') {
      return withCORS(new Response('Method not allowed', { status: 405 }));
    }

    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return withCORS(new Response('Not found', { status: 404 }));
    }

    if (!env.CR_API_KEY) {
      return withCORS(jsonError('Worker is missing CR_API_KEY secret.', 500));
    }

    // /api/clans/%238CC822R/riverracelog  ->  clans/%238CC822R/riverracelog
    const crPath = url.pathname.slice('/api/'.length);
    const targetUrl = `${CR_PROXY_BASE}/${crPath}${url.search}`;

    let crResponse;
    try {
      crResponse = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${env.CR_API_KEY}`,
          Accept: 'application/json'
        }
      });
    } catch (err) {
      return withCORS(jsonError(`Upstream fetch failed: ${err.message}`, 502));
    }

    const body = await crResponse.text();

    return withCORS(new Response(body, {
      status: crResponse.status,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function withCORS(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    headers
  });
}
