"use client"
// Shared between the lobby (Knower ring/hint setup + pre-fill) and the play
// page (in-game zone display) so both stay visually consistent without
// duplicating the contrast-picking logic or zone metadata.

import { supabase } from "../lib/supabase"
import { ZONE_COLORS, ZONE_NAMES, FORCE_LIGHT_TEXT_ZONES } from "./VennDiagram"

export const INK = "#2A303C"
export const BTN_TEXT = "#FFF4F0"

// Which base rings compose a given zone — used to look up the Knower's rule
// (or the player-facing hint) text for whichever ring(s) intersect there.
export const ZONE_RINGS = {
  A: ["A"], B: ["B"], C: ["C"],
  AB: ["A", "B"], AC: ["A", "C"], BC: ["B", "C"],
  ABC: ["A", "B", "C"], OUTSIDE: [], NA: [],
}

export function fetchIdeas(n, ex) {
  return supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])
}

function relLuminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrastRatio(hexA, hexB) {
  const l1 = relLuminance(hexA), l2 = relLuminance(hexB)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}
// Picks whichever of INK / a light text color has better contrast against a
// given zone color, so dark zone backgrounds get light text and light zone
// backgrounds get dark text automatically — except teal/green, which are
// forced to light text regardless (they read better that way).
export function textColorFor(bgHex, zone) {
  if (zone && FORCE_LIGHT_TEXT_ZONES.has(zone)) return BTN_TEXT
  return contrastRatio(INK, bgHex) >= contrastRatio(BTN_TEXT, bgHex) ? INK : BTN_TEXT
}

const WORD_CHIP_BG = "#BFC8BC"
const WORD_CHIP_ON_LIGHT_BG = "#2D3A52"
const WORD_CHIP_ON_LIGHT_TEXT = "#BFC8BC"
// A word chip's colors flip when it's sitting on a very light background
// (the White zone panel) so it doesn't disappear into it.
export function wordChipStyle(onLightBg) {
  return onLightBg
    ? { background: WORD_CHIP_ON_LIGHT_BG, color: WORD_CHIP_ON_LIGHT_TEXT }
    : { background: WORD_CHIP_BG, color: INK }
}

export function zoneTitle(zone) { return `${ZONE_NAMES[zone]} Zone` }

// Inline highlighted label for a ring/zone color reference in game text —
// e.g. "Red Ring" or "Gold Zone" — background = the zone's actual color,
// text color auto-picked for contrast.
export function ZoneChip({ zone, label }) {
  const bg = ZONE_COLORS[zone]
  return (
    <span style={{ background: bg, color: textColorFor(bg, zone), padding: "2px 8px", borderRadius: 6, fontWeight: 900, whiteSpace: "nowrap" }}>
      {label ?? `${ZONE_NAMES[zone]} Zone`}
    </span>
  )
}
