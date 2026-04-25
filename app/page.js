"use client"

import { useEffect, useState } from "react"

const BG = "#111118"
const YELLOW = "#FBDF54"

const GAMES = [
  {
    name: "Fishbowl",
    description: "Teams guess clues from a bowl",
    players: "4+ players",
    url: "https://fishbowl.jackbrannen.com",
    bg: "#3378FF",
    color: "white",
  },
  {
    name: "The Game of What",
    description: "Like Quiplash but with DIY Questions.",
    players: "4+ players",
    url: "https://gameofwhat.jackbrannen.com",
    bg: "#A02866",
    color: "white",
  },
  {
    name: "Codenames",
    description: "Give one-word clues to reveal your team's cards.",
    players: "4+ players",
    url: "https://codenames.jackbrannen.com",
    bg: "#C0B298",
    color: "#2C1A0A",
  },
  {
    name: "Avalon",
    description: "Hidden roles — find the traitors before they sabotage the quests.",
    players: "5–10 players",
    url: "https://avalon.jackbrannen.com",
    bg: "#C9A84C",
    color: "#2A1800",
  },
]

function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    if (local?.firstName && local?.lastName) return local
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    if (match) return JSON.parse(decodeURIComponent(match[1]))
  } catch {}
  return null
}

function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

const inputStyle = {
  background: "rgba(255,255,255,0.1)",
  color: "white",
  fontSize: 18,
  padding: "14px 16px",
  width: "100%",
  display: "block",
  border: "none",
  outline: "none",
  boxSizing: "border-box",
}

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const p = loadProfile()
    if (p) {
      setProfile(p)
      setFirstName(p.firstName || "")
      setLastName(p.lastName || "")
      setUsername(p.username || "")
    }
  }, [])

  function openSettings() {
    const p = loadProfile()
    setFirstName(p?.firstName || "")
    setLastName(p?.lastName || "")
    setUsername(p?.username || "")
    setSaved(false)
    setSettingsOpen(true)
  }

  function saveSettings() {
    const trimFirst = firstName.trim()
    const trimLast = lastName.trim()
    const trimUser = username.trim()
    if (!trimFirst || !trimLast) return
    const p = { firstName: trimFirst, lastName: trimLast, username: trimUser }
    saveProfile(p)
    setProfile(p)
    setSaved(true)
    setTimeout(() => setSettingsOpen(false), 700)
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>

      {/* Cog button */}
      <button
        onClick={openSettings}
        aria-label="Settings"
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          background: "rgba(255,255,255,0.08)",
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontSize: 22,
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        ⚙
      </button>

      {/* Settings overlay */}
      {settingsOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 100,
            paddingTop: 60,
          }}
        >
          <div style={{ background: "#1C1C26", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              Your Profile
            </div>
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveSettings()}
              placeholder="Display name (username)"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <button
              onClick={saveSettings}
              disabled={!firstName.trim() || !lastName.trim()}
              style={{
                background: saved ? "rgba(255,255,255,0.15)" : YELLOW,
                color: saved ? "white" : "#000",
                fontSize: 18,
                fontWeight: 900,
                padding: "16px",
                width: "100%",
                display: "block",
                border: "none",
                cursor: "pointer",
              }}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      )}

      <h1 style={{
        fontSize: "clamp(48px, 14vw, 88px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-2px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 64,
      }}>
        Jack's<br />Games
      </h1>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 10 }}>
        {GAMES.map(game => (
          <a
            key={game.name}
            href={game.url}
            style={{
              display: "block",
              background: game.bg,
              color: game.color,
              padding: "28px 28px",
              textDecoration: "none",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>
              {game.name}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.55, marginBottom: 4 }}>
              {game.description}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.35, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {game.players}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
