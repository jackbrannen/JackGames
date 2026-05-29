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
    onDeselect    () => void                — called when player taps ✕
    disabled      bool                      — disables all interaction
    colors        {
                    bg,           // unselected row background
                    selectedBg,   // selected row background (default #FBDF54)
                    selectedText, // selected row text color (default #000)
                    deselectBg,   // ✕ button background (darker shade)
                    deselectText, // ✕ button text color (default selectedBg)
                    mineLabel?,   // label text color when unflashed (default rgba white 0.65)
                    flash?,       // flash color on own-item tap (default rgba red 0.25)
                  }
    mineLabel     string  — label under own item (default "Your answer — can't vote for yourself")
    gap           number  — gap between rows in px (default 10)
    fontSize      number  — text size in px (default 18)

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
  gap = 10,
  fontSize = 18,
}) {
  const [flashId, setFlashId] = useState(null)

  const {
    bg = "rgba(255,255,255,0.12)",
    selectedBg = "#FBDF54",
    selectedText = "#000",
    deselectBg = "rgba(0,0,0,0.3)",
    deselectText,
    flash = "rgba(255,80,80,0.25)",
  } = colors

  const derivedDeselectText = deselectText ?? selectedBg

  // Put own items last
  const sorted = [...options].sort((a, b) => (a.isMine ? 1 : 0) - (b.isMine ? 1 : 0))

  function handleTap(opt) {
    if (disabled) return
    if (opt.isMine) {
      setFlashId(opt.id)
      setTimeout(() => setFlashId(null), 500)
      return
    }
    if (selectedId === opt.id) return
    onSelect?.(opt.id)
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
                onClick={() => handleTap(opt)}
                disabled={disabled && !opt.isMine}
                style={{
                  flex: 1,
                  background: isSelected ? selectedBg : isFlashing ? flash : opt.isMine ? bg : bg,
                  color: isSelected ? selectedText : "white",
                  fontSize,
                  fontWeight: 700,
                  padding: "18px 20px",
                  textAlign: "left",
                  display: "block",
                  opacity: dimmed ? 0.45 : 1,
                  transition: "opacity 200ms",
                }}
              >
                {opt.text}
              </button>
              {isSelected && (
                <button
                  onClick={() => onDeselect?.()}
                  disabled={disabled}
                  style={{
                    background: deselectBg,
                    color: derivedDeselectText,
                    fontSize: 22,
                    fontWeight: 900,
                    padding: "18px 24px",
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
            {opt.isMine && (
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: isFlashing ? (colors.flash ?? "#F04F52") : "rgba(255,255,255,0.65)",
                marginTop: 4,
                marginLeft: 2,
                transition: "color 150ms",
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
