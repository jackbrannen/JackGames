"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG = "#307977"
const ACCENT = "#F5E8D8"
const DARK = "#1C5250"
const MID = "#245E5C"
const WARM_LIGHT = "#3A9180"
const MIN_PLAYERS = 4

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "HONEY","BUTTER","COOKIE","WAFFLE","MUFFIN","BAGEL","COCOA","LATTE","LEMON","MANGO",
  "PLUM","PEACH","BERRY","OLIVE","BASIL","PEPPER","GINGER","SUGAR","SALMON","TURKEY",
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
  background: WARM_LIGHT, color: "white", fontSize: 20,
  padding: "16px 18px", width: "100%", display: "block", boxSizing: "border-box",
}

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: ACCENT, notifBg: "#0F302F" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
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
  const [instructions, setInstructions] = useState("")
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)

  const me = players.find(p => p.id === myPlayerId)
  const humanPlayers = players.filter(p => !p.is_bot)

  async function loadState() {
    const { data: gameData } = await supabase
      .from("drawful_games").select("code,phase,is_dummy,host_id").eq("code", code).single()
    if (!gameData) { setNotFound(true); return }
    const { data: playerData } = await supabase
      .from("drawful_players").select("id,name,is_bot,created_at")
      .eq("game_code", code).order("created_at", { ascending: true })
    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  useEffect(() => {
    const existing = localStorage.getItem(`drawful:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setUsername(saved.username || "") }
  }, [])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "drawful").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`drawful-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drawful_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "drawful_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (game?.phase === "drawing" && me) router.replace(`/${code}/play`)
  }, [game?.phase, me])

  useEffect(() => {
    if (game?.phase === "finished" && me) {
      supabase.rpc("drawful_reset_game", { p_code: code })
    }
  }, [game?.phase, me])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!game || game.phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("drawful_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("drawful_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim(), is_bot: false })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`drawful:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [game?.phase, myPlayerId, code])

  const hasDummyJoinedRef = useRef(false)
  useEffect(() => {
    if (!game || !game.is_dummy || game.phase !== "lobby" || myPlayerId || hasDummyJoinedRef.current) return
    hasDummyJoinedRef.current = true
    ;(async () => {
      const saved = loadProfile()
      const useName = saved?.username || "Player 1"
      const useFirst = saved?.firstName || "Player"
      const useLast = saved?.lastName || "1"

      const { data: taken } = await supabase.from("drawful_players").select("id").eq("game_code", code).ilike("name", useName).limit(1)
      if (taken?.length > 0) return

      const { data, error } = await supabase.from("drawful_players")
        .insert({ game_code: code, name: useName, first_name: useFirst, last_name: useLast, is_bot: false })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`drawful:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [game?.is_dummy, game?.phase, myPlayerId, code])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("drawful_players").select("id").eq("game_code", code).ilike("name", trimmedUsername).limit(1)
    if (existing?.length > 0) {
      setJoinError("That username is already taken in this game. Please choose another.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("drawful_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast, is_bot: false })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`drawful:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("drawful_start_game", { p_code: code })
    if (error) { alert("Failed to start: " + error.message); setStarting(false) }
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join Drawful — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const canStart = humanPlayers.length >= MIN_PLAYERS
  const [w1, w2] = splitCode(code)

  if (game?.phase !== "lobby" && !me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.7, marginBottom: 16 }}>Drawful</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "white" }}>
          {game?.phase === "finished" ? "Game over." : "A game is in progress."}
        </h2>
        <p style={{ fontSize: 16, opacity: 0.55, fontWeight: 500, marginBottom: 32, color: "white" }}>
          {game?.phase === "finished" ? "The lobby will open shortly." : "This page will update when the game ends."}
        </p>
        <button onClick={loadState} style={{ background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px" }}>Refresh</button>
      </div>
    )
  }

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="Drawful"
          players={humanPlayers.map(p => ({ id: p.id, name: p.name }))}
          myPlayerId={myPlayerId}
          onInvite={onInvite}
          howToPlayContent={instructions}
          codeDisplay={
            <>
              <span style={{ color: ACCENT }}>{w1}</span>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>{w2}</span>
            </>
          }
          joinContent={
            <div>
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
                value={username} onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && join()}
                placeholder="Display Name" maxLength={40} style={inputStyle}
              />
              <button
                onClick={join}
                disabled={!username.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                style={{ background: ACCENT, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", marginTop: 8, display: "block" }}
              >
                {joining ? "Joining…" : "Join"}
              </button>
              {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#F97316", marginTop: 10 }}>{joinError}</div>}
            </div>
          }
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: ACCENT }}
          minPlayers={MIN_PLAYERS}
          notFound={notFound}
          loading={!game && !notFound}
        />
      </div>

      {canStart && me && (
        <Footer colors={POKE_COLORS}>
          <FooterButton onClick={() => setConfirmingStart(true)} loading={starting}>
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
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {humanPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: MID,
                    fontSize: 15, fontWeight: 900, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: MID,
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                      {p.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmingStart(false)}
                style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: ACCENT, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
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
