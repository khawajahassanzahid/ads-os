import { useState } from "react";
import CampaignChecklist from "./CampaignChecklist";
import { saveCampaign, needsSetup, getCampaign } from "./CampaignTracker";

const PKR = (n) => {
  const v = parseFloat(n) || 0;
  if (v >= 1000000) return `₨${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `₨${(v / 1000).toFixed(0)}K`;
  return `₨${Math.round(v).toLocaleString()}`;
};

const PRIORITY_STYLE = {
  HIGH:        { bg: "#a5271e12", border: "#a5271e30", dot: "#a5271e", label: "Action Required" },
  MEDIUM:      { bg: "#8a630012", border: "#8a630030", dot: "#8a6300", label: "Recommended" },
  OPPORTUNITY: { bg: "#0082FB12", border: "#0082FB30", dot: "#0082FB", label: "Opportunity" },
};

export default function AIActions({ bc, activeBrand, liveData, onCampaignCreated }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [dismissed, setDismissed] = useState({});
  const [executing, setExecuting] = useState({});
  const [done, setDone] = useState({});
  const [theme, setTheme] = useState("");
  const [wizard, setWizard] = useState(null);       // campaign structure to review
  const [wizardLoading, setWizardLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const getSuggestions = async () => {
    setLoading(true);
    setSuggestions([]);
    setApiError(null);
    setDismissed({});
    setDone({});
    try {
      const r = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...liveData,
          theme: theme || undefined,
          brandName: activeBrand?.name,
          industry: activeBrand?.industry,
          website: activeBrand?.website,
          currency: activeBrand?.currency,
          monthlyBudget: activeBrand?.monthlyBudget,
          monthlyTarget: activeBrand?.monthlyTarget,
          pendingSetup: Object.values(
            JSON.parse(localStorage.getItem("julke_campaigns") || "{}")
          ).filter(c => !c.checklist.approved).map(c => c.name),
        }),
      });
      const data = await r.json();
      if (data.error) {
        setApiError(data.error + (data.raw ? ` — ${data.raw}` : ""));
      } else if (!data.suggestions?.length) {
        setApiError("AI returned no suggestions. Raw: " + JSON.stringify(data).slice(0, 200));
      } else {
        setSuggestions(data.suggestions);
      }
    } catch (e) {
      setApiError("Request failed: " + e.message);
    }
    setLoading(false);
  };

  const approve = async (s) => {
    if (s.type === "pause_campaign" || s.type === "activate_campaign") {
      setExecuting(p => ({ ...p, [s.id]: true }));
      try {
        const newStatus = s.type === "pause_campaign" ? "PAUSED" : "ACTIVE";
        await fetch("/api/meta?action=update_campaign_status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: s.data?.campaignId, status: newStatus, brand: activeBrand?.id }),
        });
        setDone(p => ({ ...p, [s.id]: `Campaign ${newStatus.toLowerCase()}.` }));
        onCampaignCreated?.();
      } catch { setDone(p => ({ ...p, [s.id]: "Failed — try in Meta Ads Manager." })); }
      setExecuting(p => ({ ...p, [s.id]: false }));

    } else if (s.type === "create_audience") {
      setExecuting(p => ({ ...p, [s.id]: true }));
      try {
        const shopRes = await fetch(`/api/shopify?action=customers&segment=${s.data?.audienceType}&brand=${activeBrand?.id}`);
        const shopData = await shopRes.json();
        const emails = (shopData.customers || []).map(c => c.email).filter(Boolean);
        const r = await fetch("/api/meta?action=create_audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${activeBrand?.name || "Brand"} — ${s.title}`,
            description: s.reason,
            emails,
            brand: activeBrand?.id,
          }),
        });
        const res = await r.json();
        setDone(p => ({ ...p, [s.id]: `Audience created: ${res.count} emails uploaded to Meta.` }));
      } catch { setDone(p => ({ ...p, [s.id]: "Failed — check Meta permissions." })); }
      setExecuting(p => ({ ...p, [s.id]: false }));

    } else if (s.type === "create_campaign" || s.type === "seasonal") {
      openWizard(s.data?.theme || s.title, s.type);
    }
  };

  const openWizard = async (campaignTheme, type) => {
    setWizardLoading(true);
    setWizard(null);
    setPushResult(null);
    try {
      const r = await fetch("/api/campaign-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: campaignTheme,
          type,
          topProducts: liveData?.shopifyProducts,
          customerCounts: liveData?.customerCounts,
          monthlyBudget: activeBrand?.monthlyBudget,
          brandName: activeBrand?.name,
          industry: activeBrand?.industry,
          website: activeBrand?.website,
          currency: activeBrand?.currency,
        }),
      });
      const data = await r.json();
      if (data.error) {
        setWizard({ error: `API error: ${data.error}` });
      } else {
        setWizard(data);
      }
    } catch (e) { setWizard({ error: `Request failed: ${e.message}` }); }
    setWizardLoading(false);
  };

  const pushToMeta = async () => {
    if (!wizard || wizard.error) return;
    setPushing(true);
    setPushResult(null);
    const results = { campaign: null, adSets: [], errors: [] };

    try {
      // 0. Fetch existing image hashes to use as placeholders for ads
      let imageHashes = [];
      try {
        const hashRes = await fetch(`/api/meta?action=image_hashes&brand=${activeBrand?.id}`);
        const hashData = await hashRes.json();
        imageHashes = hashData.hashes || [];
      } catch { /* continue without images */ }

      // 1. Create campaign
      const campRes = await fetch("/api/meta?action=create_campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wizard.campaign.name,
          objective: wizard.campaign.objective || "OUTCOME_SALES",
          status: "PAUSED",
          special_ad_categories: [],
          is_adset_budget_sharing_enabled: false,
          brand: activeBrand?.id,
        }),
      });
      const campData = await campRes.json();
      if (!campData.id) throw new Error(JSON.stringify(campData));
      results.campaign = { id: campData.id, name: wizard.campaign.name };

      // 2. Create ad sets
      for (const adSet of (wizard.adSets || [])) {
        try {
          // For BOF retargeting ad sets: auto-create Custom Audience from Shopify lapsed customers
          let targeting = adSet.targeting || { geo_locations: { countries: ["PK"] }, age_min: 20, age_max: 45, genders: [2] };
          let audienceNote = null;

          if (adSet.funnel === "BOF") {
            try {
              const shopRes = await fetch(`/api/shopify?action=customers&segment=lapsed&brand=${activeBrand?.id}`);
              const shopData = await shopRes.json();
              const emails = (shopData.customers || []).map(c => c.email).filter(Boolean);
              if (emails.length > 0) {
                const audRes = await fetch("/api/meta?action=create_audience", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: `${activeBrand?.name || "Brand"} — Lapsed Customers`,
                    description: "90d+ no purchase — auto-created from Shopify",
                    emails,
                    brand: activeBrand?.id,
                  }),
                });
                const audData = await audRes.json();
                if (audData.id) {
                  targeting = { ...targeting, custom_audiences: [{ id: audData.id }] };
                  audienceNote = `Custom Audience created: ${audData.count} lapsed customers uploaded`;
                }
              }
            } catch { /* continue without audience */ }
          }

          // Strip AI-generated interests/cities (no valid IDs) — keep only countries + age/gender
          const cleanTargeting = {
            geo_locations: { countries: (targeting.geo_locations?.countries || ["PK"]) },
            age_min: targeting.age_min || 20,
            age_max: targeting.age_max || 45,
            genders: targeting.genders || [2],
            targeting_automation: { advantage_audience: 0 },
            ...(targeting.custom_audiences ? { custom_audiences: targeting.custom_audiences } : {}),
          };

          // Enforce minimum budget — Meta requires > PKR 280, use at least PKR 1,000 (100000 paisas)
          const MIN_BUDGET = 100000;
          const dailyBudget = Math.max(adSet.daily_budget || 1100000, MIN_BUDGET);

          const adSetBody = {
            name: adSet.name,
            campaign_id: campData.id,
            optimization_goal: "OFFSITE_CONVERSIONS",
            billing_event: "IMPRESSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            daily_budget: dailyBudget,
            targeting: cleanTargeting,
            status: "PAUSED",
            promoted_object: { pixel_id: "159491121353858", custom_event_type: "PURCHASE" },
          };

          let asData = null;
          let asError = null;
          try {
            const asRes = await fetch("/api/meta?action=create_adset", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...adSetBody, brand: activeBrand?.id }),
            });
            asData = await asRes.json();
          } catch (fetchErr) {
            asError = "Fetch failed: " + fetchErr.message;
          }

          const adSetResult = {
            id: asData?.id,
            name: adSet.name,
            funnel: adSet.funnel,
            status: asData?.id ? "created" : "failed",
            audienceNote,
            createdAds: [],
            sentBody: JSON.stringify(adSetBody, null, 2),
            error: asError || (asData?.id ? null : JSON.stringify(asData, null, 2)),
          };

          // 3. Create ads for this ad set (if ad set was created and we have an image hash)
          if (asData?.id && imageHashes.length > 0) {
            for (let adIdx = 0; adIdx < (adSet.ads || []).length; adIdx++) {
              const ad = adSet.ads[adIdx];
              const imageHash = imageHashes[adIdx % imageHashes.length];
              try {
                const adRes = await fetch("/api/meta?action=create_ad", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    adset_id: asData.id,
                    name: ad.name || `${adSet.name} — Ad ${adIdx + 1}`,
                    primary_text: ad.primary_text,
                    headline: ad.headline,
                    description: ad.description,
                    link: ad.link || activeBrand?.website || "https://example.com",
                    call_to_action: ad.call_to_action || "SHOP_NOW",
                    image_hash: imageHash,
                    brand: activeBrand?.id,
                  }),
                });
                const adData = await adRes.json();
                adSetResult.createdAds.push({
                  name: ad.name,
                  status: adData.id ? "created" : "failed",
                  id: adData.id,
                  error: adData.id ? null : JSON.stringify(adData),
                });
              } catch (adErr) {
                adSetResult.createdAds.push({ name: ad.name, status: "failed", error: adErr.message });
              }
            }
          }

          results.adSets.push(adSetResult);
        } catch (e) {
          results.adSets.push({ name: adSet.name, funnel: adSet.funnel, status: "failed", error: "Outer catch: " + e.message });
        }
      }
      // Save campaign to local tracker so checklist persists
      if (results.campaign?.id) {
        saveCampaign(results.campaign, results.adSets);
      }
      setPushResult(results);
      onCampaignCreated?.();
    } catch (e) {
      setPushResult({ error: e.message });
    }
    setPushing(false);
  };

  const visible = suggestions.filter(s => !dismissed[s.id]);

  return (
    <div style={{ background: "#faf9f6", border: "1px solid #e5e3de", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>

      {/* Header + controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>AI Action Center</div>
          <div style={{ fontSize: 11, color: "#6b6b6b", marginTop: 2 }}>Suggestions based on live data · Approve to execute</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={theme}
            onChange={e => setTheme(e.target.value)}
            placeholder="What's coming up? e.g. Eid, Summer Sale, Back to School…"
            style={{ background: "#f7f7f5", border: "1px solid #dddddd", borderRadius: 8, color: "#1a1a1a", padding: "7px 12px", fontSize: 12, width: 280, outline: "none" }}
            onKeyDown={e => e.key === "Enter" && getSuggestions()}
          />
          <button
            onClick={getSuggestions}
            disabled={loading}
            style={{ background: bc, border: "none", borderRadius: 8, color: "#fff", padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
          >
            {loading
              ? <><div style={{ width: 11, height: 11, border: "2px solid #fff4", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Analyzing…</>
              : "⚡ Get Actions"}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map(s => {
            const ps = PRIORITY_STYLE[s.priority] || PRIORITY_STYLE.MEDIUM;
            const isDone = done[s.id];
            const isBusy = executing[s.id];
            return (
              <div key={s.id} style={{ background: ps.bg, border: `1px solid ${ps.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{s.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{s.title}</div>
                    <span style={{ background: ps.bg, color: ps.dot, border: `1px solid ${ps.border}`, borderRadius: 99, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{ps.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.6, marginBottom: 6 }}>{s.reason}</div>
                  <div style={{ fontSize: 11, color: ps.dot, fontWeight: 600 }}>Impact: {s.impact}</div>
                  {isDone && <div style={{ fontSize: 11, color: "#256b2e", marginTop: 6, fontWeight: 600 }}>✓ {isDone}</div>}
                </div>
                {!isDone && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <button
                      onClick={() => setDismissed(p => ({ ...p, [s.id]: true }))}
                      style={{ background: "transparent", border: "1px solid #999999", borderRadius: 7, color: "#6b6b6b", padding: "6px 12px", fontSize: 11, cursor: "pointer" }}
                    >Dismiss</button>
                    <button
                      onClick={() => approve(s)}
                      disabled={isBusy}
                      style={{ background: bc, border: "none", borderRadius: 7, color: "#fff", padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.7 : 1, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                    >
                      {isBusy
                        ? <><div style={{ width: 10, height: 10, border: "2px solid #fff4", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Working…</>
                        : `✓ ${s.type === "create_campaign" || s.type === "seasonal" ? "Build Campaign" : s.type === "create_audience" ? "Upload to Meta" : s.type === "pause_campaign" ? "Pause It" : "Activate"}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && apiError && (
        <div style={{ background: "#a5271e12", border: "1px solid #a5271e30", borderRadius: 10, padding: "12px 16px", color: "#a5271e", fontSize: 12 }}>
          ⚠️ {apiError}
        </div>
      )}

      {!loading && !apiError && suggestions.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#999999", fontSize: 13 }}>
          Hit "Get Actions" to analyze your live data and get specific recommendations.
        </div>
      )}

      {/* Campaign Wizard Modal */}
      {(wizardLoading || wizard) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => { if (e.target === e.currentTarget && !pushing) { setWizard(null); setWizardLoading(false); } }}>
          <div style={{ background: "#faf9f6", border: "1px solid #dddddd", borderRadius: 18, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>

            {wizardLoading && (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${bc}30`, borderTopColor: bc, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 14px" }} />
                <div style={{ color: "#1a1a1a", fontWeight: 700, fontSize: 14 }}>Building your campaign…</div>
                <div style={{ color: "#6b6b6b", fontSize: 12, marginTop: 4 }}>AI is writing all copy and structure</div>
              </div>
            )}

            {wizard && !wizardLoading && !pushResult && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a1a" }}>{wizard.campaign?.name}</div>
                    <div style={{ fontSize: 12, color: "#6b6b6b", marginTop: 3 }}>{wizard.summary}</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: (wizard.adSets?.length > 0) ? "#256b2e" : "#a5271e", fontWeight: 700 }}>
                      {wizard.adSets?.length > 0 ? `✓ ${wizard.adSets.length} ad sets loaded` : "⚠️ 0 ad sets — AI response incomplete, close and try Build Campaign again"}
                    </div>
                  </div>
                  <button onClick={() => { setWizard(null); setPushResult(null); }} style={{ background: "none", border: "none", color: "#6b6b6b", fontSize: 22, cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>

                {wizard.error ? (
                  <div style={{ color: "#a5271e", fontSize: 13 }}>{wizard.error}</div>
                ) : (
                  <>
                    {/* Campaign overview */}
                    <div style={{ background: "#f7f7f5", border: "1px solid #e5e3de", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                        {[
                          ["Objective", wizard.campaign?.objective],
                          ["Daily Budget", PKR((wizard.campaign?.daily_budget || 0) / 100)],
                          ["Status", "Will be PAUSED"],
                        ].map(([l, v], i) => (
                          <div key={i}>
                            <div style={{ fontSize: 10, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{l}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ad Sets with copy */}
                    {(wizard.adSets || []).map((adSet, i) => (
                      <div key={i} style={{ background: "#f7f7f5", border: "1px solid #e5e3de", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{adSet.name}</div>
                            <div style={{ fontSize: 11, color: "#6b6b6b", marginTop: 2 }}>{adSet.purpose} · {adSet.funnel} · {PKR((adSet.daily_budget || 0) / 100)}/day</div>
                          </div>
                          <span style={{ background: `${bc}18`, color: bc, border: `1px solid ${bc}30`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{adSet.funnel}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6b6b6b", marginBottom: 10 }}>Targeting: {adSet.targeting_description}</div>

                        {/* Ad copies */}
                        {(adSet.ads || []).map((ad, j) => (
                          <div key={j} style={{ background: "#faf9f6", border: `1px solid ${bc}20`, borderRadius: 9, padding: "12px 14px", marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: bc, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Ad Variation {j + 1}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <div style={{ fontSize: 10, color: "#6b6b6b", marginBottom: 3 }}>HEADLINE</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{ad.headline}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "#6b6b6b", marginBottom: 3 }}>DESCRIPTION</div>
                                <div style={{ fontSize: 12, color: "#8a8a8a" }}>{ad.description}</div>
                              </div>
                            </div>
                            <div style={{ fontSize: 10, color: "#6b6b6b", marginBottom: 3 }}>BODY COPY</div>
                            <div style={{ fontSize: 12, color: "#333333", lineHeight: 1.6, background: "#f7f7f5", borderRadius: 7, padding: "8px 10px", marginBottom: 8 }}>{ad.primary_text}</div>
                            <div style={{ fontSize: 11, color: "#8a6300", background: "#8a630010", border: "1px solid #8a630020", borderRadius: 6, padding: "6px 10px" }}>
                              📸 Image needed: {ad.image_note}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Creative guide */}
                    {wizard.creativeGuide && (
                      <div style={{ background: "#8a630010", border: "1px solid #8a630025", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: "#8a6300", fontWeight: 700, marginBottom: 4 }}>📸 Creative Guide (shoot this)</div>
                        <div style={{ fontSize: 12, color: "#333333", lineHeight: 1.6 }}>{wizard.creativeGuide}</div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => { setWizard(null); setPushResult(null); }} style={{ background: "transparent", border: "1px solid #999999", borderRadius: 9, color: "#6b6b6b", padding: "10px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button
                        onClick={pushToMeta}
                        disabled={pushing || !wizard.adSets?.length}
                        style={{ background: bc, border: "none", borderRadius: 9, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: (pushing || !wizard.adSets?.length) ? "not-allowed" : "pointer", opacity: (pushing || !wizard.adSets?.length) ? 0.4 : 1, display: "flex", alignItems: "center", gap: 7 }}
                      >
                        {pushing
                          ? <><div style={{ width: 13, height: 13, border: "2px solid #fff4", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Creating in Meta…</>
                          : `→ Push to Meta (${wizard.adSets?.length || 0} ad sets, Paused)`}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Push result */}
            {pushResult && (
              <div>
                {pushResult.error ? (
                  <div style={{ color: "#a5271e", fontSize: 13, padding: "20px 0" }}>Failed: {pushResult.error}</div>
                ) : (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#256b2e", marginBottom: 4 }}>✓ Campaign created in Meta (PAUSED)</div>
                    <div style={{ fontSize: 12, color: pushResult.adSets.filter(a=>a.status==="created").length > 0 ? "#256b2e" : "#a5271e", marginBottom: 16 }}>
                      {pushResult.adSets.filter(a=>a.status==="created").length} of {pushResult.adSets.length} ad sets created
                    </div>
                    <div style={{ background: "#f7f7f5", border: "1px solid #e5e3de", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: "#6b6b6b", marginBottom: 4 }}>Campaign ID</div>
                      <div style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600 }}>{pushResult.campaign?.name} — {pushResult.campaign?.id}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>Ad Sets Created:</div>
                    {pushResult.adSets.map((as, i) => (
                      <div key={i} style={{ background: as.status === "created" ? "#256b2e10" : "#a5271e10", border: `1px solid ${as.status === "created" ? "#256b2e30" : "#a5271e30"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: as.audienceNote ? 6 : 0 }}>
                          <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600 }}>{as.name} <span style={{ color: "#6b6b6b", fontWeight: 400 }}>({as.funnel})</span></div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: as.status === "created" ? "#256b2e" : "#a5271e" }}>{as.status === "created" ? "✓ Created" : "✗ Failed"}</span>
                        </div>
                        {as.audienceNote && <div style={{ fontSize: 11, color: "#256b2e", marginTop: 4 }}>👥 {as.audienceNote}</div>}
                        {as.createdAds?.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {as.createdAds.map((ad, ai) => (
                              <div key={ai} style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, background: ad.status === "created" ? "#256b2e18" : "#a5271e18", color: ad.status === "created" ? "#256b2e" : "#a5271e", border: `1px solid ${ad.status === "created" ? "#256b2e30" : "#a5271e30"}`, wordBreak: "break-all" }}>
                                {ad.status === "created" ? `✓ Ad ${ai + 1} created` : `✗ Ad ${ai + 1}: ${ad.error}`}
                              </div>
                            ))}
                          </div>
                        )}
                        {!as.error && as.status === "created" && !as.createdAds?.length && (
                          <div style={{ fontSize: 11, color: "#8a6300", marginTop: 4 }}>⚠️ No existing images found — add ads manually in Meta Ads Manager</div>
                        )}
                        {as.error && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontSize: 11, color: "#a5271e", background: "#a5271e18", borderRadius: 6, padding: "6px 8px", wordBreak: "break-all", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>ERROR: {as.error}</div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Copy for Meta Ads Manager */}
                    <div style={{ marginTop: 16, marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Ad Copy — paste into Meta Ads Manager</div>
                    <div style={{ fontSize: 11, color: "#6b6b6b", marginBottom: 10 }}>Go to each ad set → Create Ad → paste this copy → upload your image/video → save as draft</div>
                    {pushResult.adSets.filter(as => as.status === "created" && as.ads?.length).map((as, i) => (
                      <div key={i} style={{ background: "#f7f7f5", border: "1px solid #e5e3de", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: bc, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>{as.name}</div>
                        {as.ads.map((ad, j) => (
                          <div key={j} style={{ background: "#faf9f6", border: `1px solid ${bc}20`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: "#6b6b6b", marginBottom: 6, fontWeight: 700 }}>VARIATION {j + 1}</div>
                            {[
                              ["Headline", ad.headline],
                              ["Primary Text", ad.primary_text],
                              ["Description", ad.description],
                              ["Website URL", ad.link || "https://julke.pk"],
                              ["CTA", ad.call_to_action],
                            ].map(([label, val]) => val ? (
                              <div key={label} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 10, color: "#6b6b6b" }}>{label}</div>
                                <div style={{ fontSize: 12, color: "#1a1a1a", background: "#f7f7f5", borderRadius: 5, padding: "5px 8px", marginTop: 2, lineHeight: 1.5, userSelect: "all" }}>{val}</div>
                              </div>
                            ) : null)}
                            {ad.image_note && <div style={{ fontSize: 11, color: "#8a6300", marginTop: 6 }}>📸 {ad.image_note}</div>}
                          </div>
                        ))}
                      </div>
                    ))}
                    {pushResult.campaign?.id && (
                      <CampaignChecklist
                        campaignId={pushResult.campaign.id}
                        campaignName={pushResult.campaign.name}
                        bc={bc}
                        onReady={() => onCampaignCreated?.()}
                      />
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                      <button onClick={() => { setWizard(null); setPushResult(null); }} style={{ background: bc, border: "none", borderRadius: 9, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Done</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
