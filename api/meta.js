export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const baseUrl = 'https://graph.facebook.com/v19.0';

  const { action } = req.query;

  try {
    // GET CAMPAIGNS
    if (action === 'campaigns') {
      const r = await fetch(
        `${baseUrl}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,spend_cap,start_time,stop_time,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,cost_per_action_type,purchase_roas}&access_token=${token}`
      );
      const data = await r.json();
      return res.status(200).json(data);
    }

    // GET AD SETS
    if (action === 'adsets') {
      const { campaignId } = req.query;
      const url = campaignId
        ? `${baseUrl}/${campaignId}/adsets?fields=id,name,status,targeting,daily_budget,optimization_goal,bid_strategy,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions}&access_token=${token}`
        : `${baseUrl}/${adAccountId}/adsets?fields=id,name,status,campaign_id,targeting,daily_budget,optimization_goal,bid_strategy,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions}&access_token=${token}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // GET ACCOUNT INSIGHTS
    if (action === 'insights') {
      const { preset = 'last_30d' } = req.query;
      const r = await fetch(
        `${baseUrl}/${adAccountId}/insights?date_preset=${preset}&fields=spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type,purchase_roas&access_token=${token}`
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
