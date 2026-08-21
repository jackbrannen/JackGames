"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import StatusBar from "../../../components/StatusBar"
import WaitingList from "../../../components/WaitingList"
import RandomIdeas from "../../../components/RandomIdeas"
import TextEntry from "../../../components/TextEntry"
import { playCountdownTick, playCountdownGo, playSoundsEnd } from "../../../lib/sounds"
import { useDuplicates } from "../../../lib/useDuplicates"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const RED = "#25AB61"
const DARK = "#209467"
const MID = "#229E64"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#2AC255"
const BOYS = "#174867"
const GIRLS = "#D4377C"
const INK = "#2A303C"

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#2A0E0B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const INSTRUCTIONS = [
  ["How it works", `Two teams - Boys and Girls. Everyone submits words at the start; those become the pool for the whole game.

On your turn, pick 1-3 words from the board. When the countdown ends, make sound effects for the words you picked - no talking, no miming, just noises. Your teammates each pick up to 3 words they think you meant.`],
  ["Scoring", `+1 point for every correct sound they select, -1 for every sound not selected that you picked, and -1 for every sound they erroneously select.

Correctly guessed words leave the board; new ones take their place. Words that stick around get more valuable - up to 9 points - the longer they survive.`],
]

const VALUE_COLORS = ["#FFFFFF", "#FFE819", "#FFB920", "#FF8C37", "#F6604B", "#DA395A", "#B41A64", "#860B67", "#550D61"]
function valueColor(value) {
  return VALUE_COLORS[Math.max(1, Math.min(9, value)) - 1]
}
function valueTextColor(value) {
  return value >= 5 ? "#fff" : INK
}

const CELL_ANIM_CSS = `
@keyframes sbCellLeave { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.85); } }
@keyframes sbCellEnter { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
`

// Shared between the countdown and sounds screens (it-player view) so the
// word list never moves or resizes across that transition — only the
// countdown numeral (rendered in a fixed-height slot) appears/disappears.
function ItSoundsBlock({ words, secs, caption }) {
  return (
    <>
      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {secs != null && (
          <div style={{ fontSize: "clamp(70px, 26vw, 150px)", fontWeight: 900, lineHeight: 1 }}>{secs}</div>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, opacity: 0.85, marginBottom: 16 }}>{caption}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {words.map((t, i) => (
          <div key={i} style={{ fontSize: "clamp(36px, 11vw, 72px)", fontWeight: 900, letterSpacing: "-1px", textAlign: "center", lineHeight: 1.05 }}>{t}</div>
        ))}
      </div>
    </>
  )
}

function WordGrid({ slots, selected, onToggle, disabled, liveByWord, leaving = {}, entering = new Set() }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "0 20px" }}>
      <style>{CELL_ANIM_CSS}</style>
      {slots.map((current, i) => {
        const w = leaving[i] ?? current
        if (!w) return <div key={`empty-${i}`} style={{ aspectRatio: "1", background: "rgba(255,255,255,0.08)" }} />
        const isLeaving = !!leaving[i]
        const isSelected = !isLeaving && selected?.has(w.id)
        const bg = valueColor(w.value)
        const liveNames = !isLeaving ? (liveByWord?.[w.id] ?? []) : []
        // Only the cells actually being swapped this turn animate — every
        // other cell (including survivors whose value just bumped) renders
        // its new state immediately, with no transition/motion at all.
        const cellAnimation = isLeaving
          ? "sbCellLeave 0.35s ease forwards"
          : entering.has(i)
          ? "sbCellEnter 0.35s ease"
          : "none"
        return (
          <button
            key={`${i}-${w.id}`}
            onClick={() => !disabled && !isLeaving && onToggle?.(w.id)}
            style={{
              aspectRatio: "1",
              background: bg,
              color: valueTextColor(w.value),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              position: "relative",
              border: isSelected ? "4.8px solid #29303C" : "4.8px solid transparent",
              boxSizing: "border-box",
              transition: "border 0.05s ease",
              animation: cellAnimation,
              cursor: disabled || isLeaving ? "default" : "pointer",
              touchAction: "manipulation",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>
              {w.text}
            </span>
            <span style={{ position: "absolute", bottom: 4, right: 6, fontSize: 11, fontWeight: 900, opacity: 0.7 }}>
              {w.value}
            </span>
            {liveNames.length > 0 && (
              <span style={{ position: "absolute", top: 4, left: 6, fontSize: 10, fontWeight: 800, background: "rgba(0,0,0,0.25)", padding: "2px 5px", borderRadius: 8 }}>
                {liveNames.join(", ")}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [words, setWords] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [msLeft, setMsLeft] = useState(0)
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)

  const [wordFields, setWordFields] = useState(["", "", "", "", ""])
  const [topupFields, setTopupFields] = useState(["", "", ""])
  const [takenWordIndex, setTakenWordIndex] = useState(null)
  const [takenTopupIndex, setTakenTopupIndex] = useState(null)
  const { dupeIndices: wordDupeIndices, hasDuplicates: wordHasDuplicates } = useDuplicates(wordFields)
  const { dupeIndices: topupDupeIndices, hasDuplicates: topupHasDuplicates } = useDuplicates(topupFields)
  const [pickedIds, setPickedIds] = useState(new Set())
  const guessPersistQueueRef = useRef(Promise.resolve())
  const [resultsDismissedLocal, setResultsDismissedLocal] = useState(false)
  const [topupSubmittedLocal, setTopupSubmittedLocal] = useState(false)
  const [scoreForm, setScoreForm] = useState({ boys: 0, girls: 0 })
  const [creatingReplay, setCreatingReplay] = useState(false)

  const advancedSoundsRef = useRef(false)
  const advancedGuessingRef = useRef(false)
  const lastTickRef = useRef(null)
  const playedGoRef = useRef(false)
  const playedEndRef = useRef(false)
  const lastRoundSeenRef = useRef(null)
  const channelRef = useRef(null)
  const prevSlotsRef = useRef(null)

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: p }, { data: w }] = await Promise.all([
      supabase.from("sb_games").select("*").eq("code", code).single(),
      supabase.from("sb_players").select("*").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("sb_words").select("*").eq("game_code", code),
    ])
    if (seq !== loadSeqRef.current) return
    if (g) setGame(g)
    if (p) setPlayers(p)
    if (w) setWords(w)
  }

  // Apply a changed row directly from the realtime payload instead of a full
  // loadState() refetch. Each change independently reaches every subscribed
  // client already, so there's no need to also nudge — nudge() exists for
  // cases where a client's own realtime might be lagging, which doesn't
  // apply to the client that just received this exact event.
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

  // Gossip: call RPCs through here so peers refresh instantly via broadcast,
  // instead of waiting on postgres_changes replication or the poll fallback.
  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    channelRef.current?.send({ type: "broadcast", event: "sync" })
    await loadState()
  }

  useEffect(() => {
    if (isIdle) return
    const existing = localStorage.getItem(`sb:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`soundboard-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "sb_games", filter: `code=eq.${code}` }, payload => {
          // sb_games changes on every tap while the guessing team builds their
          // shared selection, far more often than real state changes. Apply
          // the row straight from the realtime payload — which always carries
          // the complete new row — instead of triggering a full loadState(),
          // avoiding a 3-table refetch fanned out to every connected client
          // on every single tap.
          if (payload.eventType === "DELETE") { loadState(); return }
          if (payload.new) setGame(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "sb_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "sb_words", filter: `game_code=eq.${code}` }, applyRowChange(setWords))
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState()
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
    if (game && game.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])

  // Reset per-turn local state when a new turn/round begins.
  useEffect(() => {
    if (!game) return
    if (lastRoundSeenRef.current !== game.round_number) {
      lastRoundSeenRef.current = game.round_number
      setPickedIds(new Set())
      setGuessIds(new Set())
      setResultsDismissedLocal(false)
      setTopupSubmittedLocal(false)
      advancedSoundsRef.current = false
      advancedGuessingRef.current = false
      playedGoRef.current = false
      playedEndRef.current = false
    }
  }, [game?.round_number])

  // Countdown / Sounds! timer tick
  useEffect(() => {
    if (!game || (game.phase !== "countdown" && game.phase !== "sounds")) { setMsLeft(0); return }
    function tick() {
      const target = new Date(game.phase_deadline_at).getTime()
      const left = Math.max(0, target - Date.now())
      setMsLeft(left)
      if (game.phase === "countdown") {
        const secs = Math.ceil(left / 1000)
        if (lastTickRef.current !== secs && secs > 0 && secs <= 3) {
          lastTickRef.current = secs
          playCountdownTick()
        }
        if (left <= 0 && !advancedSoundsRef.current) {
          advancedSoundsRef.current = true
          rpc("sb_advance_to_sounds", { p_code: code })
        }
      } else if (game.phase === "sounds") {
        if (!playedGoRef.current) { playedGoRef.current = true; playCountdownGo() }
        if (left <= 0 && !advancedGuessingRef.current) {
          advancedGuessingRef.current = true
          if (!playedEndRef.current) { playedEndRef.current = true; playSoundsEnd() }
          rpc("sb_advance_to_guessing", { p_code: code })
        }
      }
    }
    tick()
    const iv = setInterval(tick, 100)
    return () => clearInterval(iv)
  }, [game?.phase, game?.phase_deadline_at, game?.round_number])

  // Dummy games: auto-fill (but don't auto-submit) word fields so testing
  // solo doesn't require typing 5-15+ words by hand.
  const me0 = players.find(p => p.id === myPlayerId)
  useEffect(() => {
    if (!game?.is_demo || !myPlayerId) return
    async function fillWords(count) {
      const { data } = await supabase.rpc("get_random_ideas", { p_count: count, p_exclude: [] })
      const ideas = (data ?? []).slice(0, count)
      while (ideas.length < count) ideas.push(`sound${Math.floor(Math.random() * 10000)}`)
      return ideas
    }
    if (game.phase === "submit" && !me0?.words_submitted && wordFields.every(w => !w.trim())) {
      fillWords(5).then(setWordFields)
    }
    if (game.phase === "results" && game.pool_needs_topup && !me0?.topup_submitted && topupFields.every(w => !w.trim())) {
      fillWords(3).then(setTopupFields)
    }
  }, [game?.is_demo, game?.phase, game?.pool_needs_topup, myPlayerId, me0?.words_submitted, me0?.topup_submitted])

  // Board replenish animation: diff board slots frame-to-frame so only the
  // cells actually being swapped this turn (removed word + its replacement)
  // animate. Survivors' value/color updates apply instantly with no motion.
  const boardSlots = Array.from({ length: 9 }, (_, i) => words.find(w => w.status === "board" && w.board_position === i) ?? null)
  const slotsKey = boardSlots.map(w => w ? `${w.id}:${w.value}` : "-").join(",")
  const [leavingCells, setLeavingCells] = useState({})
  const [enteringCells, setEnteringCells] = useState(new Set())
  useEffect(() => {
    // Only diff/animate once the grid is actually back on screen (phase
    // 'board' or 'guessing'). The board mutates while the results modal is
    // covering it, so comparing+animating at that moment would burn the
    // whole transition off-screen before the player ever sees it — wait
    // until the grid is visible again, then play the animation from here.
    const gridVisible = game?.phase === "board" || game?.phase === "guessing"
    if (!gridVisible) return
    const prev = prevSlotsRef.current
    if (prev) {
      const newLeaving = {}
      const newEntering = []
      for (let i = 0; i < 9; i++) {
        const prevW = prev[i]
        const curW = boardSlots[i]
        if (prevW && curW && prevW.id !== curW.id) {
          newLeaving[i] = prevW
          newEntering.push(i)
        } else if (!prevW && curW) {
          newEntering.push(i)
        }
      }
      if (Object.keys(newLeaving).length || newEntering.length) {
        setLeavingCells(l => ({ ...l, ...newLeaving }))
        setEnteringCells(e => new Set([...e, ...newEntering]))
        setTimeout(() => setLeavingCells(l => { const n = { ...l }; Object.keys(newLeaving).forEach(k => delete n[k]); return n }), 350)
        setTimeout(() => setEnteringCells(e => { const n = new Set(e); newEntering.forEach(p => n.delete(p)); return n }), 700)
      }
    }
    prevSlotsRef.current = boardSlots
  }, [slotsKey, game?.phase])

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game || !myPlayerId) {
    return <div style={{ minHeight: "100dvh", background: RED, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
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

  const slots = boardSlots
  const wordsById = Object.fromEntries(words.map(w => [w.id, w]))
  const currentPlayer = players.find(p => p.id === game.current_player_id)
  const isIt = game.current_player_id === myPlayerId
  const eligibleGuessers = players.filter(p => p.team === game.active_team && p.id !== game.current_player_id)
  const amEligibleGuesser = eligibleGuessers.some(p => p.id === myPlayerId)
  const teamColor = t => t === "boys" ? BOYS : GIRLS

  // The whole guessing team shares one selection now, so there's no more
  // per-teammate "here's what they're picking" hint to show.
  const liveByWord = {}

  const guessIds = new Set(game.team_guess_selection ?? [])

  function togglePicked(id) {
    setPickedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else { if (next.size >= 3) return prev; next.add(id) }
      return next
    })
  }
  function toggleGuess(id) {
    const next = new Set(game.team_guess_selection ?? [])
    if (next.has(id)) next.delete(id)
    else { if (next.size >= 3) return; next.add(id) }
    const arr = [...next]
    // Optimistic local update so the tap feels instant for the tapper.
    setGame(g => ({ ...g, team_guess_selection: arr }))
    // Queued so rapid taps from the same or different teammates can't have
    // their writes land out of order and silently revert a newer pick.
    guessPersistQueueRef.current = guessPersistQueueRef.current.then(() =>
      supabase.rpc("sb_update_team_guess_selection", { p_code: code, p_player_id: myPlayerId, p_word_ids: arr })
    )
  }

  async function submitWords() {
    const trimmed = wordFields.map(w => w.trim())
    if (trimmed.some(w => !w)) throw new Error("Fill in all 5")
    if (wordHasDuplicates) throw new Error("No duplicates allowed.")
    const takenIdx = trimmed.findIndex(w => words.some(aw => aw.text.trim().toLowerCase() === w.toLowerCase()))
    if (takenIdx !== -1) { setTakenWordIndex(takenIdx); throw new Error("validation") }
    setTakenWordIndex(null)
    try {
      await rpc("sb_submit_words", { p_code: code, p_player_id: myPlayerId, p_words: trimmed })
    } catch (error) {
      if (error?.code === "23505" || /duplicate/i.test(error?.message ?? "")) {
        await loadState()
        throw new Error("Someone already submitted one of those words. Try something else.")
      }
      throw error
    }
  }

  async function lockSelection() {
    if (pickedIds.size < 1) throw new Error("Pick at least 1 word")
    await rpc("sb_lock_selection", { p_code: code, p_player_id: myPlayerId, p_word_ids: [...pickedIds] })
  }

  async function submitGuess() {
    if (guessIds.size < 1) throw new Error("Pick at least 1 word")
    await rpc("sb_submit_team_guess", { p_code: code, p_player_id: myPlayerId })
  }

  async function dismissResults() {
    setResultsDismissedLocal(true)
    await rpc("sb_dismiss_results", { p_code: code, p_player_id: myPlayerId })
  }

  async function submitTopup() {
    const trimmed = topupFields.map(w => w.trim())
    if (trimmed.some(w => !w)) throw new Error("Fill in all 3")
    if (topupHasDuplicates) throw new Error("No duplicates allowed.")
    const takenIdx = trimmed.findIndex(w => words.some(aw => aw.text.trim().toLowerCase() === w.toLowerCase()))
    if (takenIdx !== -1) { setTakenTopupIndex(takenIdx); throw new Error("validation") }
    setTakenTopupIndex(null)
    setTopupSubmittedLocal(true)
    try {
      await rpc("sb_submit_topup_words", { p_code: code, p_player_id: myPlayerId, p_words: trimmed })
    } catch (error) {
      setTopupSubmittedLocal(false)
      if (error?.code === "23505" || /duplicate/i.test(error?.message ?? "")) {
        await loadState()
        throw new Error("Someone already submitted one of those words. Try something else.")
      }
      throw error
    }
  }

  async function saveScores() {
    await supabase.from("sb_games").update({ boys_score: Number(scoreForm.boys) || 0, girls_score: Number(scoreForm.girls) || 0 }).eq("code", code)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function playAgain() {
    if (creatingReplay) return
    setCreatingReplay(true)
    let newCode = null
    for (let attempt = 0; attempt < 10; attempt++) {
      const c = Math.random().toString(36).slice(2, 8).toUpperCase()
      const { count } = await supabase.from("sb_games").select("code", { count: "exact", head: true }).eq("code", c)
      if ((count ?? 0) > 0) continue
      const { data, error } = await supabase.from("sb_games").insert({ code: c }).select("code").single()
      if (!error && data?.code) { newCode = data.code; break }
    }
    setCreatingReplay(false)
    if (newCode) router.push(`/${newCode}`)
  }

  const rulesForMenu = INSTRUCTIONS

  // ── Countdown screen ──────────────────────────────────────────────
  if (game.phase === "countdown") {
    const secs = Math.max(1, Math.ceil(msLeft / 1000))
    if (isIt) {
      const mySoundWords = (game.it_selection ?? []).map(id => wordsById[id]?.text).filter(Boolean)
      return (
        <div style={{ minHeight: "100dvh", background: RED, color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <ItSoundsBlock words={mySoundWords} secs={secs} caption="Get ready to make sounds" />
        </div>
      )
    }
    return (
      <div style={{ minHeight: "100dvh", background: RED, color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, opacity: 0.85, marginBottom: 24 }}>
          {currentPlayer?.name ?? "Someone"} is about to make sounds…
        </div>
        <div style={{ fontSize: "clamp(80px, 30vw, 180px)", fontWeight: 900, lineHeight: 1 }}>{secs}</div>
      </div>
    )
  }

  // ── Sounds! screen ────────────────────────────────────────────────
  if (game.phase === "sounds") {
    const pct = Math.max(0, Math.min(100, (msLeft / 4000) * 100))
    if (isIt) {
      const mySoundWords = (game.it_selection ?? []).map(id => wordsById[id]?.text).filter(Boolean)
      return (
        <div style={{ minHeight: "100dvh", background: "#fff", color: RED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 10, background: "rgba(37,171,97,0.15)" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: RED, transition: "width 0.1s linear" }} />
          </div>
          <ItSoundsBlock words={mySoundWords} secs={null} caption="Make sounds!" />
        </div>
      )
    }
    return (
      <div style={{ minHeight: "100dvh", background: "#fff", color: RED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 10, background: "rgba(115,37,50,0.15)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: RED, transition: "width 0.1s linear" }} />
        </div>
        <div style={{ fontSize: "clamp(60px, 20vw, 140px)", fontWeight: 900, letterSpacing: "-2px" }}>Sounds!</div>
      </div>
    )
  }

  // ── Game over screen ──────────────────────────────────────────────
  if (game.phase === "gameover") {
    const winnerLabel = game.winner === "boys" ? "Boys" : "Girls"
    return (
      <div style={{ minHeight: "100dvh", background: RED, color: "white" }}>
        <div style={{ padding: "40px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: "clamp(48px, 14vw, 80px)", fontWeight: 900, lineHeight: 0.95, marginBottom: 8 }}>
            {winnerLabel} Win!
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, opacity: 0.85, marginBottom: 32 }}>
            Boys {game.boys_score} · Girls {game.girls_score}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 40 }}>
            <button onClick={playAgain} disabled={creatingReplay} style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
              {creatingReplay ? "Creating…" : "Play Again"}
            </button>
            <a href="https://games.jackbrannen.com" style={{ display: "block", background: "rgba(255,255,255,0.18)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
              Play Another Game
            </a>
          </div>

          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Every word this game</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {words.map(w => {
              const author = players.find(p => p.id === w.author_id)
              const scorers = [...new Set(w.scored_by ?? [])].map(id => players.find(p => p.id === id)?.first_name).filter(Boolean)
              return (
                <div key={w.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.1)", fontSize: 14 }}>
                  <span style={{ fontWeight: 900 }}>{w.text}</span>
                  <span style={{ opacity: 0.7 }}> — written by </span>
                  <span style={{ fontWeight: 800 }}>{author?.first_name ?? "?"}</span>
                  {scorers.length > 0 && (<>
                    <span style={{ opacity: 0.7 }}> · scored by </span>
                    <span style={{ fontWeight: 800 }}>{scorers.join(", ")}</span>
                  </>)}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Word submission phase ─────────────────────────────────────────
  if (game.phase === "submit") {
    if (!me?.words_submitted) {
      const allFilled = wordFields.every(w => w.trim())
      return (
        <>
          <div style={{ minHeight: "100dvh", background: RED, color: "white", paddingBottom: BOTTOM_PAD }}>
            <StatusBar dark={DARK} label="Sound Board" />
            <div style={{ padding: "24px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 6 }}>Your 5 sounds</div>
              <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 16, lineHeight: 1.5 }}>Write 5 words or phrases other players could make sound effects for. Anything goes.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {wordFields.map((val, i) => {
                  const isTaken = takenWordIndex === i
                  const isDupe = wordDupeIndices.has(i)
                  return (
                    <div key={i}>
                      <TextEntry
                        value={val}
                        onChange={v => {
                          setWordFields(f => f.map((x, j) => j === i ? v : x))
                          if (takenWordIndex === i) setTakenWordIndex(null)
                        }}
                        multiline={false} placeholder={`Word ${i + 1}`}
                        bg={isTaken ? "rgba(240,79,82,0.18)" : isDupe ? "#5C1010" : WARM_LIGHT}
                        fontSize={17} maxLength={40}
                        style={{ marginBottom: isTaken ? 4 : 0 }}
                      />
                      {isTaken && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#F04F52", marginTop: 4 }}>
                          "{val}" was already submitted. Try something else.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <RandomIdeas
                bg={WARM_LIGHT}
                iconColor={YELLOW}
                fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
              />
            </div>
          </div>
          <Footer colors={POKE_COLORS}>
            <FooterButton onClick={submitWords} disabled={!allFilled || wordHasDuplicates} bg={YELLOW} textColor="#000">Submit</FooterButton>
          </Footer>
        </>
      )
    }
    return (
      <>
      <div style={{ minHeight: "100dvh", background: RED, color: "white", paddingBottom: BOTTOM_PAD }}>
        <StatusBar dark={DARK} label="Sound Board" />
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 16 }}>Waiting for everyone…</div>
          <WaitingList
            players={players.map(p => ({ name: p.name, done: p.words_submitted }))} myName={me?.name} colors={{ mid: MID }}
            onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent}
          />
        </div>
      </div>
      {me && <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />}
      </>
    )
  }

  // ── Results phase ─────────────────────────────────────────────────
  if (game.phase === "results") {
    const iDismissed = resultsDismissedLocal || me?.results_dismissed
    if (!iDismissed) {
      const lr = game.last_results ?? {}
      // Everyone sees the same result now — the guessing team submits one
      // shared guess, so there's no more per-player breakdown to pick from.
      const correct = lr.correct ?? [], missed = lr.missed ?? [], wrong = lr.wrong ?? [], total = lr.total
      const teamLabel = lr.active_team === "boys" ? "Boys" : "Girls"
      const teamColor = lr.active_team === "boys" ? BOYS : GIRLS

      const Row = ({ w, sign, icon, bg }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: bg }}>
          <div style={{ minWidth: 34, fontWeight: 900, fontSize: 15 }}>{sign}{w.value}</div>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{w.text}</div>
          <div style={{ fontSize: 17 }}>{icon}</div>
        </div>
      )
      const sectionHeader = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, margin: "16px 0 6px" }

      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 300 }}>
          <div style={{ background: RED, color: "white", width: "100%", maxWidth: 420, maxHeight: "85dvh", overflowY: "auto" }}>
            <div style={{ background: teamColor, color: "white", padding: "18px 24px", textAlign: "center", fontSize: 18, fontWeight: 900 }}>
              {teamLabel}' Results
            </div>
            <div style={{ padding: 24 }}>
              {correct.length > 0 && (
                <div>
                  <div style={sectionHeader}>Correct</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {correct.map(w => <Row key={w.id} w={w} sign="+" icon="✓" bg="#1F806C" />)}
                  </div>
                </div>
              )}
              {wrong.length > 0 && (
                <div>
                  <div style={sectionHeader}>Guessed wrong</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {wrong.map(w => <Row key={w.id} w={w} sign="-" icon="✗" bg="#C44555" />)}
                  </div>
                </div>
              )}
              {missed.length > 0 && (
                <div>
                  <div style={sectionHeader}>Should have guessed</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {missed.map(w => <Row key={w.id} w={w} sign="-" icon="✗" bg="#C44555" />)}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 20, marginBottom: 20 }}>
                {total >= 0 ? `+${total}` : total} Total
              </div>

              <button onClick={dismissResults} style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px", width: "100%" }}>Got It</button>
            </div>
          </div>
        </div>
      )
    }
    if (game.pool_needs_topup && !topupSubmittedLocal && !me?.topup_submitted) {
      const allFilled = topupFields.every(w => w.trim())
      return (
        <div style={{ minHeight: "100dvh", background: RED, color: "white", paddingBottom: BOTTOM_PAD }}>
          <StatusBar dark={DARK} label="More words needed" />
          <div style={{ padding: "24px 20px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>More words needed</div>
            <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 20 }}>The word bank is empty. Let's add some more!</p>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 10 }}>3 more sounds</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {topupFields.map((val, i) => {
                const isTaken = takenTopupIndex === i
                const isDupe = topupDupeIndices.has(i)
                return (
                  <div key={i}>
                    <TextEntry
                      value={val}
                      onChange={v => {
                        setTopupFields(f => f.map((x, j) => j === i ? v : x))
                        if (takenTopupIndex === i) setTakenTopupIndex(null)
                      }}
                      multiline={false} placeholder={`Word ${i + 1}`}
                      bg={isTaken ? "rgba(240,79,82,0.18)" : isDupe ? "#5C1010" : WARM_LIGHT}
                      fontSize={17} maxLength={40}
                      style={{ marginBottom: isTaken ? 4 : 0 }}
                    />
                    {isTaken && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#F04F52", marginTop: 4 }}>
                        "{val}" was already submitted. Try something else.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <RandomIdeas
              bg={WARM_LIGHT}
              iconColor={YELLOW}
              fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
            />
          </div>
          <Footer colors={POKE_COLORS}>
            <FooterButton onClick={submitTopup} disabled={!allFilled || topupHasDuplicates} bg={YELLOW} textColor="#000">Submit</FooterButton>
          </Footer>
        </div>
      )
    }
    return (
      <>
      <div style={{ minHeight: "100dvh", background: RED, color: "white", paddingBottom: BOTTOM_PAD }}>
        <StatusBar dark={DARK} label="Sound Board" />
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 16 }}>Waiting for everyone…</div>
          <WaitingList
            players={players.map(p => ({ name: p.name, done: game.pool_needs_topup ? !!p.topup_submitted : !!p.results_dismissed }))}
            myName={me?.name} colors={{ mid: MID }}
            onPoke={sendInlinePoke} cooldownActive={pokeCooldownActive} pokeJustSent={pokeJustSent}
          />
        </div>
      </div>
      {me && <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />}
      </>
    )
  }

  // ── Main board / guessing phases ──────────────────────────────────
  const isGuessing = game.phase === "guessing"
  const showSelectUI = isGuessing ? amEligibleGuesser : isIt
  const activeTeamLabel = game.active_team === "boys" ? "Boys" : "Girls"
  const onActiveTeam = me?.team === game.active_team

  let actionText
  if (showSelectUI) {
    actionText = isGuessing ? "Select up to 3 words you think they meant." : "Pick 1 to 3 words. Only you can see your picks."
  } else if (isGuessing) {
    actionText = isIt ? "Waiting on your team to guess…" : `Waiting on ${activeTeamLabel} to guess…`
  } else {
    actionText = `Waiting on ${currentPlayer?.first_name ?? "them"} to choose…`
  }

  const scoreBadge = { background: "#fff", color: INK, borderRadius: 6, padding: "1px 8px", fontWeight: 900, display: "inline-block" }

  return (
    <>
      <div style={{ minHeight: "100dvh", background: RED, color: "white", paddingBottom: BOTTOM_PAD }}>
        <div style={{ padding: "14px 20px", background: game.active_team === "boys" ? BOYS : GIRLS, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {activeTeamLabel}' Turn
          </div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            Boys{" "}<span style={scoreBadge}>{game.boys_score}</span>{" "}Girls{" "}<span style={scoreBadge}>{game.girls_score}</span>
          </div>
        </div>
        {showSelectUI ? (
          <div style={{ padding: "14px 20px", textAlign: "center", background: YELLOW, color: "#000" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{actionText}</div>
          </div>
        ) : onActiveTeam ? (
          <div style={{ padding: "14px 20px", textAlign: "center", background: "#fff", color: INK }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{actionText}</div>
          </div>
        ) : (
          <div style={{ padding: "16px 20px 0", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.85 }}>{actionText}</div>
          </div>
        )}
        <div style={{ padding: "20px 0" }}>
          <WordGrid
            slots={slots}
            selected={isGuessing ? guessIds : pickedIds}
            onToggle={isGuessing ? toggleGuess : togglePicked}
            disabled={!showSelectUI}
            liveByWord={liveByWord}
            leaving={leavingCells}
            entering={enteringCells}
          />
        </div>
      </div>

      {showSelectUI ? (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          {isGuessing ? (
            <FooterButton onClick={submitGuess} disabled={guessIds.size < 1} bg={YELLOW} textColor="#000">Submit Guess</FooterButton>
          ) : (
            <FooterButton onClick={lockSelection} disabled={pickedIds.size < 1} bg={YELLOW} textColor="#000">Lock In</FooterButton>
          )}
        </Footer>
      ) : (
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
      )}

      {me && <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />}

      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me?.name}
        allPlayers={players.map(p => p.name)}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, teamColor: teamColor(p.team), teamLabel: p.team === "boys" ? "Boys" : "Girls" }))}
        gamePhase={game.phase}
        rules={rulesForMenu}
        settingsContent={
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.7, marginBottom: 6 }}>Boys</div>
            <input type="number" defaultValue={game.boys_score} onChange={e => setScoreForm(f => ({ ...f, boys: e.target.value }))}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, padding: "12px 14px", width: "100%", border: "none", marginBottom: 14 }} />
            <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.7, marginBottom: 6 }}>Girls</div>
            <input type="number" defaultValue={game.girls_score} onChange={e => setScoreForm(f => ({ ...f, girls: e.target.value }))}
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, padding: "12px 14px", width: "100%", border: "none", marginBottom: 14 }} />
            <button onClick={saveScores} style={{ background: YELLOW, color: "#000", fontSize: 15, fontWeight: 900, padding: "12px", width: "100%" }}>Save</button>
          </div>
        }
      />
    </>
  )
}
