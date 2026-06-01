"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import GameModal from "../../../components/GameModal"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import useTypingPresence from "../../../lib/useTypingPresence"
import FooterButton from "../../../components/FooterButton"
import WaitingList from "../../../components/WaitingList"
import TextEntry from "../../../components/TextEntry"
import Selections from "../../../components/Selections"
import RandomIdeas from "../../../components/RandomIdeas"
import StatusBar from "../../../components/StatusBar"
import Results from "../../../components/Results"
import EndGame from "../../../components/EndGame"
import { playYourTurn } from "../../../lib/sounds"

const BG = "#6B1A44"
const YELLOW = "#FBDF54"
const GREEN = "#12BAAA"
const RED = "#F04F52"
const WARM_LIGHT = "#821F42"
const CARD_BG = WARM_LIGHT



const POKE_COLORS = { dark: "#4A123B", mid: "#5C1640", wl: "#821F42", yellow: "#FBDF54", notifBg: "#300A20" }
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


export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [myPlayerId, setMyPlayerId] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState([])
  const [myAnswer, setMyAnswer] = useState("")
  const [myVoteId, setMyVoteId] = useState(null)
  const [submittingVote, setSubmittingVote] = useState(false)
  const changingVoteRef = useRef(false)
  const botIdsRef = useRef([])
  const botActionsRef = useRef(new Set())
  const soundTriggerRef = useRef(null)
  const [resultSnapshot, setResultSnapshot] = useState(null)
  const [resultsAcknowledged, setResultsAcknowledged] = useState(null)
  const lastFetchedResultsIdRef = useRef(null)
  const [roundQuestion, setRoundQuestion] = useState("")
  const [gameOverPlayers, setGameOverPlayers] = useState(null)
  const [showGameModal, setShowGameModal] = useState(false)
  const [bonusMatchName, setBonusMatchName] = useState(null)
  const [instructions, setInstructions] = useState("")
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { onTypingChange, typingPlayerIds } = useTypingPresence("gow", code, myPlayerId)

  useEffect(() => {
    if (!game || !myPlayerId) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playYourTurn()
  }, [game?.phase])

  useEffect(() => {
    if (!game?.next_game) return
    window.location.href = `https://${game.next_game}.jackbrannen.com/`
  }, [game?.next_game])

  useEffect(() => {
    const existing = localStorage.getItem(`gow:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    // Clear any stale bot IDs from previous sessions — bot feature removed
    localStorage.removeItem(`gow:${code}:botIds`)
    botIdsRef.current = []
  }, [code])

  async function loadState() {
    const { data: gameData } = await supabase
      .from("gow_games")
      .select("code,phase,round_index,rounds_total,current_question_id,question_phase,used_prompts,next_game,last_completed_question_id")
      .eq("code", code)
      .single()
    if (!gameData) return

    if (gameData.phase === "lobby") { router.replace(`/${code}`); return }

    const { data: playerData } = await supabase
      .from("gow_players")
      .select("id,name,first_name,score,question,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    setGame(gameData)
    setPlayers(playerData ?? [])
    if (gameData.phase === "finished") setGameOverPlayers(p => p ?? playerData ?? [])

    if (gameData.current_question_id) {
      const { data: qData } = await supabase
        .from("gow_questions")
        .select("id,text,author_id")
        .eq("id", gameData.current_question_id)
        .single()
      setCurrentQuestion(qData ?? null)

      const { data: answerData } = await supabase
        .from("gow_answers")
        .select("id,text,player_id,vote_count,skipped")
        .eq("question_id", gameData.current_question_id)
        .order("random_order", { ascending: true })
      setAnswers(answerData ?? [])

      const pid = myPlayerId || localStorage.getItem(`gow:${code}:playerId`)
      if (pid) {
        const { data: voteData } = await supabase
          .from("gow_votes")
          .select("answer_id,voter_id")
          .eq("question_id", gameData.current_question_id)
        setVotes(voteData ?? [])
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
          })
        } else if (
          gameData.last_completed_question_id &&
          lastFetchedResultsIdRef.current !== gameData.last_completed_question_id
        ) {
          lastFetchedResultsIdRef.current = gameData.last_completed_question_id
          const [{ data: lqData }, { data: laData }, { data: lvData }] = await Promise.all([
            supabase.from("gow_questions").select("id,text,author_id").eq("id", gameData.last_completed_question_id).single(),
            supabase.from("gow_answers").select("id,text,player_id,vote_count,skipped").eq("question_id", gameData.last_completed_question_id).order("random_order", { ascending: true }),
            supabase.from("gow_votes").select("answer_id,voter_id").eq("question_id", gameData.last_completed_question_id),
          ])
          setResultSnapshot({ questionId: gameData.last_completed_question_id, question: lqData, answers: laData ?? [], votes: lvData ?? [] })
        }
      }
    } else {
      setCurrentQuestion(null)
      setAnswers([])
      setVotes([])
    }
  }

  useEffect(() => {
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`gow-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_answers" }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "gow_votes" }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  const currentQuestionId = currentQuestion?.id
  useEffect(() => {
    setMyAnswer("")
    setSubmittingVote(false)
    setMyVoteId(null)
    changingVoteRef.current = false
  }, [currentQuestionId])

  const roundIndex = game?.round_index

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "gameofwhat").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  const allNextQuestionsIn = game?.phase === "between_rounds" && players.length > 0 && players.every(p => p.question)

  useEffect(() => {
    if (!allNextQuestionsIn) return
    ;(async () => {
      await supabase.rpc("gow_start_next_round", { p_code: code })
      await loadState()
    })()
  }, [allNextQuestionsIn, code])

  // ── DUMMY GAME AUTOMATION ─────────────────────────────────

  // Pre-fill answer field
  useEffect(() => {
    if (game?.question_phase !== "answering" || !currentQuestion) return
    const pid = myPlayerId || localStorage.getItem(`gow:${code}:playerId`)
    if (!pid || pid === currentQuestion.author_id) return
    setMyAnswer(prev => prev || pickRandWord())
  }, [currentQuestion?.id, game?.question_phase, myPlayerId])

  // Pre-fill round question field
  useEffect(() => {
    if (game?.phase !== "between_rounds") return
    setRoundQuestion(prev => prev || pickRandQuestion())
  }, [roundIndex, game?.phase])

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

  async function submitAnswer() {
    if (!currentQuestion || !myPlayerId) return
    const { error } = await supabase.rpc("gow_submit_answer", {
      p_code: code,
      p_question_id: currentQuestion.id,
      p_player_id: myPlayerId,
      p_text: myAnswer.trim(),
      p_skipped: false,
    })
    if (error) throw error
    if (myAnswer.trim()) {
      const myText = myAnswer.trim().toLowerCase()
      const { data: freshAnswers } = await supabase
        .from("gow_answers").select("player_id,text")
        .eq("question_id", currentQuestion.id).eq("skipped", false)
      const match = freshAnswers?.find(a => a.player_id !== myPlayerId && a.text?.trim().toLowerCase() === myText)
      if (match) {
        const matchPlayer = players.find(p => p.id === match.player_id)
        setBonusMatchName(matchPlayer?.name || "someone")
        setTimeout(() => setBonusMatchName(null), 4000)
      }
    }
    await loadState()
  }

  async function handleDeselect() {
    changingVoteRef.current = true
    setMyVoteId(null)
    if (currentQuestion && myPlayerId) {
      await supabase.rpc("gow_retract_vote", {
        p_code: code,
        p_question_id: currentQuestion.id,
        p_voter_id: myPlayerId,
      })
    }
    changingVoteRef.current = false
  }

  async function submitVote(answerId) {
    if (!currentQuestion || !myPlayerId || submittingVote) return
    changingVoteRef.current = true
    setSubmittingVote(true)
    setMyVoteId(answerId ?? "nota")
    const { error } = await supabase.rpc("gow_submit_vote", {
      p_code: code,
      p_question_id: currentQuestion.id,
      p_voter_id: myPlayerId,
      p_answer_id: answerId,
    })
    if (error) { setSubmittingVote(false); changingVoteRef.current = false; return }
    await loadState()
    changingVoteRef.current = false
  }

  async function handleAdvanceFromResults() {
    const snapId = resultSnapshot?.questionId
    setResultsAcknowledged(snapId)
    if (game?.question_phase === "results") {
      await supabase.rpc("gow_advance_question", { p_code: code })
    }
    await loadState()
  }

  async function submitRoundQuestion() {
    const trimmed = roundQuestion.trim()
    if (!trimmed || !myPlayerId) return
    const { error } = await supabase.from("gow_players").update({ question: trimmed }).eq("id", myPlayerId)
    if (error) throw error
    setRoundQuestion("")
    await loadState()
  }

  async function startNextRound() {
    await supabase.rpc("gow_start_next_round", { p_code: code })
    await loadState()
  }

  // Must be before early return — Rules of Hooks
  const myAnswerRecordEarly = answers.find(a => a.player_id === myPlayerId)
  const nudgeAnswer = useSubmitNudge(myAnswer, !!myAnswerRecordEarly)
  const nudgeQuestion = useSubmitNudge(roundQuestion, false)

  if (!game) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
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
        onResetToLobby={async () => { await supabase.rpc("gow_reset_game", { p_code: code }) }}
      />
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
              isBonus: g.playerIds.length > 1,
            }))}
            notaCount={snapNotaVoters.length}
            skippedNames={snapSkipped.map(a => players.find(p => p.id === a.player_id)?.name).filter(Boolean)}
            scores={[...players].sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score }))}
            colors={{ card: CARD_BG, yellow: YELLOW, dim: WARM_LIGHT }}
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
    await supabase.rpc("gow_reset_game", { p_code: code })
  }

  async function pickNextGame(gameSub) {
    await supabase.from("gow_games").update({ next_game: gameSub }).eq("code", code)
  }

  if (game.phase === "finished") {
    const finalPlayers = [...(gameOverPlayers ?? players)].sort((a, b) => b.score - a.score)
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <EndGame
          players={finalPlayers}
          myPlayerId={myPlayerId}
          onPlayAgain={resetGame}
          onPlayAnotherGame={() => setShowGameModal(true)}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
        />
      </div>
        {pokeSystemNode()}
      {showGameModal && (
        <GameModal
          onClose={() => setShowGameModal(false)}
          onSelect={sub => pickNextGame(sub)}
          currentSub="gameofwhat"
        />
      )}
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
          <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.75, marginBottom: 12 }}>
            Round {game.round_index} complete
          </div>
        )}
        <div style={{ fontSize: "clamp(44px, 12vw, 72px)", fontWeight: 900, lineHeight: 1, marginBottom: 8, whiteSpace: "nowrap" }}>
          Round {game.round_index + 1}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.65, marginBottom: 40 }}>
          of {game.rounds_total}
        </div>

        {game.round_index > 0 && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
              Scores
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 40 }}>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ background: i === 0 ? YELLOW : WARM_LIGHT, color: i === 0 ? "#000" : "white", fontSize: 24, fontWeight: 900, minWidth: 56, textAlign: "center", padding: "10px 0" }}>
                    {p.score}
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: p.id === myPlayerId ? YELLOW : "white" }}>{p.name}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
          Round {game.round_index + 1} Questions
        </div>
        <div style={{ marginBottom: 20 }}>
          <WaitingList
            players={players.map(p => ({ name: p.name, done: !!p.question, typing: typingPlayerIds.has(p.id) }))}
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
                playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
                onDraw={ideas => supabase.from("gow_games")
                  .update({ used_prompts: [...(game.used_prompts ?? []), ...ideas] })
                  .eq("code", code)}
              />
            </div>
          </div>
        )}

        {me && myNextQuestion && !allNextQuestionsIn && (
          <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.65 }}>
            Your question is in. Waiting for others…
          </div>
        )}

        {allNextQuestionsIn && (
          <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.65 }}>
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
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>

      <StatusBar label={`Round ${(game.round_index ?? 0) + 1} of ${game.rounds_total ?? 3}`} dark="#4A123B" />

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "28px 20px", paddingBottom: BOTTOM_PAD }}>

        {/* Question */}
        {currentQuestion && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
              {questionAuthor ? `${questionAuthor.name}'s question` : "Question"}
            </div>
            <div style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, lineHeight: 1.25 }}>
              {currentQuestion.text}
            </div>
          </div>
        )}

        {/* ANSWERING PHASE */}
        {phase === "answering" && (
          <>
            {isQuestionAuthor ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, opacity: 0.65, marginBottom: 20 }}>
                  This is your question — sit back while others answer.
                </div>
                <WaitingList
                  players={eligibleAnswerers.map(p => ({ name: p.name, done: answers.some(a => a.player_id === p.id), typing: typingPlayerIds.has(p.id) }))}
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
                {bonusMatchName && (
                  <div style={{ background: "#FBDF54", color: "#000", padding: "10px 16px", fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                    Same answer as {bonusMatchName}! +1 bonus
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, opacity: 0.65, marginBottom: 20 }}>
                  Your answer: <span style={{ opacity: 1, color: "white" }}>{hasSkipped ? "(skipped)" : myAnswerRecord?.text}</span>
                </div>
                <WaitingList
                  players={eligibleAnswerers.map(p => ({ name: p.name, done: answers.some(a => a.player_id === p.id), typing: typingPlayerIds.has(p.id) }))}
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
              </div>
            )}
          </>
        )}

        {/* VOTING PHASE */}
        {phase === "voting" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65, marginBottom: 16 }}>
              {myVoteId ? "Vote cast — tap ✕ to change:" : "Vote for your favorite:"}
            </div>
            <div style={{ marginBottom: 24 }}>
              <Selections
                options={answerGroups.map(g => ({ id: g.primaryId, text: g.text, isMine: g.playerIds.includes(myPlayerId) }))}
                selectedId={answerGroups.find(g => g.answerIds.includes(myVoteId))?.primaryId ?? null}
                onSelect={id => submitVote(id)}
                onDeselect={handleDeselect}
                disabled={submittingVote}
                colors={{ bg: CARD_BG, selectedBg: YELLOW, selectedText: "#000", deselectBg: "#4A123B", deselectText: YELLOW }}
              />
              {/* None of the above */}
              {(() => {
                const isNota = myVoteId === "nota"
                const canVoteNota = !myVoteId || changingVoteRef.current
                return (
                  <div style={{ display: "flex", alignItems: "stretch", marginTop: 10 }}>
                    <button
                      onClick={() => { if (canVoteNota && !isNota) submitVote(null) }}
                      disabled={submittingVote || isNota}
                      style={{
                        flex: 1,
                        background: isNota ? YELLOW : WARM_LIGHT,
                        color: isNota ? "#000" : "rgba(255,255,255,0.5)",
                        fontSize: 15, fontWeight: 700, padding: "16px 20px",
                        textAlign: "left", display: "block",
                        opacity: myVoteId && !isNota && !changingVoteRef.current ? 0.45 : 1,
                      }}
                    >
                      None of the above
                    </button>
                    {isNota && (
                      <button
                        onClick={handleDeselect}
                        disabled={submittingVote}
                        style={{ background: "#4A123B", color: YELLOW, fontSize: 22, fontWeight: 900, padding: "16px 24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Who has voted */}
            <WaitingList
              players={eligibleVoterIds.map(pid => {
                const p = players.find(x => x.id === pid)
                return { name: p?.name ?? "", done: votedPlayerIds.has(pid), typing: typingPlayerIds.has(pid) }
              })}
              myName={me?.name}
              colors={{ mid: WARM_LIGHT }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
              showCount={false}
            />
          </>
        )}

        {/* Scores — answering/voting only */}
        {(phase === "answering" || phase === "voting") && (
          <div style={{ marginTop: "auto", paddingTop: 32 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>
              Scores
            </div>
            {sortedPlayers.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                <div style={{ background: WARM_LIGHT, fontSize: 18, fontWeight: 900, minWidth: 40, textAlign: "center", padding: "4px 0", color: "white" }}>
                  {p.score}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: p.id === myPlayerId ? YELLOW : "white" }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
      {pokeSystemNode(answerFooterAction)}
    </>
  )
}
