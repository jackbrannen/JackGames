"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { FOOTER_H } from "../../components/styles"
import { RULES } from "../../lib/rules"

const BG = "#FF85FD"
const INK = "#3C3022"
const INK_MUTED = "rgba(60,48,34,0.6)"
const DARK = "#882F9E"        // cool-dark (hue ~288)
const PANEL = "#FFD1F5"       // warm light (hue ~313) — cards
const WARM = "#FFBDF1"        // warm light (hue ~313) — inputs, secondary buttons
const BTN = "#3C3022"
const BTN_TEXT = "#FFF4F0"
const RED = "#C0392B"
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const MIN_PLAYERS = 2

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
  const [roundsTotal, setRoundsTotal] = useState(8)
  const [matchThreshold, setMatchThreshold] = useState(2)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [isDummy, setIsDummy] = useState(false)
  const [parentCode, setParentCode] = useState(null)
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
  const [showSettings, setShowSettings] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const hasAutoJoinedRef = useRef(false)
  const hasReplayJoinedRef = useRef(false)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const canStart = gameExists === true && players.length >= MIN_PLAYERS

  async function refreshPlayers() {
    const { data } = await supabase.from("sp_players")
      .select("id,name,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }
  async function loadGame() {
    const { data, error } = await supabase.from("sp_games").select("code,phase,rounds_total,match_threshold,timer_seconds,is_dummy,replay_of").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setPhase(data.phase || "lobby")
    setRoundsTotal(data.rounds_total ?? 8)
    setMatchThreshold(data.match_threshold ?? 2)
    setTimerSeconds(data.timer_seconds ?? 0)
    setIsDummy(!!data.is_dummy)
    setParentCode(data.replay_of ?? null)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`samepage:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  // Auto-join from saved profile — dummy games only (real games join manually).
  useEffect(() => {
    if (!isDummy || gameExists !== true || phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("sp_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("sp_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`samepage:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay — only for browsers
  // that held a playerId in the parent game, so this can't be used to skip
  // the join form on an arbitrary shared link.
  useEffect(() => {
    if (!parentCode || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`samepage:${parentCode}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("sp_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`samepage:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("sp_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`samepage:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [parentCode, gameExists, phase, myPlayerId, code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`samepage-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sp_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "sp_games", filter: `code=eq.${code}` }, loadState)
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
    const { data: existing } = await supabase.from("sp_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("sp_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`samepage:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
  }

  async function changeRounds(next) {
    const clamped = Math.max(4, Math.min(12, next))
    setRoundsTotal(clamped)
    await supabase.from("sp_games").update({ rounds_total: clamped }).eq("code", code)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function changeTimer(seconds) {
    setTimerSeconds(seconds)
    await supabase.from("sp_games").update({ timer_seconds: seconds }).eq("code", code)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function changeThreshold(next) {
    const clamped = Math.max(2, Math.min(Math.max(2, players.length), next))
    setMatchThreshold(clamped)
    await supabase.from("sp_games").update({ match_threshold: clamped }).eq("code", code)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("sp_start_game", { p_code: code, p_rounds: roundsTotal })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
    router.push(`/${code}/play`)
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Same Page — ${code}`, url })
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
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: INK }}>Same Page</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: INK }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: INK_MUTED, fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  return (
    <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        {/* Header */}
        <div style={{ background: DARK, padding: "24px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Same Page</div>
            <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, color: "white" }}>{code}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <button onClick={invite} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}>Invite</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowInstructions(true)} style={{ flex: 1, background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 12px", whiteSpace: "nowrap" }}>How to Play</button>
              <button onClick={() => setShowSettings(true)} aria-label="Settings" style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 16, fontWeight: 800, padding: "10px 12px" }}>⚙</button>
            </div>
          </div>
        </div>

        {/* Settings summary */}
        <div style={{ padding: "16px 20px 0", fontSize: 14, fontWeight: 700, color: INK_MUTED }}>
          {roundsTotal} rounds · {matchThreshold} need to match · {timerSeconds > 0 ? `${timerSeconds}s timer` : "No timer"}
        </div>

        {/* Players */}
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 10 }}>Players</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {players.length === 0 && <div style={{ fontSize: 14, color: INK_MUTED, fontStyle: "italic" }}>No players yet</div>}
            {players.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "12px 14px" }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>
                  {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                </span>
                {p.id !== myPlayerId && (
                  <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("sp_players").delete().eq("id", p.id); refreshPlayers() } }}
                    aria-label={`Remove ${p.name}`}
                    style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
                )}
              </div>
            ))}
          </div>
          {!canStart && (
            <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, marginTop: 12 }}>
              Need {MIN_PLAYERS - players.length} more {MIN_PLAYERS - players.length === 1 ? "player" : "players"} to start.
            </p>
          )}
        </div>

        {/* Join / You */}
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
          ) : null}
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

      {/* Settings modal */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 360, padding: "24px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: INK, marginBottom: 18 }}>Settings</div>

            <div style={{ fontSize: 13, fontWeight: 700, color: INK_MUTED, marginBottom: 10 }}>Number of rounds (4–12)</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <button onClick={() => changeRounds(roundsTotal - 1)} disabled={roundsTotal <= 4}
                style={{ width: 52, height: 52, background: WARM, color: INK, fontSize: 28, fontWeight: 900 }}>−</button>
              <div style={{ fontSize: 40, fontWeight: 900, color: INK, minWidth: 56, textAlign: "center" }}>{roundsTotal}</div>
              <button onClick={() => changeRounds(roundsTotal + 1)} disabled={roundsTotal >= 12}
                style={{ width: 52, height: 52, background: WARM, color: INK, fontSize: 28, fontWeight: 900 }}>+</button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: INK_MUTED, margin: "22px 0 10px" }}>How many must match per prompt (2–{Math.max(2, players.length)})</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <button onClick={() => changeThreshold(matchThreshold - 1)} disabled={matchThreshold <= 2}
                style={{ width: 52, height: 52, background: WARM, color: INK, fontSize: 28, fontWeight: 900 }}>−</button>
              <div style={{ fontSize: 40, fontWeight: 900, color: INK, minWidth: 56, textAlign: "center" }}>{matchThreshold}</div>
              <button onClick={() => changeThreshold(matchThreshold + 1)} disabled={matchThreshold >= Math.max(2, players.length)}
                style={{ width: 52, height: 52, background: WARM, color: INK, fontSize: 28, fontWeight: 900 }}>+</button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: INK_MUTED, margin: "22px 0 10px" }}>Answering timer (optional)</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[0, 60, 90, 120].map(s => (
                <button key={s} onClick={() => changeTimer(s)}
                  style={{ flex: 1, padding: "12px 4px", background: timerSeconds === s ? BTN : WARM, color: timerSeconds === s ? BTN_TEXT : INK, fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer" }}>
                  {s === 0 ? "Off" : `${s}s`}
                </button>
              ))}
            </div>

            <button onClick={() => setShowSettings(false)} style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "14px", width: "100%", marginTop: 24, display: "block" }}>Done</button>
          </div>
        </div>
      )}

      {/* Instructions modal */}
      {showInstructions && (
        <div onClick={() => setShowInstructions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: INK }}>How to Play</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "rgba(60,48,34,0.12)", color: INK, fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {RULES.map(([title, body]) => (
                <div key={title}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: INK, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 15, color: "rgba(60,48,34,0.85)", lineHeight: 1.6, fontWeight: 400 }}>{body}</div>
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
            <p style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 20 }}>{players.length} players · {roundsTotal} rounds. Begin for everyone?</p>
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
