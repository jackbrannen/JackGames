"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { BG, DARK, MID, WL, YELLOW, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, STYLE } from "../../components/styles"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import Menu from "../../components/Menu"

const TEXT = "white"
const MIN_PLAYERS = 3

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
  background: WL, color: TEXT,
  fontSize: 20, padding: SPACE.md,
  width: "100%", display: "block",
  border: "none", outline: "none", boxSizing: "border-box",
}

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [starting, setStarting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const me = players.find(p => p.id === myPlayerId)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("alphajam_players")
      .select("id,name,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("alphajam_games")
      .select("code,phase,is_dummy")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase)
    setIsDummy(!!data.is_dummy)
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
    const existing = localStorage.getItem(`alphajam:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`alphajam-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (gamePhase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [gamePhase, myPlayerId, code, router])

  useEffect(() => {
    if (gamePhase !== "lobby") {
      setStarting(false)
      setJoining(false)
    }
  }, [gamePhase])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!isDummy || gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("alphajam_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("alphajam_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim() })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`alphajam:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [isDummy, gamePhase, myPlayerId, code])

  async function join() {
    const trimmed = name.trim()
    if (!trimmed) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    try {
      const { data: existing } = await supabase
        .from("alphajam_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
      if (existing?.length > 0) {
        setJoinError("That username is already taken in this game.")
        setJoining(false)
        return
      }

      const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
      saveProfile(newProfile)
      setSavedProfile(newProfile)

      const { data, error } = await supabase
        .from("alphajam_players")
        .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
        .select("id").single()
      if (error) throw error

      localStorage.setItem(`alphajam:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    } catch (e) {
      alert("Failed to join: " + (e?.message ?? "unknown error"))
      setJoining(false)
    }
  }

  async function startGame() {
    setStarting(true)
    try {
      const { error } = await supabase.rpc("aj_start_game", { p_code: code, p_rounds_per_matchup: 1 })
      if (error) throw error

      // Load fresh state so component can detect phase change and redirect
      await loadState()
    } catch (e) {
      alert("Failed to start: " + (e?.message ?? "unknown error"))
      setStarting(false)
    }
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join Alpha Jam — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const count = players.length
  const canStart = !!me && count >= MIN_PLAYERS
  const [w1, w2] = splitCode(code)

  if (gameExists === false) {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", padding: "32px 16px", fontFamily: "-apple-system" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 16 }}>Game not found</h1>
          <p style={{ fontSize: 17, marginBottom: 24, opacity: 0.85 }}>
            This game code doesn't exist. Check the URL and try again.
          </p>
          <button
            onClick={() => router.push("/")}
            style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "14px 24px" }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: DARK, padding: `${SPACE.lg}px ${SPACE.md}px` }}>
          <div style={{ ...STYLE.eyebrow, opacity: 0.6, marginBottom: 4 }}>
            Join code
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 40, fontWeight: FONT_WEIGHT.black, lineHeight: 1, letterSpacing: "-0.02em" }}>
              <span style={{ opacity: 0.5 }}>{w1}</span>
              <span>{w2}</span>
            </div>
            <button
              onClick={onInvite}
              style={{ background: YELLOW, color: "#000", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, padding: "10px 16px" }}
            >
              Invite
            </button>
          </div>
        </div>

        {/* Players */}
        <div style={{ padding: `${SPACE.lg}px ${SPACE.md}px` }}>
          <div style={STYLE.sectionHeader}>
            Players
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {players.map((p, i) => (
              <div key={p.id} style={{ background: MID, padding: `${FONT_SIZE.small}px ${SPACE.md}px` }}>
                <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold }}>{p.name}</span>
                {p.id === myPlayerId && <span style={{ fontSize: FONT_SIZE.min, opacity: OPACITY.muted, marginLeft: 6 }}>you</span>}
              </div>
            ))}
          </div>
          {count < MIN_PLAYERS && (
            <div style={{ fontSize: FONT_SIZE.small, opacity: OPACITY.muted, marginTop: 12 }}>
              Need {MIN_PLAYERS - count} more {MIN_PLAYERS - count === 1 ? "player" : "players"} to start
            </div>
          )}
        </div>

        {/* Join form */}
        {!me && (
          <div style={{ padding: `0 ${SPACE.md}px ${SPACE.lg}px` }}>
            <div style={STYLE.sectionHeader}>
              Join game
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                type="text"
                placeholder="Username"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") join() }}
                style={inputStyle}
              />
              {!savedProfile && (
                <>
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") join() }}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") join() }}
                    style={inputStyle}
                  />
                </>
              )}
            </div>
            {joinError && (
              <div style={{ fontSize: FONT_SIZE.small, color: "#FF6B6B", marginTop: SPACE.sm }}>
                {joinError}
              </div>
            )}
          </div>
        )}

      </div>

      <Menu
        supabase={supabase}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({
          name: p.name,
          firstName: p.first_name,
          lastName: p.last_name,
          score: 0,
        }))}
        gamePhase={gamePhase}
        rules={[
          ["Objective", "Win the most head-to-head matchups by thinking of words faster than your opponents."],
          ["How to Play", "Each matchup reveals two letters. Think of a word that starts with the first letter and ends with the second letter. The first player to find a valid word wins the round."],
          ["Tournament", "You'll play against every other player in a round-robin tournament. The player with the most wins at the end wins the game."],
        ]}
        onResetToLobby={async () => {
          try {
            const { error } = await supabase.rpc("aj_reset_to_lobby", { p_code: code })
            if (error) throw error
          } catch (e) {
            alert("Error resetting to lobby: " + (e?.message ?? "unknown"))
          }
        }}
      />

      <Footer colors={{ dark: DARK, wl: WL }} timerRunning={false} isOpen={menuOpen} onToggle={() => setMenuOpen(!menuOpen)}>
        {me ? (
          <FooterButton
            onClick={startGame}
            disabled={!canStart}
            loading={starting}
            bg={YELLOW}
            textColor="#000"
          >
            Start Game
          </FooterButton>
        ) : (
          <FooterButton
            onClick={join}
            disabled={!name.trim() || (savedProfile ? false : (!firstName.trim() || !lastName.trim()))}
            loading={joining}
            bg={YELLOW}
            textColor="#000"
          >
            Join
          </FooterButton>
        )}
      </Footer>
    </div>
  )
}
