"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import FooterButton from "../../../components/FooterButton"
import WaitingList from "../../../components/WaitingList"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import StatusBar from "../../../components/StatusBar"
import RandomIdeas from "../../../components/RandomIdeas"
import { useDuplicates } from "../../../lib/useDuplicates"
import useTypingPresence from "../../../lib/useTypingPresence"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import { playYourTurn } from "../../../lib/sounds"

const BG          = "#004F45"
const DARK        = "#003638"   // H=182° (+10°), B=22%
const MID         = "#00423f"   // H=177° (+5°),  B=26%
const WARM_LIGHT  = "#006648"   // H=162° (-10°), B=40%
const WARM_BRIGHT = "#007A56"   // H=162° (-10°), B=48% — active drag feedback
const YELLOW = "#FBDF54"
const GREEN  = "#12BAAA"
const CARD_BG = WARM_LIGHT

const CARD_H = 64   // minimum card height
const CARD_GAP = 8

// Text-fit utilities: font shrinks first, card grows only if still needed.
// availPx = usable text width inside the card (accounts for padding & buttons).
function wordFontSize(len) {
  if (len <= 24) return 18
  if (len <= 42) return 15
  return 13
}
function wordCardH(len, availPx) {
  const fs = wordFontSize(len)
  const cpl = Math.max(1, Math.floor(availPx / (fs * 0.55)))
  const lines = Math.ceil(Math.max(len, 1) / cpl)
  return Math.max(CARD_H, Math.ceil(lines * fs * 1.5) + 20)
}
function listTotalH(items, availPx) {
  if (!items?.length) return 0
  return items.reduce((sum, item, i) =>
    sum + wordCardH(item.text.length, availPx) + (i < items.length - 1 ? CARD_GAP : 0), 0)
}
// Viewport-aware availPx — call inside components (client-only)
const vw = () => (typeof window !== "undefined" ? window.innerWidth : 360)

// ── DragList ─────────────────────────────────────────────────────────────────
// Drag-to-sort list. Uses pointer capture on the container.

function DragList({ items, onReorder, disabled }) {
  const containerRef = useRef(null)
  const [drag, setDrag] = useState(null)

  // Per-item heights and cumulative tops (DragList sits beside SpectrumBar, ~90px overhead)
  const availPx = vw() - 90
  const heights = items.map(item => wordCardH(item.text.length, availPx))
  const tops = heights.reduce((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + heights[i - 1] + CARD_GAP)
    return acc
  }, [])
  const totalH = tops.length ? tops[tops.length - 1] + heights[heights.length - 1] : 0

  const offsetY = drag ? drag.currentY - drag.startY : 0
  const fromIdx = drag?.idx ?? null

  // Find destination slot by center-proximity of dragged item
  let toIdx = null
  if (fromIdx !== null) {
    const center = tops[fromIdx] + offsetY + heights[fromIdx] / 2
    let best = 0, bestDist = Infinity
    tops.forEach((t, i) => {
      const d = Math.abs(t + heights[i] / 2 - center)
      if (d < bestDist) { bestDist = d; best = i }
    })
    toIdx = Math.max(0, Math.min(items.length - 1, best))
  }

  function itemTop(i) {
    if (fromIdx === null) return tops[i]
    if (i === fromIdx) {
      const lo = -tops[fromIdx]
      const hi = totalH - tops[fromIdx] - heights[fromIdx]
      return tops[fromIdx] + Math.max(lo, Math.min(hi, offsetY))
    }
    if (fromIdx < toIdx && i > fromIdx && i <= toIdx) return tops[i] - heights[fromIdx] - CARD_GAP
    if (fromIdx > toIdx && i >= toIdx && i < fromIdx) return tops[i] + heights[fromIdx] + CARD_GAP
    return tops[i]
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", height: totalH, touchAction: "none" }}
      onPointerMove={e => {
        if (!drag) return
        setDrag(d => d ? { ...d, currentY: e.clientY } : null)
      }}
      onPointerUp={() => {
        if (!drag) return
        if (toIdx !== null && toIdx !== fromIdx) {
          const next = [...items]
          const [moved] = next.splice(fromIdx, 1)
          next.splice(toIdx, 0, moved)
          onReorder(next)
        }
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {items.map((item, i) => {
        const h = heights[i]
        const fs = wordFontSize(item.text.length)
        const dragging = fromIdx === i
        return (
          <div
            key={item.id}
            onPointerDown={e => {
              if (disabled) return
              containerRef.current?.setPointerCapture(e.pointerId)
              setDrag({ idx: i, startY: e.clientY, currentY: e.clientY })
            }}
            style={{
              position: "absolute", left: 0, right: 0,
              top: itemTop(i), height: h,
              transition: dragging ? "none" : "top 180ms ease",
              zIndex: dragging ? 10 : 1,
            }}
          >
            <div style={{
              width: "100%", height: "100%",
              background: dragging ? WARM_BRIGHT : CARD_BG,
              display: "flex", alignItems: "center", padding: "0 18px",
              boxShadow: dragging ? "0 8px 28px rgba(0,0,0,0.45)" : "none",
              cursor: disabled ? "default" : dragging ? "grabbing" : "grab",
              userSelect: "none", WebkitUserSelect: "none",
            }}>
              <span style={{ fontSize: fs, fontWeight: 700, flex: 1, lineHeight: 1.45, wordBreak: "break-word" }}>{item.text}</span>
              {!disabled && (
                <span style={{ opacity: 0.25, fontSize: 20, flexShrink: 0, letterSpacing: "0.1em" }}>⠿</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── ButtonList ───────────────────────────────────────────────────────────────
// Buttons are on the right. Words are keyed by ID and rendered in stable DOM
// order (sorted by ID) so React never physically moves a DOM node — both cards
// always transition when one slot swaps.

const BTN_W = 52

function ButtonList({ items, onMove, disabled, highlightMove }) {
  const n = items.length
  const cardRight = disabled ? 0 : BTN_W * 2

  // Per-slot heights (ButtonList text column is narrower — subtract button column)
  const availPx = Math.max(80, vw() - 90 - BTN_W * 2)
  const heights = items.map(item => wordCardH(item.text.length, availPx))
  const slotTops = heights.reduce((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + heights[i - 1] + CARD_GAP)
    return acc
  }, [])
  const containerH = slotTops.length ? slotTops[slotTops.length - 1] + heights[heights.length - 1] : 0

  // Current visual slot for each item id (changes every reorder)
  const slotOf = {}
  items.forEach((item, i) => { slotOf[item.id] = i })

  // Stable DOM order: sort by id so React never reorders these nodes
  const stableItems = [...items].sort((a, b) => (a.id < b.id ? -1 : 1))

  const btnBase = (active, width, h) => ({
    width, height: h,
    fontSize: 22, fontWeight: 900,
    background: active ? GREEN : WARM_LIGHT,
    color: "white",
    transition: "background 120ms",
    border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  })

  return (
    <div style={{ position: "relative", height: containerH }}>
      {/* Word cards in stable DOM order — top animates via CSS transition */}
      {stableItems.map(item => {
        const slot = slotOf[item.id] ?? 0
        const h = heights[slot]
        const fs = wordFontSize(item.text.length)
        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              left: 0, right: cardRight,
              top: slotTops[slot],
              height: h,
              transition: "top 200ms ease",
            }}
          >
            <div style={{
              width: "100%", height: "100%",
              background: CARD_BG,
              display: "flex", alignItems: "center", padding: "0 18px",
            }}>
              <span style={{ fontSize: fs, fontWeight: 700, flex: 1, lineHeight: 1.45, wordBreak: "break-word" }}>{item.text}</span>
            </div>
          </div>
        )
      })}

      {/* Button slots on right — keyed by slot so they never animate */}
      {!disabled && Array.from({ length: n }, (_, slot) => {
        const h = heights[slot]
        const isFirst = slot === 0
        const isLast  = slot === n - 1
        const downActive = highlightMove?.slot === slot && highlightMove?.dir === 1
        const upActive   = highlightMove?.slot === slot && highlightMove?.dir === -1
        return (
          <div
            key={`slot-${slot}`}
            style={{
              position: "absolute", right: 0,
              top: slotTops[slot], height: h,
              width: BTN_W * 2, display: "flex",
            }}
          >
            {isFirst ? (
              <button onClick={() => onMove(slot, 1)} style={btnBase(downActive, BTN_W * 2, h)}>▼</button>
            ) : isLast ? (
              <button onClick={() => onMove(slot, -1)} style={btnBase(upActive, BTN_W * 2, h)}>▲</button>
            ) : (
              <>
                <button onClick={() => onMove(slot, 1)}  style={btnBase(downActive, BTN_W, h)}>▼</button>
                <button onClick={() => onMove(slot, -1)} style={btnBase(upActive,   BTN_W, h)}>▲</button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── RevealList ───────────────────────────────────────────────────────────────

const REVEAL_AUTHOR_H = 36  // space reserved for "by {name}" line + gap
function revealCardH(len, availPx) {
  // Minimum height must accommodate both the word and the author line
  return Math.max(wordCardH(len, availPx) + REVEAL_AUTHOR_H, 80)
}

function RevealList({ items, transitionMs = 80 }) {
  const availPx = vw() - 84  // page padding 48 + card horizontal padding 36
  const heights = items.map(item => revealCardH(item.text.length, availPx))
  const tops = heights.reduce((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + heights[i - 1] + CARD_GAP)
    return acc
  }, [])
  const totalH = tops.length ? tops[tops.length - 1] + heights[heights.length - 1] : 0

  return (
    <div style={{ position: "relative", height: totalH }}>
      {items.map((item, i) => {
        const h = heights[i]
        const fs = wordFontSize(item.text.length)
        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              left: 0, right: 0,
              top: tops[i],
              height: h,
              transition: `top ${transitionMs}ms ease`,
              display: "flex", alignItems: "center",
            }}
          >
            <div style={{
              flex: 1, height: h, background: item.correct != null
                ? (item.correct ? "rgba(18,186,170,0.15)" : "rgba(200,50,50,0.12)")
                : CARD_BG,
              display: "flex", alignItems: "center", padding: "0 18px",
              overflow: "hidden",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs, fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word" }}>{item.text}</div>
                {item.author && (
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.55, marginTop: 4 }}>
                    by {item.author}
                  </div>
                )}
              </div>
              {item.correct != null && (
                <div style={{
                  width: h, height: h, flexShrink: 0, marginRight: -18,
                  background: item.correct ? "rgba(18,186,170,0.3)" : "rgba(200,50,50,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900,
                  color: item.correct ? GREEN : "#EF5555",
                }}>
                  {item.correct ? "✓" : "✗"}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── SpectrumBar ──────────────────────────────────────────────────────────────
// Explicit height so WORST never extends past the last item.

function SpectrumBar({ listHeight }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30, flexShrink: 0, height: listHeight }}>
      <span style={{
        fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em",
        writingMode: "vertical-rl", transform: "rotate(180deg)",
        color: YELLOW, marginBottom: 8, lineHeight: 1, flexShrink: 0,
      }}>First</span>
      <div style={{
        flex: 1, width: 2, minHeight: 0,
        background: `linear-gradient(to bottom, ${YELLOW} 0%, ${BG} 100%)`,
      }} />
      <span style={{
        fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em",
        writingMode: "vertical-rl", transform: "rotate(180deg)",
        color: "rgba(255,255,255,0.35)", marginTop: 8, lineHeight: 1, flexShrink: 0,
      }}>Worst</span>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// TopBar removed - now using shared StatusBar component


function Scoreboard({ right, wrong }) {
  return (
    <div style={{ display: "flex", gap: GAP.card, marginBottom: 24 }}>
      <div style={{ flex: 1, background: DARK, padding: "14px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: GREEN, marginBottom: 6 }}>Right</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: "white", lineHeight: 1 }}>{right}</div>
      </div>
      <div style={{ flex: 1, background: DARK, padding: "14px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Wrong</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: "rgba(255,255,255,0.65)", lineHeight: 1 }}>{wrong}</div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const IDEAS_URL = "https://raw.githubusercontent.com/jackbrannen/JackGames/main/JackGames/random_ideas.json"
let _ideasCache = null
async function fetchIdeas() {
  if (_ideasCache) return _ideasCache
  const res = await fetch(IDEAS_URL)
  _ideasCache = await res.json()
  return _ideasCache
}
function sampleIdeas(categories, excludeSet, count = 3) {
  const cats = Object.keys(categories).map(cat => ({
    cat,
    pool: categories[cat].filter(idea => !excludeSet.has(idea.toLowerCase()))
  })).filter(({ pool }) => pool.length > 0)
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]]
  }
  return cats.slice(0, count).map(({ pool }) => pool[Math.floor(Math.random() * pool.length)])
}

const POKE_COLORS = { dark: "#003638", mid: "#00423f", wl: "#006648", yellow: "#FBDF54", notifBg: "#001E1C" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [myPlayerId, setMyPlayerId] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [allWords, setAllWords] = useState([])

  // Ranking phase
  const [rankingItems, setRankingItems] = useState(null)

  // Submitting phase — length set from game.words_per_writer once loaded
  const [wordFields, setWordFields] = useState(["", "", "", "", ""])
  const { dupeIndices, hasDuplicates } = useDuplicates(wordFields)
  const wordInputRefs = useRef([])
  const [submitError, setSubmitError] = useState("")
  const [copiedIdeaIndex, setCopiedIdeaIndex] = useState(null)
  const hasPrefilledRef = useRef(false)

  // Group guessing phase
  const [groupItems, setGroupItems] = useState(null)
  const [highlightMove, setHighlightMove] = useState(null) // { slot, dir }
  const pendingMovesRef = useRef(0)
  const highlightTimerRef = useRef(null)

  // Reveal phase
  const [showGroupView, setShowGroupView] = useState(false)

  // Subject watching
  const [watchThanks, setWatchThanks] = useState(false)

  const prevGuessRound = useRef(-1)
  const prevLastMoveRef = useRef(null)
  const botAutoRef = useRef({})
  const soundTriggerRef = useRef(null)
  const { onTypingChange, typingPlayerIds } = useTypingPresence("ftw", code, myPlayerId)
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [instructions, setInstructions] = useState("")

  const ideasRef = useRef(null)

  useEffect(() => {
    const existing = localStorage.getItem(`ftw:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  const me = useMemo(() => players.find(p => p.id === myPlayerId), [players, myPlayerId])
  const nudgeWords = useSubmitNudge(wordFields.some(w => w.trim()) ? "x" : "", !!me?.words_submitted)

  // Pre-fill word fields for dummy games
  useEffect(() => {
    console.log("Prefill check:", { is_demo: game?.is_demo, phase: game?.phase, submitted: me?.words_submitted, hasRun: hasPrefilledRef.current })
    if (!game?.is_demo || game.phase !== "submitting" || hasPrefilledRef.current) return
    if (me?.words_submitted || !myPlayerId) return
    hasPrefilledRef.current = true
    console.log("Running prefill...")
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc("get_random_ideas", { p_count: 5, p_exclude: [] })
        console.log("Random ideas result:", { data, error })
        if (data && data.length >= 5) {
          const ideas = data.slice(0, 5).map(item => item.idea)
          console.log("Setting fields to:", ideas)
          setWordFields(ideas)
        }
      } catch (e) {
        console.error("Failed to prefill:", e)
      }
    })()
  }, [game?.is_demo, game?.phase, me?.words_submitted, myPlayerId])

  useEffect(() => {
    if (!game || !me) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playYourTurn()
  }, [game?.phase])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "firsttoworst").single()
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

  const [menuOpen, setMenuOpen] = useState(false)
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
        onResetToLobby={async () => { await rpc("ftw_reset_to_lobby", { p_code: code }) }}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footer}
      </Footer>
    </>
  ) : null


  function resolveWords(ids) {
    return (ids ?? []).map(id => allWords.find(w => w.id === id)).filter(Boolean).map(w => ({ id: w.id, text: w.text }))
  }

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Don't call loadState() - let polling pick up phase changes naturally.
  }

  async function loadState() {
    const { data: gameData } = await supabase
      .from("ftw_games")
      .select("*")
      .eq("code", code)
      .single()

    if (!gameData) return
    if (gameData.phase === "lobby") { router.replace(`/${code}`); return }

    // Cross-player button highlight via last_move DB column
    if (gameData.last_move && gameData.phase === "guessing" && gameData.round_phase === "dragging") {
      const key = JSON.stringify(gameData.last_move)
      if (key !== prevLastMoveRef.current) {
        prevLastMoveRef.current = key
        setHighlightMove(gameData.last_move)
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = setTimeout(() => setHighlightMove(null), 400)
      }
    }

    const { data: playerData } = await supabase
      .from("ftw_players")
      .select("*")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    const { data: wordData } = await supabase
      .from("ftw_words")
      .select("id,text,player_id")
      .eq("game_code", code)

    setGame(gameData)
    setPlayers(playerData ?? [])
    setAllWords(wordData ?? [])
  }

  useEffect(() => {
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`ftw-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_players", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])


  // Seed ranking items when assigned words arrive
  useEffect(() => {
    if (game?.phase !== "ranking" || !me?.assigned_word_ids?.length || rankingItems) return
    setRankingItems(resolveWords(me.assigned_word_ids))
  }, [game?.phase, me?.assigned_word_ids?.join(",")])

  // Resize word fields to match game's words_per_writer (only before user starts typing)
  useEffect(() => {
    if (!game?.words_per_writer || game.words_per_writer === wordFields.length) return
    setWordFields(prev => prev.some(f => f) ? prev : Array(game.words_per_writer).fill(""))
  }, [game?.words_per_writer])

  // Pre-fill word fields from random ideas (dummy games — player hasn't typed anything yet)
  useEffect(() => {
    if (game?.phase !== "submitting" || !myPlayerId || me?.words_submitted) return
    if (wordFields.some(w => w.trim())) return
    const wCount = wordFields.length
    const FALLBACK = ["pizza","traffic","naps","coffee","deadlines","rain","meetings","weekends","sushi","dogs"]
    fetchIdeas().then(categories => {
      const picked = []
      const seen = new Set()
      while (picked.length < wCount) {
        const ideas = sampleIdeas(categories, seen, 1)
        if (!ideas.length) break
        picked.push(ideas[0])
        seen.add(ideas[0].toLowerCase())
      }
      // Fill any remaining slots from local fallback
      const fallbackPool = FALLBACK.filter(w => !seen.has(w))
      while (picked.length < wCount && fallbackPool.length) {
        picked.push(fallbackPool.shift())
      }
      if (picked.length === wCount) setWordFields(picked)
    }).catch(() => {
      setWordFields(FALLBACK.slice(0, wCount))
    })
  }, [game?.phase, myPlayerId, me?.words_submitted, wordFields.length])

  // Auto-skip phases for opted-out players
  useEffect(() => {
    if (!myPlayerId || !me) return
    if (game?.phase === "submitting" && me.opt_out_write && !me.words_submitted)
      supabase.rpc("ftw_skip_write", { p_code: code, p_player_id: myPlayerId })
  }, [game?.phase, me?.opt_out_write, me?.words_submitted, myPlayerId])

  useEffect(() => {
    if (!myPlayerId || !me) return
    if (game?.phase === "ranking" && me.opt_out_rank && !me.ranking_locked)
      supabase.rpc("ftw_skip_rank", { p_code: code, p_player_id: myPlayerId })
  }, [game?.phase, me?.opt_out_rank, me?.ranking_locked, myPlayerId])

  useEffect(() => {
    if (!myPlayerId || !me || !game || game.phase !== "guessing") return
    if (!me.opt_out_guess) return
    const sid = game.guessing_player_ids?.[game.guessing_index]
    if (myPlayerId === sid) return
    if (game.round_phase === "dragging" && !me.guessing_ready)
      supabase.rpc("ftw_submit_ready", { p_code: code, p_player_id: myPlayerId })
    if (game.round_phase === "reveal" && !(game.next_round_votes ?? []).includes(myPlayerId))
      supabase.rpc("ftw_vote_advance", { p_code: code, p_player_id: myPlayerId })
  }, [game?.phase, game?.round_phase, game?.guessing_index, me?.opt_out_guess, me?.guessing_ready, myPlayerId])

  // Sync group items from DB
  useEffect(() => {
    if (game?.phase !== "guessing" || game?.round_phase === "intro") return
    const round = game.guessing_index ?? 0
    if (round !== prevGuessRound.current) {
      prevGuessRound.current = round
      prevLastMoveRef.current = null  // reset so first move of new round is always detected
      setWatchThanks(false)
    }
    // Only update order from DB when no local move is in flight (prevents double-animation)
    if (game?.guess_order?.length && pendingMovesRef.current === 0) {
      setGroupItems(resolveWords(game.guess_order))
    }
  }, [game?.guessing_index, game?.guess_order?.join(","), game?.round_phase])

  const personalGroups = useMemo(() => {
    if (!game || game.word_distribution !== "personal" || !game.word_assignments || !myPlayerId) return null
    const myAssign = game.word_assignments[myPlayerId]
    if (!myAssign) return null
    const groups = []
    let fieldIdx = 0
    for (const [recipId, count] of Object.entries(myAssign)) {
      const recipient = players.find(p => p.id === recipId)
      groups.push({ recipId, recipName: recipient?.name ?? "?", count: Number(count), startField: fieldIdx })
      fieldIdx += Number(count)
    }
    return groups.length > 0 ? groups : null
  }, [game?.word_distribution, game?.word_assignments, myPlayerId, players])

  const fieldToRecipient = useMemo(() => {
    if (!personalGroups) return null
    const result = []
    for (const g of personalGroups) {
      for (let i = 0; i < g.count; i++) result.push(g.recipId)
    }
    return result.length === wordFields.length ? result : null
  }, [personalGroups])

  // Bot automation for guessing phase sub-phases
  useEffect(() => {
    if (!game || !players.length || !myPlayerId) return
    if (game.phase !== "guessing") return
    const bots = players.filter(p => p.is_bot)
    if (!bots.length) return

    const key = `${game.round_phase}:${game.guessing_index}`
    if (botAutoRef.current[key]) return
    botAutoRef.current[key] = true

    const subjId = game.guessing_player_ids?.[game.guessing_index]
    const nonSubjectBots = bots.filter(b => b.id !== subjId)

    if (game.round_phase === "intro" && nonSubjectBots.length > 0) {
      setTimeout(() => supabase.rpc("ftw_start_dragging", { p_code: code }), 1000)
    } else if (game.round_phase === "dragging") {
      nonSubjectBots.filter(b => !b.guessing_ready).forEach((bot, i) => {
        setTimeout(() => supabase.rpc("ftw_submit_ready", { p_code: code, p_player_id: bot.id }), 1200 + i * 500)
      })
    } else if (game.round_phase === "reveal") {
      bots.filter(b => !(game.next_round_votes ?? []).includes(b.id)).forEach((bot, i) => {
        setTimeout(() => supabase.rpc("ftw_vote_advance", { p_code: code, p_player_id: bot.id }), 1200 + i * 500)
      })
    }
  }, [game?.phase, game?.round_phase, game?.guessing_index, players.length, myPlayerId])

  if (!game) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  const totalRounds = game.guessing_player_ids?.length ?? players.length
  const currentRound = (game.guessing_index ?? 0) + 1
  const subjectId = game.guessing_player_ids?.[game.guessing_index]
  const isSubject = myPlayerId === subjectId
  const subjectPlayer = players.find(p => p.id === subjectId)
  const scoreRight = `Right ${game.group_score ?? 0} · Wrong ${game.game_score ?? 0}`
  const roundLabel = `Round ${currentRound} of ${totalRounds}`

  // Theme-aware instruction
  const theme = game.theme ?? "random"
  const thingWord = theme === "good" ? "good thing" : theme === "bad" ? "bad thing" : "thing"
  const thingsWord = theme === "good" ? "good things" : theme === "bad" ? "bad things" : "things"

  const isPersonal = game.word_distribution === "personal"

  // ── SUBMITTING PHASE ──────────────────────────────────────────────────────

  if (game.phase === "submitting") {
    const writingPlayers = players.filter(p => !p.opt_out_write)

    if (me?.opt_out_write) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label="First to Worst" />
          <div style={{ padding: "32px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
              Sitting out
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 32, lineHeight: 1.5 }}>
              You opted out of writing words.
            </p>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>
              Submitted
            </div>
            <WaitingList
              players={writingPlayers.map(p => ({ name: p.name, done: p.words_submitted, typing: typingPlayerIds.has(p.id) }))}
              myName={me?.name}
              colors={{ mid: MID }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    if (me?.words_submitted) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label="First to Worst" />
          <div style={{ padding: "32px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
              Waiting for<br />everyone…
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20, marginTop: 32 }}>
              Submitted
            </div>
            <WaitingList
              players={writingPlayers.map(p => ({ name: p.name, done: p.words_submitted, typing: typingPlayerIds.has(p.id) }))}
              myName={me?.name}
              colors={{ mid: MID }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    const wCount = wordFields.length

    async function fetchRandomIdeas(count, exclude) {
      const categories = await fetchIdeas()
      const excludeSet = new Set(exclude.map(s => s.toLowerCase()))
      return sampleIdeas(categories, excludeSet, count)
    }

    async function handleSubmitWords() {
      const trimmed = wordFields.map(w => w.trim())
      if (trimmed.some(w => !w)) { setSubmitError(`Fill in all ${wCount} before submitting.`); throw new Error("validation") }
      const lower = trimmed.map(w => w.toLowerCase())
      if (hasDuplicates) { setSubmitError("No duplicates allowed."); throw new Error("validation") }

      // Disallow words already submitted by other players
      const takenWord = trimmed.find(w => allWords.some(aw => aw.text.trim().toLowerCase() === w.toLowerCase()))
      if (takenWord) { setSubmitError(`"${takenWord}" was already submitted. Try something else.`); throw new Error("validation") }

      // Disallow exact matches to any shown idea — error shown inline under that field
      const shownLower = shownIdeas.map(s => s.toLowerCase())
      const copiedIdx = lower.findIndex(w => shownLower.includes(w))
      if (copiedIdx !== -1) {
        setCopiedIdeaIndex(copiedIdx)
        setSubmitError("")
        throw new Error("validation")
      }
      setCopiedIdeaIndex(null)

      if (!myPlayerId) return
      setSubmitError("")

      const forPlayerIds = fieldToRecipient || null

      const { error } = await supabase.rpc("ftw_submit_words", {
        p_code: code,
        p_player_id: myPlayerId,
        p_words: trimmed,
        p_for_player_ids: forPlayerIds,
      })
      if (error) {
        console.error("ftw_submit_words error:", error)
        setSubmitError(error.message ?? JSON.stringify(error))
        throw error
      }
      await loadState()
    }

    // Build input sections
    function renderInputs() {
      if (isPersonal && personalGroups && fieldToRecipient) {
        return personalGroups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: gi < personalGroups.length - 1 ? 16 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              For {g.recipName} · {g.count} {g.count === 1 ? thingWord : thingsWord}
            </div>
            {Array.from({ length: g.count }, (_, k) => {
              const idx = g.startField + k
              const isCopied = copiedIdeaIndex === idx
              const isDupe = dupeIndices.has(idx)
              return (
                <div key={idx}>
                  <TextEntry
                    value={wordFields[idx]}
                    onChange={v => {
                      const next = [...wordFields]
                      next[idx] = v
                      setWordFields(next)
                      if (copiedIdeaIndex === idx) setCopiedIdeaIndex(null)
                    }}
                    onTypingChange={onTypingChange}
                    inputRef={el => { wordInputRefs.current[idx] = el }}
                    onSubmit={idx < wordFields.length - 1
                      ? () => wordInputRefs.current[idx + 1]?.focus()
                      : handleSubmitWords}
                    multiline={false}
                    placeholder={`${thingWord.charAt(0).toUpperCase() + thingWord.slice(1)} ${k + 1}`}
                    maxLength={60}
                    bg={isCopied ? "rgba(240,79,82,0.18)" : isDupe ? "#5C1010" : WARM_LIGHT}
                    fontSize={18}
                    style={{ fontWeight: 600, marginBottom: isCopied ? 4 : 6 }}
                  />
                  {isCopied && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#F04F52", marginBottom: 6 }}>
                      Come up with something original!
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
      }

      // Default: 5 generic inputs
      return wordFields.map((val, i) => {
        const isCopied = copiedIdeaIndex === i
        const isDupe = dupeIndices.has(i)
        return (
          <div key={i}>
            <TextEntry
              value={val}
              onChange={v => {
                const next = [...wordFields]
                next[i] = v
                setWordFields(next)
                if (copiedIdeaIndex === i) setCopiedIdeaIndex(null)
              }}
              onTypingChange={onTypingChange}
              inputRef={el => { wordInputRefs.current[i] = el }}
              onSubmit={i < wordFields.length - 1
                ? () => wordInputRefs.current[i + 1]?.focus()
                : handleSubmitWords}
              multiline={false}
              placeholder={`${thingWord.charAt(0).toUpperCase() + thingWord.slice(1)} ${i + 1}`}
              maxLength={60}
              bg={isCopied ? "rgba(240,79,82,0.18)" : isDupe ? "#5C1010" : WARM_LIGHT}
              fontSize={18}
              style={{ fontWeight: 600, marginBottom: isCopied ? 4 : 8 }}
            />
            {isCopied && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F04F52", marginBottom: 8 }}>
                Come up with something original!
              </div>
            )}
          </div>
        )
      })
    }

    const countWord = wCount === 5 ? "five" : String(wCount)
    const introInstruction = isPersonal
      ? `Name ${thingsWord} for each player below — they'll rank all the words they receive from first to worst.`
      : theme === "good"
        ? `Name ${countWord} good things. Other players will rank your list.`
        : theme === "bad"
          ? `Name ${countWord} bad things. Other players will rank your list.`
          : `Name ${countWord} things — good, bad, weird, boring. Other players will rank these.`

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label="First to Worst" />
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>

          <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1, marginBottom: 10 }}>
            Your {wCount} Things
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 24, lineHeight: 1.4 }}>
            {introInstruction}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
            {renderInputs()}
          </div>

          {/* Random ideas */}
          <div style={{ marginBottom: 20 }}>
            <RandomIdeas
              key={game.round_index}
              bg={WARM_LIGHT}
              yellow={YELLOW}
              fetchIdeas={fetchRandomIdeas}
              playerNames={players.filter(p => p.id !== myPlayerId).map(p => p.first_name || p.name)}
              maxDraws={Math.ceil(wCount * 2 / 3)}
              onIdeaClick={idea => {
                const firstEmpty = wordFields.findIndex(w => !w.trim())
                if (firstEmpty !== -1) {
                  const next = [...wordFields]
                  next[firstEmpty] = idea
                  setWordFields(next)
                }
              }}
            />
          </div>

          {submitError && (
            <p style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginBottom: 12 }}>{submitError}</p>
          )}
        </div>
      </div>
        {pokeSystemNode(
          <FooterButton nudge={nudgeWords} onClick={handleSubmitWords} style={{ fontSize: 16 }}>Submit</FooterButton>
        )}
      </>
    )
  }

  // ── RANKING PHASE ─────────────────────────────────────────────────────────

  if (game.phase === "ranking") {
    const rankingPlayers = players.filter(p => !p.opt_out_rank)

    if (me?.opt_out_rank) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label="First to Worst" />
          <div style={{ padding: "32px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
              Sitting out
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 32, lineHeight: 1.5 }}>
              You opted out of ranking.
            </p>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>
              Rankings
            </div>
            <WaitingList
              players={rankingPlayers.map(p => ({ name: p.name, done: p.ranking_locked, typing: typingPlayerIds.has(p.id) }))}
              myName={me?.name}
              colors={{ mid: MID }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    if (me?.ranking_locked) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label="First to Worst" />
          <div style={{ padding: "32px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 900, lineHeight: 1, marginBottom: 32 }}>
              Waiting for<br />everyone…
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>
              Rankings
            </div>
            <WaitingList
              players={rankingPlayers.map(p => ({ name: p.name, done: p.ranking_locked, typing: typingPlayerIds.has(p.id) }))}
              myName={me?.name}
              colors={{ mid: MID }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
            <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 12 }}>No peeking at anyone else&rsquo;s phone!</p>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    async function handleLockIn() {
      if (!rankingItems || !myPlayerId) return
      const rankingIds = rankingItems.map(item => item.id)
      await rpc("ftw_lock_ranking", { p_code: code, p_player_id: myPlayerId, p_ranking: rankingIds })
    }

    const listH = listTotalH(rankingItems ?? [], vw() - 90)

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <StatusBar dark={DARK} label="First to Worst" />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px", paddingBottom: BOTTOM_PAD }}>

          <div style={{ fontSize: "clamp(26px, 8vw, 40px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>
            Rank these
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, marginBottom: 24, lineHeight: 1.4 }}>
            Drag to put them in order, first to worst. Only you can see this.
          </p>

          <div style={{ display: "flex", gap: GAP.result, marginBottom: 24 }}>
            <SpectrumBar listHeight={listH} />
            <div style={{ flex: 1 }}>
              {rankingItems && (
                <DragList
                  items={rankingItems}
                  onReorder={setRankingItems}
                  disabled={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
        {pokeSystemNode(
          <FooterButton onClick={handleLockIn} style={{ fontSize: 16 }}>Lock It In</FooterButton>
        )}
      </>
    )
  }

  // ── GUESSING PHASE ────────────────────────────────────────────────────────

  if (game.phase === "guessing") {
    const nonSubjectPlayers = players.filter(p => p.id !== subjectId && !p.opt_out_guess)
    const readyCount = nonSubjectPlayers.filter(p => p.guessing_ready).length
    const imReady = !!players.find(p => p.id === myPlayerId)?.guessing_ready
    const voteCount = game.next_round_votes?.length ?? 0
    const hasVotedNextRound = game.next_round_votes?.some(v => v === myPlayerId) ?? false
    const guessParticipants = players.filter(p => !p.opt_out_guess).length

    // ── INTRO ──
    if (game.round_phase === "intro") {
      useEffect(() => {
        if (isSubject) return
        const timer = setTimeout(async () => {
          await supabase.rpc("ftw_start_dragging", { p_code: code })
          await loadState()
        }, 2000)
        return () => clearTimeout(timer)
      }, [code, isSubject])

      if (isSubject) {
        return (
          <>
          <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
            <StatusBar dark={DARK} label={roundLabel} right={scoreRight} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", paddingBottom: BOTTOM_PAD, textAlign: "center" }}>
              <div style={{ fontSize: "clamp(36px, 10vw, 56px)", fontWeight: 900, lineHeight: 1, marginBottom: 20 }}>
                Your words are up!
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, opacity: 0.6, marginBottom: 48, lineHeight: 1.4 }}>
                Shh! Everyone is guessing your ranking. No talking.
              </p>
              <button
                onClick={() => setWatchThanks(true)}
                style={{ background: WARM_LIGHT, color: "white", fontSize: 18, fontWeight: 800, padding: "18px" }}
              >
                I&rsquo;ll Watch
              </button>
              <p style={{ visibility: watchThanks ? "visible" : "hidden", textAlign: "center", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: 12 }}>
                Thanks
              </p>
            </div>
          </div>
            {pokeSystemNode()}
          </>
        )
      }

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label={roundLabel} right={scoreRight} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", paddingBottom: BOTTOM_PAD, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 16 }}>
              {roundLabel}
            </div>
            <div style={{ fontSize: "clamp(36px, 10vw, 56px)", fontWeight: 900, lineHeight: 1, marginBottom: 16 }}>
              {subjectPlayer?.name}&rsquo;s words
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, opacity: 0.6, marginBottom: 48, lineHeight: 1.4 }}>
              Work together to figure out the order {subjectPlayer?.name} ranked them, from their first to their worst.
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: YELLOW }}>
              Starting…
            </p>
          </div>
        </div>
          {pokeSystemNode()}
        </>
      )
    }

    // ── DRAGGING ──
    if (game.round_phase === "dragging") {
      async function onGroupMove(slot, dir) {
        if (!groupItems || imReady) return
        const j = slot + dir
        if (j < 0 || j >= groupItems.length) return
        const next = [...groupItems]
        ;[next[slot], next[j]] = [next[j], next[slot]]
        const move = { slot, dir, t: Date.now() }  // nonce ensures each press is unique in DB
        prevLastMoveRef.current = JSON.stringify(move)  // prevent double-highlight on pressing player's next poll

        pendingMovesRef.current++
        setGroupItems(next)
        setHighlightMove(move)
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = setTimeout(() => setHighlightMove(null), 300)

        await supabase.rpc("ftw_update_guess_order", {
          p_code: code,
          p_order: next.map(item => item.id),
        })
        // Write move to DB so other players see the highlight via Realtime postgres_changes
        await supabase.from("ftw_games").update({ last_move: move }).eq("code", code)
        pendingMovesRef.current--
      }

      async function handleReady() {
        if (imReady || !myPlayerId || isSubject) return
        const { error } = await supabase.rpc("ftw_submit_ready", { p_code: code, p_player_id: myPlayerId })
        if (error) throw error
        await loadState()
      }

      const listH = listTotalH(groupItems ?? [], vw() - 90)

      if (isSubject || (me?.opt_out_guess && !isSubject)) {
        const isWatcher = me?.opt_out_guess && !isSubject
        return (
          <>
          <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
            <StatusBar dark={DARK} label={roundLabel} right={scoreRight} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
              <div style={{ fontSize: "clamp(28px, 8vw, 44px)", fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
                {isWatcher ? "Watching" : "Stay quiet!"}
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 28 }}>
                {isWatcher
                  ? `Everyone is ordering ${subjectPlayer?.name}'s ranking.`
                  : "No hints. Wait and see what everyone decides."}
              </p>

              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
                Group&rsquo;s current order
              </div>

              <div style={{ display: "flex", gap: GAP.result }}>
                <SpectrumBar listHeight={listH} />
                <div style={{ flex: 1 }}>
                  {groupItems && (
                    <ButtonList items={groupItems} onMove={() => {}} disabled={true} highlightMove={null} />
                  )}
                </div>
              </div>

              <p style={{ fontSize: 13, fontWeight: 600, opacity: 0.65, marginTop: 16 }}>
                {readyCount} of {nonSubjectPlayers.length} ready
              </p>
            </div>
          </div>
            {pokeSystemNode()}
          </>
        )
      }

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label={roundLabel} right={scoreRight} />
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px", paddingBottom: BOTTOM_PAD }}>

            <div style={{ fontSize: "clamp(26px, 8vw, 40px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 4 }}>
              {subjectPlayer?.name}&rsquo;s Ranking
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.65, marginBottom: 20 }}>
              Arrange from {subjectPlayer?.name}&rsquo;s first to worst.
            </p>

            <div style={{ display: "flex", gap: GAP.result, marginBottom: 20 }}>
              <SpectrumBar listHeight={listH} />
              <div style={{ flex: 1 }}>
                {groupItems && (
                  <ButtonList
                    items={groupItems}
                    onMove={onGroupMove}
                    disabled={imReady}
                    highlightMove={imReady ? null : highlightMove}
                  />
                )}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <WaitingList
                players={nonSubjectPlayers.map(p => ({ name: p.name, done: p.guessing_ready, typing: typingPlayerIds.has(p.id) }))}
                myName={me?.name}
                colors={{ mid: MID }}
                onPoke={sendInlinePoke}
                cooldownActive={pokeCooldownActive}
                pokeJustSent={pokeJustSent}
              />
            </div>
          </div>
        </div>
          {pokeSystemNode(
            imReady
              ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{readyCount} / {nonSubjectPlayers.length} ready…</div>
              : <FooterButton onClick={handleReady} style={{ fontSize: 16 }}>Ready</FooterButton>
          )}
        </>
      )
    }

    // ── REVEAL ──
    if (game.round_phase === "reveal") {
      const trueRanking = players.find(p => p.id === subjectId)?.ranking ?? []
      const groupGuess = game.guess_order ?? []

      const trueItems = trueRanking.map((id, i) => {
        const word = allWords.find(w => w.id === id)
        const author = players.find(p => p.id === word?.player_id)
        return { id, text: word?.text ?? "?", correct: id === groupGuess[i], author: author?.name ?? null }
      })

      const groupItems2 = groupGuess.map((id) => {
        const word = allWords.find(w => w.id === id)
        const author = players.find(p => p.id === word?.player_id)
        return { id, text: word?.text ?? "?", correct: null, author: author?.name ?? null }
      })

      const displayItems = showGroupView ? groupItems2 : trueItems
      const isLastRound = currentRound >= totalRounds

      async function handleVoteAdvance() {
        if (hasVotedNextRound || !myPlayerId) return
        const { error } = await supabase.rpc("ftw_vote_advance", { p_code: code, p_player_id: myPlayerId })
        if (error) throw error
        await loadState()
      }

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
          <StatusBar dark={DARK} label={roundLabel} right={scoreRight} />
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px" }}>

            <div style={{ fontSize: "clamp(26px, 8vw, 40px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 20 }}>
              {showGroupView ? "Group's Guess" : `${subjectPlayer?.name}'s Ranking`}
            </div>

            <div style={{ marginBottom: 24 }}>
              <RevealList items={displayItems} transitionMs={0} />
            </div>

            <Scoreboard right={game.group_score ?? 0} wrong={game.game_score ?? 0} />
          </div>

          {/* Hold to peek */}
          <div style={{ flexShrink: 0, padding: "12px 24px", paddingBottom: `calc(${FOOTER_H}px + max(12px, env(safe-area-inset-bottom)))`, background: BG, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onPointerDown={() => setShowGroupView(true)}
              onPointerUp={() => setShowGroupView(false)}
              onPointerLeave={() => setShowGroupView(false)}
              style={{ background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 800, padding: "16px", width: "100%", display: "block", userSelect: "none", WebkitUserSelect: "none" }}
            >
              Hold to see group&rsquo;s guess
            </button>
          </div>
        </div>
          {pokeSystemNode(
            hasVotedNextRound
              ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{voteCount} / {guessParticipants} ready…</div>
              : <FooterButton onClick={handleVoteAdvance} style={{ fontSize: 16 }}>{isLastRound ? "See Final Score" : "Next Round"}</FooterButton>
          )}
        </>
      )
    }
  }

  if (game.phase === "finished") {
    const right = game.group_score ?? 0
    const wrong = game.game_score ?? 0
    const groupWon = right > wrong
    const tie = right === wrong

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: "clamp(52px, 15vw, 80px)", fontWeight: 900, lineHeight: 0.9, marginBottom: 28 }}>
            Game<br />Over
          </div>

          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
            Final Score
          </div>

          <Scoreboard right={right} wrong={wrong} />

          <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 40, lineHeight: 1.5 }}>
            {tie
              ? `Exactly even — ${right} right, ${wrong} wrong.`
              : groupWon
                ? `You got more right than wrong. You know each other well.`
                : `More wrong than right. The words had you stumped.`}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={async () => { await supabase.rpc("ftw_reset_to_lobby", { p_code: code }); await loadState() }}
              style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
              Play Again
            </button>
            <a href="https://games.jackbrannen.com"
              style={{ display: "block", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none" }}>
              Play Another Game
            </a>
          </div>
        </div>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

}
