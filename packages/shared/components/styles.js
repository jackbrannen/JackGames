"use client"

// ─── Typography ───────────────────────────────────────────────────────────────

export const FONT_SIZE = {
  eyebrow:       11,   // exception: uppercase/letter-spaced metadata labels only (e.g. "ROUND 2 OF 5")
  min:           13,   // absolute minimum for all reading text
  small:         14,
  body:          16,
  bodyLg:        18,
  sectionHeader: 17,   // labels that title a section (Players, Scores, etc.)
  heading:       20,
  headingLg:     28,
}

export const FONT_WEIGHT = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
  heavy:    800,   // section headers, eyebrow labels
  black:    900,   // headings, primary action buttons
}

// ─── Opacity ──────────────────────────────────────────────────────────────────

export const OPACITY = {
  disabled: 0.35,  // buttons only — handled by global CSS, not inline
  muted:    0.65,  // floor for text on colored backgrounds
  moderate: 0.75,  // eyebrow labels, secondary info
  normal:   0.85,  // standard body text
  full:     1.0,
}

// ─── Spacing (8px grid) ───────────────────────────────────────────────────────

export const SPACE = {
  xs:   8,
  sm:   16,
  md:   20,
  lg:   24,
  xl:   28,
  xxl:  32,
  xxxl: 48,
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export const FOOTER_H = 56   // height of the sticky footer bar
export const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

// ─── Reusable style objects ───────────────────────────────────────────────────

export const STYLE = {
  sectionHeader: {
    fontSize:   FONT_SIZE.sectionHeader,
    fontWeight: FONT_WEIGHT.heavy,
    color:      `rgba(255,255,255,${OPACITY.normal})`,
  },
  eyebrow: {
    fontSize:      FONT_SIZE.min,
    fontWeight:    FONT_WEIGHT.heavy,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    opacity:       OPACITY.moderate,
  },
  youLabel: {
    fontSize:   12,
    opacity:    OPACITY.muted,
    marginLeft: 6,
  },
}
