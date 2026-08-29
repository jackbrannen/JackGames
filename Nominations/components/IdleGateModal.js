"use client"
// Blocking "are you still here?" overlay shown by useIdleGate after a
// period of inactivity. No backdrop-tap-to-close — the only way out is the
// confirm button, since the point is to gate further network activity
// until the player explicitly says they're still around. Confirming does a
// full page reload rather than resuming in place, so every realtime
// channel on the page re-establishes cleanly from scratch (see
// useIdleGate.js for why).
export default function IdleGateModal({ colors, buttonTextColor = "#000", textColor = "white", mutedTextColor = "rgba(255,255,255,0.85)" }) {
  const { dark = "#1A1A2E", wl = "#3A3A60" } = colors ?? {}
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div style={{ background: dark, width: "100%", maxWidth: 400, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: textColor }}>Still there?</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: mutedTextColor, lineHeight: 1.5 }}>
          We paused updates after a few minutes of inactivity.
        </p>
        <button onClick={() => window.location.reload()} style={{ background: wl, color: buttonTextColor, fontSize: 16, fontWeight: 900, padding: "16px", width: "100%" }}>
          I'm still here
        </button>
      </div>
    </div>
  )
}
