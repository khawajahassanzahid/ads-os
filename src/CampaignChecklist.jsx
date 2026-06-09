import { useState, useEffect } from "react";
import { getCampaign, updateChecklist } from "./CampaignTracker";

const STEPS = [
  {
    key: "images_replaced",
    label: "Replace placeholder images",
    how: "Meta Ads Manager → your campaign → each ad set → edit each ad → swap the placeholder image with your real product photo or video",
    icon: "📸",
  },
  {
    key: "copy_reviewed",
    label: "Review and confirm all ad copy",
    how: "Check each ad's headline, body text, and URL are correct. Edit anything you want to tweak directly in Meta Ads Manager.",
    icon: "✍️",
  },
  {
    key: "targeting_checked",
    label: "Check targeting & budget",
    how: "Verify each ad set's daily budget, age range (20–45), location (Pakistan), and gender (Women) look right for this campaign.",
    icon: "🎯",
  },
];

export default function CampaignChecklist({ campaignId, campaignName, onReady, bc }) {
  const [state, setState] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setState(getCampaign(campaignId));
  }, [campaignId]);

  if (!state) return null;

  const toggle = (key) => {
    const updated = updateChecklist(campaignId, key, !state.checklist[key]);
    setState({ ...updated });
    if (updated.checklist.approved) onReady?.();
  };

  const done = STEPS.filter(s => state.checklist[s.key]).length;
  const allDone = state.checklist.approved;

  return (
    <div style={{ background: "#06080F", border: `1px solid ${allDone ? "#00C85330" : "#F59E0B30"}`, borderRadius: 14, padding: "18px 20px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#D8E0F0" }}>
            {allDone ? "✅ Campaign Ready to Activate" : "⚠️ Campaign Needs Setup Before Activating"}
          </div>
          <div style={{ fontSize: 11, color: "#4A5568", marginTop: 3 }}>{campaignName} · {done}/{STEPS.length} steps complete</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: allDone ? "#00C853" : "#F59E0B" }}>{done}/{STEPS.length}</div>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#1E2535", borderRadius: 99, height: 5, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", borderRadius: 99, background: allDone ? "#00C853" : "#F59E0B", width: `${(done / STEPS.length) * 100}%`, transition: "width 0.4s ease" }} />
      </div>

      {STEPS.map(step => (
        <div key={step.key} style={{ marginBottom: 8 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 9, background: state.checklist[step.key] ? "#00C85310" : "#0A0C14", border: `1px solid ${state.checklist[step.key] ? "#00C85330" : "#1E2535"}` }}
            onClick={() => setExpanded(expanded === step.key ? null : step.key)}
          >
            {/* Checkbox */}
            <div
              onClick={e => { e.stopPropagation(); toggle(step.key); }}
              style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${state.checklist[step.key] ? "#00C853" : "#2A3550"}`, background: state.checklist[step.key] ? "#00C853" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
            >
              {state.checklist[step.key] && <div style={{ color: "#000", fontSize: 12, fontWeight: 900 }}>✓</div>}
            </div>
            <div style={{ fontSize: 13, color: state.checklist[step.key] ? "#4A5568" : "#D8E0F0", flex: 1, textDecoration: state.checklist[step.key] ? "line-through" : "none" }}>
              {step.icon} {step.label}
            </div>
            <div style={{ fontSize: 10, color: "#4A5568" }}>{expanded === step.key ? "▲" : "▼"}</div>
          </div>
          {expanded === step.key && (
            <div style={{ background: "#06080F", border: "1px solid #1E2535", borderTop: "none", borderRadius: "0 0 9px 9px", padding: "10px 12px 10px 42px" }}>
              <div style={{ fontSize: 12, color: "#8892A4", lineHeight: 1.7 }}>{step.how}</div>
            </div>
          )}
        </div>
      ))}

      {allDone && (
        <div style={{ marginTop: 12, background: "#00C85312", border: "1px solid #00C85330", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#00C853", fontWeight: 600 }}>
          ✅ All steps complete — this campaign will now show as "Ready to Activate" in the AI Action Center.
        </div>
      )}

      {!allDone && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#4A5568" }}>
          Tick each step once you've done it in Meta Ads Manager. The AI won't suggest activating this campaign until all steps are complete.
        </div>
      )}
    </div>
  );
}
