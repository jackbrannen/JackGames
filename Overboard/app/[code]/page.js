"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"
import { BG, DARK, MID, WL, ACCENT, ACCENT_TEXT, COLORS } from "../../components/theme"

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
const MIN_PLAYERS = 4

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

function HowToPlay() {
  const p = { fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 14 }
  const b = { fontWeight: 800, color: "white" }
  return (
    <div>
      <p style={p}>Everyone writes <span style={b}>one question</span> — plus a one or two word hint about the topic, and a rating for how deep it goes, from <span style={b}>Splash pad</span> to <span style={b}>Ocean floor</span>.</p>
      <p style={p}>Then the whole room shares one board. All you can see are the hints — never who wrote them. Drag a hint onto each player to decide who gets stuck with what. <span style={b}>Nobody can be given their own question.</span></p>
      <p style={p}>Everyone hits Ready when the board looks right. Changing anything after people have readied puts them back to unready, so agree before you commit.</p>
      <p style={p}>Then you go around the room answering out loud, shallow questions first. Everyone else reacts with emoji — mash them as much as you want.</p>
      <p style={{ ...p, marginBottom: 0 }}>No points, no winner. At the end you'll see every question with the reactions it earned. Question authors stay secret forever.</p>
    </div>
  )
}

const inputStyle = {
  background: WL,
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
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  const justJoinedRef = useRef(false)

  const me = players.find((p) => p.id === myPlayerId)

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gameData }, { data: playerData }] = await Promise.all([
      supabase.from("ob_games").select("code,phase,replay_code").eq("code", code).single(),
      supabase.from("ob_players").select("id,name,first_name,last_name,created_at").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return // a newer call already landed, discard this one
    if (!gameData) { setNotFound(true); return }
    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  // postgres_changes already carries the full row — apply it instead of refetching.
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
    const existing = localStorage.getItem(`ob:${code}:playerId`)
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
    // Only zero the backoff once the connection has held for a while — a flapping
    // connection would otherwise reconnect+loadState() unthrottled. See BUGS.md.
    let stableTimer = null

    function connect() {
      channel = supabase
        .channel(`ob-lobby-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ob_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "ob_players", filter: `game_code=eq.${code}` }, applyPlayerRow)
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
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearTimeout(stableTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  useEffect(() => {
    if (game && game.phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  useEffect(() => {
    if (game?.replay_code) router.replace(`/${game.replay_code}`)
  }, [game?.replay_code])

  // If we've been removed from the roster (or this localStorage id is stale), clear it so
  // the join form comes back instead of leaving this player stuck with no way in.
  useEffect(() => {
    if (!myPlayerId || !game) return
    if (players.some((p) => p.id === myPlayerId)) { justJoinedRef.current = false; return }
    if (justJoinedRef.current) return
    localStorage.removeItem(`ob:${code}:playerId`)
    setMyPlayerId(null)
  }, [myPlayerId, game, players])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("ob_players")
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
      .from("ob_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id,name,first_name,last_name,created_at")
      .single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`ob:${code}:playerId`, data.id)
    justJoinedRef.current = true
    setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]))
    setMyPlayerId(data.id)
    setJoining(false)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("ob_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    router.push(`/${code}/play`)
  }

  async function handleInvite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Overboard — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  async function removePlayer(id) {
    await supabase.from("ob_players").delete().eq("id", id)
  }

  const canStart = players.length >= MIN_PLAYERS
  const canJoin = !!username.trim() && (savedProfile || (firstName.trim() && lastName.trim())) && !joining

  const joinForm = (
    <>
      <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>Join Game</div>
      {!savedProfile && (
        <>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
        </>
      )}
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Display Name" maxLength={40} style={inputStyle} />
      <button
        onClick={join}
        disabled={!canJoin}
        style={{ background: ACCENT, color: ACCENT_TEXT, fontSize: 16, fontWeight: 900, padding: "16px", width: "100%", display: "block", marginTop: 8 }}
      >
        {joining ? "…" : "Dive In"}
      </button>
      {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>{joinError}</div>}
    </>
  )

  if (isIdle) return <IdleGateModal colors={COLORS} />

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD, background: BG, minHeight: "100dvh" }}>
        <Lobby
          code={code}
          gameName="Overboard"
          players={players.map((p) => ({ id: p.id, name: p.name }))}
          myPlayerId={myPlayerId}
          onInvite={handleInvite}
          howToPlayContent={<HowToPlay />}
          joinContent={joinForm}
          onRemovePlayer={removePlayer}
          colors={COLORS}
          minPlayers={MIN_PLAYERS}
          notFound={notFound}
          loading={!game}
        />
      </div>

      {canStart && (
        <Footer colors={COLORS}>
          <FooterButton
            onClick={() => { setConfirmingStart(true); throw new Error("Modal opened") }}
            disabled={starting || confirmingStart}
            bg={ACCENT}
            textColor={ACCENT_TEXT}
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
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              Everyone writes one question. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0, background: ACCENT,
                    fontSize: 15, fontWeight: 900, color: ACCENT_TEXT,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ padding: "10px 14px", flex: 1, background: MID, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WL, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: ACCENT, color: ACCENT_TEXT, fontSize: 17, fontWeight: 900, padding: "16px" }}
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
