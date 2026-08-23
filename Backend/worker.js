// Clash Royale API proxy for the GitHub Pages clan-war dashboard.
// Keep CR_API_KEY as a Cloudflare Worker secret; it is never exposed to the browser.

const CR_PROXY_BASE = 'https://proxy.royaleapi.dev/v1';

const ALLOWED_ORIGINS = new Set([
  'https://pepimepi.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    // Handle browser CORS preflight requests
    if (request.method === 'OPTIONS') {
      return corsResponse(
        request,
        new Response(null, { status: 204 })
      );
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return corsResponse(
        request,
        new Response('Method not allowed', { status: 405 })
      );
    }

    // Reject websites other than the allowed GitHub Pages site
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return corsResponse(
        request,
        jsonError('Origin not allowed.', 403)
      );
    }

    const url = new URL(request.url);

    // Only proxy URLs beginning with /api/
    if (!url.pathname.startsWith('/api/')) {
      return corsResponse(
        request,
        new Response('Not found', { status: 404 })
      );
    }

    // Make sure the Clash Royale API key exists
    if (!env.CR_API_KEY) {
      return corsResponse(
        request,
        jsonError(
          'Worker is missing CR_API_KEY secret.',
          500
        )
      );
    }

    /*
      Example:

      Browser requests:

      https://royale-war-proxy.clanwarbg.workers.dev/api/clans/%238CC822R/members

      Worker sends:

      https://proxy.royaleapi.dev/v1/clans/%238CC822R/members
    */

    const crPath = url.pathname.slice('/api/'.length);

    const targetUrl =
      `${CR_PROXY_BASE}/${crPath}${url.search}`;

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${env.CR_API_KEY}`,
          Accept: 'application/json'
        }
      });

      const body = await upstream.text();

      return corsResponse(
        request,
        new Response(body, {
          status: upstream.status,
          headers: {
            'Content-Type':
              upstream.headers.get('Content-Type') ||
              'application/json'
          }
        })
      );

    } catch (err) {
      return corsResponse(
        request,
        jsonError(
          `Upstream fetch failed: ${err.message}`,
          502
        )
      );
    }
  }
};


/*
  Creates a JSON error response.
*/
function jsonError(message, status) {
  return new Response(
    JSON.stringify({
      error: message
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}


/*
  Adds the necessary CORS headers so that the
  GitHub Pages website can call the Worker.
*/
function corsResponse(request, response) {
  const origin = request.headers.get('Origin');

  const headers = new Headers(response.headers);

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set(
      'Access-Control-Allow-Origin',
      origin
    );
  } else if (!origin) {
    headers.set(
      'Access-Control-Allow-Origin',
      'https://pepimepi.github.io'
    );
  }

  headers.set(
    'Vary',
    'Origin'
  );

  headers.set(
    'Access-Control-Allow-Methods',
    'GET, OPTIONS'
  );

  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  headers.set(
    'Cache-Control',
    'no-store'
  );

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}