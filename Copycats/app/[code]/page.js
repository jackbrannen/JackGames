"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { useSubmitNudge } from "../../lib/useSubmitNudge"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG         = "#5C2D8C"
const YELLOW     = "#FBDF54"
const DARK       = "#3D1A70"
const MID        = "#4A228C"
const WARM_LIGHT = "#7A3AAA"

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
  background: WARM_LIGHT,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
}

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#2A1050" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const code = params.code
  const router = useRouter()

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")

  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const [confirmingStart, setConfirmingStart] = useState(false)

  const [showInstructions, setShowInstructions] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [instructions, setInstructions] = useState("")
  const nudgeJoin = useSubmitNudge(username, !!myPlayerId)

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "copycats").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(`cc:${code}:playerId`)
    if (saved) setMyPlayerId(saved)

    const profile = loadProfile()
    if (profile) {
      if (profile.username) saveProfile(profile)
      setSavedProfile(profile)
      setUsername(profile.username || "")
    }

    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`cc-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  async function loadState() {
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from("cc_games").select("*").eq("code", code).single(),
      supabase.from("cc_players").select("*").eq("game_code", code).order("created_at"),
    ])
    if (!g) { setNotFound(true); return }
    setGame(g)
    setPlayers(ps ?? [])
    if (g.phase !== "lobby") router.push(`/${code}/play`)
  }

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!game || game.phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const taken = players.some(p => p.name.toLowerCase() === saved.username.trim().toLowerCase())
      if (taken) return
      const { data, error } = await supabase.from("cc_players")
        .insert({ game_code: code, first_name: saved.firstName.trim(), last_name: saved.lastName.trim(), name: saved.username.trim() })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`cc:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [game?.phase, myPlayerId, code])

  async function onJoin() {
    if (joining) return
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast) return
    setJoining(true)
    setJoinError("")

    const taken = players.some(p => p.name.toLowerCase() === trimmedUsername.toLowerCase())
    if (taken) { setJoinError("That username is taken."); setJoining(false); return }

    const { data, error } = await supabase
      .from("cc_players")
      .insert({ game_code: code, first_name: trimmedFirst, last_name: trimmedLast, name: trimmedUsername })
      .select("id")
      .single()
    if (error) { setJoinError(error.message); setJoining(false); return }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)
    localStorage.setItem(`cc:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
  }

  async function onStart() {
    if (starting) return
    setStarting(true)
    setStartError("")
    const { error } = await supabase.rpc("cc_start_game", {
      p_code: code,
      p_host_id: myPlayerId,
    })
    if (error) { setStartError(error.message); setStarting(false) }
  }

  function onInvite() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  const me = players.find(p => p.id === myPlayerId)
  const hasJoined = !!me
  const canStart = players.length >= 3

  const [codeA, codeB] = splitCode(code)

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="Copycats"
          players={players.map(p => ({ id: p.id, name: p.name }))}
          myPlayerId={myPlayerId}
          onInvite={onInvite}
          howToPlayContent={instructions}
          codeDisplay={
            <>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{codeA}</span>
              <span style={{ color: "white" }}>{codeB}</span>
            </>
          }
          joinContent={
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>Join Game</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!savedProfile?.firstName && (
                  <>
                    <input type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
                    <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
                  </>
                )}
                <input
                  type="text"
                  placeholder="Display Name"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && onJoin()}
                  style={inputStyle}
                />
                <button
                  onClick={onJoin}
                  disabled={joining || !username.trim() || (!savedProfile?.firstName && (!firstName.trim() || !lastName.trim()))}
                  style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", marginTop: 4, animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none" }}
                >
                  {joining ? "Joining…" : "Join"}
                </button>
                {!!joinError && (
                  <p style={{ color: YELLOW, fontSize: 14, fontWeight: 600 }}>{joinError}</p>
                )}
              </div>
            </div>
          }
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW }}
          minPlayers={3}
          notFound={notFound}
          loading={!game && !notFound}
        />
      </div>

      {hasJoined && (
        <Footer colors={POKE_COLORS}>
          <FooterButton
            onClick={() => setConfirmingStart(true)}
            disabled={!canStart}
            disabled={starting}
          >
            Start Game
          </FooterButton>
        </Footer>
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
              Everyone writes a question for their assigned player — are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
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
                onClick={() => { setConfirmingStart(false); onStart() }}
                disabled={starting}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                {starting ? "Starting…" : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
