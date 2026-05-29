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
    excludeIdeas string[] — ideas to skip when sampling (e.g. game.used_prompts from DB)
    playerNames  string[] — other players' first names; one injected on first draw
    maxDraws     number   — how many times player can draw (default 2)
    onDraw       (ideas: string[]) => void — called after each draw so game can persist
    onIdeaClick  (idea: string) => void    — optional; makes chips tappable (e.g. to fill a field)

  Usage (GOW — display only, DB-tracked):
    <RandomIdeas
      key={roundIndex}
      bg={WARM_LIGHT}
      excludeIdeas={game.used_prompts ?? []}
      playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
      onDraw={ideas => supabase.from("gow_games")
        .update({ used_prompts: [...(game.used_prompts ?? []), ...ideas] })
        .eq("code", code)}
    />

  Usage (FTW — tappable, no DB tracking):
    <RandomIdeas
      key={round}
      bg={WARM_LIGHT}
      playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
      maxDraws={Math.ceil(wordFields.length * 2 / 3)}
      onIdeaClick={idea => fillCurrentField(idea)}
    />
*/

import { useState } from "react"

const IDEAS_URL = "https://raw.githubusercontent.com/jackbrannen/JackGames/main/random_ideas.json"
let _cache = null
async function fetchIdeas() {
  if (_cache) return _cache
  const res = await fetch(IDEAS_URL)
  _cache = await res.json()
  return _cache
}
function sampleIdeas(categories, excludeSet, count = 3) {
  const cats = Object.keys(categories).map(cat => ({
    pool: categories[cat].filter(w => !excludeSet.has(w.toLowerCase()))
  })).filter(c => c.pool.length > 0)
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]]
  }
  return cats.slice(0, count).map(c => c.pool[Math.floor(Math.random() * c.pool.length)])
}

export default function RandomIdeas({
  bg = "rgba(255,255,255,0.15)",
  yellow = "#FBDF54",
  excludeIdeas = [],
  playerNames = [],
  maxDraws = 2,
  onDraw,
  onIdeaClick,
}) {
  const [chips, setChips] = useState([])
  const [draws, setDraws] = useState(0)
  const [loading, setLoading] = useState(false)

  const exhausted = draws >= maxDraws

  async function handleDraw() {
    if (exhausted || loading) return
    setLoading(true)
    const categories = await fetchIdeas()
    const seen = new Set([...excludeIdeas, ...chips.map(c => c.text)].map(s => s.toLowerCase()))
    const picked = sampleIdeas(categories, seen)
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
            fontSize: 15, fontWeight: 800,
            padding: "14px 18px", display: "block", width: "100%",
            marginBottom: chips.length ? 12 : 0,
          }}
        >
          {chips.length === 0 ? "✦ Random ideas" : "✦ 3 more ideas"}
        </button>
      ) : (
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.25)",
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
                fontSize: 14, fontWeight: 700,
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
