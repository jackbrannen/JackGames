"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import PokeSystem, { FOOTER_H } from "../../../components/PokeSystem"
import GameModal from "../../../components/GameModal"

const BG = "#C0B298"
const TAN = "#C4924A"
const RED_COLOR = "#CC2222"
const BLUE_COLOR = "#1E50B5"
const CARD_CREAM = "#F2EAD8"
const TEXT = "#1A1008"

// Full revealed colors
const RED_FULL   = "#CC2222"
const BLUE_FULL  = "#1E50B5"
const BLACK_FULL = "#111111"
const TAN_FULL   = "#C4924A"

// Darker versions for spy's revealed card background
const RED_SPY_DARK  = "#7A1010"
const BLUE_SPY_DARK = "#0E2560"
const TAN_SPY_DARK  = "#9A6E38"

function titleCase(word) {
  return word.split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ")
}

function spyXColor(color) {
  if (color === "red")   return "#AA2020"
  if (color === "blue")  return "#1A3A88"
  if (color === "black") return "#383838"
  return "#C08848"
}

function cardBg(card, isCluegiver) {
  if (isCluegiver && card.revealed) {
    if (card.color === "red")   return RED_SPY_DARK
    if (card.color === "blue")  return BLUE_SPY_DARK
    if (card.color === "black") return "#0A0A0A"
    return TAN_SPY_DARK
  }
  if (isCluegiver || card.revealed) {
    if (card.color === "red")   return RED_FULL
    if (card.color === "blue")  return BLUE_FULL
    if (card.color === "black") return BLACK_FULL
    return TAN_FULL
  }
  return CARD_CREAM
}

function cardText(card, isCluegiver) {
  if (isCluegiver || card.revealed) {
    if (card.color === "black") return "rgba(255,255,255,0.85)"
    if (card.color === "tan") return TEXT
    return "white"
  }
  return TEXT
}

function teamColor(team) {
  return team === "red" ? RED_COLOR : BLUE_COLOR
}

function teamLabel(team) {
  return team === "red" ? "Red" : "Blue"
}


const POKE_COLORS = { dark: "#1A1008", mid: "#2E1E0F", wl: "#4A3015", yellow: "#FBDF54", notifBg: "#100C05" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [cards, setCards] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [clueWord, setClueWord] = useState("")
  const [clueNum, setClueNum] = useState(null)
  const [submittingClue, setSubmittingClue] = useState(false)
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [revealFeedback, setRevealFeedback] = useState(null)
  const [showClueRules, setShowClueRules] = useState(false)
  const [showColors, setShowColors] = useState(true)
  const [showGameModal, setShowGameModal] = useState(false)
  const [instructions, setInstructions] = useState("")
  const loadEpochRef = useRef(0)

  async function loadState() {
    const epoch = ++loadEpochRef.current

    const [{ data: gameData }, { data: playerData }, { data: cardData }] = await Promise.all([
      supabase.from("codenames_games")
        .select("code,phase,turn_team,turn_phase,current_clue_word,current_clue_number,guesses_used,first_turn_team,winning_team,turn_selected_card_id,next_game")
        .eq("code", code)
        .single(),
      supabase.from("codenames_players")
        .select("id,name,team,is_cluegiver,ready")
        .eq("game_code", code)
        .order("created_at", { ascending: true }),
      supabase.from("codenames_cards")
        .select("id,word,position,color,revealed")
        .eq("game_code", code)
        .order("position", { ascending: true }),
    ])

    if (epoch !== loadEpochRef.current) return
    if (gameData) setGame(gameData)
    if (playerData) setPlayers(playerData)
    if (cardData) setCards(cardData)
  }

  useEffect(() => {
    const existing = localStorage.getItem(`codenames:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "codenames").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility) }
  }, [code])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])

  useEffect(() => {
    if (!game?.next_game) return
    window.location.href = `https://${game.next_game}.jackbrannen.com/`
  }, [game?.next_game])

  const me = players.find(p => p.id === myPlayerId)

  // ── PokeSystem (always mounted for notifications) ──────────────────────────
  const pokeSystemNode = me ? (
    <PokeSystem
      colors={POKE_COLORS}
      roomCode={code}
      currentPlayer={me.name}
      allPlayers={players.map(p => p.name)}
      playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name, team: p.team, teamColor: p.team === "red" ? RED_COLOR : p.team === "blue" ? BLUE_COLOR : undefined, teamLabel: p.team === "red" ? "Red" : p.team === "blue" ? "Blue" : undefined }))}
      gamePhase={game?.phase}
      rules={instructions ? [["How to Play", instructions]] : null}
      onResetToLobby={async () => { await supabase.rpc("reset_codenames_game", { p_code: code }) }}
    />
  ) : null

  const isCluegiver = !!me?.is_cluegiver
  const myTeam = me?.team
  const isMyTurn = !!myTeam && game?.turn_team === myTeam
  const allGuessesUsed = game?.turn_phase === "guess" &&
    game?.current_clue_number != null &&
    (game?.guesses_used ?? 0) >= game.current_clue_number + 1

  const turnCluegiver = players.find(p => p.team === game?.turn_team && p.is_cluegiver)

  // Counts of un-revealed cards per team
  const redLeft  = cards.filter(c => c.color === "red"  && !c.revealed).length
  const blueLeft = cards.filter(c => c.color === "blue" && !c.revealed).length

  async function selectCard(cardId) {
    if (!isMyTurn || isCluegiver || game?.turn_phase !== "guess" || allGuessesUsed) return
    await supabase
      .from("codenames_games")
      .update({ turn_selected_card_id: cardId })
      .eq("code", code)
    setGame(g => g ? { ...g, turn_selected_card_id: cardId } : g)
  }

  async function submitClue() {
    const word = clueWord.trim()
    if (!word || !clueNum || submittingClue) return
    setSubmittingClue(true)
    await supabase.rpc("submit_codenames_clue", {
      p_code: code,
      p_player_id: myPlayerId,
      p_word: word.toUpperCase(),
      p_number: clueNum,
    })
    setClueWord("")
    setClueNum(null)
    setSubmittingClue(false)
    await loadState()
  }

  async function submitGuess() {
    if (!game?.turn_selected_card_id || submittingGuess) return
    const revealingCard = cards.find(c => c.id === game.turn_selected_card_id)
    setSubmittingGuess(true)
    await supabase.rpc("submit_codenames_guess", {
      p_code: code,
      p_player_id: myPlayerId,
    })
    setSubmittingGuess(false)
    await loadState()
    if (revealingCard) {
      const correct = revealingCard.color === game.turn_team
      const black = revealingCard.color === "black"
      setRevealFeedback(black ? "black" : correct ? "correct" : "incorrect")
      setTimeout(() => setRevealFeedback(null), 3000)
    }
  }

  async function endTurn() {
    await supabase.rpc("end_codenames_turn", {
      p_code: code,
      p_player_id: myPlayerId,
    })
    await loadState()
  }

  async function playAgain() {
    await supabase.rpc("reset_codenames_game", { p_code: code })
    router.replace(`/${code}`)
  }

  async function pickNextGame(gameSub) {
    await supabase.from("codenames_games").update({ next_game: gameSub }).eq("code", code)
  }

  if (!game) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
        {pokeSystemNode}
      </>
    )
  }

  const winnerColor = game.winning_team === "red" ? RED_COLOR : BLUE_COLOR
  const turnColor = teamColor(game.turn_team)

  return (
    <>
    <div style={{ height: "100dvh", background: BG, color: TEXT, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Team bar */}
      {myTeam && (
        <div style={{
          background: myTeam === "red" ? RED_COLOR : BLUE_COLOR,
          color: "white",
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          textAlign: "center",
          padding: "5px 0",
          flexShrink: 0,
        }}>
          {myTeam === "red" ? "Red Team" : "Blue Team"}
        </div>
      )}

      {/* Header bar */}
      <div style={{ background: "rgba(0,0,0,0.18)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
        {game.phase === "finished" ? (
          <div style={{ fontSize: 22, fontWeight: 900, color: winnerColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {teamLabel(game.winning_team)} Wins!
          </div>
        ) : (
          <>
            <div style={{ background: turnColor, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 10px", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              {teamLabel(game.turn_team)}'s Turn
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: TEXT, opacity: 0.55, whiteSpace: "nowrap" }}>Needed to win:</span>
              <span style={{ background: RED_COLOR, color: "white", fontSize: 12, fontWeight: 800, padding: "3px 7px" }}>Red {redLeft}</span>
              <span style={{ background: BLUE_COLOR, color: "white", fontSize: 12, fontWeight: 800, padding: "3px 7px" }}>Blue {blueLeft}</span>
            </div>
          </>
        )}
      </div>

      {/* Active clue display (during guess phase) */}
      {game.phase === "play" && game.turn_phase === "guess" && (
        <div style={{ padding: "14px 16px", background: "rgba(0,0,0,0.12)", textAlign: "center", borderBottom: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }}>
          <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.05em", color: turnColor }}>
            {game.current_clue_word}
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(0,0,0,0.4)", marginLeft: 10 }}>
            {game.current_clue_number}
          </span>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>
            {allGuessesUsed
              ? "All guesses used"
              : `Guesses used: ${game.guesses_used} / ${game.current_clue_number + 1}`}
          </div>
        </div>
      )}

      {/* Game board */}
      <div style={{ padding: "10px", flex: 1, width: "100%", boxSizing: "border-box", overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, width: "100%" }}>
          {cards.map(card => {
            const isSelected = card.id === game.turn_selected_card_id
            const canTap = !card.revealed &&
              game.phase === "play" &&
              game.turn_phase === "guess" &&
              isMyTurn &&
              !isCluegiver &&
              !allGuessesUsed
            const bg = cardBg(card, isCluegiver && showColors)
            const textColor = cardText(card, isCluegiver && showColors)
            const wordLen = card.word.length
            const fontSize = wordLen <= 4 ? 20 : wordLen <= 6 ? 17 : wordLen <= 8 ? 14 : 12
            const display = titleCase(card.word)
            const selectionColor = isCluegiver ? "rgba(255,255,255,0.65)" : TEXT
            const outline = isSelected ? `3px dashed ${selectionColor}` : "none"

            return (
              <div
                key={card.id}
                onClick={() => canTap && selectCard(card.id)}
                style={{
                  aspectRatio: "1",
                  minWidth: 0,
                  overflow: "hidden",
                  position: "relative",
                  background: bg,
                  color: textColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                  textAlign: "center",
                  fontSize,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  overflowWrap: "break-word",
                  hyphens: "auto",
                  WebkitHyphens: "auto",
                  cursor: canTap ? "pointer" : "default",
                  outline,
                  outlineOffset: "-3px",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                {!card.revealed && display}
                {isCluegiver && showColors && card.revealed && (
                  <svg
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <line x1="0" y1="0" x2="100" y2="100" stroke={spyXColor(card.color)} strokeWidth="26" strokeLinecap="square" />
                    <line x1="100" y1="0" x2="0" y2="100" stroke={spyXColor(card.color)} strokeWidth="26" strokeLinecap="square" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Color toggle for cluegiver */}
      {isCluegiver && (
        <div style={{ padding: "4px 16px 0", textAlign: "right" }}>
          <button
            onClick={() => setShowColors(v => !v)}
            style={{
              background: "transparent",
              color: showColors ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)",
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 0",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {showColors ? "Hide colors" : "Show colors"}
          </button>
        </div>
      )}

      {/* Action area */}
      <div style={{ padding: "0 16px", paddingBottom: BOTTOM_PAD, flexShrink: 0 }}>

        {/* Reveal feedback */}
        {revealFeedback && (
          <div style={{
            marginBottom: 8, padding: "10px 14px", textAlign: "center",
            background: revealFeedback === "correct" ? "#1A6B1A" : "#7A1A1A",
            color: "white",
          }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {revealFeedback === "correct" ? "Correct!" : revealFeedback === "black" ? "Black card!" : "Incorrect!"}
            </div>
            {revealFeedback === "incorrect" && (
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Play passes to the other team.</div>
            )}
          </div>
        )}

        {/* ---- GAME OVER ---- */}
        {game.phase === "finished" && (
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(0,0,0,0.5)", textAlign: "center", marginBottom: 12 }}>
              {game.winning_team === myTeam ? "Your team won!" : myTeam ? "Your team lost." : "Game over."}
            </div>
            <button
              onClick={playAgain}
              style={{ background: TEXT, color: "white", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", display: "block", marginBottom: 16 }}
            >
              Play Again
            </button>
            <button onClick={() => setShowGameModal(true)}
              style={{ background: TEXT, color: "white", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
              Play Another Game
            </button>
          </div>
        )}

        {/* ---- CLUE PHASE ---- */}
        {game.phase === "play" && game.turn_phase === "clue" && (
          <>
            {isMyTurn && isCluegiver ? (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <input
                    value={clueWord}
                    onChange={e => setClueWord(e.target.value.replace(/[^a-zA-Z\s]/g, ""))}
                    onKeyDown={e => e.key === "Enter" && clueNum && submitClue()}
                    placeholder="Your clue"
                    maxLength={30}
                    style={{
                      background: "rgba(0,0,0,0.12)",
                      color: TEXT,
                      fontSize: 22,
                      fontWeight: 800,
                      padding: "14px 52px 14px 16px",
                      width: "100%",
                      display: "block",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={() => setShowClueRules(true)}
                    style={{
                      position: "absolute", right: 0, top: 0, bottom: 0, width: 48,
                      background: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.45)",
                      fontSize: 18, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    ?
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "space-between" }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button
                      key={n}
                      onClick={() => setClueNum(n)}
                      style={{
                        flex: 1,
                        aspectRatio: "1",
                        background: clueNum === n ? turnColor : "rgba(0,0,0,0.12)",
                        color: clueNum === n ? "white" : TEXT,
                        fontSize: 16,
                        fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  disabled={!clueWord.trim() || !clueNum || submittingClue}
                  onClick={submitClue}
                  style={{ background: turnColor, color: "white", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", display: "block" }}
                >
                  {submittingClue ? "Sending…" : "Give Clue"}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.4)", letterSpacing: "0.06em" }}>
                  Waiting for{" "}
                  <span style={{ color: turnColor, fontWeight: 900 }}>
                    {turnCluegiver?.name ?? teamLabel(game.turn_team)}
                  </span>
                  {"'s clue…"}
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- GUESS PHASE ---- */}
        {game.phase === "play" && game.turn_phase === "guess" && (
          <>
            {isMyTurn && !isCluegiver ? (
              <div style={{ display: "flex", gap: 8 }}>
                {allGuessesUsed ? (
                  <button
                    onClick={endTurn}
                    style={{ background: turnColor, color: "white", fontSize: 18, fontWeight: 900, padding: "16px 24px", flex: 1 }}
                  >
                    End Turn
                  </button>
                ) : (
                  <>
                    <button
                      disabled={!game.turn_selected_card_id || submittingGuess}
                      onClick={submitGuess}
                      style={{ background: turnColor, color: "white", fontSize: 18, fontWeight: 900, padding: "16px 24px", flex: 1 }}
                    >
                      {submittingGuess ? "Revealing…" : "Submit Guess"}
                    </button>
                    <button
                      onClick={endTurn}
                      style={{ background: "rgba(0,0,0,0.15)", color: TEXT, fontSize: 16, fontWeight: 800, padding: "16px 20px", flexShrink: 0 }}
                    >
                      End Turn
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.4)", letterSpacing: "0.06em" }}>
                  {isMyTurn && isCluegiver
                    ? <><span style={{ color: turnColor, fontWeight: 900 }}>Your team</span> is guessing…</>
                    : <>Waiting for <span style={{ color: turnColor, fontWeight: 900 }}>{teamLabel(game.turn_team)}</span> to guess…</>
                  }
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* Clue Rules Popup */}
      {showClueRules && (
        <div
          onClick={() => setShowClueRules(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: BG, width: "100%", maxHeight: "80vh", borderRadius: "12px 12px 0 0", display: "flex", flexDirection: "column" }}
          >
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: TEXT }}>What clues are allowed?</span>
              <button onClick={() => setShowClueRules(false)} style={{ background: "none", color: TEXT, fontSize: 22, fontWeight: 700, padding: "4px 8px", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 20, color: "#1A6B1A", flexShrink: 0, marginTop: 1 }}>✓</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>Any one-word clue is allowed.</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 20, color: "#1A6B1A", flexShrink: 0, marginTop: 1 }}>✓</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5, marginBottom: 6 }}>Compound words are okay:</div>
                  <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: TEXT, opacity: 0.7 }}>
                    <li style={{ marginBottom: 2 }}>Words that are always hyphenated ("mother-in-law")</li>
                    <li style={{ marginBottom: 2 }}>Anything commonly treated as one word ("ice cream")</li>
                    <li>Names ("Ariana Grande")</li>
                  </ul>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 20, color: RED_COLOR, flexShrink: 0, marginTop: 1 }}>✗</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5, marginBottom: 6 }}>You can't use phrases, sayings, or random combos:</div>
                  <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: TEXT, opacity: 0.7 }}>
                    <li style={{ marginBottom: 2 }}><s>"lake swimming"</s></li>
                    <li style={{ marginBottom: 2 }}><s>"chocolate ice cream"</s></li>
                    <li><s>"under the weather"</s></li>
                  </ul>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 20, color: RED_COLOR, flexShrink: 0, marginTop: 1 }}>✗</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>You can't use any words from the board.</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 20, color: RED_COLOR, flexShrink: 0, marginTop: 1 }}>✗</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>Clues must relate to the meaning of the words on the board, not their position, spelling, etc.</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 20, color: RED_COLOR, flexShrink: 0, marginTop: 1 }}>✗</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>You can't add additional commentary, like "Only Sarah will get this" or "this one is a stretch."</div>
              </div>
            </div>
            <div style={{ padding: "12px 20px 28px", flexShrink: 0 }}>
              <button
                onClick={() => setShowClueRules(false)}
                style={{ background: TEXT, color: "white", fontSize: 17, fontWeight: 900, padding: "16px", width: "100%", display: "block" }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
      {pokeSystemNode}
      {showGameModal && (
        <GameModal
          onClose={() => setShowGameModal(false)}
          onSelect={sub => pickNextGame(sub)}
          currentSub="codenames"
        />
      )}
    </>
  )
}
