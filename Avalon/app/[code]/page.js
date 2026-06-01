"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const BG         = "#0F1923"
const CARD       = "#1C2B3A"
const GOLD       = "#C9A84C"
const TEXT       = "#E8DCC8"
const GOOD       = "#4A8FD4"
const EVIL       = "#AA2222"
const TEAL       = "#12BAAA"
const WARM_LIGHT = "#19303B"

const MIN_PLAYERS = 5

const WORDS_A = ["AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER","KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ"]


function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
}
const MAX_PLAYERS = 10

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
  background: WARM_LIGHT, color: TEXT,
  fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block",
  border: "none", outline: "none", boxSizing: "border-box",
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [gameExists, setGameExists]   = useState(null)
  const [gamePhase, setGamePhase]     = useState("lobby")
  const [players, setPlayers]         = useState([])
  const [myPlayerId, setMyPlayerId]   = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName]     = useState("")
  const [lastName, setLastName]       = useState("")
  const [name, setName]               = useState("")
  const [joining, setJoining]         = useState(false)
  const [joinError, setJoinError]     = useState("")
  const [starting, setStarting]       = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("avalon_players")
      .select("id,name,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("avalon_games")
      .select("code,phase")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`avalon:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    supabase.from("game_instructions").select("body").eq("game_key", "avalon").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadGame().then(() => refreshPlayers())
  }, [code])

  useEffect(() => {
    const poll = setInterval(async () => {
      await refreshPlayers()
      const { data } = await supabase
        .from("avalon_games")
        .select("phase")
        .eq("code", code)
        .single()
      if (data) setGamePhase(data.phase)
    }, 1500)
    return () => clearInterval(poll)
  }, [code])

  useEffect(() => {
    if (gamePhase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [gamePhase, myPlayerId])

  async function join() {
    const trimmed = name.trim()
    if (!trimmed || joining) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("avalon_players")
      .select("id,first_name,last_name")
      .eq("game_code", code)
      .ilike("name", trimmed)
      .limit(1)

    if (existing?.length > 0) {
      const match = existing[0]
      const isMe = match.first_name?.toLowerCase() === trimmedFirst.toLowerCase()
               && match.last_name?.toLowerCase()  === trimmedLast.toLowerCase()
      if (isMe) {
        localStorage.setItem(`avalon:${code}:playerId`, match.id)
        setMyPlayerId(match.id)
        await refreshPlayers()
        setJoining(false)
        return
      }
      setJoinError("That name is taken.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("avalon_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id")
      .single()

    if (error) { setJoinError("Failed to join."); setJoining(false); return }
    localStorage.setItem(`avalon:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    await refreshPlayers()
    setJoining(false)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("start_avalon_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    router.push(`/${code}/play`)
  }

  const me = players.find(p => p.id === myPlayerId)
  const count = players.length
  const canStart = !!me && count >= MIN_PLAYERS && count <= MAX_PLAYERS

  if (gameExists === null) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(232,220,200,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  if (!gameExists) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: TEXT, fontSize: 24, fontWeight: 900 }}>Game not found.</p>
      </div>
    )
  }

  if (gamePhase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: TEXT }}>Avalon</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, letterSpacing: "-0.5px", color: TEXT }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, opacity: 0.55, fontWeight: 500, marginBottom: 32, color: TEXT }}>This page will update automatically.</p>
        <button onClick={loadState} style={{ background: GOLD, color: "#000", fontSize: 18, fontWeight: 900, padding: "18px 28px" }}>Join Lobby</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: TEXT, paddingBottom: "max(48px, calc(48px + env(safe-area-inset-bottom, 0px)))" }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: "#0A1520", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
            Avalon
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>
            {(() => { const [w1, w2] = splitCode(code); return <><span style={{ color: GOLD }}>{w1}</span><span style={{ color: TEXT }}>{w2}</span></> })()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) await navigator.share({ title: `Join Avalon — ${code}`, url })
              else { await navigator.clipboard.writeText(url); alert("Link copied!") }
            }}
            style={{ background: WARM_LIGHT, color: TEXT, fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
          >
            Invite
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{ background: "rgba(255,255,255,0.15)", color: TEXT, fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
          >
            How to Play
          </button>
        </div>
      </div>

      {/* Start CTA */}
      {canStart && (
        <div style={{ padding: "20px 24px", background: GOLD }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(0,0,0,0.5)", marginBottom: 12 }}>
            Ready to Start?
          </div>
          <button
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
            style={{ background: "#000", color: GOLD, fontSize: 24, fontWeight: 900, padding: "20px", width: "100%", display: "block" }}
          >
            {starting ? "Starting…" : "Start Game"}
          </button>
        </div>
      )}

      {/* Join */}
      <div style={{ padding: "28px 24px 0" }}>
        {!me ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(232,220,200,0.35)", marginBottom: 14 }}>
              Join Game
            </div>
            {!savedProfile && (
              <>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                <input value={lastName}  onChange={e => setLastName(e.target.value)}  placeholder="Last name"  maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              </>
            )}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && join()}
              placeholder="Display Name"
              maxLength={45}
              style={inputStyle}
            />
            <button
              onClick={join}
              disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining || count >= MAX_PLAYERS}
              style={{ background: GOLD, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", marginTop: 8, display: "block" }}
            >
              {joining ? "Joining…" : "Join"}
            </button>
            {joinError && <p style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: GOLD }}>{joinError}</p>}
          </>
        ) : null}
      </div>

      {/* Players */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(232,220,200,0.35)", marginBottom: 14 }}>
          Players — {count} / {MAX_PLAYERS}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {players.map((p, i) => (
            <div key={p.id} style={{
              background: CARD, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.65, minWidth: 20 }}>{i + 1}</span>
              <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>
                {p.name}
                
              </span>
            </div>
          ))}
          {count < MIN_PLAYERS && (
            <div style={{ background: CARD, padding: "14px 16px", opacity: 0.35, fontSize: 14, fontStyle: "italic" }}>
              Need at least {MIN_PLAYERS} players
            </div>
          )}
        </div>
      </div>

      {showInstructions && (
        <div
          onClick={() => setShowInstructions(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1A1A2E", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>How to Play</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, fontWeight: 400, whiteSpace: "pre-wrap" }}>
              {instructions || "Loading…"}
            </div>
          </div>
        </div>
      )}

      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1C2B3A", width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: TEXT, opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: "#253545",
                    fontSize: 15, fontWeight: 900, color: TEXT,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: WARM_LIGHT,
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>
                      {p.name}
                      
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmingStart(false)}
                style={{ flex: 1, background: WARM_LIGHT, color: TEXT, fontSize: 17, fontWeight: 800, padding: "16px" }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: GOLD, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
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
