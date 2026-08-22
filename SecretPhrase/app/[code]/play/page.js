"use client"

import { supabase } from "../../../lib/supabase"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import EndGame from "../../../components/EndGame"
import StatusBar from "../../../components/StatusBar"
import GameModal from "../../../components/GameModal"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const BG = "#2434C4"
const COOL_DARK = "#2920AD"
const MID_DARK = "#2224B7"
const WARM_LIGHT = "#2858DB"
const YELLOW = "#FBDF54"
const BOYS = "#F97316"
const GIRLS = "#C026D3"
const VOTE_YES = "#22C55E"
const VOTE_NO = "#EF4444"

const POKE_COLORS = { dark: COOL_DARK, mid: MID_DARK, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#1B1868" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const TEAM_LABEL = { 1: "Boys", 2: "Girls" }
const TEAM_COLOR = { 1: BOYS, 2: GIRLS }
const DEFAULT_ANSWER_SECONDS = 20

function Nm({ children }) {
  return <span style={{ color: "#FBDF54" }}>{children}</span>
}

// AI-generated phrases sometimes come back with straight apostrophes — smarten
// them at display time so the whole game reads typographically consistent.
function smartQuote(str) {
  return str ? str.replace(/'/g, "’") : str
}

function ScoreBoxes({ t1Score, t2Score }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={{ background: BOYS, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 8px" }}>Boys {t1Score}</span>
      <span style={{ background: GIRLS, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 8px" }}>Girls {t2Score}</span>
    </div>
  )
}

function applyRowChange(setList) {
  return (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") { setList(prev => prev.filter(r => r.id !== oldRow?.id)); return }
    if (!newRow) return
    setList(prev => {
      const idx = prev.findIndex(r => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
    })
  }
}

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showGameModal, setShowGameModal] = useState(false)
  const [actionError, setActionError] = useState("")
  const [confirmingReveal, setConfirmingReveal] = useState(false)
  const [instructions, setInstructions] = useState("")

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "secretphrase").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
  }, [])
  const channelRef = useRef(null)
  const loadSeqRef = useRef(0)
  const rafRef = useRef(null)
  const isIdle = useIdleGate()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setMyPlayerId(localStorage.getItem(`secretphrase:${code}:playerId`))
  }, [code])

  // Drives the countdown bar + timeout detection from server timestamps, same
  // pattern as HearingVoices — every viewer computes remaining time locally
  // off primary_started_at/secondary_started_at instead of a synced ticker.
  useEffect(() => {
    function tick() {
      setNow(Date.now())
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gameData }, { data: playerData }] = await Promise.all([
      supabase.from("secretphrase_games").select("*").eq("code", code).single(),
      supabase.from("secretphrase_players").select("id,name,team,ready").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return
    if (gameData) setGame(gameData)
    setPlayers(playerData ?? [])
  }

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
        .channel("secretphrase-play-" + code)
        .on("postgres_changes", { event: "*", schema: "public", table: "secretphrase_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.new) setGame(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "secretphrase_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            loadState()
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
      channelRef.current = channel
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
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase, code, router])

  const me = players.find(p => p.id === myPlayerId)
  const byId = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players])

  if (isIdle) {
    return (
      <div style={{ minHeight: "100dvh", background: BG }}>
        <IdleGateModal colors={POKE_COLORS} />
      </div>
    )
  }

  if (!game || !me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 18, fontWeight: 700, opacity: 0.65 }}>Loading…</p>
      </div>
    )
  }

  const t1Score = game.team1_score ?? 0
  const t2Score = game.team2_score ?? 0

  if (game.phase === "finished") {
    const t1Wins = t1Score > t2Score
    const t2Wins = t2Score > t1Score
    const team1Players = players.filter(p => p.team === 1)
    const team2Players = players.filter(p => p.team === 2)

    const teamAbove = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {[
          { label: "Boys", color: BOYS, score: t1Score, names: team1Players.map(p => p.name), winner: t1Wins },
          { label: "Girls", color: GIRLS, score: t2Score, names: team2Players.map(p => p.name), winner: t2Wins },
        ].map(team => (
          <div key={team.label} style={{ display: "flex" }}>
            <div style={{ padding: "13px 0", minWidth: 48, flexShrink: 0, background: team.color, fontSize: 18, fontWeight: 900, color: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {team.score}
            </div>
            <div style={{ padding: "13px 16px", flex: 1, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{team.label}</div>
                {team.names.length > 0 && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{team.names.join(", ")}</div>}
              </div>
              {team.winner && <span style={{ fontSize: 11, fontWeight: 800, color: team.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
            </div>
          </div>
        ))}
      </div>
    )

    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <EndGame
            players={[]}
            onPlayAgain={async () => {
              try {
                const { error } = await supabase.rpc("secretphrase_play_again", { p_code: code })
                if (error) { alert("Couldn’t start a new game: " + error.message); return }
                router.push(`/${code}`)
              } catch (e) {
                alert("Couldn’t start a new game: " + (e?.message || "try again."))
              }
            }}
            onPlayAnotherGame={() => setShowGameModal(true)}
            bottomPad={BOTTOM_PAD}
            colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
            aboveScores={teamAbove}
          />
        </div>
        <GameModal
          open={showGameModal}
          onClose={() => setShowGameModal(false)}
          onSelect={sub => { window.location.href = `https://${sub}.jackbrannen.com` }}
          currentSub="secretphrase"
          myName={me.name}
        />
      </>
    )
  }

  const answerSeconds = game.answer_duration_seconds || DEFAULT_ANSWER_SECONDS
  const phraseTeam = game.current_phrase_team
  const guessTeam = phraseTeam === 1 ? 2 : 1
  const isPhraseTeam = me.team === phraseTeam
  const primary = byId[game.current_primary_player_id]
  const second = byId[game.current_second_player_id]
  const guesser = byId[game.current_guesser_player_id]
  const meIsPrimary = me.id === game.current_primary_player_id
  const meIsSecondary = me.id === game.current_second_player_id
  const meIsGuesser = me.id === game.current_guesser_player_id

  const primaryStartedMs = game.primary_started_at ? new Date(game.primary_started_at).getTime() : null
  const secondaryStartedMs = game.secondary_started_at ? new Date(game.secondary_started_at).getTime() : null
  const primaryRemaining = primaryStartedMs ? Math.max(0, answerSeconds - (now - primaryStartedMs) / 1000) : answerSeconds
  const primaryTimeUp = !!primaryStartedMs && primaryRemaining <= 0
  const secondaryRemaining = secondaryStartedMs ? Math.max(0, answerSeconds - (now - secondaryStartedMs) / 1000) : answerSeconds
  const secondaryTimeUp = !!secondaryStartedMs && secondaryRemaining <= 0

  // subPhase walks: primary_wait -> primary_timer -> primary_timeup -> secondary_timer -> secondary_timeup
  const subPhase = !primaryStartedMs ? "primary_wait"
    : !primaryTimeUp ? "primary_timer"
    : !secondaryStartedMs ? "primary_timeup"
    : !secondaryTimeUp ? "secondary_timer"
    : "secondary_timeup"

  const secondaryUnlockable = subPhase === "primary_timeup"
  const guesserUnlockable = subPhase === "secondary_timeup"

  // Secondary sees the phrase as soon as primary starts answering (not just once
  // their own timer starts) — they need it to follow along and get ready.
  const phraseVisibleDuringAnswering = !isPhraseTeam ? false
    : meIsPrimary ? !!primaryStartedMs
    : meIsSecondary ? !!primaryStartedMs
    : true

  const phraseVisible = game.turn_phase === "guess_confirm" || game.turn_phase === "turn_result"
    ? true
    : game.turn_phase === "answering"
      ? phraseVisibleDuringAnswering
      : false

  const activeRemaining = subPhase === "primary_timer" || subPhase === "primary_timeup" ? primaryRemaining
    : subPhase === "secondary_timer" || subPhase === "secondary_timeup" ? secondaryRemaining
    : answerSeconds

  function nudge() {
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  async function startPrimaryTimer() {
    setActionError("")
    try {
      const { error } = await supabase.rpc("secretphrase_start_primary_timer", { p_code: code, p_player_id: me.id })
      if (error) throw error
      nudge()
    } catch (e) {
      setActionError(e?.message || "Something went wrong — try again.")
      throw e
    }
  }

  async function startSecondaryTimer() {
    setActionError("")
    try {
      const { error } = await supabase.rpc("secretphrase_start_secondary_timer", { p_code: code, p_player_id: me.id })
      if (error) throw error
      nudge()
    } catch (e) {
      setActionError(e?.message || "Something went wrong — try again.")
      throw e
    }
  }

  async function revealPhrase() {
    setActionError("")
    try {
      const { error } = await supabase.rpc("secretphrase_reveal_phrase", { p_code: code, p_player_id: me.id })
      if (error) { setActionError(error.message); return }
      nudge()
    } catch (e) {
      setActionError(e?.message || "Something went wrong — try again.")
    }
  }

  async function voteOutcome(outcome) {
    setActionError("")
    try {
      const { error } = await supabase.rpc("secretphrase_vote_outcome", { p_code: code, p_player_id: me.id, p_outcome: outcome })
      if (error) { setActionError(error.message); return }
      nudge()
    } catch (e) {
      setActionError(e?.message || "Something went wrong — try again.")
    }
  }

  async function readyNextTurn() {
    setActionError("")
    try {
      const { error } = await supabase.rpc("secretphrase_ready_next_turn", { p_code: code, p_player_id: me.id })
      if (error) { setActionError(error.message); return }
      nudge()
    } catch (e) {
      setActionError(e?.message || "Something went wrong — try again.")
    }
  }

  const iVotedCorrect = (game.guess_correct_votes || []).includes(me.id)
  const iVotedIncorrect = (game.guess_incorrect_votes || []).includes(me.id)
  const iAmReadyNext = (game.ready_player_ids || []).includes(me.id)
  const correctWon = (game.guess_correct_votes || []).length * 2 >= players.length

  function votesByTeam() {
    return [1, 2].map(team => ({
      team,
      players: players.filter(p => p.team === team).map(p => ({
        ...p,
        voted: (game.guess_correct_votes || []).includes(p.id) ? "correct"
          : (game.guess_incorrect_votes || []).includes(p.id) ? "incorrect"
          : null,
      })),
    }))
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white", paddingBottom: BOTTOM_PAD }}>
      <StatusBar
        label={`Round ${game.turn_index + 1}/${game.total_turns}`}
        dark={COOL_DARK}
        right={<ScoreBoxes t1Score={t1Score} t2Score={t2Score} />}
      />

      {game.turn_phase === "answering" && (
        <div style={{ padding: "10px 24px", background: TEAM_COLOR[me.team], display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>
            {TEAM_LABEL[me.team]} Team · {isPhraseTeam ? "You know the secret phrase" : "You’re guessing the secret phrase"}
          </span>
        </div>
      )}

      {/* Timer bar — visible to everyone once a timer is running, edge-to-edge depleting bar.
          Hidden once time's up so the red banner sits flush against the team bar above it. */}
      {game.turn_phase === "answering" && (subPhase === "primary_timer" || subPhase === "secondary_timer") && (
        <div style={{ flexShrink: 0, height: 10, background: activeRemaining / answerSeconds > 0.3 ? "hsla(145, 65%, 48%, 0.15)" : "hsla(0, 80%, 55%, 0.15)" }}>
          <div
            style={{
              height: "100%",
              width: `${(activeRemaining / answerSeconds) * 100}%`,
              background: activeRemaining / answerSeconds > 0.3 ? "hsl(145, 65%, 48%)" : "hsl(0, 80%, 55%)",
              transition: "width 0.1s linear, background 300ms ease",
            }}
          />
        </div>
      )}

      {game.turn_phase === "answering" && (subPhase === "primary_timeup" || subPhase === "secondary_timeup") && (
        <div style={{ padding: "14px 24px", background: "#B03030", fontSize: 18, fontWeight: 900, textAlign: "center" }}>
          Time's up!
        </div>
      )}

      <div style={{ padding: "24px" }}>
        {actionError && (
          <div style={{ background: COOL_DARK, color: YELLOW, fontSize: 14, fontWeight: 700, padding: "12px 16px", marginBottom: 16 }}>
            {actionError}
          </div>
        )}

        {/* Phrase card — phrase team the whole turn, everyone once revealed */}
        {phraseVisible && game.turn_phase !== "turn_result" && (
          <div style={{ background: TEAM_COLOR[phraseTeam], padding: "20px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.85, marginBottom: 8 }}>
              The secret phrase
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.3 }}>“{smartQuote(game.current_phrase)}”</div>
          </div>
        )}

        {game.turn_phase === "answering" && (() => {
          const activeRole = subPhase === "secondary_timer" || subPhase === "secondary_timeup" ? "second" : "first"
          const timerRunning = subPhase === "primary_timer" || subPhase === "secondary_timer"
          const isWaiting = (
            (isPhraseTeam && !meIsPrimary && !meIsSecondary) ||
            (isPhraseTeam && meIsSecondary && (subPhase === "primary_wait" || subPhase === "primary_timer")) ||
            (isPhraseTeam && meIsSecondary && subPhase === "primary_timeup" && !secondaryUnlockable)
          )
          const guesserName = guesser?.name ?? "them"
          const primaryStartPrompt = <><Nm>{guesserName}</Nm> will ask you a question. Tap <Nm>Start</Nm> when you’re ready to reveal the secret phrase and answer.</>
          const secondaryStartPrompt = <>Tap <Nm>Start</Nm> when you’re ready to answer <Nm>{guesserName}’s</Nm> question using the secret phrase.</>
          let mainText
          if (isPhraseTeam) {
            if (meIsPrimary && subPhase === "primary_wait") mainText = primaryStartPrompt
            else if (meIsPrimary && subPhase === "primary_timer") mainText = "You have to use the secret phrase in your answer."
            else if (meIsPrimary && subPhase === "primary_timeup") mainText = <>Nice work! Waiting for <Nm>{second?.name ?? "your teammate"}</Nm> now.</>
            else if (meIsPrimary) mainText = null
            else if (meIsSecondary && (subPhase === "primary_wait" || subPhase === "primary_timer")) mainText = <>Waiting for <Nm>{primary?.name ?? "your teammate"}</Nm> to answer…</>
            else if (meIsSecondary && subPhase === "primary_timeup" && !secondaryUnlockable) mainText = "Get ready — you’re up next."
            else if (meIsSecondary && subPhase === "primary_timeup") mainText = secondaryStartPrompt
            else if (meIsSecondary && subPhase === "secondary_timer") mainText = "You have to use the secret phrase in your answer."
            else if (meIsSecondary) mainText = "Nice work!"
            else mainText = <>Waiting for <Nm>{(activeRole === "second" ? second : primary)?.name ?? "your teammate"}</Nm> to answer…</>
          } else if (meIsGuesser) {
            // Only the guesser asks the questions — this prompt hides while a timer
            // is actively running (they should be asking/listening, not reading instructions).
            if (timerRunning) mainText = null
            else if (subPhase === "primary_wait") mainText = <>Ask <Nm>{primary?.name ?? "them"}</Nm> a question they have to answer using the secret phrase.</>
            else if (subPhase === "primary_timeup") mainText = <>Now it’s <Nm>{second?.name ?? "them"}’s</Nm> turn to answer your question.</>
            else mainText = null
          } else {
            mainText = timerRunning ? null : <><Nm>{guesser?.name ?? "Your teammate"}</Nm> is asking the question this turn.</>
          }

          return (
            <>
              {!timerRunning && (
                <>
                  <div style={{ background: MID_DARK, padding: "14px 16px", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7, marginBottom: 3 }}>
                      Official guesser
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{guesser?.name ?? "—"}</div>
                    <div style={{ fontSize: 14, opacity: 0.85 }}>Can consult their team.</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    {[["First", primary, activeRole === "first"], ["Second", second, activeRole === "second"]].map(([label, p, active]) => (
                      <div key={label} style={{ flex: 1, background: MID_DARK, padding: "10px 14px", opacity: active ? 1 : 0.55 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7, marginBottom: 2 }}>
                          {label} answerer
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{p?.name ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {mainText && (
                <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.35, padding: "4px 2px" }}>
                  {isWaiting && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: YELLOW, marginRight: 8, animation: "spWaitPulse 1.4s ease-in-out infinite" }} />}
                  {mainText}
                  {meIsSecondary && subPhase === "primary_timeup" && secondaryUnlockable && (
                    <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.65, marginTop: 8 }}>
                      Try to repeat their answer as closely as possible.
                    </div>
                  )}
                </div>
              )}
              <style>{`@keyframes spWaitPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
            </>
          )
        })()}

        {game.turn_phase === "guess_confirm" && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Did they guess the phrase correctly?</h2>
            <p style={{ fontSize: 15, opacity: 0.85, marginBottom: 20 }}>
              They win the point if 50% of players vote yes.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => voteOutcome("correct")}
                style={{ flex: 1, background: iVotedCorrect ? "#12BAAA" : MID_DARK, color: "white", fontSize: 16, fontWeight: 800, padding: "18px" }}
              >
                Yes
              </button>
              <button
                onClick={() => voteOutcome("incorrect")}
                style={{ flex: 1, background: iVotedIncorrect ? "#12BAAA" : MID_DARK, color: "white", fontSize: 16, fontWeight: 800, padding: "18px" }}
              >
                No
              </button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7, marginBottom: 8 }}>
              Votes
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {votesByTeam().map(({ team, players: teamPlayers }) => (
                <div key={team} style={{ flex: 1 }}>
                  <div style={{ background: TEAM_COLOR[team], padding: "6px 10px", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {TEAM_LABEL[team]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {teamPlayers.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: MID_DARK }}>
                        <span style={{ fontSize: 12, fontWeight: 800, opacity: p.voted ? 1 : 0.5, flexShrink: 0, color: p.voted === "correct" ? VOTE_YES : p.voted === "incorrect" ? VOTE_NO : undefined }}>
                          {p.voted === "correct" ? "✓" : p.voted === "incorrect" ? "✕" : "…"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {game.turn_phase === "turn_result" && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>
              {correctWon ? "They got it!" : "So close — the phrase was:"}
            </h2>
            <div style={{ background: MID_DARK, padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>“{smartQuote(game.current_phrase)}”</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7, marginBottom: 8 }}>
              Votes
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {votesByTeam().map(({ team, players: teamPlayers }) => (
                <div key={team} style={{ flex: 1 }}>
                  <div style={{ background: TEAM_COLOR[team], padding: "6px 10px", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {TEAM_LABEL[team]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {teamPlayers.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: MID_DARK }}>
                        <span style={{ fontSize: 12, fontWeight: 800, opacity: p.voted ? 1 : 0.5, flexShrink: 0, color: p.voted === "correct" ? VOTE_YES : p.voted === "incorrect" ? VOTE_NO : undefined }}>
                          {p.voted === "correct" ? "✓" : p.voted === "incorrect" ? "✕" : "—"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {game.turn_phase === "answering" && meIsPrimary && subPhase === "primary_wait" && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <FooterButton onClick={startPrimaryTimer}>Start my answer ({answerSeconds} seconds)</FooterButton>
        </Footer>
      )}

      {game.turn_phase === "answering" && meIsSecondary && subPhase === "primary_timeup" && secondaryUnlockable && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <FooterButton onClick={startSecondaryTimer}>Start my answer ({answerSeconds} seconds)</FooterButton>
        </Footer>
      )}

      {game.turn_phase === "answering" && meIsGuesser && subPhase === "secondary_timeup" && guesserUnlockable && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <button
            onClick={() => setConfirmingReveal(true)}
            style={{ flex: 1, height: "100%", background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900 }}
          >
            Guess the phrase
          </button>
        </Footer>
      )}

      {game.turn_phase === "answering" && !(
        (meIsPrimary && subPhase === "primary_wait") ||
        (meIsSecondary && subPhase === "primary_timeup" && secondaryUnlockable) ||
        (meIsGuesser && subPhase === "secondary_timeup" && guesserUnlockable)
      ) && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
      )}

      {game.turn_phase === "guess_confirm" && (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
      )}

      {game.turn_phase === "turn_result" && (() => {
        const isLastTurn = game.turn_index + 1 >= game.total_turns
        return (
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
            <button
              onClick={readyNextTurn}
              disabled={iAmReadyNext}
              style={{ flex: 1, height: "100%", background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, opacity: iAmReadyNext ? 0.6 : 1 }}
            >
              {iAmReadyNext
                ? `${(game.ready_player_ids || []).length}/${players.length} ready — waiting…`
                : isLastTurn ? "See final score →" : "Next turn →"}
            </button>
          </Footer>
        )
      })()}

      {confirmingReveal && (
        <div
          onClick={() => setConfirmingReveal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: COOL_DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Make your official guess</h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This is the moment to say your final guess out loud. Don’t reveal the phrase until your guess is official.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingReveal(false)} style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingReveal(false); revealPhrase() }}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                Reveal Secret Phrase
              </button>
            </div>
          </div>
        </div>
      )}

      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        allPlayers={players.map(p => p.name)}
        playerDetails={players.map(p => ({
          name: p.name,
          teamColor: TEAM_COLOR[p.team],
          teamLabel: TEAM_LABEL[p.team],
          teamTextColor: "#fff",
        }))}
        gamePhase={game.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await supabase.rpc("secretphrase_play_again", { p_code: code }) }}
      />
    </div>
  )
}
