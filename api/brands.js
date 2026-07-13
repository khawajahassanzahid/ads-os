// Brand registry — backs the dashboard's brand dropdown and the home tab's
// connection matrix (which channels does this brand have connected, and
// which are missing / need flagging).

import { listBrands, upsertBrand, getConnectionMatrix } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const brands = await listBrands();
      const withMatrix = await Promise.all(
        brands.map(async (b) => ({ ...b, channels: await getConnectionMatrix(b.id) }))
      );
      return res.status(200).json({ brands: withMatrix });
    }

    if (req.method === 'POST') {
      const { id, name, currency } = req.body || {};
      if (!id || !name) return res.status(400).json({ error: 'Missing id or name' });
      const brand = await upsertBrand(id, name, currency || 'PKR');
      return res.status(200).json({ brand });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
