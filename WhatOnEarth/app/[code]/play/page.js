"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { BG, DARK, MID, WL, YELLOW, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE } from "../../../components/styles"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import StatusBar from "../../../components/StatusBar"
import EndGame from "../../../components/EndGame"
import { playYourTurn, playSubmit } from "../../../lib/sounds"

const TEXT = "white"
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
const POKE_COLORS = { dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: "#0D0D15" }

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [instructions, setInstructions] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [pokes, setPokes] = useState([])

  // Countdown state
  const [countdownRemaining, setCountdownRemaining] = useState(null)

  // Timer state
  const [timerRemaining, setTimerRemaining] = useState(null)

  // Modal state
  const [showGotItModal, setShowGotItModal] = useState(false)
  const [modalAutoOpened, setModalAutoOpened] = useState(false)
  const [selectedAlien, setSelectedAlien] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showEndEarlyModal, setShowEndEarlyModal] = useState(false)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [showNewWordModal, setShowNewWordModal] = useState(false)

  // Loading states
  const [readyLoading, setReadyLoading] = useState(false)
  const [endEarlyLoading, setEndEarlyLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [newWordLoading, setNewWordLoading] = useState(false)

  // Timer state when modal opens
  const timerStateRef = useRef(null)
  const pauseCounterRef = useRef(0)
  const syncChRef = useRef(null)
  const syncKeyRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)

  // Calculate elapsed time for timer animation (stable - only recalculates when attempt starts)
  const timerStartedAt = game?.attempt_start_at
  const elapsed = useMemo(() => {
    if (!timerStartedAt) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(timerStartedAt).getTime()) / 1000))
  }, [timerStartedAt])

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const { data: gameData } = await supabase
      .from("woe_games")
      .select("*")
      .eq("code", code)
      .single()

    if (seq !== loadSeqRef.current) return
    if (gameData) {
      if (gameData.replay_code) { router.replace(`/${gameData.replay_code}`); return }
      if (gameData.phase === "lobby") { router.replace(`/${code}`); return }
      setGame(gameData)
      // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
      const syncKey = `${gameData.phase}:${gameData.round_number ?? ""}:${gameData.current_player_id ?? ""}`
      if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) syncChRef.current?.send({ type: "broadcast", event: "sync" })
      syncKeyRef.current = syncKey
    }

    const { data: playerData } = await supabase
      .from("woe_players")
      .select("*")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    if (seq !== loadSeqRef.current) return
    if (playerData) setPlayers(playerData)
  }

  async function loadPokes() {
    const { data } = await supabase
      .from("pokes")
      .select("*")
      .eq("room_code", code)
      .order("created_at", { ascending: false })
      .limit(10)
    if (data) setPokes(data)
  }

  async function handleAdjustScore(playerId, delta) {
    try {
      const { error } = await supabase.rpc("woe_adjust_score", {
        p_player_id: playerId,
        p_delta: delta,
      })
      if (error) throw error
      await loadState()
    } catch (e) {
      alert("Error adjusting score: " + (e?.message ?? "unknown"))
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(`whatonearth:${code}:playerId`)
    if (stored) setMyPlayerId(stored)
    else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "whatonearth").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    loadPokes()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`woe-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "woe_games", filter: `code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "woe_players", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState(); loadPokes()
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
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code])

  // Reset loading states on phase change
  useEffect(() => {
    console.log('[PHASE CHANGE] Phase is now:', game?.phase, '- resetting all loading states')
    setReadyLoading(false)
    setEndEarlyLoading(false)
    setConfirmLoading(false)
    setPauseLoading(false)
    setResumeLoading(false)
  }, [game?.phase])

  // Reset modal states when round or attempt changes
  useEffect(() => {
    setShowGotItModal(false)
    setModalAutoOpened(false)
    setShowConfirmModal(false)
    setShowEndEarlyModal(false)
    setShowPauseModal(false)
    setShowNewWordModal(false)
    setSelectedAlien(null)
  }, [game?.current_round, game?.current_attempt])


  // Show pause modal when game is paused or someone is awarding points.
  // Suppressed for the earthling who opened the "new word" flow — they see that modal instead.
  useEffect(() => {
    const wasPaused = showPauseModal
    const isAwardingPoints = game?.awarding_points_by && game.awarding_points_by !== myPlayerId

    if (game?.paused || isAwardingPoints) {
      if (!showNewWordModal) setShowPauseModal(true)
    } else {
      setShowPauseModal(false)
      setPauseLoading(false)
      setResumeLoading(false)
      setEndEarlyLoading(false)
      // Increment counter when transitioning from paused to unpaused
      if (wasPaused && game?.paused === false) {
        pauseCounterRef.current += 1
      }
    }
  }, [game?.paused, game?.awarding_points_by, myPlayerId, showPauseModal, showNewWordModal])

  // Countdown timer (ready -> playing)
  useEffect(() => {
    if (game?.phase !== "countdown") {
      setCountdownRemaining(null)
      return
    }

    const duration = game.is_dummy ? 1 : 3
    let remaining = duration

    setCountdownRemaining(remaining)

    const interval = setInterval(() => {
      remaining -= 0.1
      setCountdownRemaining(Math.max(0, remaining))

      if (remaining <= 0) {
        clearInterval(interval)
        // Trigger start_playing
        supabase.rpc("woe_start_playing", { p_code: code }).then(() => loadState())
      }
    }, 100)

    return () => clearInterval(interval)
  }, [game?.phase, game?.is_dummy, code])

  // Playing timer
  useEffect(() => {
    if (game?.phase !== "playing" || !game?.attempt_start_at) {
      setTimerRemaining(null)
      return
    }

    const duration = game.attempt_duration_seconds
    if (duration === 0) {
      setTimerRemaining(null)
      return
    }

    // Don't update timer when paused
    if (game?.paused) {
      return
    }

    function updateTimer() {
      const startTime = new Date(game.attempt_start_at).getTime()
      const now = Date.now()
      const elapsed = (now - startTime) / 1000
      const remaining = Math.max(0, duration - elapsed)
      setTimerRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)
    return () => clearInterval(interval)
  }, [game?.phase, game?.attempt_start_at, game?.attempt_duration_seconds, game?.paused, showGotItModal])


  // Auto-show modal when timer expires (only when it transitions from >0 to 0)
  const prevTimerRef = useRef(null)
  useEffect(() => {
    if (game?.phase === "playing" && timerRemaining !== null && prevTimerRef.current !== null && prevTimerRef.current > 0 && timerRemaining === 0 && !showGotItModal) {
      setShowGotItModal(true)
      setModalAutoOpened(true)
    }
    prevTimerRef.current = timerRemaining
  }, [timerRemaining, game?.phase, showGotItModal])

  // Sound effects when phase changes and it's player's turn
  const soundTriggerRef = useRef(null)
  useEffect(() => {
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game?.phase
    if (!prev || !game) return

    // Play sound when entering ready phase for the current earthlings
    if (game.phase === "ready" && prev !== "ready") {
      const rotation = game.rotation || []
      const currentRound = game.current_round || 1
      const roundData = rotation[currentRound - 1]
      if ((roundData?.earthling_ids ?? []).includes(myPlayerId)) {
        playYourTurn()
      }
    }

    // Play sound when entering playing phase (everyone is active: earthlings
    // co-op, aliens guess)
    if (game.phase === "playing" && prev !== "playing") {
      playYourTurn()
    }
  }, [game?.phase, game?.rotation, game?.current_round, game?.current_attempt, myPlayerId])

  // Auto-advance from intermediate to playing after 3 seconds
  useEffect(() => {
    if (game?.phase !== "intermediate") return

    const timer = setTimeout(async () => {
      try {
        await supabase.rpc("woe_start_playing", { p_code: code })
      } catch (e) {
        console.error("Error starting playing:", e)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [game?.phase, code])

  // Handlers
  async function handleReady() {
    console.log('[READY] Current phase before RPC:', game?.phase)
    console.log('[READY] Setting loading to true')
    setReadyLoading(true)
    try {
      console.log('[READY] Calling woe_mark_ready with:', { p_code: code, p_player_id: myPlayerId })
      const { error } = await supabase.rpc("woe_mark_ready", { p_code: code, p_player_id: myPlayerId })
      if (error) {
        console.error('[READY] RPC error:', error)
        throw error
      }
      console.log('[READY] RPC succeeded, waiting for realtime to update phase')

      // Manually check what happened
      setTimeout(async () => {
        const { data } = await supabase.from("woe_games").select("phase").eq("code", code).single()
        console.log('[READY] Phase after 1 second:', data?.phase)
      }, 1000)

      // Don't call loadState - realtime will update. Loading state resets on phase change.
    } catch (e) {
      console.error('[READY] Caught error:', e)
      alert("Error marking ready: " + (e?.message ?? "unknown"))
      setReadyLoading(false)
    }
  }

  async function handleGotIt() {
    // Save timer state
    timerStateRef.current = timerRemaining
    setShowGotItModal(true)
    // Mark that this player is awarding points
    await supabase.from("woe_games").update({ awarding_points_by: myPlayerId }).eq("code", code)
  }

  function handleEndEarly() {
    timerStateRef.current = timerRemaining
    setShowEndEarlyModal(true)
  }

  async function closeGotItModal() {
    setShowGotItModal(false)
    setSelectedAlien(null)
    timerStateRef.current = null
    // Clear awarding points state
    await supabase.from("woe_games").update({ awarding_points_by: null }).eq("code", code)
  }

  function closeEndEarlyModal() {
    setShowEndEarlyModal(false)
    setEndEarlyLoading(false)
    timerStateRef.current = null
  }

  function selectAlien(alienId) {
    setSelectedAlien(alienId)
    setShowConfirmModal(true)
  }

  function selectNoOne() {
    setSelectedAlien(null)
    setShowConfirmModal(true)
  }

  function closeConfirmModal() {
    setShowConfirmModal(false)
  }

  async function confirmSelection() {
    setConfirmLoading(true)
    try {
      console.log("Calling woe_award_points with:", { p_code: code, p_alien_id: selectedAlien })
      const { error } = await supabase.rpc("woe_award_points", {
        p_code: code,
        p_alien_id: selectedAlien
      })
      if (error) {
        console.error("woe_award_points error:", error)
        throw error
      }
      console.log("woe_award_points succeeded, reloading state")

      // Check word count and refill if low
      const { count } = await supabase
        .from("woe_words")
        .select("*", { count: "exact", head: true })

      if (count !== null && count <= 10) {
        console.log(`Word pool low (${count} words), triggering refill`)
        fetch("/api/generate-words", { method: "POST" })
          .then(res => res.json())
          .then(data => console.log(`Generated ${data.count} new words`))
          .catch(e => console.error("Error generating words:", e))
      }

      await loadState()
      setShowGotItModal(false)
      setShowConfirmModal(false)
      setSelectedAlien(null)
      timerStateRef.current = null
    } catch (e) {
      console.error("confirmSelection error:", e)
      alert("Error awarding points: " + (e?.message ?? "unknown"))
      setConfirmLoading(false)
    }
  }

  async function confirmEndEarly() {
    setEndEarlyLoading(true)
    try {
      const { error } = await supabase.rpc("woe_end_attempt_early", { p_code: code })
      if (error) throw error
      setShowEndEarlyModal(false)
      setShowPauseModal(false)
      timerStateRef.current = null
      // Modal will auto-show when timer hits 0
    } catch (e) {
      alert("Error ending attempt: " + (e?.message ?? "unknown"))
      setEndEarlyLoading(false)
    }
  }

  async function handlePause() {
    setPauseLoading(true)
    try {
      const { error } = await supabase.rpc("woe_pause_game", { p_code: code, p_player_id: myPlayerId })
      if (error) throw error
      // Don't reset loading - modal will show via useEffect
    } catch (e) {
      alert("Error pausing: " + (e?.message ?? "unknown"))
      setPauseLoading(false)
    }
  }

  async function handleNewWord() {
    // Show modal first so it's visible before the realtime pause update arrives
    setShowNewWordModal(true)
    await supabase.rpc("woe_pause_game", { p_code: code, p_player_id: myPlayerId })
  }

  async function handleCancelNewWord() {
    setShowNewWordModal(false)
    await supabase.rpc("woe_resume_game", { p_code: code })
  }

  async function handleConfirmNewWord() {
    setNewWordLoading(true)
    try {
      const { error } = await supabase.rpc("woe_swap_word", { p_code: code })
      if (error) throw error
      setShowNewWordModal(false)
    } catch (e) {
      alert("Error swapping word: " + (e?.message ?? "unknown"))
      setNewWordLoading(false)
    }
  }

  async function handleResume() {
    setResumeLoading(true)
    try {
      const { error } = await supabase.rpc("woe_resume_game", { p_code: code })
      if (error) throw error
      // Don't reset loading - modal will close via useEffect
    } catch (e) {
      alert("Error resuming: " + (e?.message ?? "unknown"))
      setResumeLoading(false)
    }
  }

  async function handleResetToLobby() {
    try {
      const { error } = await supabase.rpc("woe_reset_to_lobby", { p_code: code })
      if (error) throw error
    } catch (e) {
      alert("Error resetting: " + (e?.message ?? "unknown"))
    }
  }

  async function playAgain() {
    try {
      if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
      const { data, error } = await supabase.rpc("woe_create_replay", { p_code: code })
      if (error) throw error
      syncChRef.current?.send({ type: "broadcast", event: "sync" })
      router.replace(`/${data}`)
    } catch (e) {
      alert("Error starting replay: " + (e?.message ?? "unknown"))
    }
  }

  if (!game || !me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "white", fontSize: 18, fontWeight: 600 }}>Loading...</div>
      </div>
    )
  }

  const rotation = game.rotation || []
  const currentRound = game.current_round || 1
  const currentAttempt = game.current_attempt || 1
  const currentRoundData = rotation[currentRound - 1] || {}
  const earthlingIds = currentRoundData.earthling_ids || []

  const earthlings = earthlingIds.map(id => players.find(p => p.id === id)).filter(Boolean)
  const aliens = players.filter(p => !earthlingIds.includes(p.id))

  const isEarthling = earthlingIds.includes(myPlayerId)
  const isAlien = !isEarthling
  const isCooperative = !!game.cooperative

  // Ready screen
  if (game.phase === "ready") {
    const readyPlayers = players.filter(p => p.ready)
    const totalPlayers = players.length
    const readyCount = readyPlayers.length
    const needReady = Math.ceil(totalPlayers / 2)

    // Previous round data
    const previousWord = game.previous_word
    const previousEarthlingIds = game.previous_earthling_ids || []
    const previousAlienId = game.previous_alien_id
    const previousEarthlings = previousEarthlingIds.map(id => players.find(p => p.id === id)).filter(Boolean)
    const previousAlien = players.find(p => p.id === previousAlienId)

    return (
      <>
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={POKE_COLORS}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, score: p.score }))}
          gamePhase={game.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await supabase.rpc("woe_reset_to_lobby", { p_code: code }) }}
          settingsContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {players.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>Score: {p.score ?? 0}</div>
                  </div>
                  <button
                    onClick={() => handleAdjustScore(p.id, -1)}
                    style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
                  >
                    −
                  </button>
                  <button
                    onClick={() => handleAdjustScore(p.id, 1)}
                    style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          }
        />
        <Notifications
          supabase={supabase}
          pokes={pokes}
          roomCode={code}
          currentPlayer={me.name}
          colors={POKE_COLORS}
        />

        <div style={{ minHeight: "100dvh", background: BG, paddingBottom: BOTTOM_PAD }}>
          <div style={{ padding: "14px 20px", background: WL, flexShrink: 0 }}>
            <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT }}>
              Round {currentRound} of {rotation.length}
            </div>
          </div>

          <div style={{ padding: `${SPACE.xl}px ${SPACE.lg}px` }}>
            {/* Previous round result */}
            {currentRound > 1 && previousWord && (
              <div style={{ textAlign: "center", marginBottom: SPACE.xxl, opacity: OPACITY.muted }}>
                <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, marginBottom: SPACE.xs }}>
                  {previousAlienId && previousEarthlings.length > 0 && previousAlien
                    ? `${previousEarthlings.map(e => e.name).join(" & ")} + ${previousAlien.name} got it!`
                    : "No one got it!"}
                </div>
                <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>
                  Last word: {previousWord}
                </div>
              </div>
            )}

            {/* Role assignments */}
            <div style={{ background: MID, padding: SPACE.lg, marginBottom: SPACE.xxl }}>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: SPACE.md }}>
                Earthlings
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs, marginBottom: SPACE.lg }}>
                {earthlings.map(e => (
                  <div key={e.id} style={{ fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.black, color: TEXT }}>
                    {e.name}
                  </div>
                ))}
              </div>

              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: SPACE.md }}>
                Aliens
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
                {aliens.map(alien => (
                  <div key={alien.id} style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: OPACITY.strong }}>
                    {alien.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Waiting message */}
            <div style={{ textAlign: "center", marginBottom: SPACE.xxl }}>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: YELLOW }}>
                Waiting on the earthlings to hit Ready
              </div>
            </div>

            {/* Scoreboard */}
            <div>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: SPACE.md }}>
                {isCooperative ? "Group Score" : "Scores"}
              </div>
              {isCooperative ? (
                <div style={{ background: MID, padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: YELLOW }}>{game.group_score ?? 0}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: TEXT, opacity: 0.6 }}> / {rotation.length * 3}</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
                  {(() => {
                    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
                    const topScore = sortedPlayers[0]?.score ?? 0
                    return sortedPlayers.map((p) => {
                      const isLeader = p.score === topScore && topScore > 0
                      return (
                        <div key={p.id} style={{ display: "flex" }}>
                          <div style={{ background: isLeader ? YELLOW : "rgba(255,255,255,0.15)", color: isLeader ? "#000" : "rgba(255,255,255,0.75)", fontSize: 20, fontWeight: 900, minWidth: 52, textAlign: "center", padding: "10px 0", flexShrink: 0 }}>
                            {p.score}
                          </div>
                          <div style={{ background: MID, padding: "10px 16px", flex: 1, display: "flex", alignItems: "center" }}>
                            <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>{p.name}</span>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          </div>

          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
            {isEarthling && (
              <FooterButton key={`ready-${currentRound}`} onClick={handleReady} loading={readyLoading} bg={YELLOW}>
                Ready
              </FooterButton>
            )}
          </Footer>
        </div>
      </>
    )
  }

  // Countdown
  if (game.phase === "countdown") {
    const displayNum = countdownRemaining !== null ? Math.ceil(countdownRemaining) : 3

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: YELLOW }}>
          {displayNum}
        </div>
      </div>
    )
  }

  // Playing
  if (game.phase === "playing") {
    const word = game.current_word
    const letters = game.current_letters || ""

    const showTimer = game.attempt_duration_seconds > 0
    const timerDisplay = timerRemaining !== null ? Math.ceil(timerRemaining) : 0
    const timerText = `${timerDisplay}`

    return (
      <>
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={POKE_COLORS}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, score: p.score }))}
          gamePhase={game.phase}
          rules={instructions ? [["How to Play", instructions]] : null}
          onResetToLobby={async () => { await supabase.rpc("woe_reset_to_lobby", { p_code: code }) }}
          settingsContent={
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {players.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>Score: {p.score ?? 0}</div>
                  </div>
                  <button
                    onClick={() => handleAdjustScore(p.id, -1)}
                    style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
                  >
                    −
                  </button>
                  <button
                    onClick={() => handleAdjustScore(p.id, 1)}
                    style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          }
        />
        <Notifications
          supabase={supabase}
          pokes={pokes}
          roomCode={code}
          currentPlayer={me.name}
          colors={POKE_COLORS}
        />

        <div style={{ minHeight: "100dvh", background: BG, paddingBottom: BOTTOM_PAD }}>
          {/* Status bar */}
          <div style={{ padding: "14px 20px", background: WL, flexShrink: 0 }}>
            <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT }}>
              Attempt {currentAttempt} of 3 — {earthlings.map(e => e.name).join(" & ")}
            </div>
          </div>

          {/* Timer progress bar */}
          {game.attempt_duration_seconds > 0 && game.attempt_start_at && (
            <>
              <style>{`
                @keyframes woeTimerDrain {
                  from { width: 100%; }
                  to { width: 0%; }
                }
              `}</style>
              <div style={{ height: 16, background: "rgba(0,0,0,0.15)", position: "relative", overflow: "hidden" }}>
                <div
                  key={`timer-${game.current_round}-${game.current_attempt}-${pauseCounterRef.current}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "100%",
                    background: YELLOW,
                    animation: `woeTimerDrain ${game.attempt_duration_seconds}s linear forwards`,
                    animationDelay: `-${elapsed}s`,
                    animationPlayState: game.paused ? 'paused' : 'running',
                  }}
                />
              </div>
            </>
          )}

          {/* Role banner */}
          {isEarthling && (
            <div style={{ background: YELLOW, color: "#000", textAlign: "center", padding: `${SPACE.md}px`, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold }}>
              Your turn!
            </div>
          )}
          {isAlien && (
            <div style={{ background: "#fff", textAlign: "center", padding: `${SPACE.md}px` }}>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: "#000", opacity: 0.4, marginBottom: 4 }}>
                Alien
              </div>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: "#000" }}>
                Guess the word or phrase
              </div>
            </div>
          )}

          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            {/* Earthlings see the word */}
            {isEarthling && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 48, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 10 }}>
                  {word}
                </div>
                {currentAttempt === 1 && !game.word_swap_used && (
                  <button
                    onClick={handleNewWord}
                    style={{ background: MID, border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 16px" }}
                  >
                    New word
                  </button>
                )}
              </div>
            )}

            {/* Translator letters */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ background: MID, padding: "24px 20px" }}>
                <div style={{ fontSize: 36, fontWeight: FONT_WEIGHT.black, color: YELLOW, letterSpacing: "0.2em", lineHeight: 1.2 }}>
                  {letters}
                </div>
              </div>
            </div>

            {/* Timer */}
            {showTimer && (
              <div style={{ fontSize: 24, fontWeight: FONT_WEIGHT.bold, color: TEXT, opacity: 0.5 }}>
                {timerText}
              </div>
            )}
          </div>

          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={isEarthling ? 112 : 56}>
            {isEarthling && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <FooterButton key={`got-it-${game.current_round}-${game.current_attempt}`} onClick={handleGotIt} bg={YELLOW} textColor="#000">
                  Got it!
                </FooterButton>
                <div style={{ display: "flex", flex: 1 }}>
                  <FooterButton key={`end-early-${game.current_round}-${game.current_attempt}`} onClick={handleEndEarly} loading={endEarlyLoading} bg={MID} textColor="#fff">
                    End early
                  </FooterButton>
                  <FooterButton key={`pause-${game.current_round}-${game.current_attempt}`} onClick={handlePause} loading={pauseLoading} bg={WL} textColor="#fff">
                    Pause
                  </FooterButton>
                </div>
              </div>
            )}
          </Footer>
        </div>

        {/* Got it modal */}
        {showGotItModal && (
          <div onClick={modalAutoOpened ? undefined : closeGotItModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 20, textAlign: "center" }}>
                {modalAutoOpened ? "Did anyone figure it out?" : "Who figured it out?"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {aliens.map(alien => (
                  <button
                    key={alien.id}
                    onClick={() => selectAlien(alien.id)}
                    style={{ background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    {alien.name}
                  </button>
                ))}
                <button
                  onClick={selectNoOne}
                  style={{ background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  No one
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation modal */}
        {showConfirmModal && (
          <div onClick={closeConfirmModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 101, padding: "24px" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
              {selectedAlien ? (
                <>
                  <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 20, textAlign: "center" }}>
                    Award points?
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    {[
                      ...earthlings.map(e => ({ name: e.name, points: 4 - currentAttempt })),
                      { name: aliens.find(a => a.id === selectedAlien)?.name, points: 4 - currentAttempt }
                    ].map((p, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: WL, marginBottom: 8 }}>
                        <span style={{ fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>{p.name}</span>
                        <span style={{ fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, color: YELLOW }}>+{p.points} pts</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 12, textAlign: "center" }}>
                    No one guessed correctly?
                  </div>
                  <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65, marginBottom: 20, textAlign: "center" }}>
                    No points awarded this round.
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={closeConfirmModal}
                  disabled={confirmLoading}
                  style={{ flex: 1, background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: confirmLoading ? "default" : "pointer", opacity: confirmLoading ? 0.5 : 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSelection}
                  disabled={confirmLoading}
                  style={{ flex: 1, background: YELLOW, color: "#000", fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: confirmLoading ? "default" : "pointer", opacity: confirmLoading ? 0.5 : 1 }}
                >
                  {confirmLoading ? "Confirming..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End early modal */}
        {showEndEarlyModal && (
          <div onClick={closeEndEarlyModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 12, textAlign: "center" }}>
                Skip this turn?
              </div>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65, marginBottom: 20, textAlign: "center" }}>
                Game will move to the next turn.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={closeEndEarlyModal}
                  disabled={endEarlyLoading}
                  style={{ flex: 1, background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: endEarlyLoading ? "default" : "pointer", opacity: endEarlyLoading ? 0.5 : 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEndEarly}
                  disabled={endEarlyLoading}
                  style={{ flex: 1, background: YELLOW, color: "#000", fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: endEarlyLoading ? "default" : "pointer", opacity: endEarlyLoading ? 0.5 : 1 }}
                >
                  {endEarlyLoading ? "Skipping..." : "Skip turn"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New word modal */}
        {showNewWordModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px" }}>
            <div style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 12, textAlign: "center" }}>
                Get a new word?
              </div>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65, marginBottom: 24, textAlign: "center" }}>
                You can only do this once per round, on the first attempt.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleCancelNewWord}
                  disabled={newWordLoading}
                  style={{ flex: 1, background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: newWordLoading ? "default" : "pointer", opacity: newWordLoading ? 0.5 : 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmNewWord}
                  disabled={newWordLoading}
                  style={{ flex: 1, background: YELLOW, color: "#000", fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: newWordLoading ? "default" : "pointer", opacity: newWordLoading ? 0.5 : 1 }}
                >
                  {newWordLoading ? "Getting word..." : "Get new word"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pause modal */}
        {showPauseModal && !showNewWordModal && (() => {
          const pausedPlayer = players.find(p => p.id === game.paused_by)
          const awardingPlayer = players.find(p => p.id === game.awarding_points_by)
          const isPauser = myPlayerId === game.paused_by
          const isAwarding = game.awarding_points_by && game.awarding_points_by !== myPlayerId

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px" }}>
              <div style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
                <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 20, textAlign: "center" }}>
                  Paused
                </div>

                {isAwarding ? (
                  <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.75, textAlign: "center" }}>
                    {awardingPlayer?.name} is awarding points
                  </div>
                ) : isPauser ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        onClick={handleResume}
                        disabled={resumeLoading}
                        style={{ background: YELLOW, color: "#000", fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.black, padding: "16px", border: "none", cursor: resumeLoading ? "default" : "pointer", opacity: resumeLoading ? 0.5 : 1 }}
                      >
                        {resumeLoading ? "Resuming..." : "Resume"}
                      </button>
                      <button
                        onClick={confirmEndEarly}
                        disabled={endEarlyLoading}
                        style={{ background: WL, color: TEXT, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, padding: "16px", border: "none", cursor: endEarlyLoading ? "default" : "pointer", opacity: endEarlyLoading ? 0.5 : 1 }}
                      >
                        {endEarlyLoading ? "Ending..." : "End early"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.75, textAlign: "center" }}>
                    Waiting on {pausedPlayer?.name} to resume
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </>
    )
  }

  // Intermediate screen
  if (game.phase === "intermediate") {
    const rotation = game.rotation || []
    const roundData = rotation[currentRound - 1]
    const eIds = roundData?.earthling_ids || []
    const roundEarthlings = eIds.map(id => players.find(p => p.id === id)).filter(Boolean)
    const roundAliens = players.filter(p => !eIds.includes(p.id))
    const alienNames = roundAliens.map(a => a.name).join(", ")

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", maxWidth: 600 }}>
          <div style={{ fontSize: FONT_SIZE.large * 2, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: SPACE.xl }}>
            Attempt {currentAttempt}
          </div>
          <div style={{ marginBottom: SPACE.xxl * 1.5 }}>
            <div style={{ fontSize: FONT_SIZE.large * 2, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.75, marginBottom: SPACE.md }}>
              Earthlings giving clues:
            </div>
            <div style={{ fontSize: FONT_SIZE.xxl * 2, fontWeight: FONT_WEIGHT.black, color: YELLOW }}>
              {roundEarthlings.map(e => e.name).join(" & ")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: FONT_SIZE.large * 2, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.75, marginBottom: SPACE.md }}>
              Aliens guessing:
            </div>
            <div style={{ fontSize: FONT_SIZE.xl * 2, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>
              {alienNames}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Results
  if (game.phase === "finished") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

    // Cooperative (3-player) games show a shared group total out of a perfect score.
    if (isCooperative) {
      const maxGroup = (game.rotation?.length ?? 0) * 3
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: TEXT, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, marginBottom: SPACE.xl }}>
            Translation Complete!
          </div>
          <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.4, marginBottom: SPACE.md }}>
            Group Score
          </div>
          <div style={{ marginBottom: SPACE.xxl }}>
            <span style={{ fontSize: 72, fontWeight: 900, color: YELLOW }}>{game.group_score ?? 0}</span>
            <span style={{ fontSize: 32, fontWeight: 700, opacity: 0.6 }}> / {maxGroup}</span>
          </div>
          <button onClick={playAgain} style={{ background: YELLOW, color: "#000", fontSize: FONT_SIZE.large, fontWeight: 900, padding: "16px 32px", border: "none", cursor: "pointer" }}>
            Play Again
          </button>
        </div>
      )
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", color: TEXT }}>
        <EndGame
          title="Translation Complete!"
          players={sortedPlayers}
          onPlayAgain={playAgain}
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
          code={code}
        />
      </div>
    )
  }

  return null
}
