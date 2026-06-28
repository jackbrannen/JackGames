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

const PRIMARY = "#974344"
const DARK    = "#803946"
const MID     = "#8A3D45"
const WARM    = "#AE5C4D"
const YELLOW  = "#FBDF54"

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
const teamColor = (t) => t === "A" ? YELLOW : "white"
const teamTextColor = (t) => t === "A" ? "#000" : "#000"

// Shared stat chip component (inline, no state)
function StatChips({ correct, left }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <div style={{ background: DARK, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: YELLOW }}>{correct}</span>
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
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: t === playingTeam ? YELLOW : "white" }}>
                {score}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: timerUrgent ? YELLOW : "white" }}>
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
            background: playingTeam === "A" ? "white" : YELLOW,
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


const POKE_COLORS = { dark: "#803946", mid: "#8A3D45", wl: "#AE5C4D", yellow: "#FBDF54", notifBg: "#4A1F28" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [currentClue, setCurrentClue] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())
  const [acting, setActing] = useState(false)
  const [instructions, setInstructions] = useState("")
  const endingRef = useRef(false)
  const soundTriggerRef = useRef(null)

  useEffect(() => {
    const existing = localStorage.getItem(`rc:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }

  async function loadState() {
    const { data: gameData } = await supabase
      .from("reversecharades_games")
      .select("code,phase,host_id,current_team,current_guesser_id,current_controller_id,current_clue_id,turn_started_at,turn_duration_seconds,skip_limit,skip_penalty,skips_this_turn,correct_this_turn,last_turn_correct,last_turn_skips,last_turn_team,team_a_score,team_b_score,team_a_turns,team_b_turns,next_game,next_game_picker_name,is_paused,paused_at,pause_elapsed_seconds")
      .eq("code", code)
      .single()
    if (!gameData) return

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

    setGame(gameData)
    setPlayers(playerData ?? [])
    setCurrentClue(clueData)
    setPendingCount(count)
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
    supabase.from("game_instructions").select("body").eq("game_key", "reversecharades").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const ticker = setInterval(() => setNowMs(Date.now()), 100)
    const channel = supabase.channel(`rc-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_players" }, loadState)
      .subscribe()
    return () => { clearInterval(poll); clearInterval(ticker); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])


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
  const timerRunning = !!game?.turn_started_at && secondsRemaining > 0
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
    if (!currentClue || !myPlayerId || acting) return
    setActing(true)
    sfxCorrect()
    try {
      await rpc("rc_correct", { p_code: code, p_clue_id: currentClue.id, p_player_id: myPlayerId })
      await loadState() // Immediate feedback for score/clue update
      setActing(false)
    } catch (e) {
      setActing(false)
      throw e
    }
  }

  async function doSkip() {
    if (!currentClue || !myPlayerId || acting) return
    setActing(true)
    sfxSkip()
    try {
      await rpc("rc_skip", { p_code: code, p_clue_id: currentClue.id, p_player_id: myPlayerId })
      await loadState() // Immediate feedback for score/clue update
      setActing(false)
    } catch (e) {
      setActing(false)
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

  async function doResetGame() {
    await supabase.rpc("rc_reset_game", { p_code: code })
    router.replace(`/${code}`)
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
          <div style={{ background: MID, padding: "14px 18px", marginBottom: 12, fontSize: 14, fontWeight: 600, opacity: 0.85, borderLeft: `4px solid ${YELLOW}` }}>
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
                  {isWinner && <span style={{ fontSize: 11, fontWeight: 800, color: YELLOW, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
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
          colors={{ yellow: YELLOW, wl: MID }}
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
                <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: t === playingTeam ? YELLOW : "white" }}>
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

      <Footer colors={{ dark: DARK, mid: MID, wl: WARM, yellow: YELLOW, notifBg: DARK }} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {amGuesser && (
          <FooterButton onClick={doStartTurn} loading={acting} bg={YELLOW} textColor="#000">
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
        <div style={{ minHeight: "100dvh", background: DARK, color: "white", display: "flex", flexDirection: "column" }}>
          {topBar}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center", gap: 32 }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 48px)", fontWeight: 900, lineHeight: 1.1 }}>
              Guess the word!
            </div>
            <StatChips correct={game.correct_this_turn ?? 0} left={null} />
          </div>

          <div style={{ padding: "16px 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", background: DARK, flexShrink: 0 }}>
            <FooterButton
              onClick={game.is_paused ? doResume : doPause}
              loading={acting}
              bg={YELLOW}
              textColor="#000"
              style={{
                padding: "16px",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {game.is_paused ? "Resume" : "Pause"}
            </FooterButton>
          </div>
        </div>
      )
    }

    // CONTROLLER — sees clue with buttons
    if (amController) {
      return (
        <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column" }}>
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

          <div style={{ padding: "16px 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <FooterButton
              onClick={doCorrect}
              disabled={!currentClue || game.is_paused}
              loading={acting}
              bg={game.is_paused ? MID : YELLOW}
              textColor={game.is_paused ? "rgba(255,255,255,0.5)" : "#000"}
              style={{ padding: "28px 16px", fontSize: 28 }}
            >
              ✓ Correct
            </FooterButton>
            <div style={{ display: "flex", gap: 8 }}>
              <FooterButton
                onClick={doSkip}
                disabled={skipDisabled || game.is_paused}
                loading={acting}
                bg={(skipDisabled || game.is_paused) ? MID : WARM}
                textColor={(skipDisabled || game.is_paused) ? "rgba(255,255,255,0.5)" : "white"}
                style={{
                  flex: 1,
                  padding: "18px 16px",
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
                  flex: 1,
                  padding: "18px 16px",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                {game.is_paused ? "Resume" : "Pause"}
              </FooterButton>
            </div>
          </div>
        </div>
      )
    }

    // SAME TEAM — sees clue, no buttons
    if (amPlayingTeam) {
      return (
        <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", display: "flex", flexDirection: "column" }}>
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
          </div>

          <div style={{ padding: "16px 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", background: DARK, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.65 }}>
              {controller?.name ?? "Someone"} has the controls
            </div>
            <FooterButton
              onClick={game.is_paused ? doResume : doPause}
              loading={acting}
              bg={MID}
              textColor="white"
              style={{
                padding: "16px",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {game.is_paused ? "Resume" : "Pause"}
            </FooterButton>
          </div>
        </div>
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
