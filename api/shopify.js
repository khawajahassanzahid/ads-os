// Brand-aware Shopify data endpoint.
// Every call now takes ?brand=<id> and looks up that brand's store/token
// from the credentials table (api/_lib/db.js) instead of a single global
// SHOPIFY_STORE / SHOPIFY_ACCESS_TOKEN env var. This is what lets julke and
// qalb (and anything else) have their own connected Shopify store at the
// same time — nothing gets revoked when you look at a different brand.

import { getCredential } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, preset = 'last_30d', since, until, brand } = req.query;
  if (!brand) return res.status(400).json({ error: 'Missing ?brand=<id>' });

  const cred = await getCredential(brand, 'shopify');
  if (!cred || !cred.access_token) {
    return res.status(409).json({ error: 'not_connected', message: `No Shopify connection for brand "${brand}". Visit /api/oauth?platform=shopify&brand=${brand}&shop=yourstore.myshopify.com` });
  }

  const token = cred.access_token;
  const store = cred.account_id;
  const baseUrl = `https://${store}/admin/api/2025-01`;
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };

  // Convert preset or custom range to Shopify date params
  const getDateRange = () => {
    if (since && until) return { min: since, max: until };
    const now = new Date();
    const pad = (d) => d.toISOString().split('T')[0];
    const presets = {
      today:      { min: pad(new Date(now.getFullYear(), now.getMonth(), now.getDate())), max: pad(now) },
      yesterday:  { min: pad(new Date(now - 86400000)), max: pad(new Date(now - 86400000)) },
      last_7d:    { min: pad(new Date(now - 7 * 86400000)), max: pad(now) },
      last_14d:   { min: pad(new Date(now - 14 * 86400000)), max: pad(now) },
      last_30d:   { min: pad(new Date(now - 30 * 86400000)), max: pad(now) },
      this_month: { min: pad(new Date(now.getFullYear(), now.getMonth(), 1)), max: pad(now) },
      last_month: { min: pad(new Date(now.getFullYear(), now.getMonth() - 1, 1)), max: pad(new Date(now.getFullYear(), now.getMonth(), 0)) },
    };
    return presets[preset] || presets['last_30d'];
  };

  // Test endpoint - tries both auth methods
  if (action === 'test') {
    const url = `${baseUrl}/shop.json`;
    try {
      const [r1, r2] = await Promise.all([
        fetch(url, { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }),
        fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }),
      ]);
      const [t1, t2] = await Promise.all([r1.text(), r2.text()]);
      return res.status(200).json({
        store,
        tokenPrefix: token ? token.substring(0, 10) : 'missing',
        xShopifyHeader: { status: r1.status, response: t1.substring(0, 200) },
        bearerHeader: { status: r2.status, response: t2.substring(0, 200) },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    // SALES SUMMARY for selected date range
    if (action === 'summary') {
      const { min, max } = getDateRange();
      const r = await fetch(`${baseUrl}/orders.json?status=any&created_at_min=${min}T00:00:00Z&created_at_max=${max}T23:59:59Z&limit=250&fields=id,total_price,financial_status`, { headers });
      const data = await r.json();

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
        period: summarize(data.orders),
        dateRange: { min, max },
      });
    }

    // TOP SELLING PRODUCTS for selected date range
    if (action === 'products') {
      const { min, max } = getDateRange();
      const r = await fetch(`${baseUrl}/orders.json?status=any&created_at_min=${min}T00:00:00Z&created_at_max=${max}T23:59:59Z&limit=250&fields=line_items`, { headers });
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

    // ALL PRODUCTS with inventory
    if (action === 'inventory') {
      const r = await fetch(`${baseUrl}/products.json?limit=250&fields=id,title,status,variants`, { headers });
      const data = await r.json();
      const products = (data.products || []).map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        variants: (p.variants || []).map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          inventory_quantity: v.inventory_quantity,
          sku: v.sku,
        })),
        totalInventory: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
      }));
      return res.status(200).json({ products });
    }

    // CUSTOMER SEGMENTS for Meta audiences
    if (action === 'customers') {
      const { segment = 'all' } = req.query;
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const r = await fetch(`${baseUrl}/customers.json?limit=250&fields=id,email,phone,first_name,last_name,orders_count,total_spent,created_at,updated_at`, { headers });
      const data = await r.json();
      const all = data.customers || [];

      const segments = {
        all: all.map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}` })),
        recent: all.filter(c => c.updated_at > since30).map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}` })),
        highValue: all.filter(c => parseFloat(c.total_spent) > 10000).sort((a, b) => parseFloat(b.total_spent) - parseFloat(a.total_spent)).map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}`, spent: c.total_spent })),
        lapsed: all.filter(c => c.updated_at < since90 && c.orders_count > 0).map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}` })),
        oneTime: all.filter(c => c.orders_count === 1).map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}` })),
        repeat: all.filter(c => c.orders_count > 1).map(c => ({ email: c.email, phone: c.phone, name: `${c.first_name} ${c.last_name}`, orders: c.orders_count })),
      };

      return res.status(200).json({
        counts: {
          all: segments.all.length,
          recent: segments.recent.length,
          highValue: segments.highValue.length,
          lapsed: segments.lapsed.length,
          oneTime: segments.oneTime.length,
          repeat: segments.repeat.length,
        },
        customers: segments[segment] || segments.all,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
