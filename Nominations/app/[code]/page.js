"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const BG = "#a2d291"
const DARK = "#7bc688"
const MID = "#7bc688"
const WARM_LIGHT = "#c5dc93"
const YELLOW = "#FBDF54"
const BTN = "#323340"
const BOYS_COLOR = "#359c94"
const GIRLS_COLOR = "#df668e"
const INK = "#1A2418"

const LOBBY_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, bg: BG }
// Chrome layer (Footer, Menu drawer, Notifications, IdleGateModal) needs a
// genuinely dark surface for its white text/icons to read — DARK/MID above
// are light green (correct for the StatusBar header, which is a separate,
// already-approved treatment), not dark enough for this. Built from the
// game's own dark navy footer-button color instead.
const CHROME_DARK = BTN
const CHROME_MID = "#43445A"
const CHROME_WL = "#54566F"
const POKE_COLORS = { dark: CHROME_DARK, mid: CHROME_MID, wl: CHROME_WL, yellow: YELLOW, notifBg: CHROME_DARK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

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

const howToPlayContent = (
  <div>
    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 14 }}>
      At the start, everyone writes a superlative — "Most likely to…", "Best…", or your own. <b style={{ color: "white" }}>Don't pick one with an obvious answer</b> among this group — the fun is in the surprise.
    </p>
    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 14 }}>
      Each round, one boy and one girl are picked and shown the same superlative — never their own. One of them is secretly the <b style={{ color: "white" }}>bluffer</b>, assigned a random other player to argue it's about. The other is the <b style={{ color: "white" }}>truth-teller</b>, and picks whoever they genuinely think it fits best.
    </p>
    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 14 }}>
      Both argue their case out loud. Nobody else knows who's bluffing.
    </p>
    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 0 }}>
      Once everyone's heard enough, the room votes on who they think the bluffer is. Fool people and your team scores; get caught and the other team scores instead.
    </p>
  </div>
)

const inputStyle = {
  background: WARM_LIGHT,
  color: INK,
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
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  const justJoinedRef = useRef(false)
  const channelRef = useRef(null)
  const gossipKeyRef = useRef(null)

  // Gossip (see REALTIME.md §4 / play page for the fuller version) — re-broadcast a
  // "sync" nudge when this client's own loadState() notices the game row changed
  // since it last checked, so a peer with a silently-dropped postgres_changes event
  // catches up immediately instead of waiting on the next 60s poll.
  function gossipSyncKey(g) {
    return `${g.phase}`
  }

  const me = players.find((p) => p.id === myPlayerId)
  const boysTeam = players.filter((p) => p.team === "boys")
  const girlsTeam = players.filter((p) => p.team === "girls")
  const totalRounds = players.length

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gameData }, { data: playerData }] = await Promise.all([
      supabase.from("nom_games").select("code,phase,is_dummy,replay_of,replay_code").eq("code", code).single(),
      supabase.from("nom_players").select("id,name,first_name,last_name,team,created_at").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return
    if (!gameData) { setNotFound(true); return }
    const key = gossipSyncKey(gameData)
    if (gossipKeyRef.current !== null && gossipKeyRef.current !== key) {
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }
    gossipKeyRef.current = key
    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  function applyGameRow(newRow) {
    if (!newRow) return
    setGame(newRow)
  }

  function applyPlayerRow(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") {
      setPlayers((prev) => prev.filter((r) => r.id !== oldRow?.id))
      return
    }
    if (!newRow) return
    setPlayers((prev) => {
      const idx = prev.findIndex((r) => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map((r) => (r.id === newRow.id ? newRow : r))
    })
  }

  useEffect(() => {
    const existing = localStorage.getItem(`nom:${code}:playerId`)
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
    if (isIdle) return
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0
    let stableTimer = null

    function connect() {
      channel = supabase
        .channel(`nom-lobby-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_players", filter: `game_code=eq.${code}` }, applyPlayerRow)
        .on("broadcast", { event: "sync" }, () => { loadState() })
        .subscribe((status) => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(stableTimer)
            if (reconnectTimer) return
            const delay = Math.min(2000 * 2 ** reconnectAttempt, 30000)
            reconnectAttempt++
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              if (cancelled) return
              supabase.removeChannel(channel)
              connect()
            }, delay)
          }
        })
      channelRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearTimeout(stableTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [code, isIdle])

  useEffect(() => {
    if (game && game.phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  useEffect(() => {
    if (!myPlayerId || !game) return
    if (players.some((p) => p.id === myPlayerId)) { justJoinedRef.current = false; return }
    if (justJoinedRef.current) return
    localStorage.removeItem(`nom:${code}:playerId`)
    setMyPlayerId(null)
  }, [myPlayerId, game, players])

  async function join(team) {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("nom_players")
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
      .from("nom_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id,name,first_name,last_name,team,created_at")
      .single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`nom:${code}:playerId`, data.id)
    justJoinedRef.current = true
    setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]))
    setMyPlayerId(data.id)
    setJoining(false)
  }

  async function switchTeam() {
    if (!me) return
    const newTeam = me.team === "boys" ? "girls" : "boys"
    await supabase.from("nom_players").update({ team: newTeam }).eq("id", me.id)
  }

  async function removePlayer(id) {
    await supabase.from("nom_players").delete().eq("id", id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("nom_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    router.push(`/${code}/play`)
  }

  async function handleInvite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Nominations — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  const canStart = boysTeam.length >= 2 && girlsTeam.length >= 2 && players.length >= 6

  const lobbyPlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
    teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined,
  }))

  const canJoin = !!username.trim() && (savedProfile || (firstName.trim() && lastName.trim())) && !joining

  const joinForm = (
    <>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, opacity: 0.85, marginBottom: 14 }}>Join Game</div>
      {!savedProfile && (
        <>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
        </>
      )}
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Display Name"
        maxLength={40}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => join("boys")}
          disabled={!canJoin}
          style={{ background: BOYS_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}
        >
          {joining ? "…" : "Join Boys"}
        </button>
        <button
          onClick={() => join("girls")}
          disabled={!canJoin}
          style={{ background: GIRLS_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}
        >
          {joining ? "…" : "Join Girls"}
        </button>
      </div>
      {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>{joinError}</div>}
    </>
  )

  const genderSwitchButton = me && (
    <button
      onClick={switchTeam}
      style={{ background: WARM_LIGHT, color: INK, fontSize: 15, fontWeight: 800, padding: "14px 18px", width: "100%" }}
    >
      Change Genders
    </button>
  )

  if (isIdle) {
    return <IdleGateModal colors={{ dark: DARK, wl: WARM_LIGHT }} buttonTextColor={INK} textColor={INK} mutedTextColor="rgba(26,36,24,0.75)" />
  }

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD, background: BG, minHeight: "100dvh" }}>
        <Lobby
          code={code}
          gameName="Nominations"
          players={lobbyPlayers}
          teams={[{ label: "Boys", color: BOYS_COLOR }, { label: "Girls", color: GIRLS_COLOR }]}
          myPlayerId={myPlayerId}
          onInvite={handleInvite}
          howToPlayContent={howToPlayContent}
          joinContent={joinForm}
          onRemovePlayer={removePlayer}
          extraContent={genderSwitchButton}
          colors={LOBBY_COLORS}
          textColor={INK}
          surfaceOverlay="black"
          minPlayers={6}
          notFound={notFound}
          loading={!game}
        />
      </div>

      {canStart && (
        <Footer colors={POKE_COLORS}>
          <FooterButton
            onClick={() => { setConfirmingStart(true); throw new Error("Modal opened") }}
            disabled={starting || confirmingStart}
            bg={BTN}
            textColor="white"
          >
            Start Game
          </FooterButton>
        </Footer>
      )}

      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: INK, marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, color: INK, opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              {totalRounds} rounds — one per superlative. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {[...players].sort((a, b) => (a.team === b.team ? 0 : a.team === "boys" ? -1 : 1)).map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: p.team === "boys" ? BOYS_COLOR : GIRLS_COLOR,
                    fontSize: 15, fontWeight: 900, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ padding: "10px 14px", flex: 1, background: MID, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM_LIGHT, color: INK, fontSize: 17, fontWeight: 800, padding: "16px" }}>
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: BTN, color: "white", fontSize: 17, fontWeight: 900, padding: "16px" }}
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
