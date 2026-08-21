"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { EMOJIS } from "../../lib/emojis"
import manifest from "../../public/voices/manifest.json"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const ALL_SLUGS = Object.keys(manifest.cards)

const BG = "#101014"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "hsl(220, 10%, 20%)"
const DARK = "hsl(220, 10%, 10%)"
const MID = "hsl(220, 10%, 14%)"
const BOYS_COLOR = "hsl(210, 70%, 45%)"
const GIRLS_COLOR = "hsl(280, 55%, 45%)"

const LOBBY_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW }
const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: DARK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const TURN_LENGTH_OPTIONS = [15, 30, 45, 60]
const WRONG_POINTS_OPTIONS = [-3, -2, -1, 0]
const CORRECT_POINTS_OPTIONS = [1, 2, 3]

function sample(arr, n) {
  const copy = [...arr]
  const out = []
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return out
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
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

function HowToPlay() {
  const p = { fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 14 }
  const b = { fontWeight: 800, color: "white" }
  return (
    <div>
      <p style={p}>Teams take turns. On your team's turn, one player is secretly shown which of the 8 character cards matches the emoji on screen.</p>
      <p style={p}>That player says the emoji's name out loud <span style={b}>once</span>, in that character's voice — no retries, no other hints.</p>
      <p style={p}>Everyone else on the team taps to guess which card it was. Taps are shared live, so you'll see who's pointing at what. Once you're sure, tap <span style={b}>Submit</span> to lock in the team's answer.</p>
      <p style={p}>Right or wrong, points are set by the host in settings. Either way, a new emoji appears immediately — same 8 cards, next guess.</p>
      <p style={{ ...p, marginBottom: 0 }}>Anyone can pause if you need to. When the timer runs out, tap <span style={b}>End Round</span> — once half the players have, the next round begins.</p>
    </div>
  )
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
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [draftTurnSeconds, setDraftTurnSeconds] = useState(45)
  const [draftWrongPoints, setDraftWrongPoints] = useState(-1)
  const [draftCorrectPoints, setDraftCorrectPoints] = useState(2)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  const justJoinedRef = useRef(false)

  const me = players.find((p) => p.id === myPlayerId)
  const boysTeam = players.filter((p) => p.team === "boys")
  const girlsTeam = players.filter((p) => p.team === "girls")
  // 1 round per player on the larger team; the smaller team's extra turns are distributed
  // as evenly (and, once wired up server-side, as randomly) as possible — see hv_start_game.
  const roundsTotal = Math.max(boysTeam.length, girlsTeam.length, 1)

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gameData }, { data: playerData }] = await Promise.all([
      supabase.from("hv_games").select("code,phase,rounds_total,turn_duration_seconds,wrong_points,correct_points").eq("code", code).single(),
      supabase.from("hv_players").select("id,name,first_name,last_name,team,created_at").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return // a newer call already landed, discard this one
    if (!gameData) { setNotFound(true); return }
    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  // Applies a realtime hv_games payload directly instead of refetching everything —
  // postgres_changes already sends the full row for INSERT/UPDATE.
  function applyGameRow(newRow) {
    if (!newRow) return
    setGame(newRow)
  }

  // Same idea for hv_players — patch the one row that changed rather than re-querying
  // the whole roster.
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
    const existing = localStorage.getItem(`hv:${code}:playerId`)
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

    function connect() {
      channel = supabase
        .channel(`hv-lobby-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "hv_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "hv_players", filter: `game_code=eq.${code}` }, applyPlayerRow)
        .subscribe((status) => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            loadState() // catch up in case events were missed while disconnected
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
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
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  useEffect(() => {
    if (game?.phase === "playing" && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  // Sync the settings drafts from the loaded row once (not on every poll/realtime patch,
  // which would stomp on whatever the host is actively mid-edit in the settings modal) —
  // otherwise reopening the lobby after a reload would silently show the hardcoded
  // defaults instead of whatever was actually saved.
  const settingsSyncedRef = useRef(false)
  useEffect(() => {
    if (!game || settingsSyncedRef.current) return
    settingsSyncedRef.current = true
    setDraftTurnSeconds(game.turn_duration_seconds)
    setDraftWrongPoints(game.wrong_points)
    setDraftCorrectPoints(game.correct_points)
  }, [game])

  // If another player removes us from the roster (or this localStorage id is stale from a
  // previous session where that happened), `me` becomes undefined but `myPlayerId` itself
  // stays set — and Lobby's join zone only keys off `!myPlayerId`, so the join form stays
  // hidden and this player is stuck with no way back in. Clearing it here lets the normal
  // join form reappear. justJoinedRef guards the moment right after this tab's own join()
  // call, before the realtime insert has round-tripped back into `players` yet — without
  // it, a fresh join would immediately look "not found" and clear itself.
  useEffect(() => {
    if (!myPlayerId || !game) return
    if (players.some((p) => p.id === myPlayerId)) { justJoinedRef.current = false; return }
    if (justJoinedRef.current) return
    localStorage.removeItem(`hv:${code}:playerId`)
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
      .from("hv_players")
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
      .from("hv_players")
      .insert({ game_code: code, name: trimmedUsername, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id,name,first_name,last_name,team,created_at")
      .single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`hv:${code}:playerId`, data.id)
    justJoinedRef.current = true
    // Add ourselves to the roster immediately rather than waiting on the realtime
    // INSERT (or worst case the 60s poll) to round-trip back — without this, "Change
    // Genders" and the team boxes could sit without this player in them for a moment
    // right after joining, and the self-clear effect above could even misread that gap
    // as "removed" if it landed badly.
    setPlayers((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]))
    setMyPlayerId(data.id)
    setJoining(false)
  }

  async function switchTeam() {
    if (!me) return
    const newTeam = me.team === "boys" ? "girls" : "boys"
    await supabase.from("hv_players").update({ team: newTeam }).eq("id", me.id)
  }

  async function saveSettings(close) {
    await supabase
      .from("hv_games")
      .update({
        turn_duration_seconds: draftTurnSeconds,
        wrong_points: draftWrongPoints,
        correct_points: draftCorrectPoints,
      })
      .eq("code", code)
    close()
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const cardPool = sample(ALL_SLUGS, 8)
    const firstEmoji = pickOne(EMOJIS).emoji
    const { error } = await supabase.rpc("hv_start_game", {
      p_code: code,
      p_rounds_total: roundsTotal,
      p_turn_duration_seconds: draftTurnSeconds,
      p_card_pool: cardPool,
      p_first_emoji: firstEmoji,
      p_wrong_points: draftWrongPoints,
      p_correct_points: draftCorrectPoints,
    })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    router.push(`/${code}/play`)
  }

  async function handleInvite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Hearing Voices — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  const canStart = boysTeam.length >= 2 && girlsTeam.length >= 2

  const lobbyPlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
    teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined,
  }))

  // Only rendered pre-join — showJoinZone (default !myPlayerId) hides this once `me`
  // exists, so a "switch team" affordance can't live in here; it's rendered unconditionally
  // below instead (see genderSwitchButton), matching Secret Phrase's always-visible button.
  const joinForm = (
    <>
      <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>Join Game</div>
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
          disabled={!username.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
          style={{ background: BOYS_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}
        >
          {joining ? "…" : "Join Boys"}
        </button>
        <button
          onClick={() => join("girls")}
          disabled={!username.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
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
      style={{ background: WARM_LIGHT, color: "white", fontSize: 15, fontWeight: 800, padding: "14px 18px", width: "100%" }}
    >
      Change Genders
    </button>
  )

  async function removePlayer(id) {
    await supabase.from("hv_players").delete().eq("id", id)
  }

  const settingsContent = (close) => (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Turn length</span>
        <select
          value={draftTurnSeconds}
          onChange={(e) => setDraftTurnSeconds(parseInt(e.target.value))}
          style={{ background: WARM_LIGHT, color: "white", fontSize: 16, padding: "8px 12px", border: "none" }}
        >
          {TURN_LENGTH_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}s</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Wrong answer</span>
        <select
          value={draftWrongPoints}
          onChange={(e) => setDraftWrongPoints(parseInt(e.target.value))}
          style={{ background: WARM_LIGHT, color: "white", fontSize: 16, padding: "8px 12px", border: "none" }}
        >
          {WRONG_POINTS_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Correct answer</span>
        <select
          value={draftCorrectPoints}
          onChange={(e) => setDraftCorrectPoints(parseInt(e.target.value))}
          style={{ background: WARM_LIGHT, color: "white", fontSize: 16, padding: "8px 12px", border: "none" }}
        >
          {CORRECT_POINTS_OPTIONS.map((p) => (
            <option key={p} value={p}>+{p}</option>
          ))}
        </select>
      </div>
      <button onClick={() => saveSettings(close)} style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "12px 20px", width: "100%", marginTop: 12 }}>
        Save
      </button>
    </>
  )

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD, background: BG, minHeight: "100dvh" }}>
        <Lobby
          code={code}
          gameName="Hearing Voices"
          players={lobbyPlayers}
          teams={[{ label: "Boys", color: BOYS_COLOR }, { label: "Girls", color: GIRLS_COLOR }]}
          myPlayerId={myPlayerId}
          onInvite={handleInvite}
          howToPlayContent={<HowToPlay />}
          settingsContent={settingsContent}
          joinContent={joinForm}
          onRemovePlayer={removePlayer}
          extraContent={genderSwitchButton}
          colors={LOBBY_COLORS}
          minPlayers={4}
          notFound={notFound}
          loading={!game}
        />
      </div>

      {canStart && (
        <Footer colors={POKE_COLORS}>
          <FooterButton
            onClick={() => { setConfirmingStart(true); throw new Error("Modal opened") }}
            disabled={starting || confirmingStart}
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
              {roundsTotal * 2} rounds · {draftTurnSeconds}s each. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
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
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{p.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>
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
