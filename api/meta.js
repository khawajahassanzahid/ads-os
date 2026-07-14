import { getCredential } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const isPost = req.method === 'POST';
  const brand = req.query.brand || (isPost && req.body && req.body.brand);
  if (!brand) return res.status(400).json({ error: 'Missing brand (query ?brand= for GET, body.brand for POST)' });

  const cred = await getCredential(brand, 'meta');
  if (!cred || !cred.access_token) {
    return res.status(409).json({ error: 'not_connected', message: `No Meta connection for brand "${brand}". Visit /api/oauth?platform=meta&brand=${brand}&accountId=act_XXXXXXXXXX` });
  }

  const token = cred.access_token;
  const adAccountId = cred.account_id;
  const pageId = (cred.extra && cred.extra.pageId) || process.env.META_PAGE_ID;
  const baseUrl = 'https://graph.facebook.com/v19.0';

  const { action, preset = 'last_30d', since, until } = req.query;

  // Build date param string for inline insights and standalone insights
  const dateParam = (since && until)
    ? `time_range={"since":"${since}","until":"${until}"}`
    : `date_preset=${preset}`;

  // Follow Meta's cursor pagination (paging.next) until exhausted, up to a
  // safety cap. Accounts with hundreds of campaigns (this one has 537) were
  // silently truncated to Meta's default page size (25) with no pagination,
  // so "Active Campaigns" counts and lists were missing real, currently-
  // spending campaigns that just happened to live past the first page.
  async function fetchAllPages(url, maxPages = 12) {
    let all = [];
    let next = url;
    let pages = 0;
    while (next && pages < maxPages) {
      const r = await fetch(next);
      const json = await r.json();
      if (json.error) return json; // surface Meta's error as-is
      all = all.concat(json.data || []);
      next = json.paging?.next || null;
      pages++;
    }
    return { data: all };
  }

  try {
    // GET CAMPAIGNS
    if (action === 'campaigns') {
      const insightsField = since && until
        ? `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas}`
        : `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas}`;
      const data = await fetchAllPages(
        `${baseUrl}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,${insightsField}&effective_status[]=ACTIVE&effective_status[]=PAUSED&limit=250&access_token=${token}`
      );
      return res.status(200).json(data);
    }

    // GET AD SETS
    if (action === 'adsets') {
      const { campaignId } = req.query;
      const insightsField = since && until
        ? `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpc,actions}`
        : `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc,actions}`;
      const url = campaignId
        ? `${baseUrl}/${campaignId}/adsets?fields=id,name,status,targeting,daily_budget,optimization_goal,bid_strategy,${insightsField}&limit=250&access_token=${token}`
        : `${baseUrl}/${adAccountId}/adsets?fields=id,name,status,campaign_id,targeting,daily_budget,optimization_goal,bid_strategy,${insightsField}&limit=250&access_token=${token}`;
      const data = await fetchAllPages(url);
      return res.status(200).json(data);
    }

    // GET ACCOUNT INSIGHTS
    if (action === 'insights') {
      const r = await fetch(
        `${baseUrl}/${adAccountId}/insights?${dateParam}&fields=spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas&access_token=${token}`
      );
      const data = await r.json();
      return res.status(200).json(data);
    }

    // CREATE CAMPAIGN
    if (action === 'create_campaign' && req.method === 'POST') {
      const { name, objective, status, daily_budget, special_ad_categories, is_adset_budget_sharing_enabled } = req.body;
      const r = await fetch(`${baseUrl}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, objective, status: status || 'PAUSED',
          daily_budget, special_ad_categories: special_ad_categories || [],
          is_adset_budget_sharing_enabled: is_adset_budget_sharing_enabled ?? false,
          access_token: token
        })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // CREATE AD SET
    if (action === 'create_adset' && req.method === 'POST') {
      const body = { ...req.body, access_token: token };
      const r = await fetch(`${baseUrl}/${adAccountId}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // GET ADS for an ad set
    if (action === 'ads') {
      const { adsetId, campaignId } = req.query;
      const insightsField = since && until
        ? `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpm,frequency,actions,action_values,purchase_roas}`
        : `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpm,frequency,actions,action_values,purchase_roas}`;
      const parentId = adsetId || campaignId;
      const endpoint = adsetId ? `${parentId}/ads` : `${parentId}/ads`;
      const r = await fetch(
        `${baseUrl}/${endpoint}?fields=id,name,status,adset_id,creative{id,name,thumbnail_url},${insightsField}&limit=50&access_token=${token}`
      );
      const data = await r.json();
      return res.status(200).json(data);
    }

    // GET EXISTING IMAGE HASHES from account image library (upload placeholder if none exist)
    if (action === 'image_hashes') {
      const r = await fetch(
        `${baseUrl}/${adAccountId}/adimages?fields=hash,name&limit=20&access_token=${token}`
      );
      const data = await r.json();
      let hashes = (data.data || []).map(img => img.hash).filter(Boolean);

      // If no images in account, upload a placeholder so ads can be created
      if (hashes.length === 0) {
        const uploadRes = await fetch(`${baseUrl}/${adAccountId}/adimages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://placehold.co/1200x628/1a1a2e/ffffff?text=JULKE+Ad+Placeholder',
            name: 'JULKE_placeholder',
            access_token: token,
          }),
        });
        const uploadData = await uploadRes.json();
        const newHash = Object.values(uploadData.images || {})[0]?.hash;
        if (newHash) hashes = [newHash];
      }

      return res.status(200).json({ hashes });
    }

    // CREATE AD with creative (copy + existing image hash)
    if (action === 'create_ad' && req.method === 'POST') {
      const { adset_id, name, primary_text, headline, description, link, call_to_action, image_hash } = req.body;
      const adLink = link || 'https://julke.pk';
      const ctaType = (call_to_action || 'SHOP_NOW').replace(/ /g, '_').toUpperCase();
      if (!pageId) return res.status(200).json({ error: 'No Meta page id on file for this brand (set via extra.pageId when connecting, or META_PAGE_ID env var as a fallback)' });
      if (!image_hash) return res.status(200).json({ error: 'No image_hash provided' });
      // 1. Create the ad creative
      const creativeRes = await fetch(`${baseUrl}/${adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${name} — Creative`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              image_hash,
              link: adLink,
              message: (primary_text || '').slice(0, 2200),
              name: (headline || '').slice(0, 255),
              description: (description || '').slice(0, 255),
              call_to_action: { type: ctaType, value: { link: adLink } },
            },
          },
          access_token: token,
        }),
      });
      const creative = await creativeRes.json();
      if (!creative.id) return res.status(200).json({ error: `Creative failed: ${creative.error?.error_user_msg || creative.error?.message} (subcode: ${creative.error?.error_subcode}) — ${JSON.stringify(creative.error)}` });

      // 2. Create the ad
      const adRes = await fetch(`${baseUrl}/${adAccountId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          adset_id,
          creative: { creative_id: creative.id },
          status: 'PAUSED',
          access_token: token,
        }),
      });
      const ad = await adRes.json();
      return res.status(200).json(ad);
    }

    // UPDATE CAMPAIGN STATUS (pause / activate)
    if (action === 'update_campaign_status' && req.method === 'POST') {
      const { campaignId, status } = req.body;
      const r = await fetch(`${baseUrl}/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, access_token: token }),
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // CREATE CUSTOM AUDIENCE from customer list
    if (action === 'create_audience' && req.method === 'POST') {
      const { name, description, emails } = req.body;
      // Create the audience
      const createRes = await fetch(`${baseUrl}/${adAccountId}/customaudiences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: token,
        }),
      });
      const audience = await createRes.json();
      if (!audience.id) return res.status(400).json(audience);

      // Hash emails with SHA-256 and upload
      const { createHash } = await import('crypto');
      const hashed = (emails || [])
        .filter(Boolean)
        .map(e => createHash('sha256').update(e.toLowerCase().trim()).digest('hex'));

      if (hashed.length > 0) {
        await fetch(`${baseUrl}/${audience.id}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: { schema: ['EMAIL_SHA256'], data: hashed.map(h => [h]) },
            access_token: token,
          }),
        });
      }
      return res.status(200).json({ id: audience.id, name, count: hashed.length });
    }

    // GET ACCOUNT SUMMARY
    if (action === 'account') {
      const r = await fetch(
        `${baseUrl}/${adAccountId}?fields=id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance&access_token=${token}`
      );
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
