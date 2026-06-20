"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { BG, DARK, MID, WL, YELLOW, FONT_SIZE, FONT_WEIGHT } from "../../../components/styles"
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
  const [pointAwardedTo, setPointAwardedTo] = useState(null)

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
    const stored = localStorage.getItem(`alphajam:${code}:playerId`)
    if (stored) setMyPlayerId(stored)
    else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState()
    loadPokes()
    const poll = setInterval(loadState, 1500)
    const channel = supabase.channel(`alphajam-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "alphajam_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
      .subscribe()
    return () => { clearInterval(poll); supabase.removeChannel(channel) }
  }, [code])

  // Countdown sync
  useEffect(() => {
    if (!gameState?.reveal_at || gameState.phase !== "countdown") {
      setCountdownRemaining(null)
      return
    }

    function updateCountdown() {
      const revealTime = new Date(gameState.reveal_at).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.ceil((revealTime - now) / 1000))
      setCountdownRemaining(remaining)

      if (remaining === 0) {
        // Transition to playing
        supabase
          .from("alphajam_games")
          .update({ phase: "playing" })
          .eq("code", code)
          .eq("phase", "countdown")
          .then()
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 100)
    return () => clearInterval(interval)
  }, [gameState?.reveal_at, gameState?.phase, code])

  async function handleIWin() {
    if (iWinLoading) return
    setIWinLoading(true)
    const { error } = await supabase.rpc("aj_mark_winner", { p_code: code, p_player_id: myPlayerId })
    if (error) {
      alert("Error: " + error.message)
      setIWinLoading(false)
    }
  }

  async function handleNewLetters() {
    if (newLettersLoading) return
    setNewLettersLoading(true)
    const { error } = await supabase.rpc("aj_request_new_letters", { p_code: code, p_player_id: myPlayerId })
    if (error) {
      alert("Error: " + error.message)
      setNewLettersLoading(false)
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

  const { phase, matchup_pairs, current_matchup_index, current_round, rounds_per_matchup, letter_start, letter_end, new_letters_requests } = gameState

  // Determine current matchup
  let currentMatchup = null
  let opponent = null
  let isMyTurn = false

  if (matchup_pairs && current_matchup_index !== null && matchup_pairs[current_matchup_index]) {
    const pair = matchup_pairs[current_matchup_index]
    currentMatchup = pair
    if (pair.player1_id === myPlayerId || pair.player2_id === myPlayerId) {
      isMyTurn = true
      opponent = players.find(p => p.id === (pair.player1_id === myPlayerId ? pair.player2_id : pair.player1_id))
    }
  }

  const totalMatchups = matchup_pairs ? matchup_pairs.length : 0
  const myNewLettersRequest = new_letters_requests?.includes(myPlayerId)
  const opponentNewLettersRequest = opponent && new_letters_requests?.includes(opponent.id)

  // Notifications
  const myPokes = pokes.filter(p => !p.to_player || p.to_player === me?.name)

  // Menu player details
  const playerDetails = players.map(p => ({
    name: p.name,
    score: p.score,
    onAdjustScore: (delta) => handleAdjustScore(p.id, delta),
  }))

  // Render countdown
  if (phase === "countdown") {
    return (
      <div style={{ background: BG, color: TEXT, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />

        {isMyTurn && opponent && (
          <div style={{ fontSize: 17, fontWeight: 700, opacity: 0.85, marginBottom: 24, textAlign: "center" }}>
            {me?.name} vs {opponent.name}
          </div>
        )}

        {countdownRemaining !== null && countdownRemaining > 0 && (
          <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 1 }}>
            {countdownRemaining}
          </div>
        )}

        {countdownRemaining === 0 && (
          <div style={{ fontSize: 48, fontWeight: 900, animation: "fadeIn 0.3s" }}>
            Revealing...
          </div>
        )}

        <Footer
          onToggle={() => setMenuOpen(true)}
          isOpen={menuOpen}
          colors={{ dark: DARK }}
        />

        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          myName={me?.name}
          playerDetails={playerDetails}
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: MID }}
        />
      </div>
    )
  }

  // Render playing phase
  if (phase === "playing") {
    if (isMyTurn) {
      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />

          {/* Status bar */}
          <div style={{ background: DARK, padding: "12px 16px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.8 }}>
            {me?.name} vs {opponent?.name} · Round {current_round} of {rounds_per_matchup}
          </div>

          {/* Letter cards */}
          <div style={{ padding: "32px 16px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 320 }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65, marginBottom: 8, textAlign: "center" }}>
                Starting letter
              </div>
              <div style={{
                background: MID,
                padding: "48px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 120,
                fontWeight: 900,
                lineHeight: 1,
              }}>
                {letter_start}
              </div>
            </div>

            <div style={{ width: "100%", maxWidth: 320 }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65, marginBottom: 8, textAlign: "center" }}>
                Ending letter
              </div>
              <div style={{
                background: MID,
                padding: "48px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 120,
                fontWeight: 900,
                lineHeight: 1,
              }}>
                {letter_end}
              </div>
            </div>

            {/* New letters status */}
            {(myNewLettersRequest || opponentNewLettersRequest) && (
              <div style={{ fontSize: 13, opacity: 0.85, textAlign: "center", marginTop: 16 }}>
                {myNewLettersRequest && opponentNewLettersRequest && "Both requested new letters..."}
                {myNewLettersRequest && !opponentNewLettersRequest && `Waiting for ${opponent?.name}...`}
                {!myNewLettersRequest && opponentNewLettersRequest && `${opponent?.name} wants new letters`}
              </div>
            )}

            {/* Point awarded banner */}
            {pointAwardedTo && (
              <div style={{
                background: YELLOW,
                color: "#000",
                padding: "16px 24px",
                marginTop: 24,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
                  Point awarded to {players.find(p => p.id === pointAwardedTo)?.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Adjust points at any time from the game settings.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <Footer
            onToggle={() => setMenuOpen(true)}
            isOpen={menuOpen}
            colors={{ dark: DARK }}
          >
            <div style={{ display: "flex", gap: 8, flex: 1, padding: "0 8px" }}>
              <FooterButton
                onClick={handleNewLetters}
                loading={newLettersLoading}
                disabled={myNewLettersRequest}
                bg={myNewLettersRequest ? WL : "rgba(255,255,255,0.15)"}
                textColor={TEXT}
              >
                New Letters
              </FooterButton>
              <FooterButton
                onClick={handleIWin}
                loading={iWinLoading}
                bg={YELLOW}
                textColor="#000"
              >
                I Win
              </FooterButton>
            </div>
          </Footer>

          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            roomCode={code}
            myName={me?.name}
            playerDetails={playerDetails}
            colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: MID }}
          />
        </div>
      )
    } else {
      // Waiting for other matchup
      const currentPair = matchup_pairs[current_matchup_index]
      const player1 = players.find(p => p.id === currentPair?.player1_id)
      const player2 = players.find(p => p.id === currentPair?.player2_id)

      return (
        <div style={{ background: BG, color: TEXT, minHeight: "100vh", paddingBottom: BOTTOM_PAD }}>
          <Notifications pokes={myPokes} onDismiss={dismissPoke} colors={{ dark: DARK, yellow: YELLOW, notifBg: MID }} />

          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>
              Waiting for matchup to complete
            </div>
            <div style={{ fontSize: 17, opacity: 0.85 }}>
              {player1?.name} vs {player2?.name}
            </div>
            <div style={{ fontSize: 15, opacity: 0.65, marginTop: 8 }}>
              Round {current_round} of {rounds_per_matchup}
            </div>

            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 24 }}>
              Matchup {(current_matchup_index ?? 0) + 1} of {totalMatchups}
            </div>
          </div>

          <Footer
            onToggle={() => setMenuOpen(true)}
            isOpen={menuOpen}
            colors={{ dark: DARK }}
          />

          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            roomCode={code}
            myName={me?.name}
            playerDetails={playerDetails}
            colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: MID }}
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
          onToggle={() => setMenuOpen(true)}
          isOpen={menuOpen}
          colors={{ dark: DARK }}
        >
          <FooterButton
            onClick={() => {
              localStorage.removeItem(`alphajam:${code}:playerId`)
              router.replace("/")
            }}
            bg={YELLOW}
            textColor="#000"
          >
            New Game
          </FooterButton>
        </Footer>

        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          myName={me?.name}
          playerDetails={playerDetails}
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WL, yellow: YELLOW, notifBg: MID }}
        />
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
