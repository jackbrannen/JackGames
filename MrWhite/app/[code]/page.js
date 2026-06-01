"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const BG = "#2C2540"
const DARK = "#1F1829"
const MID = "#251E33"
const WARM_LIGHT = "#464171"
const YELLOW = "#FBDF54"
const MIN_PLAYERS = 4

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "PANDA","TIGER","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA",
]

function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
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
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

const inputStyle = {
  background: WARM_LIGHT,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
  boxSizing: "border-box",
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [notFound, setNotFound] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)

  // Slide-to-delete
  const [swipedId, setSwipedId] = useState(null)
  const [activeSwipe, setActiveSwipe] = useState(null)   // { id, offset } | null
  const [removeConfirmPlayer, setRemoveConfirmPlayer] = useState(null)
  const [removing, setRemoving] = useState(false)
  const touchRef = useRef({})

  const me = players.find(p => p.id === myPlayerId)
  const humanPlayers = players.filter(p => !p.is_bot)

  async function loadState() {
    const { data: gameData } = await supabase
      .from("mrwhite_games")
      .select("code,phase,is_dummy")
      .eq("code", code)
      .single()

    if (!gameData) { setNotFound(true); return }

    const { data: playerData } = await supabase
      .from("mrwhite_players")
      .select("id,name,is_bot,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  useEffect(() => {
    const existing = localStorage.getItem(`mw:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setUsername(saved.username || "")
    }
  }, [])

  useEffect(() => {
    loadState()
    supabase.from("game_instructions").select("body").eq("game_key", "mrwhite").single().then(({ data }) => { if (data?.body) setInstructions(data.body) })
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`mw-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mrwhite_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "mrwhite_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (game?.phase === "statements" && me) router.replace(`/${code}/play`)
  }, [game?.phase, me])

  useEffect(() => {
    if (game?.phase === "finished" && me) {
      supabase.rpc("mw_reset_game", { p_code: code })
    }
  }, [game?.phase, me])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!game || game.phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("mrwhite_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("mrwhite_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim(), is_bot: false })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`mw:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [game?.phase, myPlayerId, code])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("mrwhite_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmedUsername)
      .limit(1)

    if (existing?.length > 0) {
      setJoinError("That name is already taken. Please choose another.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("mrwhite_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast, is_bot: false })
      .select("id")
      .single()

    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`mw:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    try {
      const res = await fetch("/api/mw-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to start")
    } catch (e) {
      alert("Failed to start: " + e.message)
      setStarting(false)
    }
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "white", fontSize: 20, fontWeight: 700, textAlign: "center" }}>Game not found. Check the code and try again.</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  if (game.phase !== "lobby" && !me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16 }}>Mr. White</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "white" }}>
          {game.phase === "finished" ? "Game over." : "A game is in progress."}
        </h2>
        <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, marginBottom: 32, color: "white" }}>
          {game.phase === "finished" ? "The lobby will open shortly." : "This page will update when the game ends."}
        </p>
        <button onClick={loadState} style={{ background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px" }}>Refresh</button>
      </div>
    )
  }

  const canStart = humanPlayers.length >= MIN_PLAYERS

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white" }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: DARK, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 4 }}>
            Mr. White
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {(() => {
              const [w1, w2] = splitCode(code)
              return <><span style={{ color: YELLOW }}>{w1}</span><span style={{ color: "rgba(255,255,255,0.75)" }}>{w2}</span></>
            })()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) await navigator.share({ title: `Join Mr. White — ${code}`, url })
              else { await navigator.clipboard.writeText(url); alert("Link copied!") }
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
        </div>
      </div>

      {/* Start CTA */}
      {canStart && me && (
        <div style={{ padding: "20px 24px", background: YELLOW }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#000", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            All players in?
          </div>
          <button
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
            style={{ background: "#000", color: YELLOW, fontSize: 24, fontWeight: 900, padding: "20px", width: "100%", display: "block" }}
          >
            {starting ? "Starting…" : "Start Game"}
          </button>
          <p style={{ fontSize: 13, color: "#000", opacity: 0.5, marginTop: 10, fontWeight: 600 }}>
            {humanPlayers.length} players. One will be Mr. White.
          </p>
        </div>
      )}

      {/* Join form */}
      {!me && (
        <div style={{ padding: "28px 24px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
            Join Game
          </div>
          {!savedProfile && (
            <>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
            </>
          )}
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && join()}
            placeholder="Display name"
            maxLength={40}
            style={inputStyle}
          />
          <button
            onClick={join}
            disabled={!username.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
            style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", marginTop: 8, display: "block" }}
          >
            {joining ? "Joining…" : "Join"}
          </button>
          {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#F97316", marginTop: 10 }}>{joinError}</div>}
        </div>
      )}

      {/* Players */}
      <div style={{ padding: "28px 24px 40px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
          Players
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {humanPlayers.length === 0 && (
            <div style={{ fontSize: 15, opacity: 0.65, padding: "14px 0" }}>No players yet.</div>
          )}
          {humanPlayers.map((p, i) => {
            const rowOffset = activeSwipe?.id === p.id ? activeSwipe.offset : (swipedId === p.id ? -80 : 0)
            return (
              <div key={p.id} style={{ position: "relative", overflow: "hidden" }}>
                {/* Delete revealer */}
                <div
                  onClick={() => { setSwipedId(null); setActiveSwipe(null); setRemoveConfirmPlayer(p) }}
                  style={{
                    position: "absolute", right: 0, top: 0, bottom: 0, width: 80,
                    background: "#A02020",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</span>
                </div>
                {/* Sliding row */}
                <div
                  style={{
                    display: "flex",
                    transform: `translateX(${rowOffset}px)`,
                    transition: activeSwipe?.id === p.id ? "none" : "transform 0.2s ease",
                  }}
                  onTouchStart={e => {
                    const t = e.touches[0]
                    touchRef.current = { startX: t.clientX, startY: t.clientY, id: p.id, dir: null }
                  }}
                  onTouchMove={e => {
                    const tr = touchRef.current
                    if (!tr || tr.id !== p.id) return
                    const t = e.touches[0]
                    const dx = t.clientX - tr.startX
                    const dy = t.clientY - tr.startY
                    if (!tr.dir) {
                      if (Math.abs(dx) > 6 || Math.abs(dy) > 6)
                        tr.dir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v"
                    }
                    if (tr.dir !== "h") return
                    const base = swipedId === p.id ? -80 : 0
                    const offset = Math.max(Math.min(base + dx, 0), -80)
                    setActiveSwipe({ id: p.id, offset })
                  }}
                  onTouchEnd={e => {
                    const tr = touchRef.current
                    if (!tr || tr.id !== p.id) return
                    const current = activeSwipe?.id === p.id ? activeSwipe.offset : (swipedId === p.id ? -80 : 0)
                    setActiveSwipe(null)
                    if (current < -40) setSwipedId(p.id)
                    else setSwipedId(null)
                    touchRef.current = {}
                  }}
                >
                  <div style={{
                    padding: "13px 0", minWidth: 48, flexShrink: 0,
                    background: DARK,
                    fontSize: 18, fontWeight: 900, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "13px 16px", flex: 1, minWidth: 0,
                    background: MID,
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>
                      {p.name}
                      
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {humanPlayers.length < MIN_PLAYERS && (
          <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 12 }}>
            Minimum {MIN_PLAYERS} players needed.
          </p>
        )}
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

      {/* Remove player confirmation */}
      {removeConfirmPlayer && (
        <div
          onClick={() => setRemoveConfirmPlayer(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: MID, width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 10 }}>
              Remove {removeConfirmPlayer.name}?
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", fontWeight: 600, marginBottom: 24, lineHeight: 1.5 }}>
              This removes them from the game entirely. They can rejoin from the lobby screen.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setRemoveConfirmPlayer(null)}
                style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 800, padding: "15px" }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (removing) return
                  setRemoving(true)
                  await supabase.from("mrwhite_players").delete().eq("id", removeConfirmPlayer.id)
                  if (removeConfirmPlayer.id === myPlayerId) {
                    localStorage.removeItem(`mw:${code}:playerId`)
                    setMyPlayerId(null)
                  }
                  setRemoveConfirmPlayer(null)
                  setRemoving(false)
                }}
                disabled={removing}
                style={{ flex: 2, background: "#A02020", color: "white", fontSize: 16, fontWeight: 900, padding: "15px" }}
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm start modal */}
      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: MID, width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              One player will secretly be Mr. White. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {humanPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ padding: "10px 0", minWidth: 40, flexShrink: 0, background: DARK, fontSize: 15, fontWeight: 900, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i + 1}
                  </div>
                  <div style={{ padding: "10px 14px", flex: 1, background: WARM_LIGHT, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                      {p.name}
                      
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
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
