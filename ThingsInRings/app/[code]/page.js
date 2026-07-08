"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Footer, { FOOTER_H } from "../../components/Footer"
import Menu from "../../components/Menu"
import { TIR_RULES } from "../../components/rulesText"

const BG = "#C0C9BC"
const INK = "#2A303C"
const INK_MUTED = "rgba(42,48,60,0.6)"
const DARK = "#2C3827"
const PANEL = "#94A68D"
const WARM = "#C1E0B4"
const BTN = "#2A303C"
const BTN_TEXT = "#FFF4F0"
const RED = "#C0392B"
const INPUT_BG = "#FFFFFF"

const MIN_FINDERS = 2

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
const POKE_COLORS = { dark: DARK, mid: "#3E4F37", wl: WARM, yellow: "#FBDF54", notifBg: "#1F2A1B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [phase, setPhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [replayOf, setReplayOf] = useState(null)
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
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const knower = players.find(p => p.is_knower)
  const finderCount = players.filter(p => !p.is_knower).length
  const canStart = !!knower && finderCount >= MIN_FINDERS

  async function refreshPlayers() {
    const { data } = await supabase.from("tir_players")
      .select("id,name,is_knower,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase.from("tir_games")
      .select("code,phase,is_dummy,replay_of,replay_code").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    if (data.replay_code) { router.replace(`/${data.replay_code}`); return }
    setGameExists(true)
    setPhase(data.phase || "lobby")
    setIsDummy(!!data.is_dummy)
    setReplayOf(data.replay_of ?? null)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`thingsinrings:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`tir-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tir_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "tir_games", filter: `code=eq.${code}` }, loadState)
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
      const { data: taken } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("tir_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`thingsinrings:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`thingsinrings:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("tir_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
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
    const { data: existing } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("tir_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
  }

  async function toggleKnower(isKnower) {
    if (!me) return
    await supabase.rpc("tir_set_knower", { p_code: code, p_player_id: me.id, p_is_knower: isKnower })
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function startGame() {
    if (starting || !canStart) return
    setStarting(true)
    const { error } = await supabase.rpc("tir_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Things in Rings — ${code}`, url })
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
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: INK }}>Things in Rings</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: INK }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: INK_MUTED, fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
      <div style={{ background: DARK, padding: "24px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Things in Rings</div>
          <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, color: "white" }}>{code}</div>
        </div>
        <button onClick={invite} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px", flexShrink: 0 }}>Invite</button>
      </div>

      <div style={{ padding: "20px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 10 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {players.length === 0 && <div style={{ fontSize: 14, color: INK_MUTED, fontStyle: "italic" }}>No players yet</div>}
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "12px 14px" }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>
                {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
              </span>
              {p.id === myPlayerId && (
                <button
                  onClick={() => toggleKnower(!p.is_knower)}
                  style={{
                    background: p.is_knower ? BTN : "rgba(42,48,60,0.12)",
                    color: p.is_knower ? BTN_TEXT : INK,
                    fontSize: 13, fontWeight: 900, padding: "8px 14px", whiteSpace: "nowrap",
                  }}
                >
                  {p.is_knower ? "Knower ✓" : "Play as Knower"}
                </button>
              )}
              {p.id !== myPlayerId && p.is_knower && (
                <span style={{ background: BTN, color: BTN_TEXT, fontSize: 12, fontWeight: 900, padding: "6px 12px" }}>Knower</span>
              )}
              {p.id !== myPlayerId && (
                <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("tir_players").delete().eq("id", p.id); refreshPlayers() } }}
                  aria-label={`Remove ${p.name}`}
                  style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
              )}
            </div>
          ))}
        </div>
        {!canStart && (
          <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, marginTop: 12 }}>
            {!knower ? "One player must volunteer as the Knower." : `Need ${MIN_FINDERS - finderCount} more finder${MIN_FINDERS - finderCount === 1 ? "" : "s"} to start.`}
          </p>
        )}
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

      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({ name: p.name }))}
        rules={TIR_RULES}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
    </div>
  )
}
