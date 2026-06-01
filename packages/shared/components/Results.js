"use client"
/*
  Results — post-question results list
  ─────────────────────────────────────
  Shows answer groups with vote counts, authors, and optional bonus/correct
  labels. Below the answers: optional "none of the above" row, skipped names,
  and a per-player points breakdown for this round.

  Props:
    question     { text, authorName }  — displayed above answers (omit to hide)
    items        { id, text, authorNames[], voteCount, voterNames[]?, isBonus?, isCorrect? }[]
                   — sorted externally (usually by voteCount desc); voterNames lists
                   who voted for this answer; isBonus shows "matched +1" badge;
                   isCorrect shows a "✓ correct" label
    notaCount    number  — votes for "none of the above" (0 or omit to hide)
    notaLabel    string  — label for that row (default "None of the above")
    skippedNames string[]  — players who skipped (shown as small footnote)
    scorers      { name, points, detail? }[]
                   — players who earned points this round, shown in a breakdown
                   below the answers. `detail` is a short string like "3 votes · matched +1"
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
      scorers={scorers.map(p => ({ name: p.name, points: pts[p.id], detail: scorerDetail(p) }))}
      colors={{ card: CARD_BG, yellow: YELLOW, dim: WARM_LIGHT }}
    />
*/

export default function Results({
  question,
  items = [],
  notaCount = 0,
  notaLabel = "None of the above",
  skippedNames = [],
  scorers = [],
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
            <div key={item.id} style={{ background: card, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  background: pts > 0 ? yellow : dim,
                  color: pts > 0 ? "#000" : "rgba(255,255,255,0.5)",
                  fontSize: 20, fontWeight: 900,
                  minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0,
                }}>
                  {pts > 0 ? `+${pts}` : "0"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{item.text}</div>
                  {(item.authorNames ?? []).length > 0 && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.4, flexShrink: 0 }}>wrote</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
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
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.4, flexShrink: 0 }}>chose</span>
                      <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.6 }}>{item.voterNames.join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
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

      {/* Points earned this round */}
      {scorers.length > 0 && (
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            Points this question
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scorers.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ background: yellow, color: "#000", fontSize: 18, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "5px 0", flexShrink: 0 }}>
                  +{s.points}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
                  {s.detail && (
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.65 }}>{s.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
