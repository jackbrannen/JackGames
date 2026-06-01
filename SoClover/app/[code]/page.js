"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const BG         = "#6B8C2A"
const COOL_DARK  = "#4C7523"
const MID_DARK   = "#5A8026"
const WARM_LIGHT = "#90A331"
const ACCENT     = "#FBDF54"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SPRING","SUMMER","WINTER","AUTUMN","MORNING","ORCHID","LANTERN","PINE",
  "CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","MIRROR","BRIDGE","CANDLE","BLOSSOM","CORAL","PEBBLE","MARBLE","FROST",
  "FLAME","SPARK","SHADOW","HONEY","LEMON","MANGO","PEACH","BERRY","PANDA","EAGLE",
  "WHALE","CLOVER","FERN","ACORN","MOSS","BRIAR",
]

function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code.slice(0, Math.ceil(code.length / 2)), code.slice(Math.ceil(code.length / 2))]
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
  background: WARM_LIGHT, color: "white", fontSize: 20,
  padding: "16px 18px", width: "100%", display: "block",
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame]               = useState(null)
  const [players, setPlayers]         = useState([])
  const [myPlayerId, setMyPlayerId]   = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName]     = useState("")
  const [lastName, setLastName]       = useState("")
  const [username, setUsername]       = useState("")
  const [joining, setJoining]         = useState(false)
  const [joinError, setJoinError]     = useState("")
  const [notFound, setNotFound]       = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [starting, setStarting]       = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)

  const me = players.find(p => p.id === myPlayerId)

  async function loadState() {
    const { data: gameData } = await supabase
      .from("soclover_games").select("*").eq("code", code).single()
    if (!gameData) { setNotFound(true); return }
    const { data: playerData } = await supabase
      .from("soclover_players").select("id,name,created_at")
      .eq("game_code", code).order("created_at", { ascending: true })
    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  useEffect(() => {
    const pid = localStorage.getItem(`soclover:${code}:playerId`)
    if (pid) setMyPlayerId(pid)
  }, [code])

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setUsername(saved.username || saved.name || "")
    }
  }, [])


  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "soclover").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const ch = supabase.channel(`soclover-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "soclover_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "soclover_players", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(ch) }
  }, [code])

  useEffect(() => {
    if (game?.phase && game.phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!game || game.phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("soclover_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("soclover_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim() })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`soclover:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [game?.phase, myPlayerId, code])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("soclover_players").select("id").eq("game_code", code).ilike("name", trimmedUsername).limit(1)
    if (existing?.length > 0) {
      setJoinError("That name is already taken in this game.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("soclover_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { setJoinError("Failed to join."); setJoining(false); return }

    const pid = data.id
    localStorage.setItem(`soclover:${code}:playerId`, pid)
    setMyPlayerId(pid)

  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    setConfirmingStart(false)
    const { error } = await supabase.rpc("soclover_start_game", { p_code: code })
    if (error) { setStarting(false); return }

    if (localStorage.getItem(`soclover:${code}:isDummy`) === "true") {
      const { data: boards } = await supabase.from("soclover_boards").select("*").eq("game_code", code)
      const CLUE_SETS = [
        { topLeft: "GLUE",  topRight: "CORD", bottomRight: "FUSE", bottomLeft: "BOND" },
        { topLeft: "LINK",  topRight: "MESH", bottomRight: "KNIT", bottomLeft: "JOIN" },
        { topLeft: "WELD",  topRight: "LACE", bottomRight: "GRIP", bottomLeft: "CLIP" },
        { topLeft: "MERGE", topRight: "BIND", bottomRight: "WEAVE", bottomLeft: "COIL" },
      ]
      await Promise.all((boards ?? []).map(async (board, i) => {
        const d = board.dealt_card_indices
        await supabase.rpc("soclover_submit_clues", {
          p_code: code, p_player_id: board.player_id,
          p_slots: {
            top:    { cardIndex: d[0], rotation: 0 },
            right:  { cardIndex: d[1], rotation: 0 },
            bottom: { cardIndex: d[2], rotation: 0 },
            left:   { cardIndex: d[3], rotation: 0 },
          },
          p_clues: CLUE_SETS[i % CLUE_SETS.length],
        })
      }))
    }
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "white", fontSize: 20, fontWeight: 700, textAlign: "center" }}>Game not found. Check the code and try again.</p>
      </div>
    )
  }

  // ── Game in progress for non-joined player ─────────────────────────────
  if (game && game.phase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.7, marginBottom: 16 }}>So Clover</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, marginBottom: 32, lineHeight: 1.5 }}>
          When this game ends, you'll be able to join the next one.
        </p>
        <button onClick={loadState} style={{ background: ACCENT, color: "#000", fontSize: 18, fontWeight: 900, padding: "18px 36px" }}>
          Refresh
        </button>
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

  const [w1, w2] = splitCode(code)
  const canStart = players.length >= 2

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white" }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: COOL_DARK, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 4 }}>
            So Clover
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            <span style={{ color: ACCENT }}>{w1}</span>
            <span style={{ color: "rgba(255,255,255,0.75)" }}>{w2}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) await navigator.share({ title: `Join So Clover — ${code}`, url })
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

      {/* Start CTA — any joined player, 2+ players */}
      {canStart && me && (
        <div style={{ padding: "20px 24px", background: ACCENT }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#000", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            All players in?
          </div>
          <button
            onClick={() => setConfirmingStart(true)}
            disabled={starting}
            style={{ background: "#000", color: ACCENT, fontSize: 24, fontWeight: 900, padding: "20px", width: "100%", display: "block" }}
          >
            {starting ? "Starting…" : "Start Game"}
          </button>
        </div>
      )}

      {/* Join form */}
      {!me && (
        <div style={{ padding: "28px 24px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
            Join Game
          </div>
          {(!savedProfile?.username) && (
            <>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              <input value={lastName}  onChange={e => setLastName(e.target.value)}  placeholder="Last name"  maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
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
            disabled={!username.trim() || (!savedProfile?.username && (!firstName.trim() || !lastName.trim())) || joining}
            style={{ background: ACCENT, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", marginTop: 8, display: "block" }}
          >
            {joining ? "Joining…" : "Join"}
          </button>
          {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>{joinError}</div>}
        </div>
      )}

      {/* Settings */}
      <div style={{ padding: "0 24px 0", borderTop: `1px solid rgba(255,255,255,0.08)` }}>
        <div style={{ padding: "20px 0 16px", fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>Settings</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: MID_DARK, padding: "16px" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>Fifth Card</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {game?.fifth_card_enabled ? "5 cards shown when guessing (includes decoy)" : "4 cards shown when guessing (no decoy)"}
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.from("soclover_games").update({ fifth_card_enabled: !game?.fifth_card_enabled }).eq("code", code)
              loadState()
            }}
            style={{
              background: game?.fifth_card_enabled ? ACCENT : "rgba(255,255,255,0.15)",
              color: game?.fifth_card_enabled ? "#000" : "white",
              fontSize: 14, fontWeight: 800, padding: "10px 16px", flexShrink: 0, marginLeft: 16,
            }}
          >{game?.fifth_card_enabled ? "On" : "Off"}</button>
        </div>
      </div>

      {/* Players */}
      <div style={{ padding: "28px 24px 60px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
          Players
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {players.length === 0 && (
            <div style={{ fontSize: 15, opacity: 0.65, fontStyle: "italic", padding: "12px 0" }}>No players yet</div>
          )}
          {players.map((p, i) => (
            <div key={p.id} style={{ display: "flex" }}>
              <div style={{
                padding: "13px 0", minWidth: 48, flexShrink: 0, background: COOL_DARK,
                fontSize: 18, fontWeight: 900, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {i + 1}
              </div>
              <div style={{ padding: "13px 16px", flex: 1, background: MID_DARK, display: "flex", alignItems: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {p.name}
                  
                </div>
              </div>
            </div>
          ))}
        </div>
        {players.length < 2 && (
          <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 10 }}>Minimum 2 players needed.</p>
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

      {/* Confirm start overlay */}
      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: COOL_DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              Are all {players.length} players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ padding: "10px 0", minWidth: 40, flexShrink: 0, background: COOL_DARK, fontSize: 15, fontWeight: 900, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                  <div style={{ padding: "10px 14px", flex: 1, background: MID_DARK, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>Cancel</button>
              <button onClick={startGame} disabled={starting} style={{ flex: 2, background: ACCENT, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}>
                {starting ? "Starting…" : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
