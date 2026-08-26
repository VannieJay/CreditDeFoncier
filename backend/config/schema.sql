-- Users (authentication)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'individual'
                  CHECK (role IN ('individual', 'corporate', 'admin')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles (KYC, credit lines)
CREATE TABLE IF NOT EXISTS profiles (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT,
  client_id           TEXT,
  tax_id              TEXT,
  tier                TEXT,
  kyc_status          TEXT,
  credit_limit        NUMERIC(18,2) NOT NULL DEFAULT 0,
  utilized            NUMERIC(18,2) NOT NULL DEFAULT 0,
  identity_verified   BOOLEAN NOT NULL DEFAULT false,
  business_registered BOOLEAN NOT NULL DEFAULT false,
  liquidity_verified  BOOLEAN NOT NULL DEFAULT false
);

-- Master asset catalog
CREATE TABLE IF NOT EXISTS assets (
  symbol    TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  price     NUMERIC(18,2) NOT NULL DEFAULT 0,
  fee       NUMERIC(18,2) NOT NULL DEFAULT 0,
  available NUMERIC(18,2) NOT NULL DEFAULT 0,
  color     TEXT
);

-- Per-user asset balances
CREATE TABLE IF NOT EXISTS holdings (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_symbol  TEXT NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  balance       NUMERIC(18,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, asset_symbol)
);

-- Transaction ledger
CREATE TABLE IF NOT EXISTS transactions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_symbol TEXT NOT NULL,
  amount       NUMERIC(18,6) NOT NULL,
  address      TEXT NOT NULL,
  usd_value    NUMERIC(18,2) NOT NULL DEFAULT 0,
  fee          NUMERIC(18,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  tx_hash      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_user    ON holdings (user_id);

-- Default asset catalog
INSERT INTO assets (symbol, name, price, fee, available, color) VALUES
  ('ETH',  'Ethereum',       3436,   3.42,  12.50,  '#627EEA'),
  ('BTC',  'Bitcoin',       64950,   1.85,   0.85,  '#F7931A'),
  ('USDT', 'Tether TRC-20',     1,   0.85, 145000,  '#26A17B')
ON CONFLICT (symbol) DO NOTHING;