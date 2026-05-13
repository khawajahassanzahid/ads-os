export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { campaigns, insights, shopifySummary, shopifyProducts, customerCounts, theme } = req.body;

  const activeCamps = (campaigns || []).filter(c => c.status === 'ACTIVE').map(c => {
    const ci = c.insights?.data?.[0] || {};
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      spend: ci.spend,
      roas: ci.purchase_roas?.[0]?.value,
      ctr: ci.ctr,
      cpm: ci.cpm,
      frequency: ci.frequency,
      purchases: ci.actions?.find(a => a.action_type === 'purchase')?.value,
    };
  });

  const pausedCamps = (campaigns || []).filter(c => c.status === 'PAUSED').map(c => ({ id: c.id, name: c.name }));

  const hasRetargeting = activeCamps.some(c =>
    c.name.toLowerCase().includes('retarget') ||
    c.name.toLowerCase().includes('remarketing') ||
    c.name.toLowerCase().includes('retention') ||
    c.name.toLowerCase().includes('win-back')
  );

  const context = {
    shopify: {
      monthRevenue: shopifySummary?.period?.paidRevenue,
      monthOrders: shopifySummary?.period?.paidOrders,
      target: 10000000,
      gap: 10000000 - (shopifySummary?.period?.paidRevenue || 0),
      topProducts: (shopifyProducts || []).slice(0, 5).map(p => ({ name: p.title, units: p.quantity, revenue: p.revenue })),
    },
    meta: {
      totalSpend: insights?.spend,
      blendedRoas: insights?.purchase_roas?.[0]?.value,
      activeCampaigns: activeCamps,
      pausedCampaigns: pausedCamps,
      hasRetargetingCampaign: hasRetargeting,
    },
    customers: customerCounts,
    theme: theme || null,
  };

  const systemPrompt = `You are an elite Meta Ads strategist for JULKÉ — a premium Pakistani footwear brand (heels, flats, bags, mules). Store: julke.pk. Monthly target: PKR 10M. Meta budget: PKR 1M/month. Required ROAS: 7-10x.

Your job: analyze performance data and return SPECIFIC, ACTIONABLE suggestions as JSON. Maximum 6 suggestions. Prioritize by revenue impact.

Return ONLY this JSON structure, no other text:
{
  "suggestions": [
    {
      "id": "unique_id",
      "priority": "HIGH" | "MEDIUM" | "OPPORTUNITY",
      "type": "pause_campaign" | "activate_campaign" | "create_campaign" | "create_audience" | "fix_budget" | "seasonal",
      "icon": "emoji",
      "title": "Short action title",
      "reason": "Specific reason with numbers from the data",
      "action": "Exactly what will happen when approved",
      "impact": "Specific estimated impact in PKR or %",
      "data": {
        "campaignId": "id if applicable",
        "campaignName": "name if applicable",
        "theme": "theme name if create_campaign",
        "audienceType": "lapsed|highValue|oneTime|repeat if create_audience"
      }
    }
  ]
}

Rules:
- Flag any campaign with ROAS < 3x and frequency > 2.5 for pausing
- Flag missing retargeting as HIGH priority always
- Flag seasonal opportunity if theme provided
- Flag top-selling products with no obvious campaign as opportunities
- Flag lapsed customers not being retargeted
- Be brutally specific: name campaign names, use exact PKR numbers`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Analyze this data and return suggestions:\n${JSON.stringify(context, null, 2)}` }],
      }),
    });
    const data = await r.json();
    if (data.error) return res.status(200).json({ error: `Claude API: ${data.error.type} — ${data.error.message}` });
    const text = data.content?.[0]?.text || '';
    if (!text) return res.status(200).json({ error: `Claude returned no text. Full response: ${JSON.stringify(data).slice(0, 300)}` });
    const match = text.match(/\{[\s\S]*\}/)?.[0];
    if (!match) return res.status(200).json({ error: `Could not find JSON in Claude response: ${text.slice(0, 300)}` });
    const json = JSON.parse(match);
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
