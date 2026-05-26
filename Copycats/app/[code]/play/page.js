"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import PokeSystem, { FOOTER_H } from "../../../components/PokeSystem"
import GameModal from "../../../components/GameModal"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"

const BG         = "#5C2D8C"
const YELLOW     = "#FBDF54"
const DARK       = "#3D1A70"
const MID        = "#4A228C"
const WARM_LIGHT = "#7A3AAA"
const GREEN      = "#12BAAA"

// ─── helpers ────────────────────────────────────────────────────────────────

function seededShuffle(arr, seed) {
  const items = [...arr]
  let s = seed >>> 0
  for (let i = items.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function codeSeed(code, round) {
  let h = (round * 2654435761) >>> 0
  for (let i = 0; i < code.length; i++) {
    h = (Math.imul(h, 31) + code.charCodeAt(i)) >>> 0
  }
  return h
}

function Section({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function TopBar({ children }) {
  return (
    <div style={{ background: DARK, padding: "12px 20px", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
      {children}
    </div>
  )
}

function BigQuestion({ question }) {
  return (
    <div style={{ background: MID, padding: "20px 20px", borderLeft: `4px solid ${YELLOW}` }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: "white", lineHeight: 1.4 }}>
        "{question}"
      </p>
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, loading, label, loadingLabel, nudge }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "20px", width: "100%", animation: nudge ? "nudgePulse 1.0s ease-in-out infinite" : "none" }}
    >
      {loading ? loadingLabel : label}
    </button>
  )
}

function SecondaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: WARM_LIGHT, color: "white", fontSize: 18, fontWeight: 700, padding: "16px", width: "100%", ...style }}
    >
      {children}
    </button>
  )
}

function AnswerTextarea({ value, onChange, placeholder, disabled }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      style={{
        background: WARM_LIGHT,
        color: "white",
        fontSize: 18,
        fontWeight: 500,
        padding: "16px 18px",
        width: "100%",
        resize: "none",
        lineHeight: 1.5,
      }}
    />
  )
}

function WaitingList({ players, doneIds, myPlayerId, onPoke, doneLabel = "Ready", waitLabel = "Writing…", typingPlayerIds, pokeCooldownActive, pokeJustSent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {players.map(p => {
        const done = doneIds.includes(p.id)
        const isMe = p.id === myPlayerId
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: MID, padding: "12px 16px" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: done ? GREEN : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>
              {p.name}
              {isMe && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
              {!done && typingPlayerIds?.has(p.id) && <span style={{ fontSize: 14, marginLeft: 6 }}>💬</span>}
            </span>
            {!done && !isMe && onPoke ? (
              pokeJustSent === p.name ? (
                <span style={{ fontSize: 18, color: GREEN, fontWeight: 700 }}>✓</span>
              ) : !pokeCooldownActive ? (
                <button onClick={() => onPoke(p.name)} style={{ background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 20, padding: "0 4px", lineHeight: 1 }}>👉</button>
              ) : null
            ) : (
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{done ? doneLabel : waitLabel}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── main ───────────────────────────────────────────────────────────────────


const POKE_COLORS = { dark: "#3D1A70", mid: "#4A228C", wl: "#7A3AAA", yellow: "#FBDF54", notifBg: "#2D1050" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function PlayPage({ params }) {
  const code = params.code
  const router = useRouter()

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState([])
  const [myId, setMyId] = useState(null)

  // question writing
  const [myQuestion, setMyQuestion] = useState("")
  const [questionLoading, setQuestionLoading] = useState(false)

  // answering
  const [myAnswer, setMyAnswer] = useState("")
  const [answerLoading, setAnswerLoading] = useState(false)
  const [answerError, setAnswerError] = useState("")

  // voting
  const [selectedVote, setSelectedVote] = useState(null)
  const [voteLoading, setVoteLoading] = useState(false)

  // results ready-up
  const [readyLoading, setReadyLoading] = useState(false)

  const channelRef = useRef(null)
  const typingTimerRef = useRef(null)
  const [presenceState, setPresenceState] = useState({})
  const [showGameModal, setShowGameModal] = useState(false)
  const [bonusMatchName, setBonusMatchName] = useState(null)

  useEffect(() => {
    const id = localStorage.getItem(`cc:${code}:playerId`)
    if (id) setMyId(id)
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`cc-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_answers", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_votes", filter: `game_code=eq.${code}` }, loadState)
      .on("presence", { event: "sync" }, () => setPresenceState({ ...channel.presenceState() }))
      .subscribe(async status => {
        if (status === "SUBSCRIBED" && myId) {
          await channel.track({ playerId: myId, typing: false })
        }
      })
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (!game?.next_game) return
    window.location.href = `https://${game.next_game}.jackbrannen.com/`
  }, [game?.next_game])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "copycats").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  // Reset per-round input state when round advances
  useEffect(() => {
    setMyAnswer("")
    setAnswerLoading(false)
    setAnswerError("")
    setSelectedVote(null)
    setVoteLoading(false)
    setReadyLoading(false)
  }, [game?.current_round])

  async function loadState() {
    const [{ data: g }, { data: ps }, { data: an }, { data: vs }] = await Promise.all([
      supabase.from("cc_games").select("*").eq("code", code).single(),
      supabase.from("cc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("cc_answers").select("*").eq("game_code", code),
      supabase.from("cc_votes").select("*").eq("game_code", code),
    ])
    if (!g) { router.push(`/${code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g)
    setPlayers(ps ?? [])
    setAnswers(an ?? [])
    setVotes(vs ?? [])
  }

  function trackTyping() {
    if (!channelRef.current || !myId) return
    channelRef.current.track({ playerId: myId, typing: true })
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      if (channelRef.current) channelRef.current.track({ playerId: myId, typing: false })
    }, 3000)
  }

  const typingPlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.typing && p.playerId !== myId).map(p => p.playerId)
    )
  )

  // Must be declared before early returns — Rules of Hooks
  const myAnswerRowEarly = answers.find(a => a.player_id === myId && a.round === game?.current_round)
  const nudgeAnswer = useSubmitNudge(myAnswer, !!myAnswerRowEarly)
  const [instructions, setInstructions] = useState("")
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)

  if (!game || !myId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
      </div>
    )
  }

  const me = players.find(p => p.id === myId)

  async function sendInlinePoke(targetName) {
    if (!me || pokeCooldownActive) return
    setPokeCooldownActive(true)
    setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldownActive(false), 10000)
  }

  // ── PokeSystem (always mounted for notifications) ──────────────────────────
  const pokeSystemNode = (footer = null) => me ? (
    <PokeSystem
      colors={POKE_COLORS}
      roomCode={code}
      currentPlayer={me.name}
      allPlayers={players.map(p => p.name)}
      playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
      gamePhase={game?.phase}
      rules={instructions ? [["How to Play", instructions]] : null}
      onResetToLobby={async () => { await supabase.rpc("cc_reset_to_lobby", { p_code: code }) }}
    >{footer}</PokeSystem>
  ) : null

  if (!me) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  const { phase, current_round, player_order, ready_player_ids } = game
  const roundTarget = players.find(p => p.id === player_order?.[current_round])
  const roundQuestioner = players.find(p => p.target_id === roundTarget?.id)
  const iAmTarget = roundTarget?.id === myId
  const roundQuestion = roundQuestioner?.question ?? ""

  const roundAnswers = answers.filter(a => a.round === current_round)
  const roundVotes = votes.filter(v => v.round === current_round)

  const myAnswerRow = roundAnswers.find(a => a.player_id === myId)
  const myVoteRow = roundVotes.find(v => v.voter_id === myId)

  // Deterministic shuffle — same order on all clients for the same round
  const shuffled = roundAnswers.length > 0
    ? seededShuffle(roundAnswers, codeSeed(code, current_round))
    : roundAnswers

  // ─── phase: question_writing ────────────────────────────────────────────

  if (phase === "question_writing") {
    const myTarget = players.find(p => p.id === me.target_id)
    const submittedIds = players.filter(p => p.questions_submitted).map(p => p.id)
    const iSubmitted = me.questions_submitted

    if (iSubmitted) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Write Your Questions</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Question submitted!</p>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Waiting for everyone else…</p>
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={players} doneIds={submittedIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
      )
    }

    async function submitQuestion() {
      if (questionLoading || !myQuestion.trim()) return
      setQuestionLoading(true)
      const { error } = await supabase.rpc("cc_submit_question", {
        p_code: code,
        p_player_id: myId,
        p_question: myQuestion.trim(),
      })
      if (error) { setQuestionLoading(false) }
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Write Your Questions</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>
              You're asking {myTarget?.name ?? "…"}.
            </p>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Write a personal question for them — something with a specific answer. Everyone else will try to fake their response.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnswerTextarea
              value={myQuestion}
              onChange={v => { setMyQuestion(v); trackTyping() }}
              placeholder={`Your question for ${myTarget?.name ?? "them"}…`}
            />
            <PrimaryBtn
              onClick={submitQuestion}
              loading={questionLoading}
              disabled={!myQuestion.trim()}
              label="Submit Question"
              loadingLabel="Submitting…"
            />
          </div>

          <Section label="Waiting for everyone…">
            <WaitingList players={players} doneIds={submittedIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
          </Section>
        </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ─── phase: answering ────────────────────────────────────────────────────

  if (phase === "answering") {
    const answeredIds = roundAnswers.map(a => a.player_id)

    async function submitAnswer() {
      if (answerLoading || !myAnswer.trim()) return
      setAnswerLoading(true)
      setAnswerError("")
      const myText = myAnswer.trim().toLowerCase()
      const { error } = await supabase.rpc("cc_submit_answer", {
        p_code: code,
        p_player_id: myId,
        p_round: current_round,
        p_answer: myAnswer.trim(),
      })
      if (error) {
        setAnswerError(error.message || "Something went wrong.")
        setAnswerLoading(false)
        return
      }
      const { data: freshAnswers } = await supabase
        .from("cc_answers").select("player_id,answer")
        .eq("game_code", code).eq("round", current_round)
      const match = freshAnswers?.find(a => a.player_id !== myId && a.answer?.trim().toLowerCase() === myText)
      if (match) {
        const matchPlayer = players.find(p => p.id === match.player_id)
        setBonusMatchName(matchPlayer?.name || "someone")
        setTimeout(() => setBonusMatchName(null), 4000)
      }
    }

    // Target already submitted — show incoming answers live
    if (iAmTarget && myAnswerRow) {
      const incomingAnswers = roundAnswers.filter(a => a.player_id !== myId)
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
                {roundQuestioner?.name} asked you…
              </p>
              <BigQuestion question={roundQuestion} />
            </div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Watch the answers come in. Stay quiet for now!
            </p>
            {incomingAnswers.length > 0 && (
              <Section label={`Answers so far (${incomingAnswers.length})`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {incomingAnswers.map((a, i) => (
                    <div key={a.player_id} style={{ background: MID, padding: "12px 16px", fontSize: 16, color: "white" }}>
                      {a.answer}
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <Section label="Waiting for…">
              <WaitingList players={players} doneIds={answeredIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    // Non-target already submitted — answers hidden
    if (myAnswerRow) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
                {roundQuestioner?.name} asked {roundTarget?.name}…
              </p>
              <BigQuestion question={roundQuestion} />
            </div>
            {bonusMatchName && (
              <div style={{ background: "#FBDF54", color: "#000", padding: "10px 16px", fontSize: 14, fontWeight: 800 }}>
                Same answer as {bonusMatchName}! +1 bonus
              </div>
            )}
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Answers hidden until everyone is done.</p>
            <Section label="Status">
              <WaitingList players={players} doneIds={answeredIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    // Target hasn't submitted yet
    if (iAmTarget) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
                {roundQuestioner?.name} asked you…
              </p>
              <BigQuestion question={roundQuestion} />
            </div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              You must answer truthfully. Everyone else will try to fool the group by writing something that sounds like you.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnswerTextarea
                value={myAnswer}
                onChange={v => { setMyAnswer(v); trackTyping() }}
                placeholder="Your answer…"
              />
              <PrimaryBtn
                onClick={submitAnswer}
                loading={answerLoading}
                disabled={!myAnswer.trim()}
                label="Submit Answer"
                loadingLabel="Submitting…"
                nudge={nudgeAnswer}
              />
              {!!answerError && <p style={{ fontSize: 14, fontWeight: 600, color: YELLOW }}>{answerError}</p>}
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={players} doneIds={answeredIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    // Non-target, hasn't submitted yet
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length}</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
              {roundQuestioner?.name} asked {roundTarget?.name}…
            </p>
            <BigQuestion question={roundQuestion} />
          </div>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Write something that sounds like {roundTarget?.name} wrote it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnswerTextarea
              value={myAnswer}
              onChange={v => { setMyAnswer(v); trackTyping() }}
              placeholder={`Fake ${roundTarget?.name}'s answer…`}
            />
            <PrimaryBtn
              onClick={submitAnswer}
              loading={answerLoading}
              disabled={!myAnswer.trim()}
              label="Submit Answer"
              loadingLabel="Submitting…"
              nudge={nudgeAnswer}
            />
            {!!answerError && <p style={{ fontSize: 14, fontWeight: 600, color: YELLOW }}>{answerError}</p>}
          </div>
          <Section label="Waiting for everyone…">
            <WaitingList players={players} doneIds={answeredIds} myPlayerId={myId} onPoke={sendInlinePoke} typingPlayerIds={typingPlayerIds} pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
          </Section>
        </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ─── phase: voting ───────────────────────────────────────────────────────

  if (phase === "voting") {
    const votedIds = roundVotes.map(v => v.voter_id)
    const myAnswerText = myAnswerRow?.answer?.trim().toLowerCase() ?? null
    // Exclude own player_id only; same-text answers are shown but disabled (same as GoW)
    const visibleAnswers = shuffled.filter(a => a.player_id !== myId)
    // De-dup: collapse identical answers into one entry (first in shuffled order = canonical)
    const seenVoteTexts = new Set()
    const dedupedVotable = visibleAnswers.filter(a => {
      const key = a.answer.trim().toLowerCase()
      if (seenVoteTexts.has(key)) return false
      seenVoteTexts.add(key)
      return true
    })

    if (iAmTarget) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 4 }}>Stay quiet!</p>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)" }}>Everyone is deciding which answer is really yours.</p>
            </div>
            <Section label="The answers">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shuffled.map(a => {
                  const voteCount = roundVotes.filter(v => v.voted_for_player_id === a.player_id).length
                  return (
                    <div key={a.player_id} style={{ background: MID, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <p style={{ fontSize: 16, fontWeight: 500, color: "white", lineHeight: 1.4, flex: 1 }}>{a.answer}</p>
                      {voteCount > 0 && (
                        <div style={{ flexShrink: 0, background: YELLOW, color: "#000", fontSize: 13, fontWeight: 900, padding: "3px 8px", marginTop: 2 }}>
                          {voteCount}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
            <Section label="Waiting for votes…">
              <WaitingList players={players.filter(p => p.id !== myId)} doneIds={votedIds} myPlayerId={myId} onPoke={sendInlinePoke} doneLabel="Voted" waitLabel="Deciding…" pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
      )
    }

    if (myVoteRow) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Vote submitted!</p>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Waiting for everyone…</p>
            </div>
            <Section label="Waiting for votes…">
              <WaitingList players={players.filter(p => p.id !== roundTarget?.id)} doneIds={votedIds} myPlayerId={myId} onPoke={sendInlinePoke} doneLabel="Voted" waitLabel="Deciding…" pokeCooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
      )
    }

    async function submitVote() {
      if (voteLoading || !selectedVote) return
      setVoteLoading(true)
      const { error } = await supabase.rpc("cc_submit_vote", {
        p_code: code,
        p_voter_id: myId,
        p_round: current_round,
        p_voted_for_player_id: selectedVote,
      })
      if (error) { setVoteLoading(false) }
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length}</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
              Which answer is {roundTarget?.name}'s?
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>"{roundQuestion}"</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dedupedVotable.map(a => {
              const isMyAnswer = myAnswerText && a.answer.trim().toLowerCase() === myAnswerText
              const selected = selectedVote === a.player_id
              if (isMyAnswer) {
                return (
                  <div key={a.player_id} style={{ background: MID, padding: "18px 20px", opacity: 0.5 }}>
                    <p style={{ fontSize: 17, fontWeight: 500, color: "white", lineHeight: 1.4 }}>{a.answer}</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>Your answer — can't vote for it</p>
                  </div>
                )
              }
              return (
                <button
                  key={a.player_id}
                  onClick={() => setSelectedVote(a.player_id)}
                  style={{
                    background: selected ? YELLOW : MID,
                    color: selected ? "#000" : "white",
                    fontSize: 17,
                    fontWeight: selected ? 800 : 500,
                    padding: "18px 20px",
                    textAlign: "left",
                    lineHeight: 1.4,
                    border: selected ? "none" : "2px solid transparent",
                  }}
                >
                  {a.answer}
                  {selected && <span style={{ marginLeft: 8, fontWeight: 900 }}>✓</span>}
                </button>
              )
            })}
          </div>
          <PrimaryBtn
            onClick={submitVote}
            loading={voteLoading}
            disabled={!selectedVote}
            label="That's the Real One"
            loadingLabel="Submitting…"
          />
        </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ─── phase: results ──────────────────────────────────────────────────────

  if (phase === "results") {
    const targetAnswer = roundAnswers.find(a => a.player_id === roundTarget?.id)

    // Compute round deltas (mirrors DB scoring logic)
    const answerByPlayer = {}
    roundAnswers.forEach(a => { answerByPlayer[a.player_id] = a.answer.trim().toLowerCase() })
    const targetText = answerByPlayer[roundTarget?.id]

    const deltas = {}
    players.forEach(p => { deltas[p.id] = 0 })
    roundVotes.forEach(v => {
      const votedText = answerByPlayer[v.voted_for_player_id]
      const isCorrect = v.voted_for_player_id === roundTarget?.id ||
        (votedText && targetText && votedText === targetText)
      if (isCorrect) {
        deltas[v.voter_id] = (deltas[v.voter_id] ?? 0) + 2
      } else {
        deltas[v.voted_for_player_id] = (deltas[v.voted_for_player_id] ?? 0) + 1
        // co-authors with same text also credited
        if (votedText) {
          players.forEach(p => {
            if (p.id !== v.voted_for_player_id && answerByPlayer[p.id] === votedText && p.id !== roundTarget?.id) {
              deltas[p.id] = (deltas[p.id] ?? 0) + 1
            }
          })
        }
      }
    })
    // Matching bonus
    players.forEach(p => {
      const myText = answerByPlayer[p.id]
      if (!myText) return
      if (players.some(other => other.id !== p.id && answerByPlayer[other.id] === myText)) {
        deltas[p.id] = (deltas[p.id] ?? 0) + 1
      }
    })

    // Ready-up
    const readyIds = ready_player_ids ?? []
    const iReady = readyIds.includes(myId)
    const readyCount = readyIds.length
    const totalCount = players.length

    async function markReady() {
      if (readyLoading || iReady) return
      setReadyLoading(true)
      const { error } = await supabase.rpc("cc_mark_ready", {
        p_code: code,
        p_player_id: myId,
      })
      if (error) setReadyLoading(false)
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length} · Results</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
          {/* Question context */}
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            {roundQuestioner?.name} asked {roundTarget?.name}: "{roundQuestion}"
          </p>

          {/* Real answer */}
          {targetAnswer && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8 }}>
                {roundTarget?.name}'s real answer
              </div>
              <div style={{ background: GREEN, padding: "16px 20px" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.4 }}>{targetAnswer.answer}</p>
              </div>
            </div>
          )}

          {/* All answers — deduped by text */}
          {(() => {
            const groups = []
            for (const a of shuffled) {
              const key = (a.answer || "").trim().toLowerCase()
              const existing = groups.find(g => g.key === key)
              if (existing) {
                existing.playerIds.push(a.player_id)
              } else {
                groups.push({ key, answer: a.answer, playerIds: [a.player_id] })
              }
            }
            return (
              <Section label="Everyone's answers">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {groups.map(group => {
                    const isReal = group.playerIds.includes(roundTarget?.id)
                    const authors = group.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean)
                    const votersForGroup = roundVotes.filter(v => group.playerIds.includes(v.voted_for_player_id))
                    const voterNames = votersForGroup.map(v => players.find(p => p.id === v.voter_id)?.name).filter(Boolean)
                    return (
                      <div key={group.key} style={{ background: isReal ? `${GREEN}33` : MID, padding: "14px 16px", borderLeft: isReal ? `4px solid ${GREEN}` : "4px solid transparent" }}>
                        <p style={{ fontSize: 16, fontWeight: 500, color: "white", lineHeight: 1.4, marginBottom: 6 }}>{group.answer}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: isReal ? GREEN : YELLOW }}>{authors.join(" & ")}</span>
                          {isReal && voterNames.length > 0 && (
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>· spotted by {voterNames.join(", ")}</span>
                          )}
                          {!isReal && voterNames.length > 0 && (
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>· fooled {voterNames.join(", ")}</span>
                          )}
                          {!isReal && voterNames.length === 0 && (
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>· no one fooled</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )
          })()}

          {/* Points this round */}
          <Section label="Points this round">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {players.map(p => {
                const d = deltas[p.id] ?? 0
                const isTargetPlayer = p.id === roundTarget?.id
                const details = []
                if (!isTargetPlayer) {
                  const myVoteRow = roundVotes.find(v => v.voter_id === p.id)
                  if (myVoteRow) {
                    const myVotedText = answerByPlayer[myVoteRow.voted_for_player_id]
                    const votedCorrect = myVoteRow.voted_for_player_id === roundTarget?.id ||
                      (myVotedText && targetText && myVotedText === targetText)
                    if (votedCorrect) details.push("spotted the real answer")
                  }
                  const fooledVoterNames = roundVotes.filter(v => v.voted_for_player_id === p.id).map(v => players.find(x => x.id === v.voter_id)?.name).filter(Boolean)
                  if (fooledVoterNames.length > 0) details.push(`fooled ${fooledVoterNames.join(", ")}`)
                  const myAnswerText = answerByPlayer[p.id]
                  if (myAnswerText) {
                    const matchedNames = players
                      .filter(other => other.id !== p.id && answerByPlayer[other.id] === myAnswerText)
                      .map(other => other.name)
                    if (matchedNames.length > 0) details.push(`matched ${matchedNames.join(", ")}'s answer`)
                  }
                }
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div style={{ background: DARK, padding: "12px 14px", minWidth: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: d > 0 ? YELLOW : "rgba(255,255,255,0.4)" }}>
                        {d > 0 ? `+${d}` : "+0"}
                      </span>
                    </div>
                    <div style={{ background: MID, flex: 1, padding: "12px 16px" }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</span>
                      {details.length > 0 && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginLeft: 8 }}>{details.join(" · ")}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Running totals */}
          <Section label="Running Totals">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ background: DARK, padding: "12px 0", minWidth: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  <div style={{ background: MID, flex: 1, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}{p.id === myId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: YELLOW }}>{p.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

      </div>
        {pokeSystemNode(
          iReady
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{readyCount} / {totalCount} ready…</div>
            : <button onClick={markReady} disabled={readyLoading} style={{ flex: 1, height: "100%", background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900 }}>{readyLoading ? "…" : current_round + 1 < players.length ? "Next Round" : "See Final Scores"}</button>
        )}
      </>
    )
  }

  // ─── phase: finished ─────────────────────────────────────────────────────

  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    const winner = sorted[0]

    async function pickNextGame(gameSub) {
      await supabase.from("cc_games").update({ next_game: gameSub }).eq("code", code)
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <div style={{ background: DARK, padding: "20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "white" }}>Game Over</h1>
        </div>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
          <Section label="Final Scores">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sorted.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ background: DARK, padding: "14px 0", minWidth: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  <div style={{ background: MID, flex: 1, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{p.name}</span>
                      {p.id === myId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
                      {p.id === winner.id && (
                        <div style={{ fontSize: 11, fontWeight: 800, color: YELLOW, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 2 }}>
                          Winner
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 900, color: YELLOW }}>{p.score} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => supabase.rpc("cc_reset_to_lobby", { p_code: code })}
              style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
              Play Again
            </button>
            <button onClick={() => setShowGameModal(true)}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}>
              Play Another Game
            </button>
          </div>
        </div>
      </div>
        {pokeSystemNode()}
      {showGameModal && (
        <GameModal
          onClose={() => setShowGameModal(false)}
          onSelect={sub => pickNextGame(sub)}
          currentSub="copycats"
        />
      )}
      </>
    )
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
    </div>
      {pokeSystemNode()}
    </>
  )
}
