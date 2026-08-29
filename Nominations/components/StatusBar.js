"use client"
/*
  StatusBar — thin strip at top of play screens
  ───────────────────────────────────────────────
  Shows round, phase, or turn info. No scores, no invite code.

  Props:
    label     string — primary text, e.g. "Round 2 of 3" or "Alex's turn"
    dark      hex    — background color (use game's cool-dark)
    right     node   — optional right-side content (e.g. a timer)
    textColor hex    — overrides the default white label/right text color;
                        use for a game whose cool-dark is light (e.g. a
                        light-base palette) where white text would be
                        illegible. Omit to keep the default white — every
                        existing caller keeps its current look unchanged.

  Usage:
    <StatusBar label={`Round ${game.round_index + 1} of ${game.rounds_total}`} dark={DARK} />
*/

import { FONT_SIZE, FONT_WEIGHT, OPACITY } from "./styles"

export default function StatusBar({ label, dark = "#000", right, textColor = "white" }) {
  return (
    <div style={{
      padding: "14px 20px",
      background: dark,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, opacity: OPACITY.moderate, color: textColor }}>
        {label}
      </div>
      {right && (
        <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, color: textColor }}>
          {right}
        </div>
      )}
    </div>
  )
}
