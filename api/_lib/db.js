// Shared credential store for every brand, every platform.
//
// Uses @neondatabase/serverless, the driver Vercel's native Postgres
// integration is built on (Vercel Postgres now runs on Neon under the
// hood). Reads DATABASE_URL, which Vercel injects automatically the
// moment you attach a Postgres store to this project (Project -> Storage
// -> Create Database -> Postgres, powered by Neon). Nothing else to
// configure.
//
// This file is the actual fix for the "Shopify only lets us connect one
// store at a time" problem: instead of a single global env var holding one
// token, every brand's token for every platform lives in its own row here,
// looked up by (brand_id, platform) on each request. Nothing gets revoked
// when you work on a different brand because nothing is shared.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function listBrands() {
  const rows = await sql`SELECT id, name, currency, created_at FROM brands ORDER BY name`;
  return rows;
}

export async function getBrand(brandId) {
  const rows = await sql`SELECT id, name, currency, created_at FROM brands WHERE id = ${brandId}`;
  return rows[0] || null;
}

export async function upsertBrand(id, name, currency = 'PKR') {
  const rows = await sql`
    INSERT INTO brands (id, name, currency)
    VALUES (${id}, ${name}, ${currency})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, currency = EXCLUDED.currency
    RETURNING id, name, currency, created_at
  `;
  return rows[0];
}

// Returns { access_token, refresh_token, account_id, extra, expires_at } or null
export async function getCredential(brandId, platform) {
  const rows = await sql`
    SELECT access_token, refresh_token, account_id, extra, expires_at
    FROM credentials
    WHERE brand_id = ${brandId} AND platform = ${platform}
  `;
  return rows[0] || null;
}

export async function upsertCredential(brandId, platform, { accessToken, refreshToken, accountId, extra = {}, expiresAt = null }) {
  const rows = await sql`
    INSERT INTO credentials (brand_id, platform, access_token, refresh_token, account_id, extra, expires_at, updated_at)
    VALUES (${brandId}, ${platform}, ${accessToken}, ${refreshToken}, ${accountId}, ${JSON.stringify(extra)}, ${expiresAt}, now())
    ON CONFLICT (brand_id, platform) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, credentials.refresh_token),
      account_id    = EXCLUDED.account_id,
      extra         = EXCLUDED.extra,
      expires_at    = EXCLUDED.expires_at,
      updated_at    = now()
    RETURNING id
  `;
  return rows[0];
}

export async function deleteCredential(brandId, platform) {
  await sql`DELETE FROM credentials WHERE brand_id = ${brandId} AND platform = ${platform}`;
}

// Connection matrix for one brand across all three platforms — powers the
// dashboard's home tab / gap flags without three round trips.
export async function getConnectionMatrix(brandId) {
  const rows = await sql`
    SELECT platform, account_id, (access_token IS NOT NULL) AS connected, updated_at
    FROM credentials
    WHERE brand_id = ${brandId}
  `;
  const matrix = { shopify: { connected: false }, meta: { connected: false }, google: { connected: false } };
  for (const r of rows) {
    matrix[r.platform] = { connected: r.connected, accountId: r.account_id, updatedAt: r.updated_at };
  }
  return matrix;
}
