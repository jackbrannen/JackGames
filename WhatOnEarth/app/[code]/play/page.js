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
  const [selectedAlien, setSelectedAlien] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showEndEarlyModal, setShowEndEarlyModal] = useState(false)

  // Loading states
  const [readyLoading, setReadyLoading] = useState(false)
  const [endEarlyLoading, setEndEarlyLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Timer state when modal opens
  const timerStateRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)

  async function loadState() {
    const { data: gameData } = await supabase
      .from("woe_games")
      .select("*")
      .eq("code", code)
      .single()

    if (gameData) {
      if (gameData.phase === "lobby") { router.replace(`/${code}`); return }
      setGame(gameData)
    }

    const { data: playerData } = await supabase
      .from("woe_players")
      .select("*")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

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
    const poll = setInterval(loadState, 30000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`woe-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "woe_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "woe_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  // Reset loading states on phase change
  useEffect(() => {
    setReadyLoading(false)
    setEndEarlyLoading(false)
    setConfirmLoading(false)
  }, [game?.phase])

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

    function updateTimer() {
      const startTime = new Date(game.attempt_start_at).getTime()
      const now = Date.now()
      const elapsed = (now - startTime) / 1000
      const remaining = Math.max(0, duration - elapsed)
      setTimerRemaining(remaining)

      // Auto-show modal when timer hits 0
      if (remaining === 0 && !showGotItModal) {
        setShowGotItModal(true)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)
    return () => clearInterval(interval)
  }, [game?.phase, game?.attempt_start_at, game?.attempt_duration_seconds, showGotItModal])

  // Intermediate screen auto-advance
  useEffect(() => {
    if (game?.phase === "intermediate") {
      const timeout = setTimeout(() => {
        supabase.rpc("woe_advance_attempt", { p_code: code }).then(() => loadState())
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [game?.phase, code])

  // Handlers
  async function handleReady() {
    setReadyLoading(true)
    try {
      const { error } = await supabase.rpc("woe_mark_ready", { p_code: code, p_player_id: myPlayerId })
      if (error) throw error
      await loadState()
    } catch (e) {
      alert("Error marking ready: " + (e?.message ?? "unknown"))
      setReadyLoading(false)
    }
  }

  function handleGotIt() {
    // Save timer state
    timerStateRef.current = timerRemaining
    setShowGotItModal(true)
  }

  function handleEndEarly() {
    timerStateRef.current = timerRemaining
    setShowEndEarlyModal(true)
  }

  function closeGotItModal() {
    setShowGotItModal(false)
    setSelectedAlien(null)
    timerStateRef.current = null
  }

  function closeEndEarlyModal() {
    setShowEndEarlyModal(false)
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
      const { error } = await supabase.rpc("woe_award_points", {
        p_code: code,
        p_alien_id: selectedAlien
      })
      if (error) throw error
      await loadState()
      setShowGotItModal(false)
      setShowConfirmModal(false)
      setSelectedAlien(null)
      timerStateRef.current = null
    } catch (e) {
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
      timerStateRef.current = null
      // Modal will auto-show when timer hits 0
    } catch (e) {
      alert("Error ending attempt: " + (e?.message ?? "unknown"))
      setEndEarlyLoading(false)
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
  const primaryId = currentRoundData.primary_id
  const backupId = currentRoundData.backup_id

  const primary = players.find(p => p.id === primaryId)
  const backup = players.find(p => p.id === backupId)
  const aliens = players.filter(p => p.id !== primaryId && p.id !== backupId)

  const isPrimary = myPlayerId === primaryId
  const isBackup = myPlayerId === backupId
  const isAlien = !isPrimary && !isBackup

  const activeEarthlingId = currentAttempt === 2 ? backupId : primaryId
  const isActiveEarthling = myPlayerId === activeEarthlingId

  // Previous round result
  const prevRoundData = currentRound > 1 ? rotation[currentRound - 2] : null
  let prevWord = null
  let prevWinner = null
  let prevEarthling = null
  if (prevRoundData && game.phase === "ready") {
    // Would need to track this in game state - for now skip
  }

  // Ready screen
  if (game.phase === "ready") {
    const readyPlayers = players.filter(p => p.ready)
    const totalPlayers = players.length
    const readyCount = readyPlayers.length
    const needReady = Math.ceil(totalPlayers / 2)

    // Previous round data
    const previousWord = game.previous_word
    const previousEarthlingId = game.previous_earthling_id
    const previousAlienId = game.previous_alien_id
    const previousEarthling = players.find(p => p.id === previousEarthlingId)
    const previousAlien = players.find(p => p.id === previousAlienId)

    return (
      <>
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
          roomCode={code}
          currentPlayer={me.name}
          instructions={instructions}
        />
        <Notifications
          supabase={supabase}
          pokes={pokes}
          roomCode={code}
          currentPlayer={me.name}
          colors={POKE_COLORS}
        />

        <div style={{ minHeight: "100dvh", background: BG, paddingBottom: BOTTOM_PAD }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            style={{ position: "fixed", top: 16, right: 16, background: WL, border: "none", color: "rgba(255,255,255,0.45)", fontSize: 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            ☰
          </button>

          <div style={{ padding: "40px 24px" }}>
            {/* Previous round result */}
            {currentRound > 1 && previousWord && (
              <div style={{ textAlign: "center", marginBottom: 32, opacity: 0.65 }}>
                <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, marginBottom: 4 }}>
                  {previousAlienId && previousEarthling && previousAlien
                    ? `${previousEarthling.name} and ${previousAlien.name} got it!`
                    : "No one got it!"}
                </div>
                <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>
                  Last word: {previousWord}
                </div>
              </div>
            )}

            {/* Role assignments */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 8 }}>
                Earthling: {primary?.name}
              </div>
              <div style={{ fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.bold, color: TEXT, opacity: 0.85, marginBottom: 20 }}>
                Backup Earthling: {backup?.name}
              </div>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65, marginBottom: 8 }}>
                Aliens:
              </div>
              {aliens.map(alien => (
                <div key={alien.id} style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.85 }}>
                  • {alien.name}
                </div>
              ))}
            </div>

            {/* Scoreboard */}
            <div style={{ marginTop: 40 }}>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: 12 }}>
                Scores
              </div>
              {players.sort((a, b) => b.score - a.score).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${WL}` }}>
                  <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>{p.name}</span>
                  <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: TEXT }}>{p.score} pts</span>
                </div>
              ))}
            </div>
          </div>

          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
            <div style={{ textAlign: "center", marginBottom: 12, fontSize: FONT_SIZE.large, fontWeight: FONT_WEIGHT.black, color: TEXT }}>
              Ready?
            </div>
            {isPrimary && (
              <FooterButton onClick={handleReady} loading={readyLoading}>
                Ready
              </FooterButton>
            )}
            {!isPrimary && (
              <div style={{ textAlign: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65 }}>
                {readyCount}/{totalPlayers} players ready
              </div>
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
    const timerMins = Math.floor(timerDisplay / 60)
    const timerSecs = timerDisplay % 60
    const timerText = `${timerMins}:${timerSecs.toString().padStart(2, "0")}`

    return (
      <>
        <Menu
          supabase={supabase}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
          roomCode={code}
          currentPlayer={me.name}
          instructions={instructions}
        />
        <Notifications
          supabase={supabase}
          pokes={pokes}
          roomCode={code}
          currentPlayer={me.name}
          colors={POKE_COLORS}
        />

        <div style={{ minHeight: "100dvh", background: BG, paddingBottom: BOTTOM_PAD }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            style={{ position: "fixed", top: 16, right: 16, background: WL, border: "none", color: "rgba(255,255,255,0.45)", fontSize: 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            ☰
          </button>

          {/* Status bar */}
          <StatusBar
            label={`EARTHLING ${(currentAttempt === 2 ? backup?.name : primary?.name)?.toUpperCase()} — ATTEMPT ${currentAttempt} OF 3`}
            dark={YELLOW}
          />

          {/* Not your turn banner (for non-active earthlings) */}
          {(isPrimary || isBackup) && !isActiveEarthling && (
            <div style={{ background: DARK, color: TEXT, textAlign: "center", padding: `${SPACE.md}px`, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, borderBottom: `2px solid ${YELLOW}` }}>
              Not your turn
            </div>
          )}

          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            {/* Earthlings see the word */}
            {(isPrimary || isBackup) && (
              <div style={{ fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 32 }}>
                {word}
              </div>
            )}

            {/* Aliens see header */}
            {isAlien && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT, opacity: 0.4, marginBottom: 8 }}>
                  Alien
                </div>
                <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: TEXT, opacity: 0.65 }}>
                  Earthling is translating...
                </div>
              </div>
            )}

            {/* Translator letters */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: TEXT, opacity: 0.65, marginBottom: 12 }}>
                {isActiveEarthling ? "Your letters:" : "Current letters:"}
              </div>
              <div style={{ fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.black, color: YELLOW, letterSpacing: "0.2em" }}>
                {letters}
              </div>
            </div>

            {/* Timer */}
            {showTimer && (
              <div style={{ fontSize: 48, fontWeight: 900, color: TEXT, opacity: 0.85 }}>
                {timerText}
              </div>
            )}
          </div>

          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
            <FooterButton onClick={handleGotIt}>
              Got it!
            </FooterButton>
            {isActiveEarthling && (
              <FooterButton onClick={handleEndEarly}>
                End early
              </FooterButton>
            )}
          </Footer>
        </div>

        {/* Got it modal */}
        {showGotItModal && (
          <div onClick={closeGotItModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "24px" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: MID, padding: "24px", maxWidth: 400, width: "100%" }}>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.black, color: TEXT, marginBottom: 20, textAlign: "center" }}>
                Who figured it out?
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
                      { name: (currentAttempt === 2 ? backup?.name : primary?.name), points: 4 - currentAttempt },
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
      </>
    )
  }

  // Intermediate screen
  if (game.phase === "intermediate") {
    const message = currentAttempt === 1
      ? "No correct guesses yet!\nMoving to backup earthling..."
      : "No correct guesses yet!\nPrimary earthling gets one final attempt..."

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.black, color: TEXT, whiteSpace: "pre-line" }}>
            {message}
          </div>
        </div>
      </div>
    )
  }

  // Results
  if (game.phase === "finished") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

    return (
      <EndGame
        title="Translation Complete!"
        players={sortedPlayers}
        onPlayAgain={handleResetToLobby}
        colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
        code={code}
      />
    )
  }

  return null
}
