// Campaign Tracker — persists campaign health state in localStorage
// so the app knows what's complete vs needs work

const KEY = "julke_campaigns";

export function saveCampaign(campaign, adSets) {
  const store = getAll();
  store[campaign.id] = {
    id: campaign.id,
    name: campaign.name,
    createdAt: new Date().toISOString(),
    adSetCount: adSets.filter(a => a.status === "created").length,
    adCount: adSets.reduce((n, a) => n + (a.createdAds?.filter(ad => ad.status === "created").length || 0), 0),
    hasPlaceholderImages: true,
    checklist: {
      images_replaced: false,
      copy_reviewed: false,
      targeting_checked: false,
      approved: false,
    },
  };
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function getAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function getCampaign(id) {
  return getAll()[id] || null;
}

export function updateChecklist(id, key, value) {
  const store = getAll();
  if (!store[id]) return;
  store[id].checklist[key] = value;
  // Mark approved only when all three prereqs are done
  store[id].checklist.approved =
    store[id].checklist.images_replaced &&
    store[id].checklist.copy_reviewed &&
    store[id].checklist.targeting_checked;
  localStorage.setItem(KEY, JSON.stringify(store));
  return store[id];
}

export function isReady(id) {
  const c = getCampaign(id);
  return !c || c.checklist.approved; // unknown campaigns are assumed ready
}

export function needsSetup(id) {
  const c = getCampaign(id);
  return c && !c.checklist.approved;
}

export function pendingCampaigns() {
  return Object.values(getAll()).filter(c => !c.checklist.approved);
}
