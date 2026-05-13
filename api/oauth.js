export default async function handler(req, res) {
  const clientId = '9326cb7a5ede0cdeb5c237c9c93f0fd8';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const shop = 'julke.myshopify.com';
  const redirectUri = 'https://ads-os-dusky.vercel.app/api/oauth';
  const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';

  // Step 2: Shopify redirected back with a code — exchange it for a token
  if (req.query.code) {
    const { code } = req.query;
    try {
      const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const data = await r.json();

      if (data.access_token) {
        return res.status(200).send(`
          <html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#fff;">
            <h2>✅ Shopify Connected!</h2>
            <p>Your permanent access token:</p>
            <textarea rows="3" style="width:100%;padding:10px;font-size:14px;background:#1a1a1a;color:#00ff88;border:1px solid #333;border-radius:6px;" onclick="this.select()">${data.access_token}</textarea>
            <p style="color:#888;margin-top:20px;">Copy this token and add it to Vercel as <strong>SHOPIFY_ACCESS_TOKEN</strong>.</p>
          </body></html>
        `);
      }

      return res.status(400).send(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
    } catch (err) {
      return res.status(500).send(`Error: ${err.message}`);
    }
  }

  // Step 1: Redirect to Shopify OAuth
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=adsosauth`;
  return res.redirect(authUrl);
}
