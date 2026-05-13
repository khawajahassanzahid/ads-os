export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_STORE;

  const { action } = req.query;

  // Test endpoint - shows exactly what's happening
  if (action === 'test') {
    const url = `https://${store}/admin/api/2024-01/shop.json`;
    try {
      const r = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        }
      });
      const text = await r.text();
      return res.status(200).json({ 
        status: r.status, 
        store, 
        tokenPrefix: token ? token.substring(0, 8) : 'missing',
        url,
        response: text.substring(0, 500)
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, store, tokenPrefix: token ? token.substring(0, 8) : 'missing' });
    }
  }

  const baseUrl = `https://${store}/admin/api/2024-01`;
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'summary') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [today, week, month] = await Promise.all([
        fetch(`${baseUrl}/orders.json?status=any&created_at_min=${startOfDay}&limit=250&fields=id,total_price,financial_status`, { headers }).then(r => r.json()),
        fetch(`${baseUrl}/orders.json?status=any&created_at_min=${startOfWeek}&limit=250&fields=id,total_price,financial_status`, { headers }).then(r => r.json()),
        fetch(`${baseUrl}/orders.json?status=any&created_at_min=${startOfMonth}&limit=250&fields=id,total_price,financial_status`, { headers }).then(r => r.json()),
      ]);

      const summarize = (orders) => {
        const paid = (orders || []).filter(o => o.financial_status === 'paid');
        return {
          orders: (orders || []).length,
          revenue: (orders || []).reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0),
          paidOrders: paid.length,
          paidRevenue: paid.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0),
        };
      };

      return res.status(200).json({
        today: summarize(today.orders),
        week: summarize(week.orders),
        month: summarize(month.orders),
        target: 10000000,
      });
    }

    if (action === 'products') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const r = await fetch(`${baseUrl}/orders.json?status=any&created_at_min=${since}&limit=250&fields=line_items`, { headers });
      const data = await r.json();

      const productMap = {};
      (data.orders || []).forEach(order => {
        (order.line_items || []).forEach(item => {
          if (!productMap[item.title]) productMap[item.title] = { title: item.title, quantity: 0, revenue: 0 };
          productMap[item.title].quantity += item.quantity;
          productMap[item.title].revenue += parseFloat(item.price) * item.quantity;
        });
      });

      const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
      return res.status(200).json({ products });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
