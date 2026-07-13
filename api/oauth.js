// Multi-brand, multi-platform OAuth entrypoint.
//
// Usage (all query params on the FIRST hit, before any redirect happens):
//   /api/oauth?platform=shopify&brand=julke&shop=julke.myshopify.com
//   /api/oauth?platform=meta&brand=qalb&accountId=act_1565672874285024
//   /api/oauth?platform=google&brand=julke&customerId=6801928800&loginCustomerId=2033434429
//
// The platform + brand + any extra ids are packed into the OAuth `state`
// param, so when the provider redirects back with ?code=..., this same
// handler knows exactly which brand/platform row to write the resulting
// token into. That row-per-brand-per-platform model (see api/_lib/db.js)
// is what lets you connect julke's Shopify AND qalb's Meta AND anything
// else at the same time, permanently, with nothing getting revoked.

import { upsertCredential, upsertBrand } from './_lib/db.js';

const APP_URL = process.env.APP_URL || 'https://ads-os-dusky.vercel.app';
const REDIRECT_URI = `${APP_URL}/api/oauth`;

function encodeState(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeState(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

function successPage(brand, platform, extra = '') {
  return `
    <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#fff;">
      <h2>Connected</h2>
      <p><strong>${platform}</strong> is now linked to brand <strong>${brand}</strong>.</p>
      ${extra}
      <p style="color:#888;margin-top:20px;">You can close this tab and go back to the dashboard.</p>
    </body></html>`;
}
function errorPage(err) {
  return `<pre style="font-family:monospace;padding:40px;background:#0a0a0a;color:#ff6666;">${String(err)}</pre>`;
}

export default async function handler(req, res) {
  const { code, state } = req.query;

  // ---- Step 2: provider redirected back with a code ----
  if (code && state) {
    let parsed;
    try { parsed = decodeState(state); } catch { return res.status(400).send(errorPage('Bad state param')); }
    const { platform, brand } = parsed;

    try {
      await upsertBrand(brand, parsed.brandName || brand);

      if (platform === 'shopify') {
        const { shop } = parsed;
        const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.SHOPIFY_CLIENT_ID,
            client_secret: process.env.SHOPIFY_CLIENT_SECRET,
            code,
          }),
        });
        const data = await r.json();
        if (!data.access_token) return res.status(400).send(errorPage(JSON.stringify(data)));

        await upsertCredential(brand, 'shopify', { accessToken: data.access_token, accountId: shop });
        return res.status(200).send(successPage(brand, 'Shopify', `<p>Store: ${shop}</p>`));
      }

      if (platform === 'meta') {
        const { accountId } = parsed;
        // Exchange code -> short-lived user token
        const shortR = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?` + new URLSearchParams({
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        }));
        const shortData = await shortR.json();
        if (!shortData.access_token) return res.status(400).send(errorPage(JSON.stringify(shortData)));

        // Exchange short-lived -> long-lived (~60 day) token
        const longR = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?` + new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          fb_exchange_token: shortData.access_token,
        }));
        const longData = await longR.json();
        const token = longData.access_token || shortData.access_token;
        const expiresAt = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000).toISOString() : null;

        await upsertCredential(brand, 'meta', { accessToken: token, accountId, expiresAt });
        return res.status(200).send(successPage(brand, 'Meta', `<p>Ad account: ${accountId}</p>`));
      }

      if (platform === 'google') {
        const { customerId, loginCustomerId } = parsed;
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });
        const data = await r.json();
        if (!data.refresh_token && !data.access_token) return res.status(400).send(errorPage(JSON.stringify(data)));

        await upsertCredential(brand, 'google', {
          accessToken: data.access_token,
          refreshToken: data.refresh_token, // only present on first consent — that's why we force prompt=consent below
          accountId: customerId,
          extra: { loginCustomerId: loginCustomerId || null },
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
        });
        return res.status(200).send(successPage(brand, 'Google Ads', `<p>Customer ID: ${customerId}</p>`));
      }

      return res.status(400).send(errorPage(`Unknown platform: ${platform}`));
    } catch (err) {
      return res.status(500).send(errorPage(err.message));
    }
  }

  // ---- Step 1: kick off the provider's OAuth dialog ----
  const { platform, brand, shop, accountId, customerId, loginCustomerId, brandName } = req.query;
  if (!platform || !brand) {
    return res.status(400).send(errorPage('Missing required ?platform= and ?brand= query params'));
  }
  const newState = encodeState({ platform, brand, shop, accountId, customerId, loginCustomerId, brandName });

  if (platform === 'shopify') {
    if (!shop) return res.status(400).send(errorPage('Missing ?shop=yourstore.myshopify.com'));
    const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';
    const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      scope: scopes,
      redirect_uri: REDIRECT_URI,
      state: newState,
    });
    return res.redirect(authUrl);
  }

  if (platform === 'meta') {
    if (!accountId) return res.status(400).send(errorPage('Missing ?accountId=act_XXXXXXXXXX'));
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` + new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'ads_management,ads_read,business_management',
      state: newState,
    });
    return res.redirect(authUrl);
  }

  if (platform === 'google') {
    if (!customerId) return res.status(400).send(errorPage('Missing ?customerId=XXXXXXXXXX (Google Ads customer id, no dashes)'));
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/adwords',
      access_type: 'offline',
      prompt: 'consent', // forces a refresh_token every time, otherwise Google only sends it on the very first consent
      state: newState,
    });
    return res.redirect(authUrl);
  }

  return res.status(400).send(errorPage(`Unknown platform: ${platform}`));
}
