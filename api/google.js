// Brand-aware Google Ads endpoint — the piece that was completely missing
// from the original app. Same per-brand credential pattern as shopify.js
// and meta.js: every call takes ?brand=<id>, looks up that brand's stored
// Google refresh_token + customer id (api/_lib/db.js), exchanges the
// refresh token for a fresh access token on the fly, then talks to the
// real Google Ads REST API directly (no Zapier / Supermetrics dependency).
//
// Mirrors the "live campaigns only" pattern already proven to work in the
// Cowork dashboard: pull a wide window, filter client-side to
// cost_micros > 0 so 30+ dead legacy campaigns don't drown out the one
// campaign that's actually spending.

import { getCredential, upsertCredential } from './_lib/db.js';

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v24';

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

function dateRangeClause(preset, since, until) {
  if (since && until) return `segments.date BETWEEN '${since}' AND '${until}'`;
  const presetMap = {
    today: 'TODAY',
    yesterday: 'YESTERDAY',
    last_7d: 'LAST_7_DAYS',
    last_14d: 'LAST_14_DAYS',
    last_30d: 'LAST_30_DAYS',
    this_month: 'THIS_MONTH',
    last_month: 'LAST_MONTH',
  };
  return `segments.date DURING ${presetMap[preset] || 'LAST_30_DAYS'}`;
}

async function gaqlSearch({ customerId, loginCustomerId, accessToken, query }) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
  };
  if (loginCustomerId) headers['login-customer-id'] = String(loginCustomerId).replace(/-/g, '');

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query, pageSize: 200 }) });

  // Google Ads API normally returns JSON even on error, but a request that
  // never reaches the Ads API backend (bad auth at the gateway layer, API
  // not enabled, wrong project, etc.) can come back as an HTML error page
  // instead. r.json() on that throws a generic "Unexpected token '<'"
  // SyntaxError that hides the real problem — read as text first so the
  // actual Google error (or HTML) is visible in the thrown message.
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }

  if (!r.ok || !data) {
    const detail = data ? JSON.stringify(data) : raw.slice(0, 500);
    throw new Error(`Google Ads API ${r.status} ${r.statusText}: ${detail}`);
  }
  return data.results || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isPost = req.method === 'POST';
  const brand = req.query.brand || (isPost && req.body && req.body.brand);
  if (!brand) return res.status(400).json({ error: 'Missing brand (query ?brand= for GET, body.brand for POST)' });

  const cred = await getCredential(brand, 'google');
  if (!cred || !cred.refresh_token) {
    return res.status(409).json({ error: 'not_connected', message: `No Google Ads connection for brand "${brand}". Visit /api/oauth?platform=google&brand=${brand}&customerId=XXXXXXXXXX` });
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(cred.refresh_token);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const customerId = String(cred.account_id).replace(/-/g, '');
  const loginCustomerId = cred.extra && cred.extra.loginCustomerId;
  const { action = 'campaigns', preset = 'last_30d', since, until, liveOnly } = req.query;

  try {
    // CAMPAIGN REPORT — defaults to live-spending campaigns only
    if (action === 'campaigns') {
      const dateClause = dateRangeClause(preset, since, until);
      const query = `
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
               metrics.cost_micros, metrics.clicks, metrics.impressions,
               metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE ${dateClause}
        ORDER BY metrics.cost_micros DESC
      `.trim();

      const rows = await gaqlSearch({ customerId, loginCustomerId, accessToken, query });

      const campaigns = rows.map(r => {
        const m = r.metrics || {};
        const costMicros = parseFloat(m.costMicros || 0);
        const cost = costMicros / 1e6;
        const clicks = parseFloat(m.clicks || 0);
        const impressions = parseFloat(m.impressions || 0);
        const conversions = parseFloat(m.conversions || 0);
        const conversionsValue = parseFloat(m.conversionsValue || 0);
        return {
          id: r.campaign.id,
          name: r.campaign.name,
          status: r.campaign.status,
          type: r.campaign.advertisingChannelType,
          cost,
          clicks,
          impressions,
          conversions,
          conversionsValue,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? cost / clicks : 0,
          roas: cost > 0 ? conversionsValue / cost : 0,
        };
      });

      const live = campaigns.filter(c => c.cost > 0);
      return res.status(200).json({
        campaigns: liveOnly === 'false' ? campaigns : live,
        totalCampaigns: campaigns.length,
        liveCampaigns: live.length,
      });
    }

    // PAUSE / ENABLE a campaign
    if (action === 'set_status' && isPost) {
      const { campaignId, status } = req.body; // status: 'PAUSED' | 'ENABLED'
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
      };
      if (loginCustomerId) headers['login-customer-id'] = String(loginCustomerId).replace(/-/g, '');

      const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/campaigns:mutate`;
      const body = {
        operations: [{
          update: { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status },
          updateMask: 'status',
        }],
      };
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) return res.status(400).json(data);
      return res.status(200).json({ ok: true, data });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
