"use client"
/*
  VennDiagram — tappable 3-circle Venn diagram with additive-color zones
  ───────────────────────────────────────────────────────────────────────
  Renders the 7 overlap regions of 3 circles (A, B, C) as exact SVG paths
  (analytically derived, not approximated), plus an "OUTSIDE" background.
  Tapping any zone calls onZoneTap(zone) — no drag, no pan/zoom needed.

  Zone colors are additive-light style: primaries on the single circles,
  secondaries on the two-way overlaps, black at the triple overlap.

  Props:
    onZoneTap    (zone: string) => void   — zone is one of
                 'A','B','C','AB','AC','BC','ABC','OUTSIDE'
    selectedZone string | null            — highlights this zone with a ring
    labels       { A, B, C }              — short ring labels shown near each circle
    disabled     bool                     — dims and disables tap handling
*/

const ZONE_COLORS = {
  A: "#E8342A",     // red
  B: "#2AA84C",     // green
  C: "#2A63E8",     // blue
  AB: "#E8D22A",    // yellow (red+green)
  AC: "#D22AE8",    // magenta (red+blue)
  BC: "#2AD2E8",    // cyan (green+blue)
  ABC: "#111111",   // black (all three)
  OUTSIDE: "#3A3242",
}

const PATHS = {
  ABC: "M 160 84.94 A 130 130 0 0 1 225 197.53 A 130 130 0 0 1 95 197.53 A 130 130 0 0 1 160 84.94 Z",
  AB:  "M 160 84.94 A 130 130 0 0 1 290 84.94 A 130 130 0 0 1 225 197.53 A 130 130 0 0 0 160 84.94 Z",
  AC:  "M 160 84.94 A 130 130 0 0 0 30 84.94 A 130 130 0 0 0 95 197.53 A 130 130 0 0 1 160 84.94 Z",
  BC:  "M 225 197.53 A 130 130 0 0 1 160 310.11 A 130 130 0 0 1 95 197.53 A 130 130 0 0 0 225 197.53 Z",
  A:   "M 290 84.94 A 130 130 0 0 0 30 84.94 A 130 130 0 0 1 160 310.11 A 130 130 0 0 1 290 84.94 Z",
  B:   "M 160 310.11 A 130 130 0 0 0 290 84.94 A 130 130 0 0 1 30 84.94 A 130 130 0 0 1 160 310.11 Z",
  C:   "M 30 84.94 A 130 130 0 0 0 160 310.11 A 130 130 0 0 1 290 84.94 A 130 130 0 0 1 30 84.94 Z",
}

const LABEL_POS = {
  A: { x: 160, y: 40 },
  B: { x: 275, y: 250 },
  C: { x: 45, y: 250 },
}

export default function VennDiagram({ onZoneTap, selectedZone = null, labels = {}, disabled = false }) {
  function tap(zone) {
    if (disabled) return
    onZoneTap?.(zone)
  }

  return (
    <svg viewBox="0 0 320 320" width="100%" style={{ display: "block", touchAction: "manipulation", opacity: disabled ? 0.6 : 1 }}>
      <rect
        x="0" y="0" width="320" height="320"
        fill={ZONE_COLORS.OUTSIDE}
        onClick={() => tap("OUTSIDE")}
        style={{ cursor: disabled ? "default" : "pointer" }}
      />
      {Object.entries(PATHS).map(([zone, d]) => (
        <path
          key={zone}
          d={d}
          fill={ZONE_COLORS[zone]}
          onClick={() => tap(zone)}
          stroke={selectedZone === zone ? "white" : "rgba(255,255,255,0.25)"}
          strokeWidth={selectedZone === zone ? 4 : 1}
          style={{ cursor: disabled ? "default" : "pointer" }}
        />
      ))}
      {["A", "B", "C"].map(ring => (
        <text
          key={ring}
          x={LABEL_POS[ring].x}
          y={LABEL_POS[ring].y}
          textAnchor="middle"
          fill="white"
          fontSize="13"
          fontWeight="800"
          style={{ pointerEvents: "none", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          {labels[ring] ?? ring}
        </text>
      ))}
    </svg>
  )
}
