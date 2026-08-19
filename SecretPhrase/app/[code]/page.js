"use client"

import { supabase } from "../../lib/supabase"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Footer, { FOOTER_H } from "../../components/Footer"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const BG = "#2434C4"
const COOL_DARK = "#2920AD"
const MID_DARK = "#2224B7"
const WARM_LIGHT = "#2858DB"
const YELLOW = "#FBDF54"
const BOYS = "#F97316"
const GIRLS = "#C026D3"

const POKE_COLORS = { dark: COOL_DARK, mid: MID_DARK, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#1B1868" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
]

function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
}

const inputStyle = {
  background: WARM_LIGHT,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
}

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
  if (!profile.username) return
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

function applyRowChange(setList) {
  return (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") { setList(prev => prev.filter(r => r.id !== oldRow?.id)); return }
    if (!newRow) return
    setList(prev => {
      const idx = prev.findIndex(r => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
    })
  }
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [players, setPlayers] = useState([])
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinTeam, setJoinTeam] = useState(null)
  const [joining, setJoining] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [answerDuration, setAnswerDuration] = useState(20)
  const [showSettings, setShowSettings] = useState(false)
  const hasRedirectedRef = useRef(false)
  const channelRef = useRef(null)
  const loadSeqRef = useRef(0)
  const isIdle = useIdleGate()

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "secretphrase").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
  }, [])

  async function refreshPlayers() {
    const { data } = await supabase
      .from("secretphrase_players")
      .select("id,name,team,ready,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: ps }, { data: g }] = await Promise.all([
      supabase.from("secretphrase_players").select("id,name,team,ready,created_at").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("secretphrase_games").select("phase,is_dummy,answer_duration_seconds").eq("code", code).single(),
    ])
    if (seq !== loadSeqRef.current) return
    setPlayers(ps ?? [])
    if (g) {
      setGamePhase(g.phase || "lobby")
      setIsDummy(!!g.is_dummy)
      if (g.answer_duration_seconds) setAnswerDuration(g.answer_duration_seconds)
    }
  }

  useEffect(() => {
    const existing = localStorage.getItem(`secretphrase:${code}:playerId`)
    if (existing) setMyPlayerId(existing)

    let cancelled = false
    async function loadGame() {
      const { data, error } = await supabase
        .from("secretphrase_games")
        .select("code,phase,is_dummy,answer_duration_seconds")
        .eq("code", code)
        .single()
      if (cancelled) return
      if (error || !data) { setGameExists(false); return }
      setGameExists(true)
      setGamePhase(data.phase || "lobby")
      setIsDummy(!!data.is_dummy)
      if (data.answer_duration_seconds) setAnswerDuration(data.answer_duration_seconds)
      await refreshPlayers()
    }
    loadGame()
    return () => { cancelled = true }
  }, [code])

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setName(saved.username || "")
      if (saved.team) setJoinTeam(saved.team)
    }
  }, [])

  useEffect(() => {
    if (isIdle) return
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase
        .channel("secretphrase-lobby-" + code)
        .on("postgres_changes", { event: "*", schema: "public", table: "secretphrase_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "secretphrase_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.new?.phase) setGamePhase(payload.new.phase)
          if (payload.new?.is_dummy !== undefined) setIsDummy(!!payload.new.is_dummy)
          if (payload.new?.answer_duration_seconds) setAnswerDuration(payload.new.answer_duration_seconds)
        })
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (reconnectTimer) return
            const delay = Math.min(2000 * 2 ** reconnectAttempt, 30000)
            reconnectAttempt++
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              if (cancelled) return
              supabase.removeChannel(channel)
              connect()
            }, delay)
          }
        })
      channelRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  useEffect(() => {
    if (hasRedirectedRef.current) return
    if (gamePhase === "play" || gamePhase === "finished") {
      hasRedirectedRef.current = true
      router.push(`/${code}/play`)
    }
  }, [gamePhase, code, router])

  async function join(team) {
    if (joining || !team) return
    const trimmed = name.trim()
    if (!trimmed || gamePhase !== "lobby") return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinTeam(team)

    const { data: existing } = await supabase
      .from("secretphrase_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmed)
      .limit(1)
    if (existing?.length > 0) {
      alert("That username is already taken in this game. Please choose another.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed, team }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("secretphrase_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team, ready: true })
      .select("id")
      .single()

    if (error) {
      alert("Error joining game")
      setJoining(false)
      return
    }

    localStorage.setItem(`secretphrase:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setName("")
    await refreshPlayers()
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    setJoining(false)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    setStartError("")
    try {
      const { error } = await supabase.rpc("secretphrase_start_game", { p_code: code })
      if (error) {
        setStartError(error.message)
        setStarting(false)
        return
      }
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      router.push(`/${code}/play`)
    } catch (e) {
      setStartError(e?.message || "Something went wrong — try again.")
      setStarting(false)
    }
  }

  const me = players.find(p => p.id === myPlayerId)
  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)
  const teamsBalanced = team1Players.length >= 2 && team2Players.length >= 2
  const everyoneReady = players.length > 0 && players.every(p => p.ready === true)
  const canStartGame = gameExists === true && gamePhase === "lobby" && everyoneReady && teamsBalanced
  const totalTurns = teamsBalanced ? Math.max(team1Players.length, team2Players.length) * 2 : 0

  if (isIdle) {
    return (
      <div style={{ minHeight: "100dvh", background: BG }}>
        <IdleGateModal colors={POKE_COLORS} />
      </div>
    )
  }

  if (gameExists === false) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Room not found.</p>
      </div>
    )
  }

  if (gameExists === null) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 700, opacity: 0.65 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white", paddingBottom: BOTTOM_PAD }}>
      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: COOL_DARK, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 4 }}>
            Secret Phrase
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {(() => { const [w1, w2] = splitCode(code); return <><span style={{ color: "#fff" }}>{w1}</span><span style={{ color: "rgba(255,255,255,0.55)" }}>{w2}</span></> })()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) {
                await navigator.share({ title: `Join Secret Phrase — ${code}`, url })
              } else {
                await navigator.clipboard.writeText(url)
                alert("Link copied!")
              }
            }}
            style={{ background: WARM_LIGHT, color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
          >
            Invite
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
          >
            How to Play
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: COOL_DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 8 }}>Settings</div>
            <p style={{ fontSize: 15, color: "white", opacity: 0.85, marginBottom: 16 }}>How long each answerer gets to answer.</p>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7, marginBottom: 10 }}>
              Answer duration
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[10, 15, 20, 25, 35, 40, 45].map(sec => (
                <button
                  key={sec}
                  onClick={async () => {
                    setAnswerDuration(sec)
                    await supabase.from("secretphrase_games").update({ answer_duration_seconds: sec }).eq("code", code)
                  }}
                  style={{
                    background: answerDuration === sec ? YELLOW : WARM_LIGHT,
                    color: answerDuration === sec ? "#000" : "white",
                    fontSize: 16, fontWeight: 900, padding: "14px 0",
                  }}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSettings(false)}
              style={{ width: "100%", background: WARM_LIGHT, color: "white", fontSize: 15, fontWeight: 800, padding: "14px" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showInstructions && (
        <div
          onClick={() => setShowInstructions(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: COOL_DARK, width: "100%", maxWidth: 440, maxHeight: "80vh", overflowY: "auto", padding: "28px 24px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 16 }}>How to Play</div>
            <p style={{ fontSize: 15, color: "white", opacity: 0.85, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {instructions || "Loading…"}
            </p>
            <button
              onClick={() => setShowInstructions(false)}
              style={{ marginTop: 20, width: "100%", background: WARM_LIGHT, color: "white", fontSize: 15, fontWeight: 800, padding: "14px" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Turn count preview */}
      {teamsBalanced && (
        <div style={{ padding: "16px 24px", fontSize: 14, opacity: 0.85, fontWeight: 700 }}>
          {totalTurns} turns total — {totalTurns / 2} each
        </div>
      )}

      {/* Team balance warning */}
      {!teamsBalanced && players.length > 0 && (
        <div style={{ padding: "16px 24px", background: COOL_DARK, fontSize: 14, fontWeight: 700, color: YELLOW }}>
          Need at least 2 players per team to start.
        </div>
      )}

      {/* Players */}
      {players.length > 0 && (
        <div style={{ padding: "12px 24px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Boys", color: BOYS, teamPlayers: team1Players },
              { label: "Girls", color: GIRLS, teamPlayers: team2Players },
            ].map(({ label, color, teamPlayers }) => (
              <div key={label} style={{ background: MID_DARK, overflow: "hidden" }}>
                <div style={{ background: color, color: "white", fontSize: 13, fontWeight: 900, padding: "8px 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {label}
                </div>
                <div style={{ padding: "8px 12px 10px" }}>
                  {teamPlayers.length === 0 && (
                    <div style={{ fontSize: 14, opacity: 0.65, fontStyle: "italic", padding: "4px 0" }}>No players</div>
                  )}
                  {teamPlayers.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.ready ? "#12BAAA" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                        {p.name}
                        {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, fontWeight: 600, marginLeft: 6 }}>you</span>}
                      </span>
                      {p.id !== myPlayerId && (
                        <button
                          onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("secretphrase_players").delete().eq("id", p.id); loadState() } }}
                          aria-label={`Remove ${p.name}`}
                          style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0 }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join */}
      {!me && (
        <div style={{ padding: "0 24px 28px" }}>
          {gamePhase !== "lobby" ? (
            <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 600 }}>Game already started. New players cannot join.</p>
          ) : (
            <>
              {!savedProfile && (
                <>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                </>
              )}
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Display Name"
                maxLength={45}
                style={inputStyle}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => join(1)}
                  disabled={joining || !name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim()))}
                  style={{ background: BOYS, color: "white", fontSize: 18, fontWeight: 900, padding: "18px" }}
                >
                  {joining && joinTeam === 1 ? "Joining…" : "Boys"}
                </button>
                <button
                  onClick={() => join(2)}
                  disabled={joining || !name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim()))}
                  style={{ background: GIRLS, color: "white", fontSize: 18, fontWeight: 900, padding: "18px" }}
                >
                  {joining && joinTeam === 2 ? "Joining…" : "Girls"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!!me && (
        <div style={{ padding: "0 24px 28px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={gamePhase !== "lobby"}
              onClick={async () => {
                const newTeam = me.team === 1 ? 2 : 1
                await supabase.from("secretphrase_players").update({ team: newTeam }).eq("id", me.id)
                const updated = { ...(savedProfile ?? {}), team: newTeam }
                saveProfile(updated)
                setSavedProfile(updated)
                await refreshPlayers()
                channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
              }}
              style={{ background: WARM_LIGHT, color: "white", fontSize: 14, fontWeight: 800, padding: "14px 18px", flex: 1 }}
            >
              Change Genders
            </button>
          </div>
        </div>
      )}

      {canStartGame && (
        <Footer colors={POKE_COLORS}>
          <button
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
            style={{ flex: 1, height: "100%", background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, opacity: starting ? 0.6 : 1 }}
          >
            {starting ? "Starting…" : "Start Game"}
          </button>
        </Footer>
      )}

      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: COOL_DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 12 }}>
              {totalTurns} turns total, {totalTurns / 2} per team. Are all players in?
            </p>
            {startError && <p style={{ fontSize: 14, color: YELLOW, fontWeight: 700, marginBottom: 12 }}>{startError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>
                Cancel
              </button>
              <button
                onClick={startGame}
                disabled={starting}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                {starting ? "Starting…" : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
