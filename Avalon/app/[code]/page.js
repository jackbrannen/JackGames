"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const BG         = "#0F1923"
const DARK       = "#0A1520"
const MID        = "#121F2E"
const GOLD       = "#C8A84B"
const TEXT       = "#E8DCC8"
const WARM_LIGHT = "#1E3248"

const MIN_PLAYERS = 5
const MAX_PLAYERS = 10

const WORDS_A = ["AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER","KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ"]

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
  background: WARM_LIGHT, color: TEXT,
  fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block",
  border: "none", outline: "none", boxSizing: "border-box",
}

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: GOLD, notifBg: "#060D14" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [instructions, setInstructions] = useState("")
  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [replayOf, setReplayOf] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)

  const me = players.find(p => p.id === myPlayerId)
  const justJoinedRef = useRef(false)
  const hasLoadedPlayersRef = useRef(false)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("avalon_players")
      .select("id,name,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    hasLoadedPlayersRef.current = true
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("avalon_games")
      .select("code,phase,replay_of")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase)
    setReplayOf(data.replay_of ?? null)
  }

  async function loadState() {
    await loadGame()
    await refreshPlayers()
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    if (isIdle) return
    const existing = localStorage.getItem(`avalon:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    supabase.from("game_instructions").select("body").eq("game_key", "avalon").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`avalon-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "avalon_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "avalon_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code, isIdle])

  useEffect(() => {
    if (gamePhase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [gamePhase, myPlayerId])

  // If the host removes us from the roster (or this localStorage id is stale from a
  // previous session where that happened), `me` becomes undefined but `myPlayerId`
  // itself stays set — and the join form only reappears when `myPlayerId` is cleared.
  // Clearing it here lets the normal join form come back. justJoinedRef guards the
  // moment right after this tab's own join() call, before the realtime insert has
  // round-tripped back into `players` yet.
  useEffect(() => {
    if (!myPlayerId || gamePhase !== "lobby" || !hasLoadedPlayersRef.current) return
    if (players.some(p => p.id === myPlayerId)) { justJoinedRef.current = false; return }
    if (justJoinedRef.current) return
    localStorage.removeItem(`avalon:${code}:playerId`)
    setMyPlayerId(null)
  }, [myPlayerId, gamePhase, players, code])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    // Only auto-join if this is a dummy game session (indicated by query param)
    const params = new URLSearchParams(window.location.search)
    if (!params.get("isDummy")) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("avalon_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("avalon_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim() })
        .select("id").single()
      if (error || !data) return
      justJoinedRef.current = true
      localStorage.setItem(`avalon:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [gamePhase, myPlayerId, code])

  // Auto-join returning players from a "Play Again" replay — only for browsers
  // that held a playerId in the parent game, so this can't be used to skip
  // the join form on an arbitrary shared link.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gamePhase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`avalon:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("avalon_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        justJoinedRef.current = true
        localStorage.setItem(`avalon:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("avalon_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      justJoinedRef.current = true
      localStorage.setItem(`avalon:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [replayOf, gamePhase, myPlayerId, code])

  async function join() {
    const trimmed = name.trim()
    if (!trimmed || joining) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("avalon_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) {
      setJoinError("That username is already taken in this game.")
      setJoining(false)
      return
    }

    if (players.length >= MAX_PLAYERS) {
      setJoinError("Game is full.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("avalon_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    justJoinedRef.current = true
    localStorage.setItem(`avalon:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("start_avalon_game", { p_code: code })
    if (error) { alert("Failed to start: " + error.message); setStarting(false) }
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join Avalon — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const count = players.length
  const canStart = !!me && count >= MIN_PLAYERS && count <= MAX_PLAYERS
  const [w1, w2] = splitCode(code)

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
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
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="Avalon"
          players={players.map(p => ({ id: p.id, name: p.name }))}
          myPlayerId={myPlayerId}
          onInvite={onInvite}
          howToPlayContent={instructions}
          codeDisplay={
            <>
              <span style={{ color: GOLD }}>{w1}</span>
              <span style={{ color: TEXT }}>{w2}</span>
            </>
          }
          joinContent={
            <div>
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
            </div>
          }
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: GOLD }}
          minPlayers={MIN_PLAYERS}
          notFound={gameExists === false}
          loading={gameExists === null}
          onRemovePlayer={async (id) => { await supabase.from("avalon_players").delete().eq("id", id); loadState() }}
        />
      </div>

      {canStart && (
        <Footer colors={POKE_COLORS}>
          <FooterButton
            onClick={() => {
              setConfirmingStart(true)
              throw new Error("Modal opened")
            }}
            disabled={starting || confirmingStart}
          >
            Start Game
          </FooterButton>
        </Footer>
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
            style={{ background: DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: TEXT, opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              Roles will be assigned. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: MID,
                    fontSize: 15, fontWeight: 900, color: TEXT,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: MID,
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
    </>
  )
}
