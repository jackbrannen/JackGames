"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import FooterButton from "../../../components/FooterButton"
import WaitingList from "../../../components/WaitingList"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import StatusBar from "../../../components/StatusBar"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import CARDS from "../../../lib/cards_data.json"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import { SLOT_NAMES, LEAF_NAMES, rotateCW, scoreGuess } from "../../../lib/clover.js"

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

const BG          = "#6B8C2A"
const COOL_DARK   = "#4C7523"
const MID_DARK    = "#5A8026"
const WARM_LIGHT  = "#90A331"
const ACCENT      = "#FBDF54"
const WHITE       = "white"
const MUTED       = "rgba(255,255,255,0.65)"
const ROTATE_GREEN = "#22c55e"

// ─── Card face ───────────────────────────────────────────────────────────────
// boardRotation (0–3): CSS counter-rotation applied to each word so text stays
// readable when the board container has been CSS-rotated by boardRotation*90°.
//
// Font size formula: unified for all 4 edges so equal-length words are equal
// size regardless of orientation. Vertical writing-mode constrains height to
// word.length * fontSize * 1.15, so we derive fontSize from that constraint and
// apply it to all four sides — horizontal words simply have room to spare.
// Cap at 12% of card size so short words aren't oversized.
// Factor 1.05 is a gentle slope — long words stay readable without overflowing.
// Minimum raised to 11px so 8-12 char words don't drop to near-illegible sizes.
function wordFontSize(word, size) {
  const maxFs = Math.floor(size * 0.12)
  return Math.max(11, Math.min(maxFs, Math.floor((size - 32) / (word.length * 1.05))))
}

function CardFace({ words, rotation = 0, boardRotation = 0, activeEdges = [], size = 100, dim = false }) {
  const wrapRef = useRef(null)
  const prevRot   = useRef(rotation)
  const prevWords = useRef(words)

  useEffect(() => {
    if (!wrapRef.current) return
    const wordsChanged = prevWords.current !== words
    const rotChanged   = prevRot.current !== rotation
    prevWords.current = words
    prevRot.current   = rotation
    // Only animate when the SAME card was explicitly rotated by the user.
    // If the words reference changed, a different card slotted in (board
    // rotation reshuffled the grid) — snap silently instead of animating.
    if (!rotChanged || wordsChanged) return
    const el = wrapRef.current
    el.style.transition = "none"
    el.style.transform = "rotate(-90deg)"   // start 90° back (CW direction)
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.22s ease"
      el.style.transform = "rotate(0deg)"
    })
  }, [rotation, words])

  // canonP is the canonical display position (pre-board-rotation). At board
  // rotation R, visual slot p shows what would be at canonical slot (p-R+4)%4.
  // activeEdges are in canonical space (fixed per slot placement).
  const displayed = [0, 1, 2, 3].map(p => {
    const canonP = (p - boardRotation + 4) % 4
    return {
      word: cap(words[(canonP - rotation + 4) % 4]),
      active: activeEdges.length === 0 || activeEdges.includes(canonP),
    }
  })

  return (
    <div ref={wrapRef} style={{
      width: size, height: size, background: "white", position: "relative",
      flexShrink: 0, opacity: dim ? 0.5 : 1,
      boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 5, left: 6, right: 6,
        textAlign: "center", fontSize: wordFontSize(displayed[0].word, size), fontWeight: 900,
        color: displayed[0].active ? "#2a1a0a" : "#ccc",
        overflow: "hidden", whiteSpace: "nowrap",
      }}>{displayed[0].word}</div>

      <div style={{
        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        display: "flex", alignItems: "center",
      }}>
        <span style={{
          fontSize: wordFontSize(displayed[1].word, size), fontWeight: 900,
          color: displayed[1].active ? "#2a1a0a" : "#ccc",
          writingMode: "vertical-rl",
        }}>{displayed[1].word}</span>
      </div>

      <div style={{
        position: "absolute", bottom: 5, left: 6, right: 6,
        textAlign: "center", fontSize: wordFontSize(displayed[2].word, size), fontWeight: 900,
        color: displayed[2].active ? "#2a1a0a" : "#ccc",
        overflow: "hidden", whiteSpace: "nowrap",
      }}>{displayed[2].word}</div>

      <div style={{
        position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
        display: "flex", alignItems: "center",
      }}>
        <span style={{
          fontSize: wordFontSize(displayed[3].word, size), fontWeight: 900,
          color: displayed[3].active ? "#2a1a0a" : "#ccc",
          writingMode: "vertical-rl", transform: "rotate(180deg)",
        }}>{displayed[3].word}</span>
      </div>
    </div>
  )
}

// Active canonical edges per slot (outer edges of 2×2 block, fixed regardless of board rotation)
const SLOT_ACTIVE_EDGES = { top: [0, 3], right: [0, 1], left: [2, 3], bottom: [1, 2] }

// Functional board rotation tables
const SLOT_AT_POS = [
  { TL: 'top',    TR: 'right',  BL: 'left',   BR: 'bottom' },
  { TL: 'left',   TR: 'top',    BL: 'bottom',  BR: 'right'  },
  { TL: 'bottom', TR: 'left',   BL: 'right',   BR: 'top'    },
  { TL: 'right',  TR: 'bottom', BL: 'top',     BR: 'left'   },
]
const LEAF_AT_STRIP = [
  { top: 'topRight',    right: 'bottomRight', bottom: 'bottomLeft', left: 'topLeft'     },
  { top: 'topLeft',     right: 'topRight',    bottom: 'bottomRight', left: 'bottomLeft'  },
  { top: 'bottomLeft',  right: 'topLeft',     bottom: 'topRight',   left: 'bottomRight' },
  { top: 'bottomRight', right: 'bottomLeft',  bottom: 'topLeft',    left: 'topRight'    },
]

// ─── SlotCell — module-level so React never remounts it on re-render ──────────
function SlotCell({ slotName, cs, placement, locked, highlight, interactive, activeEdges, boardRotation, onSlotPointerDown, onSlotRotate, hidingSlots }) {
  const boxShadow = highlight === "correct"
    ? "inset 0 0 0 5px #22c55e, 0 0 0 4px #22c55e"
    : highlight === "wrong"
    ? "inset 0 0 0 5px #ef4444, 0 0 0 4px #ef4444"
    : "none"
  return (
    <div
      data-slot={slotName}
      style={{
        width: cs, height: cs, position: "relative",
        boxShadow,
        background: "transparent",
        transition: "box-shadow 0.2s",
        touchAction: "none",
      }}
    >
      {!placement && (
        <div style={{
          position: "absolute", inset: 14,
          border: "1.5px dashed rgba(255,255,255,0.35)",
          pointerEvents: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>
            Drag card here
          </span>
        </div>
      )}
      {placement ? (
        <div
          onPointerDown={interactive && !locked ? e => onSlotPointerDown?.(e, slotName) : undefined}
          style={{
            cursor: interactive && !locked ? "grab" : "default",
            width: cs, height: cs, touchAction: "none",
            visibility: hidingSlots?.has(slotName) ? "hidden" : "visible",
          }}
        >
          <CardFace
            words={CARDS[placement.cardIndex]}
            rotation={placement.rotation}
            boardRotation={boardRotation ?? 0}
            activeEdges={activeEdges ?? []}
            size={cs}
          />
          {locked && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(34,197,94,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>✓</div>
          )}
          {interactive && !locked && onSlotRotate && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onSlotRotate(slotName) }}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                background: "none", color: ROTATE_GREEN,
                fontSize: 28, padding: "4px", lineHeight: 1,
              }}
            >↻</button>
          )}
        </div>
      ) : (
        <div style={{ width: cs, height: cs }} />
      )}
    </div>
  )
}

// ─── StripCell — clue strip for one leaf zone ────────────────────────────────
// wordA and wordB are the visually-adjacent outer edge words of the two cards
// touching this strip (computed by getVisualEdgeWord in CloverBoard).
function stripWordFs(word) {
  if (!word) return 14
  return Math.max(13, Math.min(20, Math.floor(72 / (word.length * 0.60))))
}

function StripCell({ leafName, side, ls, cs, wordA, wordB, clue, showClues, onClueChange }) {
  const dA = wordA ? cap(wordA) : "·"
  const dB = wordB ? cap(wordB) : "·"
  const fsA = stripWordFs(dA)
  const fsB = stripWordFs(dB)

  const innerContent = (
    <>
      <span style={{ fontSize: fsA, fontWeight: 700, color: WHITE, overflow: "hidden", whiteSpace: "nowrap" }}>{dA}</span>
      <span style={{ fontSize: 12, color: WHITE, opacity: 0.65, flexShrink: 0 }}>×</span>
      <span style={{ fontSize: fsB, fontWeight: 700, color: WHITE, overflow: "hidden", whiteSpace: "nowrap" }}>{dB}</span>
      <span style={{ fontSize: 12, color: WHITE, opacity: 0.65, flexShrink: 0 }}>=</span>
      {showClues && onClueChange ? (
        <input
          className="sc-clue-input"
          type="text" placeholder="clue" value={clue}
          onChange={e => onClueChange(leafName, e.target.value)}
          style={{ flex: 1, minWidth: 0, maxWidth: 140, background: WHITE, color: "#1a1a1a", fontSize: 15, fontWeight: 800, padding: "6px 8px", textAlign: "center" }}
          maxLength={20}
        />
      ) : clue ? (
        <span style={{ fontSize: 15, fontWeight: 900, color: ACCENT, whiteSpace: "nowrap" }}>{clue}</span>
      ) : null}
    </>
  )

  if (side === "top" || side === "bottom") {
    return (
      <div style={{ width: 2 * cs, height: ls, background: COOL_DARK, display: "flex", alignItems: "center", justifyContent: "center", gap: GAP.selection, padding: "0 10px" }}>
        {innerContent}
      </div>
    )
  }

  const rotDeg = side === "left" ? -90 : 90
  return (
    <div style={{ width: ls, height: 2 * cs, background: COOL_DARK, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ width: 2 * cs, height: ls, flexShrink: 0, transform: `rotate(${rotDeg}deg)`, display: "flex", alignItems: "center", justifyContent: "center", gap: GAP.selection, padding: "0 10px" }}>
        {innerContent}
      </div>
    </div>
  )
}

// Returns the word displayed on visual edge edgeP of the card in visual position
// visualPos, accounting for board rotation and the card's own rotation.
// This is used to show the words adjacent to each border strip.
function getVisualEdgeWord(slots, cards, boardRotation, visualPos, edgeP) {
  const sn = SLOT_AT_POS[boardRotation][visualPos]
  const pl = slots[sn]
  if (!pl) return null
  const canonP = (edgeP - boardRotation + 4) % 4
  return cards[pl.cardIndex][(canonP - pl.rotation + 4) % 4]
}

// ─── Clover board — functional rotation with animate-then-swap ────────────────
// boardRotation (0–3): remaps which slot/leaf appears at each visual position.
// boardRef: attach to the outer div for the CSS rotation animation in PlayPage.
function CloverBoard({
  slots, clues, interactive, boardRotation, boardRef,
  onSlotPointerDown, onSlotRotate, onClueChange,
  showClues, lockedSlots, highlightSlots, CARD_SIZE, LEAF_SIZE, hidingSlots,
}) {
  const cs   = CARD_SIZE
  const ls   = LEAF_SIZE
  const r    = boardRotation ?? 0
  const pos  = SLOT_AT_POS[r]
  const leaf = LEAF_AT_STRIP[r]

  function slotCell(visualPos) {
    const sn = pos[visualPos]
    return (
      <SlotCell
        slotName={sn} cs={cs}
        placement={slots[sn]}
        locked={lockedSlots?.has(sn)}
        highlight={highlightSlots?.[sn]}
        interactive={interactive}
        activeEdges={SLOT_ACTIVE_EDGES[sn]}
        boardRotation={r}
        onSlotPointerDown={onSlotPointerDown}
        onSlotRotate={onSlotRotate}
        hidingSlots={hidingSlots}
      />
    )
  }

  // Strip words are computed from the outer visual edges of the two cards
  // adjacent to each border, so the displayed words match what the player
  // actually sees on the card face nearest to the strip.
  const STRIP_EDGES = {
    top:    [['TL', 0], ['TR', 0]],
    right:  [['TR', 1], ['BR', 1]],
    bottom: [['BL', 2], ['BR', 2]],
    left:   [['TL', 3], ['BL', 3]],
  }

  function stripCell(side) {
    const ln = leaf[side]
    const [[vp1, e1], [vp2, e2]] = STRIP_EDGES[side]
    const wordA = getVisualEdgeWord(slots, CARDS, r, vp1, e1)
    const wordB = getVisualEdgeWord(slots, CARDS, r, vp2, e2)
    return (
      <StripCell
        leafName={ln} side={side} ls={ls} cs={cs}
        wordA={wordA} wordB={wordB}
        clue={clues?.[ln] ?? ""}
        showClues={showClues} onClueChange={onClueChange}
      />
    )
  }

  return (
    <>
      <style>{`.sc-clue-input::placeholder{color:#bbb!important}`}</style>
      <div ref={boardRef} style={{ flexShrink: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `${ls}px ${cs}px ${cs}px ${ls}px`,
          gridTemplateRows:    `${ls}px ${cs}px ${cs}px ${ls}px`,
        }}>
          <div style={{ gridColumn: 1, gridRow: 1, background: COOL_DARK }} />
          <div style={{ gridColumn: "2 / 4", gridRow: 1 }}>{stripCell("top")}</div>
          <div style={{ gridColumn: 4, gridRow: 1, background: COOL_DARK }} />

          <div style={{ gridColumn: 1, gridRow: "2 / 4" }}>{stripCell("left")}</div>
          <div style={{ gridColumn: 2, gridRow: 2 }}>{slotCell("TL")}</div>
          <div style={{ gridColumn: 3, gridRow: 2 }}>{slotCell("TR")}</div>
          <div style={{ gridColumn: 4, gridRow: "2 / 4" }}>{stripCell("right")}</div>
          <div style={{ gridColumn: 2, gridRow: 3 }}>{slotCell("BL")}</div>
          <div style={{ gridColumn: 3, gridRow: 3 }}>{slotCell("BR")}</div>

          <div style={{ gridColumn: 1, gridRow: 4, background: COOL_DARK }} />
          <div style={{ gridColumn: "2 / 4", gridRow: 4 }}>{stripCell("bottom")}</div>
          <div style={{ gridColumn: 4, gridRow: 4, background: COOL_DARK }} />
        </div>
      </div>
    </>
  )
}

// ─── Pool card ────────────────────────────────────────────────────────────────
function PoolCard({ cardIndex, rotation = 0, onPointerDown, onRotate, size = 90 }) {
  return (
    <div style={{ position: "relative", flexShrink: 0, touchAction: "none" }}>
      <div
        onPointerDown={e => onPointerDown?.(e, cardIndex)}
        style={{ cursor: onPointerDown ? "grab" : "default", touchAction: "none" }}
      >
        <CardFace words={CARDS[cardIndex]} rotation={rotation} size={size} />
      </div>
      {onRotate && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRotate(cardIndex)}
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "none", color: ROTATE_GREEN,
            fontSize: 28, padding: "4px", lineHeight: 1,
          }}
        >↻</button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const POKE_COLORS = { dark: "#4C7523", mid: "#5A8026", wl: "#90A331", yellow: "#FBDF54", notifBg: "#2E4510" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame]             = useState(null)
  const [players, setPlayers]       = useState([])
  const [boards, setBoards]         = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [loading, setLoading]       = useState(true)

  const [localSlots, setLocalSlots] = useState({ top: null, right: null, bottom: null, left: null })
  const [localPool, setLocalPool]   = useState([])
  const [localClues, setLocalClues] = useState({ topLeft: "", topRight: "", bottomRight: "", bottomLeft: "" })
  const [submitting, setSubmitting] = useState(false)
  const [clueError, setClueError]   = useState("")

  const [guessSlots, setGuessSlots] = useState({ top: null, right: null, bottom: null, left: null })
  const [guessPool, setGuessPool]   = useState([])
  const [guessResult, setGuessResult] = useState(null)
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [readying, setReadying]     = useState(false)

  const dragRef = useRef(null)
  const boardRef = useRef(null)
  const boardAnimating = useRef(false)
  const [dragCard, setDragCard] = useState(null)
  const [dragPos, setDragPos]   = useState(null)

  const [swapAnim, setSwapAnim]       = useState(null)
  const [hidingSlots, setHidingSlots] = useState(new Set())
  const [localPoolRotations, setLocalPoolRotations] = useState({})
  const [guessPoolRotations, setGuessPoolRotations] = useState({})
  const [boardRotation, setBoardRotation] = useState(0)
  const channelRef = useRef(null)
  const typingTimerRef = useRef(null)
  const [presenceState, setPresenceState] = useState({})

  const me        = players.find(p => p.id === myPlayerId)
  const myBoard   = boards.find(b => b.player_id === myPlayerId)
  const playerMap = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players])

  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [instructions, setInstructions] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "soclover").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
  }, [])

  async function sendInlinePoke(targetName) {
    if (!me || pokeCooldownActive) return
    setPokeCooldownActive(true)
    setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldownActive(false), 10000)
  }
  const pokeSystemNode = (footer = null) => me ? (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("soclover_reset_to_lobby", { p_code: code }) }}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footer}
      </Footer>
    </>
  ) : null

  const currentBoard = useMemo(() => {
    if (!game || game.phase !== "guessing") return null
    const ownerId = game.player_order?.[game.current_board_index]
    return boards.find(b => b.player_id === ownerId) ?? null
  }, [game, boards])

  const [vw, setVw] = useState(375)
  useEffect(() => {
    setVw(window.innerWidth)
    const h = () => setVw(window.innerWidth)
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [])

  const LEAF_SIZE = 64
  const CARD_SIZE = Math.floor((vw - 2 * LEAF_SIZE) / 2)

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Don't call loadState() - let polling pick up phase changes naturally.
  }

  const loadState = useCallback(async () => {
    const [{ data: gameData }, { data: playerData }, { data: boardData }] = await Promise.all([
      supabase.from("soclover_games").select("*").eq("code", code).single(),
      supabase.from("soclover_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("soclover_boards").select("*").eq("game_code", code),
    ])
    if (!gameData) { router.push(`/${code}`); return }
    if (gameData.phase === "lobby") { router.push(`/${code}`); return }
    setGame(gameData)
    setPlayers(playerData ?? [])
    setBoards(boardData ?? [])
    setLoading(false)
  }, [code, router])


  const clueInitRef = useRef(false)
  useEffect(() => {
    if (!myBoard || clueInitRef.current) return
    if (myBoard.status === "writing") {
      setLocalPool([...myBoard.dealt_card_indices])
      setLocalSlots({ top: null, right: null, bottom: null, left: null })
      setLocalClues({ topLeft: "", topRight: "", bottomRight: "", bottomLeft: "" })
      clueInitRef.current = true
    } else if (myBoard.status === "submitted") {
      clueInitRef.current = true
    }
  }, [myBoard])

  const guessInitRef = useRef(null)
  useEffect(() => {
    if (!currentBoard) return
    const key = `${currentBoard.id}-${currentBoard.attempt ?? 1}`
    if (guessInitRef.current === key) return

    if (currentBoard.status === "guessing" && currentBoard.guesser_id === myPlayerId) {
      guessInitRef.current = key
      setBoardRotation(0)
      const attempt = currentBoard.attempt ?? 1
      const fifthCardOn = game?.fifth_card_enabled ?? false
      const baseCards = fifthCardOn
        ? [...currentBoard.dealt_card_indices, currentBoard.decoy_card_index]
        : [...currentBoard.dealt_card_indices]
      if (attempt === 1) {
        const pool = shuffleArr(baseCards)
        setGuessPool(pool)
        setGuessSlots({ top: null, right: null, bottom: null, left: null })
        setGuessResult(null)
        const rots = {}
        pool.forEach(idx => { rots[idx] = Math.floor(Math.random() * 4) })
        setGuessPoolRotations(rots)
      } else {
        const locked = new Set(currentBoard.correct_slots_attempt1 ?? [])
        const lockedSlotMap = {}
        SLOT_NAMES.forEach(s => {
          if (locked.has(s)) lockedSlotMap[s] = currentBoard.guess_slots?.[s] ?? null
          else lockedSlotMap[s] = null
        })
        const placedIndices = new Set(SLOT_NAMES.map(s => lockedSlotMap[s]?.cardIndex).filter(x => x != null))
        const pool = shuffleArr(baseCards.filter(i => !placedIndices.has(i)))
        setGuessPool(pool)
        setGuessSlots(lockedSlotMap)
        setGuessResult(null)
        setGuessPoolRotations(prev => {
          const rots = { ...prev }
          pool.forEach(idx => { rots[idx] = Math.floor(Math.random() * 4) })
          return rots
        })
      }
    }
  }, [currentBoard, myPlayerId, game?.fifth_card_enabled])

  // Sync guess_slots for viewers (non-controllers) during guessing phase
  useEffect(() => {
    if (!currentBoard || !game || game.phase !== "guessing") return
    const isController = currentBoard.player_id === myPlayerId
    if (isController) return // Controller manages their own state

    // Viewer: sync from database (serialize to detect deep changes)
    const dbSlots = currentBoard.guess_slots ?? {}
    setGuessSlots(dbSlots)
  }, [JSON.stringify(currentBoard?.guess_slots), currentBoard?.player_id, myPlayerId, game?.phase])

  useEffect(() => {
    const pid = localStorage.getItem(`soclover:${code}:playerId`)
    if (pid) setMyPlayerId(pid)
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const ch = supabase.channel(`soclover-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "soclover_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "soclover_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "soclover_boards", filter: `game_code=eq.${code}` }, loadState)
      .on("presence", { event: "sync" }, () => setPresenceState({ ...ch.presenceState() }))
      .subscribe(async status => {
        if (status === "SUBSCRIBED" && myPlayerId) {
          await ch.track({ playerId: myPlayerId, typing: false })
        }
      })
    channelRef.current = ch
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(ch) }
  }, [code, loadState])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      const pt = e.touches?.[0] ?? e
      setDragPos({ x: pt.clientX, y: pt.clientY })
    }
    function onUp(e) {
      if (!dragRef.current) return
      const pt = e.changedTouches?.[0] ?? e
      handleDrop(pt.clientX, pt.clientY)
      dragRef.current = null
      setDragCard(null)
      setDragPos(null)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    return () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
  }, [localSlots, localPool, guessSlots, guessPool, game])

  function triggerSwapAnim(srcSlot, targetSlot, cardA, rotA, cardB, rotB, x, y) {
    const elSrc = document.querySelector(`[data-slot="${srcSlot}"]`)
    const elTgt = document.querySelector(`[data-slot="${targetSlot}"]`)
    const rectSrc = elSrc?.getBoundingClientRect()
    const rectTgt = elTgt?.getBoundingClientRect()
    if (!rectSrc || !rectTgt) return
    setSwapAnim([
      { cardIndex: cardA, rotation: rotA, fromX: x - CARD_SIZE / 2, fromY: y - CARD_SIZE / 2, toX: rectTgt.left, toY: rectTgt.top },
      { cardIndex: cardB, rotation: rotB, fromX: rectTgt.left, fromY: rectTgt.top, toX: rectSrc.left, toY: rectSrc.top },
    ])
    setHidingSlots(new Set([srcSlot, targetSlot]))
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 420)
  }

  function handleDrop(x, y) {
    if (!dragRef.current) return
    const { cardIndex, sourceType, slotName: srcSlot, rotation: srcRot } = dragRef.current
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest("[data-slot]")
    const targetSlot = slotEl?.dataset?.slot

    const isGuessing = game?.phase === "guessing"
    const isWriting  = game?.phase === "clue_writing"

    if (targetSlot) {
      if (isWriting) {
        const existing = localSlots[targetSlot]
        if (existing && sourceType === "slot" && srcSlot) {
          triggerSwapAnim(srcSlot, targetSlot, cardIndex, srcRot ?? 0, existing.cardIndex, existing.rotation, x, y)
          setLocalSlots(prev => ({
            ...prev,
            [srcSlot]: { cardIndex: existing.cardIndex, rotation: existing.rotation },
            [targetSlot]: { cardIndex, rotation: srcRot ?? 0 },
          }))
        } else {
          setLocalSlots(prev => {
            const next = { ...prev }
            if (existing) setLocalPool(p => [...p, existing.cardIndex])
            next[targetSlot] = { cardIndex, rotation: srcRot ?? 0 }
            return next
          })
        }
      } else if (isGuessing) {
        const locked = new Set(currentBoard?.correct_slots_attempt1 ?? [])
        if (locked.has(targetSlot)) { setGuessPool(p => [...p, cardIndex]); return }
        const existing = guessSlots[targetSlot]
        if (existing && sourceType === "slot" && srcSlot) {
          triggerSwapAnim(srcSlot, targetSlot, cardIndex, srcRot ?? 0, existing.cardIndex, existing.rotation, x, y)
          const next = {
            ...guessSlots,
            [srcSlot]: { cardIndex: existing.cardIndex, rotation: existing.rotation },
            [targetSlot]: { cardIndex, rotation: srcRot ?? 0 },
          }
          setGuessSlots(next)
          if (currentBoard) supabase.from("soclover_boards").update({ guess_slots: next }).eq("id", currentBoard.id).then(() => {})
        } else {
          setGuessSlots(prev => {
            const next = { ...prev }
            if (existing) setGuessPool(p => [...p, existing.cardIndex])
            next[targetSlot] = { cardIndex, rotation: srcRot ?? 0 }
            if (currentBoard) supabase.from("soclover_boards").update({ guess_slots: next }).eq("id", currentBoard.id).then(() => {})
            return next
          })
        }
      }
    } else {
      if (isWriting) setLocalPool(p => [...p, cardIndex])
      else if (isGuessing) {
        setGuessPool(p => [...p, cardIndex])
        if (sourceType === "slot" && srcSlot && currentBoard) {
          const next = { ...guessSlots, [srcSlot]: null }
          supabase.from("soclover_boards").update({ guess_slots: next }).eq("id", currentBoard.id).then(() => {})
        }
      }
    }
  }

  function startDrag(e, cardIndex, sourceType, slotName, rotation) {
    e.preventDefault()
    const pt = e.touches?.[0] ?? e
    dragRef.current = { cardIndex, sourceType, slotName, rotation: rotation ?? 0 }
    setDragCard({ cardIndex, rotation: rotation ?? 0 })
    setDragPos({ x: pt.clientX, y: pt.clientY })

    if (sourceType === "pool") {
      if (game?.phase === "clue_writing") setLocalPool(p => p.filter(i => i !== cardIndex))
      else setGuessPool(p => p.filter(i => i !== cardIndex))
    } else if (sourceType === "slot") {
      if (game?.phase === "clue_writing") setLocalSlots(p => ({ ...p, [slotName]: null }))
      else setGuessSlots(p => ({ ...p, [slotName]: null }))
    }
  }

  function onWritingSlotRotate(slotName) {
    setLocalSlots(prev => {
      if (!prev[slotName]) return prev
      return { ...prev, [slotName]: { ...prev[slotName], rotation: rotateCW(prev[slotName].rotation) } }
    })
  }

  function trackTyping() {
    if (!channelRef.current || !myPlayerId) return
    channelRef.current.track({ playerId: myPlayerId, typing: true })
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      if (channelRef.current) channelRef.current.track({ playerId: myPlayerId, typing: false })
    }, 3000)
  }

  const typingPlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.typing && p.playerId !== myPlayerId).map(p => p.playerId)
    )
  )

  function onClueChange(leafName, value) {
    setClueError("")
    setLocalClues(prev => ({ ...prev, [leafName]: value }))
    trackTyping()
  }

  const allSlotsFilled = SLOT_NAMES.every(s => localSlots[s] != null)
  // Pre-fill clue fields (dummy games)
  useEffect(() => {
    if (game?.phase !== "clue_writing" || myBoard?.status === "submitted") return
    if (Object.values(localClues).some(c => c.trim())) return
    supabase.rpc("get_random_ideas", { p_count: 4, p_exclude: [] }).then(({ data }) => {
      if (!data || data.length < 4) return
      setLocalClues({ topLeft: data[0], topRight: data[1], bottomRight: data[2], bottomLeft: data[3] })
    })
  }, [game?.phase, myPlayerId, myBoard?.status])

  const allCluesFilled = LEAF_NAMES.every(l => localClues[l].trim().length > 0)
  const nudgeClues = useSubmitNudge(Object.values(localClues).join(""), myBoard?.status === "submitted")
  const clueWordsOnBoard = useMemo(() => {
    const words = new Set()
    SLOT_NAMES.forEach(s => {
      if (localSlots[s]) CARDS[localSlots[s].cardIndex].forEach(w => words.add(w.toLowerCase()))
    })
    return words
  }, [localSlots])

  function validateClues() {
    for (const l of LEAF_NAMES) {
      const clue = localClues[l].trim().toLowerCase()
      if (!clue) return "Fill in all 4 clue words"
      if (clueWordsOnBoard.has(clue)) return `"${clue}" is one of your keywords — pick a different clue`
    }
    return null
  }

  async function onSubmitClues() {
    if (submitting) return
    setClueError("")
    setSubmitting(true)
    const { error } = await supabase.rpc("soclover_submit_clues", {
      p_code: code, p_player_id: myPlayerId,
      p_slots: localSlots, p_clues: localClues,
    })
    if (error) { setClueError(error.message); setSubmitting(false); return }
    await loadState()
  }

  function onGuessSlotRotate(slotName) {
    const locked = new Set(currentBoard?.correct_slots_attempt1 ?? [])
    if (locked.has(slotName)) return
    if (!guessSlots[slotName]) return
    const next = { ...guessSlots, [slotName]: { ...guessSlots[slotName], rotation: rotateCW(guessSlots[slotName].rotation) } }
    setGuessSlots(next)
    if (currentBoard) supabase.from("soclover_boards").update({ guess_slots: next }).eq("id", currentBoard.id).then(() => {})
  }

  const allGuessFilled = SLOT_NAMES.every(s => guessSlots[s] != null)

  async function onSubmitGuess() {
    if (submittingGuess || !allGuessFilled || !currentBoard) return
    setSubmittingGuess(true)
    const { data, error } = await supabase.rpc("soclover_submit_guess", {
      p_code: code, p_board_id: currentBoard.id,
      p_player_id: myPlayerId, p_guess: guessSlots,
    })
    if (error) { setSubmittingGuess(false); return }
    setGuessResult(data)
    await loadState()
    setSubmittingGuess(false)
  }

  async function onContinueAttempt2() {
    if (!currentBoard) return
    await rpc("soclover_start_attempt2", { p_code: code, p_board_id: currentBoard.id })
  }

  async function onReadyNextBoard() {
    if (readying) return
    setReadying(true)
    const { error } = await supabase.rpc("soclover_mark_ready", { p_code: code, p_player_id: myPlayerId })
    if (error) { setReadying(false); return }
    await loadState()
  }

  function rotateBoardCW() {
    if (boardAnimating.current) return
    const el = boardRef.current
    if (!el) return
    boardAnimating.current = true
    el.style.transition = "transform 0.4s ease"
    el.style.transform = "rotate(90deg)"
    setTimeout(() => {
      el.style.transition = "none"
      el.style.transform = "rotate(0deg)"
      setBoardRotation(r => {
        const next = (r + 1) % 4
        if (currentBoard) supabase.from("soclover_boards").update({ board_rotation: next }).eq("id", currentBoard.id).then(() => {})
        return next
      })
      requestAnimationFrame(() => { boardAnimating.current = false })
    }, 400)
  }

  // Sync rotation animation from database changes (when other players rotate)
  const prevRemoteRotationRef = useRef(null)
  useEffect(() => {
    if (!currentBoard) { prevRemoteRotationRef.current = null; return }
    const remoteRot = currentBoard.board_rotation ?? 0

    // First load - just set it without animation
    if (prevRemoteRotationRef.current === null) {
      prevRemoteRotationRef.current = remoteRot
      setBoardRotation(remoteRot)
      return
    }

    // If remote rotation changed and is different from local, animate
    if (remoteRot !== prevRemoteRotationRef.current && remoteRot !== boardRotation) {
      prevRemoteRotationRef.current = remoteRot

      if (boardAnimating.current) return
      const el = boardRef.current
      if (!el) { setBoardRotation(remoteRot); return }

      boardAnimating.current = true
      el.style.transition = "transform 0.4s ease"
      el.style.transform = "rotate(90deg)"
      setTimeout(() => {
        el.style.transition = "none"
        el.style.transform = "rotate(0deg)"
        setBoardRotation(remoteRot)
        requestAnimationFrame(() => { boardAnimating.current = false })
      }, 400)
    }
  }, [currentBoard?.board_rotation, boardRotation])

  async function onPlayAgain() {
    await supabase.rpc("soclover_play_again", { p_code: code })
    clueInitRef.current = false
    guessInitRef.current = null
    setGuessResult(null)
    setReadying(false)
    await loadState()
  }


  if (loading) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: WHITE, fontSize: 18, fontWeight: 700 }}>Loading…</div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  if (!me) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: WHITE, fontSize: 18, fontWeight: 700, textAlign: "center", padding: 24 }}>
          You haven&apos;t joined this game.<br />
          <a href={`/${code}`} style={{ color: ACCENT }}>Back to lobby</a>
        </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ── PHASE: clue_writing ──────────────────────────────────────────────────
  if (game.phase === "clue_writing") {
    const submitted = myBoard?.status === "submitted"
    const submittedCount = players.filter(p => p.clues_submitted).length
    const totalCount = players.length

    if (submitted) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <StatusBar dark={COOL_DARK} label="WRITING CLUES" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: SPACE.md, color: WHITE }}>
            <div style={{ fontSize: 40 }}>⏳</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>
              {submittedCount} / {totalCount} ready
            </div>
            <div style={{ fontSize: 16, color: MUTED }}>Waiting for everyone to submit their clues…</div>
            <WaitingList
              players={players.map(p => ({ name: p.name, done: !!p.clues_submitted, typing: typingPlayerIds.has(p.id) }))}
              myName={me?.name}
              colors={{ mid: MID_DARK }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
          </div>
        </div>
      )
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={COOL_DARK} label="ARRANGE YOUR BOARD" />

        <div style={{ flex: 1, padding: `0 0 ${BOTTOM_PAD}`, display: "flex", flexDirection: "column", alignItems: "center", gap: GAP.result }}>
          <CloverBoard
            slots={localSlots}
            clues={localClues}
            interactive
            boardRotation={boardRotation}
            boardRef={boardRef}
            onSlotPointerDown={(e, slotName) => {
              if (!localSlots[slotName]) return
              startDrag(e, localSlots[slotName].cardIndex, "slot", slotName, localSlots[slotName].rotation)
            }}
            onSlotRotate={onWritingSlotRotate}
            showClues={true}
            onClueChange={onClueChange}
            lockedSlots={new Set()}
            highlightSlots={{}}
            CARD_SIZE={CARD_SIZE}
            LEAF_SIZE={LEAF_SIZE}
            hidingSlots={hidingSlots}
          />
          <button
            onClick={rotateBoardCW}
            style={{ background: COOL_DARK, color: WHITE, fontSize: 18, fontWeight: 700, padding: "8px 20px" }}
          >↻ Rotate</button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {localPool.map(idx => (
              <PoolCard
                key={idx}
                cardIndex={idx}
                rotation={localPoolRotations[idx] ?? 0}
                size={CARD_SIZE}
                onPointerDown={(e, ci) => startDrag(e, ci, "pool", null, localPoolRotations[ci] ?? 0)}
                onRotate={ci => setLocalPoolRotations(prev => ({ ...prev, [ci]: rotateCW(prev[ci] ?? 0) }))}
              />
            ))}
            {localPool.length === 0 && (
              <div style={{ fontSize: 13, color: MUTED }}>All cards placed</div>
            )}
          </div>

          {!!clueError && (
            <div style={{ background: "#ef4444", color: WHITE, padding: "10px 16px", fontSize: 14, fontWeight: 700, width: "100%", maxWidth: 400, textAlign: "center" }}>
              {clueError}
            </div>
          )}
        </div>

        <DragOverlay dragCard={dragCard} dragPos={dragPos} cs={CARD_SIZE} boardRotation={boardRotation} />
        {swapAnim && swapAnim.map((s, i) => <SwapCard key={i} cs={CARD_SIZE} {...s} boardRotation={boardRotation} />)}
      </div>
        {pokeSystemNode(
          <FooterButton onClick={onSubmitClues} disabled={!allSlotsFilled || !allCluesFilled} nudge={nudgeClues} bg={ACCENT} textColor="#000">
            {!allSlotsFilled ? "Fill all 4 slots" : !allCluesFilled ? "Write all 4 clues" : "Submit My Board"}
          </FooterButton>
        )}
      </>
    )
  }

  // ── PHASE: guessing ──────────────────────────────────────────────────────
  if (game.phase === "guessing" && currentBoard) {
    const boardOwner  = playerMap[currentBoard.player_id]
    const guesser     = playerMap[currentBoard.guesser_id]
    const amGuesser   = myPlayerId === currentBoard.guesser_id
    const amOwner     = myPlayerId === currentBoard.player_id
    const boardNum    = (game.current_board_index ?? 0) + 1
    const totalBoards = game.player_order?.length ?? 0
    const attempt     = currentBoard.attempt ?? 1
    const lockedSlots = new Set(currentBoard.correct_slots_attempt1 ?? [])
    const readyCount  = (game.ready_player_ids ?? []).length
    const alreadyReady = (game.ready_player_ids ?? []).includes(myPlayerId)

    if (currentBoard.status === "scoring1") {
      const highlightSlots = {}
      SLOT_NAMES.forEach(s => { highlightSlots[s] = lockedSlots.has(s) ? "correct" : "wrong" })

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <StatusBar dark={COOL_DARK} label={`BOARD ${boardNum} / ${totalBoards} — ${boardOwner?.name ?? ""}`} />
          <div style={{ flex: 1, padding: `16px 16px ${BOTTOM_PAD}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: WHITE }}>
              {lockedSlots.size} / 4 correct — attempt 2 coming up
            </div>
            <CloverBoard slots={currentBoard.guess_slots ?? {}} clues={currentBoard.clues ?? {}} interactive={false} boardRotation={boardRotation} showClues={false} lockedSlots={lockedSlots} highlightSlots={highlightSlots} CARD_SIZE={CARD_SIZE} LEAF_SIZE={LEAF_SIZE} hidingSlots={new Set()} />
            <div style={{ fontSize: 14, color: MUTED, textAlign: "center" }}>
              Correct slots stay locked. {guesser?.name} gets one more try with the remaining cards.
            </div>
          </div>
        </div>
          {pokeSystemNode(amGuesser ? (
            <FooterButton onClick={onContinueAttempt2} bg={ACCENT} textColor="#000">
              Continue to Attempt 2 →
            </FooterButton>
          ) : null)}
        </>
      )
    }

    if (currentBoard.status === "complete") {
      const pts     = currentBoard.points_earned ?? 0
      const perfect = pts === 5
      const highlightSlots = {}
      SLOT_NAMES.forEach(s => {
        const g = currentBoard.guess_slots?.[s]
        const a = currentBoard.slots?.[s]
        highlightSlots[s] = (g && a && g.cardIndex === a.cardIndex && g.rotation === a.rotation) ? "correct" : "wrong"
      })

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <StatusBar dark={COOL_DARK} label={`BOARD ${boardNum} / ${totalBoards} — ${boardOwner?.name ?? ""}`} />
          <div style={{ flex: 1, padding: `16px 16px ${BOTTOM_PAD}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 4 }}>{perfect ? "🎉" : pts >= 3 ? "✨" : "💪"}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT }}>{pts} point{pts !== 1 ? "s" : ""}</div>
              {perfect && <div style={{ fontSize: 14, fontWeight: 700, color: WHITE, marginTop: 4 }}>Perfect round! +1 bonus</div>}
            </div>
            <CloverBoard slots={currentBoard.slots ?? {}} clues={currentBoard.clues ?? {}} interactive={false} boardRotation={boardRotation} showClues={false} lockedSlots={new Set(SLOT_NAMES)} highlightSlots={highlightSlots} CARD_SIZE={CARD_SIZE} LEAF_SIZE={LEAF_SIZE} hidingSlots={new Set()} />
            <div style={{ fontSize: 14, color: MUTED }}>Correct board — owned by {boardOwner?.name}</div>
            <div style={{ fontSize: 14, color: MUTED, textAlign: "center" }}>{readyCount} / {players.length} ready to continue</div>
          </div>
        </div>
          {pokeSystemNode(
            <FooterButton onClick={onReadyNextBoard} disabled={alreadyReady} bg={alreadyReady ? MID_DARK : ACCENT} textColor={alreadyReady ? WHITE : "#000"}>
              {alreadyReady ? "Waiting for others…" : "Next Board →"}
            </FooterButton>
          )}
        </>
      )
    }

    // Active guessing
    const fifthCardOn = game?.fifth_card_enabled ?? false
    const spectatorSlots = amGuesser ? guessSlots : (currentBoard.guess_slots ?? {})
    const displayBoardRotation = amGuesser ? boardRotation : (currentBoard.board_rotation ?? 0)
    // Spectator pool: cards from dealt set (+ decoy if fifth card on) that aren't placed
    const spectatorPlacedIndices = new Set(
      Object.values(currentBoard.guess_slots ?? {}).map(s => s?.cardIndex).filter(x => x != null)
    )
    const baseCardPool = fifthCardOn
      ? [...currentBoard.dealt_card_indices, currentBoard.decoy_card_index]
      : [...currentBoard.dealt_card_indices]
    const spectatorPool = baseCardPool.filter(i => !spectatorPlacedIndices.has(i))
    const poolToShow = amGuesser ? guessPool : spectatorPool
    const totalCards = fifthCardOn ? 5 : 4
    const hint = attempt === 2
      ? `Attempt 2 — place the remaining ${4 - lockedSlots.size} card${4 - lockedSlots.size !== 1 ? "s" : ""}`
      : `${guesser?.name ?? "Guesser"} — place all ${totalCards} cards, rotate to match the clues`

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={COOL_DARK} label={`BOARD ${boardNum} / ${totalBoards} — ${boardOwner?.name ?? ""}`} />

        <div style={{ flex: 1, padding: `12px 0 ${BOTTOM_PAD}`, display: "flex", flexDirection: "column", alignItems: "center", gap: GAP.result }}>
          <div style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>{hint}</div>

          {amOwner && (
            <div style={{ background: COOL_DARK, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: MUTED }}>
              Your board — watch {guesser?.name} guess
            </div>
          )}

          <CloverBoard
            slots={spectatorSlots}
            clues={currentBoard.clues ?? {}}
            interactive={amGuesser}
            boardRotation={displayBoardRotation}
            boardRef={amGuesser ? boardRef : undefined}
            onSlotPointerDown={amGuesser ? (e, slotName) => {
              if (lockedSlots.has(slotName) || !guessSlots[slotName]) return
              startDrag(e, guessSlots[slotName].cardIndex, "slot", slotName, guessSlots[slotName].rotation)
            } : undefined}
            onSlotRotate={amGuesser ? onGuessSlotRotate : undefined}
            showClues={false}
            lockedSlots={lockedSlots}
            highlightSlots={{}}
            CARD_SIZE={CARD_SIZE}
            LEAF_SIZE={LEAF_SIZE}
            hidingSlots={hidingSlots}
          />
          {amGuesser && (
            <button
              onClick={rotateBoardCW}
              style={{ background: COOL_DARK, color: WHITE, fontSize: 18, fontWeight: 700, padding: "8px 20px" }}
            >↻ Rotate</button>
          )}

          {poolToShow.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {poolToShow.map(idx => (
                <PoolCard
                  key={idx} cardIndex={idx} size={CARD_SIZE}
                  rotation={amGuesser ? (guessPoolRotations[idx] ?? 0) : 0}
                  onPointerDown={amGuesser ? (e, ci) => startDrag(e, ci, "pool", null, guessPoolRotations[ci] ?? 0) : undefined}
                  onRotate={amGuesser ? (ci => setGuessPoolRotations(prev => ({ ...prev, [ci]: rotateCW(prev[ci] ?? 0) }))) : undefined}
                />
              ))}
            </div>
          )}
          {amGuesser && poolToShow.length === 0 && (
            <div style={{ fontSize: 13, color: MUTED }}>All placed — submit when ready</div>
          )}

          {!amGuesser && (
            <div style={{ fontSize: 14, color: MUTED, textAlign: "center" }}>
              {amOwner ? "Your board is being guessed!" : `${guesser?.name} is guessing…`}
            </div>
          )}
        </div>

        <DragOverlay dragCard={dragCard} dragPos={dragPos} cs={CARD_SIZE} boardRotation={displayBoardRotation} />
        {swapAnim && swapAnim.map((s, i) => <SwapCard key={i} cs={CARD_SIZE} {...s} boardRotation={displayBoardRotation} />)}
      </div>
        {pokeSystemNode(amGuesser ? (
          <FooterButton onClick={onSubmitGuess} disabled={!allGuessFilled} bg={ACCENT} textColor="#000">
            {!allGuessFilled ? `Place all ${4 - SLOT_NAMES.filter(s => guessSlots[s]).length} remaining` : `Submit Guess${attempt === 2 ? " (2)" : ""}`}
          </FooterButton>
        ) : null)}
      </>
    )
  }

  // ── PHASE: finished ──────────────────────────────────────────────────────
  if (game.phase === "finished") {
    const totalPts = boards.reduce((sum, b) => sum + (b.points_earned ?? 0), 0)
    const maxPts   = (game.player_order?.length ?? 0) * 5

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <StatusBar dark={COOL_DARK} label="FINAL SCORE" />
        <div style={{ flex: 1, padding: `24px 16px ${BOTTOM_PAD}`, display: "flex", flexDirection: "column", alignItems: "center", gap: GAP.section, width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🍀</div>
            <div style={{ fontSize: 48, fontWeight: 900, color: ACCENT }}>{totalPts}</div>
            <div style={{ fontSize: 18, color: MUTED }}>out of {maxPts} possible points</div>
          </div>

          <div style={{ width: "100%", maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>Board Results</div>
            <div style={{ display: "flex", flexDirection: "column", gap: GAP.card }}>
              {(game.player_order ?? []).map((pid, i) => {
                const board = boards.find(b => b.player_id === pid)
                const owner = playerMap[pid]
                const pts   = board?.points_earned ?? 0
                const guesserP = playerMap[board?.guesser_id]
                return (
                  <div key={pid} style={{ display: "flex" }}>
                    <div style={{ width: 48, background: COOL_DARK, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0", fontSize: 16, fontWeight: 900, color: WHITE }}>{i + 1}</div>
                    <div style={{ flex: 1, background: MID_DARK, padding: "12px 14px" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: WHITE }}>{owner?.name ?? "?"}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>Guessed by {guesserP?.name ?? "?"} · <span style={{ color: pts === 5 ? "#22c55e" : pts >= 3 ? ACCENT : WHITE, fontWeight: 700 }}>{pts} pt{pts !== 1 ? "s" : ""}</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

          <div style={{ width: "100%", maxWidth: 360 }}>
            <a href="https://games.jackbrannen.com"
              style={{ display: "block", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none" }}>
              Play Another Game
            </a>
          </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: WHITE, fontSize: 16, fontWeight: 700 }}>Setting up…</div>
    </div>
      {pokeSystemNode()}
    </>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────
// StatusBar removed - now using shared StatusBar component

function DragOverlay({ dragCard, dragPos, cs, boardRotation = 0 }) {
  if (!dragCard || !dragPos) return null
  const size = cs ?? 100
  return (
    <div style={{
      position: "fixed",
      left: dragPos.x - size / 2,
      top: dragPos.y - size / 2,
      width: size, height: size,
      zIndex: 9999, pointerEvents: "none",
      transform: "scale(1.08) rotate(2deg)",
      boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
    }}>
      <CardFace words={CARDS[dragCard.cardIndex]} rotation={dragCard.rotation} boardRotation={boardRotation} size={size} />
    </div>
  )
}

function SwapCard({ cardIndex, rotation, fromX, fromY, toX, toY, cs, boardRotation = 0 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = "none"
    el.style.transform = `translate(${fromX}px, ${fromY}px)`
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.32s cubic-bezier(0.34, 1.5, 0.64, 1)"
      el.style.transform = `translate(${toX}px, ${toY}px)`
    })
  }, [])
  return (
    <div ref={ref} style={{ position: "fixed", top: 0, left: 0, width: cs, height: cs, zIndex: 9998, pointerEvents: "none", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", willChange: "transform" }}>
      <CardFace words={CARDS[cardIndex]} rotation={rotation} boardRotation={boardRotation} size={cs} />
    </div>
  )
}

function shuffleArr(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
