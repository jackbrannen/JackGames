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

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const BG = "#2C2540"
const DARK = "#1F1829"
const MID = "#251E33"
const WARM_LIGHT = "#464171"
const YELLOW = "#FBDF54"
const POKE_COLORS = { dark: "#1F1829", mid: "#251E33", wl: "#464171", yellow: "#FBDF54", notifBg: "#15062A" }

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(523, ctx.currentTime)
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)

  // Fetched from API — never stored in DB-accessible state
  const [myWord, setMyWord] = useState(null)
  const [eliminatedWasMrWhite, setEliminatedWasMrWhite] = useState(null)
  const [revealData, setRevealData] = useState(null)

  // Local interaction state
  const [cardFlipped, setCardFlipped] = useState(false)
  const [cardFlipping, setCardFlipping] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [statementsPressed, setStatementsPressed] = useState(false)
  const [nextRoundPressed, setNextRoundPressed] = useState(false)
  const [confirmElimination, setConfirmElimination] = useState(false)
  const [eliminating, setEliminating] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)

  const prevPhaseRef = useRef(null)
  const soundTriggerRef = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem(`mrwhite:${code}:playerId`)
    if (stored) setMyPlayerId(stored)
    else router.replace(`/${code}`)
  }, [code])

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }

  async function loadState() {
    const { data: gameData } = await supabase
      .from("mrwhite_games")
      .select("code,phase,eliminated_player_id,reveal_at,ready_player_ids,mr_white_wins,round_number,next_game,next_game_picker_name")
      .eq("code", code)
      .single()

    const { data: playerData } = await supabase
      .from("mrwhite_players")
      .select("id,name,first_name,last_name,is_eliminated,is_bot")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    if (gameData) {
      if (gameData.phase === "lobby") { router.replace(`/${code}`); return }
      setGame(gameData)
    }
    if (playerData) setPlayers(playerData.filter(p => !p.is_bot))
  }

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "mrwhite").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`mw-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mrwhite_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "mrwhite_players", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])


  // Fetch player info from API on phase change
  useEffect(() => {
    if (!game || !myPlayerId || game.phase === "lobby") return
    if (prevPhaseRef.current === game.phase) return
    prevPhaseRef.current = game.phase

    setRevealVisible(false)

    if (game.phase === "statements" && !myWord) {
      fetchPlayerInfo()
    } else if (game.phase === "reveal" || game.phase === "finished") {
      fetchPlayerInfo()
    }
  }, [game?.phase, myPlayerId])


  async function fetchPlayerInfo() {
    if (!myPlayerId) return
    try {
      const res = await fetch("/api/mw-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId: myPlayerId }),
      })
      const data = await res.json()
      if (data.word) setMyWord(data.word)
      if (data.eliminatedWasMrWhite !== null && data.eliminatedWasMrWhite !== undefined) {
        setEliminatedWasMrWhite(data.eliminatedWasMrWhite)
      }
      if (data.revealData) setRevealData(data.revealData)
    } catch (e) {
      console.error("fetchPlayerInfo error:", e)
    }
  }

  // Reveal timer
  useEffect(() => {
    if (game?.phase !== "reveal" || !game.reveal_at) return
    const ms = new Date(game.reveal_at) - Date.now()
    if (ms <= 0) { setRevealVisible(true); return }
    const t = setTimeout(() => setRevealVisible(true), ms)
    return () => clearTimeout(t)
  }, [game?.phase, game?.reveal_at])

  // When reveal is visible and Mr. White was caught, finish the game
  useEffect(() => {
    if (!revealVisible || eliminatedWasMrWhite !== true || finishing) return
    setFinishing(true)
    supabase.rpc("mw_finish_game", { p_code: code })
  }, [revealVisible, eliminatedWasMrWhite])

  // Reset ready state when phase changes
  useEffect(() => {
    setStatementsPressed(false)
    setNextRoundPressed(false)
  }, [game?.phase])

  const me = players.find(p => p.id === myPlayerId)

  useEffect(() => {
    if (!game || !me) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playChirp()
  }, [game?.phase])

  const isEliminated = me?.is_eliminated ?? false
  const isCurrentlyEliminated = game?.eliminated_player_id === myPlayerId

  const activePlayers = players.filter(p => !p.is_eliminated)
  const eliminatedPlayer = players.find(p => p.id === game?.eliminated_player_id)

  const readyIds = game?.ready_player_ids ?? []
  const iHavePressedStatements = statementsPressed || readyIds.includes(myPlayerId)
  const iHavePressedNextRound = nextRoundPressed || readyIds.includes(myPlayerId)

  // For statements: count ready among active non-eliminated
  const statementsReadyCount = activePlayers.filter(p => readyIds.includes(p.id)).length

  // For next round: count ready among active non-eliminated, excluding just-eliminated
  const nextRoundEligible = activePlayers.filter(p => p.id !== game?.eliminated_player_id)
  const nextRoundReadyCount = nextRoundEligible.filter(p => readyIds.includes(p.id)).length

  async function handleStatementsDone() {
    if (iHavePressedStatements) return
    setStatementsPressed(true)
    await rpc("mw_statements_ready", { p_code: code, p_player_id: myPlayerId })
  }

  async function handleEliminate() {
    if (eliminating) return
    setEliminating(true)
    setConfirmElimination(false)
    await rpc("mw_eliminate", { p_code: code, p_eliminated_id: myPlayerId })
  }

  async function handleNextRound() {
    if (iHavePressedNextRound) return
    setNextRoundPressed(true)
    await rpc("mw_next_round", { p_code: code, p_player_id: myPlayerId })
  }

  if (!game || !myWord) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  // Helpers defined after the null guard so game is guaranteed non-null
  function footerWait(text) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{text}</span>
      </div>
    )
  }
  const renderUI = (footerChildren = null) => (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me?.name ?? ""} />
      <Menu
        supabase={supabase} colors={POKE_COLORS} isOpen={menuOpen} onClose={() => setMenuOpen(false)}
        roomCode={code} currentPlayer={me?.name ?? ""}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        word={myWord}
        gamePhase={game.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("mw_reset_game", { p_code: code }) }}
        peekBarHeight="env(safe-area-inset-bottom)"
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} peekBarHeight="env(safe-area-inset-bottom)">
        {footerChildren}
      </Footer>
    </>
  )

  // ─── FINISHED ────────────────────────────────────────────────────────────────
  if (game.phase === "finished" && revealData) {
    const mrWhiteWins = game.mr_white_wins
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", paddingBottom: BOTTOM_PAD }}>
        <div style={{ padding: "28px 24px 20px", background: DARK }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 6 }}>
            Game Over
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-1px" }}>
            {mrWhiteWins ? "Mr. White wins." : "The group wins!"}
          </div>
        </div>

        <div style={{ padding: "32px 24px", flex: 1 }}>
          {mrWhiteWins ? (
            <p style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 32, lineHeight: 1.5 }}>
              Only 2 players remained — {revealData.mrWhiteName} survived undetected.
            </p>
          ) : (
            <p style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 32, lineHeight: 1.5 }}>
              {revealData.mrWhiteName} was Mr. White!
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
            <div style={{ display: "flex" }}>
              <div style={{ padding: "16px 18px", background: DARK, minWidth: 130, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, flexShrink: 0 }}>
                Real word
              </div>
              <div style={{ padding: "16px 18px", background: MID, flex: 1, fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>
                {revealData.correctWord}
              </div>
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ padding: "16px 18px", background: DARK, minWidth: 130, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, flexShrink: 0 }}>
                Mr. White
              </div>
              <div style={{ padding: "16px 18px", background: MID, flex: 1, fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>
                {revealData.impostorWord}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10 }}>
            <a href="https://games.jackbrannen.com"
              style={{ display: "block", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none" }}>
              Play Another Game
            </a>
          </div>
        </div>

        {renderUI(
          <FooterButton
            onClick={async () => {
              await rpc("mw_reset_game", { p_code: code })
              localStorage.removeItem(`mrwhite:${code}:playerId`)
              router.replace(`/${code}`)
            }}
            bg={YELLOW}
            textColor="#000"
          >
            Play Again
          </FooterButton>
        )}
      </div>
    )
  }

  // ─── REVEAL ──────────────────────────────────────────────────────────────────
  if (game.phase === "reveal") {
    const revealFooterAction = (() => {
      if (!revealVisible) return footerWait("Revealing…")
      if (eliminatedWasMrWhite === true) return footerWait("Game ending…")
      if (eliminatedWasMrWhite === null) return footerWait("Revealing…")
      if (isCurrentlyEliminated || isEliminated) return footerWait("Waiting for the group…")
      if (iHavePressedNextRound) return footerWait(`${nextRoundReadyCount} / ${nextRoundEligible.length} ready…`)
      return <FooterButton onClick={handleNextRound} bg={YELLOW} textColor="#000">Next Round</FooterButton>
    })()

    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", paddingBottom: BOTTOM_PAD }}>
        <div style={{ padding: "28px 24px 20px", background: DARK }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 6 }}>
            Round {game.round_number}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>
            {revealVisible ? "The verdict is in." : "Stand by…"}
          </div>
        </div>

        <div style={{ padding: "40px 24px", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {revealVisible && (
            <div style={{ background: MID, padding: "28px 24px", width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
                {eliminatedPlayer?.name ?? "That player"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: eliminatedWasMrWhite ? YELLOW : "rgba(255,255,255,0.85)", letterSpacing: "-0.5px" }}>
                {eliminatedWasMrWhite === true && "was Mr. White."}
                {eliminatedWasMrWhite === false && "was NOT Mr. White."}
                {eliminatedWasMrWhite === null && "…"}
              </div>
            </div>
          )}
        </div>

        {renderUI(revealFooterAction)}
      </div>
    )
  }

  // ─── DISCUSSION ──────────────────────────────────────────────────────────────
  if (game.phase === "discussion") {
    const discussionFooterAction = isEliminated ? null : eliminating
      ? footerWait("Revealing…")
      : <FooterButton onClick={() => setConfirmElimination(true)} bg={WARM_LIGHT} textColor="white">I've been eliminated.</FooterButton>

    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", paddingBottom: BOTTOM_PAD }}>
        <div style={{ padding: "28px 24px 20px", background: DARK }}>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 6 }}>
            Round {game.round_number}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>Discussion</div>
        </div>

        <div style={{ padding: "32px 24px", flex: 1 }}>
          {isEliminated ? (
            <div style={{ background: MID, padding: "24px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>You've been eliminated.</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                You can offer advice but can't vote on eliminations.
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 16 }}>
                Players discuss who to accuse of being Mr. White.
              </p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, marginBottom: 16 }}>
                When a player is officially accused, everyone raises their hand to vote to eliminate them. A vote of 50% or more eliminates them.
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
                When eliminated, press the button in the bar below.
              </p>
            </>
          )}
        </div>

        {renderUI(discussionFooterAction)}

        {confirmElimination && (
          <div
            onClick={() => setConfirmElimination(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: MID, width: "100%", padding: "28px 24px", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 12 }}>
                Were you eliminated?
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", fontWeight: 600, marginBottom: 24, lineHeight: 1.5 }}>
                Were you eliminated with a 50% or more vote? If so, everyone will now find out whether or not you were Mr. White.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setConfirmElimination(false)}
                  style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEliminate}
                  style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
                >
                  Yes, reveal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── STATEMENTS (includes initial word-card flip) ─────────────────────────
  if (!cardFlipped) {
    return (
      <div style={{
        minHeight: "100dvh", background: BG, color: "white",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px", paddingBottom: `calc(${FOOTER_H + 48}px + env(safe-area-inset-bottom))`,
      }}>
        <style>{`
          @keyframes cardFly {
            from { transform: translate(0, 0) scale(1); }
            to   { transform: translate(calc(28px - 50vw), calc(50vh + 25px)) scale(0.15); }
          }
        `}</style>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 24, textAlign: "center" }}>
          Your word
        </div>
        <div style={{
          background: MID, width: "100%", maxWidth: 340, aspectRatio: "3/2",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40,
          animation: cardFlipping ? "cardFly 0.75s ease-out forwards" : "none",
        }}>
          <div style={{ fontSize: "clamp(32px, 10vw, 52px)", fontWeight: 900, letterSpacing: "-1px", textAlign: "center", padding: "0 20px" }}>
            {myWord}
          </div>
        </div>
        <button
          onClick={() => {
            if (cardFlipping) return
            setCardFlipping(true)
            setTimeout(() => setCardFlipped(true), 650)
          }}
          style={{
            background: WARM_LIGHT, color: "white", fontSize: 18, fontWeight: 900,
            padding: "18px 32px", width: "100%", maxWidth: 340, display: "block",
            opacity: cardFlipping ? 0 : 1, transition: "opacity 0.2s",
          }}
        >
          Hide
        </button>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 12, textAlign: "center", lineHeight: 1.5, maxWidth: 340, opacity: cardFlipping ? 0 : 1, transition: "opacity 0.2s" }}>
          Open the menu to view your card again.
        </p>
        {renderUI()}
      </div>
    )
  }

  // ─── Statements with card flipped ─────────────────────────────────────────
  const statementsFooterAction = isEliminated
    ? null
    : iHavePressedStatements
      ? footerWait(`${statementsReadyCount} / ${activePlayers.length} ready…`)
      : <FooterButton onClick={handleStatementsDone} bg={YELLOW} textColor="#000">Statements all done</FooterButton>

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", paddingBottom: BOTTOM_PAD }}>
      <div style={{ padding: "28px 24px 20px", background: DARK }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.65, marginBottom: 6 }}>
          Round {game.round_number}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>Statements</div>
      </div>

      <div style={{ padding: "32px 24px", flex: 1 }}>
        {isEliminated ? (
          <div style={{ background: MID, padding: "24px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>You've been eliminated.</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              You can offer advice but can't vote on eliminations.
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.55, marginBottom: 8 }}>
              All players go around and make a <strong>true statement</strong> about their word.
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              Tap the button in the bar below when all statements are made.
            </p>
          </>
        )}
      </div>

      {renderUI(statementsFooterAction)}
    </div>
  )
}
