export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { theme, type, topProducts, customerCounts, monthlyBudget = 1000000 } = req.body;

  const systemPrompt = `You are building a complete Meta Ads campaign for JULKÉ — a premium Pakistani women's footwear brand. Products: heels, flats, mules, bags. Store: julke.pk. Currency: PKR. Target audience: women 20-45, Pakistan, fashion-conscious.

Return ONLY valid JSON, no other text:
{
  "campaign": {
    "name": "Campaign name",
    "objective": "OUTCOME_SALES",
    "special_ad_categories": [],
    "status": "PAUSED",
    "daily_budget": number_in_paise (PKR * 100),
    "reasoning": "Why this budget"
  },
  "adSets": [
    {
      "name": "Ad set name",
      "optimization_goal": "PURCHASE" | "LINK_CLICKS",
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
      "daily_budget": number_in_paise,
      "targeting_description": "Human readable targeting summary",
      "targeting": {
        "age_min": 20,
        "age_max": 45,
        "genders": [2],
        "geo_locations": { "countries": ["PK"] },
        "interests": [{"name": "interest name"}]
      },
      "funnel": "TOF" | "MOF" | "BOF",
      "purpose": "What this ad set does",
      "ads": [
        {
          "name": "Ad name",
          "primary_text": "Main ad body copy (2-3 sentences, conversational, Urdu-English mix ok)",
          "headline": "Short punchy headline (max 40 chars)",
          "description": "Supporting line (max 30 chars)",
          "call_to_action": "SHOP_NOW" | "LEARN_MORE",
          "link": "https://julke.pk",
          "image_note": "Describe the ideal image/video for this ad"
        },
        {
          "name": "Ad name variant 2",
          "primary_text": "Different angle — same product",
          "headline": "Different headline",
          "description": "Supporting line",
          "call_to_action": "SHOP_NOW",
          "link": "https://julke.pk",
          "image_note": "Describe the ideal image/video"
        }
      ]
    }
  ],
  "summary": "2-sentence campaign strategy overview",
  "creativeGuide": "What images/videos to shoot or use for this campaign"
}

Build 3 ad sets: 1 TOF (prospecting/interests), 1 MOF (lookalike or engaged), 1 BOF (retargeting/past customers).
Each ad set gets 2 ad copy variations.
Total daily budget should be ~PKR 33,000 (1M/month).`;

  const userPrompt = `Build a complete campaign for:
Theme: ${theme || type || 'general sales'}
Top selling products: ${(topProducts || []).slice(0, 5).map(p => p.title || p.name).join(', ')}
Customer segments available: ${JSON.stringify(customerCounts || {})}
Monthly budget: PKR ${(monthlyBudget / 100).toLocaleString()}

Write all copy. Make it specific to JULKÉ and ${theme || 'footwear sales'}. If it's Eid, use celebratory language. If retargeting, use re-engagement language. Make copy feel premium, not cheap.`;

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
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await r.json();
    const text = data.content?.[0]?.text || '{}';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message, raw: err.toString() });
  }
}
