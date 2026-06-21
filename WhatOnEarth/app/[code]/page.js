"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import Menu from "../../components/Menu"
import { BG, DARK, MID, WL, YELLOW, FOOTER_H } from "../../components/styles"

const TEXT = "white"

const MIN_PLAYERS = 3

const WORDS_A = ["COSMIC","EARTH","GALACTIC","LUNAR","MARTIAN","NEBULA","ORBIT","PLANET","QUASAR","ROCKET"]

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
  fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block",
  border: "none", outline: "none", boxSizing: "border-box",
}

const POKE_COLORS = { dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: "#0D0D15" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [instructions, setInstructions] = useState("")
  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [timerDuration, setTimerDuration] = useState(30)
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
      .from("woe_players")
      .select("id,name,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("woe_games")
      .select("code,phase,is_dummy,turn_duration_seconds")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase)
    setIsDummy(!!data.is_dummy)
    setTimerDuration(data.turn_duration_seconds)
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
    const existing = localStorage.getItem(`whatonearth:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    supabase.from("game_instructions").select("body").eq("game_key", "whatonearth").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 30000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`woe-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "woe_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "woe_games", filter: `code=eq.${code}` }, loadState)
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
      const { data: taken } = await supabase.from("woe_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("woe_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim() })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`whatonearth:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [isDummy, gamePhase, myPlayerId, code])

  async function join() {
    const trimmed = name.trim()
    if (!trimmed) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    try {
      const { data: existing } = await supabase
        .from("woe_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
      if (existing?.length > 0) {
        setJoinError("That username is already taken in this game.")
        setJoining(false)
        return
      }

      const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
      saveProfile(newProfile)
      setSavedProfile(newProfile)

      const { data, error } = await supabase
        .from("woe_players")
        .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
        .select("id").single()
      if (error) throw error

      localStorage.setItem(`whatonearth:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    } catch (e) {
      alert("Failed to join: " + (e?.message ?? "unknown error"))
      setJoining(false)
    }
  }

  async function updateTimer(newDuration) {
    try {
      const { error } = await supabase
        .from("woe_games")
        .update({ turn_duration_seconds: newDuration })
        .eq("code", code)
      if (error) throw error
      setTimerDuration(newDuration)
    } catch (e) {
      alert("Failed to update timer: " + (e?.message ?? "unknown error"))
    }
  }

  async function startGame() {
    setStarting(true)
    try {
      const { error } = await supabase.rpc("woe_start_game", { p_code: code })
      if (error) throw error
      await loadState()
    } catch (e) {
      alert("Failed to start: " + (e?.message ?? "unknown error"))
      setStarting(false)
    }
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join What On Earth — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const [codeLeft, codeRight] = splitCode(code)

  if (gameExists === false) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Game not found</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", marginBottom: 24 }}>
            The game code <span style={{ fontWeight: 700 }}>{code}</span> doesn't exist or has ended.
          </div>
          <button
            onClick={() => router.push("/")}
            style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "16px 32px", border: "none", cursor: "pointer" }}
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!me) {
    return (
      <>
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
          roomCode={code}
          currentPlayer={null}
          instructions={instructions}
        />
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            style={{ position: "fixed", top: 16, right: 16, background: WL, border: "none", color: "rgba(255,255,255,0.45)", fontSize: 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            ☰
          </button>

          <div style={{ width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Join Game</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 32, wordBreak: "break-word" }}>
              <span style={{ opacity: 0.5 }}>{codeLeft}</span>
              <span>{codeRight}</span>
            </div>

            <div style={{ marginBottom: 8 }}>
              <input
                value={savedProfile?.firstName ?? firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={40}
                disabled={!!savedProfile}
                style={{ ...inputStyle, opacity: savedProfile ? 0.5 : 1 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <input
                value={savedProfile?.lastName ?? lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={40}
                disabled={!!savedProfile}
                style={{ ...inputStyle, opacity: savedProfile ? 0.5 : 1 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && join()}
                placeholder="Display name (username)"
                maxLength={40}
                style={inputStyle}
              />
            </div>

            {joinError && (
              <div style={{ background: "rgba(251,223,84,0.15)", border: "2px solid " + YELLOW, color: YELLOW, padding: "12px", marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
                {joinError}
              </div>
            )}

            <button
              onClick={join}
              disabled={joining || !name.trim() || !(savedProfile?.firstName || firstName.trim()) || !(savedProfile?.lastName || lastName.trim())}
              style={{ background: joining ? WL : YELLOW, color: joining ? "white" : "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", border: "none", cursor: joining ? "default" : "pointer", opacity: joining || !name.trim() || !(savedProfile?.firstName || firstName.trim()) || !(savedProfile?.lastName || lastName.trim()) ? 0.35 : 1 }}
            >
              {joining ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>
      </>
    )
  }

  const canStart = players.length >= MIN_PLAYERS

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="What On Earth"
          players={players.map(p => ({ id: p.id, name: p.name }))}
          myPlayerId={myPlayerId}
          onInvite={onInvite}
          howToPlayContent={instructions}
          codeDisplay={
            <>
              <span style={{ color: YELLOW }}>{codeLeft}</span>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>{codeRight}</span>
            </>
          }
          settingsContent={
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                Turn Timer
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[30, 45, 60, 90, 0].map(duration => (
                  <button
                    key={duration}
                    onClick={() => updateTimer(duration)}
                    style={{
                      background: timerDuration === duration ? YELLOW : WL,
                      color: timerDuration === duration ? "#000" : "white",
                      fontSize: 16,
                      fontWeight: 700,
                      padding: "12px 20px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {duration === 0 ? "Off" : `${duration}s`}
                  </button>
                ))}
              </div>
            </div>
          }
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW }}
          minPlayers={MIN_PLAYERS}
          loading={!gameExists}
        />
      </div>

      {canStart && me && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <FooterButton
            onClick={startGame}
            disabled={starting}
            bg={YELLOW}
          >
            {starting ? "Starting..." : "Start Game"}
          </FooterButton>
        </Footer>
      )}

      {menuOpen && (
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
          roomCode={code}
          currentPlayer={me?.name}
          instructions={instructions}
        />
      )}
    </>
  )
}
