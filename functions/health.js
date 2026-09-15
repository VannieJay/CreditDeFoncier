// Cloudflare Pages Function route: /health -> Render /health.
// This keeps the documented keep-alive URL (https://creditdefoncier.com/health)
// working while the API itself lives on the Render free service.
import { proxyToApi } from './_shared/proxy.js';

export async function onRequest(context) {
  return proxyToApi(context.request, '/health', '');
}