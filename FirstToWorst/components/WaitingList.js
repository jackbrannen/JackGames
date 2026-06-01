"use client"

// Spec:
// Player status list shown on screens where everyone is waiting for each other to act.
// Each row has: colored status dot, player name, optional typing indicator, inline poke button.
//
// Status dot: green (#22C55E) when done, dim white when pending.
// "Stepped away": shown below the name (italic, muted) when p.away is true and p.done is false.
//   Compute away in the parent: presenceReady && p.id !== myPlayerId && !onlinePlayerIds.has(p.id)
//   where presenceReady and onlinePlayerIds come from useTypingPresence.
// Typing indicator: 💬 shown when typing is true (player is actively writing).
// Poke button: 👉 shown for pending players who are not the current user, but only
//   after the WaitingList has been mounted for 10 seconds (avoids immediate poking).
//   - Calls onPoke(name) immediately with no confirmation.
//   - After poking, the button shows ✓ for 2 seconds (pokeJustSent === name).
//   - All poke buttons are disabled for 10 seconds after any poke (cooldownActive).
//
// Count line: "X / Y done" shown below the list when showCount is true (default).
//
// Usage:
//   import WaitingList from "../../components/WaitingList"
//
//   <WaitingList
//     players={[{ name, done, typing }]}
//     myName={me.name}
//     colors={{ mid }}
//     onPoke={sendInlinePoke}
//     cooldownActive={pokeCooldownActive}
//     pokeJustSent={pokeJustSent}
//   />
//
// Poke cooldown state lives in the parent page:
//   const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
//   const [pokeJustSent, setPokeJustSent] = useState(null)
//
//   async function sendInlinePoke(targetName) {
//     if (pokeCooldownActive) return
//     setPokeCooldownActive(true)
//     setPokeJustSent(targetName)
//     await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
//     setTimeout(() => setPokeJustSent(null), 2000)
//     setTimeout(() => setPokeCooldownActive(false), 10000)
//   }

import { useEffect, useState } from "react"
import { FONT_SIZE, FONT_WEIGHT, OPACITY } from "./styles"

export default function WaitingList({
  players = [],       // [{ name: string, done: boolean, typing?: boolean }]
  myName,             // current player's name — hides poke button on own row
  colors = {},
  onPoke,             // (name: string) => void
  cooldownActive = false,
  pokeJustSent = null,
  showCount = true,
}) {
  const { mid = "#252540" } = colors
  const doneCount = players.filter(p => p.done).length
  const [pokeReady, setPokeReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setPokeReady(true), 10000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {players.map(p => {
          const isMe   = p.name === myName
          const justSent = pokeJustSent === p.name

          return (
            <div key={p.name} style={{ display: "flex", alignItems: "center", background: mid, padding: "13px 16px", gap: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: p.done ? "#22C55E" : "rgba(255,255,255,0.25)",
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, opacity: p.done ? OPACITY.full : 0.75 }}>
                  {p.name}
                </span>
                {p.away && !p.done && (
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, fontStyle: "italic", marginTop: 2 }}>
                    stepped away
                  </div>
                )}
              </div>
              {p.typing && !p.done && (
                <span style={{ fontSize: FONT_SIZE.small, opacity: 0.8 }}>💬</span>
              )}
              {!p.done && !isMe && onPoke && pokeReady && (
                <button
                  onClick={() => !cooldownActive && onPoke(p.name)}
                  style={{
                    background: "transparent",
                    color: justSent ? "#22C55E" : "rgba(255,255,255,0.55)",
                    fontSize: 20,
                    padding: "0 4px",
                    lineHeight: 1,
                    opacity: cooldownActive && !justSent ? 0.35 : 1,
                  }}
                >
                  {justSent ? "✓" : "👉"}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {showCount && (
        <div style={{ fontSize: FONT_SIZE.min, opacity: OPACITY.muted, fontWeight: FONT_WEIGHT.semibold, marginTop: 10 }}>
          {doneCount} / {players.length} done
        </div>
      )}
    </div>
  )
}
