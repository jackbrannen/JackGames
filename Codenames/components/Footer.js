"use client"

// Spec:
// Sticky 56px bar fixed to the bottom of every game screen.
// Left slot: hamburger button (☰) that toggles the Menu. Shows ✕ when menu is open.
//   Hidden entirely when timerRunning is true (e.g. during an active Fishbowl turn) —
//   the footer bar remains visible with action buttons filling the full width.
// Right slot: children — action button(s) passed by the game page.
// Exports FOOTER_H so pages can offset their scroll areas and fixed-bottom elements.
//
// Usage:
//   import Footer, { FOOTER_H } from "../../components/Footer"
//   const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
//
//   <Footer colors={COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} timerRunning={false}>
//     <button onClick={handleSubmit} style={{ flex: 1, height: "100%", background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900 }}>
//       Submit
//     </button>
//   </Footer>

import { FOOTER_H } from "./styles"
export { FOOTER_H }

export default function Footer({
  colors = {},
  isOpen = false,
  onToggle,
  timerRunning = false,
  peekBarHeight = "0px",
  children,
}) {
  const { dark = "#1A1A2E", wl = "#3A3A60" } = colors

  return (
    <div style={{
      position: "fixed",
      bottom: peekBarHeight,
      left: 0,
      right: 0,
      height: FOOTER_H,
      background: dark,
      display: "flex",
      alignItems: "stretch",
      borderTop: "1px solid rgba(255,255,255,0.09)",
      zIndex: 80,
    }}>
      {!timerRunning && (
        <button
          onClick={() => onToggle?.()}
          style={{
            width: 56,
            flexShrink: 0,
            background: isOpen ? wl : "transparent",
            color: "white",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid rgba(255,255,255,0.09)",
            transition: "background 0.15s",
          }}
        >
          {isOpen ? "✕" : "☰"}
        </button>
      )}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch" }}>
        {children}
      </div>
    </div>
  )
}
