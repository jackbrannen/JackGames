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

// ─── Gaps (common spacing between elements) ───────────────────────────────────

export const GAP = {
  card:      3,    // between two-column card rows (player list, scores)
  selection: 6,    // between Selections rows
  result:    12,   // between Results answer cards
  section:   24,   // between major sections on a page
}

// ─── Card dimensions ──────────────────────────────────────────────────────────

export const CARD = {
  // Two-column split card (score/number left, content right)
  leftWidth:    48,   // narrow left block (number, score badge)
  leftWidthWide: 52,  // wider left block (for scores 100+)
  padding:      "13px 16px",  // standard card content padding
  paddingVert:  "13px 0",     // left block vertical padding (centered)

  // Single well card (mid-dark background)
  wellPadding:  "16px 20px",
}

// ─── Word value → color interpolation (Sound Board) ────────────────────────
// Interpolates a card's background from white (value 1) toward gold (value 9)
// in HSB space, and its text color from CARD_TEXT toward white past the
// midpoint where gold gets dark enough to need it.

const WORD_CARD_WHITE = { h: 0, s: 0, b: 100 }     // #FFFFFF
const WORD_CARD_GOLD  = { h: 38, s: 62, b: 65 }    // ≈ #A57C31

function hsbToHex(h, s, b) {
  s /= 100; b /= 100
  const k = n => (n + h / 60) % 6
  const f = n => b - b * s * Math.max(0, Math.min(k(n), 4 - k(n), 1))
  const toHex = v => Math.round(v * 255).toString(16).padStart(2, "0")
  return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`
}

export function wordCardBg(value) {
  const t = Math.max(0, Math.min(1, (value - 1) / 8))
  const h = WORD_CARD_WHITE.h + (WORD_CARD_GOLD.h - WORD_CARD_WHITE.h) * t
  const s = WORD_CARD_WHITE.s + (WORD_CARD_GOLD.s - WORD_CARD_WHITE.s) * t
  const b = WORD_CARD_WHITE.b + (WORD_CARD_GOLD.b - WORD_CARD_WHITE.b) * t
  return hsbToHex(h, s, b)
}

export function wordCardText(value) {
  return value >= 7 ? "#FFFFFF" : "#2A303C"
}

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

  // Two-column card: left block (cool-dark)
  cardLeft: (darkColor, width = CARD.leftWidth) => ({
    padding:        CARD.paddingVert,
    minWidth:       width,
    flexShrink:     0,
    background:     darkColor,
    fontSize:       FONT_SIZE.bodyLg,
    fontWeight:     FONT_WEIGHT.black,
    color:          "white",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  }),

  // Two-column card: right block (mid-dark)
  cardRight: (midColor) => ({
    padding:    CARD.padding,
    flex:       1,
    background: midColor,
    display:    "flex",
    alignItems: "center",
  }),

  // Single well card
  well: (midColor) => ({
    background: midColor,
    padding:    CARD.wellPadding,
  }),

  // Player name in card
  playerName: {
    fontSize:   FONT_SIZE.sectionHeader,
    fontWeight: FONT_WEIGHT.bold,
  },

  // "you" label next to player name
  youLabel: {
    fontSize:    FONT_SIZE.small - 2,  // 12px
    opacity:     OPACITY.muted,
    marginLeft:  6,
  },
}
