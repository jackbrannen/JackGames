"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import Menu from "../../components/Menu"
import Lobby from "../../components/Lobby"
import { WB_RULES } from "../../components/rulesText"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const BG = "#FEE471"
const INK = "#221A12"
const INK_MUTED = "rgba(34,26,18,0.6)"
const DARK = "#221A12"
const PANEL = "#FFFFFF"
const WARM = "#FFFFFF"
const BTN = "#221A12"
const BTN_TEXT = "#FFF8ED"
const RED = "#C0392B"
const INPUT_BG = "#FFFFFF"
const BOYS_COLOR = "#628ab3"
const GIRLS_COLOR = "#b769aa"

const MIN_PLAYERS = 4
const MIN_PER_TEAM = 2

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
  background: INPUT_BG, color: INK, fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block", border: "none", outline: "none", boxSizing: "border-box",
}
const POKE_COLORS = { dark: DARK, mid: "#3A2E1B", wl: "#5A4A32", yellow: "#FBDF54", notifBg: "#1C140B" }
const LOBBY_COLORS = { dark: DARK, mid: PANEL, wl: "#5A4A32", yellow: "#FBDF54", bg: BG, ink: INK, inkRgb: "34,26,18" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [phase, setPhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [replayOf, setReplayOf] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const channelRef = useRef(null)
  const justJoinedRef = useRef(false)

  const me = players.find(p => p.id === myPlayerId)
  const boysTeam = players.filter(p => p.team === "boys")
  const girlsTeam = players.filter(p => p.team === "girls")
  const canStart = players.length >= MIN_PLAYERS && boysTeam.length >= MIN_PER_TEAM && girlsTeam.length >= MIN_PER_TEAM
  const passes = players.length <= 6 ? 2 : 1
  const totalRounds = Math.max(boysTeam.length, girlsTeam.length) * passes

  async function refreshPlayers() {
    const { data } = await supabase.from("wb_players")
      .select("id,name,team,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase.from("wb_games")
      .select("code,phase,is_dummy,replay_of,replay_code").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    if (data.replay_code) { router.replace(`/${data.replay_code}`); return }
    setGameExists(true)
    setPhase(data.phase || "lobby")
    setIsDummy(!!data.is_dummy)
    setReplayOf(data.replay_of ?? null)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`wordbirds:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  useEffect(() => {
    if (isIdle) return
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`wb-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wb_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "wb_games", filter: `code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code, isIdle])

  useEffect(() => {
    if (phase && phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [phase, myPlayerId])

  // Balance dummy/replay auto-joins toward whichever team is currently smaller.
  function balancedTeam() {
    if (boysTeam.length === girlsTeam.length) return Math.random() < 0.5 ? "boys" : "girls"
    return boysTeam.length < girlsTeam.length ? "boys" : "girls"
  }

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!isDummy || gameExists !== true || phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("wb_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team: balancedTeam() })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay — carries the
  // team forward from the parent game so a rematch doesn't force everyone
  // to re-pick sides (and doesn't trip wb_start_game's "no teamless players"
  // guard on the very next start).
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`wordbirds:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`wordbirds:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data: parentRow } = await supabase.from("wb_players").select("team")
        .eq("game_code", replayOf).ilike("name", saved.username.trim()).limit(1).maybeSingle()
      const { data, error } = await supabase.from("wb_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team: parentRow?.team ?? balancedTeam() })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [replayOf, gameExists, phase, myPlayerId, code])

  async function join(team) {
    const trimmed = name.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmed || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true); setJoinError("")
    const { data: existing } = await supabase.from("wb_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("wb_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id,name,team,created_at").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`wordbirds:${code}:playerId`, data.id)
    justJoinedRef.current = true
    setPlayers(prev => (prev.some(p => p.id === data.id) ? prev : [...prev, data]))
    setMyPlayerId(data.id); setJoining(false)
  }

  async function switchTeam() {
    if (!me) return
    const newTeam = me.team === "boys" ? "girls" : "boys"
    await supabase.rpc("wb_set_team", { p_code: code, p_player_id: me.id, p_team: newTeam })
    refreshPlayers()
  }

  async function startGame() {
    if (!canStart) return
    const { error } = await supabase.rpc("wb_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); throw error }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Word Birds — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  async function removePlayer(id) {
    await supabase.from("wb_players").delete().eq("id", id)
    refreshPlayers()
  }

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (phase !== "lobby" && !myPlayerId && gameExists) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: INK }}>Word Birds</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: INK }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: INK_MUTED, fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  const canJoin = !!name.trim() && (savedProfile || (firstName.trim() && lastName.trim())) && !joining

  const joinForm = (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 12 }}>Join Game</div>
      {!savedProfile && (
        <>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
        </>
      )}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name" maxLength={40} style={inputStyle} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => join("boys")} disabled={!canJoin}
          style={{ background: BOYS_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}>
          {joining ? "…" : "Join Boys"}
        </button>
        <button onClick={() => join("girls")} disabled={!canJoin}
          style={{ background: GIRLS_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}>
          {joining ? "…" : "Join Girls"}
        </button>
      </div>
      {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginTop: 10 }}>{joinError}</div>}
    </>
  )

  const extraContent = me && (
    <>
      <button onClick={switchTeam} style={{ background: WARM, color: INK, fontSize: 15, fontWeight: 800, padding: "14px 18px", width: "100%", marginBottom: 8 }}>
        Change Genders
      </button>
      {!canStart && (
        <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600 }}>
          {players.length < MIN_PLAYERS
            ? `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length === 1 ? "" : "s"} to start.`
            : boysTeam.length < MIN_PER_TEAM
              ? `Boys need ${MIN_PER_TEAM - boysTeam.length} more to start.`
              : `Girls need ${MIN_PER_TEAM - girlsTeam.length} more to start.`}
        </p>
      )}
      {canStart && (
        <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600 }}>Best of {totalRounds} rounds</p>
      )}
    </>
  )

  const lobbyPlayers = players.map(p => ({
    id: p.id,
    name: p.name,
    teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
    teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined,
  }))

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD, background: BG, minHeight: "100dvh" }}>
      <Lobby
        code={code}
        gameName="Word Birds"
        players={lobbyPlayers}
        myPlayerId={myPlayerId}
        onInvite={invite}
        howToPlayContent={<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {WB_RULES.map(([title, body]) => (
            <div key={title}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>{title}</div>
              <div>{body}</div>
            </div>
          ))}
        </div>}
        joinContent={joinForm}
        onRemovePlayer={removePlayer}
        extraContent={extraContent}
        colors={LOBBY_COLORS}
        minPlayers={MIN_PLAYERS}
        notFound={gameExists === false}
        loading={gameExists === null}
      />
      </div>
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({ name: p.name, teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined, teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined }))}
        rules={WB_RULES}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {me && (
          <FooterButton onClick={startGame} disabled={!canStart} bg={BTN} textColor={BTN_TEXT}>
            Start Game
          </FooterButton>
        )}
      </Footer>
    </>
  )
}
