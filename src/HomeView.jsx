import { CHANNELS, isChannelConnected } from "./channels.js";

function Pill({ text, bg, color }) {
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 650, background: bg, color }}>{text}</span>;
}

// Home — ported directly from the growth-ops-console.html mockup's showHome().
export default function HomeView({ activeBrand, channelStatus, onOpenChannel }) {
  const connectedCount = CHANNELS.filter(c => isChannelConnected(c.id, channelStatus)).length;
  const pct = Math.round((connectedCount / CHANNELS.length) * 100);
  const gaps = CHANNELS.filter(c => !isChannelConnected(c.id, channelStatus));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px" }}>
      <div style={{ maxWidth: 1020, margin: "0 auto" }} className="fade-up">
        <h1 style={{ fontSize: 19, margin: "0 0 4px", color: "#1a1a1a" }}>{activeBrand.name} — Growth Ops Console</h1>
        <div style={{ color: "#6b6b6b", fontSize: 12.5, marginBottom: 16 }}>
          {connectedCount} of {CHANNELS.length} channels connected ({pct}%). Click a channel in the left nav for live data, best-practice benchmarks, and flagged issues.
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "#1a1a1a" }}>Channel Connection Matrix</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
            {CHANNELS.map(c => {
              const conn = isChannelConnected(c.id, channelStatus);
              return (
                <div key={c.id} onClick={() => onOpenChannel(c.id)} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, fontSize: 12, cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>{c.label}</div>
                  {conn ? <Pill text="Connected" bg="#e4f3e5" color="#256b2e" /> : <Pill text="Not connected" bg="#eee" color="#666" />}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e3de", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "#1a1a1a" }}>Flags for {activeBrand.name}</h2>
          {gaps.length === 0
            ? <div style={{ padding: "8px 0", fontSize: 12.5 }}>No connection gaps — every channel in the framework is linked for this brand.</div>
            : gaps.map(c => (
              <div key={c.id} onClick={() => onOpenChannel(c.id)} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f5f5f2", fontSize: 12.5, cursor: "pointer" }}>
                <Pill text="GAP" bg="#fbe4e2" color="#a5271e" />
                <div><strong>{c.label} not connected.</strong> {c.impact}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
