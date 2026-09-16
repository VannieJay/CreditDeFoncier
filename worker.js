// Cloudflare Worker entry point (Workers Static Assets model).
//
// wrangler.jsonc routes ONLY /api/* and /health to this script
// ("run_worker_first"); every other request is served straight from the
// frontend/ static assets by the Cloudflare CDN. Anything the worker sees that
// is not an API path falls through to the asset server as well.
//
// The frontend keeps calling relative /api/... paths, so the browser stays
// same-origin and never performs a CORS preflight. Origin/Referer are stripped
// before the upstream call because the API's CORS middleware only trusts hosts
// listed in its CORS_ORIGINS env var (currently the retired OCI domain) - with
// no Origin header the API treats the call as a server-to-server request and
// allows it.
const API_ORIGIN = 'https://creditdefoncier.onrender.com';

// Security headers applied to proxied API responses (mirrors the old
// frontend/_headers, which is a Pages-only feature).
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

async function proxyToApi(request, pathname, search) {
  const target = new URL(pathname + (search || ''), API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('origin');         // avoid the API CORS allow-list entirely
  headers.delete('referer');
  headers.delete('host');           // fetch derives Host from the target URL
  headers.delete('content-length'); // body is re-encoded below

  const init = { method: request.method, headers, redirect: 'manual' };

  // The JSON API never uploads files, so buffering the body is safe and avoids
  // streaming-duplex edge cases.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const upstream = await fetch(target.toString(), init);

  // Drop hop-by-hop / already-consumed framing headers before handing the
  // response back to the edge.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    responseHeaders.set(k, v);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return proxyToApi(request, '/health', '');
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyToApi(request, url.pathname, url.search);
    }

    // Defensive fallback: with "run_worker_first" limited to /api/* and
    // /health this should never trigger, but serve assets rather than error.
    return env.ASSETS.fetch(request);
  },
};
