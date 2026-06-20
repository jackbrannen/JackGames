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
// Primary: #FA955C (HSB: 22, 63, 98)
// Warm shadow (warmer + darker): HSB(16, 68, 88) = #E07A48
// Mid: HSB(19, 65, 93) = #ED8750
// Warm-light (warmer + lighter): HSB(16, 48, 100) = #FF9F85
// Accent: #333546 (dark slate)
export const BG = "#FA955C"
export const DARK = "#E07A48"
export const MID = "#ED8750"
export const WL = "#FF9F85"
export const YELLOW = "#333546"
