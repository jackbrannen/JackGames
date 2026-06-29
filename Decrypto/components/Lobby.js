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
    settingsContent ReactNode  — content for settings modal (opens via cog button in header)
    startContent    ReactNode  — start game CTA block (rendered above join form)
    joinContent     ReactNode  — join form; shown when player hasn't joined.
                               For team games, pass two team-join buttons here instead of
                               a single Join button.
    showJoin        bool       — override visibility of joinContent (default: !myPlayerId)
    extraContent    ReactNode  — anything rendered below the player list
    colors          { dark, mid, wl, yellow, bg? }
                                 — bg is the main page background (optional, defaults to dark)
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
import { FONT_SIZE, FONT_WEIGHT, OPACITY, STYLE, SPACE, GAP } from "./styles"

function SettingsModal({ isOpen, onClose, children, colors }) {
  if (!isOpen) return null
  const { dark, yellow } = colors
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: dark,
          maxWidth: 600,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          padding: "32px 24px",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 24 }}>Game Settings</div>
        {children}
      </div>
    </div>
  )
}

function PlayerRow({ p, myPlayerId, mid }) {
  return (
    <div style={{ padding: "13px 16px", background: mid, display: "flex", alignItems: "center" }}>
      <div style={{ fontSize: FONT_SIZE.sectionHeader, fontWeight: FONT_WEIGHT.bold }}>
        {p.name}
        {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: OPACITY.muted, marginLeft: 6 }}>you</span>}
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
  const { dark = "#333", mid = "#444", wl = "#555", yellow = "#FBDF54", bg } = colors
  const [showHowToPlay, setShowHowToPlay] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const showJoinZone = showJoin !== undefined ? showJoin : !myPlayerId

  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: bg || dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.bold }}>Room not found.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: bg || dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: `rgba(255,255,255,${OPACITY.muted})`, fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.bold }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100dvh", background: bg || dark, color: "white" }}>

      {/* Header */}
      <div style={{ padding: `${SPACE.xl}px ${SPACE.lg}px ${SPACE.lg}px`, background: dark, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.sm }}>
        <div style={{ minWidth: 0 }}>
          {gameName && (
            <div style={{ fontSize: FONT_SIZE.eyebrow, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
              {gameName}
            </div>
          )}
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: FONT_WEIGHT.black, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {codeDisplay ?? code}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          {onInvite && (
            <button
              onClick={onInvite}
              style={{ background: wl, color: "white", fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, padding: "10px 16px" }}
            >
              Invite
            </button>
          )}
          {howToPlayContent && (
            <button
              onClick={() => setShowHowToPlay(true)}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, padding: "10px 14px" }}
            >
              How to Play
            </button>
          )}
        </div>
      </div>

      {/* Settings cog button - top right of content area */}
      {settingsContent && (
        <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px 0`, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 24, fontWeight: FONT_WEIGHT.heavy, padding: "10px 14px", lineHeight: 1 }}
          >
            ⚙️
          </button>
        </div>
      )}

      {/* Settings modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} colors={colors}>
        {typeof settingsContent === 'function' ? settingsContent(() => setShowSettings(false)) : settingsContent}
      </SettingsModal>

      {/* Start CTA */}
      {startContent}

      {/* Join form */}
      {showJoinZone && joinContent && (
        <div style={{ padding: `${SPACE.xl}px ${SPACE.lg}px 0` }}>
          {joinContent}
        </div>
      )}

      {/* Player list */}
      <div style={{ padding: `${SPACE.xl}px ${SPACE.lg}px 0` }}>
        <div style={{ ...STYLE.sectionHeader, marginBottom: 4 }}>
          Players
        </div>
        <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted, marginBottom: 12 }}>
          {players.length} {players.length === 1 ? "player" : "players"}
        </div>
        {players.length === 0 && (
          <div style={{ fontSize: FONT_SIZE.small + 1, opacity: OPACITY.muted, fontStyle: "italic", padding: "12px 0" }}>No players yet</div>
        )}
        {(() => {
          const hasTeams = players.some(p => p.teamLabel)
          if (!hasTeams) {
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
                {players.map(p => <PlayerRow key={p.id} p={p} myPlayerId={myPlayerId} mid={mid} />)}
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
              <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.12em", color: teamMap[label].color || `rgba(255,255,255,${OPACITY.muted})`, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
                {teamMap[label].players.map(p => <PlayerRow key={p.id} p={p} myPlayerId={myPlayerId} mid={mid} />)}
              </div>
            </div>
          ))
        })()}
        {players.length < minPlayers && (
          <p style={{ fontSize: FONT_SIZE.min, opacity: OPACITY.muted, fontWeight: FONT_WEIGHT.semibold, marginTop: 10 }}>
            Need at least {minPlayers} players to start.
          </p>
        )}
      </div>

      {/* Extra content */}
      {extraContent && (
        <div style={{ padding: `${SPACE.xl}px ${SPACE.lg}px 0` }}>
          {extraContent}
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && howToPlayContent && (
        <div
          onClick={() => setShowHowToPlay(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: SPACE.lg, overflowY: "auto" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1A1A2E", width: "100%", maxWidth: 480, padding: `${SPACE.xl}px ${SPACE.lg}px`, marginTop: SPACE.lg }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "white" }}>How to Play</div>
              <button
                onClick={() => setShowHowToPlay(false)}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.heavy, padding: "6px 12px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: FONT_SIZE.small + 1, color: `rgba(255,255,255,${OPACITY.normal})`, lineHeight: 1.7, fontWeight: FONT_WEIGHT.regular, whiteSpace: "pre-wrap" }}>
              {howToPlayContent}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
