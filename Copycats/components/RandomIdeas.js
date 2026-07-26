"use client"
/*
  RandomIdeas — random idea chips below a text entry field
  ─────────────────────────────────────────────────────────
  Shows a "✦ Random ideas" button that draws 3 chips per tap.
  On the first draw, randomly replaces one chip with a player name.
  Reset between prompts/rounds by changing the `key` prop.

  Props:
    bg           hex      — button and chip background (use game's WARM_LIGHT)
    yellow       hex      — name-tag highlight color (default #FBDF54)
    fetchIdeas   async (count: number, exclude: string[]) => string[]
                          — called to get ideas; use game's supabase RPC:
                            (n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])
    excludeIdeas string[] — ideas already used (e.g. game.used_prompts); passed to fetchIdeas
    playerNames  string[] — other players' first names; one injected on first draw
    maxDraws     number   — how many times player can draw (default 3)
    onDraw       (ideas: string[]) => void — called after each draw so game can persist
    onIdeaClick  (idea: string) => void    — optional; do not wire this to auto-fill a field.
                                              Chips are inspiration only — the player must still
                                              type their own answer. Reserved for non-autofill
                                              uses only (e.g. a copy-to-clipboard affordance).

  Usage (GOW — display only, DB-tracked):
    <RandomIdeas
      key={roundIndex}
      bg={WARM_LIGHT}
      fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
      excludeIdeas={game.used_prompts ?? []}
      playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
      onDraw={ideas => supabase.from("gow_games")
        .update({ used_prompts: [...(game.used_prompts ?? []), ...ideas] })
        .eq("code", code)}
    />

  Usage (FTW — display only, no DB tracking):
    <RandomIdeas
      key={round}
      bg={WARM_LIGHT}
      fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
      playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
      maxDraws={Math.ceil(wordFields.length * 2 / 3)}
    />
*/

import { useState } from "react"
import { FONT_SIZE, FONT_WEIGHT, OPACITY } from "./styles"

export default function RandomIdeas({
  bg = "rgba(255,255,255,0.15)",
  yellow = "#FBDF54",
  fetchIdeas,
  excludeIdeas = [],
  playerNames = [],
  maxDraws = 3,
  onDraw,
  onIdeaClick,
}) {
  const [chips, setChips] = useState([])
  const [draws, setDraws] = useState(0)
  const [loading, setLoading] = useState(false)

  const exhausted = draws >= maxDraws

  async function handleDraw() {
    if (exhausted || loading || !fetchIdeas) return
    setLoading(true)
    const seen = [...excludeIdeas, ...chips.map(c => c.text)]
    const picked = await fetchIdeas(3, seen)
    if (!picked?.length) { setLoading(false); return }
    const newChips = picked.map(text => ({ text, isName: false }))
    if (draws === 0 && playerNames.length && newChips.length) {
      const name = playerNames[Math.floor(Math.random() * playerNames.length)]
      newChips[Math.floor(Math.random() * newChips.length)] = { text: name, isName: true }
    }
    setChips(prev => [...prev, ...newChips])
    setDraws(d => d + 1)
    onDraw?.(picked)
    setLoading(false)
  }

  return (
    <div>
      {!exhausted ? (
        <button
          onClick={handleDraw}
          disabled={loading}
          style={{
            background: bg, color: "white",
            fontSize: 15, fontWeight: FONT_WEIGHT.heavy,
            padding: "14px 18px", display: "block", width: "100%",
            marginBottom: chips.length ? 12 : 0,
          }}
        >
          {chips.length === 0 ? "✦ Random ideas" : "✦ 3 more ideas"}
        </button>
      ) : (
        <div style={{
          fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.semibold,
          color: `rgba(255,255,255,${OPACITY.disabled})`,
          padding: "12px 18px", background: bg,
          marginBottom: chips.length ? 12 : 0,
        }}>
          No more ideas for this question
        </div>
      )}
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chips.map((chip, i) => (
            <div
              key={i}
              onClick={() => onIdeaClick?.(chip.text)}
              style={{
                padding: "7px 14px", borderRadius: 999,
                fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.bold,
                background: chip.isName ? "rgba(251,223,84,0.12)" : bg,
                color: chip.isName ? yellow : "white",
                border: chip.isName ? "1px solid rgba(251,223,84,0.3)" : "1px solid rgba(255,255,255,0.15)",
                cursor: onIdeaClick ? "pointer" : "default",
              }}
            >
              {chip.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
