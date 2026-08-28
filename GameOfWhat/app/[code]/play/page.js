"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import useTypingPresence from "../../../lib/useTypingPresence"
import useOnlinePresence from "../../../lib/useOnlinePresence"
import FooterButton from "../../../components/FooterButton"
import WaitingList from "../../../components/WaitingList"
import { useBonusMatch, formatMatchNames } from "../../../lib/useBonusMatch"
import TextEntry from "../../../components/TextEntry"
import Selections, { ThumbsUpIcon } from "../../../components/Selections"
import RandomIdeas from "../../../components/RandomIdeas"
import StatusBar from "../../../components/StatusBar"
import Results from "../../../components/Results"
import EndGame from "../../../components/EndGame"
import { playYourTurn } from "../../../lib/sounds"
import IdleGateModal from "../../../components/IdleGateModal"
import PauseModal from "../../../components/PauseModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const BG = "#6B1A44"
const DARK = "#4A123B"  // cool-dark: headers, top bars
const MID = "#5C1640"   // mid-dark: wells, cards, panels
const WARM_LIGHT = "#8B2060"  // warm-light: inputs, secondary buttons (kept for compatibility)
const YELLOW = "#FBDF54"
const GREEN = "#12BAAA"
const RED = "#F04F52"

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#300A20" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const BOT_WORDS = ["pizza","coffee","traffic","vacation","homework","laundry","dentist","parking","sunshine","deadline","wifi","elevator","printer","leftovers","voicemail"]
const Q_TEMPLATES = [
  w => `What would you do with ${w}?`,
  w => `What's the best thing about ${w}?`,
  w => `How would you explain ${w} to a five-year-old?`,
  w => `What's the worst way to handle ${w}?`,
  w => `What would ${w} say if it could talk?`,
]
function pickRandQuestion() {
  const w = BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)]
  return Q_TEMPLATES[Math.floor(Math.random() * Q_TEMPLATES.length)](w)
}
function pickRandWord() {
  return BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)]
}

async function fetchGameWideLikeTotals(code) {
  const { data: qIds } = await supabase.from("gow_questions").select("id").eq("game_code", code)
  const ids = (qIds ?? []).map(q => q.id)
  if (!ids.length) return {}
  const { data: lk } = await supabase.from("gow_likes").select("answer_id").in("question_id", ids)
  const answerIds = [...new Set((lk ?? []).map(l => l.answer_id))]
  const { data: ans } = answerIds.length
    ? await supabase.from("gow_answers").select("id,player_id").in("id", answerIds)
    : { data: [] }
  const authorById = Object.fromEntries((ans ?? []).map(a => [a.id, a.player_id]))
  const totals = {}
  for (const l of (lk ?? [])) {
    const pid = authorById[l.answer_id]
    if (pid) totals[pid] = (totals[pid] ?? 0) + 1
  }
  return totals
}


export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [game, setGame] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [resuming, setResuming] = useState(false)
  const [players, setPlayers] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState([])
  const [likes, setLikes] = useState([])
  const [gameOverLikes, setGameOverLikes] = useState(null)
  const gameOverLikesFetchedRef = useRef(false)
  const [scoreLikeTotals, setScoreLikeTotals] = useState({})
  const [myAnswer, setMyAnswer] = useState("")
  const [myVoteId, setMyVoteId] = useState(null)
  const [pendingVoteId, setPendingVoteId] = useState(null)
  const [submittingVote, setSubmittingVote] = useState(false)
  const changingVoteRef = useRef(false)
  const botIdsRef = useRef([])
  const botActionsRef = useRef(new Set())
  const soundTriggerRef = useRef(null)
  const syncChRef = useRef(null)
  const syncKeyRef = useRef(null)
  const [resultSnapshot, setResultSnapshot] = useState(null)
  const [resultsAcknowledged, setResultsAcknowledged] = useState(null)
  const lastFetchedResultsIdRef = useRef(null)
  const [roundQuestion, setRoundQuestion] = useState("")
  const [gameOverPlayers, setGameOverPlayers] = useState(null)
  const [instructions, setInstructions] = useState("")
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [draftTimerSeconds, setDraftTimerSeconds] = useState(0)
  const [savingTimer, setSavingTimer] = useState(false)
  const { onTypingChange, typingPlayerIds } = useTypingPresence("gow", code, myPlayerId)
  const { onlinePlayerIds, presenceReady } = useOnlinePresence("gow", code, myPlayerId)
  const isAway = (id) => presenceReady && id !== myPlayerId && !onlinePlayerIds.has(id)

  useEffect(() => {
    if (!game || !myPlayerId) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playYourTurn()
  }, [game?.phase])

  // Pre-fill next-round question and answer fields (dummy games)
  useEffect(() => {
    if (game?.phase !== "between_rounds" || !myPlayerId || !game?.is_dummy) return
    const mine = players.find(p => p.id === myPlayerId)
    if (mine?.question) return
    setRoundQuestion(prev => prev || pickRandQuestion())
  }, [game?.phase, game?.round_index, myPlayerId, players, game?.is_dummy])

  useEffect(() => {
    if (game?.question_phase !== "answering" || !myPlayerId || !game?.is_dummy) return
    if (myPlayerId === currentQuestion?.author_id) return
    if (answers.some(a => a.player_id === myPlayerId)) return
    setMyAnswer(prev => prev || pickRandWord())
  }, [game?.question_phase, currentQuestion?.id, myPlayerId, answers, game?.is_dummy])


  useEffect(() => {
    const existing = localStorage.getItem(`gow:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    // Clear any stale bot IDs from previous sessions — bot feature removed
    localStorage.removeItem(`gow:${code}:botIds`)
    botIdsRef.current = []
  }, [code])

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const { data: gameData } = await supabase
      .from("gow_games")
      .select("code,phase,round_index,rounds_total,current_question_id,question_phase,used_prompts,next_game,next_game_picker_name,next_game_code,last_completed_question_id,replay_code,is_dummy,timer_seconds,next_timer_seconds,answering_started_at,paused,paused_at,paused_by_name,pause_elapsed_seconds")
      .eq("code", code)
      .single()
    if (seq !== loadSeqRef.current) return
    if (!gameData) return

    if (gameData.replay_code) { router.replace(`/${gameData.replay_code}`); return }
    if (gameData.phase === "lobby") { router.replace(`/${code}`); return }

    const { data: playerData } = await supabase
      .from("gow_players")
      .select("id,name,first_name,score,question,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    if (seq !== loadSeqRef.current) return
    setGame(gameData)
    setPlayers(playerData ?? [])
    if (gameData.phase === "finished") setGameOverPlayers(p => p ?? playerData ?? [])
    // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
    const syncKey = `${gameData.phase}:${gameData.question_phase}:${gameData.round_index}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) syncChRef.current?.send({ type: "broadcast", event: "sync" })
    syncKeyRef.current = syncKey

    if (gameData.current_question_id) {
      const { data: qData } = await supabase
        .from("gow_questions")
        .select("id,text,author_id")
        .eq("id", gameData.current_question_id)
        .single()
      if (seq !== loadSeqRef.current) return
      setCurrentQuestion(qData ?? null)

      const { data: answerData } = await supabase
        .from("gow_answers")
        .select("id,text,player_id,vote_count,skipped")
        .eq("question_id", gameData.current_question_id)
        .order("random_order", { ascending: true })
      if (seq !== loadSeqRef.current) return
      setAnswers(answerData ?? [])

      const pid = myPlayerId || localStorage.getItem(`gow:${code}:playerId`)
      if (pid) {
        const { data: voteData } = await supabase
          .from("gow_votes")
          .select("id,answer_id,voter_id")
          .eq("question_id", gameData.current_question_id)
        if (seq !== loadSeqRef.current) return
        setVotes(voteData ?? [])

        const { data: likeData } = await supabase
          .from("gow_likes")
          .select("id,answer_id,liker_id")
          .eq("question_id", gameData.current_question_id)
        if (seq !== loadSeqRef.current) return
        setLikes(likeData ?? [])
        if (!changingVoteRef.current) {
          const myVote = (voteData ?? []).find(v => v.voter_id === pid)
          setMyVoteId(myVote ? (myVote.answer_id ?? "nota") : null)
        }

        if (gameData.question_phase === "results") {
          setResultSnapshot({
            questionId: gameData.current_question_id,
            question: qData,
            answers: answerData ?? [],
            votes: voteData ?? [],
            likes: likeData ?? [],
          })
          fetchGameWideLikeTotals(code).then(setScoreLikeTotals)
        } else if (
          gameData.last_completed_question_id &&
          lastFetchedResultsIdRef.current !== gameData.last_completed_question_id
        ) {
          lastFetchedResultsIdRef.current = gameData.last_completed_question_id
          const [{ data: lqData }, { data: laData }, { data: lvData }, { data: llData }] = await Promise.all([
            supabase.from("gow_questions").select("id,text,author_id").eq("id", gameData.last_completed_question_id).single(),
            supabase.from("gow_answers").select("id,text,player_id,vote_count,skipped").eq("question_id", gameData.last_completed_question_id).order("random_order", { ascending: true }),
            supabase.from("gow_votes").select("answer_id,voter_id").eq("question_id", gameData.last_completed_question_id),
            supabase.from("gow_likes").select("answer_id").eq("question_id", gameData.last_completed_question_id),
          ])
          if (seq !== loadSeqRef.current) return
          setResultSnapshot({ questionId: gameData.last_completed_question_id, question: lqData, answers: laData ?? [], votes: lvData ?? [], likes: llData ?? [] })
          fetchGameWideLikeTotals(code).then(setScoreLikeTotals)
        }
      }
    } else {
      setCurrentQuestion(null)
      setAnswers([])
      setVotes([])
      setLikes([])
    }

    if (gameData.phase === "finished" && !gameOverLikesFetchedRef.current) {
      gameOverLikesFetchedRef.current = true
      setGameOverLikes(await fetchGameWideLikeTotals(code))
    }
  }

  // gow_games changes: apply the row directly from the realtime payload
  // instead of a full loadState() refetch. Each change independently
  // reaches every subscribed client already, so there's no need to also
  // nudge — nudge() exists for cases where a client's own realtime might be
  // lagging, which doesn't apply to the client that just received this
  // exact event. Note: this only covers the top-level game row — a change
  // that also affects current_question_id/question_phase still needs the
  // fuller loadState() to pull the new question's answers/votes/likes, so
  // this intentionally still calls loadState() when those fields change.
  const gamesSyncKeyRef = useRef(null)
  const lastGameQuestionIdRef = useRef(undefined)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
    const key = `${newRow.phase}:${newRow.question_phase}:${newRow.round_index}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) syncChRef.current?.send({ type: "broadcast", event: "sync" })
    gamesSyncKeyRef.current = key
    // Only the top-level game row is cheap to apply directly. A change to
    // current_question_id means a new question's answers/votes/likes need
    // fetching too, which the lighter payload-patch path here can't do, so
    // fall back to the fuller loadState() in that specific case.
    const questionChanged = lastGameQuestionIdRef.current !== undefined && newRow.current_question_id !== lastGameQuestionIdRef.current
    lastGameQuestionIdRef.current = newRow.current_question_id
    if (questionChanged) { loadState(); return }
    // Not snapshotting gameOverPlayers here (unlike loadState()): doing so
    // would need the live `players` value, but this function is captured
    // once when the connection effect mounts, so a closed-over `players`
    // would be permanently stale. The finished-screen render already falls
    // back to live `players` (`gameOverPlayers ?? players`), which is
    // always fresh via its own separately-patched subscription, so this
    // path just leaves the snapshot for loadState() (poll/reconnect) to
    // fill in rather than risk using a stale one.
    setGame(newRow)
  }
  // gow_players is scoped by game_code already; gow_answers/gow_votes/gow_likes
  // have no filter at all (they fire for every GameOfWhat game in the
  // database), so also drop anything not for the question currently on
  // screen instead of blindly applying it.
  function applyRowChange(setList, { questionScoped } = {}) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload
      if (questionScoped) {
        const relevantId = newRow?.question_id ?? oldRow?.question_id
        if (relevantId !== currentQuestionIdRef.current) return
      }
      if (eventType === "DELETE") {
        setList(prev => prev.filter(r => r.id !== oldRow?.id))
        return
      }
      if (!newRow) return
      setList(prev => {
        const idx = prev.findIndex(r => r.id === newRow.id)
        return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
      })
    }
  }
  const currentQuestionIdRef = useRef(null)
  useEffect(() => { currentQuestionIdRef.current = currentQuestion?.id ?? null }, [currentQuestion?.id])

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
    // Only reset reconnectAttempt after the connection has stayed up for a
    // while — resetting on every bare SUBSCRIBED lets a flapping connection
    // (briefly connects, drops, repeat) reconnect+loadState() unthrottled,
    // since each brief success zeroes the backoff right before the next
    // drop. See BUGS.md (found in Copycats, 2026-08-24).
    let stableTimer = null

    function connect() {
      channel = supabase.channel(`gow-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "gow_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "gow_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "gow_answers" }, applyRowChange(setAnswers, { questionScoped: true }))
        .on("postgres_changes", { event: "*", schema: "public", table: "gow_votes" }, applyRowChange(setVotes, { questionScoped: true }))
        .on("postgres_changes", { event: "*", schema: "public", table: "gow_likes" }, payload => {
          const { eventType, new: newRow, old: oldRow } = payload
          const relevantId = newRow?.question_id ?? oldRow?.question_id
          if (relevantId !== currentQuestionIdRef.current) return
          if (eventType === "DELETE") {
            setLikes(prev => prev.filter(l => l.id !== oldRow?.id))
            return
          }
          if (!newRow) return
          setLikes(prev => {
            const idx = prev.findIndex(l => l.id === newRow.id)
            if (idx !== -1) return prev.map(l => l.id === newRow.id ? newRow : l)
            // Reconcile against our own id-less optimistic insert (toggleLike)
            // instead of appending a duplicate once the real row arrives.
            const optimisticIdx = prev.findIndex(l => !l.id && l.question_id === newRow.question_id && l.liker_id === newRow.liker_id && l.answer_id === newRow.answer_id)
            if (optimisticIdx !== -1) return prev.map((l, i) => i === optimisticIdx ? newRow : l)
            return [...prev, newRow]
          })
        })
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
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  const currentQuestionId = currentQuestion?.id
  useEffect(() => {
    setMyAnswer("")
    setSubmittingVote(false)
    setMyVoteId(null)
    setPendingVoteId(null)
    changingVoteRef.current = false
  }, [currentQuestionId])

  const roundIndex = game?.round_index

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "gameofwhat").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  // Optional answer timer (off by default, timer_seconds = 0). Ticks locally
  // for the bar; the auto-advance is server-enforced (any client can
  // trigger it, the RPC re-checks the deadline), so it's not reliant on any
  // one specific client staying connected.
  // Stops ticking entirely while paused — that's what freezes the bar
  // animation. gow_pause_game/_resume_game shift answering_started_at
  // forward on resume to absorb the paused duration, so both the bar and
  // the auto-advance deadline resume exactly where they left off.
  // Stops entirely once idle-gated — same as the main realtime connection —
  // so an AFK tab with a round timer still running can't keep silently
  // driving auto-submits/force-advances in the background while the "Still
  // there?" modal is blocking the screen.
  useEffect(() => {
    if (!game?.timer_seconds || game.question_phase !== "answering" || game.paused || isIdle) return
    setNow(Date.now()) // correct immediately on resume instead of waiting for the first tick
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [game?.timer_seconds, game?.question_phase, game?.answering_started_at, game?.paused, isIdle])

  // Primary auto-advance mechanism: each eligible player's own device
  // submits its own (possibly blank) answer the moment ITS local clock
  // crosses the deadline, rather than depending on some other player's tab
  // noticing everyone else is late — that dependency is what made the old
  // "any client can trigger it" design fragile against backgrounded/closed
  // tabs. The question's author never answers their own question, so they
  // sit out this effect entirely, same as the normal submit flow.
  // autoSubmittedKeyRef guards against firing more than once per question:
  // this effect re-runs on every `now` tick (every 250ms) until `answers`'
  // realtime/poll refresh confirms the submission locally, which can take a
  // moment — without this guard, every intervening tick re-sends the RPC.
  // Harmless here since gow_submit_answer upserts, but wasteful, and the
  // same unguarded-repeat pattern caused a real bug in SoClover's
  // board-advance counter (see BUGS.md) — guard it uniformly rather than
  // relying on each RPC happening to be safe.
  const autoSubmittedKeyRef = useRef(null)
  useEffect(() => {
    if (!game?.timer_seconds || game.question_phase !== "answering" || !game.answering_started_at || game.paused || isIdle) return
    if (!currentQuestion || !myPlayerId || myPlayerId === currentQuestion.author_id) return
    const deadline = new Date(game.answering_started_at).getTime() + game.timer_seconds * 1000
    if (now < deadline) return
    if (answers.some(a => a.player_id === myPlayerId)) return
    // Don't auto-submit blank until at least 2 OTHER players have a real
    // (non-skipped) answer in — if the round is mostly empty, waiting a beat
    // longer for a real answer is better than everyone racing to skip each
    // other out. Matches the same threshold enforced server-side in
    // gow_force_advance_answering for the closed-tab fallback path.
    const realOthersCount = answers.filter(a => a.player_id !== myPlayerId && !a.skipped && a.text?.trim()).length
    if (realOthersCount < 2) return
    if (autoSubmittedKeyRef.current === currentQuestion.id) return
    autoSubmittedKeyRef.current = currentQuestion.id
    // Discard whatever's in the field — a force-submit on timeout is always
    // a skipped entry, never "whatever they'd typed so far."
    //
    // NOTE: .rpc() returns a lazy thenable, not a promise — the HTTP request
    // is only sent once it's awaited or .then()'d. A bare `supabase.rpc(...)`
    // statement silently never fires. Always consume the result.
    supabase.rpc("gow_submit_answer", {
      p_code: code,
      p_question_id: currentQuestion.id,
      p_player_id: myPlayerId,
      p_text: "",
      p_skipped: true,
    }).then(({ error }) => { if (error) console.error("[gow] auto-submit failed", error) })
  }, [now, game?.timer_seconds, game?.question_phase, game?.answering_started_at, game?.paused, code, currentQuestion, myPlayerId, answers, isIdle])

  // Fallback safety net: if a player's own tab is fully closed (not just
  // backgrounded), nobody submits on their behalf via the effect above, so
  // once at least one real submission exists past the deadline, any other
  // connected client force-fills the rest and advances. No-ops if zero
  // players have submitted yet.
  useEffect(() => {
    if (!game?.timer_seconds || game.question_phase !== "answering" || !game.answering_started_at || game.paused || isIdle) return
    const deadline = new Date(game.answering_started_at).getTime() + game.timer_seconds * 1000
    if (now < deadline) return
    supabase.rpc("gow_force_advance_answering", { p_code: code }).then(() => {})
  }, [now, game?.timer_seconds, game?.question_phase, game?.answering_started_at, game?.paused, code, isIdle])

  // Keep the settings-panel dropdown in sync with the actually-active timer
  // length (not any staged next_timer_seconds — that only takes effect once
  // the next question actually starts, per gow_stage_timer_seconds).
  useEffect(() => {
    if (game?.timer_seconds != null) setDraftTimerSeconds(game.timer_seconds)
  }, [game?.timer_seconds])

  async function saveTimerSettings() {
    setSavingTimer(true)
    await supabase.rpc("gow_stage_timer_seconds", { p_code: code, p_timer_seconds: draftTimerSeconds })
    setSavingTimer(false)
  }

  const allNextQuestionsIn = game?.phase === "between_rounds" && players.length > 0 && players.every(p => p.question)

  useEffect(() => {
    if (!allNextQuestionsIn) return
    ;(async () => {
      await rpc("gow_start_next_round", { p_code: code })
    })()
  }, [allNextQuestionsIn, code])

  // ── DUMMY GAME AUTOMATION ─────────────────────────────────
  // Disabled: gow_games has no is_dummy signal (see the auto-join effect in
  // app/[code]/page.js for the same underlying gap — the "Dummy Game" button
  // currently just calls the same create flow as a real "Create Game"), so
  // these two effects were pre-filling every real player's answer/question
  // fields unconditionally, in every game. Re-enable, gated on dummy
  // detection, if that's added.

  // Auto-submit bot answers
  useEffect(() => {
    if (!botIdsRef.current.length || game?.question_phase !== "answering" || !currentQuestion) return
    botIdsRef.current.forEach(async botId => {
      if (!players.find(p => p.id === botId)) return
      if (botId === currentQuestion.author_id) return
      if (answers.find(a => a.player_id === botId)) return
      const key = `${currentQuestion.id}-ans-${botId}`
      if (botActionsRef.current.has(key)) return
      botActionsRef.current.add(key)
      await supabase.rpc("gow_submit_answer", {
        p_code: code, p_question_id: currentQuestion.id,
        p_player_id: botId, p_text: pickRandWord(), p_skipped: false,
      })
    })
  }, [currentQuestion?.id, game?.question_phase, answers.length])

  // Auto-vote for bots
  useEffect(() => {
    if (!botIdsRef.current.length || game?.question_phase !== "voting" || !currentQuestion) return
    botIdsRef.current.forEach(async botId => {
      if (!players.find(p => p.id === botId)) return
      if (votes.find(v => v.voter_id === botId)) return
      const key = `${currentQuestion.id}-vote-${botId}`
      if (botActionsRef.current.has(key)) return
      botActionsRef.current.add(key)
      const eligible = answers.filter(a => !a.skipped && a.player_id !== botId)
      const pick = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null
      await supabase.rpc("gow_submit_vote", {
        p_code: code, p_question_id: currentQuestion.id,
        p_voter_id: botId, p_answer_id: pick?.id ?? null,
      })
    })
  }, [currentQuestion?.id, game?.question_phase, answers.length, votes.length])

  // Auto-submit bot round questions
  useEffect(() => {
    if (!botIdsRef.current.length || game?.phase !== "between_rounds") return
    const round = game.round_index
    botIdsRef.current.forEach(async botId => {
      const player = players.find(p => p.id === botId)
      if (!player) return
      if (player.question) return
      const key = `r${round}-q-${botId}`
      if (botActionsRef.current.has(key)) return
      botActionsRef.current.add(key)
      await supabase.from("gow_players").update({ question: pickRandQuestion() }).eq("id", botId)
    })
  }, [roundIndex, game?.phase, players.length])

  // ─────────────────────────────────────────────────────────

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Gossip: broadcast so peers see submission instantly
    syncChRef.current?.send({ type: "broadcast", event: "sync" })
    // Refresh immediately so the acting client's own button resolves right
    // away instead of waiting on its own realtime round-trip.
    await loadState()
  }

  async function submitAnswer() {
    if (!currentQuestion || !myPlayerId) return
    await rpc("gow_submit_answer", {
      p_code: code,
      p_question_id: currentQuestion.id,
      p_player_id: myPlayerId,
      p_text: myAnswer.trim(),
      p_skipped: false,
    })
  }

  async function toggleLike(answerId) {
    if (!currentQuestion || !myPlayerId) return
    const alreadyLiked = likes.some(l => l.answer_id === answerId && l.liker_id === myPlayerId)
    // Optimistic update — flip the icon instantly instead of waiting on the round trip.
    if (alreadyLiked) {
      setLikes(prev => prev.filter(l => !(l.answer_id === answerId && l.liker_id === myPlayerId)))
    } else {
      setLikes(prev => [...prev, { question_id: currentQuestion.id, liker_id: myPlayerId, answer_id: answerId }])
    }
    // No nudge/full reload on success: this fires on every tap, and the
    // write already propagates cheaply via the payload-patched
    // postgres_changes handler. Only resync on failure, to roll back the
    // optimistic update.
    const { error } = await supabase.rpc("gow_toggle_like", {
      p_code: code, p_question_id: currentQuestion.id, p_liker_id: myPlayerId, p_answer_id: answerId,
    })
    if (error) { await loadState(); throw error }
  }

  async function submitVote(answerId) {
    if (!currentQuestion || !myPlayerId || submittingVote) return
    changingVoteRef.current = true
    setSubmittingVote(true)
    setMyVoteId(answerId ?? "nota")
    try {
      await rpc("gow_submit_vote", {
        p_code: code,
        p_question_id: currentQuestion.id,
        p_voter_id: myPlayerId,
        p_answer_id: answerId,
      })
      setSubmittingVote(false)
    } catch (e) {
      setSubmittingVote(false)
      setMyVoteId(null)
      changingVoteRef.current = false
      throw e
    }
  }

  async function confirmVote() {
    if (pendingVoteId === null) return
    await submitVote(pendingVoteId === "nota" ? null : pendingVoteId)
  }

  async function handleAdvanceFromResults() {
    const snapId = resultSnapshot?.questionId
    setResultsAcknowledged(snapId)
    if (game?.question_phase === "results") {
      await rpc("gow_advance_question", { p_code: code })
    }
  }

  async function submitRoundQuestion() {
    const trimmed = roundQuestion.trim()
    if (!trimmed || !myPlayerId) return
    const { error } = await supabase.from("gow_players").update({ question: trimmed }).eq("id", myPlayerId)
    if (error) throw error
    setRoundQuestion("")
    // Keep loadState here - not a phase change, just updating player data
    await loadState()
  }

  async function startNextRound() {
    await rpc("gow_start_next_round", { p_code: code })
  }

  // Must be before early return — Rules of Hooks
  const myAnswerRecordEarly = answers.find(a => a.player_id === myPlayerId)
  const nudgeAnswer = useSubmitNudge(myAnswer, !!myAnswerRecordEarly)
  const nudgeQuestion = useSubmitNudge(roundQuestion, false)
  const bonusMatchNames = useBonusMatch(myAnswerRecordEarly?.text, myPlayerId, answers, players)

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: `rgba(255,255,255,${OPACITY.muted})`, fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.bold }}>Loading…</p>
      </div>
    )
  }

  const me = players.find(p => p.id === myPlayerId)

  async function sendInlinePoke(targetName) {
    if (!me || pokeCooldownActive) return
    setPokeCooldownActive(true)
    setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldownActive(false), 10000)
  }

  const pokeSystemNode = (footer = null) => me ? (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, score: p.score }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onPause={async () => { await supabase.rpc("gow_pause_game", { p_code: code, p_player_id: myPlayerId }) }}
        onResetToLobby={async () => { await rpc("gow_reset_game", { p_code: code }) }}
        settingsContent={<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>Answer timer</span>
            <select
              value={String(draftTimerSeconds)}
              onChange={e => setDraftTimerSeconds(Number(e.target.value))}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 15, fontWeight: 700, padding: "8px 10px", border: "none" }}
            >
              <option value="0">Off</option>
              {[30, 45, 60, 90, 120, 180, 240, 300].map(s => (
                <option key={s} value={String(s)}>{s < 60 ? `${s}s` : `${s / 60} min`}</option>
              ))}
            </select>
          </div>
          {game?.next_timer_seconds != null && game.next_timer_seconds !== game.timer_seconds && (
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", paddingBottom: 10 }}>
              Starts next round: {game.next_timer_seconds === 0 ? "Off" : (game.next_timer_seconds < 60 ? `${game.next_timer_seconds}s` : `${game.next_timer_seconds / 60} min`)}
            </div>
          )}
          <button onClick={saveTimerSettings} disabled={savingTimer}
            style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 20px", width: "100%", marginTop: 6 }}>
            Save
          </button>
        </>}
      />
      {game?.paused && (
        <PauseModal
          colors={POKE_COLORS}
          pausedByName={game.paused_by_name}
          resuming={resuming}
          onResume={async () => {
            setResuming(true)
            await supabase.rpc("gow_resume_game", { p_code: code })
            setResuming(false)
          }}
        />
      )}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footer}
      </Footer>
    </>
  ) : null

  const phase = game.question_phase
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  // Show frozen results if player hasn't acknowledged the last results screen
  const showingResults = !!resultSnapshot && resultSnapshot.questionId !== resultsAcknowledged

  // ── FROZEN / LIVE RESULTS ────────────────────────────────────
  if (showingResults) {
    const snap = resultSnapshot
    const snapQuestion = snap.question
    const snapQuestionAuthor = players.find(p => p.id === snapQuestion?.author_id)
    const snapAnswerGroups = (snap.answers ?? [])
      .filter(a => !a.skipped)
      .reduce((groups, answer) => {
        const key = (answer.text || "").trim().toLowerCase()
        const existing = groups.find(g => g.key === key)
        if (existing) {
          existing.playerIds.push(answer.player_id)
          existing.answerIds.push(answer.id)
          existing.voteCount = Math.max(existing.voteCount, answer.vote_count)
        } else {
          groups.push({ key, primaryId: answer.id, answerIds: [answer.id], text: answer.text, playerIds: [answer.player_id], voteCount: answer.vote_count })
        }
        return groups
      }, [])
    const snapNotaVoters = (snap.votes ?? [])
      .filter(v => v.answer_id === null)
      .map(v => players.find(p => p.id === v.voter_id)?.name)
      .filter(Boolean)
    const snapSkipped = (snap.answers ?? []).filter(a => a.skipped)
    const stillInResults = game.question_phase === "results" && game.current_question_id === snap.questionId
    const btnLabel = game.phase === "finished" ? "Show Winner" : stillInResults ? "Next Question" : "Continue"

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <StatusBar label={`Round ${(game.round_index ?? 0) + 1} of ${game.rounds_total ?? 3}`} dark="#4A123B" />
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px", paddingBottom: BOTTOM_PAD }}>
          <Results
            question={snapQuestion ? { text: snapQuestion.text, authorName: snapQuestionAuthor?.name } : undefined}
            items={[...snapAnswerGroups].sort((a, b) => b.voteCount - a.voteCount).map(g => ({
              id: g.primaryId,
              text: g.text,
              authorNames: g.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean),
              voteCount: g.voteCount,
              voterNames: (snap.votes ?? [])
                .filter(v => v.answer_id && g.answerIds.includes(v.answer_id))
                .map(v => players.find(p => p.id === v.voter_id)?.name)
                .filter(Boolean),
              isBonus: g.playerIds.length > 1,
              likeCount: (snap.likes ?? []).filter(l => g.answerIds.includes(l.answer_id)).length,
            }))}
            notaCount={snapNotaVoters.length}
            skippedNames={snapSkipped.map(a => players.find(p => p.id === a.player_id)?.name).filter(Boolean)}
            scores={[...players].sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, likeCount: scoreLikeTotals[p.id] ?? 0 }))}
            colors={{ card: MID, yellow: YELLOW, dim: WARM_LIGHT }}
          />
        </div>
      </div>
        {pokeSystemNode(
          <FooterButton onClick={handleAdvanceFromResults} style={{ fontSize: 16 }}>
            {btnLabel}
          </FooterButton>
        )}
      </>
    )
  }

  // ── GAME OVER ──────────────────────────────────────────────
  async function resetGame() {
    if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
    const { data, error } = await supabase.rpc("gow_create_replay", { p_code: code })
    if (error) throw error
    syncChRef.current?.send({ type: "broadcast", event: "sync" })
    router.replace(`/${data}`)
  }

  if (game.phase === "finished") {
    const likeTotals = gameOverLikes ?? {}
    const finalPlayers = [...(gameOverPlayers ?? players)].sort((a, b) => b.score - a.score).map(p => ({ ...p, likeCount: likeTotals[p.id] ?? 0 }))
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <EndGame
          players={finalPlayers}
          myPlayerId={myPlayerId}
          onPlayAgain={resetGame}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
        />
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ── BETWEEN ROUNDS ────────────────────────────────────────
  if (game.phase === "between_rounds") {
    const myNextQuestion = me?.question

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", paddingBottom: BOTTOM_PAD }}>
        {game.round_index > 0 && (
          <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.heavy, opacity: OPACITY.moderate, marginBottom: 12 }}>
            Round {game.round_index} complete
          </div>
        )}
        <div style={{ fontSize: "clamp(44px, 12vw, 72px)", fontWeight: FONT_WEIGHT.black, lineHeight: 1, marginBottom: 8, whiteSpace: "nowrap" }}>
          Round {game.round_index + 1}
        </div>
        <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted, marginBottom: 40 }}>
          of {game.rounds_total}
        </div>

        {game.round_index > 0 && (
          <>
            <div style={{ ...STYLE.sectionHeader, marginBottom: 16 }}>
              Scores
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 40 }}>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ background: i === 0 ? YELLOW : WARM_LIGHT, color: i === 0 ? "#000" : "white", fontSize: 24, fontWeight: FONT_WEIGHT.black, minWidth: 56, textAlign: "center", padding: "10px 0" }}>
                    {p.score}
                  </div>
                  <span style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.bold, color: p.id === myPlayerId ? YELLOW : "white" }}>{p.name}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ ...STYLE.sectionHeader, marginBottom: 14 }}>
          Round {game.round_index + 1} Questions
        </div>
        <div style={{ marginBottom: 20 }}>
          <WaitingList
            players={players.map(p => ({ name: p.name, done: !!p.question, typing: typingPlayerIds.has(p.id), away: isAway(p.id) }))}
            myName={me?.name}
            colors={{ mid: "#5C1640" }}
            onPoke={sendInlinePoke}
            cooldownActive={pokeCooldownActive}
            pokeJustSent={pokeJustSent}
          />
        </div>

        {me && !myNextQuestion && (
          <div>
            <TextEntry
              value={roundQuestion}
              onChange={v => setRoundQuestion(v)}
              onTypingChange={onTypingChange}
              onSubmit={submitRoundQuestion}
              placeholder="Write a question for everyone…"
              maxLength={200}
              multiline={false}
              bg={WARM_LIGHT}
              fontSize={20}
            />
            <div style={{ marginTop: 16 }}>
              <RandomIdeas
                key={roundIndex}
                bg={WARM_LIGHT}
                fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
                excludeIdeas={game.used_prompts ?? []}
                onIdea={idea => supabase.from("gow_games")
                  .update({ used_prompts: [...(game.used_prompts ?? []), idea] })
                  .eq("code", code)}
              />
            </div>
          </div>
        )}

        {me && myNextQuestion && !allNextQuestionsIn && (
          <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted }}>
            Your question is in. Waiting for others…
          </div>
        )}

        {allNextQuestionsIn && (
          <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted }}>
            All questions in. Starting round…
          </div>
        )}

        </div>
      </div>
        {pokeSystemNode(me && !myNextQuestion && !allNextQuestionsIn ? (
          <FooterButton
            disabled={!roundQuestion.trim()}
            nudge={nudgeQuestion}
            onClick={submitRoundQuestion}
            style={{ fontSize: 16 }}
          >
            Submit Question
          </FooterButton>
        ) : null)}
      </>
    )
  }

  // ── PLAY ──────────────────────────────────────────────────
  const questionAuthor = players.find(p => p.id === currentQuestion?.author_id)
  const isQuestionAuthor = myPlayerId === currentQuestion?.author_id
  const myAnswerRecord = answers.find(a => a.player_id === myPlayerId)
  const hasSubmittedAnswer = !!myAnswerRecord
  const hasSkipped = myAnswerRecord?.skipped
  const eligibleAnswerers = players.filter(p => p.id !== currentQuestion?.author_id)
  const waitingOnPlayers = eligibleAnswerers.filter(p => !answers.some(a => a.player_id === p.id))

  const answerGroups = answers
    .filter(a => !a.skipped)
    .reduce((groups, answer) => {
      const key = (answer.text || "").trim().toLowerCase()
      const existing = groups.find(g => g.key === key)
      if (existing) {
        existing.playerIds.push(answer.player_id)
        existing.answerIds.push(answer.id)
        existing.voteCount = Math.max(existing.voteCount, answer.vote_count)
      } else {
        groups.push({ key, primaryId: answer.id, answerIds: [answer.id], text: answer.text, playerIds: [answer.player_id], voteCount: answer.vote_count })
      }
      return groups
    }, [])

  const likeCountsById = Object.fromEntries(answerGroups.map(g => [g.primaryId, likes.filter(l => l.answer_id === g.primaryId).length]))
  const myLikedAnswerIds = likes.filter(l => l.liker_id === myPlayerId).map(l => l.answer_id)

  const eligibleVoterIds = Array.from(new Set(
    [currentQuestion?.author_id, ...answers.filter(a => !a.skipped).map(a => a.player_id)].filter(Boolean)
  ))
  const votedPlayerIds = new Set(votes.map(v => v.voter_id))
  const notaVoters = votes.filter(v => v.answer_id === null).map(v => players.find(p => p.id === v.voter_id)?.name).filter(Boolean)

  let answerFooterAction = null
  if (phase === "answering" && !isQuestionAuthor && !hasSubmittedAnswer) {
    answerFooterAction = (
      <FooterButton
        key={currentQuestion?.id}
        nudge={nudgeAnswer}
        disabled={!myAnswer.trim()}
        onClick={submitAnswer}
      >
        Submit Answer
      </FooterButton>
    )
  } else if (phase === "voting" && !myVoteId) {
    answerFooterAction = (
      <FooterButton
        key={`vote-${currentQuestion?.id}`}
        disabled={pendingVoteId === null}
        onClick={confirmVote}
      >
        Vote
      </FooterButton>
    )
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>

      <StatusBar label={`Round ${(game.round_index ?? 0) + 1} of ${game.rounds_total ?? 3}`} dark="#4A123B" />

      {/* Optional answer timer — edge-to-edge depleting bar, same pattern as HearingVoices */}
      {!!game.timer_seconds && phase === "answering" && game.answering_started_at && (() => {
        const clockMs = game.paused && game.paused_at ? new Date(game.paused_at).getTime() : now
        const elapsedSec = (clockMs - new Date(game.answering_started_at).getTime()) / 1000
        const barFrac = Math.max(0, Math.min(1, 1 - elapsedSec / game.timer_seconds))
        return (
          <div style={{ flexShrink: 0, height: 10, background: barFrac > 0.3 ? "rgba(251, 223, 84, 0.15)" : "hsla(0, 80%, 55%, 0.15)" }}>
            <div style={{
              height: "100%",
              width: `${barFrac * 100}%`,
              background: barFrac > 0.3 ? "#FBDF54" : "hsl(0, 80%, 55%)",
              transition: "width 0.2s linear, background 300ms ease",
            }} />
          </div>
        )
      })()}

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "28px 20px", paddingBottom: BOTTOM_PAD }}>

        {/* Question */}
        {currentQuestion && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...STYLE.sectionHeader, marginBottom: 10 }}>
              {questionAuthor ? `${questionAuthor.name}'s question` : "Question"}
            </div>
            <div style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: FONT_WEIGHT.heavy, lineHeight: 1.25 }}>
              {currentQuestion.text}
            </div>
          </div>
        )}

        {/* ANSWERING PHASE */}
        {phase === "answering" && (
          <>
            {isQuestionAuthor ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted, marginBottom: 20 }}>
                  This is your question — sit back while others answer.
                </div>
                <WaitingList
                  players={eligibleAnswerers.map(p => ({ name: p.name, done: answers.some(a => a.player_id === p.id), typing: typingPlayerIds.has(p.id), away: isAway(p.id) }))}
                  myName={me?.name}
                  colors={{ mid: WARM_LIGHT }}
                  onPoke={sendInlinePoke}
                  cooldownActive={pokeCooldownActive}
                  pokeJustSent={pokeJustSent}
                  showCount={false}
                />
              </div>
            ) : hasSubmittedAnswer ? (
              <div>
                {bonusMatchNames.length > 0 && (
                  <div style={{ background: "#FBDF54", color: "#000", padding: "10px 16px", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, marginBottom: 12 }}>
                    Same answer as {formatMatchNames(bonusMatchNames)} · +1 bonus
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted, marginBottom: 20 }}>
                  Your answer: <span style={{ opacity: OPACITY.full, color: "white" }}>{hasSkipped ? "(skipped)" : myAnswerRecord?.text}</span>
                </div>
                <WaitingList
                  players={eligibleAnswerers.map(p => ({ name: p.name, done: answers.some(a => a.player_id === p.id), typing: typingPlayerIds.has(p.id), away: isAway(p.id) }))}
                  myName={me?.name}
                  colors={{ mid: WARM_LIGHT }}
                  onPoke={sendInlinePoke}
                  cooldownActive={pokeCooldownActive}
                  pokeJustSent={pokeJustSent}
                  showCount={false}
                />
              </div>
            ) : (
              <div>
                <TextEntry
                  value={myAnswer}
                  onChange={v => setMyAnswer(v)}
                  onTypingChange={onTypingChange}
                  placeholder="Your answer…"
                  maxLength={300}
                  rows={3}
                  bg={WARM_LIGHT}
                  fontSize={20}
                  style={{ marginBottom: 8 }}
                />
                <RandomIdeas
                  key={currentQuestionId}
                  bg={WARM_LIGHT}
                  fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
                  excludeIdeas={game.used_prompts ?? []}
                  onIdea={idea => supabase.from("gow_games")
                    .update({ used_prompts: [...(game.used_prompts ?? []), idea] })
                    .eq("code", code)}
                />
              </div>
            )}
          </>
        )}

        {/* VOTING PHASE */}
        {phase === "voting" && (
          <>
            <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.muted, marginBottom: 16 }}>
              {myVoteId ? "Vote submitted — waiting for others:" : "Vote for your favorite:"}
            </div>
            <div style={{ marginBottom: 24 }}>
              <Selections
                options={answerGroups.map(g => ({ id: g.primaryId, text: g.text, isMine: g.playerIds.includes(myPlayerId) }))}
                selectedId={myVoteId ? (answerGroups.find(g => g.answerIds.includes(myVoteId))?.primaryId ?? null) : pendingVoteId}
                onSelect={id => setPendingVoteId(id)}
                onDeselect={() => setPendingVoteId(null)}
                disabled={!!myVoteId || submittingVote}
                colors={{ bg: MID, selectedBg: YELLOW, selectedText: "#000", deselectBg: DARK, deselectText: YELLOW }}
                showLikes
                likeCounts={likeCountsById}
                likedIds={myLikedAnswerIds}
                onToggleLike={toggleLike}
              />
              {/* None of the above */}
              {(() => {
                const isNotaSelected = myVoteId ? myVoteId === "nota" : pendingVoteId === "nota"
                const locked = !!myVoteId
                return (
                  <div style={{ display: "flex", alignItems: "stretch", marginTop: 10 }}>
                    <button
                      onClick={() => { if (!locked) setPendingVoteId(isNotaSelected ? null : "nota") }}
                      disabled={locked}
                      style={{
                        flex: 1,
                        background: isNotaSelected ? YELLOW : WARM_LIGHT,
                        color: isNotaSelected ? "#000" : "rgba(255,255,255,0.5)",
                        fontSize: 15, fontWeight: FONT_WEIGHT.bold, padding: "16px 20px",
                        textAlign: "left", display: "block",
                        opacity: locked && !isNotaSelected ? 0.45 : 1,
                      }}
                    >
                      None of the above
                    </button>
                  </div>
                )
              })()}
            </div>

            {/* Who has voted */}
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: FONT_SIZE.eyebrow, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 10 }}>
                Votes in
              </div>
              <WaitingList
                players={eligibleVoterIds.map(pid => {
                  const p = players.find(x => x.id === pid)
                  return { name: p?.name ?? "", done: votedPlayerIds.has(pid), typing: typingPlayerIds.has(pid), away: isAway(pid) }
                })}
                myName={me?.name}
                colors={{ mid: MID }}
                onPoke={sendInlinePoke}
                cooldownActive={pokeCooldownActive}
                pokeJustSent={pokeJustSent}
                showCount={false}
              />
            </div>
          </>
        )}


      </div>
    </div>
      {pokeSystemNode(answerFooterAction)}
    </>
  )
}
