"use client"
/*
  StatusBar — thin strip at top of play screens
  ───────────────────────────────────────────────
  Shows round, phase, or turn info. No scores, no invite code.

  Props:
    label     string — primary text, e.g. "ROUND 2 OF 3"
    progress  string — optional right-side text, e.g. "3 of 5 done"
    colors    object — { bg, text } for background and text color

  Usage:
    <StatusBar label={`ROUND ${r + 1} OF ${n}`} progress={`${done} of ${n} done`} colors={{ bg: DARK, text: "white" }} />
*/

import { FONT_SIZE, FONT_WEIGHT, OPACITY } from "./styles"

export default function StatusBar({ label, progress, colors = {} }) {
  const { bg = "#000", text = "white" } = colors
  return (
    <div style={{
      padding: "14px 20px",
      background: bg,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, opacity: OPACITY.moderate, color: text }}>
        {label}
      </div>
      {progress && (
        <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, color: text, opacity: OPACITY.moderate }}>
          {progress}
        </div>
      )}
    </div>
  )
}
