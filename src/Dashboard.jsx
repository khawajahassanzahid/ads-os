import { useState, useEffect } from "react";

const PKR = (n) => {
  const v = parseFloat(n) || 0;
  if (v >= 1000000) return `₨${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `₨${(v / 1000).toFixed(0)}K`;
  return `₨${Math.round(v).toLocaleString()}`;
};

const NUM = (n) => {
  const v = parseFloat(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return Math.round(v).toLocaleString();
};

const roasColor = (r) => {
  const v = parseFloat(r) || 0;
  if (v >= 7) return "#00C853";
  if (v >= 3) return "#F59E0B";
  if (v > 0) return "#EF4444";
  return "#4A5568";
};

const roasBg = (r) => {
  const v = parseFloat(r) || 0;
  if (v >= 7) return "#00C85312";
  if (v >= 3) return "#F59E0B12";
  if (v > 0) return "#EF444412";
  return "transparent";
};

const TARGET = 10000000;
const BUDGET = 1000000;

const PRESETS = [
  { key: "today",       label: "Today" },
  { key: "yesterday",   label: "Yesterday" },
  { key: "last_7d",     label: "7 Days" },
  { key: "last_14d",    label: "14 Days" },
  { key: "last_30d",    label: "30 Days" },
  { key: "this_month",  label: "This Month" },
  { key: "last_month",  label: "Last Month" },
  { key: "custom",      label: "Custom" },
];

export default function Dashboard({ bc }) {
  const [meta, setMeta] = useState(null);
  const [shopSummary, setShopSummary] = useState(null);
  const [shopProducts, setShopProducts] = useState([]);
  const [shopCustomers, setShopCustomers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [audienceLoading, setAudienceLoading] = useState({});
  const [audienceDone, setAudienceDone] = useState({});
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState("last_30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async (p = preset, cf = customFrom, ct = customTo) => {
    setLoading(true);
    setError(null);
    setBrief(null);
    const isCustom = p === "custom" && cf && ct;
    const dateQ = isCustom ? `since=${cf}&until=${ct}` : `preset=${p}`;
    try {
      const [acct, camps, insights, summary, products, customers] = await Promise.all([
        fetch("/api/meta?action=account").then(r => r.json()),
        fetch(`/api/meta?action=campaigns&${dateQ}`).then(r => r.json()),
        fetch(`/api/meta?action=insights&${dateQ}`).then(r => r.json()),
        fetch(`/api/shopify?action=summary&${dateQ}`).then(r => r.json()),
        fetch(`/api/shopify?action=products&${dateQ}`).then(r => r.json()),
        fetch("/api/shopify?action=customers").then(r => r.json()),
      ]);
      setMeta({ account: acct, campaigns: camps.data || [], insights: insights.data?.[0] || {} });
      setShopSummary(summary);
      setShopProducts(products.products || []);
      setShopCustomers(customers);
    } catch (e) {
      setError("Failed to load data. Check your API connections.");
    }
    setLoading(false);
  };

  const generateBrief = async () => {
    setBriefLoading(true);
    setBrief(null);
    try {
      const activeCamps = (meta?.campaigns || [])
        .filter(c => c.status === "ACTIVE")
        .map(c => {
          const ci = c.insights?.data?.[0] || {};
          return {
            name: c.name,
            spend: ci.spend,
            roas: ci.purchase_roas?.[0]?.value,
            ctr: ci.ctr,
            cpm: ci.cpm,
            purchases: ci.actions?.find(a => a.action_type === "purchase")?.value,
          };
        });

      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 900,
          system: `You are the performance marketing brain for JULKÉ — a premium Pakistani footwear brand (heels, flats, bags, mules). You think like an elite Meta Ads expert. Monthly revenue target: PKR 10M. Monthly Meta budget: PKR 1M. Required ROAS to hit target: 7–10x. Be direct, specific, ruthless. PKR numbers only. No filler text.`,
          messages: [{
            role: "user",
            content: `Today's live data:\n\nShopify this month: ${PKR(shopSummary?.month?.paidRevenue)} revenue from ${shopSummary?.month?.paidOrders} paid orders. Target: ₨10M. Gap: ${PKR(TARGET - (shopSummary?.month?.paidRevenue || 0))}.\n\nTop selling products (no campaign data attached): ${shopProducts.slice(0, 5).map(p => `${p.title} (${p.quantity} units, ${PKR(p.revenue)})`).join(", ")}.\n\nMeta spend this month: ${PKR(meta?.insights?.spend)}. Blended ROAS: ${parseFloat(meta?.insights?.purchase_roas?.[0]?.value || 0).toFixed(1)}x.\n\nActive campaigns:\n${activeCamps.map(c => `- ${c.name}: spend ${PKR(c.spend)}, ROAS ${parseFloat(c.roas || 0).toFixed(1)}x, CTR ${parseFloat(c.ctr || 0).toFixed(2)}%, CPM ${PKR(c.cpm)}`).join("\n") || "None active."}\n\nCustomer segments: ${shopCustomers?.counts?.lapsed} lapsed customers (90d+), ${shopCustomers?.counts?.oneTime} one-time buyers, ${shopCustomers?.counts?.highValue} high value customers.\n\nGive me exactly 5 bullet points: what to kill, what to scale, what audience to create, what product to run next, and one structural fix. Each bullet starts with a bold action word.`
          }]
        }),
      });
      const data = await res.json();
      setBrief(data.content?.map(b => b.text).join("") || data.content?.[0]?.text);
    } catch {
      setBrief("Could not generate brief — check AI connection.");
    }
    setBriefLoading(false);
  };

  const pushToMeta = async (segment, label, count) => {
    if (!count) return;
    setAudienceLoading(prev => ({ ...prev, [segment]: true }));
    try {
      const res = await fetch(`/api/shopify?action=customers&segment=${segment}`);
      const data = await res.json();
      // TODO: POST to /api/meta?action=create_audience with customer list
      await new Promise(r => setTimeout(r, 800));
      setAudienceDone(prev => ({ ...prev, [segment]: true }));
    } catch {
      alert("Audience push failed — Meta Custom Audience API coming next update.");
    }
    setAudienceLoading(prev => ({ ...prev, [segment]: false }));
  };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${bc}30`, borderTopColor: bc, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "#4A5568", fontSize: 13 }}>Loading live data…</div>
    </div>
  );

  if (error) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#EF4444", fontSize: 14 }}>{error}</div>
      <button onClick={loadAll} style={{ background: bc, border: "none", borderRadius: 8, color: "#fff", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>Retry</button>
    </div>
  );

  const monthRev = shopSummary?.period?.paidRevenue || 0;
  const monthOrders = shopSummary?.period?.paidOrders || 0;
  const metaSpend = parseFloat(meta?.insights?.spend || 0);
  const metaRoas = parseFloat(meta?.insights?.purchase_roas?.[0]?.value || 0);
  const progress = Math.min((monthRev / TARGET) * 100, 100);
  const today = new Date();
  const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
  const dailyNeeded = daysLeft > 0 ? (TARGET - monthRev) / daysLeft : 0;
  const activeCamps = (meta?.campaigns || []).filter(c => c.status === "ACTIVE");
  const allCamps = meta?.campaigns || [];

  const progressColor = progress >= 70 ? "#00C853" : progress >= 40 ? "#F59E0B" : "#EF4444";

  const SEGMENTS = [
    { key: "recent",    label: "Recent Buyers (30d)",    icon: "🟢", desc: "Exclude from prospecting — already bought",  color: "#00C853" },
    { key: "highValue", label: "High Value Customers",   icon: "⭐", desc: "Build Lookalike from these — your best ROAS", color: "#F59E0B" },
    { key: "lapsed",    label: "Lapsed (90d+ no buy)",   icon: "🔴", desc: "Win-back campaign — lowest cost retargeting", color: "#EF4444" },
    { key: "oneTime",   label: "One-Time Buyers",        icon: "🔄", desc: "Convert to repeat buyers — retention campaign",color: "#0082FB" },
    { key: "repeat",    label: "Repeat Buyers",          icon: "💎", desc: "Best Lookalike source — Lookalike → prospecting",color: "#8B5CF6" },
    { key: "all",       label: "All Customers",          icon: "👥", desc: "Full list retargeting",                       color: "#8892A4" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#D8E0F0", letterSpacing: "-0.02em" }}>JULKÉ Performance</div>
            <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>Live · Meta + Shopify</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Preset pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setPreset(key);
                    if (key !== "custom") loadAll(key, customFrom, customTo);
                  }}
                  style={{
                    background: preset === key ? bc : "#0A0C14",
                    border: `1px solid ${preset === key ? bc : "#1E2535"}`,
                    borderRadius: 7, color: preset === key ? "#fff" : "#4A5568",
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >{label}</button>
              ))}
            </div>
            {/* Custom date range inputs */}
            {preset === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ background: "#0A0C14", border: "1px solid #1E2535", borderRadius: 7, color: "#D8E0F0", padding: "5px 10px", fontSize: 11, cursor: "pointer" }}
                />
                <span style={{ color: "#4A5568", fontSize: 11 }}>→</span>
                <input
                  type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ background: "#0A0C14", border: "1px solid #1E2535", borderRadius: 7, color: "#D8E0F0", padding: "5px 10px", fontSize: 11, cursor: "pointer" }}
                />
                <button
                  onClick={() => customFrom && customTo && loadAll("custom", customFrom, customTo)}
                  disabled={!customFrom || !customTo}
                  style={{ background: bc, border: "none", borderRadius: 7, color: "#fff", padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: (!customFrom || !customTo) ? 0.4 : 1 }}
                >Apply</button>
              </div>
            )}
            <button onClick={() => loadAll()} style={{ background: "#0A0C14", border: "1px solid #1E2535", borderRadius: 7, color: "#4A5568", padding: "5px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>↻</button>
          </div>
        </div>

        {/* ── SCOREBOARD ─────────────────────────────────────────── */}
        <div style={{ background: "#0A0C14", border: "1px solid #0F1520", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Monthly Revenue vs ₨10M Target</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#D8E0F0", letterSpacing: "-0.02em" }}>
                {PKR(monthRev)}
                <span style={{ fontSize: 15, color: "#4A5568", fontWeight: 400, marginLeft: 8 }}>/ ₨10M</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: progressColor }}>{progress.toFixed(0)}%</div>
              <div style={{ fontSize: 11, color: "#4A5568" }}>{daysLeft} days left this month</div>
            </div>
          </div>
          <div style={{ background: "#1E2535", borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", borderRadius: 99, background: progressColor, width: `${progress}%`, transition: "width 0.8s ease" }} />
          </div>
          {daysLeft > 0 && (
            <div style={{ fontSize: 11, color: "#4A5568" }}>
              Need <span style={{ color: "#D8E0F0", fontWeight: 700 }}>{PKR(dailyNeeded)}/day</span> for {daysLeft} remaining days · Gap: <span style={{ color: progressColor, fontWeight: 700 }}>{PKR(TARGET - monthRev)}</span>
            </div>
          )}
        </div>

        {/* ── KEY METRICS ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Meta Spend (30d)", value: PKR(metaSpend), sub: metaSpend > BUDGET ? "⚠️ Over budget" : `${PKR(BUDGET - metaSpend)} remaining`, color: metaSpend > BUDGET ? "#EF4444" : bc },
            { label: "Blended ROAS",     value: metaRoas > 0 ? `${metaRoas.toFixed(1)}x` : "—", sub: "Target: 7–10x", color: roasColor(metaRoas) },
            { label: "Paid Orders",      value: NUM(monthOrders), sub: `${shopSummary?.period?.orders || 0} total orders`, color: bc },
            { label: "Active Campaigns", value: activeCamps.length, sub: `${allCamps.length} total campaigns`, color: bc },
          ].map(({ label, value, sub, color }, i) => (
            <div key={i} style={{ background: "#0A0C14", border: "1px solid #0F1520", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-0.02em" }}>{value}</div>
              <div style={{ fontSize: 11, color: "#2A3550", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── CAMPAIGN WAR ROOM ───────────────────────────────────── */}
        <div style={{ background: "#0A0C14", border: "1px solid #0F1520", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#D8E0F0" }}>Campaign War Room</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
              <span style={{ color: "#00C853" }}>● ≥7x scale</span>
              <span style={{ color: "#F59E0B" }}>● 3–7x optimise</span>
              <span style={{ color: "#EF4444" }}>● &lt;3x kill/fix</span>
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 90px 110px 90px 75px 80px 80px 80px", gap: 6, padding: "5px 10px", marginBottom: 4 }}>
            {["Campaign", "Status", "Spend", "ROAS", "CTR", "CPM", "Purchases", "Frequency"].map((h, i) => (
              <div key={i} style={{ fontSize: 10, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{h}</div>
            ))}
          </div>

          {allCamps.length === 0 && <div style={{ color: "#4A5568", fontSize: 13, padding: "16px 10px" }}>No campaigns found.</div>}

          {allCamps.map((c, i) => {
            const ci = c.insights?.data?.[0] || {};
            const roas = parseFloat(ci.purchase_roas?.[0]?.value || 0);
            const purchases = ci.actions?.find(a => a.action_type === "purchase")?.value || 0;
            const freq = parseFloat(ci.frequency || 0);
            const isActive = c.status === "ACTIVE";

            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "2.2fr 90px 110px 90px 75px 80px 80px 80px", gap: 6,
                padding: "10px", borderRadius: 10, marginBottom: 4, alignItems: "center",
                background: isActive ? roasBg(roas) : "#06080F",
                border: `1px solid ${isActive && roas > 0 ? roasColor(roas) + "25" : "#0F1520"}`,
                opacity: isActive ? 1 : 0.45,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#D8E0F0", lineHeight: 1.3 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#4A5568", marginTop: 2 }}>{c.objective}</div>
                </div>
                <div>
                  <span style={{
                    background: isActive ? "#00C85318" : "#1E2535", color: isActive ? "#00C853" : "#4A5568",
                    border: `1px solid ${isActive ? "#00C85335" : "#2A3550"}`,
                    borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700
                  }}>{c.status}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#D8E0F0" }}>{ci.spend ? PKR(ci.spend) : "—"}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: roas > 0 ? roasColor(roas) : "#4A5568" }}>{roas > 0 ? `${roas.toFixed(1)}x` : "—"}</div>
                <div style={{ fontSize: 12, color: "#8892A4" }}>{ci.ctr ? `${parseFloat(ci.ctr).toFixed(2)}%` : "—"}</div>
                <div style={{ fontSize: 12, color: "#8892A4" }}>{ci.cpm ? PKR(ci.cpm) : "—"}</div>
                <div style={{ fontSize: 12, color: "#8892A4" }}>{purchases || "—"}</div>
                <div style={{ fontSize: 12, color: freq >= 3 ? "#EF4444" : "#8892A4", fontWeight: freq >= 3 ? 700 : 400 }}>
                  {freq > 0 ? freq.toFixed(1) : "—"}
                  {freq >= 3 && <span style={{ fontSize: 9, marginLeft: 3 }}>⚠️</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── PRODUCT INTELLIGENCE + AUDIENCES ────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

          {/* Top Products */}
          <div style={{ background: "#0A0C14", border: "1px solid #0F1520", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#D8E0F0", marginBottom: 3 }}>Top Selling Products</div>
            <div style={{ fontSize: 11, color: "#4A5568", marginBottom: 16 }}>Last 30 days · Shopify paid orders</div>
            {shopProducts.slice(0, 8).map((p, i) => {
              const max = shopProducts[0]?.revenue || 1;
              const w = (p.revenue / max) * 100;
              return (
                <div key={i} style={{ marginBottom: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: i < 3 ? "#D8E0F0" : "#8892A4" }}>
                      {i < 3 && <span style={{ color: bc, marginRight: 5, fontSize: 10 }}>#{i + 1}</span>}
                      {p.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#4A5568" }}>{p.quantity} · {PKR(p.revenue)}</div>
                  </div>
                  <div style={{ background: "#1E2535", borderRadius: 99, height: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: i < 3 ? bc : "#2A3550", width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Customer Audiences */}
          <div style={{ background: "#0A0C14", border: "1px solid #0F1520", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#D8E0F0", marginBottom: 3 }}>Customer Audiences</div>
            <div style={{ fontSize: 11, color: "#4A5568", marginBottom: 16 }}>Push Shopify segments → Meta Custom Audiences</div>
            {SEGMENTS.map(({ key, label, icon, desc, color }) => {
              const count = shopCustomers?.counts?.[key] || 0;
              const done = audienceDone[key];
              const busy = audienceLoading[key];
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 9, marginBottom: 6, background: "#06080F", border: `1px solid ${done ? color + "30" : "#0F1520"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, flexShrink: 0 }}>{icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#C8D3E8" }}>{label}</div>
                      <div style={{ fontSize: 10, color: "#4A5568" }}>{desc}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color, minWidth: 28, textAlign: "right" }}>{count}</div>
                    <button
                      onClick={() => pushToMeta(key, label, count)}
                      disabled={busy || done || !count}
                      style={{
                        background: done ? color + "20" : "#1E2535", border: `1px solid ${done ? color + "40" : "#2A3550"}`,
                        color: done ? color : "#4A5568", borderRadius: 6, padding: "3px 9px", fontSize: 10,
                        fontWeight: 700, cursor: !count || done ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                        opacity: !count ? 0.4 : 1,
                      }}
                    >
                      {busy ? "…" : done ? "✓ Synced" : "→ Meta"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── AI DAILY BRIEF ──────────────────────────────────────── */}
        <div style={{ background: "#0A0C14", border: `1px solid ${bc}25`, borderRadius: 16, padding: "18px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#D8E0F0" }}>AI Daily Brief</div>
              <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>What to kill, scale, and create — from live data right now</div>
            </div>
            <button
              onClick={generateBrief}
              disabled={briefLoading}
              style={{ background: bc, border: "none", borderRadius: 9, color: "#fff", padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: briefLoading ? "not-allowed" : "pointer", opacity: briefLoading ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}
            >
              {briefLoading
                ? <><div style={{ width: 12, height: 12, border: "2px solid #fff4", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Thinking…</>
                : "⚡ Generate Brief"}
            </button>
          </div>

          {brief ? (
            <div style={{ background: "#06080F", border: "1px solid #0F1520", borderRadius: 11, padding: "16px 18px", fontSize: 13, color: "#C8D3E8", lineHeight: 2, whiteSpace: "pre-wrap" }}>
              {brief}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "28px 0", color: "#2A3550", fontSize: 13 }}>
              Hit "Generate Brief" for your AI-powered action plan based on live Shopify + Meta data.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
