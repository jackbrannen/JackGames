"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { FOOTER_H } from "../../components/styles"
import { RULES } from "../../lib/rules"

const BG = "#E8553A"
const INK = "#2A2D34"
const INK_MUTED = "rgba(42,45,52,0.6)"
const DARK = "#B83A22"        // deep coral — header/status bars (white text)
const PANEL = "#FFF1EA"       // cream — cards
const WARM = "#FBD7CC"        // light coral tint — inputs, secondary buttons
const BTN = "#2A2D34"         // charcoal
const BTN_TEXT = "#FFF1EA"
const RED = "#C0392B"
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const MIN_PLAYERS = 3

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
  background: WARM, color: INK, fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block", border: "none", outline: "none", boxSizing: "border-box",
}

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
  const [showInstructions, setShowInstructions] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const hasAutoJoinedRef = useRef(false)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const canStart = gameExists === true && players.length >= MIN_PLAYERS

  async function refreshPlayers() {
    const { data } = await supabase.from("tc_players")
      .select("id,name,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }
  async function loadGame() {
    const { data, error } = await supabase.from("tc_games").select("code,phase,is_dummy,replay_of,replay_code").eq("code", code).single()
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
    const existing = localStorage.getItem(`typecast:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  // Auto-join from saved profile — dummy games only.
  useEffect(() => {
    if (!isDummy || gameExists !== true || phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("tc_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("tc_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`typecast:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay — only for browsers
  // that held a playerId in the parent game, so this can't be used to skip
  // the join form on an arbitrary shared link.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`typecast:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("tc_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`typecast:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("tc_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`typecast:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [replayOf, gameExists, phase, myPlayerId, code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`typecast-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "tc_games", filter: `code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (phase && phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [phase, myPlayerId])

  async function join() {
    const trimmed = name.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmed || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true); setJoinError("")
    const { data: existing } = await supabase.from("tc_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("tc_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`typecast:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("tc_open_roster", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
    router.push(`/${code}/play`)
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Typecast — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  if (gameExists === null) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(255,241,234,0.85)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!gameExists) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}><p style={{ color: "#FFF1EA", fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p></div>
  }
  if (phase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,241,234,0.7)", marginBottom: 16 }}>Typecast</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "#FFF1EA" }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: "rgba(255,241,234,0.8)", fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  return (
    <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        {/* Header */}
        <div style={{ background: DARK, padding: "24px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Typecast</div>
            <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, color: "white" }}>{code}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <button onClick={invite} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}>Invite</button>
            <button onClick={() => setShowInstructions(true)} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 14px", whiteSpace: "nowrap" }}>How to Play</button>
          </div>
        </div>

        <div style={{ padding: "16px 20px 0", fontSize: 14, fontWeight: 700, color: "rgba(255,241,234,0.9)" }}>
          {MIN_PLAYERS}+ players · everyone is the Matcher once
        </div>

        {/* Players */}
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#FFF1EA", marginBottom: 10 }}>Players</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {players.length === 0 && <div style={{ fontSize: 14, color: "rgba(255,241,234,0.8)", fontStyle: "italic" }}>No players yet</div>}
            {players.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "12px 14px" }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>
                  {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                </span>
                {p.id !== myPlayerId && (
                  <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("tc_players").delete().eq("id", p.id); refreshPlayers() } }}
                    aria-label={`Remove ${p.name}`}
                    style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
                )}
              </div>
            ))}
          </div>
          {!canStart && (
            <p style={{ fontSize: 13, color: "rgba(255,241,234,0.9)", fontWeight: 600, marginTop: 12 }}>
              Need {MIN_PLAYERS - players.length} more {MIN_PLAYERS - players.length === 1 ? "player" : "players"} to start.
            </p>
          )}
        </div>

        {/* Join */}
        <div style={{ padding: "8px 20px 0" }}>
          {!me && (
            <>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#FFF1EA", marginBottom: 12 }}>Join Game</div>
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
              {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#FFF1EA", background: RED, padding: "10px 12px", marginTop: 10 }}>{joinError}</div>}
            </>
          )}
        </div>
      </div>

      {/* Start bar */}
      {canStart && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: FOOTER_H, background: BTN, display: "flex", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button onClick={() => setConfirmingStart(true)} disabled={starting}
            style={{ flex: 1, background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, border: "none" }}>
            {starting ? "Starting…" : "Start Game"}
          </button>
        </div>
      )}

      {/* Instructions modal */}
      {showInstructions && (
        <div onClick={() => setShowInstructions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: INK }}>How to Play</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "rgba(42,45,52,0.12)", color: INK, fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {RULES.map(([title, body]) => (
                <div key={title}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: INK, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 15, color: "rgba(42,45,52,0.85)", lineHeight: 1.6, fontWeight: 400 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Start confirm */}
      {confirmingStart && (
        <div onClick={() => setConfirmingStart(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginBottom: 8 }}>Start the game?</div>
            <p style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 20 }}>{players.length} players, {players.length} rounds. Next you'll pick who gets words assigned to them.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM, color: INK, fontSize: 16, fontWeight: 800, padding: "16px" }}>Cancel</button>
              <button onClick={() => { setConfirmingStart(false); startGame() }} disabled={starting} style={{ flex: 2, background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px" }}>Start</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
