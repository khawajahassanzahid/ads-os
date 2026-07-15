import { useEffect, useState } from "react";
import { getCurrencySymbol } from "./currency.js";

// Reconciled attribution view — the "gelled" view. Replaces the old static
// disclaimer banner ("platform ROAS runs above real revenue, trust us")
// with the real numbers: what Meta claims, what Google claims, what GA4's
// neutral cross-channel model actually credits each of them, and what
// Shopify says the store really made. GA4 is the anchor because it's the
// only source here that isn't grading its own homework.
//
// This is item 5 from the decision-gap analysis: "stop hiding the
// Meta-vs-Google-vs-GA4-vs-Shopify disagreement in a disclaimer, show it
// plainly with GA4 as the anchor." Pattern borrowed from how Optmyzr's
// most-praised feature (Rule Engine) works — don't just show a number that
// moved, say what to do about it.

function fmtMoney(n, cur) {
  if (n == null || isNaN(n)) return "—";
  return getCurrencySymbol(cur) + Math.round(n).toLocaleString();
}

function metaPurchaseValue(ins) {
  const av = ins.action_values || [];
  const match = av.find(a => a.action_type === "purchase") || av.find(a => a.action_type === "omni_purchase");
  return match ? parseFloat(match.value || 0) : 0;
}

function MetricCard({ label, value, badge, badgeBg, badgeColor }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12.5, color: "#8a8a8a", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 650, color: "#1a1a1a", marginBottom: 8 }}>{value}</div>
      <span style={{ display: "inline-block", fontSize: 11, padding: "2px 9px", borderRadius: 20, background: badgeBg, color: badgeColor, fontWeight: 600 }}>{badge}</span>
    </div>
  );
}

function ReconBar({ label, claimed, anchored, cur }) {
  const overclaim = Math.max(0, claimed - anchored);
  const pctAnchored = claimed > 0 ? Math.min(100, (anchored / claimed) * 100) : 0;
  const pctOver = 100 - pctAnchored;
  const overclaimPct = claimed > 0 ? Math.round((overclaim / claimed) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#666", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
        <span>{label}</span>
        <span>{fmtMoney(claimed, cur)} claimed · {fmtMoney(anchored, cur)} GA4-attributed · {overclaimPct}% over-claimed</span>
      </div>
      <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", background: "#f2f1ec" }}>
        <div style={{ width: pctAnchored + "%", background: "#3a7d44" }} />
        <div style={{ width: pctOver + "%", background: "#c0392b" }} />
      </div>
    </div>
  );
}

export default function ReconciliationPanel({ activeBrand, channelStatus }) {
  const cur = activeBrand.currency || "USD";
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const metaConnected = !!channelStatus?.meta?.connected;
  const googleConnected = !!channelStatus?.google?.connected;
  const ga4Connected = !!channelStatus?.ga4?.connected;
  const shopifyConnected = !!channelStatus?.shopify?.connected;

  useEffect(() => {
    setData(null);
    setErr(null);
    if (!ga4Connected || !shopifyConnected) return;
    const bid = activeBrand.id;
    let cancelled = false;
    (async () => {
      try {
        const [ga4Res, shopRes, metaRes, googleRes] = await Promise.all([
          fetch(`/api/ga4?action=channels&preset=last_14d&brand=${bid}`).then(r => r.json()),
          fetch(`/api/shopify?action=summary&preset=last_14d&brand=${bid}`).then(r => r.json()),
          metaConnected ? fetch(`/api/meta?action=campaigns&preset=last_14d&brand=${bid}`).then(r => r.json()) : Promise.resolve(null),
          googleConnected ? fetch(`/api/google?action=campaigns&preset=last_14d&liveOnly=false&brand=${bid}`).then(r => r.json()) : Promise.resolve(null),
        ]);
        if (ga4Res.error) throw new Error(ga4Res.error.message || JSON.stringify(ga4Res.error));
        if (shopRes.error) throw new Error(JSON.stringify(shopRes.error));

        const ga4Rows = ga4Res.rows || [];
        // GA4's default channel grouping splits Google Ads traffic across
        // more than just "Paid Search" — Performance Max and Demand Gen
        // campaigns (which span Search, Display, YouTube, Discover, Gmail,
        // Maps) get bucketed as "Cross-network" instead, and standalone
        // Shopping campaigns as "Paid Shopping". A brand running mostly
        // PMax (like most Shopify DTC accounts) would show near-zero
        // "Paid Search" revenue even though Google is driving real sales —
        // that's a GA4 taxonomy quirk, not proof the ads aren't working.
        const GOOGLE_GROUPS = ["Paid Search", "Cross-network", "Paid Shopping"];
        const ga4Meta = ga4Rows.filter(r => r.channel === "Paid Social").reduce((s, r) => s + r.revenue, 0);
        const ga4Google = ga4Rows.filter(r => GOOGLE_GROUPS.includes(r.channel)).reduce((s, r) => s + r.revenue, 0);

        let metaClaimed = 0;
        if (metaRes && !metaRes.error) {
          metaClaimed = (metaRes.data || []).reduce((sum, c) => {
            const ins = c.insights?.data?.[0] || {};
            return sum + metaPurchaseValue(ins);
          }, 0);
        }

        let googleClaimed = 0;
        if (googleRes && !googleRes.error) {
          googleClaimed = (googleRes.campaigns || []).reduce((s, c) => s + (c.conversionsValue || 0), 0);
        }

        const shopifyActual = shopRes?.period?.paidRevenue || 0;

        if (!cancelled) setData({ metaClaimed, googleClaimed, ga4Meta, ga4Google, shopifyActual });
      } catch (e) { if (!cancelled) setErr(e.message); }
    })();
    return () => { cancelled = true; };
  }, [activeBrand.id, metaConnected, googleConnected, ga4Connected, shopifyConnected]);

  if (!ga4Connected || !shopifyConnected) {
    return (
      <div style={{ background: "#fff8e6", border: "1px solid #f0d98c", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#6b5300", marginBottom: 18, lineHeight: 1.5 }}>
        <strong>Reconciled attribution needs GA4 and Shopify connected.</strong> {!ga4Connected ? "Connect GA4 " : ""}{!ga4Connected && !shopifyConnected ? "and " : ""}{!shopifyConnected ? "connect Shopify " : ""}for this brand to see Meta and Google's claims checked against a neutral source, instead of a generic disclaimer.
      </div>
    );
  }

  if (err) return <div style={{ fontSize: 12.5, color: "#a5271e", marginBottom: 18 }}>Reconciliation view: {err}</div>;
  if (!data) return <div style={{ fontSize: 12.5, color: "#999", marginBottom: 18 }}>Loading reconciled attribution…</div>;

  const ga4Total = data.ga4Meta + data.ga4Google;
  const metaOverclaimPct = data.metaClaimed > 0 ? Math.round(((data.metaClaimed - data.ga4Meta) / data.metaClaimed) * 100) : 0;
  const googleOverclaimPct = data.googleClaimed > 0 ? Math.round(((data.googleClaimed - data.ga4Google) / data.googleClaimed) * 100) : 0;

  let recommendation;
  if (metaConnected && googleConnected) {
    if (metaOverclaimPct > googleOverclaimPct + 10) {
      recommendation = `Trust GA4 over platform-reported ROAS when moving budget. Meta's claim is ${metaOverclaimPct}% above what GA4 credits it; Google's gap is ${googleOverclaimPct}%, much closer to real. Favor Google at the margin until Meta's gap narrows.`;
    } else if (googleOverclaimPct > metaOverclaimPct + 10) {
      recommendation = `Trust GA4 over platform-reported ROAS when moving budget. Google's claim is ${googleOverclaimPct}% above what GA4 credits it; Meta's gap is ${metaOverclaimPct}%, closer to real. Favor Meta at the margin until Google's gap narrows.`;
    } else {
      recommendation = `Meta and Google are both over-claiming by a similar margin (${metaOverclaimPct}% and ${googleOverclaimPct}%). Neither platform's self-reported ROAS is a reliable signal for reallocation right now — use GA4's numbers instead.`;
    }
  } else if (metaConnected) {
    recommendation = `Meta's self-reported claim is ${metaOverclaimPct}% above what GA4 attributes to it. Use GA4's number, not Meta's, for any budget decision.`;
  } else if (googleConnected) {
    recommendation = `Google's self-reported claim is ${googleOverclaimPct}% above what GA4 attributes to it. Use GA4's number, not Google's, for any budget decision.`;
  } else {
    recommendation = "Connect Meta and/or Google Ads to compare platform-claimed revenue against GA4.";
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
        {metaConnected && <MetricCard label="Meta says" value={fmtMoney(data.metaClaimed, cur)} badge="platform-claimed" badgeBg="#fbe4e2" badgeColor="#a5271e" />}
        {googleConnected && <MetricCard label="Google says" value={fmtMoney(data.googleClaimed, cur)} badge="platform-claimed" badgeBg="#fbe4e2" badgeColor="#a5271e" />}
        <MetricCard label="GA4 attributes (paid)" value={fmtMoney(ga4Total, cur)} badge="cross-channel anchor" badgeBg="#e4f3e5" badgeColor="#256b2e" />
        <MetricCard label="Shopify total revenue" value={fmtMoney(data.shopifyActual, cur)} badge="ground truth" badgeBg="#e4f3e5" badgeColor="#256b2e" />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: 16, marginBottom: 14 }}>
        {metaConnected && <ReconBar label="Meta" claimed={data.metaClaimed} anchored={data.ga4Meta} cur={cur} />}
        {googleConnected && <ReconBar label="Google" claimed={data.googleClaimed} anchored={data.ga4Google} cur={cur} />}
        <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "#999" }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#3a7d44", borderRadius: 2, marginRight: 4 }} />GA4-attributed</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#c0392b", borderRadius: 2, marginRight: 4 }} />over-claimed</span>
        </div>
      </div>

      <div style={{ background: "#fff8e6", border: "1px solid #f0d98c", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#4a3c00", lineHeight: 1.6 }}>
        <strong>Reallocation read:</strong> {recommendation}
      </div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 6, lineHeight: 1.5 }}>Last 14 days · GA4 sessionDefaultChannelGroup used as the neutral cross-channel anchor, with Cross-network and Paid Shopping counted toward Google (Performance Max/Demand Gen traffic lands there, not Paid Search). If these numbers still look off by roughly an order of magnitude, check that your GA4 property's reporting currency matches Shopify's store currency — a mismatch there silently skews every comparison on this page.</div>
    </div>
  );
}
