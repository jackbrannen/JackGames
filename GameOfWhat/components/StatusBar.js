"use client"
/*
  StatusBar — thin strip at top of play screens
  ───────────────────────────────────────────────
  Shows round, phase, or turn info. No scores, no invite code.

  Props:
    label   string — primary text, e.g. "Round 2 of 3" or "Alex's turn"
    dark    hex    — background color (use game's cool-dark)
    right   node   — optional right-side content (e.g. a timer)

  Usage:
    <StatusBar label={`Round ${game.round_index + 1} of ${game.rounds_total}`} dark={DARK} />
*/

export default function StatusBar({ label, dark = "#000", right }) {
  return (
    <div style={{
      padding: "14px 20px",
      background: dark,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.75, color: "white" }}>
        {label}
      </div>
      {right && (
        <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
          {right}
        </div>
      )}
    </div>
  )
}
