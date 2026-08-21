"use client"

import { useEffect, useRef, useState } from "react"
import { EMOJIS } from "../../lib/emojis"
import manifest from "../../public/voices/manifest.json"
import { FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE } from "../../components/styles"

const ALL_CARDS = Object.values(manifest.cards)
const TURN_SECONDS = 30
const MY_COLOR = "hsl(205, 80%, 55%)"
const MY_INITIALS = "YOU"
const CARD_RATIO = 4 / 3
const CELL_GAP = 3
const SELECT_BORDER_W = 3
const ASSIGNED_BORDER_W = 7
const EDGE_PAD = Math.ceil(ASSIGNED_BORDER_W)
const FEEDBACK_STRIP_H = 36
const FEEDBACK_MS = 700

const RING_POSITIONS = [
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
  { row: 1, col: 0 },                     { row: 1, col: 2 },
  { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
]

function sample(arr, n) {
  const copy = [...arr]
  const out = []
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return out
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const BOYS_COLOR = "hsl(210, 70%, 45%)"
const GIRLS_COLOR = "hsl(280, 55%, 45%)"
const ACTIVE_TEAM = "boys"

function ScoreBoxes({ scores }) {
  const boxStyle = (bg) => ({
    background: bg,
    color: "#fff",
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.black,
    padding: `4px ${SPACE.xs}px`,
  })
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={boxStyle(BOYS_COLOR)}>Boys {scores.boys}</span>
      <span style={boxStyle(GIRLS_COLOR)}>Girls {scores.girls}</span>
    </div>
  )
}

const RECENT_CATEGORIES_TO_AVOID = 2

function pickEmojiWithVariety(recentCategories) {
  const avoid = new Set(recentCategories.slice(-RECENT_CATEGORIES_TO_AVOID))
  const pool = EMOJIS.filter((e) => !avoid.has(e.category))
  return pickOne(pool.length ? pool : EMOJIS)
}

export default function DevPreviewPage() {
  const [devRole, setDevRole] = useState("guessing")
  const [scores, setScores] = useState({ boys: 0, girls: 0 })
  const [round] = useState({ current: 3, total: 6 })

  const [cards, setCards] = useState(null)
  const [emoji, setEmoji] = useState(null)
  const [assignedIndex, setAssignedIndex] = useState(null)

  const [selectedIndex, setSelectedIndex] = useState(null)
  const [badge, setBadge] = useState(null)
  const badgeTimers = useRef([])
  const recentCategories = useRef([])
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  const [remaining, setRemaining] = useState(TURN_SECONDS)
  const [paused, setPaused] = useState(false)
  const [turnOver, setTurnOver] = useState(false)
  const rafRef = useRef(null)
  const lastTickRef = useRef(null)

  const boardWrapRef = useRef(null)
  const [cellSize, setCellSize] = useState({ w: 100, h: 100 })

  // Index into ALL_CARDS for the "browse every card" strip at the bottom.
  const [browseIndex, setBrowseIndex] = useState(0)

  useEffect(() => {
    const el = boardWrapRef.current
    if (!el) return
    function measure() {
      const availW = el.clientWidth - EDGE_PAD * 2
      const availH = el.clientHeight - EDGE_PAD * 2
      const wFromWidth = (availW - CELL_GAP * 2) / 3
      const wFromHeight = (availH - CELL_GAP * 2) / 3 / CARD_RATIO
      const w = Math.max(40, Math.floor(Math.min(wFromWidth, wFromHeight)))
      setCellSize({ w, h: Math.floor(w * CARD_RATIO) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cards])

  useEffect(() => {
    setCards(sample(ALL_CARDS, 8))
    const first = pickEmojiWithVariety(recentCategories.current)
    recentCategories.current.push(first.category)
    setEmoji(first)
    setAssignedIndex(Math.floor(Math.random() * 8))
  }, [])

  useEffect(() => {
    function tick(now) {
      if (lastTickRef.current == null) lastTickRef.current = now
      const dt = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      if (!paused && !turnOver) {
        setRemaining((r) => {
          const next = Math.max(0, r - dt)
          if (next === 0) setTurnOver(true)
          return next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, turnOver])

  function newTurn() {
    clearTimeout(feedbackTimer.current)
    setFeedback(null)
    setCards(sample(ALL_CARDS, 8))
    nextEmoji()
    setScores({ boys: 0, girls: 0 })
    setRemaining(TURN_SECONDS)
    setPaused(false)
    setTurnOver(false)
  }

  function nextEmoji() {
    const next = pickEmojiWithVariety(recentCategories.current)
    recentCategories.current.push(next.category)
    setEmoji(next)
    setAssignedIndex(Math.floor(Math.random() * 8))
    setSelectedIndex(null)
    setBadge(null)
    badgeTimers.current.forEach(clearTimeout)
    badgeTimers.current = []
  }

  function selectCard(index) {
    if (turnOver || paused) return
    if (devRole !== "guessing") return
    if (selectedIndex === index) return
    setSelectedIndex(index)
    const key = Date.now()
    badgeTimers.current.forEach(clearTimeout)
    badgeTimers.current = []
    setBadge({ index, key, fading: false })
    const t1 = setTimeout(() => setBadge((b) => (b?.key === key ? { ...b, fading: true } : b)), 2000)
    const t2 = setTimeout(() => setBadge((b) => (b?.key === key ? null : b)), 2500)
    badgeTimers.current = [t1, t2]
  }

  function submitGuess() {
    if (selectedIndex == null || turnOver || paused || feedback) return
    const correct = selectedIndex === assignedIndex
    setScores((s) => ({ ...s, boys: s.boys + (correct ? 1 : -1) }))
    setFeedback({ correct, index: selectedIndex })
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
      nextEmoji()
    }, FEEDBACK_MS)
  }

  const bannerText =
    devRole === "giving" ? "You're doing voices" : devRole === "guessing" ? "You're guessing" : "Don't guess"
  const canSelect = devRole === "guessing"
  const canSeeAssigned = devRole === "giving"

  if (!cards || !emoji) return null

  const browseCard = ALL_CARDS[browseIndex]

  return (
    <div style={{ height: "100dvh", width: "100%", display: "flex", flexDirection: "column", background: "#101014" }}>
      <div
        style={{
          flexShrink: 0,
          padding: "6px 0",
          textAlign: "center",
          background: ACTIVE_TEAM === "boys" ? BOYS_COLOR : GIRLS_COLOR,
          color: "#fff",
          fontSize: FONT_SIZE.small,
          fontWeight: FONT_WEIGHT.black,
        }}
      >
        DEV PREVIEW — {ALL_CARDS.length} cards in pool — {ACTIVE_TEAM === "boys" ? "Boys' Turn" : "Girls' Turn"}
      </div>

      <div style={{ flexShrink: 0, height: 10, background: remaining / TURN_SECONDS > 0.3 ? "hsla(145, 65%, 48%, 0.15)" : "hsla(0, 80%, 55%, 0.15)" }}>
        <div
          style={{
            height: "100%",
            width: `${(remaining / TURN_SECONDS) * 100}%`,
            background: remaining / TURN_SECONDS > 0.3 ? "hsl(145, 65%, 48%)" : "hsl(0, 80%, 55%)",
            transition: "width 0.1s linear, background 300ms ease",
          }}
        />
      </div>

      <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})` }}>
            Round {round.current} of {round.total}
          </span>
          <ScoreBoxes scores={scores} />
        </div>
        <div style={{ marginTop: 6, fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>
          {bannerText}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          height: FEEDBACK_STRIP_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: feedback ? (feedback.correct ? "hsl(145, 70%, 38%)" : "hsl(0, 70%, 45%)") : "transparent",
          color: "#fff",
          fontSize: FONT_SIZE.body,
          fontWeight: FONT_WEIGHT.black,
        }}
      >
        {feedback ? (feedback.correct ? "Correct" : "Incorrect") : ""}
      </div>

      <div ref={boardWrapRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: EDGE_PAD, minHeight: 0 }}>
        {turnOver ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>Turn over</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
              <ScoreBoxes scores={scores} />
            </div>
          </div>
        ) : paused ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>Paused</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(3, ${cellSize.w}px)`,
              gridTemplateRows: `repeat(3, ${cellSize.h}px)`,
              gap: CELL_GAP,
            }}
          >
            {RING_POSITIONS.map((pos, i) => {
              const card = cards[i]
              const isSelected = selectedIndex === i
              const isAssigned = canSeeAssigned && assignedIndex === i
              const isFeedback = feedback && feedback.index === i
              const badgeOnLeft = pos.col === 2
              return (
                <div key={i} style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1, position: "relative", width: cellSize.w, height: cellSize.h }}>
                  <button
                    onClick={() => selectCard(i)}
                    disabled={!canSelect}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: 0,
                      overflow: "hidden",
                      background: "hsl(220, 10%, 10%)",
                      border: isFeedback
                        ? feedback.correct
                          ? `${SELECT_BORDER_W}px solid hsl(145, 80%, 50%)`
                          : `${SELECT_BORDER_W}px solid hsl(0, 85%, 60%)`
                        : isSelected
                        ? `${SELECT_BORDER_W}px solid hsl(48, 95%, 60%)`
                        : isAssigned
                        ? `${ASSIGNED_BORDER_W}px solid hsl(145, 80%, 45%)`
                        : `${SELECT_BORDER_W}px solid transparent`,
                      opacity: OPACITY.full,
                    }}
                  >
                    <img
                      src={`/voices/${card.file}`}
                      alt={card.name}
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                    />
                  </button>
                  {badge && badge.index === i && (
                    <div
                      style={{
                        position: "absolute",
                        top: -6,
                        left: badgeOnLeft ? -6 : "auto",
                        right: badgeOnLeft ? "auto" : -6,
                        width: 26,
                        height: 26,
                        zIndex: 10,
                        borderRadius: "50%",
                        background: MY_COLOR,
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: FONT_WEIGHT.bold,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: badge.fading ? 0 : 1,
                        transition: badge.fading ? "opacity 500ms ease" : "none",
                      }}
                    >
                      {MY_INITIALS}
                    </div>
                  )}
                </div>
              )
            })}
            <div
              style={{
                gridRow: 2,
                gridColumn: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: Math.floor(Math.min(cellSize.w, cellSize.h) * 0.64),
                lineHeight: 1,
              }}
            >
              {emoji.emoji}
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: SPACE.sm }}>
        <button
          onClick={() => setPaused((p) => !p)}
          disabled={turnOver}
          style={{ background: "hsl(0, 0%, 22%)", color: "#fff", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, padding: `${SPACE.xs}px ${SPACE.sm}px` }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={submitGuess}
          disabled={selectedIndex == null || !canSelect || paused || turnOver || !!feedback}
          style={{ flex: 1, background: "hsl(145, 60%, 32%)", color: "#fff", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.black, padding: `${SPACE.xs}px ${SPACE.sm}px` }}
        >
          Submit
        </button>
      </div>

      {/* Dev preview controls */}
      <div style={{ flexShrink: 0, padding: `${SPACE.xs}px ${SPACE.lg}px`, borderTop: "1px dashed rgba(255,255,255,0.2)", display: "flex", gap: SPACE.xs, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: FONT_SIZE.min, color: `rgba(255,255,255,${OPACITY.muted})` }}>DEV:</span>
        {["guessing", "giving", "otherTeam"].map((r) => (
          <button
            key={r}
            onClick={() => setDevRole(r)}
            style={{ background: devRole === r ? "hsl(205, 80%, 40%)" : "hsl(0,0%,18%)", color: "#fff", fontSize: FONT_SIZE.min, padding: "4px 8px" }}
          >
            {r}
          </button>
        ))}
        <button onClick={newTurn} style={{ background: "hsl(0,0%,18%)", color: "#fff", fontSize: FONT_SIZE.min, padding: "4px 8px" }}>
          New turn
        </button>
      </div>

      {/* Browse-every-card strip — steps through the whole manifest one at a time so you
          can eyeball every processed image, independent of the random 8-card sample above. */}
      <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, borderTop: "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <button onClick={() => setBrowseIndex((i) => (i - 1 + ALL_CARDS.length) % ALL_CARDS.length)} style={{ background: "hsl(0,0%,18%)", color: "#fff", fontSize: FONT_SIZE.small, padding: "6px 10px" }}>
          ◀
        </button>
        <div style={{ width: 48, height: 64, flexShrink: 0, overflow: "hidden", background: "hsl(220,10%,10%)" }}>
          <img src={`/voices/${browseCard.file}`} alt={browseCard.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, color: "#fff", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold }}>
          {browseIndex + 1} / {ALL_CARDS.length} — {browseCard.name} ({browseCard.slug})
        </div>
        <button onClick={() => setBrowseIndex((i) => (i + 1) % ALL_CARDS.length)} style={{ background: "hsl(0,0%,18%)", color: "#fff", fontSize: FONT_SIZE.small, padding: "6px 10px" }}>
          ▶
        </button>
      </div>
    </div>
  )
}
