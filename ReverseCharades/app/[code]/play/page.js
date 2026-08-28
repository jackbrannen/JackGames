"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import WaitingList from "../../../components/WaitingList"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import StatusBar from "../../../components/StatusBar"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import EndGame from "../../../components/EndGame"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const PRIMARY = "#974344"
const DARK    = "#803946"
const MID     = "#8A3D45"
const WARM    = "#AE5C4D"
const ACCENT      = "#283D3B"
const ACCENT_TEXT = "#FFF1EA"
const BOYS        = "#76CBC5"
const GIRLS       = "#DE85A3"

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(523, ctx.currentTime)
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

function sfxCorrect() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    function tone(freq, start, dur, vol = 0.08) {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = freq; g.gain.setValueAtTime(vol, ctx.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur)
    }
    tone(660, 0, 0.1); tone(880, 0.09, 0.18)
    setTimeout(() => ctx.close(), 600)
  } catch {}
}

function sfxTurnEnd() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    function tone(freq, start, dur, vol = 0.1) {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = freq
      g.gain.setValueAtTime(vol, ctx.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur)
    }
    tone(440, 0, 0.12); tone(330, 0.11, 0.22)
    setTimeout(() => ctx.close(), 800)
  } catch {}
}

function sfxSkip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.frequency.value = 370; g.gain.setValueAtTime(0.05, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.18)
    setTimeout(() => ctx.close(), 400)
  } catch {}
}

function clueTextSize(text) {
  const len = text?.length ?? 0
  if (len < 8) return 72
  if (len < 14) return 58
  if (len < 22) return 46
  if (len < 32) return 36
  return 28
}

const teamLabel = (t) => t === "A" ? "Boys" : "Girls"
const teamColor = (t) => t === "A" ? BOYS : GIRLS
const teamTextColor = (t) => ACCENT

// Shared stat chip component (inline, no state)
function StatChips({ correct, left }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <div style={{ background: DARK, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: ACCENT_TEXT }}>{correct}</span>
        <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.65 }}>correct</span>
      </div>
      {left != null && (
        <div style={{ background: DARK, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900 }}>{left}</span>
          <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.65 }}>left</span>
        </div>
      )}
    </div>
  )
}

// Shared top bar used by all playing-phase views
function PlayingTopBar({ game, secondsRemaining, timerUrgent, playingTeam }) {
  const totalDuration = game.turn_duration_seconds ?? 45
  // Calculate elapsed time ONCE when turn starts, not on every render
  const elapsed = useMemo(() => {
    if (!game.turn_started_at) return 0
    return Math.floor((Date.now() - new Date(game.turn_started_at).getTime()) / 1000)
  }, [game.turn_started_at])

  const isPaused = game.is_paused
  const animationPlayState = isPaused ? 'paused' : 'running'

  return (
    <>
      <style>{`
        @keyframes timerDrain {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div style={{
        padding: "12px 20px",
        background: DARK,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: SPACE.md }}>
          {[["A", game.team_a_score ?? 0], ["B", game.team_b_score ?? 0]].map(([t, score]) => (
            <div key={t}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.65, marginBottom: 2 }}>
                {teamLabel(t)}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: t === playingTeam ? teamColor(t) : "white" }}>
                {score}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: timerUrgent ? ACCENT_TEXT : "white" }}>
          {isPaused && <span style={{ fontSize: 18, marginRight: 8, opacity: 0.75 }}>⏸</span>}
          {secondsRemaining}<span style={{ fontSize: 18, fontWeight: 600, opacity: 0.55 }}>s</span>
        </div>
      </div>

      {/* Timer progress bar */}
      <div style={{ height: 12, background: "rgba(0,0,0,0.2)", position: "relative", overflow: "hidden" }}>
        <div
          key={`timer-${game.turn_started_at}`}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "100%",
            background: "white",
            animation: `timerDrain ${totalDuration}s linear forwards`,
            animationDelay: `-${elapsed}s`,
            animationPlayState,
          }}
        />
      </div>

      {/* Team turn strip */}
      <div style={{ padding: "8px 20px", background: teamColor(playingTeam), textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamTextColor(playingTeam) }}>
          {teamLabel(playingTeam)}&rsquo; Turn
        </div>
      </div>
    </>
  )
}


const POKE_COLORS = { dark: "#803946", mid: "#8A3D45", wl: "#AE5C4D", yellow: "#283D3B", accentText: "#FFF1EA", notifBg: "#4A1F28" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate(2 * 60 * 1000)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [currentClue, setCurrentClue] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())
  const [acting, setActing] = useState(false)
  // Synchronous guard for doCorrect/doSkip — `acting` state alone isn't
  // enough: two click events landing in the same tick (mobile double-tap /
  // touchend+click firing back-to-back) both read the pre-render `acting`
  // value before React commits the update, so both can slip through. This
  // ref is checked and set synchronously before any await, closing that gap.
  const actingRef = useRef(false)
  const [instructions, setInstructions] = useState("")
  const [manualScoreA, setManualScoreA] = useState("0")
  const [manualScoreB, setManualScoreB] = useState("0")
  const [draftTurnDuration, setDraftTurnDuration] = useState(45)
  const [savingTurnDuration, setSavingTurnDuration] = useState(false)
  const endingRef = useRef(false)
  const soundTriggerRef = useRef(null)
  const syncChRef = useRef(null)
  const syncKeyRef = useRef(null)

  useEffect(() => {
    const existing = localStorage.getItem(`rc:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  // rc_create_replay now copies every player's name/team into the fresh lobby — before
  // following everyone there, look up which row is ours in the new game (matched by name,
  // already unique per game) and pre-seed localStorage with it, so this player lands back
  // on their team instead of needing to rejoin from scratch. Looks up its own name fresh by
  // id rather than trusting `players` state, since this can fire before that's populated
  // (e.g. a fresh page load straight into a finished+replayed game).
  async function redirectToReplay(newCode) {
    if (myPlayerId) {
      const { data: mine } = await supabase.from("reversecharades_players").select("name").eq("id", myPlayerId).single()
      if (mine?.name) {
        const { data } = await supabase.from("reversecharades_players").select("id").eq("game_code", newCode).ilike("name", mine.name).limit(1)
        if (data?.[0]) localStorage.setItem(`rc:${newCode}:playerId`, data[0].id)
      }
    }
    router.replace(`/${newCode}`)
  }

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Refresh immediately so the acting client's own button resolves right
    // away instead of waiting on its own realtime round-trip or another
    // peer's gossip nudge (both of which can take a few seconds).
    await loadState()
  }

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const { data: gameData } = await supabase
      .from("reversecharades_games")
      .select("code,phase,host_id,current_team,current_guesser_id,current_controller_id,current_clue_id,turn_started_at,turn_duration_seconds,next_turn_duration_seconds,skip_limit,skip_penalty,skips_this_turn,correct_this_turn,last_turn_correct,last_turn_skips,last_turn_team,team_a_score,team_b_score,team_a_turns,team_b_turns,next_game,next_game_picker_name,is_paused,paused_at,pause_elapsed_seconds,replay_code")
      .eq("code", code)
      .single()
    if (seq !== loadSeqRef.current) return
    if (!gameData) return
    if (gameData.replay_code) { redirectToReplay(gameData.replay_code); return }

    const { data: playerData } = await supabase
      .from("reversecharades_players")
      .select("id,name,team,ready,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    let clueData = null
    if (gameData.current_clue_id && gameData.phase === "playing") {
      const { data: cd } = await supabase
        .from("reversecharades_clues")
        .select("id,text")
        .eq("id", gameData.current_clue_id)
        .single()
      clueData = cd ?? null
    }

    let count = 0
    if (gameData.phase === "playing") {
      const { count: c } = await supabase
        .from("reversecharades_clues")
        .select("id", { count: "exact", head: true })
        .eq("game_code", code)
        .eq("status", "pending")
      count = c ?? 0
    }

    if (seq !== loadSeqRef.current) return
    setGame(gameData)
    setPlayers(playerData ?? [])
    setCurrentClue(clueData)
    setPendingCount(count)
    setManualScoreA(String(gameData.team_a_score ?? 0))
    setManualScoreB(String(gameData.team_b_score ?? 0))
    // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
    const syncKey = `${gameData.phase}:${gameData.current_team ?? ""}:${gameData.current_clue_id ?? ""}:${gameData.correct_this_turn ?? ""}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) syncChRef.current?.send({ type: "broadcast", event: "sync" })
    syncKeyRef.current = syncKey
  }

  // reversecharades_games changes: apply the row directly from the
  // realtime payload instead of a full loadState() refetch, unless
  // current_clue_id/phase changed (that needs the fuller fetch to pull the
  // new clue text + pending count, which aren't in this payload). Each
  // change independently reaches every subscribed client already, so
  // there's no need to also nudge on the lightweight path — nudge() exists
  // for cases where a client's own realtime might be lagging, which
  // doesn't apply to the client that just received this exact event.
  const gamesSyncKeyRef = useRef(null)
  const lastClueIdRef = useRef(undefined)
  const lastPhaseRef = useRef(undefined)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { redirectToReplay(newRow.replay_code); return }
    const key = `${newRow.phase}:${newRow.current_team ?? ""}:${newRow.current_clue_id ?? ""}:${newRow.correct_this_turn ?? ""}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) syncChRef.current?.send({ type: "broadcast", event: "sync" })
    gamesSyncKeyRef.current = key
    const clueChanged = lastClueIdRef.current !== undefined &&
      (newRow.current_clue_id !== lastClueIdRef.current || newRow.phase !== lastPhaseRef.current)
    lastClueIdRef.current = newRow.current_clue_id
    lastPhaseRef.current = newRow.phase
    if (clueChanged) { loadState(); return }
    setGame(newRow)
    setManualScoreA(String(newRow.team_a_score ?? 0))
    setManualScoreB(String(newRow.team_b_score ?? 0))
  }
  // reversecharades_players has no game_code filter on its subscription
  // (fires for every ReverseCharades game in the database), so drop
  // anything not for this game instead of blindly applying it.
  function applyPlayerChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    const relevant = newRow?.game_code ?? oldRow?.game_code
    if (relevant !== code) return
    if (eventType === "DELETE") {
      setPlayers(prev => prev.filter(r => r.id !== oldRow?.id))
      return
    }
    if (!newRow) return
    setPlayers(prev => {
      const idx = prev.findIndex(r => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
    })
  }

  useEffect(() => {
    if (!game || !myPlayerId) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) {
      if (prev === "playing") sfxTurnEnd()
      else playChirp()
    }
  }, [game?.phase])

  useEffect(() => {
    if (isIdle) return
    supabase.from("game_instructions").select("body").eq("game_key", "reversecharades").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const ticker = setInterval(() => setNowMs(Date.now()), 100)

    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0
    // Only reset reconnectAttempt after the connection has stayed up for a
    // while — resetting on every bare SUBSCRIBED lets a flapping connection
    // (briefly connects, drops, repeat) reconnect+loadState() unthrottled,
    // since each brief success zeroes the backoff right before the next
    // drop. See BUGS.md (found in Copycats, 2026-08-24).
    let stableTimer = null

    function connect() {
      channel = supabase.channel(`rc-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_players", filter: `game_code=eq.${code}` }, applyPlayerChange)
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            // A dropped websocket otherwise leaves this client stuck until the 60s poll fires.
            // Recreate the channel instead of waiting on it, backing off if it keeps failing
            // so a persistent outage doesn't turn into a reconnect storm across many clients.
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
      syncChRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearTimeout(stableTimer)
      clearInterval(poll)
      clearInterval(ticker)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])

  // Keep the settings-panel dropdown in sync with the actually-active turn
  // length (not any staged next_turn_duration_seconds — that only takes
  // effect once the next turn actually starts, per rc_stage_turn_duration).
  useEffect(() => {
    if (game?.turn_duration_seconds != null) setDraftTurnDuration(game.turn_duration_seconds)
  }, [game?.turn_duration_seconds])

  async function saveTurnDuration() {
    setSavingTurnDuration(true)
    await supabase.rpc("rc_stage_turn_duration", { p_code: code, p_turn_duration_seconds: draftTurnDuration })
    setSavingTurnDuration(false)
  }


  const me = players.find(p => p.id === myPlayerId)

  const secondsRemaining = useMemo(() => {
    if (!game?.turn_started_at) return game?.turn_duration_seconds ?? 45

    // If paused, return time remaining when pause started
    if (game.is_paused && game.pause_elapsed_seconds != null) {
      return Math.max(0, (game.turn_duration_seconds ?? 45) - game.pause_elapsed_seconds)
    }

    const elapsed = Math.floor((nowMs - new Date(game.turn_started_at).getTime()) / 1000)
    return Math.max(0, (game.turn_duration_seconds ?? 45) - elapsed)
  }, [game, nowMs])

  const [menuOpen, setMenuOpen] = useState(false)
  // Shared height for any "playing" footer that stacks two rows of buttons
  // (a full-width row plus a row of smaller ones, or two full-width rows).
  // Menu's drawer-position math only knows about the default single-row
  // FOOTER_H, so any screen using this height must also pass a matching
  // peekBarHeight to its <Menu> to keep the drawer from landing underneath
  // the taller footer.
  const stackedFooterH = 132
  // Only actively counting down (unpaused) should hide the footer menu — a
  // frozen "time remaining" while paused still satisfied the old check
  // (turn_started_at set, secondsRemaining > 0), so the menu stayed hidden
  // even while paused. The menu should be reachable whenever the game isn't
  // actively mid-turn: while paused, or between rounds.
  const timerRunning = !!game?.turn_started_at && secondsRemaining > 0 && !game?.is_paused
  const [confirmingEndEarly, setConfirmingEndEarly] = useState(false)
  const endEarlyConfirmModal = confirmingEndEarly ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}>
      <div style={{ background: DARK, padding: 24, maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: "white" }}>
          End the turn early?
        </div>
        <div style={{ fontSize: 15, marginBottom: 24, opacity: 0.85, color: "white" }}>
          This ends the current turn immediately and moves to the next team.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setConfirmingEndEarly(false)}
            style={{ flex: 1, background: MID, color: "white", fontSize: 17, fontWeight: 800, padding: "14px" }}
          >
            Cancel
          </button>
          <button
            onClick={async () => { setConfirmingEndEarly(false); await doEndEarly() }}
            style={{ flex: 1, background: WARM, color: "white", fontSize: 17, fontWeight: 900, padding: "14px" }}
          >
            End Turn
          </button>
        </div>
      </div>
    </div>
  ) : null
  const scoreSettingsContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ color: "white", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {teamLabel("A")}
          <input value={manualScoreA} onChange={e => setManualScoreA(e.target.value)}
            style={{ background: POKE_COLORS.wl, color: "white", fontSize: 16, padding: "6px 10px", width: 64 }} />
        </label>
        <label style={{ color: "white", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {teamLabel("B")}
          <input value={manualScoreB} onChange={e => setManualScoreB(e.target.value)}
            style={{ background: POKE_COLORS.wl, color: "white", fontSize: 16, padding: "6px 10px", width: 64 }} />
        </label>
        <button onClick={saveTeamScores}
          style={{ background: ACCENT, color: ACCENT_TEXT, fontSize: 14, fontWeight: 900, padding: "8px 16px" }}>
          Save
        </button>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Turn length</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[30, 45, 60, 75, 90].map(s => (
            <button key={s} onClick={() => setDraftTurnDuration(s)}
              style={{ flex: 1, padding: "12px 4px", background: draftTurnDuration === s ? ACCENT : "rgba(255,255,255,0.15)", color: draftTurnDuration === s ? ACCENT_TEXT : "white", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer" }}>
              {s}s
            </button>
          ))}
        </div>
        {game?.next_turn_duration_seconds != null && game.next_turn_duration_seconds !== game.turn_duration_seconds && (
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", paddingTop: 10 }}>
            Starts next turn: {game.next_turn_duration_seconds}s
          </div>
        )}
        <button onClick={saveTurnDuration} disabled={savingTurnDuration}
          style={{ background: ACCENT, color: ACCENT_TEXT, fontSize: 15, fontWeight: 900, padding: "12px 16px", width: "100%", marginTop: 16 }}>
          Save
        </button>
      </div>
    </div>
  )
  const pokeSystemNode = me ? (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: p.team ? teamColor(p.team) : undefined, teamLabel: p.team ? teamLabel(p.team) : undefined, teamTextColor: p.team ? teamTextColor(p.team) : undefined }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("rc_reset_game", { p_code: code }) }}
        settingsContent={scoreSettingsContent}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} timerRunning={timerRunning} />
    </>
  ) : null

  const guesser = players.find(p => p.id === game?.current_guesser_id)
  const controller = players.find(p => p.id === game?.current_controller_id)

  const amGuesser = myPlayerId === game?.current_guesser_id
  const amController = myPlayerId === game?.current_controller_id
  const myTeam = me?.team
  const playingTeam = game?.current_team
  const amPlayingTeam = myTeam === playingTeam

  useEffect(() => {
    if (game?.phase !== "playing") return
    if (game?.is_paused) return  // Don't end turn while paused
    if (secondsRemaining > 0) return
    if (!game.turn_started_at) return
    if (endingRef.current) return
    endingRef.current = true
    ;(async () => {
      try {
        await rpc("rc_end_turn", { p_code: code })
      } finally { endingRef.current = false }
    })()
  }, [code, game?.phase, game?.turn_started_at, secondsRemaining])

  async function doStartTurn() {
    if (!myPlayerId || acting) return
    setActing(true)
    try {
      await rpc("rc_start_turn", { p_code: code, p_player_id: myPlayerId })
      setActing(false)
    } catch (e) {
      setActing(false)
      throw e
    }
  }

  async function doCorrect() {
    if (!currentClue || !myPlayerId || acting || actingRef.current) return
    actingRef.current = true
    setActing(true)
    sfxCorrect()
    try {
      await rpc("rc_correct", { p_code: code, p_clue_id: currentClue.id, p_player_id: myPlayerId })
      await loadState() // Immediate feedback for score/clue update
      setActing(false)
      actingRef.current = false
    } catch (e) {
      setActing(false)
      actingRef.current = false
      throw e
    }
  }

  async function doSkip() {
    if (!currentClue || !myPlayerId || acting || actingRef.current) return
    actingRef.current = true
    setActing(true)
    sfxSkip()
    try {
      await rpc("rc_skip", { p_code: code, p_clue_id: currentClue.id, p_player_id: myPlayerId })
      await loadState() // Immediate feedback for score/clue update
      setActing(false)
      actingRef.current = false
    } catch (e) {
      setActing(false)
      actingRef.current = false
      throw e
    }
  }

  async function doPause() {
    if (!myPlayerId || acting) return
    console.log('[PAUSE] Starting pause')
    setActing(true)
    try {
      await rpc("rc_pause_turn", { p_code: code, p_player_id: myPlayerId })
      console.log('[PAUSE] RPC complete, loading state')
      await loadState()
      console.log('[PAUSE] State loaded, is_paused:', game?.is_paused)
      setActing(false)
    } catch (e) {
      console.error('[PAUSE ERROR]', e)
      setActing(false)
      throw e
    }
  }

  async function doResume() {
    if (!myPlayerId || acting) return
    console.log('[RESUME] Starting resume')
    setActing(true)
    try {
      await rpc("rc_resume_turn", { p_code: code, p_player_id: myPlayerId })
      console.log('[RESUME] RPC complete, loading state')
      await loadState()
      console.log('[RESUME] State loaded, is_paused:', game?.is_paused)
      setActing(false)
    } catch (e) {
      console.error('[RESUME ERROR]', e)
      setActing(false)
      throw e
    }
  }

  async function doEndEarly() {
    if (!myPlayerId || acting) return
    setActing(true)
    try {
      await rpc("rc_end_turn", { p_code: code })
      setActing(false)
    } catch (e) {
      setActing(false)
      throw e
    }
  }

  async function saveTeamScores() {
    await supabase
      .from("reversecharades_games")
      .update({
        team_a_score: Number(manualScoreA) || 0,
        team_b_score: Number(manualScoreB) || 0,
      })
      .eq("code", code)
    syncChRef.current?.send({ type: "broadcast", event: "sync" })
    await loadState()
  }

  async function doResetGame() {
    if (game.replay_code) { redirectToReplay(game.replay_code); return }
    const { data, error } = await supabase.rpc("rc_create_replay", { p_code: code })
    if (error) { alert(error.message); return }
    syncChRef.current?.send({ type: "broadcast", event: "sync" })
    redirectToReplay(data)
  }


  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Loading…</p>
      </div>
        {pokeSystemNode}
      </>
    )
  }

  const skipDisabled = acting || !currentClue || pendingCount < 1 || (game.skip_limit > 0 && game.skips_this_turn >= game.skip_limit)
  const timerUrgent = secondsRemaining <= 5

  // ─── FINISHED ───────────────────────────────────────────────────────────────
  if (game.phase === "finished") {
    const aScore = game.team_a_score ?? 0
    const bScore = game.team_b_score ?? 0
    const tied = aScore === bScore
    const winner = tied ? null : aScore > bScore ? "A" : "B"
    const winnerTurns = winner === "A" ? game.team_a_turns : game.team_b_turns
    const loserTurns = winner === "A" ? game.team_b_turns : game.team_a_turns
    const turnImbalance = !tied && winnerTurns != null && loserTurns != null && winnerTurns > loserTurns

    const teamAbove = (
      <div style={{ marginBottom: 32 }}>
        {turnImbalance && (
          <div style={{ background: MID, padding: "14px 18px", marginBottom: 12, fontSize: 14, fontWeight: 600, opacity: 0.85, borderLeft: `4px solid ${ACCENT_TEXT}` }}>
            Note: {teamLabel(winner)} had one more turn than {teamLabel(winner === "A" ? "B" : "A")}.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
          {[["A", aScore], ["B", bScore]].map(([t, score]) => {
            const isWinner = winner === t
            const turns = t === "A" ? game.team_a_turns : game.team_b_turns
            const teamPlayers = players.filter(p => p.team === t)
            return (
              <div key={t} style={{ display: "flex" }}>
                <div style={{ padding: "13px 0", minWidth: 48, flexShrink: 0, background: teamColor(t), fontSize: 18, fontWeight: 900, color: teamTextColor(t), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {score}
                </div>
                <div style={{ padding: "13px 16px", flex: 1, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{teamLabel(t)}</div>
                    <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                      {teamPlayers.map(p => p.name).join(", ")}
                      {turns != null ? ` · ${turns} turn${turns !== 1 ? "s" : ""}` : ""}
                    </div>
                  </div>
                  {isWinner && <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT_TEXT, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
                  {tied && <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tied</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )

    return (
      <>
      <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column" }}>
        <EndGame
          players={[]}
          onPlayAgain={doResetGame}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: ACCENT, wl: MID, accentText: ACCENT_TEXT }}
          aboveScores={teamAbove}
        />
      </div>
        {pokeSystemNode}
      </>
    )
  }

  // ─── TURN START ──────────────────────────────────────────────────────────────
  if (game.phase === "turn_start") {
    const bigText = amGuesser ? "Your turn" : `${guesser?.name ?? "—"} is guessing`
    const controllerLine = amController ? "You control clues" : `${controller?.name ?? "—"} controls clues`
    console.log('[TURN START]', { amGuesser, amController, bigText, controllerLine })

    return (
      <>
      <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column", paddingBottom: amGuesser ? `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))` : 0 }}>

        {/* Score bar */}
        <div style={{ padding: "16px 20px", background: DARK, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: GAP.section }}>
            {[["A", game.team_a_score ?? 0], ["B", game.team_b_score ?? 0]].map(([t, score]) => (
              <div key={t}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.65, marginBottom: 2 }}>
                  {teamLabel(t)}
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: t === playingTeam ? teamColor(t) : "white" }}>
                  {score}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600 }}>
            {pendingCount > 0 ? `${pendingCount} clues left` : ""}
          </div>
        </div>

        {/* Team turn strip */}
        <div style={{ padding: "8px 20px", background: teamColor(playingTeam), textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamTextColor(playingTeam) }}>
            {teamLabel(playingTeam)}&rsquo; Turn
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 24px" }}>
          <div style={{
            display: "inline-flex", alignSelf: "flex-start",
            background: teamColor(playingTeam), color: teamTextColor(playingTeam),
            fontSize: 12, fontWeight: 900, padding: "5px 10px",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20,
          }}>
            {teamLabel(playingTeam)}
          </div>

          <div style={{ fontSize: "clamp(36px, 10vw, 54px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>
            {bigText}
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, opacity: 0.65 }}>
            {controllerLine}
          </div>

          {!amGuesser && (
            <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.45, marginTop: 24 }}>
              Waiting for {guesser?.name ?? "the guesser"}…
            </div>
          )}
        </div>
      </div>

      <Footer colors={{ dark: DARK, mid: MID, wl: WARM, yellow: ACCENT, notifBg: DARK }} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {amGuesser && (
          <FooterButton onClick={doStartTurn} loading={acting} bg={ACCENT} textColor={ACCENT_TEXT}>
            Start
          </FooterButton>
        )}
      </Footer>

      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: p.team ? teamColor(p.team) : undefined, teamLabel: p.team ? teamLabel(p.team) : undefined, teamTextColor: p.team ? teamTextColor(p.team) : undefined }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("rc_reset_game", { p_code: code }) }}
        settingsContent={scoreSettingsContent}
      />
      </>
    )
  }

  // ─── PLAYING ─────────────────────────────────────────────────────────────────
  if (game.phase === "playing") {
    const topBar = (
      <PlayingTopBar
        game={game}
        secondsRemaining={secondsRemaining}
        timerUrgent={timerUrgent}
        playingTeam={playingTeam}
      />
    )

    // GUESSER — can't see clue
    if (amGuesser) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: DARK, color: "white", display: "flex", flexDirection: "column", paddingBottom: `calc(${stackedFooterH}px + env(safe-area-inset-bottom))` }}>
          {topBar}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center", gap: 32 }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 48px)", fontWeight: 900, lineHeight: 1.1 }}>
              Guess the word!
            </div>
            <StatChips correct={game.correct_this_turn ?? 0} left={null} />
          </div>
        </div>

        <Footer colors={{ dark: DARK, mid: MID, wl: WARM, yellow: ACCENT, notifBg: DARK }} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={stackedFooterH} timerRunning={timerRunning}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <FooterButton
              onClick={game.is_paused ? doResume : doPause}
              loading={acting}
              bg={ACCENT}
              textColor={ACCENT_TEXT}
            >
              {game.is_paused ? "Resume" : "Pause"}
            </FooterButton>
            <FooterButton
              onClick={() => setConfirmingEndEarly(true)}
              loading={false}
              bg={WARM}
              textColor="white"
            >
              End Early
            </FooterButton>
          </div>
        </Footer>

        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: p.team ? teamColor(p.team) : undefined, teamLabel: p.team ? teamLabel(p.team) : undefined, teamTextColor: p.team ? teamTextColor(p.team) : undefined }))}
          gamePhase={game?.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await rpc("rc_reset_game", { p_code: code }) }}
          settingsContent={scoreSettingsContent}
          peekBarHeight={`${stackedFooterH - FOOTER_H}px`}
        />
        {endEarlyConfirmModal}
        </>
      )
    }

    // CONTROLLER — sees clue with buttons
    if (amController) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column", paddingBottom: `calc(${stackedFooterH}px + env(safe-area-inset-bottom))` }}>
          {topBar}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 12 }}>
              Act it out!
            </div>
            <div style={{
              fontSize: clueTextSize(currentClue?.text),
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.5px",
              wordBreak: "break-word",
              marginBottom: 20,
            }}>
              {currentClue?.text ?? "—"}
            </div>
            <StatChips correct={game.correct_this_turn ?? 0} left={pendingCount} />
          </div>
        </div>

        <Footer colors={{ dark: DARK, mid: MID, wl: WARM, yellow: ACCENT, notifBg: DARK }} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={stackedFooterH} timerRunning={timerRunning}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <FooterButton
              onClick={doCorrect}
              disabled={!currentClue || game.is_paused}
              loading={acting}
              bg={game.is_paused ? MID : ACCENT}
              textColor={game.is_paused ? "rgba(255,255,255,0.5)" : ACCENT_TEXT}
              style={{ fontSize: 28 }}
            >
              ✓ Correct
            </FooterButton>
            <div style={{ flex: 1, display: "flex" }}>
              <FooterButton
                onClick={doSkip}
                disabled={skipDisabled || game.is_paused}
                loading={acting}
                bg={(skipDisabled || game.is_paused) ? MID : WARM}
                textColor={(skipDisabled || game.is_paused) ? "rgba(255,255,255,0.5)" : "white"}
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  textDecoration: (game.skip_limit > 0 && game.skips_this_turn >= game.skip_limit) ? "line-through" : "none",
                }}
              >
                {game.skip_penalty < 0 ? `Skip (${game.skip_penalty})` : "Skip"}
                {game.skip_limit > 0 && ` · ${game.skips_this_turn ?? 0}/${game.skip_limit} used`}
              </FooterButton>
              <FooterButton
                onClick={game.is_paused ? doResume : doPause}
                loading={acting}
                bg={DARK}
                textColor="white"
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                {game.is_paused ? "Resume" : "Pause"}
              </FooterButton>
              <FooterButton
                onClick={() => setConfirmingEndEarly(true)}
                loading={false}
                bg={WARM}
                textColor="white"
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                End Early
              </FooterButton>
            </div>
          </div>
        </Footer>

        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: p.team ? teamColor(p.team) : undefined, teamLabel: p.team ? teamLabel(p.team) : undefined, teamTextColor: p.team ? teamTextColor(p.team) : undefined }))}
          gamePhase={game?.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await rpc("rc_reset_game", { p_code: code }) }}
          settingsContent={scoreSettingsContent}
          peekBarHeight={`${stackedFooterH - FOOTER_H}px`}
        />
        {endEarlyConfirmModal}
        </>
      )
    }

    // SAME TEAM — sees clue, no buttons
    if (amPlayingTeam) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column", paddingBottom: `calc(${stackedFooterH}px + env(safe-area-inset-bottom))` }}>
          {topBar}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 12 }}>
              Act it out for {guesser?.name ?? "the guesser"}!
            </div>
            <div style={{
              fontSize: clueTextSize(currentClue?.text),
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.5px",
              wordBreak: "break-word",
              marginBottom: 20,
            }}>
              {currentClue?.text ?? "—"}
            </div>
            <StatChips correct={game.correct_this_turn ?? 0} left={null} />
            <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.65, marginTop: 20 }}>
              {controller?.name ?? "Someone"} has the controls
            </div>
          </div>
        </div>

        <Footer colors={{ dark: DARK, mid: MID, wl: WARM, yellow: ACCENT, notifBg: DARK }} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={stackedFooterH} timerRunning={timerRunning}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <FooterButton
              onClick={game.is_paused ? doResume : doPause}
              loading={acting}
              bg={MID}
              textColor="white"
            >
              {game.is_paused ? "Resume" : "Pause"}
            </FooterButton>
            <FooterButton
              onClick={() => setConfirmingEndEarly(true)}
              loading={false}
              bg={WARM}
              textColor="white"
            >
              End Early
            </FooterButton>
          </div>
        </Footer>

        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: p.team ? teamColor(p.team) : undefined, teamLabel: p.team ? teamLabel(p.team) : undefined, teamTextColor: p.team ? teamTextColor(p.team) : undefined }))}
          gamePhase={game?.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await rpc("rc_reset_game", { p_code: code }) }}
          settingsContent={scoreSettingsContent}
          peekBarHeight={`${stackedFooterH - FOOTER_H}px`}
        />
        {endEarlyConfirmModal}
        </>
      )
    }

    // OTHER TEAM — watching
    return (
      <>
      <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column" }}>
        {topBar}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.65, marginBottom: 10 }}>Guessing</div>
          <div style={{ fontSize: "clamp(36px, 10vw, 56px)", fontWeight: 900, lineHeight: 1, marginBottom: 28 }}>
            {guesser?.name ?? "—"}
          </div>
          <StatChips correct={game.correct_this_turn ?? 0} left={null} />
        </div>

        <div style={{ padding: "16px 24px", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", background: DARK, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.65 }}>
            Don't give it away — your turn is coming.
          </div>
        </div>
      </div>
        {pokeSystemNode}
      </>
    )
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "white", fontSize: 20, fontWeight: 700 }}>Loading…</p>
    </div>
      {pokeSystemNode}
    </>
  )
}
