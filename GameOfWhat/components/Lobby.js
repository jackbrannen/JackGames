"use client"
/*
  Lobby — standard pre-game lobby shell
  ──────────────────────────────────────
  Handles the common lobby layout: header with room code + invite + how-to-play,
  game-specific settings strip, start CTA zone, join form zone, and numbered
  player list. All zones except the player list are passed as slots.

  Props:
    code            string   — room code (e.g. "MAPLERIVER")
    gameName        string   — e.g. "The Game of What"
    players         { id, name, teamLabel?, teamColor? }[]
                               — when teamLabel is present on any player, the list is grouped
                               by team with a colored team header above each group
    myPlayerId      string | null
    onInvite        fn       — called when Invite is tapped
    howToPlayContent ReactNode  — content inside the How to Play modal (omit to hide button)
    codeDisplay     ReactNode  — overrides the default code text rendering in the header
    settingsContent ReactNode  — strip rendered below the header (game-specific settings)
    startContent    ReactNode  — start game CTA block (rendered above join form)
    joinContent     ReactNode  — join form; shown when player hasn't joined.
                               For team games, pass two team-join buttons here instead of
                               a single Join button.
    showJoin        bool       — override visibility of joinContent (default: !myPlayerId)
    extraContent    ReactNode  — anything rendered below the player list
    colors          { dark, mid, wl, yellow }
    minPlayers      number     — minimum to start; shows notice when below (default 4)
    notFound        bool       — show "room not found" state
    loading         bool       — show loading state

  Usage (GameOfWhat):
    <Lobby
      code={code}
      gameName="The Game of What"
      players={players}
      myPlayerId={myPlayerId}
      onInvite={handleInvite}
      howToPlayContent={<div>...</div>}
      codeDisplay={<><span style={{ color: YELLOW }}>{word1}</span><span ...>{word2}</span></>}
      settingsContent={<RoundsStrip ... />}
      startContent={canStart ? <StartCTA onStart={...} /> : null}
      joinContent={<JoinForm ... />}
      extraContent={null}
      colors={{ dark: "#4A123B", mid: "#5C1640", wl: "#821F42", yellow: "#FBDF54" }}
      minPlayers={4}
    />
*/

import { useState } from "react"

function PlayerRow({ p, i, myPlayerId, dark, mid }) {
  return (
    <div style={{ display: "flex" }}>
      <div style={{
        padding: "13px 0", minWidth: 48, flexShrink: 0,
        background: dark,
        fontSize: 18, fontWeight: 900, color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {i + 1}
      </div>
      <div style={{
        padding: "13px 16px", flex: 1,
        background: mid,
        display: "flex", alignItems: "center",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          {p.name}
        </div>
      </div>
    </div>
  )
}

export default function Lobby({
  code = "",
  gameName = "",
  players = [],
  myPlayerId = null,
  onInvite,
  howToPlayContent,
  codeDisplay,
  settingsContent,
  startContent,
  joinContent,
  showJoin,
  extraContent,
  colors = {},
  minPlayers = 4,
  notFound = false,
  loading = false,
}) {
  const { dark = "#333", mid = "#444", wl = "#555", yellow = "#FBDF54" } = colors
  const [showHowToPlay, setShowHowToPlay] = useState(false)

  const showJoinZone = showJoin !== undefined ? showJoin : !myPlayerId

  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 22, fontWeight: 700 }}>Room not found.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100dvh", color: "white" }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: dark, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          {gameName && (
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
              {gameName}
            </div>
          )}
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {codeDisplay ?? code}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          {onInvite && (
            <button
              onClick={onInvite}
              style={{ background: wl, color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
            >
              Invite
            </button>
          )}
          {howToPlayContent && (
            <button
              onClick={() => setShowHowToPlay(true)}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
            >
              How to Play
            </button>
          )}
        </div>
      </div>

      {/* Settings strip */}
      {settingsContent}

      {/* Start CTA */}
      {startContent}

      {/* Join form */}
      {showJoinZone && joinContent && (
        <div style={{ padding: "28px 24px 0" }}>
          {joinContent}
        </div>
      )}

      {/* Player list */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
          Players
        </div>
        {players.length === 0 && (
          <div style={{ fontSize: 15, opacity: 0.65, fontStyle: "italic", padding: "12px 0" }}>No players yet</div>
        )}
        {(() => {
          const hasTeams = players.some(p => p.teamLabel)
          if (!hasTeams) {
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {players.map((p, i) => <PlayerRow key={p.id} p={p} i={i} myPlayerId={myPlayerId} dark={dark} mid={mid} />)}
              </div>
            )
          }
          // Group by team, preserving insertion order
          const teamOrder = []
          const teamMap = {}
          players.forEach(p => {
            const label = p.teamLabel || ""
            if (!teamMap[label]) { teamMap[label] = { color: p.teamColor, players: [] }; teamOrder.push(label) }
            teamMap[label].players.push(p)
          })
          return teamOrder.map(label => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamMap[label].color || "rgba(255,255,255,0.65)", marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {teamMap[label].players.map((p, i) => <PlayerRow key={p.id} p={p} i={i} myPlayerId={myPlayerId} dark={dark} mid={mid} />)}
              </div>
            </div>
          ))
        })()}
        {players.length < minPlayers && (
          <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 10 }}>
            Need at least {minPlayers} players to start.
          </p>
        )}
      </div>

      {/* Extra content */}
      {extraContent && (
        <div style={{ padding: "28px 24px 0" }}>
          {extraContent}
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && howToPlayContent && (
        <div
          onClick={() => setShowHowToPlay(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1A1A2E", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>How to Play</div>
              <button
                onClick={() => setShowHowToPlay(false)}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 800, padding: "6px 12px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, fontWeight: 400 }}>
              {howToPlayContent}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
