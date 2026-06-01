"use client"

// Spec:
// Slide-up drawer opened by the hamburger button in Footer. Contains a tile grid
// and a set of modals triggered by each tile.
//
// Tile grid (3-column):
//   Scores/Players — always shown. Label is "Scores" if any playerDetails entry has a score,
//     otherwise "Players". Lists players with scores and inline 👉 poke buttons.
//     If playerDetails have teamColor/teamLabel, players are grouped by team.
//   Rules — shown if rules prop is provided
//   My Word — shown if word prop is non-null (Mr. White)
//   My Role — shown if roleContent prop is non-null (Avalon)
//   Settings — shown if settingsContent prop is non-null (Fishbowl mid-game settings)
//   Lobby — shown if onResetToLobby prop is provided
//
// Closing the drawer resets the active panel to null.
// The drawer closes automatically when gamePhase changes.
//
// Usage:
//   import Menu from "../../components/Menu"
//
//   <Menu
//     supabase={supabase}
//     colors={COLORS}
//     isOpen={menuOpen}
//     onClose={() => setMenuOpen(false)}
//     roomCode={code}
//     currentPlayer={me.name}
//     allPlayers={players.map(p => p.name)}
//     playerDetails={players.map(p => ({
//       name: p.name,
//       firstName: p.first_name,
//       lastName: p.last_name,
//       score: p.score,           // optional — triggers "Scores" label and score display
//       teamColor: "#CC2222",     // optional — triggers team grouping
//       teamLabel: "Red",
//       teamTextColor: "#fff",
//     }))}
//     gamePhase={game?.phase}
//     word={null}                 // string → shows "My Word" tile
//     roleContent={null}          // JSX → shows "My Role" tile (Avalon)
//     settingsContent={null}      // JSX → shows "Settings" tile; game owns settings state (Fishbowl)
//     onResetToLobby={async () => supabase.rpc("game_reset_to_lobby", { p_code: code })}
//     rules={null}                // [[title, body], ...] → shows Rules tile
//     peekBarHeight="0px"
//   />

import { useEffect, useRef, useState } from "react"
import { FOOTER_H } from "./styles"

export default function Menu({
  supabase,
  colors = {},
  isOpen,
  onClose,
  roomCode,
  currentPlayer,
  allPlayers = [],
  playerDetails = [],
  gamePhase,
  word = null,
  roleContent = null,
  onResetToLobby,
  settingsContent = null,
  rules,
  peekBarHeight = "0px",
}) {
  const {
    dark    = "#1A1A2E",
    mid     = "#252540",
    wl      = "#3A3A60",
    yellow  = "#FBDF54",
  } = colors

  const [panel, setPanel]             = useState(null)
  const [pokeSending, setPokeSending] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [lobbyResetting, setLobbyResetting] = useState(false)
  const [cooldownSec, setCooldownSec] = useState(0)
  const prevPhaseRef    = useRef(gamePhase)
  const cooldownEndRef  = useRef(0)
  const cooldownTickRef = useRef(null)

  useEffect(() => {
    if (prevPhaseRef.current !== gamePhase) {
      setPanel(null)
      prevPhaseRef.current = gamePhase
    }
  }, [gamePhase])

  useEffect(() => {
    if (!isOpen) setPanel(null)
  }, [isOpen])

  function startCooldown() {
    clearInterval(cooldownTickRef.current)
    cooldownEndRef.current = Date.now() + 10000
    setCooldownSec(10)
    cooldownTickRef.current = setInterval(() => {
      const s = Math.ceil((cooldownEndRef.current - Date.now()) / 1000)
      if (s <= 0) { clearInterval(cooldownTickRef.current); setCooldownSec(0) }
      else setCooldownSec(s)
    }, 500)
  }

  async function sendPoke(target) {
    if (pokeSending || cooldownSec > 0) return
    setPokeSending(true)
    setPokeJustSent(target)
    await supabase.from("pokes").insert({ room_code: roomCode, from_player: currentPlayer, to_player: target, message: "👉" })
    setPokeSending(false)
    startCooldown()
    setTimeout(() => setPokeJustSent(null), 2000)
  }

  async function handleResetToLobby() {
    if (lobbyResetting || !onResetToLobby) return
    setLobbyResetting(true)
    try { await onResetToLobby() } catch {}
    onClose()
    setLobbyResetting(false)
  }

  const drawerBottom = `calc(${peekBarHeight} + ${FOOTER_H}px)`
  const hasScores = playerDetails.some(p => p.score !== undefined && p.score !== null)
  const hasTeams  = playerDetails.some(p => p.teamColor)

  // Group players by team if applicable
  const playerGroups = hasTeams
    ? Object.values(playerDetails.reduce((acc, p) => {
        const key = p.teamLabel ?? "Team"
        if (!acc[key]) acc[key] = { label: p.teamLabel, color: p.teamColor, textColor: p.teamTextColor, players: [] }
        acc[key].players.push(p)
        return acc
      }, {}))
    : [{ label: null, players: playerDetails }]

  const TILES = [
    { icon: hasScores ? "🏆" : "👥", label: hasScores ? "Scores" : "Players", action: () => setPanel("players") },
    rules       ? { icon: "📋", label: "Rules",    action: () => setPanel("rules") }    : null,
    word !== null        ? { icon: "📖", label: "My Word",  action: () => setPanel("myWord") }  : null,
    roleContent !== null ? { icon: "🃏", label: "My Role",  action: () => setPanel("myRole") }  : null,
    settingsContent !== null ? { icon: "⚙️", label: "Settings", action: () => setPanel("settings") } : null,
    onResetToLobby ? { icon: "🏠", label: "Lobby",  action: () => setPanel("lobbyWarn1") }      : null,
  ].filter(Boolean)

  const modal = {
    backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" },
    box:      { background: mid, width: "100%", maxWidth: 400, padding: "24px", display: "flex", flexDirection: "column", gap: 16 },
    title:    { fontSize: 18, fontWeight: 900, color: "white" },
    cancel:   { flex: 1, background: dark, color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: 800, padding: "14px" },
  }

  if (!isOpen && !panel) return null

  return (
    <>
      <style>{`@keyframes drawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Backdrop to close drawer */}
      {isOpen && !panel && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 71 }} />
      )}

      {/* Drawer */}
      {isOpen && !panel && (
        <div style={{
          position: "fixed", bottom: drawerBottom, left: 0, right: 0,
          background: mid, borderTop: "1px solid rgba(255,255,255,0.1)",
          zIndex: 78, animation: "drawerUp 0.22s ease",
        }}>
          <div onClick={onClose} style={{ padding: "10px 0 4px", display: "flex", justifyContent: "center", cursor: "pointer" }}>
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.22)", borderRadius: 2 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", paddingBottom: 12 }}>
            {TILES.map(({ icon, label, action }) => (
              <button key={label} onClick={action} style={{
                background: "transparent",
                color: label === "Lobby" ? "rgba(255,120,100,0.9)" : "white",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "14px 8px", gap: 6,
              }}>
                <span style={{ fontSize: 26 }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.7 }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scores / Players modal */}
      {panel === "players" && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal.box, maxHeight: "80dvh", overflowY: "auto" }}>
            <div style={modal.title}>{hasScores ? "Scores" : "Players"}</div>
            {playerGroups.map(group => (
              <div key={group.label ?? "all"}>
                {group.label && (
                  <div style={{ background: group.color, color: group.textColor ?? "#fff", fontSize: 12, fontWeight: 800, padding: "4px 12px", marginBottom: 3 }}>
                    {group.label}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {group.players.map((p, i) => {
                    const isMe = p.name === currentPlayer
                    const justSent = pokeJustSent === p.name
                    return (
                      <div key={p.name} style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ padding: "12px 0", minWidth: 40, flexShrink: 0, background: dark, fontSize: 16, fontWeight: 900, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {i + 1}
                        </div>
                        <div style={{ padding: "10px 12px", flex: 1, background: dark, filter: "brightness(1.4)", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                              {p.name}
                                                          </div>
                            {(p.firstName || p.lastName) && (
                              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{[p.firstName, p.lastName].filter(Boolean).join(" ")}</div>
                            )}
                          </div>
                          {hasScores && (
                            <div style={{ fontSize: 20, fontWeight: 900, color: "white", flexShrink: 0 }}>{p.score ?? 0}</div>
                          )}
                          {!isMe && (
                            <button
                              onClick={() => sendPoke(p.name)}
                              disabled={cooldownSec > 0}
                              style={{ background: "transparent", color: justSent ? "#22C55E" : "rgba(255,255,255,0.5)", fontSize: 20, padding: "0 4px", lineHeight: 1, flexShrink: 0, opacity: cooldownSec > 0 && !justSent ? 0.35 : 1 }}>
                              {justSent ? "✓" : "👉"}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <button onClick={onClose} style={modal.cancel}>Done</button>
          </div>
        </div>
      )}

      {/* My Word modal */}
      {panel === "myWord" && word && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal.box, alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, color: "white" }}>Your word</div>
            <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-1px", color: "white", textAlign: "center" }}>{word}</div>
            <button onClick={onClose} style={{ ...modal.cancel, flex: "unset", width: "100%" }}>Done</button>
          </div>
        </div>
      )}

      {/* My Role modal */}
      {panel === "myRole" && roleContent && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,25,35,0.97)", zIndex: 95, overflowY: "auto", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}>
            {roleContent}
            <button onClick={onClose} style={{ background: mid, color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: 800, padding: "14px", width: "100%", display: "block", marginTop: 16 }}>Done</button>
          </div>
        </div>
      )}

      {/* Rules modal */}
      {panel === "rules" && rules && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal.box, maxHeight: "80dvh", overflowY: "auto" }}>
            <div style={modal.title}>How to Play</div>
            {rules.map(([title, body]) => (
              <div key={title}>
                <div style={{ fontSize: 13, fontWeight: 800, color: yellow, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{body}</div>
              </div>
            ))}
            <button onClick={onClose} style={{ ...modal.cancel, flex: "unset" }}>Got it</button>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {panel === "settings" && settingsContent && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal.box, maxHeight: "80dvh", overflowY: "auto" }}>
            <div style={modal.title}>Settings</div>
            {settingsContent}
            <button onClick={onClose} style={{ ...modal.cancel, flex: "unset" }}>Done</button>
          </div>
        </div>
      )}

      {/* Lobby warning 1 */}
      {panel === "lobbyWarn1" && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={modal.box}>
            <div style={modal.title}>Back to Lobby</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>This resets the game for everyone.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={modal.cancel}>Cancel</button>
              <button onClick={() => setPanel("lobbyWarn2")} style={{ flex: 2, background: wl, color: "white", fontSize: 15, fontWeight: 900, padding: "14px" }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Lobby warning 2 */}
      {panel === "lobbyWarn2" && (
        <div onClick={onClose} style={modal.backdrop}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal.box, background: "#2A0C0C", border: "1.5px solid #8B2222" }}>
            <div style={modal.title}>Are you sure?</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>Are you sure you want to totally reset the game for everyone?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={modal.cancel}>Cancel</button>
              <button onClick={handleResetToLobby} disabled={lobbyResetting}
                style={{ flex: 2, background: "#B03030", color: "white", fontSize: 15, fontWeight: 900, padding: "14px" }}>
                {lobbyResetting ? "Resetting…" : "Yes, reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
