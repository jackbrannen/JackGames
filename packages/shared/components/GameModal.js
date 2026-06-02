"use client"

import { useState } from "react"

export const GAMES = [
  { name: "Fishbowl",         sub: "fishbowl",         players: "4+ players",   description: "Teams guess clues from a bowl.",                                                     bg: "#3378FF", color: "white"    },
  { name: "The Game of What", sub: "gameofwhat",        players: "4+ players",   description: "Like Quiplash but with DIY Questions.",                                              bg: "#A02866", color: "white"    },
  { name: "Avalon",           sub: "avalon",            players: "5–10 players", description: "Hidden roles — find the traitors before they sabotage the quests.",                  bg: "#C9A84C", color: "#2A1800"  },
  { name: "First to Worst",   sub: "firsttoworst",      players: "4+ players",   description: "Submit 5 things, rank them secretly, then the group guesses your order.",            bg: "#004F45", color: "white"    },
  { name: "Codenames",        sub: "codenames",         players: "4+ players",   description: "Two teams race to find their secret agents using one-word clues.",                   bg: "#C0B298", color: "#2C1A0A"  },
  { name: "Telestrations",    sub: "telestrations",     players: "4+ players",   description: "Write a sentence, draw it, guess the drawing — watch it fall apart.",                bg: "#2B0F6B", color: "white"    },
  { name: "Exquisite Corpse", sub: "exquisitecorpse",   players: "4+ players",   description: "Cooperative blind drawing game.",                                                    bg: "#1A3A5C", color: "white"    },
  { name: "Drawful",          sub: "drawful",           players: "4+ players",   description: "Draw weird. Guess weirder.",                                                         bg: "#307977", color: "white"    },
  { name: "So Clover",        sub: "soclover",          players: "2+ players",   description: "Arrange keyword cards, write clues, guess each other's boards.",                     bg: "#6B8C2A", color: "white"    },
  { name: "Copycats",         sub: "copycats",          players: "3+ players",   description: "Write a question for another player. Everyone else tries to fake their answer.",     bg: "#5C2D8C", color: "white"    },
  { name: "Mr. White",        sub: "mrwhite",           players: "4+ players",   description: "One player has a slightly different word. Find the impostor.",                       bg: "#2C2540", color: "white"    },
  { name: "Reverse Charades", sub: "reversecharades",   players: "4+ players",   description: "Everyone acts it out — one person guesses.",                                        bg: "#974344", color: "white"    },
]

// Returns the GAMES list excluding the current game
export function useNextGames(currentSub) {
  return GAMES.filter(g => g.sub !== currentSub)
}

// Always rendered — handles both the picker modal and the invite banner for others.
//
// Props:
//   open                bool    — show the game-picker modal overlay
//   onClose             fn      — called when modal is dismissed
//   onSelect            fn(sub) — called with subdomain of chosen game
//   currentSub          string  — current game's subdomain (excluded from list)
//   nextGame            string  — game.next_game — subdomain picker chose
//   nextGamePickerName  string  — game.next_game_picker_name — who picked
//   myName              string  — current player's name (me?.name)
export default function GameModal({
  open = false,
  onClose,
  onSelect,
  currentSub,
  nextGame,
  nextGamePickerName,
  myName,
}) {
  const games = useNextGames(currentSub)
  const [dismissed, setDismissed] = useState(false)

  const showInvite = nextGame && nextGamePickerName && myName &&
    myName !== nextGamePickerName && !dismissed
  const inviteGameName = GAMES.find(g => g.sub === nextGame)?.name ?? nextGame

  return (
    <>
      {/* Invite banner — shown to non-pickers when someone chooses a next game */}
      {showInvite && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 500,
          background: "#1A1A2E", borderBottom: "2px solid rgba(255,255,255,0.15)",
          padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>
              {nextGamePickerName} wants to play {inviteGameName}
            </span>
          </div>
          <button
            onClick={() => window.location.href = `https://${nextGame}.jackbrannen.com/`}
            style={{ background: "#FBDF54", color: "#000", fontSize: 14, fontWeight: 900, padding: "10px 16px", flexShrink: 0 }}
          >
            Join
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "8px 12px", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Game-picker modal overlay */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 64px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Play Another Game</div>
              <button
                onClick={onClose}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 800, padding: "6px 12px" }}
              >✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {games.map(g => (
                <button
                  key={g.sub}
                  onClick={() => { onClose(); onSelect(g.sub) }}
                  style={{ display: "block", width: "100%", background: g.bg, color: g.color, padding: "20px", textAlign: "left" }}
                >
                  <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2, marginBottom: 5 }}>{g.name}</div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.2)", color: g.color, padding: "3px 8px", opacity: 0.85 }}>{g.players}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.65 }}>{g.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
