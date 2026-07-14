// Brand-aware Google Analytics 4 (Data API) endpoint. Same per-brand
// credential pattern as the other platform files. This is the
// authoritative source for "sales/sessions by traffic driver" — GA4's
// sessionDefaultChannelGroup is Google's own cross-channel attribution,
// a stronger signal than the Shopify-referrer heuristic used as a
// stopgap in the Command Center's channel attribution panel.

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
  const presets = { last_7d: '7daysAgo', last_14d: '14daysAgo', last_28d: '28daysAgo', last_30d: '30daysAgo', this_month: '30daysAgo' };
  return { startDate: presets[preset] || '28daysAgo', endDate: 'today' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { brand, action = 'channels', preset = 'last_28d', since, until } = req.query;
  if (!brand) return res.status(400).json({ error: 'Missing ?brand=<id>' });

  const cred = await getCredential(brand, 'ga4');
  if (!cred || !cred.refresh_token) {
    return res.status(409).json({ error: 'not_connected', message: `No GA4 connection for brand "${brand}". Visit /api/oauth?platform=ga4&brand=${brand}&propertyId=XXXXXXXXX` });
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(cred.refresh_token);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const propertyId = cred.account_id;
  const { startDate, endDate } = dateRange(preset, since, until);

  try {
    if (action === 'channels') {
      const body = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'totalRevenue' }],
        orderBys: [{ metric: { metricName: 'totalRevenue' }, desc: true }],
      };
      const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(400).json(data);

      const rows = (data.rows || []).map(row => ({
        channel: row.dimensionValues[0].value,
        sessions: parseFloat(row.metricValues[0].value || 0),
        conversions: parseFloat(row.metricValues[1].value || 0),
        revenue: parseFloat(row.metricValues[2].value || 0),
      }));
      return res.status(200).json({ rows, dateRange: { startDate, endDate } });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
