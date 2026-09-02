"use client"

// Overboard's palette. Ocean blues throughout — depth is the whole visual language, so the
// one thing every phase shares is DEPTH_TIERS below.
//
// Colors are written as hsl() rather than hex on purpose (see CLAUDE.md): the depth ramp is
// a single hue walked down in lightness, which is legible here and impossible to eyeball in
// hex.

export const BG = "hsl(214, 45%, 9%)"    // page background — near-black navy
export const DARK = "hsl(214, 42%, 13%)" // modals, wells
export const MID = "hsl(214, 38%, 17%)"  // cards, list rows
export const WL = "hsl(214, 32%, 24%)"   // secondary buttons, inputs

export const ACCENT = "hsl(190, 90%, 55%)"       // bright pool aqua — primary actions
export const ACCENT_TEXT = "hsl(214, 60%, 10%)"  // text on ACCENT
export const DANGER = "hsl(0, 70%, 55%)"

export const COLORS = { dark: DARK, mid: MID, wl: WL, yellow: ACCENT, notifBg: BG }

// The five depth tiers. Index 0 is unused so tier numbers match the 1..5 stored in
// ob_players.depth and read like the labels do.
//
// The ramp deliberately crosses over at tier 3: shallow reads as dark-text-on-pale, deep as
// white-on-navy. `border` is a lighter shade of each tier's own background — the two deepest
// tiers are close enough to the page background that an unbordered chip would float in the
// dark, and a translucent white overlay is not allowed on a colored background.
//
// `onDark` is the same tier identity, but as a FOREGROUND color on the dark card surfaces
// (MID). The `bg` values can't do that job: Ocean floor's near-navy background is almost
// invisible as text on MID, which is exactly what it looked like before this existed.
// Lightness is held high enough across all five that every tier stays legible.
// Every pairing below is measured, not eyeballed — all five clear WCAG AA (4.5:1) for
// `text` on `bg`, and for `onDark` on the MID card surface. The white/dark crossover sits
// between tiers 3 and 4: white on tier 3's mid-blue only manages 2.6:1, which is why
// Diving team takes dark text despite looking like it belongs with the deep end.
export const DEPTH_TIERS = [
  null,
  { label: "Splash pad",   bg: "hsl(205, 100%, 97%)", text: "hsl(205, 85%, 30%)", border: "hsl(205, 60%, 80%)", onDark: "hsl(205, 100%, 90%)" }, // 7.07:1 · 11.71:1
  { label: "Shallow end",  bg: "hsl(205, 90%, 88%)",  text: "hsl(205, 80%, 30%)", border: "hsl(205, 70%, 72%)", onDark: "hsl(205, 90%, 80%)" },  // 5.83:1 ·  9.24:1
  { label: "Diving team",  bg: "hsl(207, 75%, 62%)",  text: "hsl(207, 90%, 18%)", border: "hsl(207, 75%, 74%)", onDark: "hsl(207, 85%, 70%)" },  // 4.97:1 ·  6.96:1
  { label: "Fishing trip", bg: "hsl(210, 80%, 42%)",  text: "#fff",               border: "hsl(210, 80%, 56%)", onDark: "hsl(210, 90%, 64%)" },  // 5.37:1 ·  5.54:1
  { label: "Ocean floor",  bg: "hsl(214, 85%, 22%)",  text: "#fff",               border: "hsl(214, 80%, 40%)", onDark: "hsl(214, 90%, 66%)" },  // 12.64:1 · 5.35:1
]

export const DEPTH_MIN = 1
export const DEPTH_MAX = 5

export function tier(depth) {
  return DEPTH_TIERS[depth] ?? DEPTH_TIERS[2]
}

// The six reaction buttons, in a deliberate arc from warmest to worst.
export const REACTIONS = ["👍", "❤️", "💀", "😵‍💫", "🤦‍♂️", "🤮"]
