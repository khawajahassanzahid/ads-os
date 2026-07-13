-- Ads OS -- multi-tenant schema
-- Run this once against your Vercel Postgres (or any Postgres) database.
-- In Vercel: Project -> Storage -> Create Database -> Postgres, then open the
-- "Query" tab in the Vercel dashboard and paste this whole file, or run it
-- with `psql "$POSTGRES_URL" -f sql/schema.sql`.

CREATE TABLE IF NOT EXISTS brands (
  id          TEXT PRIMARY KEY,          -- short slug, e.g. 'julke', 'qalb'
  name        TEXT NOT NULL,             -- display name, e.g. 'JULKE'
  currency    TEXT DEFAULT 'PKR',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- One row per (brand, platform). This is the piece that was missing --
-- it's what lets the app hold a Shopify token for julke AND a separate
-- Shopify token for qalb (or any brand) at the same time, forever, with
-- no "switching shops revokes the last one" problem. Each brand's
-- credentials sit in their own row and get looked up by brand_id +
-- platform on every request.
CREATE TABLE IF NOT EXISTS credentials (
  id             SERIAL PRIMARY KEY,
  brand_id       TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('shopify', 'meta', 'google')),
  access_token   TEXT,                   -- Shopify token / Meta long-lived token / Google access token (short-lived, refreshed on the fly)
  refresh_token  TEXT,                   -- Google only (Shopify/Meta tokens don't expire the same way)
  account_id     TEXT,                   -- shop domain / Meta ad account id (act_...) / Google customer id
  extra          JSONB DEFAULT '{}',     -- misc: Meta page id, Google login-customer-id (MCC), etc.
  expires_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_credentials_brand ON credentials(brand_id);

INSERT INTO brands (id, name, currency) VALUES ('julke', 'JULKE', 'PKR')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO brands (id, name, currency) VALUES ('qalb', 'Qalb', 'PKR')
  ON CONFLICT (id) DO NOTHING;
