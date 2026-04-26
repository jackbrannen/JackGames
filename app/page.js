"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

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
    name: "Avalon",
    description: "Hidden roles — find the traitors before they sabotage the quests.",
    players: "5–10 players",
    url: "https://avalon.jackbrannen.com",
    bg: "#C9A84C",
    color: "#2A1800",
  },
  {
    name: "First to Worst",
    description: "Submit 5 things, rank them secretly, then the group guesses your order.",
    players: "4+ players",
    url: "https://firsttoworst.jackbrannen.com",
    bg: "#1A3C34",
    color: "white",
  },
  {
    name: "Codenames",
    description: "Two teams race to find their secret agents using one-word clues.",
    players: "4+ players",
    url: "https://codenames.jackbrannen.com",
    bg: "#C0B298",
    color: "#2C1A0A",
  },
]

const EXTERNAL_GAMES = [
  {
    name: "Secret Hitler",
    players: "5–10 players",
    url: "https://secret-hitler.online",
    bg: "#C73B32",
    color: "white",
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

function shortDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
  const [logsOpen, setLogsOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [saved, setSaved] = useState(false)
  const [logs, setLogs] = useState({ real: [], test: [] })
  const [logsLoading, setLogsLoading] = useState(false)

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

  async function openLogs() {
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const [fishbowl, gow, codenames, avalon, ftw] = await Promise.all([
        supabase.from("players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("gow_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("codenames_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("avalon_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("ftw_players").select("first_name,last_name,game_code,created_at").limit(2000),
      ])

      // people[fullName][gameName] = { count, first, last }
      const people = {}

      function addRows(rows, gameName) {
        for (const row of (rows ?? [])) {
          if (!row.first_name || !row.last_name) continue
          const name = `${row.first_name} ${row.last_name}`
          if (!people[name]) people[name] = {}
          if (!people[name][gameName]) people[name][gameName] = { count: 0, first: row.created_at, last: row.created_at }
          const g = people[name][gameName]
          g.count++
          if (row.created_at < g.first) g.first = row.created_at
          if (row.created_at > g.last) g.last = row.created_at
        }
      }

      addRows(fishbowl.data, "Fishbowl")
      addRows(gow.data, "Game of What")
      addRows(codenames.data, "Codenames")
      addRows(avalon.data, "Avalon")
      addRows(ftw.data, "First to Worst")

      const toRows = entries => entries
        .map(([name, games]) => ({
          name,
          games: Object.entries(games)
            .map(([game, s]) => ({ game, ...s }))
            .sort((a, b) => a.game.localeCompare(b.game)),
          total: Object.values(games).reduce((sum, g) => sum + g.count, 0),
        }))
        .sort((a, b) => b.total - a.total)

      const isTest = ([name]) => name.split(" ").pop().toLowerCase() === "test"
      const real = toRows(Object.entries(people).filter(e => !isTest(e)))
      const test = toRows(Object.entries(people).filter(e => isTest(e)))

      setLogs({ real, test })
    } finally {
      setLogsLoading(false)
    }
  }

  const isJack = profile?.firstName?.trim().toLowerCase() === "jack" &&
    profile?.lastName?.trim().toLowerCase() === "brannen"

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

      {/* Cog button — top right */}
      <button
        onClick={openSettings}
        aria-label="Settings"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
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

      {/* Logs overlay */}
      {logsOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setLogsOpen(false) }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            overflowY: "auto",
            zIndex: 100,
            padding: "24px 16px 60px",
          }}
        >
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>
                Game Logs
              </div>
              <button
                onClick={() => setLogsOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {logsLoading && (
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>
                Loading…
              </div>
            )}

            {!logsLoading && logs.real.length === 0 && logs.test.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>
                No sessions found.
              </div>
            )}

            {!logsLoading && logs.real.map((person, i) => (
              <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 0" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>
                  {person.name}
                </div>
                {person.games.map(g => {
                  const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                  const dateStr = sameDay
                    ? shortDate(g.first)
                    : `${shortDate(g.first)} – ${shortDate(g.last)}`
                  const gameColor = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                  const bg = gameColor?.bg ?? "rgba(255,255,255,0.15)"
                  const fg = gameColor?.color ?? "white"
                  return (
                    <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 800, padding: "3px 8px", whiteSpace: "nowrap" }}>
                        {g.game}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                        {g.count}×
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                        {dateStr}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            {!logsLoading && logs.test.length > 0 && (
              <>
                <div style={{ margin: "24px 0 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)" }}>
                    Test Agents
                  </span>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                </div>
                {logs.test.map((person, i) => (
                  <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 0", opacity: 0.5 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>
                      {person.name}
                    </div>
                    {person.games.map(g => {
                      const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                      const dateStr = sameDay ? shortDate(g.first) : `${shortDate(g.first)} – ${shortDate(g.last)}`
                      const gameColor = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                      const bg = gameColor?.bg ?? "rgba(255,255,255,0.15)"
                      const fg = gameColor?.color ?? "white"
                      return (
                        <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 800, padding: "3px 8px", whiteSpace: "nowrap" }}>
                            {g.game}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                            {g.count}×
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                            {dateStr}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
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

        <div style={{ marginTop: 32, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.6)" }}>
            Free games elsewhere
          </div>
        </div>

        {EXTERNAL_GAMES.map(game => (
          <a
            key={game.name}
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
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
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.35, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {game.players}
            </div>
          </a>
        ))}

        {isJack && (
          <button
            onClick={openLogs}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
              paddingTop: 14,
              textAlign: "center",
            }}
          >
            View Logs
          </button>
        )}
      </div>
    </div>
  )
}
