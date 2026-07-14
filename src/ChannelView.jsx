import { useEffect, useState } from "react";
import { CHANNELS, isChannelConnected } from "./channels.js";
import { getCurrencySymbol } from "./currency.js";

function fmtMoney(n, cur) { if (n == null || isNaN(n)) return "—"; return getCurrencySymbol(cur) + Math.round(n).toLocaleString(); }
function fmtNum(n) { if (n == null || isNaN(n)) return "—"; return Math.round(n).toLocaleString(); }
function Pill({ text, bg, color }) { return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 650, background: bg, color, whiteSpace: "nowrap" }}>{text}</span>; }
function Panel({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      {title && <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "#1a1a1a" }}>{title}</h2>}
      {children}
    </div>
  );
}
function Table({ cols, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 6 }}>
      <thead><tr>{cols.map(c => <th key={c} style={{ textAlign: "left", padding: "7px 8px", borderBottom: "2px solid #eee", color: "#666", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>{c}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
const td = { padding: "7px 8px", borderBottom: "1px solid #f0f0ee", verticalAlign: "top" };
function Loading({ text = "Loading…" }) { return <div style={{ color: "#999", fontSize: 12.5, padding: "10px 0" }}>{text}</div>; }
function ErrBox({ msg }) { return <div style={{ color: "#a5271e", fontSize: 12.5, padding: "10px 0" }}>{msg}</div>; }

function bandColor(val, band) {
  if (val == null || isNaN(val)) return "gray";
  if (band.lowerBetter) { if (val <= band.good) return "a"; if (val >= band.bad) return "h"; return "r"; }
  if (val >= band.good) return "a"; if (val <= band.bad) return "h"; return "r";
}
const PILL_COLORS = { a: ["#e4f3e5", "#256b2e"], r: ["#fdf1d6", "#8a6300"], h: ["#fbe4e2", "#a5271e"], gray: ["#eee", "#666"] };
function BandPill({ val, band }) { const c = bandColor(val, band); const [bg, color] = PILL_COLORS[c]; return <Pill text=" " bg={bg} color={color} />; }

const META_BANDS = { ctr: { good: 4.5, bad: 3.0, lowerBetter: false }, cpc: { good: 24, bad: 40, lowerBetter: true }, cpr: { good: 2400, bad: 4000, lowerBetter: true }, roas: { good: 5, bad: 3, lowerBetter: false } };
const GOOGLE_BANDS = { ctr: { good: 3.8, bad: 3.0, lowerBetter: false }, cpc: { good: 13, bad: 20, lowerBetter: true }, cpa: { good: 2000, bad: 4000, lowerBetter: true }, roas: { good: 7, bad: 4, lowerBetter: false } };

function BestPractices({ items }) {
  return (
    <Panel title="Best Practices — what &quot;good&quot; looks like here">
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.8, color: "#333" }}>
        {items.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </Panel>
  );
}

function ConnectBox({ label, connectUrl }) {
  return (
    <Panel>
      <Pill text="NOT CONNECTED" bg="#fbe4e2" color="#a5271e" />
      <div style={{ background: "#faf9f6", border: "1px dashed #ccc", borderRadius: 8, padding: 16, textAlign: "center", marginTop: 10 }}>
        <p style={{ fontSize: 12.5, color: "#333", margin: "0 0 10px" }}>{label} isn't linked for this brand yet, so this tab can't show live data — only what to check once it's connected.</p>
        {connectUrl
          ? <a href={connectUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "7px 14px", borderRadius: 6, background: "#1a1a1a", color: "#fff", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>Connect {label} →</a>
          : <div style={{ fontSize: 11.5, color: "#999" }}>Add the account ID for {label} in Edit Brand first, then connect from there.</div>}
      </div>
    </Panel>
  );
}

function MetaChannel({ activeBrand }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => {
    setRows(null); setErr(null);
    fetch(`/api/meta?action=campaigns&preset=last_7d&brand=${activeBrand.id}`).then(r => r.json()).then(res => {
      if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
      setRows(res.data || []);
    }).catch(e => setErr(e.message));
  };
  useEffect(load, [activeBrand.id]);

  const pause = async (campaignId, name) => {
    if (!confirm(`Pause "${name}"? This is a real, live change to this Meta ad account.`)) return;
    await fetch(`/api/meta?action=update_campaign_status&brand=${activeBrand.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, status: "PAUSED" }) });
    load();
  };

  if (err) return <Panel title="Flags"><ErrBox msg={err} /></Panel>;
  if (!rows) return <Panel title="Active Campaigns (last 7 days)"><Loading /></Panel>;

  const parsed = rows.map(c => {
    const ins = c.insights?.data?.[0] || {};
    const spend = parseFloat(ins.spend || 0);
    const ctr = ins.ctr != null ? parseFloat(ins.ctr) : null;
    const cpc = ins.cpc != null ? parseFloat(ins.cpc) : null;
    const roas = ins.purchase_roas?.[0]?.value != null ? parseFloat(ins.purchase_roas[0].value) : null;
    return { id: c.id, name: c.name, spend, ctr, cpc, roas };
  }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend);

  const flags = parsed.filter(c => bandColor(c.roas, META_BANDS.roas) === "h");

  return (
    <>
      <Panel title="Flags">
        {flags.length === 0 ? <Loading text="No active campaigns outside the efficiency bands right now." /> :
          flags.map(f => <div key={f.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f2", fontSize: 12.5 }}><Pill text="FLAG" bg="#fbe4e2" color="#a5271e" /><div><strong>{f.name}</strong> — ROAS {f.roas != null ? f.roas.toFixed(2) + "x" : "n/a"}, outside target band</div></div>)}
      </Panel>
      <Panel title="Active Campaigns (last 7 days)">
        <Table cols={["Campaign", "Spend", "CTR", "CPC", "ROAS", "Action"]} rows={parsed.slice(0, 20).map(c => (
          <tr key={c.id}>
            <td style={td}>{c.name}</td>
            <td style={td}>{fmtMoney(c.spend, activeBrand.currency)}</td>
            <td style={td}>{c.ctr != null ? c.ctr.toFixed(2) + "%" : "—"} <BandPill val={c.ctr} band={META_BANDS.ctr} /></td>
            <td style={td}>{c.cpc != null ? fmtMoney(c.cpc, activeBrand.currency) : "—"} <BandPill val={c.cpc} band={META_BANDS.cpc} /></td>
            <td style={td}>{c.roas != null ? c.roas.toFixed(2) + "x" : "—"} <BandPill val={c.roas} band={META_BANDS.roas} /></td>
            <td style={td}><button onClick={() => pause(c.id, c.name)} style={{ background: "#a5271e", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Pause</button></td>
          </tr>
        ))} />
      </Panel>
    </>
  );
}

function GoogleChannel({ activeBrand }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch(`/api/google?action=campaigns&preset=last_14d&brand=${activeBrand.id}`).then(r => r.json()).then(res => {
      if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
      setRows(res.campaigns || []);
    }).catch(e => setErr(e.message));
  }, [activeBrand.id]);

  if (err) return <Panel title="Flags"><ErrBox msg={err} /></Panel>;
  if (!rows) return <Panel title="Live Campaigns (last 14 days)"><Loading /></Panel>;
  if (!rows.length) return <Panel title="Live Campaigns (last 14 days)"><Loading text="No live (spending) campaigns found in the last 14 days." /></Panel>;

  const flags = rows.filter(c => bandColor(c.roas, GOOGLE_BANDS.roas) === "h");

  return (
    <>
      <Panel title="Flags">
        {flags.length === 0 ? <Loading text="No live campaigns outside the efficiency bands right now." /> :
          flags.map(f => <div key={f.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f2", fontSize: 12.5 }}><Pill text="FLAG" bg="#fbe4e2" color="#a5271e" /><div><strong>{f.name}</strong> — ROAS {f.roas != null ? f.roas.toFixed(2) + "x" : "n/a"}, below the target floor for this account</div></div>)}
      </Panel>
      <Panel title="Live Campaigns (last 14 days)">
        <Table cols={["Campaign", "Status", "Spend", "CTR", "CPC", "ROAS"]} rows={rows.map(c => (
          <tr key={c.id}>
            <td style={td}>{c.name}</td>
            <td style={td}>{c.status === "ENABLED" ? <Pill text="LIVE" bg="#e4f3e5" color="#256b2e" /> : <Pill text={c.status} bg="#eee" color="#666" />}</td>
            <td style={td}>{fmtMoney(c.cost, activeBrand.currency)}</td>
            <td style={td}>{c.ctr != null ? c.ctr.toFixed(2) + "%" : "—"} <BandPill val={c.ctr} band={GOOGLE_BANDS.ctr} /></td>
            <td style={td}>{c.cpc != null ? fmtMoney(c.cpc, activeBrand.currency) : "—"} <BandPill val={c.cpc} band={GOOGLE_BANDS.cpc} /></td>
            <td style={td}>{c.roas != null ? c.roas.toFixed(2) + "x" : "—"} <BandPill val={c.roas} band={GOOGLE_BANDS.roas} /></td>
          </tr>
        ))} />
      </Panel>
    </>
  );
}

function ShopifyChannel({ activeBrand }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    Promise.all([
      fetch(`/api/shopify?action=products&preset=last_14d&brand=${activeBrand.id}`).then(r => r.json()),
      fetch(`/api/shopify?action=inventory&brand=${activeBrand.id}`).then(r => r.json()),
    ]).then(([prodRes, invRes]) => {
      if (prodRes.error || invRes.error) throw new Error(JSON.stringify(prodRes.error || invRes.error));
      const stockByTitle = {};
      (invRes.products || []).forEach(p => { stockByTitle[p.title.toLowerCase()] = p; });
      setRows((prodRes.products || []).slice(0, 20).map(p => ({ ...p, stock: stockByTitle[p.title.toLowerCase()] })));
    }).catch(e => setErr(e.message));
  }, [activeBrand.id]);

  if (err) return <Panel title="Flags"><ErrBox msg={err} /></Panel>;
  if (!rows) return <Panel title="Product Ammo Board (14-day sales vs. stock)"><Loading /></Panel>;

  const flags = rows.filter(p => p.stock?.oversold || (p.stock && p.stock.totalInventory < 10));

  return (
    <>
      <Panel title="Flags">
        {flags.length === 0 ? <Loading text="No stock issues in the current top sellers." /> :
          flags.map(p => <div key={p.title} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f2", fontSize: 12.5 }}><Pill text="FLAG" bg="#fbe4e2" color="#a5271e" /><div><strong>{p.title}</strong> — {p.stock?.oversold ? "has an oversold (negative inventory) variant" : `only ${p.stock.totalInventory} units left — hold ad spend`}</div></div>)}
      </Panel>
      <Panel title="Product Ammo Board (14-day sales vs. stock)">
        <Table cols={["Product", "14d Sales", "Stock", "Status"]} rows={rows.map(p => {
          const stock = p.stock;
          let pill;
          if (!stock) pill = <Pill text="NO STOCK DATA" bg="#eee" color="#666" />;
          else if (stock.oversold) pill = <Pill text="OVERSOLD" bg="#fbe4e2" color="#a5271e" />;
          else if (stock.totalInventory < 10) pill = <Pill text="LOW STOCK" bg="#fbe4e2" color="#a5271e" />;
          else if (p.quantity >= 4 && stock.totalInventory >= 50) pill = <Pill text="PUSH" bg="#e4f3e5" color="#256b2e" />;
          else pill = <Pill text="WATCH" bg="#fdf1d6" color="#8a6300" />;
          return <tr key={p.title}><td style={td}>{p.title}</td><td style={td}>{fmtMoney(p.revenue, activeBrand.currency)}</td><td style={td}>{stock ? fmtNum(stock.totalInventory) : "—"}</td><td style={td}>{pill}</td></tr>;
        })} />
      </Panel>
    </>
  );
}

export default function ChannelView({ channelId, activeBrand, channelStatus }) {
  const c = CHANNELS.find(x => x.id === channelId);
  if (!c) return null;
  const connected = isChannelConnected(channelId, channelStatus);

  const connectUrls = {
    meta: activeBrand.metaAccountId && `/api/oauth?platform=meta&brand=${activeBrand.id}&accountId=${activeBrand.metaAccountId}&brandName=${encodeURIComponent(activeBrand.name)}`,
    google: activeBrand.googleAccountId && `/api/oauth?platform=google&brand=${activeBrand.id}&customerId=${activeBrand.googleAccountId}&brandName=${encodeURIComponent(activeBrand.name)}`,
    shopify: activeBrand.shopifyDomain && `/api/oauth?platform=shopify&brand=${activeBrand.id}&shop=${activeBrand.shopifyDomain}&brandName=${encodeURIComponent(activeBrand.name)}`,
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px" }}>
      <div style={{ maxWidth: 1020, margin: "0 auto" }} className="fade-up">
        <h1 style={{ fontSize: 19, margin: "0 0 4px", color: "#1a1a1a" }}>{c.label} — {activeBrand.name}</h1>
        <div style={{ color: "#6b6b6b", fontSize: 12.5, marginBottom: 16 }}>{c.impact}</div>

        {!connected ? (
          <>
            <ConnectBox label={c.label} connectUrl={connectUrls[channelId]} />
            <BestPractices items={c.bestPractices} />
          </>
        ) : !c.liveCapable ? (
          <>
            <Panel><Pill text="CONNECTED" bg="#e4f3e5" color="#256b2e" /><p style={{ fontSize: 12.5, marginTop: 10 }}>Marked connected, but live data wiring for this channel type hasn't been built into the dashboard yet — Meta, Google Ads, and Shopify are live today; the rest follow the same pattern once prioritized.</p></Panel>
            <BestPractices items={c.bestPractices} />
          </>
        ) : (
          <>
            {channelId === "meta" && <MetaChannel activeBrand={activeBrand} />}
            {channelId === "google" && <GoogleChannel activeBrand={activeBrand} />}
            {channelId === "shopify" && <ShopifyChannel activeBrand={activeBrand} />}
            <BestPractices items={c.bestPractices} />
          </>
        )}
      </div>
    </div>
  );
}
