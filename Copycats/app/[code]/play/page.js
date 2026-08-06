"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import FooterButton from "../../../components/FooterButton"
import Selections, { ThumbsUpIcon } from "../../../components/Selections"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import EndGame from "../../../components/EndGame"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import StatusBar from "../../../components/StatusBar"
import WaitingList from "../../../components/WaitingList"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

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
      <div style={{ ...STYLE.sectionHeader, marginBottom: 16 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// TopBar removed - now using shared StatusBar component

function BigQuestion({ question }) {
  return (
    <div style={{ background: MID, padding: `${SPACE.md}px ${SPACE.md}px`, borderLeft: `4px solid ${YELLOW}` }}>
      <p style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.bold, color: "white", lineHeight: 1.4 }}>
        "{question}"
      </p>
    </div>
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

function AnswerTextarea({ value, onChange, placeholder, disabled, onTypingChange }) {
  return (
    <TextEntry
      value={value}
      onChange={onChange}
      onTypingChange={onTypingChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      bg={WARM_LIGHT}
      fontSize={18}
    />
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
  const [likes, setLikes] = useState([])
  const [myId, setMyId] = useState(null)
  const isIdle = useIdleGate()

  // question writing
  const [myQuestion, setMyQuestion] = useState("")


  // answering
  const [myAnswer, setMyAnswer] = useState("")

  const [answerError, setAnswerError] = useState("")

  // voting
  const [selectedVote, setSelectedVote] = useState(null)
  const [submittingVote, setSubmittingVote] = useState(false)


  // results ready-up


  const channelRef = useRef(null)
  const typingTimerRef = useRef(null)
  const syncKeyRef = useRef(null)
  const [presenceState, setPresenceState] = useState({})
  const [bonusMatchName, setBonusMatchName] = useState(null)

  useEffect(() => {
    if (isIdle) return
    const id = localStorage.getItem(`cc:${code}:playerId`)
    if (id) setMyId(id)
    loadState()
    // Poll as a fallback in case a realtime event is missed. Kept short so a
    // player never sits on a stale waiting screen for long after others advance.
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    // Realtime so phase/round changes propagate to every client immediately.
    // Deps are [code] only, so the channel is created once per game (no remount
    // loop). Uses the localStorage id directly to avoid a stale myId closure.
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`cc-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "cc_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "cc_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "cc_answers", filter: `game_code=eq.${code}` }, applyRowChange(setAnswers))
        .on("postgres_changes", { event: "*", schema: "public", table: "cc_votes", filter: `game_code=eq.${code}` }, applyRowChange(setVotes))
        .on("postgres_changes", { event: "*", schema: "public", table: "cc_likes", filter: `game_code=eq.${code}` }, applyRowChange(setLikes))
        .on("broadcast", { event: "sync" }, loadState)
        .on("presence", { event: "sync" }, () => setPresenceState({ ...channel.presenceState() }))
        .subscribe(async status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState()
            if (id) await channel.track({ playerId: id, typing: false })
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            // A dropped websocket otherwise leaves this client stuck until the 60s poll fires.
            // Recreate the channel instead of waiting on it, backing off if it keeps failing
            // so a persistent outage doesn't turn into a reconnect storm across many clients.
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
    supabase.from("game_instructions").select("body").eq("game_key", "copycats").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  // Reset per-round input state when round advances
  useEffect(() => {
    setMyAnswer("")
    setAnswerError("")
    setSelectedVote(null)
  }, [game?.current_round])

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
    // If no player ID in localStorage, redirect to lobby to join
    const storedId = localStorage.getItem(`cc:${code}:playerId`)
    if (!storedId) {
      router.push(`/${code}`)
      return
    }

    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }, { data: an }, { data: vs }, { data: lk }] = await Promise.all([
      supabase.from("cc_games").select("*").eq("code", code).single(),
      supabase.from("cc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("cc_answers").select("*").eq("game_code", code).order("created_at"),
      supabase.from("cc_votes").select("*").eq("game_code", code).order("created_at"),
      supabase.from("cc_likes").select("*").eq("game_code", code).order("created_at"),
    ])
    if (seq !== loadSeqRef.current) return
    if (!g) { router.push(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g)
    setPlayers(ps ?? [])
    setAnswers(an ?? [])
    // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
    const syncKey = `${g.phase}:${g.current_round ?? ""}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) channelRef.current?.send({ type: "broadcast", event: "sync" })
    syncKeyRef.current = syncKey
    setVotes(vs ?? [])
    setLikes(lk ?? [])
  }

  // cc_games changes: apply the row directly from the realtime payload
  // instead of a full loadState() refetch (5-table Promise.all). Each
  // change independently reaches every subscribed client already, so
  // there's no need to also nudge — nudge() exists for cases where a
  // client's own realtime might be lagging, which doesn't apply to the
  // client that just received this exact event.
  const gamesSyncKeyRef = useRef(null)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(newRow)
    const key = `${newRow.phase}:${newRow.current_round ?? ""}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) channelRef.current?.send({ type: "broadcast", event: "sync" })
    gamesSyncKeyRef.current = key
  }
  // Same idea for cc_players/cc_answers/cc_votes/cc_likes.
  function applyRowChange(setList) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload
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

  async function toggleLike(likedPlayerId) {
    if (!myId || likedPlayerId === myId) return
    const round = game?.current_round
    const alreadyLiked = likes.some(l => l.round === round && l.liker_id === myId && l.liked_player_id === likedPlayerId)
    // Optimistic update — flip the icon instantly instead of waiting on the round trip.
    if (alreadyLiked) {
      setLikes(prev => prev.filter(l => !(l.round === round && l.liker_id === myId && l.liked_player_id === likedPlayerId)))
    } else {
      setLikes(prev => [...prev, { game_code: code, round, liker_id: myId, liked_player_id: likedPlayerId, created_at: new Date().toISOString() }])
    }
    // No nudge/full reload on success: this fires on every tap, and the
    // write already propagates cheaply via the payload-patched
    // postgres_changes handler. Only resync on failure, to roll back the
    // optimistic update.
    const { error } = await supabase.rpc("cc_toggle_like", {
      p_code: code, p_round: round, p_liker_id: myId, p_liked_player_id: likedPlayerId,
    })
    if (error) { await loadState(); throw error }
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

  // Pre-fill question and answer fields (dummy games)
  useEffect(() => {
    if (game?.phase !== "question_writing" || !myId) return
    if (!game?.is_dummy) return
    supabase.rpc("get_random_ideas", { p_count: 1, p_exclude: [] })
      .then(({ data }) => { if (data?.[0]) setMyQuestion(prev => prev || data[0]) })
  }, [game?.phase, game?.current_round, myId, game?.is_dummy])

  useEffect(() => {
    if (game?.phase !== "answering" || !myId) return
    if (!game?.is_dummy) return
    const myAnswerRow = answers.find(a => a.player_id === myId && a.round === game?.current_round)
    if (myAnswerRow) return
    supabase.rpc("get_random_ideas", { p_count: 1, p_exclude: [] })
      .then(({ data }) => { if (data?.[0]) setMyAnswer(prev => prev || data[0]) })
  }, [game?.phase, game?.current_round, myId, answers.length, game?.is_dummy])

  // Must be declared before early returns — Rules of Hooks
  const myAnswerRowEarly = answers.find(a => a.player_id === myId && a.round === game?.current_round)
  const nudgeAnswer = useSubmitNudge(myAnswer, !!myAnswerRowEarly)
  const [instructions, setInstructions] = useState("")
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game || !myId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
      </div>
    )
  }

  const me = players.find(p => p.id === myId)

  // Transform players for WaitingList component
  function makeWaitingPlayers(playerList, doneIds) {
    return playerList.map(p => ({
      name: p.name,
      done: doneIds.includes(p.id),
      typing: typingPlayerIds.has(p.id),
    }))
  }

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
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("cc_reset_to_lobby", { p_code: code }) }}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footer}
      </Footer>
    </>
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
  const roundLikes = likes.filter(l => l.round === current_round)
  const likeCount = playerId => roundLikes.filter(l => l.liked_player_id === playerId).length
  const iLiked = playerId => roundLikes.some(l => l.liked_player_id === playerId && l.liker_id === myId)

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
          <StatusBar dark={DARK} label="Write Your Questions" />
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Question submitted!</p>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Waiting for everyone else…</p>
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={makeWaitingPlayers(players, submittedIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
      )
    }

    async function submitQuestion() {
      const { error } = await supabase.rpc("cc_submit_question", {
        p_code: code,
        p_player_id: myId,
        p_question: myQuestion.trim(),
      })
      if (error) throw error
      await loadState()
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label="Write Your Questions" />
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>
              You're asking {myTarget?.name ?? "…"}.
            </p>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Write a personal question for them — something with a specific answer. Everyone else will try to fake their response.
            </p>
          </div>

          <AnswerTextarea
            value={myQuestion}
            onChange={setMyQuestion}
            onTypingChange={isTyping => isTyping && trackTyping()}
            placeholder={`Your question for ${myTarget?.name ?? "them"}…`}
          />

          <div style={{ marginTop: 16, marginBottom: 24 }}>
            <RandomIdeas
              bg={WARM_LIGHT}
              yellow={YELLOW}
              fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
              playerNames={players.filter(p => p.id !== myId).map(p => p.first_name || p.name)}
              maxDraws={3}
            />
          </div>

          <Section label="Waiting for everyone…">
            <WaitingList players={makeWaitingPlayers(players, submittedIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
          </Section>
        </div>
      </div>
        {pokeSystemNode(
          <FooterButton key="submit-question" onClick={submitQuestion} disabled={!myQuestion.trim()}>
            Submit Question
          </FooterButton>
        )}
      </>
    )
  }

  // ─── phase: answering ────────────────────────────────────────────────────

  if (phase === "answering") {
    const answeredIds = roundAnswers.map(a => a.player_id)

    async function submitAnswer() {
      console.log('[COPYCATS] submitAnswer called - code version: 2024-06-07-v3')
      setAnswerError("")
      const myText = myAnswer.trim().toLowerCase()
      console.log('[COPYCATS] Calling cc_submit_answer RPC...')

      try {
        // Add timeout to prevent hanging forever
        const rpcPromise = supabase.rpc("cc_submit_answer", {
          p_code: code,
          p_player_id: myId,
          p_round: current_round,
          p_answer: myAnswer.trim(),
        })
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC timeout after 10s')), 10000)
        )

        const { data, error } = await Promise.race([rpcPromise, timeoutPromise])
        console.log('[COPYCATS] RPC returned, error:', error, 'data:', data)
        if (error) {
          setAnswerError(error.message || "Something went wrong.")
          throw error
        }
        // Gossip: broadcast so peers see answer instantly
        channelRef.current?.send({ type: "broadcast", event: "sync" })
      } catch (err) {
        console.log('[COPYCATS] Error in RPC or timeout:', err)
        setAnswerError(err.message || "Request timed out")
        throw err
      }

      console.log('[COPYCATS] Calling loadState...')
      await loadState()
      console.log('[COPYCATS] loadState completed')

      // Check if anyone else wrote the same answer (bonus match)
      const { data: freshAnswers, error: fetchError } = await supabase
        .from("cc_answers").select("player_id,answer")
        .eq("game_code", code).eq("round", current_round)
      if (fetchError) throw fetchError
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
          <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
                  {incomingAnswers.map((a, i) => (
                    <div key={a.player_id} style={{ background: MID, padding: "12px 16px", fontSize: 16, color: "white" }}>
                      {a.answer}
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <Section label="Waiting for…">
              <WaitingList players={makeWaitingPlayers(players, answeredIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
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
          <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
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
              <WaitingList players={makeWaitingPlayers(players, answeredIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
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
          <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
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
                onChange={setMyAnswer}
                onTypingChange={isTyping => isTyping && trackTyping()}
                placeholder="Your answer…"
              />
              {!!answerError && <p style={{ fontSize: 14, fontWeight: 600, color: YELLOW }}>{answerError}</p>}
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={makeWaitingPlayers(players, answeredIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
          {pokeSystemNode(
            <FooterButton key={`answer-${current_round}`} onClick={submitAnswer} disabled={!myAnswer.trim()} nudge={nudgeAnswer}>
              Submit Answer
            </FooterButton>
          )}
        </>
      )
    }

    // Non-target, hasn't submitted yet
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
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
              onChange={setMyAnswer}
              onTypingChange={isTyping => isTyping && trackTyping()}
              placeholder={`Fake ${roundTarget?.name}'s answer…`}
            />
            {!!answerError && <p style={{ fontSize: 14, fontWeight: 600, color: YELLOW }}>{answerError}</p>}
          </div>
          <Section label="Waiting for everyone…">
            <WaitingList players={makeWaitingPlayers(players, answeredIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
          </Section>
        </div>
      </div>
        {pokeSystemNode(
          <FooterButton onClick={submitAnswer} disabled={!myAnswer.trim()} nudge={nudgeAnswer}>
            Submit Answer
          </FooterButton>
        )}
      </>
    )
  }

  // ─── phase: voting ───────────────────────────────────────────────────────

  if (phase === "voting") {
    const votedIds = roundVotes.map(v => v.voter_id)
    const myAnswerText = myAnswerRow?.answer?.trim().toLowerCase() ?? null
    // Own answer stays visible (marked isMine below, disabled in Selections) rather than
    // being hidden — same-text answers are also shown but disabled (same as GoW)
    // De-dup: collapse identical answers into one entry (first in shuffled order = canonical)
    const seenVoteTexts = new Set()
    const dedupedVotable = shuffled.filter(a => {
      const key = a.answer.trim().toLowerCase()
      if (seenVoteTexts.has(key)) return false
      seenVoteTexts.add(key)
      return true
    })

    if (iAmTarget) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 4 }}>Stay quiet!</p>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)" }}>Everyone is deciding which answer is really yours.</p>
            </div>
            <Section label="The answers">
              <div style={{ display: "flex", flexDirection: "column", gap: GAP.selection }}>
                {[...shuffled].sort((a, b) => (a.player_id === myId ? 1 : 0) - (b.player_id === myId ? 1 : 0)).map(a => {
                  const voteCount = roundVotes.filter(v => v.voted_for_player_id === a.player_id).length
                  const isMine = a.player_id === myId
                  const answerLiked = iLiked(a.player_id)
                  const answerLikeCount = likeCount(a.player_id)
                  return (
                    <div key={a.player_id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, background: MID, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <p style={{ fontSize: 16, fontWeight: 500, color: "white", lineHeight: 1.4, flex: 1 }}>{a.answer}</p>
                        {isMine && (
                          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, color: "white", flexShrink: 0, marginTop: 2 }}>
                            your answer
                          </span>
                        )}
                        {voteCount > 0 && (
                          <div style={{ flexShrink: 0, background: YELLOW, color: "#000", fontSize: 13, fontWeight: 900, padding: "3px 8px", marginTop: 2 }}>
                            {voteCount}
                          </div>
                        )}
                      </div>
                      {isMine ? (
                        <div style={{ color: "white", opacity: 0.4, padding: "0 2px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                          <ThumbsUpIcon filled={false} size={22} />
                          {answerLikeCount > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{answerLikeCount}</span>}
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleLike(a.player_id)}
                          style={{
                            background: "transparent",
                            color: answerLiked ? "#FBDF54" : "white",
                            opacity: answerLiked ? 1 : 0.5,
                            padding: "0 2px",
                            flexShrink: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                          }}
                        >
                          <ThumbsUpIcon filled={answerLiked} size={22} />
                          {answerLikeCount > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{answerLikeCount}</span>}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
            <Section label="Waiting for votes…">
              <WaitingList players={makeWaitingPlayers(players.filter(p => p.id !== myId), votedIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
            </Section>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    async function confirmVote() {
      if (selectedVote === null || submittingVote) return
      setSubmittingVote(true)
      const { error } = await supabase.rpc("cc_submit_vote", {
        p_code: code,
        p_voter_id: myId,
        p_round: current_round,
        p_voted_for_player_id: selectedVote,
      })
      setSubmittingVote(false)
      if (error) throw error
      // Gossip: broadcast so peers see vote instantly
      channelRef.current?.send({ type: "broadcast", event: "sync" })
      await loadState()
    }

    const hasVoted = !!myVoteRow
    const currentSelectedId = hasVoted ? myVoteRow.voted_for_player_id : selectedVote

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length}`} />
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
              Which answer is {roundTarget?.name}'s?
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>"{roundQuestion}"</p>
          </div>
          <Selections
            options={dedupedVotable.map(a => ({
              id: a.player_id,
              text: a.answer,
              isMine: !!(myAnswerText && a.answer.trim().toLowerCase() === myAnswerText),
            }))}
            selectedId={currentSelectedId}
            onSelect={id => setSelectedVote(id)}
            onDeselect={() => setSelectedVote(null)}
            disabled={hasVoted || submittingVote}
            colors={{ bg: MID, selectedBg: YELLOW, selectedText: "#000", deselectBg: DARK, deselectText: YELLOW }}
            mineLabel="Your answer — can't vote for it"
            showLikes
            likeCounts={Object.fromEntries(players.map(p => [p.id, likeCount(p.id)]))}
            likedIds={roundLikes.filter(l => l.liker_id === myId).map(l => l.liked_player_id)}
            onToggleLike={toggleLike}
          />
          <Section label="Waiting for votes…">
            <WaitingList players={makeWaitingPlayers(players.filter(p => p.id !== roundTarget?.id), votedIds)} myName={me.name} colors={{ mid: MID }} onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent} />
          </Section>
        </div>
      </div>
        {pokeSystemNode(!hasVoted ? (
          <FooterButton onClick={confirmVote} disabled={selectedVote === null}>
            Vote
          </FooterButton>
        ) : null)}
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
      const { error } = await supabase.rpc("cc_mark_ready", {
        p_code: code,
        p_player_id: myId,
        p_round: current_round,
      })
      if (error) throw error
      await loadState()
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label={`Round ${current_round + 1} of ${players.length} · Results`} />
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: GAP.section, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: BOTTOM_PAD }}>
          {/* Question context */}
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            {roundQuestioner?.name} asked {roundTarget?.name}: "{roundQuestion}"
          </p>

          {/* Real answer */}
          {targetAnswer && (() => {
            const correctVoters = roundVotes
              .filter(v => {
                const votedText = answerByPlayer[v.voted_for_player_id]
                return v.voted_for_player_id === roundTarget?.id || (votedText && targetText && votedText === targetText)
              })
              .map(v => players.find(p => p.id === v.voter_id)?.name)
              .filter(Boolean)

            const realAnswerLikeCount = likeCount(roundTarget?.id)
            const realAnswerLiked = realAnswerLikeCount > 0

            return (
              <div>
                <div style={{ ...STYLE.sectionHeader, marginBottom: 16 }}>
                  {roundTarget?.name}'s real answer
                </div>
                <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, background: GREEN, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                    {correctVoters.length > 0 && (
                      <div style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0 }}>
                        +2
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.4 }}>{targetAnswer.answer}</p>
                      {correctVoters.length > 0 && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, flexShrink: 0 }}>Chosen by</span>
                          <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>{correctVoters.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: realAnswerLiked ? "#FBDF54" : "rgba(255,255,255,0.5)" }}>
                    <ThumbsUpIcon filled={realAnswerLiked} size={18} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{realAnswerLikeCount}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          <Results
            items={(() => {
              // Group answers by text (dedup)
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
              // Convert to Results format
              return groups
                .filter(g => !g.playerIds.includes(roundTarget?.id)) // exclude real answer (shown separately)
                .map(group => {
                  const votersForGroup = roundVotes.filter(v => group.playerIds.includes(v.voted_for_player_id))
                  const isCorrect = group.key === targetText // matches real answer
                  // In Copycats: correct answers don't score points for the author (voters get 2 pts instead)
                  // Incorrect answers score 1 pt per voter for the author
                  const voteCount = isCorrect ? 0 : votersForGroup.length
                  return {
                    id: group.key,
                    text: group.answer,
                    authorNames: group.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean),
                    voterNames: votersForGroup.map(v => players.find(p => p.id === v.voter_id)?.name).filter(Boolean),
                    voteCount: voteCount,
                    isBonus: group.playerIds.length > 1,
                    isCorrect: isCorrect,
                    likeCount: group.playerIds.reduce((sum, id) => sum + likeCount(id), 0),
                  }
                })
                .sort((a, b) => b.voteCount - a.voteCount || b.voterNames.length - a.voterNames.length)
            })()}
            scores={[...players].sort((a, b) => b.score - a.score).map(p => ({
              name: p.name,
              score: p.score,
              likeCount: likes.filter(l => l.liked_player_id === p.id).length,
            }))}
            colors={{ card: MID, yellow: YELLOW, dim: "rgba(255,255,255,0.15)" }}
          />
        </div>

      </div>
        {pokeSystemNode(
          iReady
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{readyCount} / {totalCount} ready…</div>
            : <FooterButton onClick={markReady}>
              {current_round + 1 < players.length ? "Next Round" : "See Final Scores"}
            </FooterButton>
        )}
      </>
    )
  }

  // ─── phase: finished ─────────────────────────────────────────────────────

  if (phase === "finished") {
    const likeTotals = {}
    for (const l of likes) likeTotals[l.liked_player_id] = (likeTotals[l.liked_player_id] ?? 0) + 1
    const finalPlayers = [...players].sort((a, b) => b.score - a.score).map(p => ({ ...p, likeCount: likeTotals[p.id] ?? 0 }))
    const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <EndGame
          players={finalPlayers}
          myPlayerId={myId}
          onPlayAgain={async () => {
            if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
            const { data, error } = await supabase.rpc("cc_create_replay", { p_code: code })
            if (error) throw error
            channelRef.current?.send({ type: "broadcast", event: "sync" })
            router.replace(`/${data}`)
          }}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: YELLOW, wl: MID }}
        />
      </div>
        {pokeSystemNode()}
      </>
    )
  }

}
