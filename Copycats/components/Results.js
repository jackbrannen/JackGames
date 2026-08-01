"use client"
/*
  Results — post-question results list
  ─────────────────────────────────────
  Shows answer groups with vote counts, authors, and optional bonus/correct
  labels. Below the answers: overall game scores sorted descending.

  Props:
    question     { text, authorName }  — displayed above answers (omit to hide)
    items        { id, text, authorNames[], voteCount, voterNames[]?, isBonus?, isCorrect?, likeCount? }[]
                   — sorted externally (usually by voteCount desc); voterNames lists
                   who voted for this answer; isBonus shows "matched +1" badge;
                   isCorrect shows a "✓ correct" label; likeCount (omit to hide) shows
                   a thumbs-up count right-aligned in the row
    notaCount    number  — votes for "none of the above" (0 or omit to hide)
    notaLabel    string  — label for that row (default "None of the above")
    skippedNames string[]  — players who skipped (shown as small footnote)
    scores       { name, score, likeCount? }[]
                   — all players with their current overall score, sorted descending;
                   shown as a simple scoreboard below the answers; likeCount (omit to
                   hide) shows each player's total likes received, right-aligned
    colors       {
                   card,    // answer card background
                   yellow,  // accent / vote badge fill when pts > 0
                   dim,     // vote badge background when pts = 0
                 }
    gap          number  — gap between answer cards (default 12)

  Usage (GameOfWhat):
    <Results
      question={{ text: snap.question.text, authorName: authorPlayer?.name }}
      items={answerGroups.map(g => ({
        id: g.primaryId,
        text: g.text,
        authorNames: g.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean),
        voteCount: g.voteCount,
        isBonus: g.playerIds.length > 1,
      }))}
      notaCount={notaVoters.length}
      skippedNames={skipped.map(a => players.find(p => p.id === a.player_id)?.name).filter(Boolean)}
      scores={[...players].sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score }))}
      colors={{ card: CARD_BG, yellow: YELLOW, dim: WARM_LIGHT }}
    />
*/

import { ThumbsUpIcon } from "./Selections"

function LikeBadge({ count, size = 18, fontSize = 12 }) {
  const liked = count > 0
  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: liked ? "#FBDF54" : "rgba(255,255,255,0.4)" }}>
      <ThumbsUpIcon filled={liked} size={size} />
      <span style={{ fontSize, fontWeight: 700 }}>{count}</span>
    </div>
  )
}

export default function Results({
  question,
  items = [],
  notaCount = 0,
  notaLabel = "None of the above",
  skippedNames = [],
  scores = [],
  colors = {},
  gap = 12,
}) {
  const { card = "rgba(255,255,255,0.12)", yellow = "#FBDF54", dim = "rgba(255,255,255,0.15)" } = colors

  return (
    <div>
      {/* Question */}
      {question && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            {question.authorName ? `${question.authorName}'s question` : "Question"}
          </div>
          <div style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, lineHeight: 1.25 }}>
            {question.text}
          </div>
        </div>
      )}

      {/* Answer groups */}
      <div style={{ display: "flex", flexDirection: "column", gap, marginBottom: 28 }}>
        {items.map(item => {
          const pts = item.voteCount ?? 0
          return (
            <div key={item.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, background: card, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    background: pts > 0 ? yellow : dim,
                    color: pts > 0 ? "#000" : "rgba(255,255,255,0.5)",
                    fontSize: 20, fontWeight: 900,
                    minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0,
                  }}>
                    {pts > 0 ? `+${pts}` : "0"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: "white" }}>{item.text}</div>
                    {(item.authorNames ?? []).length > 0 && (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "white", opacity: 0.4, flexShrink: 0 }}>Written by</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                          {(item.authorNames ?? []).join(" & ")}
                          {item.isBonus && (
                            <span style={{ marginLeft: 6, background: yellow, color: "#000", fontSize: 11, fontWeight: 900, padding: "1px 5px", verticalAlign: "middle" }}>
                              matched +1
                            </span>
                          )}
                          {item.isCorrect && (
                            <span style={{ marginLeft: 6, color: yellow, fontSize: 12, fontWeight: 900 }}>
                              ✓ correct
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {(item.voterNames ?? []).length > 0 && (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "white", opacity: 0.4, flexShrink: 0 }}>Chosen by</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "white", opacity: 0.6 }}>{item.voterNames.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {item.likeCount !== undefined && <LikeBadge count={item.likeCount} />}
            </div>
          )
        })}

        {/* None of the above */}
        {notaCount > 0 && (
          <div style={{ background: card, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ background: dim, color: "rgba(255,255,255,0.5)", fontSize: 20, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0 }}>
                {notaCount}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, opacity: 0.65 }}>{notaLabel}</div>
            </div>
          </div>
        )}

        {/* Skipped */}
        {skippedNames.length > 0 && (
          <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 4 }}>
            Skipped: {skippedNames.join(", ")}
          </div>
        )}
      </div>

      {/* Overall scores */}
      {scores.length > 0 && (
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            Scores
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {scores.map((s, i) => (
              <div key={i} style={{ display: "flex" }}>
                <div style={{
                  background: i === 0 ? yellow : dim,
                  color: i === 0 ? "#000" : "rgba(255,255,255,0.75)",
                  fontSize: 20, fontWeight: 900,
                  minWidth: 52, textAlign: "center", padding: "10px 0", flexShrink: 0,
                }}>
                  {s.score}
                </div>
                <div style={{ background: card, padding: "10px 16px", flex: 1, display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>{s.name}</span>
                </div>
                {s.likeCount !== undefined && <div style={{ marginLeft: 8, display: "flex", alignItems: "center" }}><LikeBadge count={s.likeCount} size={16} fontSize={13} /></div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
