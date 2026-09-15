// Cloudflare Pages Function helper - proxies API requests to the Render-hosted
// Express app (creditdefoncier.onrender.com).
//
// The frontend keeps calling relative /api/... paths, so the browser stays
// same-origin and never performs a CORS preflight. Origin/Referer are stripped
// before the upstream call because the API's CORS middleware only trusts hosts
// listed in its CORS_ORIGINS env var (currently the retired OCI domain) - with no
// Origin header the API treats the call as a server-to-server request and allows it.
const API_ORIGIN = 'https://creditdefoncier.onrender.com';

export async function proxyToApi(request, pathname, search) {
  const target = new URL(pathname + (search || ''), API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('origin');        // avoid the API CORS allow-list entirely
  headers.delete('referer');
  headers.delete('host');          // fetch derives Host from the target URL
  headers.delete('content-length'); // body is re-encoded below

  const init = { method: request.method, headers, redirect: 'manual' };

  // The JSON API never uploads files, so buffering the body is safe and avoids
  // streaming-duplex edge cases.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const upstream = await fetch(target.toString(), init);

  // Drop hop-by-hop / already-consumed framing headers before handing the
  // response back to Pages.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}