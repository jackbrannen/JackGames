"use client"
/*
  EndGame — post-game final scores screen
  ─────────────────────────────────────────
  Shows "Game Over", final player scores sorted with winner(s) highlighted,
  Play Again and Play Another Game buttons. Accepts optional slots for
  content above the score list (e.g. team winner banner) and below the
  buttons (e.g. Fishbowl's full clue list).

  Props:
    players        { id, name, score }[]   — sorted descending by score; winner = max score
    myPlayerId     string | null           — highlights "you" label on the player's own row
    onPlayAgain    fn                      — called when Play Again is tapped
    onPlayAnotherGame fn                   — called when Play Another Game is tapped
    aboveScores    ReactNode               — optional content between "Game Over" and the score list
    belowButtons   ReactNode               — optional content below the two action buttons
    bottomPad      string                  — paddingBottom for the scrollable area (e.g. BOTTOM_PAD)
    colors         {
                     yellow,  // winner badge + accent
                     wl,      // non-winner score badge + secondary button bg
                   }

  Usage (GameOfWhat):
    <EndGame
      players={finalPlayers}
      myPlayerId={myPlayerId}
      onPlayAgain={resetGame}
      onPlayAnotherGame={() => setShowGameModal(true)}
      bottomPad={BOTTOM_PAD}
      colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
    />
*/

export default function EndGame({
  players = [],
  myPlayerId = null,
  onPlayAgain,
  onPlayAnotherGame,
  aboveScores,
  belowButtons,
  bottomPad = "40px",
  colors = {},
}) {
  const { yellow = "#FBDF54", wl = "rgba(255,255,255,0.15)" } = colors

  const topScore = players[0]?.score ?? 0
  const isTie = players.filter(p => p.score === topScore).length > 1

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", paddingBottom: bottomPad }}>
      <div style={{ fontSize: "clamp(56px, 16vw, 88px)", fontWeight: 900, lineHeight: 0.9, marginBottom: 32 }}>
        Game<br />Over
      </div>

      {aboveScores}

      <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
        Final Scores
      </div>

      {players.map(p => {
        const isWinner = p.score === topScore
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{
              background: isWinner ? yellow : wl,
              color: isWinner ? "#000" : "white",
              fontSize: 22, fontWeight: 900,
              minWidth: 52, textAlign: "center", padding: "8px 0",
            }}>
              {p.score}
            </div>
            <div>
              <span style={{ fontSize: 22, fontWeight: 700 }}>
                {p.name}
                {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
              </span>
              {isWinner && (
                <span style={{ fontSize: 12, fontWeight: 800, color: yellow, marginLeft: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {isTie ? "Tied!" : "Winner!"}
                </span>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 10 }}>
        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            style={{ background: yellow, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}
          >
            Play Again
          </button>
        )}
        {onPlayAnotherGame && (
          <button
            onClick={onPlayAnotherGame}
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}
          >
            Play Another Game
          </button>
        )}
      </div>

      {belowButtons}
    </div>
  )
}
