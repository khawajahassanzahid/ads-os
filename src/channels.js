// Ported verbatim from the growth-ops-console.html mockup — this is the
// full channel map from the Growth Ops Blueprint framework. Only meta,
// google, and shopify are wired to live data today; the rest render as
// "not connected yet" pages with the same best-practice checklists so the
// framework stays visible even for channels that aren't built out.
export const CHANNELS = [
  { id: "meta", label: "Meta Ads", liveCapable: true, impact: "Paid social — usually the fastest lever on revenue pacing.",
    bestPractices: [
      "3–5+ ad variations per ad set for real creative testing signal",
      "Retargeting audience frequency capped around 3.5 before rotating creative",
      "Conversions API (server-side) implemented alongside the pixel for iOS/privacy resilience",
      "Advantage+ catalog ads used for dynamic retargeting on multi-SKU catalogs",
      "Efficiency bands derived from this account's own top-quartile history, not generic industry numbers",
    ] },
  { id: "google", label: "Google Ads", liveCapable: true, impact: "Paid search — captures existing purchase intent; usually your highest-ROAS paid channel if set up correctly.",
    bestPractices: [
      "Performance Max used for unified Search+Shopping+Display+YouTube delivery",
      "Smart Bidding (Target ROAS/CPA) only switched on once a campaign has 30+ conversions in the last 30 days",
      "Negative keyword lists actively maintained to cut wasted spend",
      "Each asset group has 3+ images and 3+ headlines minimum for full delivery",
      "Enhanced conversions / offline conversion import configured for tracking accuracy",
    ] },
  { id: "ga4", label: "Google Analytics (GA4)", liveCapable: true, impact: "Cross-channel source of truth for sessions, conversions, and revenue by traffic driver — Google's own attribution model, not self-reported by each ad platform.",
    bestPractices: [
      "Enhanced measurement + conversion events configured (purchase, add_to_cart at minimum)",
      "Cross-domain tracking set up if checkout runs on a different domain/subdomain than the storefront",
      "Data-driven attribution (GA4 default) reviewed periodically against platform-reported ROAS to quantify the over-reporting gap",
      "Google Ads linked directly to GA4 for closed-loop conversion data, not just pageview tracking",
    ] },
  { id: "merchantCenter", label: "Google Shopping / Merchant Center", liveCapable: false, impact: "Feed-driven — if this isn't clean, your products are invisible on Shopping tab and PMax underperforms regardless of ad spend.",
    bestPractices: [
      "100% product feed approval rate — zero unresolved disapprovals",
      "GTIN/MPN populated on every product where the manufacturer assigns one",
      "Images meet spec: min 800x800px, plain background, no promo text overlay",
      "Price and availability sync automatically with the store, not manually",
      "Product ratings/reviews feed connected to show star ratings in ads",
    ] },
  { id: "youtube", label: "YouTube", liveCapable: false, impact: "Video reach — increasingly required for full-funnel Performance Max delivery, not just standalone brand awareness.",
    bestPractices: [
      "Both vertical (9:16) and horizontal (16:9) creative supplied — PMax needs both to serve everywhere",
      "A short (6–15s) bumper cut exists alongside any longer-format video",
      "View-through conversion tracking enabled and monitored separately from click conversions",
      "Custom intent / in-market audiences layered on top of demographic targeting",
    ] },
  { id: "searchConsole", label: "Organic SEO", liveCapable: true, impact: "Compounding, free traffic — the channel most brands under-invest in relative to its long-term ROI.",
    bestPractices: [
      "Core Web Vitals passing on mobile for top landing pages",
      "XML sitemap submitted with a 90%+ indexed rate",
      "Product schema / structured data present on every PDP",
      "Zero unresolved crawl errors in Search Console",
      "Category pages built out to capture non-branded, mid-funnel search terms",
    ] },
  { id: "aiSeo", label: "AI SEO (Answer Engine Optimization)", liveCapable: false, impact: "Emerging but fast-growing — how your brand shows up in ChatGPT, Perplexity, and Google AI Overviews when people ask category questions instead of searching keywords.",
    bestPractices: [
      "FAQ / structured data markup on key pages so answers are machine-extractable",
      "Clear, factual, consistent brand and product information across the web (about pages, press, third-party listings) — this is what LLMs retrieve from",
      "An llms.txt file considered for larger catalogs (emerging practice, not yet universal)",
      "Regular monitoring of whether the brand is actually being cited in AI answers for its category terms",
    ] },
  { id: "email", label: "Email & SMS Flows", liveCapable: false, impact: "Owned channel — typically the highest-ROI channel per dollar once list size is healthy, and the main lever for repeat-purchase revenue.",
    bestPractices: [
      "Core automated flows all live: welcome, browse abandonment, cart abandonment, post-purchase, win-back",
      "Flow revenue at 25–30%+ of total email/SMS-attributed revenue (vs. one-off campaigns)",
      "List growth via a clear-value-prop popup, not just a generic discount ask",
      "Sunset/re-engagement policy for inactive subscribers to protect sender reputation and deliverability",
    ] },
  { id: "shopify", label: "Shopify / Product Data", liveCapable: true, impact: "The ground truth — every other channel's reported performance should reconcile against this.",
    bestPractices: [
      "Product/collection data clean enough to drive the Ammo Score (sales velocity × stock health × margin)",
      "No oversold (negative inventory) variants live on the storefront",
      "Channel attribution (referring site / UTM source) reviewed regularly against what ad platforms self-report",
      "Collection-level conversion rate tracked over time to catch merchandising issues early",
    ] },
  { id: "organicSocial", label: "Organic Social", liveCapable: false, impact: "Brand-building and a free testing ground for creative that later gets promoted with paid budget.",
    bestPractices: [
      "Consistent posting cadence, not campaign-driven bursts followed by silence",
      "Shoppable tags/product tags enabled on relevant posts",
      "UGC and creator content mixed in alongside brand-produced content",
      "Best-performing organic posts systematically identified and fed into the paid creative pipeline",
    ] },
  { id: "affiliate", label: "Affiliate / Influencer", liveCapable: false, impact: "Extends reach through trusted third-party voices — often the best channel for reaching audiences paid ads can't efficiently target.",
    bestPractices: [
      "Trackable unique codes/links for every partner — no untracked flat-fee-only deals",
      "Tiered commission structure that rewards proven performers over one-off posts",
      "Mix of macro (reach) and micro (trust/conversion) influencers, not just one type",
      "Partner performance reviewed monthly and reallocated toward what's working",
    ] },
];

export function isChannelConnected(channelId, channelStatus) {
  if (["meta", "google", "shopify", "ga4", "searchConsole"].includes(channelId)) {
    return !!channelStatus?.[channelId]?.connected;
  }
  return false; // the remaining channels have no integration built yet
}
