// Cloudflare Pages Function route: /api/* -> Render Express API.
// File-based catch-all routing ([[path]]) keeps the original path and query
// string intact, so Express routing (e.g. app.use('/api/auth', ...)) just works.
import { proxyToApi } from '../_shared/proxy.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  return proxyToApi(context.request, url.pathname, url.search);
}