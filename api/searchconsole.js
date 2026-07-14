// Brand-aware Google Search Console endpoint. Same per-brand credential
// pattern as meta.js/google.js/shopify.js: every call takes ?brand=<id>,
// looks up that brand's stored refresh_token + site URL, exchanges the
// refresh token for a fresh access token, then queries Search Console's
// searchAnalytics API directly.

import { getCredential } from './_lib/db.js';

async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function dateRange(preset, since, until) {
  if (since && until) return { startDate: since, endDate: until };
  const now = new Date();
  const pad = (d) => d.toISOString().split('T')[0];
  // Search Console data typically lags ~2-3 days behind real-time.
  const end = new Date(now.getTime() - 2 * 86400000);
  const presets = {
    last_7d: 7, last_14d: 14, last_28d: 28, last_30d: 30,
  };
  const days = presets[preset] || 28;
  const start = new Date(end.getTime() - days * 86400000);
  return { startDate: pad(start), endDate: pad(end) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { brand, action = 'queries', preset = 'last_28d', since, until, dimension = 'query' } = req.query;
  if (!brand) return res.status(400).json({ error: 'Missing ?brand=<id>' });

  const cred = await getCredential(brand, 'searchConsole');
  if (!cred || !cred.refresh_token) {
    return res.status(409).json({ error: 'not_connected', message: `No Search Console connection for brand "${brand}". Visit /api/oauth?platform=searchConsole&brand=${brand}&siteUrl=sc-domain:yoursite.com` });
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(cred.refresh_token);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const siteUrl = cred.account_id;
  const { startDate, endDate } = dateRange(preset, since, until);

  try {
    if (action === 'queries' || action === 'pages') {
      const body = {
        startDate, endDate,
        dimensions: [action === 'pages' ? 'page' : 'query'],
        rowLimit: 25,
      };
      const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(400).json(data);

      const rows = (data.rows || []).map(row => ({
        key: row.keys[0], clicks: row.clicks, impressions: row.impressions,
        ctr: row.ctr * 100, position: row.position,
      }));
      return res.status(200).json({ rows, dateRange: { startDate, endDate } });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
