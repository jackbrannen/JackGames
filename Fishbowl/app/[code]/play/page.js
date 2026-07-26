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
import { playYourTurn } from "../../../lib/sounds"
import EndGame from "../../../components/EndGame"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const T1         = "#3378FF"  // page background blue
const WARM_LIGHT = "#3399FF"
const BOYS   = "#F97316"  // boys team orange
const GIRLS  = "#C026D3"  // girls team fuchsia
const YELLOW = "#FBDF54"
const TEAL   = "#12BAAA"
const RED    = "#F04F52"

function _tone(ctx, freq, dur, vol = 0.06, type = "sine", delay = 0) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const t0 = ctx.currentTime + delay
  osc.type = type; osc.frequency.value = freq
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(t0); osc.stop(t0 + dur)
}
function _sfx(fn) {
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); fn(c); setTimeout(() => c.close(), 600) } catch {}
}
function sfxCorrect()    { _sfx(c => { _tone(c, 660, 0.10, 0.07); _tone(c, 880, 0.18, 0.08, "sine", 0.09) }) }
function sfxSkip()       { _sfx(c => { _tone(c, 370, 0.18, 0.05) }) }
function sfxPause()      { _sfx(c => { _tone(c, 523, 0.08, 0.06); _tone(c, 392, 0.22, 0.05, "sine", 0.07) }) }
function sfxResume()     { _sfx(c => { _tone(c, 392, 0.08, 0.05); _tone(c, 523, 0.18, 0.06, "sine", 0.07) }) }
function sfxStartRound() { _sfx(c => { _tone(c, 440, 0.12, 0.06); _tone(c, 660, 0.20, 0.07, "sine", 0.11) }) }
function sfxEndRound()   { _sfx(c => { _tone(c, 660, 0.12, 0.07); _tone(c, 440, 0.28, 0.06, "sine", 0.11) }) }
function sfxEndTurn()    { _sfx(c => { _tone(c, 880, 0.22, 0.05, "square") }) }


function buildOnDeck(players, game, count = 4) {
  const team1 = players.filter((p) => p.team === 1)
  const team2 = players.filter((p) => p.team === 2)
  let idx1 = game?.turn_index_team1 ?? 0
  let idx2 = game?.turn_index_team2 ?? 0
  const currentPlayer = players.find((p) => p.id === game?.turn_player_id)
  let nextTeam = currentPlayer?.team ?? game?.turn_team ?? 1
  const deck = []

  for (let i = 0; i < count; i += 1) {
    if (!team1.length && !team2.length) break
    if (!team1.length) nextTeam = 2
    if (!team2.length) nextTeam = 1

    if (nextTeam === 1) {
      const player = team1[idx1 % team1.length]
      if (player) deck.push(player)
      idx1 += 1
      nextTeam = team2.length ? 2 : 1
    } else {
      const player = team2[idx2 % team2.length]
      if (player) deck.push(player)
      idx2 += 1
      nextTeam = team1.length ? 1 : 2
    }
  }

  return deck
}


function clueTextSize(text) {
  const len = text?.length ?? 0
  if (len < 8) return 72
  if (len < 14) return 58
  if (len < 22) return 46
  if (len < 32) return 36
  return 28
}


const POKE_COLORS = { dark: "#0C47E9", mid: "#2357E7", wl: "#3399FF", yellow: "#FBDF54", notifBg: "#071A6B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`


export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [game, setGame] = useState(null)
  const [playAgainError, setPlayAgainError] = useState(null)
  const [players, setPlayers] = useState([])
  const [activeClue, setActiveClue] = useState(null)
  const [nextClue, setNextClue] = useState(null)
  const [cluesInBowl, setCluesInBowl] = useState(0)
  const [allClues, setAllClues] = useState([])
  const [nowMs, setNowMs] = useState(Date.now())
  const [manualT1, setManualT1] = useState("0")
  const [manualT2, setManualT2] = useState("0")
  const [roundsTotal, setRoundsTotal] = useState("3")
  const [menuOpen, setMenuOpen] = useState(false)
  const [instructions, setInstructions] = useState("")
  const endingRef = useRef(false)
  const prevRunningRef = useRef(false)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flying, setFlying] = useState(null) // null | 'correct' | 'skip' | 'enter-from-left' | 'enter-from-right'
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)
  const dragDirection = useRef(null) // 'h' | 'v' | null
  const dragXRef = useRef(0) // live drag position, readable in handleTouchEnd without stale closure
  const cardRef = useRef(null) // imperative handle to card DOM node for Web Animations API
  const correctPanelRef = useRef(null)
  const skipPanelRef = useRef(null)
  const animatingRef = useRef(false) // true during swipe animation — prevents stale loadState from clobbering prefetched clue
  const loadEpochRef = useRef(0)     // incremented on every loadState call; stale completions are discarded
  const soundTriggerRef = useRef(null)
  const syncChRef = useRef(null)
  const syncKeyRef = useRef(null)

  useEffect(() => {
    if (!game || !myPlayerId) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playYourTurn()
  }, [game?.phase])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "fishbowl").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`fishbowl:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  async function loadState() {
    const epoch = ++loadEpochRef.current

    // ── 1. Fetch all data before touching any state ──────────────────────────
    const { data: gameData } = await supabase
      .from("games")
      .select(
        "code,phase,locked,round_index,rounds_total,turn_team,turn_player_id,turn_running,turn_started_at,turn_duration_seconds,turn_seconds_remaining,turn_index_team1,turn_index_team2,team1_score,team2_score,skip_mode,skip_limit,skip_penalty,turn_skips_used,turn_skipped_clue_ids,active_clue_id,turn_new_round_continuation,turn_paused,next_game,replay_code"
      )
      .eq("code", code)
      .single()

    if (!gameData) return
    if (gameData.replay_code) { router.replace(`/${gameData.replay_code}`); return }

    const { data: playerData } = await supabase
      .from("players")
      .select("id,name,team,ready,created_at,time_bank_seconds")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    let clueData = null
    let nextData = null
    if (gameData.active_clue_id && !animatingRef.current) {
      const { data: cd } = await supabase
        .from("clues")
        .select("id,text")
        .eq("id", gameData.active_clue_id)
        .single()
      clueData = cd ?? null

      if (gameData.turn_running) {
        const { data: nd } = await supabase
          .from("clues")
          .select("id,text")
          .eq("game_code", code)
          .eq("status", "in_bowl")
          .neq("id", gameData.active_clue_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
        nextData = nd ?? null
      }
    }

    let clueCount = null
    if (gameData.phase === "play") {
      const { count } = await supabase
        .from("clues")
        .select("id", { count: "exact", head: true })
        .eq("game_code", code)
        .eq("status", "in_bowl")
      clueCount = count ?? 0
    }

    let allCluesData = null
    if (gameData.phase === "finished") {
      const { data: clues } = await supabase
        .from("clues")
        .select("id,text,player_id,status,used_in_round")
        .eq("game_code", code)
        .order("created_at", { ascending: true })
      allCluesData = clues ?? []
    }

    // ── 2. Discard if a newer loadState has started ──────────────────────────
    if (loadEpochRef.current !== epoch) return

    // ── 3. Apply all state updates together (React batches into one render) ──
    setGame(gameData)
    setPlayers(playerData ?? [])
    // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
    const syncKey = `${gameData.phase}:${gameData.round ?? ""}:${gameData.current_player_id ?? ""}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) syncChRef.current?.send({ type: "broadcast", event: "sync" })
    syncKeyRef.current = syncKey
    setManualT1(String(gameData.team1_score ?? 0))
    setManualT2(String(gameData.team2_score ?? 0))
    setRoundsTotal(String(gameData.rounds_total ?? 3))

    if (!animatingRef.current) {
      if (gameData.active_clue_id) {
        setActiveClue(clueData)
        setNextClue(nextData)
      } else {
        setActiveClue(null)
        setNextClue(null)
      }
    }

    if (clueCount !== null) setCluesInBowl(clueCount)
    if (allCluesData !== null) setAllClues(allCluesData)

    if (prevRunningRef.current && !gameData.turn_running) sfxEndTurn()
    prevRunningRef.current = !!gameData.turn_running
  }

  useEffect(() => {
    if (isIdle) return
    loadState()
    // Short poll as a fallback in case a realtime event is missed.
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const ticker = setInterval(() => setNowMs(Date.now()), 300)
    // Realtime so turn changes, scores, and the clue bowl reach the watching
    // team immediately instead of only on the next poll.
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`fishbowl-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "clues", filter: `game_code=eq.${code}` }, loadState)
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
      syncChRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(poll)
      clearInterval(ticker)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  // Redirect everyone back to lobby when a Play Again reset happens (detected via poll)
  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])


  useEffect(() => {
    if (!game?.turn_running) {
      if (cardRef.current) cardRef.current.style.transform = ""
      setDragX(0)
      setDragging(false)
      setFlying(null)
      dragDirection.current = null
      dragXRef.current = 0
    } else {
      setMenuOpen(false)
    }
  }, [game?.turn_running])

  const me = players.find((p) => p.id === myPlayerId)

  const currentActor = players.find((p) => p.id === game?.turn_player_id)
  const isMyTurn = !!me && !!game?.turn_player_id && game.turn_player_id === me.id
  const isPaused = !!game && !!game.turn_paused

  const elapsed = useMemo(() => {
    if (!game?.turn_started_at) return 0
    return Math.floor((Date.now() - new Date(game.turn_started_at).getTime()) / 1000)
  }, [game?.turn_started_at])

  const secondsRemaining = useMemo(() => {
    if (!game) return 0
    if (!game.turn_running || !game.turn_started_at) return game.turn_seconds_remaining ?? 0
    const elapsedNow = Math.floor((nowMs - new Date(game.turn_started_at).getTime()) / 1000)
    return Math.max(0, (game.turn_seconds_remaining ?? 0) - elapsedNow)
  }, [game, nowMs])

  useEffect(() => {
    if (!game?.turn_running || !isMyTurn || secondsRemaining > 0 || !game.active_clue_id || endingRef.current) return
    endingRef.current = true
    ;(async () => {
      try {
        await rpc("end_turn", { p_code: code, p_reason: "time" })
      } finally { endingRef.current = false }
    })()
  }, [code, game?.turn_running, isMyTurn, secondsRemaining])

  useEffect(() => {
    if (!game?.turn_running || !isMyTurn || game?.active_clue_id || endingRef.current) return
    endingRef.current = true
    ;(async () => {
      try {
        if (secondsRemaining >= 3) {
          await rpc("pause_for_new_round", { p_code: code, p_player_id: me.id })
        } else {
          await rpc("end_turn_new_round", { p_code: code })
        }
      } finally { endingRef.current = false }
    })()
  }, [code, game?.turn_running, isMyTurn, game?.active_clue_id, secondsRemaining])

  const onDeck = useMemo(() => buildOnDeck(players, game), [players, game])

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Refresh immediately so the acting client's own button resolves right
    // away instead of waiting on its own realtime round-trip or another
    // peer's gossip nudge (both of which can take a few seconds).
    await loadState()
  }

  async function saveScoreAndSettings() {
    await supabase
      .from("games")
      .update({
        team1_score: Number(manualT1) || 0,
        team2_score: Number(manualT2) || 0,
        rounds_total: Math.max(1, Number(roundsTotal) || 1),
      })
      .eq("code", code)
    await loadState()
  }

  async function doStartRound() {
    sfxStartRound()
    await rpc("start_round", { p_code: code })
  }

  async function doStartTurn() {
    if (!me) return
    if (isPaused) {
      sfxResume()
      await supabase.rpc("resume_turn", { p_code: code, p_player_id: me.id })
      await loadState() // Immediate feedback for resume
    } else {
      await rpc("start_turn", { p_code: code, p_player_id: me.id })
    }
  }

  async function doCorrect() {
    if (!activeClue || !me) return null
    sfxCorrect()
    const { data } = await supabase.rpc("score_correct", { p_code: code, p_clue_id: activeClue.id, p_team: me.team })
    await loadState() // Immediate feedback for score update
    return data?.[0] ? { id: data[0].new_clue_id, text: data[0].new_clue_text } : null
  }

  async function doSkip() {
    if (!activeClue) return null
    sfxSkip()
    const { data } = await supabase.rpc("skip_clue", { p_code: code, p_clue_id: activeClue.id })
    await loadState() // Immediate feedback for score update
    return data?.[0] ? { id: data[0].new_clue_id, text: data[0].new_clue_text } : null
  }

  async function doEndTurn(reason = "manual") {
    await rpc("end_turn", { p_code: code, p_reason: reason })
  }

  async function doPassTurn() {
    if (!me) return
    await rpc("pass_turn", { p_code: code, p_player_id: me.id })
  }

  async function doEndRound() {
    sfxEndRound()
    await rpc("end_round", { p_code: code })
  }

  async function doPause() {
    if (!me) return
    sfxPause()
    await supabase.rpc("pause_turn", { p_code: code, p_player_id: me.id })
    await loadState() // Immediate feedback for pause state
  }

  async function doContinueTurn() {
    if (!me) return
    await rpc("start_round", { p_code: code })
    await rpc("start_turn", { p_code: code, p_player_id: me.id })
  }


  async function doPlayAgain() {
    setPlayAgainError(null)
    if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
    const { data, error } = await supabase.rpc("create_fishbowl_replay", { p_code: code })
    if (error) { setPlayAgainError(error.message); return }
    syncChRef.current?.send({ type: "broadcast", event: "sync" })
    router.replace(`/${data}`)
  }

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: T1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Loading…</p>
      </div>
      </>
    )
  }

  if (game.phase === "finished") {
    const t1Score = game.team1_score ?? 0
    const t2Score = game.team2_score ?? 0
    const t1Wins = t1Score > t2Score
    const t2Wins = t2Score > t1Score
    const team1Players = players.filter(p => p.team === 1)
    const team2Players = players.filter(p => p.team === 2)

    const teamAbove = (
      <div style={{ display: "flex", flexDirection: "column", gap: GAP.card, marginBottom: 32 }}>
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
                {team.names.length > 0 && <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{team.names.join(", ")}</div>}
              </div>
              {team.winner && <span style={{ fontSize: 11, fontWeight: 800, color: team.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
            </div>
          </div>
        ))}
      </div>
    )

    const clueList = players.filter(p => allClues.some(c => c.player_id === p.id)).length > 0 ? (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 20 }}>All Clues</div>
        {players.filter(p => allClues.some(c => c.player_id === p.id)).map(player => (
          <div key={player.id} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{player.name}</div>
            <div style={{ fontSize: 16, fontWeight: 400, opacity: 0.85, lineHeight: 1.5 }}>
              {allClues.filter(c => c.player_id === player.id).map(c => c.text).join(", ")}
            </div>
          </div>
        ))}
      </div>
    ) : null

    return (
      <>
      <div style={{ minHeight: "100dvh", background: T1, color: "white", display: "flex", flexDirection: "column" }}>
        <EndGame
          players={[]}
          onPlayAgain={doPlayAgain}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: YELLOW, wl: "#2357E7" }}
          aboveScores={teamAbove}
          belowButtons={clueList}
        />
      </div>
      {me && <>
        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({
            name: p.name,
            teamColor: p.team === 1 ? BOYS : p.team === 2 ? GIRLS : undefined,
            teamLabel: p.team === 1 ? "Boys" : p.team === 2 ? "Girls" : undefined,
          }))}
          gamePhase={game?.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await supabase.rpc("reset_game_for_replay", { p_code: code }); await loadState() }}
        />
      </>}
      </>
    )
  }

  const skipDisabled = !activeClue || cluesInBowl <= 1 || (game.skip_limit > 0 && game.turn_skips_used >= game.skip_limit)

  const SWIPE_THRESHOLD = 80

  // Run a Web Animations API animation and commit the end state to inline style
  async function runAnim(el, keyframes, options) {
    const anim = el.animate(keyframes, { ...options, fill: "forwards" })
    await anim.finished
    anim.commitStyles()
    anim.cancel()
  }

  function handleTouchStart(e) {
    dragStartX.current = e.touches[0].clientX
    dragStartY.current = e.touches[0].clientY
    dragDirection.current = null
    setDragging(true)
  }

  function setPanelSide(showCorrect) {
    if (correctPanelRef.current) correctPanelRef.current.style.zIndex = showCorrect ? 1 : 0
    if (skipPanelRef.current) skipPanelRef.current.style.zIndex = showCorrect ? 0 : 1
  }

  function handleTouchMove(e) {
    const dx = e.touches[0].clientX - dragStartX.current
    const dy = e.touches[0].clientY - dragStartY.current
    if (dragDirection.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragDirection.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v"
    }
    if (dragDirection.current === "h") {
      e.preventDefault()
      const newDragX = dx < 0 && skipDisabled ? dx / 4 : dx
      dragXRef.current = newDragX
      setDragX(newDragX) // for panel active-state scaling only
      if (cardRef.current) cardRef.current.style.transform = `translateX(${newDragX}px)`
      setPanelSide(newDragX >= 0) // keep panel z-index in sync without waiting for React
    }
  }

  async function handleTouchEnd() {
    const dx = dragXRef.current
    const dir = dragDirection.current
    dragDirection.current = null
    dragXRef.current = 0
    setDragging(false)

    const card = cardRef.current
    if (!card) { setDragX(0); return }

    if (dir === "h") {
      if (dx >= SWIPE_THRESHOLD && activeClue) {
        animatingRef.current = true
        setFlying("correct")
        const actionPromise = doCorrect() // concurrent with fly-off animation
        await runAnim(card,
          [{ transform: `translateX(${dx}px)` }, { transform: "translateX(110%)" }],
          { duration: 180, easing: "ease-in" }
        )
        const serverClue = await actionPromise // almost always already resolved
        setActiveClue(serverClue ?? nextClue)
        setDragX(0)
        setFlying("enter-from-left")
        card.style.transform = "translateX(-110%)"
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        await runAnim(card,
          [{ transform: "translateX(-110%)" }, { transform: "translateX(0)" }],
          { duration: 280, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }
        )
        card.style.transform = ""
        setFlying(null)
        animatingRef.current = false
        loadState()
        return
      } else if (dx <= -SWIPE_THRESHOLD && !skipDisabled) {
        animatingRef.current = true
        setFlying("skip")
        const actionPromise = doSkip() // concurrent with fly-off animation
        await runAnim(card,
          [{ transform: `translateX(${dx}px)` }, { transform: "translateX(-110%)" }],
          { duration: 180, easing: "ease-in" }
        )
        const serverClue = await actionPromise // almost always already resolved
        setActiveClue(serverClue ?? nextClue)
        setDragX(0)
        setFlying("enter-from-right")
        card.style.transform = "translateX(110%)"
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        await runAnim(card,
          [{ transform: "translateX(110%)" }, { transform: "translateX(0)" }],
          { duration: 280, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }
        )
        card.style.transform = ""
        setFlying(null)
        animatingRef.current = false
        loadState()
        return
      }
    }

    // Snap back with spring bounce
    await runAnim(card,
      [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
      { duration: 280, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }
    )
    card.style.transform = ""
    setDragX(0)
  }

  const timerUrgent = secondsRemaining <= 5

  const hasPassTurn = !!(me && game.phase === "play" && isMyTurn && !game.turn_running && !isPaused && players.filter(p => p.team === me.team).length > 1)
  const footerHeight = hasPassTurn ? FOOTER_H * 2 : FOOTER_H
  const dynamicBottomPad = `calc(${footerHeight + 8}px + env(safe-area-inset-bottom))`

  // Footer action buttons — primary actions for each non-active-turn state
  const footerAction = me ? (() => {
    if (game.phase === "between_rounds" && isMyTurn) {
      if (game.turn_new_round_continuation && me.time_bank_seconds != null)
        return <FooterButton onClick={doContinueTurn} style={{ fontSize: 20 }}>Continue Turn</FooterButton>
      if (!game.turn_new_round_continuation)
        return <FooterButton onClick={doStartRound} style={{ fontSize: 20 }}>Begin My Turn</FooterButton>
    }
    if (game.phase === "play" && isMyTurn && !game.turn_running) {
      if (isPaused)
        return <FooterButton onClick={doStartTurn} style={{ fontSize: 20 }}>Resume Turn</FooterButton>
      if (hasPassTurn)
        return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <FooterButton onClick={doStartTurn} style={{ fontSize: 20 }}>Start Turn</FooterButton>
            <FooterButton variant="secondary" onClick={doPassTurn} style={{ fontSize: 16 }}>Pass turn to another player</FooterButton>
          </div>
        )
      return <FooterButton onClick={doStartTurn} style={{ fontSize: 20 }}>Start Turn</FooterButton>
    }
    return null
  })() : null

  const showTurnActionBar = game.phase === "play" && isMyTurn && !!game.turn_running

  return (
    <>
    <div style={{ minHeight: "100dvh", background: T1, color: "white", display: "flex", flexDirection: "column" }}>

      {/* Top bar: scores + round */}
      <div style={{ padding: "16px 20px", background: "#0C47E9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center", minWidth: 40 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 2 }}>Round</div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              {game.round_index ?? 1}<span style={{ opacity: 0.65, fontWeight: 600 }}>/{game.rounds_total ?? 3}</span>
            </div>
          </div>
          {game.phase === "play" && (
            <div style={{ textAlign: "center", minWidth: 40 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 2 }}>Clues Left</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{cluesInBowl}</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: SPACE.md, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 2 }}>Boys</div>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: currentActor?.team === 1 && game.phase !== "finished" ? YELLOW : "white" }}>
              {game.team1_score ?? 0}
            </div>
          </div>
          <div style={{ fontSize: 20, opacity: 0.2, fontWeight: 300 }}>–</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 2 }}>Girls</div>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: currentActor?.team === 2 && game.phase !== "finished" ? YELLOW : "white" }}>
              {game.team2_score ?? 0}
            </div>
          </div>
        </div>

      </div>

      {/* Turn banner */}
      {(game.phase === "play" || game.phase === "between_rounds") && currentActor && (
        <>
          <div style={{
            background: currentActor.team === 1 ? BOYS : GIRLS,
            padding: "14px 20px",
            textAlign: "center",
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "0.04em" }}>
              {currentActor.team === 1 ? "Boys' Turn" : "Girls' Turn"}
              {!isMyTurn && (
                <span style={{ fontWeight: 600, opacity: 0.85 }}>
                  {me?.team === currentActor.team ? " — Guess!" : " — Don't Guess!"}
                </span>
              )}
            </div>
          </div>

          {/* Timer progress bar */}
          {(game.turn_started_at || isPaused) && (
            <>
              <style>{`
                @keyframes fishbowlTimerDrain {
                  from { width: 100%; }
                  to { width: 0%; }
                }
              `}</style>
              <div style={{ height: 16, background: "rgba(0,0,0,0.15)", position: "relative", overflow: "hidden" }}>
                <div
                  key={`timer-${game.turn_player_id}-${game.round_index}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "100%",
                    background: currentActor.team === 1 ? GIRLS : BOYS,
                    animation: `fishbowlTimerDrain ${game.turn_seconds_remaining}s linear forwards`,
                    animationDelay: `-${elapsed}s`,
                    animationPlayState: isPaused ? 'paused' : 'running',
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>


        {/* ROUND BEGINNING */}
        {game.phase === "between_rounds" && (
          <div style={{ padding: "40px 24px", paddingBottom: BOTTOM_PAD, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.75, marginBottom: 12 }}>
              New Round
            </div>
            <div style={{ fontSize: "clamp(44px, 12vw, 72px)", fontWeight: 900, lineHeight: 1, marginBottom: 4, whiteSpace: "nowrap" }}>
              Round {game.round_index ?? 1}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, opacity: 0.6, marginBottom: 48 }}>
              of {game.rounds_total ?? 3}
            </div>

            <div style={{ marginTop: 48 }}>
              {game.turn_new_round_continuation && isMyTurn && me?.time_bank_seconds != null ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 12 }}>
                    Your turn continues!
                  </div>
                  <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
                    {me.time_bank_seconds}<span style={{ fontSize: 36, fontWeight: 600, opacity: 0.6 }}>s</span>
                  </div>
                  <div style={{ fontSize: 15, opacity: 0.65, fontWeight: 600 }}>
                    left on your clock
                  </div>
                </div>
              ) : game.turn_new_round_continuation ? (
                (() => {
                  const actor = players.find((p) => p.id === game.turn_player_id)
                  return (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75, marginBottom: 12 }}>
                        Turn continues
                      </div>
                      <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
                        {actor?.name ?? "Someone"}
                      </div>
                      {actor?.time_bank_seconds != null && (
                        <>
                          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
                            {actor.time_bank_seconds}<span style={{ fontSize: 24, fontWeight: 600, opacity: 0.6 }}>s</span>
                          </div>
                          <div style={{ fontSize: 14, opacity: 0.6, fontWeight: 600 }}>
                            left on their clock
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()
              ) : !isMyTurn ? (
                <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.65, textAlign: "center" }}>
                  Waiting for {currentActor?.name ?? "next player"}…
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* MY TURN */}
        {game.phase === "play" && isMyTurn && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px", paddingBottom: game.turn_running ? `calc(120px + env(safe-area-inset-bottom))` : dynamicBottomPad }}>

            {!game.turn_running ? (
              /* Pre-turn or paused */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: GAP.section, textAlign: "center" }}>
                {isPaused ? (
                  /* PAUSED */
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.6 }}>Paused</div>
                    <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1 }}>
                      {secondsRemaining}<span style={{ fontSize: 36, fontWeight: 600, opacity: 0.6 }}>s</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.6 }}>Your Turn</div>
                    <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>Ready?</div>
                    <div style={{ opacity: 0.65, fontSize: 14, fontWeight: 600, width: "100%", display: "flex", justifyContent: "space-between" }}>
                      <div>← Swipe left for Skip</div>
                      <div>Swipe right for Correct →</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Turn running */
              <>
                {/* Timer */}
                <div style={{
                  fontSize: 96,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: timerUrgent ? YELLOW : "white",
                  marginBottom: 8,
                  flexShrink: 0,
                }}>
                  {secondsRemaining}
                </div>

                {/* Clue — swipeable */}
                {(() => {
                  const showingCorrect =
                    flying === "correct" || flying === "enter-from-left" ? true :
                    flying === "skip" || flying === "enter-from-right" ? false :
                    dragX >= 0
                  const correctActive = flying === "correct" || dragX >= SWIPE_THRESHOLD
                  const skipActive = flying === "skip" || dragX <= -SWIPE_THRESHOLD
                  return (
                    <div style={{ flex: 1, position: "relative", overflow: "hidden", userSelect: "none", marginBottom: 16 }}>

                      {/* Correct panel — left-aligned, green, behind card when swiping right */}
                      <div ref={correctPanelRef} style={{
                        position: "absolute", inset: 0, background: "#22C55E",
                        display: "flex", alignItems: "center", paddingLeft: 28,
                        zIndex: showingCorrect ? 1 : 0,
                      }}>
                        <span style={{
                          fontSize: 30, fontWeight: 900, color: "white", textTransform: "uppercase", letterSpacing: "0.06em",
                          transform: correctActive ? "scale(1.12)" : "scale(1)",
                          transition: "transform 120ms ease",
                          display: "block",
                        }}>✓ Correct</span>
                      </div>

                      {/* Skip panel — right-aligned, dark, behind card when swiping left */}
                      <div ref={skipPanelRef} style={{
                        position: "absolute", inset: 0, background: "#1e1e2e",
                        display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 28,
                        zIndex: showingCorrect ? 0 : 1,
                      }}>
                        <span style={{
                          fontSize: 30, fontWeight: 900, color: skipDisabled ? "rgba(255,255,255,0.3)" : "white", textTransform: "uppercase", letterSpacing: "0.06em",
                          transform: skipActive ? "scale(1.12)" : "scale(1)",
                          transition: "transform 120ms ease",
                          display: "block",
                          textDecoration: skipDisabled ? "line-through" : "none",
                        }}>Skip ✕</span>
                      </div>

                      {/* Clue card — position driven imperatively via cardRef, not React state */}
                      <div
                        ref={cardRef}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{
                          position: "absolute", inset: 0, zIndex: 2,
                          background: T1,
                          display: "flex", alignItems: "center", padding: "0 4px",
                          willChange: "transform",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {cluesInBowl === 1 && activeClue && (
                            <div style={{
                              fontSize: 14,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "0.15em",
                              opacity: 0.75,
                            }}>
                              Last clue left!
                            </div>
                          )}
                          <div style={{
                            fontSize: clueTextSize(activeClue?.text),
                            fontWeight: 900,
                            lineHeight: 1.1,
                            letterSpacing: "-0.5px",
                            wordBreak: "break-word",
                          }}>
                            {activeClue?.text ?? ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

              </>
            )}
          </div>
        )}

        {/* WATCHING (not my turn, turn running) */}
        {game.phase === "play" && !isMyTurn && (
          <div style={{ flex: 1, padding: "32px 24px", paddingBottom: BOTTOM_PAD, display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 40 }}>
              {isPaused && (
                <div style={{ fontSize: 38, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: YELLOW, marginBottom: 10 }}>
                  ⏸ Paused
                </div>
              )}
              {!isPaused && (
                <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
                  Playing Now
                </div>
              )}
              <div style={{ fontSize: "clamp(44px, 12vw, 64px)", fontWeight: 900, lineHeight: 1, marginBottom: 12 }}>
                {currentActor?.name ?? "—"}
              </div>
              {game.turn_running && (
                <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: timerUrgent ? YELLOW : "rgba(255,255,255,0.85)" }}>
                  {secondsRemaining}
                  <span style={{ fontSize: 22, fontWeight: 600, opacity: 0.65 }}>s</span>
                </div>
              )}
              {isPaused && (
                <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, opacity: 0.85 }}>
                  {secondsRemaining}
                  <span style={{ fontSize: 22, fontWeight: 600, opacity: 0.65 }}>s</span>
                </div>
              )}
            </div>

            {onDeck.length > 1 && (
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
                  Up Next
                </div>
                {onDeck.slice(1).map((p, idx) => (
                  <div
                    key={`${p.id}-${idx}`}
                    style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: GAP.result }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.team === 1 ? BOYS : GIRLS, flexShrink: 0, outline: "2px solid rgba(255,255,255,0.3)" }} />
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: 13, opacity: 0.65, fontWeight: 600 }}>{p.team === 1 ? "Boys" : "Girls"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
      {me && <>
        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({
            name: p.name,
            teamColor: p.team === 1 ? BOYS : p.team === 2 ? GIRLS : undefined,
            teamLabel: p.team === 1 ? "Boys" : p.team === 2 ? "Girls" : undefined,
          }))}
          gamePhase={game?.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await supabase.rpc("reset_game_for_replay", { p_code: code }); await loadState() }}
          settingsContent={<>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ color: "white", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: GAP.selection }}>
                Boys
                <input value={manualT1} onChange={e => setManualT1(e.target.value)}
                  style={{ background: POKE_COLORS.wl, color: "white", fontSize: 16, padding: "6px 10px", width: 64 }} />
              </label>
              <label style={{ color: "white", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: GAP.selection }}>
                Girls
                <input value={manualT2} onChange={e => setManualT2(e.target.value)}
                  style={{ background: POKE_COLORS.wl, color: "white", fontSize: 16, padding: "6px 10px", width: 64 }} />
              </label>
              <label style={{ color: "white", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: GAP.selection }}>
                Rounds
                <input value={roundsTotal} onChange={e => setRoundsTotal(e.target.value)}
                  style={{ background: POKE_COLORS.wl, color: "white", fontSize: 16, padding: "6px 10px", width: 64 }} />
              </label>
              <button onClick={saveScoreAndSettings}
                style={{ background: YELLOW, color: "#000", fontSize: 14, fontWeight: 900, padding: "8px 16px" }}>
                Save
              </button>
            </div>
          </>}
        />
        {showTurnActionBar ? (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 80, display: "grid", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <button
              onClick={async () => { animatingRef.current = true; setActiveClue(null); const newClue = await doCorrect(); setActiveClue(newClue); animatingRef.current = false; loadState() }}
              disabled={!activeClue}
              style={{ background: TEAL, color: "white", fontSize: 28, fontWeight: 900, padding: "22px 16px", width: "100%", display: "block" }}
            >
              Correct
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <button
                onClick={async () => { animatingRef.current = true; setActiveClue(null); const newClue = await doSkip(); setActiveClue(newClue); animatingRef.current = false; loadState() }}
                disabled={skipDisabled}
                style={{ background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 800, padding: "16px 8px", textDecoration: skipDisabled ? "line-through" : "none" }}
              >
                {game.skip_penalty < 0 ? `Skip (${game.skip_penalty})` : "Skip"}
              </button>
              <button onClick={isPaused ? doStartTurn : doPause} style={{ background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 800, padding: "16px 8px" }}>
                {isPaused ? "Resume" : "Pause"}
              </button>
              <button onClick={() => doEndTurn(activeClue ? "manual" : "pause_no_clues")} style={{ background: RED, color: "white", fontSize: 16, fontWeight: 800, padding: "16px 8px" }}>
                End Early
              </button>
            </div>
          </div>
        ) : (
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} timerRunning={!!game?.turn_running} height={footerHeight}>
            {footerAction}
          </Footer>
        )}
      </>}
    </>
  )
}
