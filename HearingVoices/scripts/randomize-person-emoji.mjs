#!/usr/bin/env node
// Rewrites emoji-list.md in place:
//   1. Swaps gender-neutral person emoji (🧑, 🧓, and 🧑‍<role> sequences) for a
//      randomly chosen specific man/woman version.
//   2. Gives every emoji that supports a Fitzpatrick skin-tone modifier a randomly
//      chosen tone (still one version per emoji, not a set of variants).
// Idempotent-ish: already-gendered/toned entries won't match the neutral-person check
// again, but rerunning will re-randomize tones already applied. Run after editing the
// md file to add new people/hand/action emoji, then rerun build-emoji-list.mjs.
//
// Usage: node scripts/randomize-person-emoji.mjs

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MD_PATH = path.join(__dirname, "..", "emoji-list.md")

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" })
const VS16 = "️"
const ZWJ = "‍"
const PERSON = "🧑"
const OLDER_PERSON = "🧓"
const TONES = ["🏻", "🏼", "🏽", "🏾", "🏿"]

// Base emoji (post any gender-swap) known to accept a Fitzpatrick skin-tone modifier.
const SKIN_TONE_BASES = new Set([
  "👍", "👎", "👋", "✌", "🤙", "👌", "🙏", "👏", "🤞", "✊", "✋",
  "💪", "🦵", "🦶", "👂", "👃",
  "👶", "🧒", "👦", "👧", "👨", "👩", "🧓", "👴", "👵",
  "👮", "🕵", "💂", "👷", "🤴", "👸", "👳", "👲", "🧕", "🎅", "🤶",
  "🦸", "🦹", "🧙", "🧚", "🧛", "🧜", "🧝",
  "💆", "💇", "🚶", "🏃", "💃", "🕺", "🕴", "🧖", "🧗", "🏇", "⛷", "🏂",
  "🏌", "🏄", "🚣", "🏊", "⛹", "🏋", "🚴", "🚵", "🤸", "🤽", "🤾", "🤹",
  "🧘", "🛀", "🛌",
])

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function transformToken(token) {
  let cps = Array.from(token)

  // 1. Gender swap.
  if (cps[0] === PERSON) {
    cps[0] = pick(["👨", "👩"])
  } else if (cps.length === 1 && cps[0] === OLDER_PERSON) {
    cps[0] = pick(["👴", "👵"])
  }

  // 2. Skin tone, inserted right after the base — drop a VS16 immediately following the
  // base since a tone modifier implies emoji presentation on its own.
  const base = cps[0]
  if (SKIN_TONE_BASES.has(base)) {
    const dropVS16 = cps[1] === VS16
    const rest = cps.slice(dropVS16 ? 2 : 1)
    cps = [base, pick(TONES), ...rest]
  }

  return cps.join("")
}

function main() {
  const md = readFileSync(MD_PATH, "utf8")
  const lines = md.split("\n")
  let changed = 0

  const outLines = lines.map((line) => {
    if (!line.trim() || line.startsWith("#") || line.startsWith("-") || /^[A-Za-z]/.test(line.trim())) {
      return line
    }
    const tokens = [...segmenter.segment(line)].map((s) => s.segment)
    const isEmojiLine = tokens.some((t) => /\p{Extended_Pictographic}/u.test(t))
    if (!isEmojiLine) return line

    const out = tokens.map((t) => {
      if (t === " ") return t
      const transformed = transformToken(t)
      if (transformed !== t) changed++
      return transformed
    })
    return out.join("")
  })

  writeFileSync(MD_PATH, outLines.join("\n"))
  console.log(`Transformed ${changed} emoji tokens (gender swap + skin tone).`)
}

main()
