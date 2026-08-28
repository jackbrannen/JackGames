"use client"
// Blocking "Paused" overlay shown to every player when someone pauses via
// the hamburger menu's Pause tile. No backdrop-tap-to-close — only Resume
// dismisses it, since the whole point is every player sees the same frozen
// state until someone explicitly resumes.
export default function PauseModal({ colors, pausedByName, onResume, resuming }) {
  const { dark = "#1A1A2E", wl = "#3A3A60" } = colors ?? {}
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div style={{ background: dark, width: "100%", maxWidth: 400, padding: 24, display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Paused</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
          {pausedByName ? `${pausedByName} has paused the game.` : "The game has been paused."}
        </p>
        <button
          onClick={onResume}
          disabled={resuming}
          style={{ background: wl, color: "#000", fontSize: 16, fontWeight: 900, padding: "16px", width: "100%", opacity: resuming ? 0.6 : 1 }}
        >
          {resuming ? "Resuming…" : "Resume"}
        </button>
      </div>
    </div>
  )
}
