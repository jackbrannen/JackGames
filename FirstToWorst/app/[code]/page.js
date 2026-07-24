"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG         = "#004F45"
const DARK       = "#003638"
const MID        = "#00423f"
const GOLD       = "#FBDF54"
const TEXT       = "white"
const WARM_LIGHT = "#006648"

const MIN_PLAYERS = 3
const MAX_PLAYERS = 12

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

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: GOLD, notifBg: "#001E1C" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [instructions, setInstructions] = useState("")
  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [isDemo, setIsDemo] = useState(false)
  const [replayOf, setReplayOf] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [theme, setTheme] = useState("random")
  const [isPersonal, setIsPersonal] = useState(true)

  const me = players.find(p => p.id === myPlayerId)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("ftw_players")
      .select("id,name,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("ftw_games")
      .select("code,phase,is_demo,replay_of,replay_code,theme,word_distribution")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    if (data.replay_code) { router.replace(`/${data.replay_code}`); return }
    setGameExists(true)
    setGamePhase(data.phase)
    setIsDemo(!!data.is_demo)
    setReplayOf(data.replay_of ?? null)
    setTheme(data.theme)
    setIsPersonal(data.word_distribution === "personal")
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
    const existing = localStorage.getItem(`ftw:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    supabase.from("game_instructions").select("body").eq("game_key", "firsttoworst").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`firsttoworst-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (gamePhase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [gamePhase, myPlayerId])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!gameExists || gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    if (!isDemo) return  // Only auto-join for dummy games
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("ftw_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const { data, error } = await supabase.from("ftw_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName.trim(), last_name: saved.lastName.trim() })
        .select("id").single()
      if (error || !data) return
      localStorage.setItem(`ftw:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [gameExists, gamePhase, myPlayerId, code, isDemo])

  // Dummy games use normal auto-join (no special Player N logic)

  // Auto-join returning players from a "Play Again" replay — only for browsers
  // that held a playerId in the parent game, so this can't be used to skip
  // the join form on an arbitrary shared link.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || !gameExists || gamePhase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`ftw:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("ftw_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`ftw:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("ftw_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`ftw:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
    })()
  }, [replayOf, gameExists, gamePhase, myPlayerId, code])

  async function join() {
    const trimmed = name.trim()
    if (!trimmed || joining) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("ftw_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
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
      .from("ftw_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`ftw:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("ftw_start_game", { p_code: code, p_host_id: myPlayerId })
    if (error) { alert("Failed to start: " + error.message); setStarting(false) }
  }

  async function saveSettings() {
    const { error } = await supabase
      .from("ftw_games")
      .update({ theme, word_distribution: isPersonal ? "personal" : "random" })
      .eq("code", code)
    if (error) console.error("Failed to save settings:", error)
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join First to Worst — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const count = players.length
  const canStart = !!me && count >= MIN_PLAYERS && count <= MAX_PLAYERS
  const [w1, w2] = splitCode(code)

  if (gamePhase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: TEXT }}>First to Worst</div>
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
          gameName="First to Worst"
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
          settingsContent={closeModal => (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>Theme</div>
              <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.65, marginBottom: 12, lineHeight: 1.4 }}>
                What kinds of words should people write?
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
                {["random", "good", "bad"].map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    style={{
                      flex: 1,
                      background: theme === t ? GOLD : WARM_LIGHT,
                      color: theme === t ? "#000" : "white",
                      fontSize: 16,
                      fontWeight: 900,
                      padding: "14px 8px",
                      textTransform: "capitalize",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>Word Distribution</div>
              <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.65, marginBottom: 12, lineHeight: 1.4 }}>
                Should words be written blind, or should you know who you're writing them for?
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
                <button
                  onClick={() => setIsPersonal(false)}
                  style={{
                    flex: 1,
                    background: !isPersonal ? GOLD : WARM_LIGHT,
                    color: !isPersonal ? "#000" : "white",
                    fontSize: 16,
                    fontWeight: 900,
                    padding: "14px 8px",
                  }}
                >
                  Random
                </button>
                <button
                  onClick={() => setIsPersonal(true)}
                  style={{
                    flex: 1,
                    background: isPersonal ? GOLD : WARM_LIGHT,
                    color: isPersonal ? "#000" : "white",
                    fontSize: 16,
                    fontWeight: 900,
                    padding: "14px 8px",
                  }}
                >
                  Personal
                </button>
              </div>

              <button
                onClick={() => { saveSettings(); closeModal() }}
                style={{
                  background: GOLD,
                  color: "#000",
                  fontSize: 18,
                  fontWeight: 900,
                  padding: "16px",
                  width: "100%",
                }}
              >
                Save
              </button>
            </div>
          )}
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: GOLD }}
          minPlayers={MIN_PLAYERS}
          notFound={gameExists === false}
          loading={gameExists === null}
          onRemovePlayer={async (id) => { await supabase.from("ftw_players").delete().eq("id", id); loadState() }}
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
              This will begin for everyone. Are all players in?
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
