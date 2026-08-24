"use client"
/*
  Selections — tap-to-select list for voting / answer choosing
  ─────────────────────────────────────────────────────────────
  Renders a vertical list of options. Tapping selects; an ✕ button
  appears on the selected row to deselect. Unselected rows dim when
  something is selected. The player's own item appears last with a label
  and cannot be selected (tap triggers a brief flash).

  Props:
    options       { id, text, isMine? }[]   — list of choices
    selectedId    string | null             — currently selected option id
    onSelect      (id) => void              — called when player picks an option
    onDeselect    () => void                — called when player taps selected item or ✕
    disabled      bool                      — disables all interaction
    colors        {
                    bg,           // unselected row background
                    selectedBg,   // selected row background (default #C8A84B)
                    selectedText, // selected row text color (default #000)
                    flash?,       // flash color on own-item tap (default rgba red 0.25)
                    mineBg?,      // own-item background (default rgba white 0.05)
                    mineText?,    // own-item text color (default rgba white 0.4)
                  }
    mineLabel     string  — label shown below own item when tapped (default "Your answer — can't vote for yourself")
    gap           number  — gap between rows in px (default 6)
    fontSize      number  — text size in px (default 16)
    showLikes     bool                     — show a like (heart) button on each non-mine row, separate from vote selection
    likeCounts    { [id]: number }         — live like count per option id (omit or 0 = no badge)
    likedIds      Set<string> | string[]   — ids the current viewer has already liked (filled heart)
    onToggleLike  (id) => void             — called when the heart is tapped; never called for isMine rows

  Usage (Copycats voting, with likes):
    <Selections
      options={dedupedVotable.map(a => ({ id: a.player_id, text: a.answer, isMine: ... }))}
      selectedId={currentSelectedId}
      onSelect={id => submitVote(id)}
      onDeselect={deselectVote}
      colors={{ bg: MID, selectedBg: YELLOW, selectedText: "#000", deselectBg: DARK, deselectText: YELLOW }}
      showLikes
      likeCounts={likeCountsById}
      likedIds={myLikedIds}
      onToggleLike={toggleLike}
    />

  Usage (GameOfWhat voting):
    <Selections
      options={answerGroups.map(g => ({ id: g.primaryId, text: g.text, isMine: g.playerIds.includes(myPlayerId) }))}
      selectedId={myVoteId}
      onSelect={id => submitVote(id)}
      onDeselect={handleDeselect}
      disabled={submittingVote}
      colors={{ bg: CARD_BG, selectedBg: YELLOW, selectedText: "#000", deselectBg: "#4A123B", deselectText: YELLOW }}
    />

  Usage (Drawful — select then confirm in Footer):
    <Selections
      options={answers.map(a => ({ id: a.id, text: a.text }))}
      selectedId={selectedAnswerId}
      onSelect={setSelectedAnswerId}
      onDeselect={() => setSelectedAnswerId(null)}
      disabled={!!myVote}
      colors={{ bg: WELL_BG, selectedBg: YELLOW, selectedText: "#000", deselectBg: DARK }}
    />
*/

import { useState } from "react"

export default function Selections({
  options = [],
  selectedId = null,
  onSelect,
  onDeselect,
  disabled = false,
  colors = {},
  mineLabel = "Your answer — you can't vote for yourself",
  gap = 6,
  fontSize = 16,
  showLikes = false,
  likeCounts = {},
  likedIds = [],
  onToggleLike,
}) {
  const likedSet = likedIds instanceof Set ? likedIds : new Set(likedIds)
  const [flashId, setFlashId] = useState(null)

  const {
    bg = "rgba(255,255,255,0.12)",
    selectedBg = "#C8A84B",
    selectedText = "#000",
    flash = "rgba(255,80,80,0.25)",
    mineBg = "rgba(255,255,255,0.05)",
    mineText = "rgba(255,255,255,0.4)",
    deselectBg,  // separate ✕ button background
    deselectText = "#C8A84B",  // separate ✕ button text color
  } = colors

  // Put own items last
  const sorted = [...options].sort((a, b) => (a.isMine ? 1 : 0) - (b.isMine ? 1 : 0))

  function handleTap(opt) {
    if (disabled) return
    if (opt.isMine) {
      setFlashId(opt.id)
      setTimeout(() => setFlashId(null), 500)
      return
    }
    const nowSelected = selectedId === opt.id
    if (nowSelected) {
      onDeselect?.()
    } else {
      onSelect?.(opt.id)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {sorted.map(opt => {
        const isSelected = selectedId === opt.id
        const isFlashing = flashId === opt.id
        const dimmed = selectedId && !isSelected && !opt.isMine

        return (
          <div key={opt.id}>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <button
                onClick={() => isSelected ? null : handleTap(opt)}
                disabled={disabled && !opt.isMine}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 16px",
                  textAlign: "left",
                  background: isSelected ? selectedBg : isFlashing ? flash : opt.isMine ? mineBg : bg,
                  color: isSelected ? selectedText : opt.isMine ? mineText : "white",
                  opacity: opt.isMine ? 1 : dimmed ? 0.45 : 1,
                  transition: "opacity 200ms",
                }}
              >
                <span style={{ fontSize, fontWeight: isSelected ? 700 : 500, flex: 1 }}>
                  {opt.text}
                </span>
                {opt.isMine && (
                  <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginLeft: 12 }}>
                    your answer
                  </span>
                )}
              </button>
              {showLikes && !opt.isMine && (
                <button
                  onClick={e => { e.stopPropagation(); onToggleLike?.(opt.id) }}
                  style={{
                    background: bg,
                    color: likedSet.has(opt.id) ? "#F04F52" : "white",
                    opacity: likedSet.has(opt.id) ? 1 : 0.55,
                    fontSize: 16,
                    fontWeight: 800,
                    padding: "16px 14px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span>{likedSet.has(opt.id) ? "♥" : "♡"}</span>
                  {likeCounts[opt.id] > 0 && <span style={{ fontSize: 13 }}>{likeCounts[opt.id]}</span>}
                </button>
              )}
              {isSelected && (
                <button
                  onClick={() => onDeselect?.()}
                  disabled={disabled}
                  style={{
                    background: deselectBg ?? bg,
                    color: deselectText,
                    fontSize: 22,
                    fontWeight: 900,
                    padding: "16px 24px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            {opt.isMine && isFlashing && (
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.flash ?? "#F04F52",
                marginTop: 4,
                marginLeft: 2,
              }}>
                {mineLabel}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
