"use client"
/*
  HighScores — persistent cross-game leaderboard for Collaborative mode
  ────────────────────────────────────────────────────────────────────
  Fetches once on mount (this is a static post-game screen, not realtime) and renders one
  heading per distinct player_count that actually has entries — never a heading with nothing
  under it. Rows are score-left, names-left-aligned-next-to-it (no space-between).

  hv_end_turn already prunes each player_count group down to 5 rows server-side the moment a
  new score is inserted, so every row this fetch returns is meant to be shown — no client-side
  slicing needed here.

  Props:
    colors  { wl }  — score-badge background for a non-highlighted row
*/

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE } from "./styles"

export default function HighScores({ colors = {} }) {
  const { wl = "rgba(255,255,255,0.15)" } = colors
  const [groups, setGroups] = useState(null) // null = loading, [] = loaded but empty

  useEffect(() => {
    let cancelled = false
    supabase
      .from("hv_high_scores")
      .select("score,player_count,player_names")
      .order("player_count", { ascending: true })
      .order("score", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const byCount = {}
        for (const row of data ?? []) {
          if (!byCount[row.player_count]) byCount[row.player_count] = []
          byCount[row.player_count].push(row)
        }
        setGroups(Object.entries(byCount).sort((a, b) => Number(a[0]) - Number(b[0])))
      })
    return () => { cancelled = true }
  }, [])

  if (!groups || groups.length === 0) return null

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
        High Scores
      </div>
      {groups.map(([playerCount, rows]) => (
        <div key={playerCount} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, color: `rgba(255,255,255,${OPACITY.muted})`, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            {playerCount} players
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex" }}>
                <div style={{
                  padding: "10px 0", minWidth: 44, flexShrink: 0,
                  background: wl,
                  fontSize: 16, fontWeight: 900, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {r.score}
                </div>
                <div style={{ padding: "10px 14px", flex: 1, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(r.player_names ?? []).join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
