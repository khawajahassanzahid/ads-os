import { useState, useEffect, useRef } from "react";

// ─── STORAGE HELPERS (localStorage) ─────────────────────────────────────────
function lsGet(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function lsDel(key) { try { localStorage.removeItem(key); } catch {} }
function lsKeys(prefix) { try { return Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch { return []; } }

async function loadBrands() {
  try {
    return lsKeys("brand:").map(k => lsGet(k)).filter(Boolean).sort((a,b) => a.createdAt - b.createdAt);
  } catch { return []; }
}
async function saveBrand(b) { lsSet(`brand:${b.id}`, b); }
async function loadChats(bid) {
  try {
    return lsKeys(`chat:${bid}:`).map(k => lsGet(k)).filter(Boolean).sort((a,b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}
async function saveChat(bid, chat) { lsSet(`chat:${bid}:${chat.id}`, chat); }
async function deleteChat(bid, cid) { lsDel(`chat:${bid}:${cid}`); }
async function loadBlueprints(bid) {
  try {
    return lsKeys(`bp:${bid}:`).map(k => lsGet(k)).filter(Boolean).sort((a,b) => b.createdAt - a.createdAt);
  } catch { return []; }
}
async function saveBlueprint(bid, bp) { lsSet(`bp:${bid}:${bp.id}`, bp); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ─── AI HELPERS ───────────────────────────────────────────────────────────────
const CLAUDE = "claude-sonnet-4-20250514";
async function askClaude(system, messages) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model: CLAUDE, max_tokens: 1000, system, messages })
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "Error — please try again.";
}

// ─── SYSTEM PROMPTS ───────────────────────────────────────────────────────────
const CHAT_SYSTEM = (brand) => `You are an elite Meta & Google Ads strategist. You know every platform setting, best practice, bidding strategy, audience type, and optimization lever inside out. You give specific, tactical, numbered advice with exact settings and thresholds — never vague.

Brand context:
- Name: ${brand?.name || "Unknown"}
- Industry: ${brand?.industry || "Not specified"}
- Monthly budget: ${brand?.monthlyBudget ? getCurrencySymbol(brand.currency) + Number(brand.monthlyBudget).toLocaleString() + " " + (brand.currency||"USD") : "Not set"}
- Goals: ${brand?.goals || "Not specified"}
- Meta Account ID: ${brand?.metaAccountId || "Not connected"}
- Google Account ID: ${brand?.googleAccountId || "Not connected"}
- Notes: ${brand?.notes || "None"}

Always tailor advice to this brand's specific context and budget.`;

const BLUEPRINT_SYSTEM = (brand) => `You are an elite paid media strategist building a complete campaign blueprint. You must return ONLY a valid JSON object — no markdown, no explanation, no preamble.

Brand:
- Name: ${brand.name}
- Industry: ${brand.industry || "General"}
- Monthly budget: ${getCurrencySymbol(brand.currency)}${brand.monthlyBudget || 5000} ${brand.currency||"USD"}
- Goals: ${brand.goals || "Drive conversions"}
- Notes: ${brand.notes || ""}

Build a complete, expert campaign blueprint. Return this exact JSON structure:
{
  "summary": "2-sentence overview of the strategy",
  "totalBudget": { "monthly": number, "meta": number, "google": number, "reasoning": "string" },
  "meta": {
    "campaigns": [
      {
        "name": "string",
        "objective": "string (OUTCOME_SALES / LEAD_GENERATION / AWARENESS etc)",
        "budgetType": "CBO or ABO",
        "dailyBudget": number,
        "funnel": "TOF or MOF or BOF",
        "adSets": [
          {
            "name": "string",
            "audience": "string (describe targeting)",
            "ageRange": "string e.g. 25-54",
            "placements": "Advantage+ or Manual - Feed, Reels, Stories",
            "optimization": "string (PURCHASE, LEAD, etc)",
            "bidStrategy": "LOWEST_COST or COST_CAP or BID_CAP",
            "dailyBudget": number,
            "adFormats": ["image", "video", "carousel"],
            "creativeBrief": "string - what images/videos to use"
          }
        ]
      }
    ],
    "pixelChecklist": ["string"],
    "audiencesToBuild": ["string"]
  },
  "google": {
    "campaigns": [
      {
        "name": "string",
        "type": "SEARCH or PERFORMANCE_MAX or SHOPPING or DISPLAY",
        "dailyBudget": number,
        "biddingStrategy": "string",
        "targetCpa": number,
        "adGroups": [
          {
            "name": "string",
            "keywords": ["string"],
            "negativeKeywords": ["string"],
            "headlines": ["string"],
            "descriptions": ["string"],
            "creativeBrief": "string - what assets to create"
          }
        ]
      }
    ],
    "conversionTracking": ["string"],
    "audienceSignals": ["string"]
  },
  "priorityActions": [
    { "order": number, "platform": "Meta or Google or Both", "action": "string", "impact": "HIGH or MEDIUM" }
  ],
  "creativeNeeded": {
    "meta": ["string - describe each creative asset needed"],
    "google": ["string - describe each asset needed"]
  }
}`;

const AUDIT_SYSTEM = (brand) => `You are an elite Meta & Google Ads auditor. Audit the provided campaign structure against best practices. Return ONLY valid JSON — no preamble.

Brand: ${brand.name}, Industry: ${brand.industry || "General"}, Budget: ${getCurrencySymbol(brand.currency)}${brand.monthlyBudget || "unknown"} ${brand.currency||"USD"}/mo

Return this exact JSON:
{
  "score": number (0-100),
  "grade": "A/B/C/D/F",
  "summary": "string",
  "meta": {
    "checks": [
      { "category": "string", "item": "string", "status": "PASS|WARN|FAIL", "detail": "string", "fix": "string" }
    ]
  },
  "google": {
    "checks": [
      { "category": "string", "item": "string", "status": "PASS|WARN|FAIL", "detail": "string", "fix": "string" }
    ]
  },
  "topFixes": [
    { "priority": number, "platform": "Meta|Google|Both", "action": "string", "expectedImpact": "string" }
  ]
}`;

// ─── QUICK PROMPTS ────────────────────────────────────────────────────────────
const QUICK = [
  { icon: "🔍", label: "Full Audit", p: "Run a complete audit of our Meta and Google Ads setup. Check every element against best practices and give me a prioritized fix list with exact steps." },
  { icon: "📉", label: "Diagnose ROAS Drop", p: "Our ROAS dropped significantly. Walk me through a complete diagnostic — check creative fatigue, audience saturation, tracking issues, bid strategy, and give me an action plan." },
  { icon: "⚡", label: "Scale Strategy", p: "We're profitable and want to scale. Give me a step-by-step scaling plan for both Meta and Google — what to increase, in what order, and what metrics to watch." },
  { icon: "🎯", label: "Audience Gaps", p: "Audit our audience strategy across Meta and Google. What audiences are we likely missing? Build me a complete audience map for TOF, MOF, and BOF." },
  { icon: "🔧", label: "Tracking Audit", p: "Audit our complete tracking setup — Meta Pixel, CAPI, Google Conversion Tracking, Enhanced Conversions. What's missing and how do I fix it step by step?" },
  { icon: "📋", label: "Creative Brief", p: "Write me a complete creative brief for our next campaign cycle. What ad formats, hooks, messaging angles, and creative specs do we need for Meta and Google?" },
];

const BRAND_COLORS = ["#0082FB","#00C853","#FF6B35","#F59E0B","#EC4899","#8B5CF6","#06B6D4","#EF4444"];
const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD — US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR — Euro" },
  { code: "PKR", symbol: "₨", label: "PKR — Pakistani Rupee" },
  { code: "GBP", symbol: "£", label: "GBP — British Pound" },
  { code: "AED", symbol: "د.إ", label: "AED — UAE Dirham" },
  { code: "SAR", symbol: "﷼", label: "SAR — Saudi Riyal" },
];
const getCurrencySymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || "$";

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = { PASS: ["#0D2B1A","#00C853","✅"], WARN: ["#2B1F0A","#F59E0B","⚠️"], FAIL: ["#2B0A0A","#EF4444","❌"] }[status] || ["#1E2535","#4A5568","•"];
  return <span style={{ background: cfg[0], color: cfg[1], border: `1px solid ${cfg[1]}40`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{cfg[2]} {status}</span>;
}

function Spinner({ color = "#0082FB", size = 16 }) {
  return <div style={{ width: size, height: size, border: `2px solid ${color}40`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function AdsOS() {
  const [appView, setAppView] = useState("loading");
  const [brands, setBrands] = useState([]);
  const [activeBrand, setActiveBrand] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [blueprints, setBlueprints] = useState([]);
  const [activeBlueprint, setActiveBlueprint] = useState(null);
  const [brandTab, setBrandTab] = useState("overview"); // overview | chat | blueprint | audit
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [bpLoading, setBpLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [brandForm, setBrandForm] = useState({ name:"",industry:"",website:"",monthlyBudget:"",currency:"USD",goals:"",metaAccountId:"",googleAccountId:"",notes:"",color:"#0082FB" });
  const [bpGoal, setBpGoal] = useState("");
  const [notification, setNotification] = useState(null);
  const messagesEnd = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadBrands().then(b => { setBrands(b); setAppView("home"); }); }, []);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, aiLoading]);
  useEffect(() => {
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 180) + "px"; }
  }, [input]);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const openBrand = async (brand) => {
    setActiveBrand(brand);
    const [c, b] = await Promise.all([loadChats(brand.id), loadBlueprints(brand.id)]);
    setChats(c); setBlueprints(b);
    setActiveChat(null); setMessages([]);
    setActiveBlueprint(b[0] || null);
    setAuditResult(null);
    setBrandTab("overview");
    setAppView("brand");
  };

  const saveBrandForm = async () => {
    if (!brandForm.name.trim()) return;
    const brand = editingBrand ? { ...editingBrand, ...brandForm } : { id: uid(), ...brandForm, createdAt: Date.now() };
    await saveBrand(brand);
    setBrands(prev => editingBrand ? prev.map(b => b.id === brand.id ? brand : b) : [...prev, brand]);
    if (activeBrand?.id === brand.id) setActiveBrand(brand);
    setShowBrandModal(false); setEditingBrand(null);
    setBrandForm({ name:"",industry:"",website:"",monthlyBudget:"",currency:"USD",goals:"",metaAccountId:"",googleAccountId:"",notes:"",color:"#0082FB" });
    notify(`${brand.name} saved`);
  };

  const startChat = async (initialPrompt) => {
    const chat = { id: uid(), brandId: activeBrand.id, title: initialPrompt ? initialPrompt.slice(0,48)+"…" : "New conversation", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    await saveChat(activeBrand.id, chat);
    setChats(prev => [chat, ...prev]);
    setActiveChat(chat); setMessages([]);
    setBrandTab("chat");
    if (initialPrompt) setTimeout(() => sendMsg(initialPrompt, chat, []), 100);
  };

  const sendMsg = async (text, chatOverride, msgsOverride) => {
    const userText = text || input.trim();
    if (!userText || aiLoading) return;
    setInput("");
    const chat = chatOverride || activeChat;
    const prev = msgsOverride !== undefined ? msgsOverride : messages;
    const newMsgs = [...prev, { role: "user", content: userText }];
    setMessages(newMsgs); setAiLoading(true);
    try {
      const reply = await askClaude(CHAT_SYSTEM(activeBrand), newMsgs.map(m => ({ role: m.role, content: m.content })));
      const final = [...newMsgs, { role: "assistant", content: reply }];
      setMessages(final);
      const updated = { ...chat, title: chat.title === "New conversation" ? userText.slice(0,48) : chat.title, messages: final, updatedAt: Date.now() };
      await saveChat(activeBrand.id, updated);
      setActiveChat(updated);
      setChats(prev => prev.map(c => c.id === updated.id ? updated : c).sort((a,b) => b.updatedAt - a.updatedAt));
    } catch { setMessages([...newMsgs, { role: "assistant", content: "Error — please try again." }]); }
    finally { setAiLoading(false); }
  };

  const generateBlueprint = async () => {
    setBpLoading(true); setBrandTab("blueprint");
    try {
      const prompt = bpGoal ? `Generate a campaign blueprint focused on: ${bpGoal}` : "Generate a complete campaign blueprint based on this brand's goals and budget.";
      const raw = await askClaude(BLUEPRINT_SYSTEM(activeBrand), [{ role: "user", content: prompt }]);
      const clean = raw.replace(/```json|```/g, "").trim();
      const bp = { id: uid(), brandId: activeBrand.id, data: JSON.parse(clean), goal: bpGoal || "Full campaign strategy", createdAt: Date.now() };
      await saveBlueprint(activeBrand.id, bp);
      setBlueprints(prev => [bp, ...prev]);
      setActiveBlueprint(bp);
      setBpGoal("");
      notify("Blueprint generated!");
    } catch (e) { notify("Blueprint generation failed — try again", "error"); }
    finally { setBpLoading(false); }
  };

  const runAudit = async () => {
    setAuditLoading(true); setBrandTab("audit"); setAuditResult(null);
    try {
      const context = activeBlueprint ? JSON.stringify(activeBlueprint.data).slice(0, 2000) : "No campaign structure provided — audit based on brand info only.";
      const raw = await askClaude(AUDIT_SYSTEM(activeBrand), [{ role: "user", content: `Audit this campaign setup: ${context}` }]);
      const clean = raw.replace(/```json|```/g, "").trim();
      setAuditResult(JSON.parse(clean));
      notify("Audit complete!");
    } catch { notify("Audit failed — try again", "error"); }
    finally { setAuditLoading(false); }
  };

  const bc = activeBrand?.color || "#0082FB";

  const fmt = (text) => text.split("\n").map((line, i) => {
    if (/^━+/.test(line)) return <div key={i} style={{ borderTop: `1px solid ${bc}30`, margin: "12px 0 8px" }} />;
    if (/^\*\*.*\*\*$/.test(line.trim())) return <div key={i} style={{ fontWeight: 700, color: bc, marginTop: 12, marginBottom: 3, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>{line.replace(/\*\*/g,"")}</div>;
    if (line.startsWith("• ") || line.startsWith("- ")) return <div key={i} style={{ display:"flex", gap:8, paddingLeft:8, marginBottom:3, fontSize:13 }}><span style={{ color:bc, flexShrink:0 }}>›</span><span>{line.slice(2)}</span></div>;
    if (/^\d+\. /.test(line)) return <div key={i} style={{ paddingLeft:16, marginBottom:3, fontSize:13 }}>{line}</div>;
    if (line.trim()==="") return <div key={i} style={{ height:5 }} />;
    return <div key={i} style={{ fontSize:13, lineHeight:1.75, color:"#C8D3E8", marginBottom:2 }}>{line}</div>;
  });

  const S = {
    app: { minHeight:"100vh", background:"#06080F", color:"#D8E0F0", fontFamily:"'Syne','Helvetica Neue',sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" },
    topbar: { height:52, background:"#06080F", borderBottom:"1px solid #0F1520", display:"flex", alignItems:"center", padding:"0 16px", gap:10, flexShrink:0, zIndex:20 },
    sidebar: { width: sidebarOpen ? 248 : 0, background:"#08090F", borderRight:"1px solid #0F1520", display:"flex", flexDirection:"column", overflow:"hidden", transition:"width 0.25s ease", flexShrink:0 },
    content: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
    card: { background:"#08090F", border:"1px solid #0F1520", borderRadius:14, padding:"16px 18px" },
    input: { background:"#0C0E18", border:"1px solid #1E2535", borderRadius:10, padding:"9px 13px", color:"#D8E0F0", fontSize:13, outline:"none", width:"100%", fontFamily:"inherit" },
    tab: (active) => ({ padding:"8px 16px", borderRadius:"8px 8px 0 0", fontSize:12, fontWeight:700, letterSpacing:"0.03em", border:"none", cursor:"pointer", fontFamily:"inherit", background: active ? "#0E1420" : "transparent", color: active ? bc : "#2A3550", borderBottom: active ? `2px solid ${bc}` : "2px solid transparent", transition:"all 0.15s" }),
    btn: (color, ghost) => ({ background: ghost ? "transparent" : (color || bc), border: `1px solid ${ghost ? "#1E2535" : (color || bc)}`, borderRadius:10, padding:"9px 18px", color: ghost ? "#4A5568" : "#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:7, transition:"all 0.15s", whiteSpace:"nowrap" }),
    iconBtn: { background:"transparent", border:"none", cursor:"pointer", color:"#4A5568", padding:6, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" },
  };

  if (appView === "loading") return (
    <div style={{ ...S.app, alignItems:"center", justifyContent:"center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap'); @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Spinner size={32} color="#0082FB" />
    </div>
  );

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1E2535;border-radius:2px}
        textarea,input{font-family:'Syne','Helvetica Neue',sans-serif} textarea{resize:none}
        textarea::placeholder,input::placeholder{color:#2A3550}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        .fade-up{animation:fadeUp 0.3s ease}
        .hov:hover{opacity:0.85} .hov-bg:hover{background:#0C0E18 !important}
        .hov-card:hover{transform:translateY(-2px);border-color:#1E2535 !important}
        .send-btn:hover:not(:disabled){transform:scale(1.05)} .send-btn:disabled{opacity:0.3;cursor:not-allowed}
        .del:opacity{0} .chat-row:hover .del{opacity:1!important}
        input:focus,textarea:focus{border-color:#2A3550!important;outline:none}
        .modal{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .notif{position:fixed;bottom:24px;right:24px;z-index:300;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:700;font-family:'Syne',sans-serif;animation:slideIn 0.3s ease;pointer-events:none}
      `}</style>

      {/* NOTIFICATION */}
      {notification && (
        <div className="notif" style={{ background: notification.type === "error" ? "#2B0A0A" : "#0D2B1A", color: notification.type === "error" ? "#EF4444" : "#00C853", border: `1px solid ${notification.type === "error" ? "#EF444440" : "#00C85340"}` }}>
          {notification.type === "error" ? "❌" : "✅"} {notification.msg}
        </div>
      )}

      {/* TOPBAR */}
      <div style={S.topbar}>
        <button style={S.iconBtn} onClick={() => setSidebarOpen(v => !v)}>
          <svg width="18" height="14" fill="none"><rect width="18" height="2" rx="1" fill="currentColor"/><rect y="6" width="18" height="2" rx="1" fill="currentColor"/><rect y="12" width="18" height="2" rx="1" fill="currentColor"/></svg>
        </button>
        <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${bc},${bc}99)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, transition:"all 0.3s" }}>⚡</div>
        <span style={{ fontWeight:800, fontSize:15, letterSpacing:"-0.02em", flex:1 }}>
          {activeBrand ? activeBrand.name : "Ads OS"}
          {activeBrand && <span style={{ fontSize:11, color:"#2A3550", marginLeft:8 }}>{activeBrand.industry || "Paid Media"}</span>}
        </span>
        {activeBrand && (
          <div style={{ display:"flex", gap:6 }}>
            <button style={S.btn(bc, true)} className="hov" onClick={() => setBrandTab("blueprint")}>🗺 Blueprint</button>
            <button style={S.btn(bc)} className="hov" onClick={() => startChat()}>+ Chat</button>
          </div>
        )}
        {!activeBrand && <button style={S.btn("#0082FB")} className="hov" onClick={() => { setEditingBrand(null); setBrandForm({name:"",industry:"",website:"",monthlyBudget:"",currency:"USD",goals:"",metaAccountId:"",googleAccountId:"",notes:"",color:"#0082FB"}); setShowBrandModal(true); }}>+ Brand</button>}
      </div>

      <div style={S.main}>
        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={{ padding:"14px 12px 8px", overflowY:"auto", flex:1, minWidth:248 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:"#2A3550", marginBottom:8, textTransform:"uppercase" }}>Brands</div>
            {brands.map(b => (
              <div key={b.id} className="hov-bg" onClick={() => openBrand(b)} style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 9px", borderRadius:9, cursor:"pointer", background: activeBrand?.id===b.id ? "#0F1520" : "transparent", marginBottom:2, transition:"background 0.15s" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background: b.color||"#0082FB", flexShrink:0 }} />
                <span style={{ fontSize:13, fontWeight: activeBrand?.id===b.id ? 700 : 500, color: activeBrand?.id===b.id ? "#D8E0F0" : "#4A5568", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.name}</span>
              </div>
            ))}
            <div className="hov-bg" onClick={() => { setEditingBrand(null); setBrandForm({name:"",industry:"",website:"",monthlyBudget:"",currency:"USD",goals:"",metaAccountId:"",googleAccountId:"",notes:"",color:"#0082FB"}); setShowBrandModal(true); }} style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 9px", borderRadius:9, cursor:"pointer", marginTop:2 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", border:"1px dashed #2A3550", flexShrink:0 }} />
              <span style={{ fontSize:12, color:"#2A3550" }}>Add brand…</span>
            </div>

            {activeBrand && chats.length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:"#2A3550", margin:"16px 0 8px", textTransform:"uppercase" }}>Chats</div>
                {chats.map(c => (
                  <div key={c.id} className="chat-row hov-bg" onClick={() => { setActiveChat(c); setMessages(c.messages||[]); setBrandTab("chat"); }} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 9px", borderRadius:9, cursor:"pointer", background: activeChat?.id===c.id ? "#0F1520" : "transparent", marginBottom:2, transition:"background 0.15s" }}>
                    <div style={{ flex:1, overflow:"hidden" }}>
                      <div style={{ fontSize:12, fontWeight: activeChat?.id===c.id ? 700 : 400, color: activeChat?.id===c.id ? "#D8E0F0" : "#4A5568", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</div>
                      <div style={{ fontSize:10, color:"#1E2535" }}>{new Date(c.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button className="del" onClick={e => { e.stopPropagation(); deleteChat(activeBrand.id, c.id); setChats(p => p.filter(x => x.id!==c.id)); if(activeChat?.id===c.id){setActiveChat(null);setMessages([]);} }} style={{ opacity:0, background:"none", border:"none", color:"#EF4444", cursor:"pointer", fontSize:16, padding:"2px 4px", transition:"opacity 0.15s" }}>×</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={S.content}>

          {/* HOME */}
          {appView === "home" && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40, overflowY:"auto" }}>
              <div style={{ textAlign:"center", maxWidth:560 }} className="fade-up">
                <div style={{ fontSize:52, marginBottom:16 }}>⚡</div>
                <h1 style={{ fontWeight:800, fontSize:30, letterSpacing:"-0.03em", marginBottom:10 }}>Ads OS</h1>
                <p style={{ color:"#2A3550", fontSize:14, lineHeight:1.7, marginBottom:36 }}>Build campaigns, run audits, get expert advice — all in one place. Each brand gets its own workspace.</p>
                {brands.length === 0 ? (
                  <button style={S.btn("#0082FB")} className="hov" onClick={() => setShowBrandModal(true)}>Create your first brand →</button>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(190px,1fr))", gap:10 }}>
                    {brands.map(b => (
                      <div key={b.id} className="hov-card" onClick={() => openBrand(b)} style={{ ...S.card, cursor:"pointer", textAlign:"left", transition:"all 0.2s" }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:`${b.color||"#0082FB"}20`, border:`1px solid ${b.color||"#0082FB"}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:b.color||"#0082FB", marginBottom:10 }}>{b.name[0].toUpperCase()}</div>
                        <div style={{ fontWeight:700, fontSize:14, color:"#D8E0F0", marginBottom:3 }}>{b.name}</div>
                        <div style={{ fontSize:11, color:"#2A3550" }}>{b.industry||"Paid Media"}</div>
                        {b.monthlyBudget && <div style={{ fontSize:11, color:b.color||"#0082FB", marginTop:5 }}>{getCurrencySymbol(b.currency)}{Number(b.monthlyBudget).toLocaleString()}/mo</div>}
                      </div>
                    ))}
                    <div className="hov-card" onClick={() => { setEditingBrand(null); setBrandForm({name:"",industry:"",website:"",monthlyBudget:"",currency:"USD",goals:"",metaAccountId:"",googleAccountId:"",notes:"",color:"#0082FB"}); setShowBrandModal(true); }} style={{ ...S.card, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#2A3550", fontSize:13, transition:"all 0.2s", border:"1px dashed #1E2535", background:"transparent" }}>+ Add Brand</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BRAND WORKSPACE */}
          {appView === "brand" && activeBrand && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Tabs */}
              <div style={{ borderBottom:"2px solid #0F1520", padding:"0 20px", display:"flex", gap:4, background:"#06080F", flexShrink:0 }}>
                {[["overview","🏠 Overview"],["chat","💬 Chat"],["blueprint","🗺 Blueprint"],["audit","🔍 Audit"]].map(([id,label]) => (
                  <button key={id} style={S.tab(brandTab===id)} onClick={() => setBrandTab(id)}>{label}</button>
                ))}
              </div>

              {/* OVERVIEW */}
              {brandTab === "overview" && (
                <div style={{ flex:1, overflowY:"auto", padding:"24px 24px" }}>
                  <div style={{ maxWidth:800, margin:"0 auto" }} className="fade-up">
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ width:48, height:48, borderRadius:14, background:`${bc}20`, border:`2px solid ${bc}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:bc }}>{activeBrand.name[0]}</div>
                        <div>
                          <h2 style={{ fontWeight:800, fontSize:20, letterSpacing:"-0.02em" }}>{activeBrand.name}</h2>
                          <div style={{ fontSize:12, color:"#2A3550", marginTop:2 }}>{activeBrand.industry||"Paid Media"}{activeBrand.website ? ` · ${activeBrand.website}` : ""}</div>
                        </div>
                      </div>
                      <button style={S.btn(bc, true)} className="hov" onClick={() => { setEditingBrand(activeBrand); setBrandForm({name:activeBrand.name, industry:activeBrand.industry||"", website:activeBrand.website||"", monthlyBudget:activeBrand.monthlyBudget||"", currency:activeBrand.currency||"USD", goals:activeBrand.goals||"", metaAccountId:activeBrand.metaAccountId||"", googleAccountId:activeBrand.googleAccountId||"", notes:activeBrand.notes||"", color:activeBrand.color||"#0082FB"}); setShowBrandModal(true); }}>Edit</button>
                    </div>

                    {/* Account status cards */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:24 }}>
                      {[
                        { label:"Budget / mo", value: activeBrand.monthlyBudget ? `${getCurrencySymbol(activeBrand.currency)}${Number(activeBrand.monthlyBudget).toLocaleString()}` : "Not set", color:bc },
                        { label:"Meta Account", value: activeBrand.metaAccountId || "Not connected", color:"#0082FB", warn:!activeBrand.metaAccountId },
                        { label:"Google Account", value: activeBrand.googleAccountId || "Not connected", color:"#34A853", warn:!activeBrand.googleAccountId },
                      ].map((s,i) => (
                        <div key={i} style={S.card}>
                          <div style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>{s.label}</div>
                          <div style={{ fontSize:14, fontWeight:700, color: s.warn ? "#2A3550" : s.color }}>{s.value}</div>
                          {s.warn && <div style={{ fontSize:10, color:"#F59E0B", marginTop:4 }}>⚠️ Add in Edit</div>}
                        </div>
                      ))}
                    </div>

                    {/* Quick actions */}
                    <div style={{ marginBottom:24 }}>
                      <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"#2A3550", textTransform:"uppercase", marginBottom:12 }}>Quick Actions</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:8 }}>
                        {QUICK.map((q,i) => (
                          <div key={i} className="hov-card" onClick={() => startChat(q.p)} style={{ ...S.card, cursor:"pointer", background:`${bc}08`, border:`1px solid ${bc}20`, transition:"all 0.2s" }}>
                            <div style={{ fontSize:20, marginBottom:8 }}>{q.icon}</div>
                            <div style={{ fontWeight:700, fontSize:13, color:"#D8E0F0", marginBottom:3 }}>{q.label}</div>
                            <div style={{ fontSize:11, color:"#2A3550", lineHeight:1.5 }}>{q.p.slice(0,65)}…</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Generate Blueprint CTA */}
                    <div style={{ ...S.card, background:`${bc}08`, border:`1px solid ${bc}30`, display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
                      <div style={{ fontSize:32 }}>🗺</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>Generate Campaign Blueprint</div>
                        <div style={{ fontSize:12, color:"#2A3550" }}>AI builds your complete Meta + Google campaign structure with all settings, audiences, budgets, and creative briefs. Then review and push it live.</div>
                      </div>
                      <button style={S.btn(bc)} className="hov" onClick={() => setBrandTab("blueprint")}>Build →</button>
                    </div>

                    {/* Recent chats */}
                    {chats.length > 0 && (
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"#2A3550", textTransform:"uppercase", marginBottom:10 }}>Recent Chats</div>
                        {chats.slice(0,4).map(c => (
                          <div key={c.id} className="hov-bg" onClick={() => { setActiveChat(c); setMessages(c.messages||[]); setBrandTab("chat"); }} style={{ ...S.card, cursor:"pointer", display:"flex", alignItems:"center", gap:12, marginBottom:6, transition:"background 0.15s" }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background:bc, flexShrink:0 }} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600 }}>{c.title}</div>
                              <div style={{ fontSize:11, color:"#2A3550", marginTop:1 }}>{c.messages?.length||0} messages · {new Date(c.updatedAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CHAT */}
              {brandTab === "chat" && (
                <>
                  <div style={{ flex:1, overflowY:"auto", padding:"18px 0" }}>
                    <div style={{ maxWidth:740, margin:"0 auto", padding:"0 18px" }}>
                      {!activeChat && (
                        <div style={{ textAlign:"center", padding:"48px 0" }} className="fade-up">
                          <div style={{ fontSize:28, marginBottom:10 }}>💬</div>
                          <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Ask anything about {activeBrand.name}</div>
                          <div style={{ fontSize:13, color:"#2A3550", marginBottom:24 }}>Campaigns, audits, creative, scaling — I know it all.</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                            {QUICK.slice(0,4).map((q,i) => (
                              <button key={i} style={{ ...S.btn(bc, true), fontSize:11 }} className="hov" onClick={() => startChat(q.p)}>{q.icon} {q.label}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {messages.map((msg, i) => (
                        <div key={i} className="fade-up" style={{ marginBottom:16, display:"flex", flexDirection: msg.role==="user" ? "row-reverse" : "row", gap:9, alignItems:"flex-start" }}>
                          {msg.role==="assistant" && <div style={{ width:26, height:26, borderRadius:7, background:`${bc}25`, border:`1px solid ${bc}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0, color:bc, fontWeight:800, marginTop:2 }}>⚡</div>}
                          <div style={{ maxWidth:"80%", background: msg.role==="user" ? `${bc}15` : "#08090F", border:`1px solid ${msg.role==="user" ? bc+"30" : "#0F1520"}`, borderRadius: msg.role==="user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding:"12px 15px" }}>
                            {msg.role==="assistant" ? fmt(msg.content) : <div style={{ fontSize:13, color:"#D8E0F0" }}>{msg.content}</div>}
                          </div>
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="fade-up" style={{ display:"flex", gap:9, alignItems:"flex-start", marginBottom:16 }}>
                          <div style={{ width:26, height:26, borderRadius:7, background:`${bc}25`, border:`1px solid ${bc}40`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Spinner color={bc} size={12} /></div>
                          <div style={{ background:"#08090F", border:"1px solid #0F1520", borderRadius:"4px 14px 14px 14px", padding:"13px 16px", display:"flex", gap:5 }}>
                            {[0,1,2].map(n => <div key={n} style={{ width:5, height:5, borderRadius:"50%", background:bc, animation:"pulse 1.2s ease infinite", animationDelay:`${n*0.2}s` }} />)}
                          </div>
                        </div>
                      )}
                      <div ref={messagesEnd} />
                    </div>
                  </div>
                  <div style={{ borderTop:"1px solid #0F1520", padding:"12px 18px", background:"#06080F" }}>
                    <div style={{ maxWidth:740, margin:"0 auto" }}>
                      <div style={{ display:"flex", gap:9, background:"#08090F", border:`1px solid ${bc}40`, borderRadius:13, padding:"9px 13px", alignItems:"flex-end" }}>
                        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); if(!activeChat) startChat(input); else sendMsg(); }}} placeholder="Ask about campaigns, targeting, creative…" rows={1} style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"#D8E0F0", fontSize:13.5, lineHeight:1.6, maxHeight:180, overflowY:"auto", fontFamily:"inherit" }} />
                        <button className="send-btn" onClick={() => { if(!activeChat) startChat(input); else sendMsg(); }} disabled={!input.trim()||aiLoading} style={{ width:32, height:32, borderRadius:8, background: input.trim() ? bc : "#1E2535", border:"none", cursor: input.trim() ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:15, transition:"all 0.15s" }}>
                          {aiLoading ? <Spinner color="#fff" size={13} /> : "↑"}
                        </button>
                      </div>
                      <div style={{ textAlign:"center", marginTop:6, fontSize:10, color:"#1E2535" }}>Shift+Enter for new line</div>
                    </div>
                  </div>
                </>
              )}

              {/* BLUEPRINT */}
              {brandTab === "blueprint" && (
                <div style={{ flex:1, overflowY:"auto", padding:"20px" }}>
                  <div style={{ maxWidth:880, margin:"0 auto" }} className="fade-up">
                    {/* Generate section */}
                    <div style={{ ...S.card, background:`${bc}08`, border:`1px solid ${bc}30`, marginBottom:20 }}>
                      <div style={{ fontWeight:800, fontSize:16, marginBottom:4 }}>🗺 Campaign Blueprint Generator</div>
                      <div style={{ fontSize:12, color:"#2A3550", marginBottom:16 }}>The AI will design your complete Meta + Google campaign structure — every setting, audience, keyword, bid strategy, and creative brief. Review it, then push it live.</div>
                      <div style={{ display:"flex", gap:10 }}>
                        <input style={{ ...S.input, flex:1 }} value={bpGoal} onChange={e => setBpGoal(e.target.value)} placeholder="Optional focus: e.g. 'maximize purchases under $30 CPA' or leave blank for full strategy" onKeyDown={e => e.key==="Enter" && !bpLoading && generateBlueprint()} />
                        <button style={S.btn(bc)} className="hov" onClick={generateBlueprint} disabled={bpLoading}>
                          {bpLoading ? <><Spinner color="#fff" size={13} /> Generating…</> : "⚡ Generate"}
                        </button>
                      </div>
                    </div>

                    {bpLoading && (
                      <div style={{ textAlign:"center", padding:"40px 0" }}>
                        <Spinner color={bc} size={28} />
                        <div style={{ marginTop:14, fontSize:13, color:"#2A3550" }}>Building your campaign blueprint…</div>
                        <div style={{ fontSize:11, color:"#1E2535", marginTop:4 }}>Designing structure, audiences, bids, and creative briefs</div>
                      </div>
                    )}

                    {activeBlueprint && !bpLoading && (() => {
                      const bp = activeBlueprint.data;
                      return (
                        <div>
                          {/* Summary + budget */}
                          <div style={{ ...S.card, marginBottom:14 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:bc, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Strategy Overview</div>
                            <div style={{ fontSize:13.5, lineHeight:1.7, marginBottom:14 }}>{bp.summary}</div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                              {[["Total Monthly", `$${bp.totalBudget?.monthly?.toLocaleString()||"—"}`], ["Meta Budget", `$${bp.totalBudget?.meta?.toLocaleString()||"—"}`], ["Google Budget", `$${bp.totalBudget?.google?.toLocaleString()||"—"}`]].map(([l,v],i) => (
                                <div key={i} style={{ background:"#06080F", borderRadius:10, padding:"10px 14px", border:"1px solid #0F1520" }}>
                                  <div style={{ fontSize:10, color:"#2A3550", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{l}</div>
                                  <div style={{ fontWeight:800, fontSize:16, color:bc }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            {bp.totalBudget?.reasoning && <div style={{ fontSize:12, color:"#2A3550", marginTop:10, padding:"10px", background:"#06080F", borderRadius:8, border:"1px solid #0F1520" }}>💡 {bp.totalBudget.reasoning}</div>}
                          </div>

                          {/* META Campaigns */}
                          <div style={{ fontWeight:800, fontSize:15, marginBottom:10, color:"#0082FB", display:"flex", alignItems:"center", gap:8 }}>◈ Meta Campaigns</div>
                          {bp.meta?.campaigns?.map((camp, ci) => (
                            <div key={ci} style={{ ...S.card, marginBottom:10, borderLeft:`3px solid #0082FB` }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:14 }}>{camp.name}</div>
                                  <div style={{ fontSize:11, color:"#2A3550", marginTop:2 }}>{camp.objective} · {camp.budgetType} · ${camp.dailyBudget}/day · {camp.funnel}</div>
                                </div>
                                <span style={{ background:"#0082FB20", color:"#0082FB", border:"1px solid #0082FB40", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{camp.funnel}</span>
                              </div>
                              {camp.adSets?.map((as, ai) => (
                                <div key={ai} style={{ background:"#06080F", borderRadius:10, padding:"12px 14px", marginBottom:6, border:"1px solid #0F1520" }}>
                                  <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>{as.name}</div>
                                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                                    {[["Audience", as.audience],["Ages", as.ageRange],["Placements", as.placements],["Bid Strategy", as.bidStrategy],["Budget", `$${as.dailyBudget}/day`],["Optimization", as.optimization]].map(([l,v],j) => (
                                      <div key={j} style={{ fontSize:11 }}><span style={{ color:"#2A3550" }}>{l}: </span><span style={{ color:"#C8D3E8" }}>{v}</span></div>
                                    ))}
                                  </div>
                                  <div style={{ fontSize:11, color:"#2A3550", marginBottom:4 }}>Ad Formats: <span style={{ color:"#C8D3E8" }}>{as.adFormats?.join(", ")}</span></div>
                                  <div style={{ fontSize:11, background:"#0082FB10", border:"1px solid #0082FB20", borderRadius:7, padding:"7px 10px", color:"#C8D3E8" }}>🎨 Creative: {as.creativeBrief}</div>
                                </div>
                              ))}
                            </div>
                          ))}

                          {/* GOOGLE Campaigns */}
                          <div style={{ fontWeight:800, fontSize:15, marginBottom:10, marginTop:20, color:"#34A853", display:"flex", alignItems:"center", gap:8 }}>◉ Google Campaigns</div>
                          {bp.google?.campaigns?.map((camp, ci) => (
                            <div key={ci} style={{ ...S.card, marginBottom:10, borderLeft:`3px solid #34A853` }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:14 }}>{camp.name}</div>
                                  <div style={{ fontSize:11, color:"#2A3550", marginTop:2 }}>{camp.type} · {camp.biddingStrategy} · ${camp.dailyBudget}/day{camp.targetCpa ? ` · tCPA: $${camp.targetCpa}` : ""}</div>
                                </div>
                                <span style={{ background:"#34A85320", color:"#34A853", border:"1px solid #34A85340", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{camp.type}</span>
                              </div>
                              {camp.adGroups?.map((ag, ai) => (
                                <div key={ai} style={{ background:"#06080F", borderRadius:10, padding:"12px 14px", marginBottom:6, border:"1px solid #0F1520" }}>
                                  <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>{ag.name}</div>
                                  {ag.headlines?.length > 0 && <div style={{ marginBottom:6 }}><div style={{ fontSize:10, color:"#2A3550", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Headlines</div><div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{ag.headlines.slice(0,6).map((h,j) => <span key={j} style={{ background:"#34A85310", color:"#34A853", border:"1px solid #34A85330", borderRadius:5, padding:"2px 8px", fontSize:11 }}>{h}</span>)}</div></div>}
                                  {ag.keywords?.length > 0 && <div style={{ marginBottom:6 }}><div style={{ fontSize:10, color:"#2A3550", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Keywords</div><div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{ag.keywords.slice(0,8).map((k,j) => <span key={j} style={{ background:"#1E2535", color:"#C8D3E8", borderRadius:5, padding:"2px 8px", fontSize:11 }}>{k}</span>)}</div></div>}
                                  {ag.negativekeywords?.length > 0 && <div style={{ marginBottom:6 }}><div style={{ fontSize:10, color:"#2A3550", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Negatives</div><div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{ag.negativeKeywords.slice(0,6).map((k,j) => <span key={j} style={{ background:"#EF444410", color:"#EF4444", borderRadius:5, padding:"2px 8px", fontSize:11 }}>−{k}</span>)}</div></div>}
                                  <div style={{ fontSize:11, background:"#34A85310", border:"1px solid #34A85320", borderRadius:7, padding:"7px 10px", color:"#C8D3E8", marginTop:6 }}>🎨 Assets: {ag.creativeBrief}</div>
                                </div>
                              ))}
                            </div>
                          ))}

                          {/* Creative needed */}
                          {bp.creativeNeeded && (
                            <div style={{ ...S.card, marginBottom:14, marginTop:14 }}>
                              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:"#F59E0B" }}>🎨 Creative Assets You Need to Add</div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                <div>
                                  <div style={{ fontSize:11, color:"#0082FB", fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Meta</div>
                                  {bp.creativeNeeded.meta?.map((c,i) => <div key={i} style={{ fontSize:12, color:"#C8D3E8", marginBottom:4, display:"flex", gap:6 }}><span style={{ color:"#0082FB" }}>›</span>{c}</div>)}
                                </div>
                                <div>
                                  <div style={{ fontSize:11, color:"#34A853", fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Google</div>
                                  {bp.creativeNeeded.google?.map((c,i) => <div key={i} style={{ fontSize:12, color:"#C8D3E8", marginBottom:4, display:"flex", gap:6 }}><span style={{ color:"#34A853" }}>›</span>{c}</div>)}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Priority actions */}
                          {bp.priorityActions?.length > 0 && (
                            <div style={{ ...S.card, marginBottom:14 }}>
                              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:bc }}>🎯 Priority Action Plan</div>
                              {bp.priorityActions.map((a,i) => (
                                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                                  <div style={{ width:22, height:22, borderRadius:6, background:`${bc}20`, color:bc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>{a.order}</div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:13, color:"#D8E0F0" }}>{a.action}</div>
                                    <div style={{ fontSize:11, color:"#2A3550", marginTop:2 }}>{a.platform} · <span style={{ color: a.impact==="HIGH" ? "#EF4444" : "#F59E0B" }}>{a.impact} IMPACT</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Push to platform notice */}
                          <div style={{ ...S.card, background:"#0D2B1A", border:"1px solid #1A5C32", marginTop:14 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#00C853", marginBottom:6 }}>✅ Blueprint Ready — How to Push It Live</div>
                            <div style={{ fontSize:13, color:"#C8D3E8", lineHeight:1.7, marginBottom:10 }}>Your complete campaign structure is built above. To push it live, you have two options:</div>
                            <div style={{ fontSize:13, color:"#C8D3E8", lineHeight:1.9 }}>
                              <div><strong style={{ color:"#00C853" }}>Option A — Manual (easiest):</strong> Open Meta Ads Manager and Google Ads side by side with this blueprint. Create each campaign exactly as specified above. Takes ~2 hours.</div>
                              <div style={{ marginTop:8 }}><strong style={{ color:"#00C853" }}>Option B — API Push (requires API keys):</strong> See the Setup Guide document for step-by-step instructions on connecting your Meta and Google accounts so this app can push directly. Once connected, a "Push Live" button will appear here.</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {!activeBlueprint && !bpLoading && (
                      <div style={{ textAlign:"center", padding:"40px 0", color:"#2A3550" }}>
                        <div style={{ fontSize:36, marginBottom:10 }}>🗺</div>
                        <div style={{ fontSize:14 }}>No blueprint yet — generate one above</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AUDIT */}
              {brandTab === "audit" && (
                <div style={{ flex:1, overflowY:"auto", padding:"20px" }}>
                  <div style={{ maxWidth:840, margin:"0 auto" }} className="fade-up">
                    <div style={{ ...S.card, background:`${bc}08`, border:`1px solid ${bc}30`, marginBottom:20, display:"flex", alignItems:"center", gap:16 }}>
                      <div style={{ fontSize:32 }}>🔍</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:800, fontSize:15, marginBottom:3 }}>Campaign Audit Engine</div>
                        <div style={{ fontSize:12, color:"#2A3550" }}>Checks your setup against the complete Meta & Google best-practices checklist. Flags every gap and gives you exact fixes in priority order.</div>
                      </div>
                      <button style={S.btn(bc)} className="hov" onClick={runAudit} disabled={auditLoading}>
                        {auditLoading ? <><Spinner color="#fff" size={13} /> Auditing…</> : "Run Audit"}
                      </button>
                    </div>

                    {auditLoading && (
                      <div style={{ textAlign:"center", padding:"48px 0" }}>
                        <Spinner color={bc} size={28} />
                        <div style={{ marginTop:14, fontSize:13, color:"#2A3550" }}>Auditing against 40+ best-practice checks…</div>
                      </div>
                    )}

                    {auditResult && !auditLoading && (
                      <div>
                        {/* Score */}
                        <div style={{ ...S.card, marginBottom:14, display:"flex", gap:20, alignItems:"center" }}>
                          <div style={{ width:72, height:72, borderRadius:"50%", border:`4px solid ${auditResult.score>=70 ? "#00C853" : auditResult.score>=40 ? "#F59E0B" : "#EF4444"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <div style={{ textAlign:"center" }}>
                              <div style={{ fontWeight:800, fontSize:22, color: auditResult.score>=70 ? "#00C853" : auditResult.score>=40 ? "#F59E0B" : "#EF4444" }}>{auditResult.grade}</div>
                              <div style={{ fontSize:10, color:"#2A3550" }}>{auditResult.score}/100</div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Audit Score: {auditResult.score}/100</div>
                            <div style={{ fontSize:13, color:"#C8D3E8", lineHeight:1.6 }}>{auditResult.summary}</div>
                          </div>
                        </div>

                        {/* Top fixes */}
                        {auditResult.topFixes?.length > 0 && (
                          <div style={{ ...S.card, marginBottom:14 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:bc, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>🎯 Priority Fixes</div>
                            {auditResult.topFixes.map((f,i) => (
                              <div key={i} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-start" }}>
                                <div style={{ width:22, height:22, borderRadius:6, background: f.priority<=3 ? "#EF444420" : "#F59E0B20", color: f.priority<=3 ? "#EF4444" : "#F59E0B", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>#{f.priority}</div>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:"#D8E0F0" }}>{f.action}</div>
                                  <div style={{ fontSize:11, color:"#2A3550", marginTop:2 }}>{f.platform} · Expected: {f.expectedImpact}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Meta checks */}
                        {auditResult.meta?.checks?.length > 0 && (
                          <div style={{ marginBottom:14 }}>
                            <div style={{ fontWeight:800, fontSize:14, color:"#0082FB", marginBottom:10 }}>◈ Meta Audit</div>
                            {[...new Set(auditResult.meta.checks.map(c => c.category))].map(cat => (
                              <div key={cat} style={{ ...S.card, marginBottom:8 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#0082FB", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>{cat}</div>
                                {auditResult.meta.checks.filter(c => c.category===cat).map((c,i) => (
                                  <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8, paddingBottom:8, borderBottom: i < auditResult.meta.checks.filter(x => x.category===cat).length-1 ? "1px solid #0F1520" : "none" }}>
                                    <StatusBadge status={c.status} />
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:600 }}>{c.item}</div>
                                      <div style={{ fontSize:12, color:"#2A3550", marginTop:2 }}>{c.detail}</div>
                                      {c.status!=="PASS" && <div style={{ fontSize:12, color:"#F59E0B", marginTop:4 }}>→ Fix: {c.fix}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Google checks */}
                        {auditResult.google?.checks?.length > 0 && (
                          <div>
                            <div style={{ fontWeight:800, fontSize:14, color:"#34A853", marginBottom:10 }}>◉ Google Audit</div>
                            {[...new Set(auditResult.google.checks.map(c => c.category))].map(cat => (
                              <div key={cat} style={{ ...S.card, marginBottom:8 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#34A853", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>{cat}</div>
                                {auditResult.google.checks.filter(c => c.category===cat).map((c,i) => (
                                  <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8, paddingBottom:8, borderBottom: i < auditResult.google.checks.filter(x => x.category===cat).length-1 ? "1px solid #0F1520" : "none" }}>
                                    <StatusBadge status={c.status} />
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:600 }}>{c.item}</div>
                                      <div style={{ fontSize:12, color:"#2A3550", marginTop:2 }}>{c.detail}</div>
                                      {c.status!=="PASS" && <div style={{ fontSize:12, color:"#F59E0B", marginTop:4 }}>→ Fix: {c.fix}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!auditResult && !auditLoading && (
                      <div style={{ textAlign:"center", padding:"40px 0", color:"#2A3550" }}>
                        <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
                        <div style={{ fontSize:14 }}>Click "Run Audit" to check your setup against 40+ best-practice checks</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BRAND MODAL */}
      {showBrandModal && (
        <div className="modal" onClick={e => e.target===e.currentTarget && setShowBrandModal(false)}>
          <div style={{ background:"#08090F", border:"1px solid #1E2535", borderRadius:20, padding:24, width:"100%", maxWidth:540, maxHeight:"90vh", overflowY:"auto" }} className="fade-up">
            <div style={{ fontWeight:800, fontSize:17, marginBottom:20 }}>{editingBrand ? "Edit Brand" : "Add New Brand"}</div>
            <div style={{ display:"grid", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Brand Name *</label><input style={S.input} value={brandForm.name} onChange={e => setBrandForm(p=>({...p,name:e.target.value}))} placeholder="Nike, Acme Inc…" /></div>
                <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Industry</label><input style={S.input} value={brandForm.industry} onChange={e => setBrandForm(p=>({...p,industry:e.target.value}))} placeholder="Ecommerce, SaaS, Local…" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Website</label><input style={S.input} value={brandForm.website} onChange={e => setBrandForm(p=>({...p,website:e.target.value}))} placeholder="brand.com" /></div>
                <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Monthly Budget</label>
                  <div style={{ display:"flex", gap:8 }}>
                    <select style={{ ...S.input, width:110, flexShrink:0 }} value={brandForm.currency} onChange={e => setBrandForm(p=>({...p,currency:e.target.value}))}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
                    </select>
                    <input style={{ ...S.input, flex:1 }} type="number" value={brandForm.monthlyBudget} onChange={e => setBrandForm(p=>({...p,monthlyBudget:e.target.value}))} placeholder="10000" />
                  </div>
                </div>
              </div>
              <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Primary Goals</label><input style={S.input} value={brandForm.goals} onChange={e => setBrandForm(p=>({...p,goals:e.target.value}))} placeholder="Drive purchases, generate leads, grow awareness…" /></div>
              <div style={{ borderTop:"1px solid #0F1520", paddingTop:14 }}>
                <div style={{ fontSize:10, color:"#0082FB", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:12, fontWeight:700 }}>Ad Account IDs (optional — for context)</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Meta Account ID</label><input style={S.input} value={brandForm.metaAccountId} onChange={e => setBrandForm(p=>({...p,metaAccountId:e.target.value}))} placeholder="act_123456789" /></div>
                  <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Google Account ID</label><input style={S.input} value={brandForm.googleAccountId} onChange={e => setBrandForm(p=>({...p,googleAccountId:e.target.value}))} placeholder="123-456-7890" /></div>
                </div>
              </div>
              <div><label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:5 }}>Extra Context</label><textarea style={{ ...S.input, height:72 }} value={brandForm.notes} onChange={e => setBrandForm(p=>({...p,notes:e.target.value}))} placeholder="Target audience, key products, current challenges, competitors…" /></div>
              <div>
                <label style={{ fontSize:10, color:"#2A3550", letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Brand Color</label>
                <div style={{ display:"flex", gap:8 }}>{BRAND_COLORS.map(c => <div key={c} onClick={() => setBrandForm(p=>({...p,color:c}))} style={{ width:26, height:26, borderRadius:7, background:c, cursor:"pointer", border: brandForm.color===c ? "2px solid #fff" : "2px solid transparent", transition:"border 0.15s" }} />)}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <button style={S.btn(null, true)} onClick={() => { setShowBrandModal(false); setEditingBrand(null); }}>Cancel</button>
              <button style={S.btn(brandForm.color)} className="hov" onClick={saveBrandForm}>{editingBrand ? "Save Changes" : "Create Brand"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
