"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Footer, { FOOTER_H } from "../../components/Footer"
import Menu from "../../components/Menu"
import { WB_RULES } from "../../components/rulesText"

const BG = "#FEE471"
const INK = "#221A12"
const INK_MUTED = "rgba(34,26,18,0.6)"
const DARK = "#221A12"
const PANEL = "#FFFFFF"
const WARM = "#FFFFFF"
const BTN = "#221A12"
const BTN_TEXT = "#FFF8ED"
const RED = "#C0392B"
const INPUT_BG = "#FFFFFF"

const MIN_PLAYERS = 2
const POINT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9]

function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}
function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

const inputStyle = {
  background: INPUT_BG, color: INK, fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block", border: "none", outline: "none", boxSizing: "border-box",
}
const POKE_COLORS = { dark: DARK, mid: "#3A2E1B", wl: "#5A4A32", yellow: "#FBDF54", notifBg: "#1C140B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [phase, setPhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [replayOf, setReplayOf] = useState(null)
  const [startingPoints, setStartingPoints] = useState(3)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)
  const [starting, setStarting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const canStart = players.length >= MIN_PLAYERS

  async function refreshPlayers() {
    const { data } = await supabase.from("wb_players")
      .select("id,name,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase.from("wb_games")
      .select("code,phase,is_dummy,replay_of,replay_code,starting_points").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    if (data.replay_code) { router.replace(`/${data.replay_code}`); return }
    setGameExists(true)
    setPhase(data.phase || "lobby")
    setIsDummy(!!data.is_dummy)
    setReplayOf(data.replay_of ?? null)
    setStartingPoints(data.starting_points ?? 3)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`wordbirds:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`wb-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wb_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "wb_games", filter: `code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (phase && phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [phase, myPlayerId])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!isDummy || gameExists !== true || phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("wb_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`wordbirds:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`wordbirds:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("wb_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [replayOf, gameExists, phase, myPlayerId, code])

  async function join() {
    const trimmed = name.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmed || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true); setJoinError("")
    const { data: existing } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("wb_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
  }

  async function setPoints(n) {
    setStartingPoints(n)
    await supabase.rpc("wb_set_starting_points", { p_code: code, p_points: n })
  }

  async function startGame() {
    if (starting || !canStart) return
    setStarting(true)
    const { error } = await supabase.rpc("wb_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Word Birds — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  if (gameExists === null) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: INK_MUTED, fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!gameExists) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}><p style={{ color: INK, fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p></div>
  }
  if (phase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: INK }}>Word Birds</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: INK }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: INK_MUTED, fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
      <div style={{ background: DARK, padding: "24px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Word Birds</div>
          <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, color: "white" }}>{code}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setSettingsOpen(true)} aria-label="Settings" style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 18, padding: "10px 14px" }}>⚙️</button>
          <button onClick={invite} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}>Invite</button>
        </div>
      </div>

      <div style={{ padding: "20px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 10 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {players.length === 0 && <div style={{ fontSize: 14, color: INK_MUTED, fontStyle: "italic" }}>No players yet</div>}
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "12px 14px", borderRadius: 14, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>
                {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
              </span>
              {p.id !== myPlayerId && (
                <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("wb_players").delete().eq("id", p.id); refreshPlayers() } }}
                  aria-label={`Remove ${p.name}`}
                  style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
              )}
            </div>
          ))}
        </div>
        {!canStart && (
          <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, marginTop: 12 }}>
            Need {MIN_PLAYERS - players.length} more player{MIN_PLAYERS - players.length === 1 ? "" : "s"} to start.
          </p>
        )}
        <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, marginTop: 12 }}>Starting points: {startingPoints}</p>
      </div>

      <div style={{ padding: "8px 20px 0" }}>
        {!me ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 12 }}>Join Game</div>
            {!savedProfile && (
              <>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              </>
            )}
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && join()} placeholder="Display name" maxLength={40} style={inputStyle} />
            <button onClick={join} disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
              style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", marginTop: 8, display: "block" }}>
              {joining ? "Joining…" : "Join"}
            </button>
            {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginTop: 10 }}>{joinError}</div>}
          </>
        ) : (
          <button onClick={startGame} disabled={!canStart || starting}
            style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "18px", width: "100%", display: "block" }}>
            {starting ? "Starting…" : "Start Game"}
          </button>
        )}
      </div>

      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%", borderRadius: 18, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Starting Points</div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.7, marginBottom: 16 }}>How many points does each player start with?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {POINT_OPTIONS.map(n => (
                <button key={n} onClick={() => setPoints(n)}
                  style={{ flex: "1 1 auto", minWidth: 32, background: startingPoints === n ? BTN : WARM, color: startingPoints === n ? BTN_TEXT : INK, fontSize: 16, fontWeight: 900, padding: "12px 8px" }}>
                  {n}
                </button>
              ))}
            </div>
            <button onClick={() => setSettingsOpen(false)} style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "14px", width: "100%" }}>Done</button>
          </div>
        </div>
      )}

      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({ name: p.name }))}
        rules={WB_RULES}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
    </div>
  )
}
