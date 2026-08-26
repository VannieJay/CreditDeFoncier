// Live asset prices via CoinGecko public API (no key required).
// In-memory cache with TTL; on failure the last known prices are kept.

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,tether&vs_currencies=usd';

const SYMBOL_TO_ID = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDT: 'tether',
};

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const FETCH_TIMEOUT_MS = 8000;

const cache = {
  prices: null, // { ETH: 3436.12, ... }
  updatedAt: 0,
  inflight: null,
};

function isStale() {
  return !cache.prices || Date.now() - cache.updatedAt > CACHE_TTL_MS;
}

async function fetchFromCoinGecko() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(COINGECKO_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
    const data = await res.json();
    return {
      ETH: data.ethereum?.usd ?? null,
      BTC: data.bitcoin?.usd ?? null,
      USDT: data.tether?.usd ?? 1,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Persist fetched prices into the assets table (best-effort, non-fatal).
async function persistPrices(prices) {
  const pool = require('../config/db');
  for (const [symbol, usd] of Object.entries(prices)) {
    if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
      await pool.query('UPDATE assets SET price = $1 WHERE symbol = $2', [usd, symbol]);
    }
  }
}

async function refreshPrices() {
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    try {
      const prices = await fetchFromCoinGecko();
      cache.prices = { ...(cache.prices || {}), ...prices };
      cache.updatedAt = Date.now();
      try {
        await persistPrices(cache.prices);
      } catch (_dbErr) {
        // Prices still served from memory even if persistence fails.
      }
      return cache.prices;
    } catch (err) {
      console.warn('[priceService] refresh failed, serving cached prices:', err.message);
      return cache.prices; // may be null on first-ever failure
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

// Returns cached prices; refreshes in background when stale.
async function getPrices() {
  if (isStale()) refreshPrices(); // fire-and-forget
  return cache.prices;
}

// Awaits fresh prices (used by /health hook and explicit refresh).
async function ensureFreshPrices() {
  if (isStale()) return refreshPrices();
  return cache.prices;
}

module.exports = { getPrices, ensureFreshPrices };