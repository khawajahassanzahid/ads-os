// Channel Connection Matrix — the "total digital marketing view" from the
// Growth Ops Blueprint framework. Shows every channel in the map, not just
// the three that happen to be wired to live data (Meta/Google/Shopify),
// so gaps are visible at a glance instead of hidden by omission.

const CHANNELS = [
  { id: "meta", label: "Meta Ads", liveCapable: true, impact: "Paid social — usually the fastest lever on revenue pacing." },
  { id: "google", label: "Google Ads", liveCapable: true, impact: "Paid search — captures existing purchase intent." },
  { id: "shopify", label: "Shopify / Product Data", liveCapable: true, impact: "The ground truth — every other channel's performance should reconcile against this." },
  { id: "merchantCenter", label: "Google Shopping / Merchant Center", liveCapable: false, impact: "Feed-driven — if this isn't clean, products are invisible on Shopping and PMax underperforms." },
  { id: "youtube", label: "YouTube", liveCapable: false, impact: "Video reach — increasingly required for full-funnel Performance Max delivery." },
  { id: "searchConsole", label: "Organic SEO", liveCapable: false, impact: "Compounding, free traffic — most under-invested channel relative to long-term ROI." },
  { id: "aiSeo", label: "AI SEO (Answer Engine Optimization)", liveCapable: false, impact: "How the brand shows up in ChatGPT / Perplexity / AI Overviews." },
  { id: "email", label: "Email & SMS Flows", liveCapable: false, impact: "Owned channel — typically the highest-ROI channel once list size is healthy." },
  { id: "organicSocial", label: "Organic Social", liveCapable: false, impact: "Brand-building and a free testing ground for paid creative." },
  { id: "affiliate", label: "Affiliate / Influencer", liveCapable: false, impact: "Extends reach through trusted third-party voices." },
];

function Pill({ text, bg, color }) {
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 650, background: bg, color }}>{text}</span>;
}

export default function ChannelMatrix({ cs, bc, onOpenCommandCenter }) {
  const isConnected = (id) => {
    if (id === "google") return !!cs?.google?.connected;
    return !!cs?.[id]?.connected;
  };
  const connectedCount = CHANNELS.filter(c => isConnected(c.id)).length;
  const pct = Math.round((connectedCount / CHANNELS.length) * 100);
  const gaps = CHANNELS.filter(c => !isConnected(c.id));

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#1a1a1a" }}>Channel Connection Matrix</h2>
        <button onClick={onOpenCommandCenter} style={{ fontSize: 11.5, fontWeight: 700, color: bc, background: "transparent", border: `1px solid ${bc}40`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Open Command Center →</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#6b6b6b", marginBottom: 12 }}>{connectedCount} of {CHANNELS.length} channels connected ({pct}%). Meta, Google Ads and Shopify are live-data capable today — the rest are tracked here as gaps to close.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginBottom: gaps.length ? 14 : 0 }}>
        {CHANNELS.map(c => {
          const conn = isConnected(c.id);
          return (
            <div key={c.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>{c.label}</div>
              {conn
                ? <Pill text="Connected" bg="#e4f3e5" color="#256b2e" />
                : <Pill text="Not connected" bg="#eee" color="#666" />}
            </div>
          );
        })}
      </div>

      {gaps.length > 0 && (
        <div>
          {gaps.slice(0, 3).map(c => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f5f5f2", fontSize: 12.5 }}>
              <Pill text="GAP" bg="#fbe4e2" color="#a5271e" />
              <div><strong>{c.label} not connected.</strong> <span style={{ color: "#555" }}>{c.impact}</span></div>
            </div>
          ))}
          {gaps.length > 3 && <div style={{ fontSize: 11.5, color: "#999", marginTop: 6 }}>+{gaps.length - 3} more gap{gaps.length - 3 > 1 ? "s" : ""} — see the full framework in the Growth Ops Blueprint.</div>}
        </div>
      )}
    </div>
  );
}
