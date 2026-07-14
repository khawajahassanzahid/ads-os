import { useEffect, useState } from "react";
import { getCurrencySymbol } from "./currency.js";

// Command Center — brought in from the JULKÉ Ads Command Center mockup, but
// rewired to pull from this app's own /api/* endpoints (brand-scoped,
// Postgres-backed credentials) instead of Cowork-artifact-only MCP tools,
// so it works as a real page in the deployed app for any connected brand.

function fmtMoney(n, cur) {
  if (n == null || isNaN(n)) return "—";
  return getCurrencySymbol(cur) + Math.round(n).toLocaleString();
}
function fmtNum(n) { if (n == null || isNaN(n)) return "—"; return Math.round(n).toLocaleString(); }
function Pill({ text, bg, color }) {
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 650, background: bg, color, whiteSpace: "nowrap" }}>{text}</span>;
}
function bandColor(val, band) {
  if (val == null || isNaN(val)) return { bg: "#eee", color: "#666", label: "—" };
  const good = band.lowerBetter ? val <= band.good : val >= band.good;
  const bad = band.lowerBetter ? val >= band.bad : val <= band.bad;
  if (good) return { bg: "#e4f3e5", color: "#256b2e", label: "ON TARGET" };
  if (bad) return { bg: "#fbe4e2", color: "#a5271e", label: "OFF TARGET" };
  return { bg: "#fdf1d6", color: "#8a6300", label: "WATCH" };
}

const META_BANDS = {
  ctr: { label: "CTR", good: 4.5, bad: 3.0, lowerBetter: false, unit: "%" },
  cpc: { label: "CPC", good: 24, bad: 40, lowerBetter: true, unit: "money" },
  cpr: { label: "Cost / purchase", good: 2400, bad: 4000, lowerBetter: true, unit: "money" },
  roas: { label: "ROAS (self-reported)", good: 5, bad: 3, lowerBetter: false, unit: "x" },
};
const GOOGLE_BANDS = {
  ctr: { label: "CTR", good: 3.8, bad: 3.0, lowerBetter: false, unit: "%" },
  cpc: { label: "CPC", good: 13, bad: 20, lowerBetter: true, unit: "money" },
  cpa: { label: "Cost / conversion", good: 2000, bad: 4000, lowerBetter: true, unit: "money" },
  roas: { label: "ROAS (self-reported)", good: 7, bad: 4, lowerBetter: false, unit: "x" },
};

function Card({ label, big, note }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#8a8a8a", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 650, color: "#1a1a1a" }}>{big}</div>
      {note && <div style={{ fontSize: 12, color: "#7a7a7a", marginTop: 4 }}>{note}</div>}
    </div>
  );
}
function Panel({ title, children, footer }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: 16, marginBottom: 18 }}>
      {title && <h2 style={{ fontSize: 15, margin: "0 0 12px", color: "#333" }}>{title}</h2>}
      {children}
      {footer && <div style={{ fontSize: 11.5, color: "#999", marginTop: 8 }}>{footer}</div>}
    </div>
  );
}
function Table({ cols, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead><tr>{cols.map(c => <th key={c} style={{ textAlign: "left", padding: "7px 8px", borderBottom: "2px solid #eee", color: "#666", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".03em" }}>{c}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
function Loading({ text = "Loading…" }) { return <div style={{ color: "#999", fontSize: 12.5, padding: "10px 0" }}>{text}</div>; }
function ErrBox({ msg }) { return <div style={{ color: "#a5271e", fontSize: 12.5, padding: "10px 0" }}>{msg}</div>; }

export default function CommandCenter({ bc, activeBrand, channelStatus }) {
  const cur = activeBrand.currency || "USD";
  const [kpis, setKpis] = useState(null);
  const [kpiErr, setKpiErr] = useState(null);
  const [metaCampaigns, setMetaCampaigns] = useState(null);
  const [metaErr, setMetaErr] = useState(null);
  const [googleCampaigns, setGoogleCampaigns] = useState(null);
  const [googleErr, setGoogleErr] = useState(null);
  const [attribution, setAttribution] = useState(null);
  const [attrErr, setAttrErr] = useState(null);
  const [ammo, setAmmo] = useState(null);
  const [ammoErr, setAmmoErr] = useState(null);

  const metaConnected = !!channelStatus?.meta?.connected;
  const googleConnected = !!channelStatus?.google?.connected;
  const shopifyConnected = !!channelStatus?.shopify?.connected;

  useEffect(() => {
    const bid = activeBrand.id;
    let cancelled = false;

    // ---- KPI row: Shopify MTD revenue + Meta/Google MTD spend + blended ROAS ----
    (async () => {
      if (!shopifyConnected) { setKpiErr("Shopify not connected for this brand yet."); return; }
      try {
        const now = new Date();
        const dayOfMonth = now.getDate();
        const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const shopRes = await fetch(`/api/shopify?action=summary&preset=this_month&brand=${bid}`).then(r => r.json());
        const revenueMTD = shopRes?.period?.paidRevenue || 0;
        const ordersMTD = shopRes?.period?.paidOrders || 0;

        let metaSpend = 0;
        if (metaConnected) {
          const mRes = await fetch(`/api/meta?action=insights&preset=this_month&brand=${bid}`).then(r => r.json());
          metaSpend = parseFloat(mRes?.data?.[0]?.spend || 0);
        }
        let googleSpend = 0;
        if (googleConnected) {
          const gRes = await fetch(`/api/google?action=campaigns&preset=this_month&liveOnly=false&brand=${bid}`).then(r => r.json());
          googleSpend = (gRes?.campaigns || []).reduce((s, c) => s + (c.cost || 0), 0);
        }

        const totalSpend = metaSpend + googleSpend;
        const projection = dayOfMonth > 0 ? (revenueMTD / dayOfMonth) * totalDays : 0;
        const realRoas = totalSpend > 0 ? revenueMTD / totalSpend : null;
        const target = Number(activeBrand.monthlyTarget || activeBrand.monthlyBudget || 0);

        if (!cancelled) setKpis({ revenueMTD, ordersMTD, dayOfMonth, projection, metaSpend, googleSpend, totalSpend, realRoas, target });
      } catch (e) { if (!cancelled) setKpiErr(e.message); }
    })();

    // ---- Meta active ads (last 7d) ----
    (async () => {
      if (!metaConnected) return;
      try {
        const res = await fetch(`/api/meta?action=campaigns&preset=last_7d&brand=${bid}`).then(r => r.json());
        if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
        if (!cancelled) setMetaCampaigns(res.data || []);
      } catch (e) { if (!cancelled) setMetaErr(e.message); }
    })();

    // ---- Google live campaigns (last 14d) ----
    (async () => {
      if (!googleConnected) return;
      try {
        const res = await fetch(`/api/google?action=campaigns&preset=last_14d&brand=${bid}`).then(r => r.json());
        if (res.error) throw new Error(res.error.message || res.error);
        if (!cancelled) setGoogleCampaigns(res.campaigns || []);
      } catch (e) { if (!cancelled) setGoogleErr(e.message); }
    })();

    // ---- Shopify channel attribution (last 14d, real orders) ----
    (async () => {
      if (!shopifyConnected) return;
      try {
        const res = await fetch(`/api/shopify?action=channelAttribution&preset=last_14d&brand=${bid}`).then(r => r.json());
        if (res.error) throw new Error(JSON.stringify(res.error));
        if (!cancelled) setAttribution(res);
      } catch (e) { if (!cancelled) setAttrErr(e.message); }
    })();

    // ---- Product ammo board (14d sales vs. stock) ----
    (async () => {
      if (!shopifyConnected) return;
      try {
        const [prodRes, invRes] = await Promise.all([
          fetch(`/api/shopify?action=products&preset=last_14d&brand=${bid}`).then(r => r.json()),
          fetch(`/api/shopify?action=inventory&brand=${bid}`).then(r => r.json()),
        ]);
        const stockByTitle = {};
        (invRes.products || []).forEach(p => { stockByTitle[p.title.toLowerCase()] = p; });
        const rows = (prodRes.products || []).slice(0, 15).map(p => {
          const stock = stockByTitle[p.title.toLowerCase()];
          return { ...p, stock };
        });
        if (!cancelled) setAmmo(rows);
      } catch (e) { if (!cancelled) setAmmoErr(e.message); }
    })();

    return () => { cancelled = true; };
  }, [activeBrand.id, metaConnected, googleConnected, shopifyConnected]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <div style={{ maxWidth: 1020, margin: "0 auto" }} className="fade-up">
        <div style={{ background: "#fff8e6", border: "1px solid #f0d98c", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#6b5300", marginBottom: 18, lineHeight: 1.5 }}>
          <strong>Read this before trusting platform ROAS:</strong> Meta and Google self-report conversion value that typically runs above what Shopify actually attributes to each channel. Use platform ROAS/CPA for relative day-to-day comparison, not as literal revenue. "Blended Real ROAS" and channel attribution below use real Shopify order data.
        </div>

        {kpiErr && !kpis ? <Panel><ErrBox msg={kpiErr} /></Panel> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>
            <Card label="Shopify Revenue (MTD)" big={kpis ? fmtMoney(kpis.revenueMTD, cur) : "—"} note={kpis ? `${kpis.ordersMTD} paid orders · ${kpis.dayOfMonth} days in` : ""} />
            <Card label="Projected Month-End" big={kpis ? fmtMoney(kpis.projection, cur) : "—"} note={kpis && kpis.target ? (kpis.projection >= kpis.target ? "On pace for target" : "Below target pace") : ""} />
            <Card label="Ad Spend (MTD, Meta+Google)" big={kpis ? fmtMoney(kpis.totalSpend, cur) : "—"} note={kpis ? `Meta ${fmtMoney(kpis.metaSpend, cur)} · Google ${fmtMoney(kpis.googleSpend, cur)}` : ""} />
            <Card label="Blended Real ROAS" big={kpis && kpis.realRoas != null ? kpis.realRoas.toFixed(2) + "x" : "—"} note="Shopify revenue ÷ ad spend" />
          </div>
        )}

        {kpis?.target > 0 && (
          <Panel title="Progress to Monthly Target">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#555", marginBottom: 4 }}>
              <span>{fmtMoney(0, cur)}</span><span>Target: {fmtMoney(kpis.target, cur)}</span>
            </div>
            <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: Math.min(100, (kpis.projection / kpis.target) * 100) + "%", background: kpis.projection >= kpis.target ? "#3a7d44" : "#c9a227" }} />
            </div>
            <div style={{ fontSize: 11.5, color: "#999", marginTop: 8 }}>Projected {fmtMoney(kpis.projection, cur)} vs. target {fmtMoney(kpis.target, cur)} — {((kpis.projection / kpis.target) * 100).toFixed(0)}% of target at current pace.</div>
          </Panel>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 14 }}>
          <Panel title="Meta — Efficiency Bands">
            {!metaConnected ? <Loading text="Meta not connected for this brand." /> : metaErr ? <ErrBox msg={metaErr} /> : !metaCampaigns ? <Loading /> : (() => {
              const avg = (fn) => { const vals = metaCampaigns.map(fn).filter(v => v != null && !isNaN(v)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; };
              const ins = (c) => c.insights?.data?.[0] || {};
              const ctr = avg(c => parseFloat(ins(c).ctr));
              const cpc = avg(c => parseFloat(ins(c).cpc));
              const roas = avg(c => parseFloat(ins(c).purchase_roas?.[0]?.value));
              const rows = [["ctr", ctr, META_BANDS.ctr], ["cpc", cpc, META_BANDS.cpc], ["roas", roas, META_BANDS.roas]];
              return rows.map(([key, val, band]) => {
                const b = bandColor(val, band);
                const disp = val == null ? "—" : band.unit === "%" ? val.toFixed(2) + "%" : band.unit === "x" ? val.toFixed(2) + "x" : fmtMoney(val, cur);
                return <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0ee" }}><div style={{ fontSize: 12.5, color: "#444" }}>{band.label}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{disp} <Pill text={b.label} bg={b.bg} color={b.color} /></div></div>;
              });
            })()}
          </Panel>
          <Panel title="Google — Efficiency Bands">
            {!googleConnected ? <Loading text="Google Ads not connected for this brand." /> : googleErr ? <ErrBox msg={googleErr} /> : !googleCampaigns ? <Loading /> : (() => {
              if (!googleCampaigns.length) return <Loading text="No live (spending) campaigns in the last 14 days." />;
              const totals = googleCampaigns.reduce((s, c) => ({ cost: s.cost + c.cost, clicks: s.clicks + c.clicks, impressions: s.impressions + c.impressions, conversions: s.conversions + c.conversions, conversionsValue: s.conversionsValue + c.conversionsValue }), { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 });
              const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
              const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : null;
              const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : null;
              const roas = totals.cost > 0 ? totals.conversionsValue / totals.cost : null;
              const rows = [["ctr", ctr, GOOGLE_BANDS.ctr], ["cpc", cpc, GOOGLE_BANDS.cpc], ["cpa", cpa, GOOGLE_BANDS.cpa], ["roas", roas, GOOGLE_BANDS.roas]];
              return rows.map(([key, val, band]) => {
                const b = bandColor(val, band);
                const disp = val == null ? "—" : band.unit === "%" ? val.toFixed(2) + "%" : band.unit === "x" ? val.toFixed(2) + "x" : fmtMoney(val, cur);
                return <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0ee" }}><div style={{ fontSize: 12.5, color: "#444" }}>{band.label}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{disp} <Pill text={b.label} bg={b.bg} color={b.color} /></div></div>;
              });
            })()}
          </Panel>
        </div>

        <Panel title="Meta — Active Ads (last 7 days)">
          {!metaConnected ? <Loading text="Meta not connected for this brand." /> : metaErr ? <ErrBox msg={metaErr} /> : !metaCampaigns ? <Loading /> : (
            <Table cols={["Campaign", "Spend", "CTR", "ROAS"]} rows={metaCampaigns.slice(0, 15).map(c => {
              const ins = c.insights?.data?.[0] || {};
              const spend = parseFloat(ins.spend || 0);
              const ctr = ins.ctr != null ? parseFloat(ins.ctr) : null;
              const roas = ins.purchase_roas?.[0]?.value != null ? parseFloat(ins.purchase_roas[0].value) : null;
              return <tr key={c.id}><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{c.name}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{fmtMoney(spend, cur)}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{ctr != null ? ctr.toFixed(2) + "%" : "—"}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{roas != null ? roas.toFixed(2) + "x" : "—"}</td></tr>;
            })} />
          )}
        </Panel>

        <Panel title="Google — Live Campaigns Only">
          {!googleConnected ? <Loading text="Google Ads not connected for this brand." /> : googleErr ? <ErrBox msg={googleErr} /> : !googleCampaigns ? <Loading /> : !googleCampaigns.length ? <Loading text="No live (spending) campaigns in the last 14 days." /> : (
            <Table cols={["Campaign", "Status", "Spend", "CTR", "ROAS"]} rows={googleCampaigns.map(c => (
              <tr key={c.id}><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{c.name}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{c.status === "ENABLED" ? <Pill text="LIVE" bg="#e4f3e5" color="#256b2e" /> : <Pill text={c.status} bg="#eee" color="#666" />}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{fmtMoney(c.cost, cur)}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{c.ctr?.toFixed(2)}%</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{c.roas?.toFixed(2)}x</td></tr>
            ))} />
          )}
        </Panel>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 14 }}>
          <Panel title="Shopify — Sales by Traffic Driver (last 14 days)" footer={attribution?.note}>
            {!shopifyConnected ? <Loading text="Shopify not connected for this brand." /> : attrErr ? <ErrBox msg={attrErr} /> : !attribution ? <Loading /> : (
              <div>
                {attribution.channels.map(c => {
                  const pct = attribution.totalRevenue > 0 ? (c.revenue / attribution.totalRevenue) * 100 : 0;
                  return (
                    <div key={c.channel} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                        <span style={{ color: "#444" }}>{c.channel}</span>
                        <span style={{ fontWeight: 600 }}>{fmtMoney(c.revenue, cur)} · {c.orders} orders</span>
                      </div>
                      <div style={{ height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: pct + "%", background: bc, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel title="Product Ammo Board — what's selling & in stock (14d)">
            {!shopifyConnected ? <Loading text="Shopify not connected for this brand." /> : ammoErr ? <ErrBox msg={ammoErr} /> : !ammo ? <Loading /> : (
              <Table cols={["Product", "14d Sales", "Stock", "Status"]} rows={ammo.map(p => {
                const stock = p.stock;
                let pill;
                if (!stock) pill = <Pill text="NO STOCK DATA" bg="#eee" color="#666" />;
                else if (stock.oversold) pill = <Pill text="OVERSOLD" bg="#fbe4e2" color="#a5271e" />;
                else if (stock.totalInventory < 10) pill = <Pill text="LOW STOCK" bg="#fbe4e2" color="#a5271e" />;
                else if (p.quantity >= 4 && stock.totalInventory >= 50) pill = <Pill text="PUSH" bg="#e4f3e5" color="#256b2e" />;
                else pill = <Pill text="WATCH" bg="#fdf1d6" color="#8a6300" />;
                return <tr key={p.title}><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{p.title}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{fmtMoney(p.revenue, cur)}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{stock ? fmtNum(stock.totalInventory) : "—"}</td><td style={{ padding: "7px 8px", borderBottom: "1px solid #f0f0ee" }}>{pill}</td></tr>;
              })} />
            )}
          </Panel>
        </div>

        <Panel title="Needs Your Decision" footer="Not built yet — this fills in once the daily automation/decision layer is built. No fake data shown here in the meantime.">
          <Loading text="No automation running yet." />
        </Panel>
      </div>
    </div>
  );
}
