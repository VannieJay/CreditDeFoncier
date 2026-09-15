// Cloudflare Worker (free plan) - keep-alive for the Render free web service.
//
// Render free instances spin down after 15 minutes without traffic, so the first
// visitor after a quiet period waits ~30-60s. This Worker pings /health every
// 10 minutes via a Cron Trigger (144 requests/day of the 100k/day free allowance),
// keeping the API warm and exercising the whole chain (Pages -> Function -> Render -> Supabase).
//
// Deploy (free, either way):
//   A) Dashboard: Workers & Pages -> Create -> Worker -> name it
//      creditdefoncier-keepalive -> Deploy -> Edit code -> paste this file -> Deploy
//      -> Settings -> Triggers -> Cron Triggers -> add:  */10 * * * *
//   B) CLI:  cd cloudflare ; npx wrangler deploy
//
// Manual check: GET https://<worker>.workers.dev/ returns the latest ping result.

const DEFAULT_HEALTH_URL = 'https://creditdefoncier.com/health';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env));
  },

  async fetch(request, env) {
    const result = await ping(env);
    return new Response(JSON.stringify(result, null, 2) + '\n', {
      status: result.ok ? 200 : 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};

async function ping(env) {
  const url = (env && env.HEALTH_URL) || DEFAULT_HEALTH_URL;
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'creditdefoncier-keepalive/1.0' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      ms: Date.now() - started,
      at: new Date().toISOString(),
      body: body.slice(0, 200),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      ms: Date.now() - started,
      at: new Date().toISOString(),
      error: String((err && err.message) || err),
    };
  }
}