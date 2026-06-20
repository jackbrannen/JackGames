export const FONT_SIZE = {
  headingLg: 48,
  heading: 32,
  headingSm: 24,
  body: 17,
  small: 13,
  min: 13,
  sectionHeader: 11,
}

export const FONT_WEIGHT = {
  black: 900,
  heavy: 800,
  bold: 700,
  semibold: 600,
  medium: 500,
  regular: 400,
}

export const OPACITY = {
  full: 1,
  normal: 0.85,
  moderate: 0.75,
  muted: 0.65,
  disabled: 0.35,
}

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
}

export const GAP = {
  xs: 2,
  sm: 3,
  md: 6,
  lg: 8,
}

export const CARD = {
  padding: 16,
  gap: 3,
}

export const FOOTER_H = 56

export const STYLE = {
  sectionHeader: {
    fontSize: FONT_SIZE.sectionHeader,
    fontWeight: FONT_WEIGHT.heavy,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    opacity: 0.5,
  },
  eyebrow: {
    fontSize: FONT_SIZE.sectionHeader,
    fontWeight: FONT_WEIGHT.heavy,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    opacity: OPACITY.moderate,
  },
}

// Alpha Jam color scheme
// Primary: #FF865A (HSB: 18, 65, 100)
// Warm shadow (warmer, not cooler): HSB(12, 70, 90) = #E6704D
// Mid: HSB(15, 68, 95) = #F27B53
// Warm-light: HSB(21, 60, 100) = #FF9166
// Accent: #333546 (dark slate, replaces yellow)
export const BG = "#FF865A"
export const DARK = "#E6704D"
export const MID = "#F27B53"
export const WL = "#FF9166"
export const YELLOW = "#333546"
