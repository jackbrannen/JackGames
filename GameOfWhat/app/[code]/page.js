"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG = "#6B1A44"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#821F42"
const DARK = "#4A123B"
const MID = "#5C1640"

const LOBBY_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW }
const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#3D0F2E" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const WORDS_A_GOW = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "HONEY","BUTTER","COOKIE","WAFFLE","MUFFIN","BAGEL","COCOA","LATTE","LEMON","MANGO",
  "PLUM","PEACH","BERRY","OLIVE","BASIL","PEPPER","GINGER","SUGAR","SALMON","TURKEY",
  "PANDA","TIGER","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA",
]

function splitCode(code) {
  for (const w of WORDS_A_GOW) {
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
  border: "none",
  outline: "none",
  boxSizing: "border-box",
}

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
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const [instructions, setInstructions] = useState("")

  const me = players.find(p => p.id === myPlayerId)

  async function loadState() {
    const { data: gameData } = await supabase
      .from("gow_games")
      .select("code,phase,round_index,replay_code")
      .eq("code", code)
      .single()

    if (!gameData) { setNotFound(true); return }
    if (gameData.replay_code) { router.replace(`/${gameData.replay_code}`); return }

    const { data: playerData } = await supabase
      .from("gow_players")
      .select("id,name,score,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  useEffect(() => {
    const existing = localStorage.getItem(`gow:${code}:playerId`)
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

  // Auto-join disabled: gow_games has no is_dummy signal, and its "Dummy
  // Game" button (see app/page.js) currently just calls the same
  // onCreateClick as a real "Create Game" — there is no dummy-game concept
  // implemented here yet, so there is no legitimate case where a real saved
  // profile should silently auto-join a lobby. Re-enable, gated on dummy
  // detection, if that's added.

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "gameofwhat").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  useEffect(() => {
    loadState()
    // Short poll as a fallback in case a realtime event is missed.
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    // Realtime so the live player list and the lobby->game redirect happen
    // immediately instead of only on the next poll.
    const channel = supabase.channel(`gow-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_players", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if ((game?.phase === "play" || game?.phase === "between_rounds") && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")
    const { data: existing } = await supabase
      .from("gow_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmedUsername)
      .limit(1)
    if (existing?.length > 0) {
      setJoinError("That username is already taken in this game. Please choose another.")
      setJoining(false)
      return
    }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)
    const { data, error } = await supabase
      .from("gow_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast, score: 0 })
      .select("id")
      .single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`gow:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setJoining(false)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("gow_start_game", { p_code: code })
    if (error) { setStarting(false); return }
    await loadState()
  }

  async function handleInvite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Game of What — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  if (game?.phase !== "lobby" && !myPlayerId && game !== null) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: "white" }}>The Game of What</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, letterSpacing: "-0.5px", color: "white" }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, marginBottom: 32, color: "white" }}>This page will update automatically.</p>
        <button onClick={loadState} style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "18px 28px" }}>Join Lobby</button>
      </div>
    )
  }

  const [word1, word2] = splitCode(code)
  const canStart = players.length >= 4

  const joinForm = !me ? (
    <>
      <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
        Join Game
      </div>
      {!savedProfile && (
        <>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="First name"
            maxLength={40}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Last name"
            maxLength={40}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
        </>
      )}
      <input
        value={username}
        onChange={e => setUsername(e.target.value)}
        onKeyDown={e => e.key === "Enter" && join()}
        placeholder="Display Name"
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
      {joinError && (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>
          {joinError}
        </div>
      )}
    </>
  ) : null

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="The Game of What"
          players={players}
          myPlayerId={myPlayerId}
          onInvite={handleInvite}
          howToPlayContent={instructions ? <span style={{ whiteSpace: "pre-wrap" }}>{instructions}</span> : <span>Loading…</span>}
          codeDisplay={<><span style={{ color: YELLOW }}>{word1}</span><span style={{ color: "rgba(255,255,255,0.75)" }}>{word2}</span></>}
          joinContent={joinForm}
          colors={LOBBY_COLORS}
          minPlayers={4}
          notFound={notFound}
          loading={!game}
          onRemovePlayer={async (id) => { await supabase.from("gow_players").delete().eq("id", id); loadState() }}
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
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
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
                    background: WARM_LIGHT,
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
