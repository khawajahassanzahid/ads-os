export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const baseUrl = 'https://graph.facebook.com/v19.0';

  const { action, preset = 'last_30d', since, until } = req.query;

  // Build date param string for inline insights and standalone insights
  const dateParam = (since && until)
    ? `time_range={"since":"${since}","until":"${until}"}`
    : `date_preset=${preset}`;

  try {
    // GET CAMPAIGNS
    if (action === 'campaigns') {
      const insightsField = since && until
        ? `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas}`
        : `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas}`;
      const r = await fetch(
        `${baseUrl}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,${insightsField}&access_token=${token}`
      );
      const data = await r.json();
      return res.status(200).json(data);
    }

    // GET AD SETS
    if (action === 'adsets') {
      const { campaignId } = req.query;
      const insightsField = since && until
        ? `insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,cpc,actions}`
        : `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc,actions}`;
      const url = campaignId
        ? `${baseUrl}/${campaignId}/adsets?fields=id,name,status,targeting,daily_budget,optimization_goal,bid_strategy,${insightsField}&access_token=${token}`
        : `${baseUrl}/${adAccountId}/adsets?fields=id,name,status,campaign_id,targeting,daily_budget,optimization_goal,bid_strategy,${insightsField}&access_token=${token}`;
      const r = await fetch(url);
      const data = await r.json();
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
      const { name, objective, status, daily_budget, special_ad_categories } = req.body;
      const r = await fetch(`${baseUrl}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, objective, status: status || 'PAUSED',
          daily_budget, special_ad_categories: special_ad_categories || [],
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
