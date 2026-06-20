"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { BG, DARK, MID, WL, YELLOW, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, STYLE } from "../../../components/styles"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"

const TEXT = "white"
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameState, setGameState] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pokes, setPokes] = useState([])
  const [countdownRemaining, setCountdownRemaining] = useState(null)
  const [iWinLoading, setIWinLoading] = useState(false)
  const [newLettersLoading, setNewLettersLoading] = useState(false)
  const [readyLoading, setReadyLoading] = useState(false)
  const [confirmingWin, setConfirmingWin] = useState(false)

  const me = players.find(p => p.id === myPlayerId)

  async function loadState() {
    const { data: game } = await supabase
      .from("alphajam_games")
      .select("*")
      .eq("code", code)
      .single()

    if (game) setGameState(game)

    const { data: playerData } = await supabase
      .from("alphajam_players")
      .select("*")
      .eq("game_code", code)
      .order("created_at", { ascending: true})

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
    const stored = localStorage.getItem(`alphajam:${code}:playerId`)
    if (stored) setMyPlayerId(stored)
    else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState()
    loadPokes()
    const poll = setInterval(loadState, 30000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`alphajam-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  // Reset loading states when phase changes
  useEffect(() => {
    setReadyLoading(false)
    setNewLettersLoading(false)
    setIWinLoading(false)
  }, [gameState?.phase])

  // Reset iWinLoading when claim is cleared (rejected)
  useEffect(() => {
    if (gameState?.pending_winner_claim === null) {
      setIWinLoading(false)
    }
  }, [gameState?.pending_winner_claim])

  // Reset newLettersLoading when letters are actually regenerated
  useEffect(() => {
    // When new_letters_requests is cleared, letters were regenerated
    if (gameState?.new_letters_requests?.length === 0) {
      setNewLettersLoading(false)
    }
  }, [gameState?.new_letters_requests])

  // Countdown sync
  useEffect(() => {
    if (!gameState?.reveal_at || gameState.phase !== "countdown") {
      setCountdownRemaining(null)
      return
    }

    function updateCountdown() {
      const revealTime = new Date(gameState.reveal_at).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.round((revealTime - now) / 1000))
      setCountdownRemaining(remaining)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 100)
    return () => clearInterval(interval)
  }, [gameState?.reveal_at, gameState?.phase, code])

  async function handleAdjustScore(playerId, delta) {
    try {
      const { error } = await supabase.rpc("aj_adjust_score", {
        p_player_id: playerId,
        p_delta: delta,
      })
      if (error) throw error
      await loadState()
    } catch (e) {
      alert("Error adjusting score: " + (e?.message ?? "unknown"))
    }
  }

  async function handleResetToLobby() {
    try {
      const { error } = await supabase.rpc("aj_reset_to_lobby", { p_code: code })
      if (error) throw error
    } catch (e) {
      alert("Error resetting to lobby: " + (e?.message ?? "unknown"))
    }
  }

  // Reusable Menu component for all phases
  function renderMenu() {
    return (
      <Menu
        supabase={supabase}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        colors={{ dark: DARK, mid: MID, wl: WL, yellow: YELLOW, text: TEXT }}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({
          name: p.name,
          firstName: p.first_name,
          lastName: p.last_name,
          score: p.score ?? 0,
        }))}
        gamePhase={gameState?.phase}
        rules={[
          ["Objective", "Win the most head-to-head matchups by thinking of words faster than your opponents."],
          ["How to Play", "Each matchup reveals two letters. Think of a word that starts with the first letter and ends with the second letter. The first player to find a valid word wins the round."],
          ["Tournament", "You'll play against every other player in a round-robin tournament. The player with the most wins at the end wins the game."],
        ]}
        onResetToLobby={handleResetToLobby}
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
                  style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  −
                </button>
                <button
                  onClick={() => handleAdjustScore(p.id, 1)}
                  style={{ background: DARK, color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 900, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        }
      />
    )
  }

  async function handleClaimWin() {
    const { error } = await supabase.rpc("aj_claim_win", { p_code: code, p_player_id: myPlayerId })
    if (error) {
      alert("Error: " + error.message)
      throw error
    }

    await loadState()

    // Throw error to reset FooterButton's internal loading state
    throw new Error("Claim sent")
  }

  async function handleConfirmWin(confirmed) {
    setConfirmingWin(false)
    try {
      const { error } = await supabase.rpc("aj_confirm_win", { p_code: code, p_confirmed: confirmed })
      if (error) throw error

      await loadState()
    } catch (e) {
      alert("Error: " + (e?.message ?? "unknown error"))
    }
  }

  async function handleNewLetters() {
    if (newLettersLoading) return
    setNewLettersLoading(true)
    try {
      const { error } = await supabase.rpc("aj_request_new_letters", { p_code: code, p_player_id: myPlayerId })
      if (error) throw error

      // Load fresh state so component can detect when both players requested
      await loadState()
    } catch (e) {
      alert("Error: " + (e?.message ?? "unknown error"))
      setNewLettersLoading(false)
    }
  }

  async function handleReady() {
    if (readyLoading) return
    setReadyLoading(true)
    try {
      const { error } = await supabase.rpc("aj_mark_ready", { p_code: code, p_player_id: myPlayerId })
      if (error) throw error

      // Load fresh state so component can detect when both players are ready
      await loadState()
    } catch (e) {
      alert("Error: " + (e?.message ?? "unknown error"))
      setReadyLoading(false)
    }
  }

  async function handleAdjustScore(playerId, delta) {
    await supabase.rpc("aj_adjust_score", { p_player_id: playerId, p_delta: delta })
  }

  async function dismissPoke(pokeId) {
    await supabase.from("pokes").delete().eq("id", pokeId)
  }

  if (!gameState) {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Loading...</div>
      </div>
    )
  }

  const { phase, matchup_pairs, current_matchup_index, current_round, rounds_per_matchup, letter_start, letter_end, new_letters_requests, ready_player_ids, pending_winner_claim } = gameState

  // Determine current matchup
  let currentMatchup = null
  let opponent = null
  let isMyTurn = false
  let player1 = null
  let player2 = null

  if (matchup_pairs && current_matchup_index !== null && matchup_pairs[current_matchup_index]) {
    const pair = matchup_pairs[current_matchup_index]
    currentMatchup = pair
    player1 = players.find(p => p.id === pair.player1_id)
    player2 = players.find(p => p.id === pair.player2_id)

    if (pair.player1_id === myPlayerId || pair.player2_id === myPlayerId) {
      isMyTurn = true
      opponent = players.find(p => p.id === (pair.player1_id === myPlayerId ? pair.player2_id : pair.player1_id))
    }
  }

  const totalMatchups = matchup_pairs ? matchup_pairs.length : 0
  const myNewLettersRequest = new_letters_requests?.includes(myPlayerId)
  const opponentNewLettersRequest = opponent && new_letters_requests?.includes(opponent.id)
  const iAmReady = ready_player_ids?.includes(myPlayerId)
  const opponentReady = opponent && ready_player_ids?.includes(opponent.id)
  const iClaimedWin = pending_winner_claim === myPlayerId
  const claimerName = pending_winner_claim ? players.find(p => p.id === pending_winner_claim)?.name : null

  // Determine what to show based on countdown state (which updates every 100ms)
  const showCountdown = countdownRemaining !== null && countdownRemaining > 0
  const showLetters = (countdownRemaining !== null && countdownRemaining <= 0) || (phase === "playing")

  // Notifications
  const myPokes = pokes.filter(p => !p.to_player || p.to_player === me?.name)

  // Menu player details
  const playerDetails = players.map(p => ({
    name: p.name,
    score: p.score,
    onAdjustScore: (delta) => handleAdjustScore(p.id, delta),
  }))

  // Letter card component
  function LetterCard({ label, letter }) {
    return (
      <div style={{ width: "100%", maxWidth: 320 }}>
        <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, opacity: 0.9, marginBottom: SPACE.sm, textAlign: "center" }}>
          {label}
        </div>
        <div style={{
          background: YELLOW,
          padding: `48px ${SPACE.lg}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          fontWeight: FONT_WEIGHT.black,
          lineHeight: 1,
          color: "white",
        }}>
          {letter}
        </div>
      </div>
    )
  }

  // Tiebreaker preview screen
  if (phase === "tiebreaker_preview") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
    const maxScore = sortedPlayers[0].score
    const tiedPlayers = sortedPlayers.filter(p => p.score === maxScore)

    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
        <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
        {renderMenu()}

        {/* Tiebreaker banner */}
        <div style={{ background: YELLOW, color: "white", padding: `${SPACE.lg}px ${SPACE.md}px` }}>
          <div style={{ fontSize: FONT_SIZE.headingSm, fontWeight: FONT_WEIGHT.black, marginBottom: SPACE.sm, textAlign: "center" }}>
            TIEBREAKER
          </div>
          <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, textAlign: "center", marginBottom: SPACE.md }}>
            {tiedPlayers.length === 2 ? "Best of 3" : "Sudden Death"}
          </div>
          <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.medium, opacity: 0.9, lineHeight: 1.5, textAlign: "center" }}>
            {tiedPlayers.length === 2 ? (
              <>The tournament ended in a 2-way tie. {tiedPlayers.map(p => p.name).join(" and ")} will play a best-of-3 tiebreaker to determine the winner.</>
            ) : (
              <>The tournament ended in a {tiedPlayers.length}-way tie. {tiedPlayers.map(p => p.name).join(", ").replace(/, ([^,]*)$/, ", and $1")} will play sudden death tiebreaker rounds. Each matchup winner advances until one player remains.</>
            )}
          </div>
        </div>

        {/* Scores */}
        <div style={{ padding: `${SPACE.lg}px ${SPACE.md}px`, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ ...STYLE.sectionHeader, marginBottom: 12 }}>
            Scores
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: SPACE.xl }}>
            {sortedPlayers.map((p, i) => (
              <div key={p.id} style={{ display: "flex" }}>
                <div style={{
                  padding: "13px 0", minWidth: 48, flexShrink: 0,
                  background: DARK,
                  fontSize: 18, fontWeight: 900, color: TEXT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </div>
                <div style={{
                  padding: "13px 16px", flex: 1,
                  background: tiedPlayers.includes(p) ? YELLOW : MID,
                  color: "white",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {p.score}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tiebreaker matchups */}
          <div style={{ ...STYLE.sectionHeader, marginBottom: 12 }}>
            Tiebreaker Matchups
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {matchup_pairs && matchup_pairs.map((pair, i) => {
              const p1 = players.find(p => p.id === pair.player1_id)
              const p2 = players.find(p => p.id === pair.player2_id)
              const isCurrent = i === current_matchup_index

              return (
                <div key={i} style={{ display: "flex" }}>
                  <div style={{
                    background: isCurrent ? YELLOW : "rgba(255,255,255,0.15)",
                    color: isCurrent ? "white" : "rgba(255,255,255,0.75)",
                    fontSize: 20,
                    fontWeight: FONT_WEIGHT.black,
                    minWidth: 52,
                    textAlign: "center",
                    padding: "10px 0",
                    flexShrink: 0
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    background: MID,
                    padding: `10px ${SPACE.md}px`,
                    flex: 1,
                    display: "flex",
                    alignItems: "center"
                  }}>
                    <span style={{
                      fontSize: FONT_SIZE.body,
                      fontWeight: FONT_WEIGHT.bold,
                    }}>
                      {p1?.name} vs {p2?.name}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <Footer
          onToggle={() => setMenuOpen(!menuOpen)}
          isOpen={menuOpen}
          colors={{ dark: DARK, wl: WL }}
        >
          {isMyTurn && !iAmReady && (
            <FooterButton
              onClick={async () => {
                setReadyLoading(true)
                try {
                  const { error } = await supabase.rpc("aj_tiebreaker_ready", { p_code: code, p_player_id: myPlayerId })
                  if (error) throw error
                  await loadState()
                } catch (e) {
                  alert("Error: " + (e?.message ?? "unknown error"))
                  setReadyLoading(false)
                }
              }}
              loading={readyLoading}
              bg={YELLOW}
              textColor="white"
            >
              Ready
            </FooterButton>
          )}
          {isMyTurn && iAmReady && !opponentReady && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.normal }}>
              Waiting for {opponent?.name}...
            </div>
          )}
        </Footer>
      </div>
    )
  }

  // Matchup preview screen (before countdown)
  if (phase === "matchup_preview") {
    const nextMatchups = []
    if (matchup_pairs && current_matchup_index !== null) {
      for (let i = current_matchup_index + 1; i < Math.min(current_matchup_index + 3, matchup_pairs.length); i++) {
        const pair = matchup_pairs[i]
        const p1 = players.find(p => p.id === pair.player1_id)
        const p2 = players.find(p => p.id === pair.player2_id)
        if (p1 && p2) nextMatchups.push(`${p1.name} vs ${p2.name}`)
      }
    }

    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
        <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
        {renderMenu()}

        {/* Status bar */}
        <div style={{ background: DARK, padding: `12px ${SPACE.md}px`, ...STYLE.eyebrow, opacity: OPACITY.moderate }}>
          {player1?.name.toUpperCase()} VS {player2?.name.toUpperCase()} · MATCHUP {(current_matchup_index ?? 0) + 1} OF {totalMatchups}
        </div>

        <div style={{ padding: `48px ${SPACE.md}px`, textAlign: "center" }}>
          <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black }}>
            {player1?.name} vs {player2?.name}
          </div>
        </div>

        <Footer
          onToggle={() => setMenuOpen(!menuOpen)}
          isOpen={menuOpen}
          colors={{ dark: DARK, wl: WL }}
        >
          {isMyTurn && !iAmReady && (
            <FooterButton
              onClick={handleReady}
              loading={readyLoading}
              bg={YELLOW}
              textColor="white"
            >
              Ready
            </FooterButton>
          )}
          {isMyTurn && iAmReady && !opponentReady && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.normal }}>
              Waiting for {opponent?.name}...
            </div>
          )}
        </Footer>

        {/* Ready status - only shown to spectators */}
        {!isMyTurn && (
          <div style={{ padding: `0 ${SPACE.md}px ${SPACE.lg}px`, maxWidth: 480, margin: "0 auto" }}>
            <div style={{ ...STYLE.sectionHeader, marginBottom: 12 }}>
              Getting ready
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: SPACE.lg }}>
              {player1 && (
                <div style={{ display: "flex", alignItems: "center", background: MID, padding: `${FONT_SIZE.small}px ${SPACE.md}px`, gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: ready_player_ids?.includes(player1.id) ? "#22C55E" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                  <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, flex: 1, opacity: ready_player_ids?.includes(player1.id) ? OPACITY.full : OPACITY.moderate }}>
                    {player1.name}
                  </span>
                </div>
              )}
              {player2 && (
                <div style={{ display: "flex", alignItems: "center", background: MID, padding: `${FONT_SIZE.small}px ${SPACE.md}px`, gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: ready_player_ids?.includes(player2.id) ? "#22C55E" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                  <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, flex: 1, opacity: ready_player_ids?.includes(player2.id) ? OPACITY.full : OPACITY.moderate }}>
                    {player2.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Matchups list - shown to all players */}
        <div style={{ padding: `0 ${SPACE.md}px ${SPACE.lg}px`, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ ...STYLE.sectionHeader, marginBottom: 12 }}>
            Matchups
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {matchup_pairs && matchup_pairs.map((pair, i) => {
              const p1 = players.find(p => p.id === pair.player1_id)
              const p2 = players.find(p => p.id === pair.player2_id)
              const isPast = i < (current_matchup_index ?? 0)
              const isCurrent = i === current_matchup_index

              return (
                <div key={i} style={{ display: "flex" }}>
                  <div style={{
                    background: isCurrent ? YELLOW : "rgba(255,255,255,0.15)",
                    color: isCurrent ? "white" : "rgba(255,255,255,0.75)",
                    fontSize: 20,
                    fontWeight: FONT_WEIGHT.black,
                    minWidth: 52,
                    textAlign: "center",
                    padding: "10px 0",
                    flexShrink: 0
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    background: MID,
                    padding: `10px ${SPACE.md}px`,
                    flex: 1,
                    display: "flex",
                    alignItems: "center"
                  }}>
                    <span style={{
                      fontSize: FONT_SIZE.body,
                      fontWeight: FONT_WEIGHT.bold,
                      textDecoration: isPast ? "line-through" : "none",
                      opacity: isPast ? OPACITY.muted : OPACITY.full
                    }}>
                      {p1?.name} vs {p2?.name}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Render countdown (based on TIME, not phase)
  if (showCountdown) {
    if (isMyTurn) {
      // Active players see just countdown
      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
          {renderMenu()}

          {opponent && (
            <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.normal, marginBottom: SPACE.lg, textAlign: "center" }}>
              {me?.name} vs {opponent.name}
            </div>
          )}

          {countdownRemaining !== null && countdownRemaining > 0 && (
            <div style={{ fontSize: 120, fontWeight: FONT_WEIGHT.black, lineHeight: 1 }}>
              {countdownRemaining}
            </div>
          )}

          <Footer
            onToggle={() => setMenuOpen(!menuOpen)}
            isOpen={menuOpen}
            colors={{ dark: DARK, wl: WL }}
          />
        </div>
      )
    } else {
      // Spectators see DON'T GUESS banner during countdown
      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
          {renderMenu()}

          {/* Don't Guess banner */}
          <div style={{ background: YELLOW, color: "white", padding: `${SPACE.lg}px ${SPACE.md}px`, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: FONT_WEIGHT.black, letterSpacing: "0.02em", marginBottom: SPACE.sm }}>
              DON'T GUESS
            </div>
            <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: 0.8 }}>
              {player1?.name} vs {player2?.name}
            </div>
          </div>

          {/* Countdown */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
            {countdownRemaining !== null && countdownRemaining > 0 && (
              <div style={{ fontSize: 120, fontWeight: FONT_WEIGHT.black, lineHeight: 1 }}>
                {countdownRemaining}
              </div>
            )}
          </div>

          <Footer
            onToggle={() => setMenuOpen(!menuOpen)}
            isOpen={menuOpen}
            colors={{ dark: DARK, wl: WL }}
          />
        </div>
      )
    }
  }

  // Render playing phase (based on TIME, not phase)
  if (showLetters) {
    if (isMyTurn) {
      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
          {renderMenu()}

          {/* Status bar */}
          <div style={{ background: DARK, padding: `12px ${SPACE.md}px`, ...STYLE.eyebrow, opacity: OPACITY.moderate }}>
            {me?.name.toUpperCase()} VS {opponent?.name.toUpperCase()} · MATCHUP {(current_matchup_index ?? 0) + 1} OF {totalMatchups}
          </div>

          {/* New letters status banner */}
          {myNewLettersRequest && !opponentNewLettersRequest && (
            <div style={{ background: YELLOW, color: "white", padding: `${SPACE.md}px`, textAlign: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold }}>
              Waiting for {opponent?.name} to confirm new letters
            </div>
          )}
          {opponentNewLettersRequest && !myNewLettersRequest && (
            <div style={{ background: YELLOW, color: "white", padding: `${SPACE.md}px`, textAlign: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold }}>
              {opponent?.name} wants new letters
            </div>
          )}
          {myNewLettersRequest && opponentNewLettersRequest && (
            <div style={{ background: YELLOW, color: "white", padding: `${SPACE.md}px`, textAlign: "center", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold }}>
              Both requested new letters...
            </div>
          )}

          {/* Letter cards */}
          <div style={{ padding: `${SPACE.xl}px ${SPACE.md}px`, display: "flex", flexDirection: "column", gap: SPACE.md, alignItems: "center" }}>
            <LetterCard label="Starting letter" letter={letter_start} />
            <LetterCard label="Ending letter" letter={letter_end} />
          </div>

          {/* Footer */}
          <Footer
            onToggle={() => setMenuOpen(!menuOpen)}
            isOpen={menuOpen}
            colors={{ dark: DARK, wl: WL }}
          >
            {!pending_winner_claim && (
              <FooterButton
                onClick={handleNewLetters}
                loading={newLettersLoading}
                disabled={myNewLettersRequest}
                bg={WL}
                textColor={TEXT}
              >
                New Letters
              </FooterButton>
            )}
            <FooterButton
              onClick={handleClaimWin}
              disabled={pending_winner_claim !== null}
              bg={YELLOW}
              textColor="white"
              style={pending_winner_claim ? { opacity: 0.7 } : {}}
            >
              {iClaimedWin ? `Waiting for ${opponent?.name} to verify` : "I Won"}
            </FooterButton>
          </Footer>

          {/* Confirmation modal (shown to ALL players except the claimer) */}
          {pending_winner_claim && !iClaimedWin && (
            <div
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24, zIndex: 100,
              }}
            >
              <div
                style={{
                  background: WL, borderRadius: 8, padding: 24,
                  maxWidth: 400, width: "100%",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: TEXT }}>
                  Did {claimerName} win?
                </div>
                <div style={{ fontSize: 15, marginBottom: 24, opacity: 0.85, color: TEXT }}>
                  {claimerName} claims to have won this round.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleConfirmWin(false)}
                    style={{ flex: 1, background: DARK, color: TEXT, fontSize: 17, fontWeight: 800, padding: "14px" }}
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleConfirmWin(true)}
                    style={{ flex: 2, background: YELLOW, color: "white", fontSize: 17, fontWeight: 900, padding: "14px" }}
                  >
                    Yes, They Won
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    } else {
      // Spectating - show DON'T GUESS banner
      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
          {renderMenu()}

          {/* Status bar */}
          <div style={{ background: DARK, padding: `12px ${SPACE.md}px`, ...STYLE.eyebrow, opacity: OPACITY.moderate }}>
            {player1?.name.toUpperCase()} VS {player2?.name.toUpperCase()} · MATCHUP {(current_matchup_index ?? 0) + 1} OF {totalMatchups}
          </div>

          {/* Don't Guess banner */}
          <div style={{ background: YELLOW, color: "white", padding: `${SPACE.lg}px ${SPACE.md}px`, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: FONT_WEIGHT.black, letterSpacing: "0.02em" }}>
              DON'T GUESS
            </div>
          </div>

          {/* Small letters */}
          <div style={{ padding: `${SPACE.xl}px ${SPACE.md}px`, display: "flex", justifyContent: "center", gap: SPACE.lg }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.9, marginBottom: 4 }}>
                Starting
              </div>
              <div style={{ background: YELLOW, color: "white", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: FONT_WEIGHT.black }}>
                {letter_start}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.9, marginBottom: 4 }}>
                Ending
              </div>
              <div style={{ background: YELLOW, color: "white", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: FONT_WEIGHT.black }}>
                {letter_end}
              </div>
            </div>
          </div>

          {/* Spectator status - show new letters requests only (win claims now shown in global modal) */}
          {new_letters_requests?.length > 0 && (
            <div style={{ padding: `0 ${SPACE.md}px ${SPACE.lg}px`, maxWidth: 480, margin: "0 auto" }}>
              <div style={{ ...STYLE.sectionHeader, marginBottom: 12 }}>
                Status
              </div>
              <div style={{ background: MID, padding: `${SPACE.md}px`, textAlign: "center" }}>
                {new_letters_requests.map(playerId => {
                  const player = players.find(p => p.id === playerId)
                  return player ? (
                    <div key={playerId} style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, opacity: OPACITY.normal }}>
                      {player.name} has requested new letters
                    </div>
                  ) : null
                })}
              </div>
            </div>
          )}

          {/* Confirmation modal (shown to ALL players except the claimer) */}
          {pending_winner_claim && !iClaimedWin && (
            <div
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24, zIndex: 100,
              }}
            >
              <div
                style={{
                  background: WL, borderRadius: 8, padding: 24,
                  maxWidth: 400, width: "100%",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: TEXT }}>
                  Did {claimerName} win?
                </div>
                <div style={{ fontSize: 15, marginBottom: 24, opacity: 0.85, color: TEXT }}>
                  {claimerName} claims to have won this round.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleConfirmWin(false)}
                    style={{ flex: 1, background: DARK, color: TEXT, fontSize: 17, fontWeight: 800, padding: "14px" }}
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleConfirmWin(true)}
                    style={{ flex: 2, background: YELLOW, color: "white", fontSize: 17, fontWeight: 900, padding: "14px" }}
                  >
                    Yes, They Won
                  </button>
                </div>
              </div>
            </div>
          )}

          <Footer
            onToggle={() => setMenuOpen(!menuOpen)}
            isOpen={menuOpen}
            colors={{ dark: DARK, wl: WL }}
          />
        </div>
      )
    }
  }

  // Render finished/leaderboard
  if (phase === "finished") {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
    const winner = sortedPlayers[0]

    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
        <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />
        {renderMenu()}

        <div style={{ padding: "48px 16px" }}>
          <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 8, textAlign: "center" }}>
            {winner?.name} wins!
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.5, marginTop: 32, marginBottom: 12 }}>
            Final scores
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {sortedPlayers.map((p, i) => (
              <div key={p.id} style={{ display: "flex" }}>
                <div style={{
                  padding: "13px 0", minWidth: 48, flexShrink: 0,
                  background: DARK,
                  fontSize: 18, fontWeight: 900, color: TEXT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </div>
                <div style={{
                  padding: "13px 16px", flex: 1,
                  background: MID,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {p.score}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Footer
          onToggle={() => setMenuOpen(!menuOpen)}
          isOpen={menuOpen}
          colors={{ dark: DARK, wl: WL }}
        >
          <FooterButton
            onClick={() => {
              localStorage.removeItem(`alphajam:${code}:playerId`)
              router.replace("/")
            }}
            bg={YELLOW}
            textColor="white"
          >
            New Game
          </FooterButton>
        </Footer>
      </div>
    )
  }

  // Fallback
  return (
    <div style={{ background: BG, color: TEXT, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Unknown phase: {phase}</div>
    </div>
  )
}
