"use client"
/*
  useDuplicates — detect duplicate values within a player's own input fields
  ──────────────────────────────────────────────────────────────────────────
  Comparison is case-insensitive, trimmed. Empty strings are ignored.

  Usage:
    import { useDuplicates } from "../lib/useDuplicates"
    const { dupeIndices, hasDuplicates } = useDuplicates(wordFields)

    // Highlight duped inputs
    <input style={{ background: dupeIndices.has(i) ? "#5C1010" : WARM_LIGHT }} />

    // Block submit
    <button disabled={hasDuplicates || !allFilled}>Submit</button>

  For between-player duplicate blocking (Mode 3), compare against the
  DB-fetched set of submitted words in the game page — that logic is
  game-specific and not handled here.
*/

import { useMemo } from "react"

export function useDuplicates(fields) {
  return useMemo(() => {
    const normalized = fields.map(f => (f ?? "").trim().toLowerCase())
    const firstSeen = {}
    const dupeIndices = new Set()
    normalized.forEach((val, i) => {
      if (!val) return
      if (firstSeen[val] !== undefined) {
        dupeIndices.add(firstSeen[val])
        dupeIndices.add(i)
      } else {
        firstSeen[val] = i
      }
    })
    return { dupeIndices, hasDuplicates: dupeIndices.size > 0 }
  }, [fields.join("\0")])
}
