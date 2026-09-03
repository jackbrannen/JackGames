"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import IdleGateModal from "../../../components/IdleGateModal"
import EndGame from "../../../components/EndGame"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import WaitingList from "../../../components/WaitingList"
import RandomIdeas from "../../../components/RandomIdeas"
import { useIdleGate } from "../../../lib/useIdleGate"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import { BG, DARK, MID, WL, ACCENT, ACCENT_TEXT, DANGER, COLORS, DEPTH_TIERS, DEPTH_MIN, DEPTH_MAX, tier, REACTIONS } from "../../../components/theme"

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

// Must match .ob-depth's thumb width in globals.css. A native range thumb's travel is
// inset by its own radius on each side — it never reaches the track's literal 0%/100%
// edges — so tick/label positions need this same inset baked in, not a plain percentage
// (which only happens to agree with the thumb at the exact midpoint and drifts further off
// toward each end, which is exactly the misalignment this constant fixes).
const DEPTH_THUMB_PX = 34
function depthStopLeft(i, count) {
  return `calc(${DEPTH_THUMB_PX / 2}px + (100% - ${DEPTH_THUMB_PX}px) * ${i / (count - 1)})`
}

// Reaction plumbing. The animation and the tally are deliberately two different
// mechanisms — see REALTIME.md's logged toggleLike incident, and ui-text.md.
const REACT_BROADCAST_MS = 250   // coalesce this client's presses into one broadcast
const REACT_FLUSH_MS = 3000      // batch tally writes to the database
const FLOAT_LIFE_MS = 1000       // how long one floating emoji lives
const MAX_FLOATS = 40            // hard cap on concurrent floating emoji in the DOM
const MAX_FLOATS_PER_MESSAGE = 6 // one broadcast carrying 30 presses spawns at most this many

function reactionKey(targetId, emoji) {
  return `${targetId}|${emoji}`
}

// A chip mid-flight during a swap (ported from Typecast's SwapCard) — imperatively
// animated via a ref rather than React state, since the animation must start from an
// exact pixel position captured at drop time and CSS can't express "animate from an
// arbitrary starting point."
function SwapCard({ hint, bg, text, width, fromX, fromY, toX, toY }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = "none"
    // from/to are CENTER points of the slot the chip sits in — measure the chip's own
    // rendered size so its center, not its corner, lands there.
    const { width, height } = el.getBoundingClientRect()
    el.style.transform = `translate(${fromX - width / 2}px, ${fromY - height / 2}px)`
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)"
      el.style.transform = `translate(${toX - width / 2}px, ${toY - height / 2}px)`
    })
  }, [])
  return (
    <div ref={ref} style={{
      position: "fixed", top: 0, left: 0, zIndex: 320, pointerEvents: "none",
      background: bg, color: text, padding: "10px 14px", borderRadius: 10, fontSize: 15, fontWeight: 800,
      // width is the chip's own measured width from wherever it started (see
      // animateSwap/animateSwapSlots) — not a made-up constant. A definite width is still
      // required (an auto-width fixed box has no flex/grid parent to size it against, so
      // it shrink-to-fits unpredictably), it just doesn't have to be the SAME width for
      // every chip regardless of content.
      width: width ?? 160, textAlign: "center", lineHeight: 1.25, wordBreak: "break-word",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", willChange: "transform",
    }}>
      {hint}
    </div>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [myPlayerId, setMyPlayerId] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [reactions, setReactions] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)

  // ── Write phase ──
  const [question, setQuestion] = useState("")
  const [hint, setHint] = useState("")
  const [depth, setDepth] = useState(DEPTH_MIN) // slider starts all the way at Splash pad
  const [submitting, setSubmitting] = useState(false)

  // ── Assign phase ──
  const [slots, setSlots] = useState([])
  const [dragValue, setDragValue] = useState(null)
  const [dragWidth, setDragWidth] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const [toast, setToast] = useState(null)
  const [showChangedBanner, setShowChangedBanner] = useState(false)
  // Swap animation (ported from Typecast): [{authorId, fromX, fromY, toX, toY}, ...] for the
  // two chips currently mid-flight, plus which slot indices to hide their static chip while
  // the animated copy is in flight over them.
  const [swapAnim, setSwapAnim] = useState(null)
  const [hidingSlots, setHidingSlots] = useState(() => new Set())
  const slotsRef = useRef(slots)
  const dragRef = useRef(null)
  const dropFnRef = useRef(null)
  const persistQueueRef = useRef(Promise.resolve())
  const wasReadyRef = useRef(false)
  const toastTimerRef = useRef(null)

  // ── Answer phase ──
  const [floats, setFloats] = useState([])
  const [optimistic, setOptimistic] = useState({}) // key -> my presses not yet in the db row
  const pendingRef = useRef(new Map())             // key -> presses not yet written
  const flushedRef = useRef(new Map())             // key -> written, awaiting realtime echo
  const broadcastBufRef = useRef(new Map())
  const broadcastTimerRef = useRef(null)
  const floatIdRef = useRef(0)
  const [confirmEnd, setConfirmEnd] = useState(null) // null | 1 | 2

  const channelRef = useRef(null)
  const loadSeqRef = useRef(0)
  const latestGameUpdatedAtRef = useRef(null)
  const gossipKeyRef = useRef(null)
  const isIdle = useIdleGate()

  const me = players.find((p) => p.id === myPlayerId)
  const phase = game?.phase
  const slotOrder = game?.slot_order ?? []
  const boardFromDb = game?.board
  const nudgeSubmit = useSubmitNudge(question + hint, !!me?.submitted)

  useEffect(() => { slotsRef.current = slots }, [slots])

  useEffect(() => {
    const existing = localStorage.getItem(`ob:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    else router.replace(`/${code}`)
  }, [code])

  // Gossip key lives in loadState, not applyGameRow — applyGameRow is also the realtime
  // handler, and re-broadcasting from there means every client that observed a transition
  // rebroadcasts it, fanning redundant refetches across the room. See REALTIME.md §4.
  function gossipSyncKey(g) {
    return `${g.phase}:${g.replay_code}`
  }

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }, { data: rs }] = await Promise.all([
      supabase.from("ob_games").select("*").eq("code", code).single(),
      supabase.from("ob_players").select("*").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("ob_reactions").select("*").eq("game_code", code),
    ])
    if (seq !== loadSeqRef.current) return
    if (!g) { router.replace(`/${code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    const key = gossipSyncKey(g)
    if (gossipKeyRef.current !== null && gossipKeyRef.current !== key) {
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }
    gossipKeyRef.current = key
    applyGameRow(g)
    setPlayers(ps ?? [])
    setReactions(rs ?? [])
    // A full refetch is the source of truth for tallies — anything still sitting in
    // flushedRef has now definitely landed, so stop double-counting it locally.
    flushedRef.current.clear()
    setOptimistic({})
  }

  // Freshness-guarded against updated_at: several paths can deliver a game row (realtime,
  // the poll, gossip refetch), and a slower one resolving last would otherwise overwrite
  // fresher state with stale data — visible as the board flickering back a move.
  function applyGameRow(newRow) {
    if (!newRow) return
    if (latestGameUpdatedAtRef.current && newRow.updated_at <= latestGameUpdatedAtRef.current) return
    latestGameUpdatedAtRef.current = newRow.updated_at
    setGame(newRow)
  }

  function applyPlayerRow(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") {
      setPlayers((prev) => prev.filter((r) => r.id !== oldRow?.id))
      return
    }
    if (!newRow) return
    setPlayers((prev) => {
      const idx = prev.findIndex((r) => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map((r) => (r.id === newRow.id ? newRow : r))
    })
  }

  function applyReactionRow(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") {
      setReactions((prev) => prev.filter((r) => r.id !== oldRow?.id))
      return
    }
    if (!newRow) return
    setReactions((prev) => {
      const idx = prev.findIndex((r) => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map((r) => (r.id === newRow.id ? newRow : r))
    })
    // This row now includes whatever we last flushed for it, so drop our local
    // stand-in for exactly that amount (not the whole optimistic count — presses made
    // since the flush haven't been written yet and must survive).
    const key = reactionKey(newRow.target_player_id, newRow.emoji)
    const flushed = flushedRef.current.get(key) ?? 0
    if (flushed > 0) {
      flushedRef.current.set(key, 0)
      setOptimistic((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) - flushed) }))
    }
  }

  useEffect(() => {
    if (isIdle) return
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0
    let stableTimer = null

    function connect() {
      channel = supabase
        .channel(`ob-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ob_games", filter: `code=eq.${code}` }, (payload) => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "ob_players", filter: `game_code=eq.${code}` }, applyPlayerRow)
        .on("postgres_changes", { event: "*", schema: "public", table: "ob_reactions", filter: `game_code=eq.${code}` }, applyReactionRow)
        // Reaction animations ride the websocket only — they never touch Postgres, so
        // unlimited mashing costs nothing but a coalesced message every 250ms.
        .on("broadcast", { event: "react" }, ({ payload }) => {
          if (!payload || payload.from === myPlayerId) return
          for (const it of payload.items ?? []) spawnFloats(it.t, it.e, it.c)
        })
        // Silent catch-up for a peer whose own subscription died. Deliberately no loading
        // flag: healthy clients already have the update by the time this arrives.
        .on("broadcast", { event: "sync" }, () => { loadState() })
        .subscribe((status) => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            channelRef.current = channel
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(stableTimer)
            if (reconnectTimer) return
            const delay = Math.min(2000 * 2 ** reconnectAttempt, 30000)
            reconnectAttempt++
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              if (cancelled) return
              supabase.removeChannel(channel)
              connect()
            }, delay)
          }
        })
    }
    connect()

    return () => {
      cancelled = true
      channelRef.current = null
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearTimeout(stableTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle, myPlayerId])

  // ob_create_replay copies every player's name into the fresh lobby — before redirecting,
  // look up which row is ours there (matched by name) and pre-seed localStorage with it, so
  // this player lands back in that lobby already joined instead of hitting the join form
  // with "that name is already taken" (their old name is already in the new roster; only
  // the tapper's OWN client used to do this lookup, which is what stranded everyone else).
  async function redirectToReplay(newCode) {
    if (myPlayerId) {
      const { data: mine } = await supabase.from("ob_players").select("name").eq("id", myPlayerId).single()
      if (mine?.name) {
        const { data: rows } = await supabase.from("ob_players").select("id").eq("game_code", newCode).ilike("name", mine.name).limit(1)
        if (rows?.[0]) localStorage.setItem(`ob:${newCode}:playerId`, rows[0].id)
      }
    }
    router.replace(`/${newCode}`)
  }

  // Whoever taps "Play Again" sets replay_code via ob_create_replay — the realtime patch
  // on ob_games (already subscribed above) delivers it to every other viewer here too, so
  // everyone follows to the new lobby without needing their own click.
  useEffect(() => {
    if (game?.replay_code) redirectToReplay(game.replay_code)
  }, [game?.replay_code])

  // Menu's "Back to Lobby" resets the row to phase 'lobby'. That arrives as a realtime
  // patch, not a loadState, so it needs its own redirect — without this, everyone who
  // didn't press it stays stranded on a dead play screen.
  useEffect(() => {
    if (game?.phase === "lobby" && myPlayerId) router.replace(`/${code}`)
  }, [game?.phase, myPlayerId])

  // ── Reactions ────────────────────────────────────────────────────────────

  function spawnFloats(targetId, emoji, n) {
    const count = Math.max(1, Math.min(n ?? 1, MAX_FLOATS_PER_MESSAGE))
    const items = []
    for (let i = 0; i < count; i++) {
      items.push({
        id: floatIdRef.current++,
        target: targetId,
        emoji,
        dx: Math.round(Math.random() * 36 - 18),
        delay: i * 60,
      })
    }
    setFloats((prev) => [...prev, ...items].slice(-MAX_FLOATS))
    setTimeout(() => {
      setFloats((prev) => prev.filter((f) => !items.some((it) => it.id === f.id)))
    }, FLOAT_LIFE_MS + count * 60)
  }

  async function flushReactions() {
    const buf = pendingRef.current
    if (buf.size === 0) return
    const entries = [...buf.entries()].filter(([, c]) => c > 0)
    buf.clear()
    for (const [key, count] of entries) {
      const [target, emoji] = key.split("|")
      flushedRef.current.set(key, (flushedRef.current.get(key) ?? 0) + count)
      const { error } = await supabase.rpc("ob_add_reactions", { p_code: code, p_target: target, p_emoji: emoji, p_count: count })
      if (error) {
        // Put it back so the presses aren't silently lost, and drop the optimistic
        // stand-in we'd otherwise never clear.
        flushedRef.current.set(key, Math.max(0, (flushedRef.current.get(key) ?? 0) - count))
        buf.set(key, (buf.get(key) ?? 0) + count)
      }
    }
  }

  useEffect(() => {
    if (phase !== "answer") return
    const id = setInterval(flushReactions, REACT_FLUSH_MS)
    return () => { clearInterval(id); flushReactions() }
  }, [phase, code])

  // Last-chance flush if the tab goes away mid-mash.
  useEffect(() => {
    function onHide() { if (document.hidden) flushReactions() }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flushReactions)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flushReactions)
    }
  }, [code])

  function react(targetId, emoji) {
    const key = reactionKey(targetId, emoji)
    spawnFloats(targetId, emoji, 1)
    setOptimistic((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
    pendingRef.current.set(key, (pendingRef.current.get(key) ?? 0) + 1)

    broadcastBufRef.current.set(key, (broadcastBufRef.current.get(key) ?? 0) + 1)
    if (broadcastTimerRef.current) return
    broadcastTimerRef.current = setTimeout(() => {
      broadcastTimerRef.current = null
      const items = [...broadcastBufRef.current.entries()].map(([k, c]) => {
        const [t, e] = k.split("|")
        return { t, e, c }
      })
      broadcastBufRef.current.clear()
      if (items.length) {
        channelRef.current?.send({ type: "broadcast", event: "react", payload: { items, from: myPlayerId } })
      }
    }, REACT_BROADCAST_MS)
  }

  function countFor(targetId, emoji) {
    const key = reactionKey(targetId, emoji)
    const row = reactions.find((r) => r.target_player_id === targetId && r.emoji === emoji)
    return (row?.count ?? 0) + (optimistic[key] ?? 0)
  }

  // ── Assign phase board ───────────────────────────────────────────────────

  // Sync the shared board in, unless this client is mid-drag (which would yank the chip
  // out from under their finger). If exactly two slots changed and they swapped values
  // with each other, animate it — this is what makes someone ELSE's drag visibly swap on
  // screen instead of just teleporting, same as Typecast's animateSwapSlots.
  useEffect(() => {
    if (phase !== "assign") return
    if (dragRef.current) return
    if (!Array.isArray(boardFromDb)) return
    const next = boardFromDb.map((v) => (v == null ? null : String(v)))
    const prev = slotsRef.current
    if (prev.length === next.length && prev.every((v, i) => v === next[i])) return
    if (prev.length === next.length) {
      const changed = next.map((_, i) => i).filter((i) => prev[i] !== next[i])
      if (changed.length === 2) {
        const [a, b] = changed
        if (prev[a] != null && prev[b] != null && prev[a] === next[b] && prev[b] === next[a]) {
          animateSwapSlots(a, b, prev[a], prev[b])
        }
      }
    }
    setSlots(next)
  }, [JSON.stringify(boardFromDb), phase])

  // Reads the actual rendered chip width sitting in a slot right now — the real content
  // width, bounded by chip()'s own maxWidth/wordBreak, not an arbitrary constant. Must be
  // called before that slot's chip is hidden/replaced.
  function chipWidthInSlot(slotIndex) {
    return document.querySelector(`[data-ob-slot="${slotIndex}"]`)?.firstElementChild?.getBoundingClientRect().width
  }

  function animateSwap(draggedAuthorId, draggedWidth, srcIndex, displacedAuthorId, targetIndex, dropX, dropY) {
    const displacedWidth = chipWidthInSlot(targetIndex)
    const srcRect = document.querySelector(`[data-ob-slot="${srcIndex}"]`)?.getBoundingClientRect()
    const tgtRect = document.querySelector(`[data-ob-slot="${targetIndex}"]`)?.getBoundingClientRect()
    if (!srcRect || !tgtRect) return
    setHidingSlots(new Set([srcIndex, targetIndex]))
    const srcX = srcRect.left + srcRect.width / 2, srcY = srcRect.top + srcRect.height / 2
    const tgtX = tgtRect.left + tgtRect.width / 2, tgtY = tgtRect.top + tgtRect.height / 2
    setSwapAnim([
      { authorId: draggedAuthorId, width: draggedWidth, fromX: dropX, fromY: dropY, toX: tgtX, toY: tgtY },
      { authorId: displacedAuthorId, width: displacedWidth, fromX: tgtX, fromY: tgtY, toX: srcX, toY: srcY },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }

  function animateSwapSlots(indexA, indexB, authorIdA, authorIdB) {
    const widthA = chipWidthInSlot(indexA)
    const widthB = chipWidthInSlot(indexB)
    const rectA = document.querySelector(`[data-ob-slot="${indexA}"]`)?.getBoundingClientRect()
    const rectB = document.querySelector(`[data-ob-slot="${indexB}"]`)?.getBoundingClientRect()
    if (!rectA || !rectB) return
    setHidingSlots(new Set([indexA, indexB]))
    const aX = rectA.left + rectA.width / 2, aY = rectA.top + rectA.height / 2
    const bX = rectB.left + rectB.width / 2, bY = rectB.top + rectB.height / 2
    setSwapAnim([
      { authorId: authorIdA, width: widthA, fromX: aX, fromY: aY, toX: bX, toY: bY },
      { authorId: authorIdB, width: widthB, fromX: bX, fromY: bY, toX: aX, toY: aY },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      const pt = e.touches?.[0] ?? e
      setDragPos({ x: pt.clientX, y: pt.clientY })
    }
    function onUp(e) {
      if (!dragRef.current) return
      const pt = e.changedTouches?.[0] ?? e
      dropFnRef.current?.(pt.clientX, pt.clientY)
      dragRef.current = null
      setDragValue(null)
      setDragWidth(null)
      setDragPos(null)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    return () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
  }, [])

  // Whoever was ready and got un-readied by someone else's edit gets told why, rather
  // than silently discovering their ready state flipped.
  useEffect(() => {
    const isReady = !!me?.ready
    if (wasReadyRef.current && !isReady) setShowChangedBanner(true)
    if (isReady) setShowChangedBanner(false)
    wasReadyRef.current = isReady
  }, [me?.ready])

  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 1800)
  }

  // Queued so two quick drags can't have their writes land out of order (an older write
  // resolving last would silently revert the newer arrangement).
  function persistBoard(next) {
    setSlots(next)
    persistQueueRef.current = persistQueueRef.current.then(() =>
      // No nudge(): this fires on every drag and the write already reaches every peer
      // through the payload-patched postgres_changes handler.
      supabase.rpc("ob_set_board", { p_code: code, p_board: next })
    )
  }

  function startDrag(e, authorId, source, slotIndex) {
    if (phase !== "assign") return
    e.preventDefault()
    const pt = e.touches?.[0] ?? e
    // The chip's own rendered width, captured now while it's still sitting in its flex/grid
    // parent (tray or slot) — that's the real content-appropriate width, not a guess. It has
    // to be captured here: once the drag starts, the origin slot goes empty (below) and
    // there's nothing left to measure it from.
    const width = e.currentTarget.getBoundingClientRect().width
    dragRef.current = { authorId, source, slotIndex, width }
    setDragValue(authorId)
    setDragWidth(width)
    setDragPos({ x: pt.clientX, y: pt.clientY })
    if (source === "slot") {
      const next = [...slotsRef.current]
      next[slotIndex] = null
      setSlots(next)
    }
  }

  function handleDrop(x, y) {
    const drag = dragRef.current
    if (!drag) return
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest("[data-ob-slot-hit]")
    const targetIndex = slotEl ? Number(slotEl.dataset.obSlotHit) : null
    const cur = [...slotsRef.current]

    if (targetIndex == null) {
      // Dropped on nothing — put it back where it came from rather than losing it.
      if (drag.source === "slot") cur[drag.slotIndex] = drag.authorId
      setSlots(cur)
      return
    }

    // Nobody answers their own question.
    if (slotOrder[targetIndex] === drag.authorId) {
      const who = players.find((p) => p.id === drag.authorId)
      showToast(`That's ${who?.name ?? "their"}'s own question.`)
      if (drag.source === "slot") cur[drag.slotIndex] = drag.authorId
      setSlots(cur)
      return
    }

    const existing = cur[targetIndex]
    // A swap can also strand the displaced chip on its own author's slot — refuse that too.
    if (drag.source === "slot" && existing != null && slotOrder[drag.slotIndex] === existing) {
      showToast("You can't have your own question.")
      cur[drag.slotIndex] = drag.authorId
      setSlots(cur)
      return
    }

    const isSwap = drag.source === "slot" && existing != null && targetIndex !== drag.slotIndex
    if (drag.source === "slot") cur[drag.slotIndex] = existing ?? null
    cur[targetIndex] = drag.authorId
    if (isSwap) animateSwap(drag.authorId, drag.width, drag.slotIndex, existing, targetIndex, x, y)
    persistBoard(cur)
  }
  dropFnRef.current = handleDrop

  async function submitQuestion() {
    if (submitting || !question.trim() || !hint.trim()) return
    setSubmitting(true)
    const { error } = await supabase.rpc("ob_submit_question", {
      p_code: code, p_player_id: myPlayerId, p_question: question, p_hint: hint, p_depth: depth,
    })
    if (error) { alert("Couldn't lock it in: " + error.message); setSubmitting(false); throw error }
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  async function toggleReady() {
    if (!myPlayerId) return
    const next = !me?.ready
    const { error } = await supabase.rpc("ob_set_ready", { p_code: code, p_player_id: myPlayerId, p_ready: next })
    if (error) { alert(error.message); return }
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  async function endGame() {
    await flushReactions() // don't lose the last few seconds of mashing
    const { error } = await supabase.rpc("ob_end_game", { p_code: code })
    if (error) { alert(error.message); return }
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  async function playAgain() {
    if (!game) return
    if (game.replay_code) { redirectToReplay(game.replay_code); return }
    const { data, error } = await supabase.rpc("ob_create_replay", { p_code: code })
    if (error) return
    redirectToReplay(data)
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const playerById = (id) => players.find((p) => p.id === id)
  const answerOrder = Array.isArray(game?.answer_order) ? game.answer_order : []
  const boardFilled = slots.length > 0 && slots.every((s) => s != null)
  const placed = new Set(slots.filter(Boolean))
  const pool = players.map((p) => p.id).filter((id) => !placed.has(id) && id !== dragValue)
  const readyCount = players.filter((p) => p.ready).length

  if (isIdle) return <IdleGateModal colors={COLORS} />

  if (!game || !me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 600 }}>Loading…</p>
      </div>
    )
  }

  const chrome = (footer = null) => (
    <>
      <Notifications supabase={supabase} colors={COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map((p) => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        gamePhase={game.phase}
        onResetToLobby={async () => { await supabase.rpc("ob_reset_to_lobby", { p_code: code }) }}
      />
      <Footer colors={COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen((o) => !o)}>
        {footer}
      </Footer>
    </>
  )

  // ── WRITE ────────────────────────────────────────────────────────────────
  if (phase === "write") {
    const t = tier(depth)
    if (me.submitted) {
      return (
        <>
          <div style={{ minHeight: "100dvh", background: BG, color: "#fff", paddingTop: 28, paddingLeft: 24, paddingRight: 24, paddingBottom: BOTTOM_PAD }}>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 6 }}>Locked in</h1>
            <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 26 }}>Waiting for everyone…</p>
            <WaitingList
              players={players.map((p) => ({ name: p.name, done: !!p.submitted }))}
              myName={me.name}
              colors={{ mid: MID }}
            />
          </div>
          {chrome()}
        </>
      )
    }
    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: "#fff", paddingTop: 28, paddingLeft: 24, paddingRight: 24, paddingBottom: BOTTOM_PAD }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 22 }}>Write your question</h1>

          <label style={{ display: "block", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>Your question</label>
          {/* Recolors to the current depth tier as the slider moves, same as everything
              else on this screen — so the question you're writing visibly gets "deeper"
              along with the rating you're giving it, instead of that only showing up in the
              slider/legend below. */}
          <textarea
            className="ob-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What's something you've changed your mind about?"
            maxLength={280}
            rows={3}
            style={{
              background: t.bg, color: t.text, border: `1.5px solid ${t.border}`,
              fontSize: 18, fontWeight: 600, padding: "14px 16px", width: "100%", boxSizing: "border-box",
              resize: "none", lineHeight: 1.4, transition: "background 200ms ease, color 200ms ease, border-color 200ms ease",
              "--ob-q-placeholder": t.placeholder,
            }}
          />
          <div style={{ marginTop: 8 }}>
            <RandomIdeas
              bg={WL}
              iconColor={ACCENT}
              fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
            />
          </div>

          <label style={{ display: "block", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.75)", marginTop: 20, marginBottom: 4 }}>Hint</label>
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 8, lineHeight: 1.45 }}>
            A word or two about the topic. This is all anyone sees when the questions get handed out — don&apos;t give the answer away.
          </p>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="changing your mind"
            maxLength={40}
            style={{ background: WL, color: "#fff", fontSize: 18, fontWeight: 700, padding: "14px 16px", width: "100%", boxSizing: "border-box" }}
          />

          <label style={{ display: "block", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.75)", marginTop: 24, marginBottom: 14 }}>How deep does it go?</label>
          <input
            className="ob-depth"
            type="range"
            min={DEPTH_MIN}
            max={DEPTH_MAX}
            step={1}
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value))}
            style={{ "--ob-depth": t.bg, "--ob-track": WL }}
          />
          {/* Real tick marks, not a native <datalist> — WebKit doesn't render datalist ticks
              on range inputs at all, which is why they were invisible. Positions come from
              depthStopLeft, which bakes in the thumb's own radius inset (see its comment) —
              a plain 0/25/50/75/100% would put every tick except the dead center slightly
              outboard of where the thumb can actually sit, worse the further from center.
              The first/last stops still sit close to the track's edges, so those two labels
              stay left/right-aligned rather than centered, or they'd run off the side. */}
          <div style={{ position: "relative", height: 10, marginTop: 2 }}>
            {DEPTH_TIERS.slice(1).map((dt, i) => {
              const selected = depth === i + 1
              return (
                <div
                  key={dt.label}
                  style={{
                    position: "absolute", left: depthStopLeft(i, DEPTH_TIERS.length - 1),
                    transform: "translateX(-50%)",
                    width: 3, height: 10, borderRadius: 2,
                    background: selected ? dt.onDark : "rgba(255,255,255,0.35)",
                  }}
                />
              )
            })}
          </div>
          {/* All five centered directly under their notch — including the two end ones,
              which means their text can spill past the slider's own left/right edge into
              the page's outer padding. There's room for it (the page has its own gutter,
              and nothing here clips overflow), and it reads better than the previous
              left/right-aligned edge labels, which kept the text on-screen but broke the
              "centered under the notch" rule those two were the exception to. */}
          <div style={{ position: "relative", height: 32, marginTop: 6 }}>
            {DEPTH_TIERS.slice(1).map((dt, i) => {
              const selected = depth === i + 1
              return (
                <div
                  key={dt.label}
                  onClick={() => setDepth(i + 1)}
                  style={{
                    position: "absolute", left: depthStopLeft(i, DEPTH_TIERS.length - 1),
                    transform: "translateX(-50%)",
                    textAlign: "center", cursor: "pointer", whiteSpace: "nowrap",
                    fontSize: 12, lineHeight: 1.3, fontWeight: selected ? 900 : 700,
                    color: selected ? dt.onDark : "rgba(255,255,255,0.6)",
                  }}
                >
                  {dt.label.split(" ").map((w, j) => <div key={j}>{w}</div>)}
                </div>
              )
            })}
          </div>
        </div>
        {chrome(
          <FooterButton
            onClick={submitQuestion}
            disabled={!question.trim() || !hint.trim() || submitting}
            nudge={nudgeSubmit}
            bg={ACCENT}
            textColor={ACCENT_TEXT}
          >
            Lock it in
          </FooterButton>
        )}
      </>
    )
  }

  // ── ASSIGN ───────────────────────────────────────────────────────────────
  if (phase === "assign") {
    // Roundrect, no stroke — matches Typecast's wordCard exactly rather than the
    // bordered/flat-cornered chip this used to be.
    const chip = (authorId, source, slotIndex) => {
      const author = playerById(authorId)
      const t = tier(author?.depth)
      return (
        <div
          onPointerDown={(e) => startDrag(e, authorId, source, slotIndex)}
          style={{
            background: t.bg, color: t.text, borderRadius: 10,
            padding: "10px 14px", fontSize: 15, fontWeight: 800, maxWidth: 160,
            textAlign: "center", lineHeight: 1.25, wordBreak: "break-word",
            cursor: "grab", touchAction: "none",
            opacity: dragValue === authorId ? 0.35 : 1,
          }}
        >
          {author?.hint ?? "…"}
        </div>
      )
    }

    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: "#fff", paddingTop: 24, paddingLeft: 20, paddingRight: 20, paddingBottom: BOTTOM_PAD }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Who gets which question?</h1>
          <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 16, lineHeight: 1.45 }}>
            Drag a hint onto each player. Nobody can get their own.
          </p>

          {showChangedBanner && (
            <div style={{ background: ACCENT, color: ACCENT_TEXT, padding: "12px 14px", fontSize: 14, fontWeight: 800, marginBottom: 14, animation: "obBannerIn 220ms ease-out both" }}>
              The board changed — take another look.
            </div>
          )}

          {/* Chip tray */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", minHeight: 48, marginBottom: 18 }}>
            {pool.map((id) => (
              <div key={id} style={{ touchAction: "none" }}>{chip(id, "pool", null)}</div>
            ))}
            {pool.length === 0 && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", alignSelf: "center" }}>
                Every question is placed
              </div>
            )}
          </div>

          {/* Slots — 2-column grid, name above its own dropzone, matching Typecast's slot
              cell shape exactly (data-ob-slot-hit is the whole cell's hit-test target for
              drop; data-ob-slot is just the inner dropzone, whose rect anchors the swap
              animation to the actual chip position, not the cell's). */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {slotOrder.map((pid, i) => {
              const p = playerById(pid)
              return (
                <div key={pid} data-ob-slot-hit={i} style={{ background: MID, padding: "10px 10px", touchAction: "none" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8 }}>
                    {p?.name ?? "?"}
                  </div>
                  <div
                    data-ob-slot={i}
                    style={{
                      minHeight: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 6, touchAction: "none",
                      // An empty slot is a drop target, so its outline is a real affordance
                      // rather than decoration — it needs to be visible against MID.
                      border: slots[i] == null ? `2px dashed ${WL}` : "2px solid transparent",
                    }}
                  >
                    {slots[i] != null && !hidingSlots.has(i) && chip(slots[i], "slot", i)}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 26 }}>
            <WaitingList
              players={players.map((p) => ({ name: p.name, done: !!p.ready }))}
              myName={me.name}
              colors={{ mid: MID }}
            />
          </div>
        </div>

        {/* Chips mid-swap — either from this client's own drag-onto-an-occupied-slot, or a
            remote swap detected in the incoming-board sync effect. */}
        {swapAnim?.map((s, i) => {
          const author = playerById(s.authorId)
          const t = tier(author?.depth)
          return <SwapCard key={i} hint={author?.hint ?? "…"} bg={t.bg} text={t.text} {...s} />
        })}

        {/* Drag ghost — definite `width` (not `maxWidth`) is load-bearing: this box has no
            flex/grid parent to size it (it's position:fixed, out of flow), so an auto-width
            box with wordBreak shrink-to-fits unpredictably, which is exactly what "the pill
            changes size while dragging" looked like. The width itself is `dragWidth`,
            measured off the real chip in startDrag — a stable width, but the chip's OWN
            content-appropriate one, not an arbitrary constant that makes short hints balloon. */}
        {dragValue && dragPos && (
          <div style={{ position: "fixed", left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 200, opacity: 0.95 }}>
            {(() => {
              const author = playerById(dragValue)
              const t = tier(author?.depth)
              return (
                <div style={{ background: t.bg, color: t.text, borderRadius: 10, padding: "10px 14px", fontSize: 15, fontWeight: 800, width: dragWidth ?? 160, textAlign: "center", lineHeight: 1.25, wordBreak: "break-word", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                  {author?.hint ?? "…"}
                </div>
              )
            })()}
          </div>
        )}

        {/* Two nested elements on purpose: obShake animates `transform`, which would
            otherwise clobber the translateX(-50%) doing the centering and fling the
            toast off to the right. Outer centers, inner shakes. */}
        {toast && (
          <div style={{ position: "fixed", left: 0, right: 0, bottom: FOOTER_H + 24, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 210 }}>
            <div style={{ background: DANGER, color: "#fff", fontSize: 14, fontWeight: 800, padding: "12px 18px", animation: "obShake 260ms ease-out both", maxWidth: "80vw", textAlign: "center" }}>
              {toast}
            </div>
          </div>
        )}

        {chrome(
          <button
            onClick={toggleReady}
            disabled={!boardFilled && !me.ready}
            style={{
              flex: 1, background: me.ready ? WL : ACCENT, color: me.ready ? "#fff" : ACCENT_TEXT,
              fontSize: 16, fontWeight: 900,
            }}
          >
            {me.ready ? `Ready ✓ (${readyCount}/${players.length})` : boardFilled ? `Ready (${readyCount}/${players.length})` : "Fill every slot first"}
          </button>
        )}
      </>
    )
  }

  // ── ANSWER ───────────────────────────────────────────────────────────────
  if (phase === "answer") {
    let lastDepth = null
    // Bucket the floats once per render rather than filtering the whole array inside
    // each of the 6×N emoji buttons — this render runs on every press in the room.
    const floatsByKey = new Map()
    for (const f of floats) {
      const k = reactionKey(f.target, f.emoji)
      const arr = floatsByKey.get(k)
      if (arr) arr.push(f)
      else floatsByKey.set(k, [f])
    }
    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: "#fff", paddingTop: 24, paddingLeft: 20, paddingRight: 20, paddingBottom: BOTTOM_PAD }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Answer up</h1>
          <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 22, lineHeight: 1.45 }}>
            Go around the room, shallow to deep. React as much as you want.
          </p>

          {answerOrder.map((entry, idx) => {
            const answerer = playerById(entry.answerer_id)
            const author = playerById(entry.author_id)
            const d = author?.depth ?? 2
            const t = tier(d)
            const showHeader = d !== lastDepth
            lastDepth = d
            const mine = entry.answerer_id === myPlayerId

            return (
              <div key={idx}>
                {showHeader && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: idx === 0 ? "0 0 12px" : "30px 0 12px" }}>
                    <span style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, fontSize: 13, fontWeight: 900, padding: "6px 10px" }}>
                      {t.label}
                    </span>
                    <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                  </div>
                )}

                <div style={{ background: MID, borderLeft: `5px solid ${t.onDark}`, padding: "18px 18px 10px", marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: t.onDark, marginBottom: 8, letterSpacing: "0.02em" }}>
                    {answerer?.name ?? "?"}{mine && <span style={{ opacity: 0.75, fontWeight: 700 }}> · you</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.35, marginBottom: 14 }}>
                    {author?.question ?? "…"}
                  </div>

                  {/* No background box on these — they're plain emoji, not boxed buttons,
                      and no running count is shown here (only at Game Over): the floating
                      presses and each other's live reactions are the feedback in the
                      moment, not a number tally competing for attention mid-answer. */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {REACTIONS.map((emoji) => {
                      return (
                        <button
                          key={emoji}
                          onClick={() => react(entry.answerer_id, emoji)}
                          style={{
                            position: "relative", background: "transparent", border: "none",
                            padding: "6px 8px", fontSize: 28, lineHeight: 1,
                            display: "flex", alignItems: "center", overflow: "visible",
                          }}
                        >
                          <span>{emoji}</span>
                          {/* Floating presses — everyone's, not just this device's */}
                          {(floatsByKey.get(reactionKey(entry.answerer_id, emoji)) ?? []).map((f) => (
                            <span
                              key={f.id}
                              style={{
                                position: "absolute", left: `calc(50% + ${f.dx}px)`, bottom: "100%",
                                fontSize: 26, pointerEvents: "none",
                                animation: `obFloatUp ${FLOAT_LIFE_MS}ms ease-out ${f.delay}ms both`,
                              }}
                            >
                              {f.emoji}
                            </span>
                          ))}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          <button
            onClick={() => setConfirmEnd(1)}
            style={{ background: WL, color: "#fff", fontSize: 16, fontWeight: 800, padding: "16px", width: "100%", marginTop: 30 }}
          >
            End Game
          </button>
        </div>

        {confirmEnd === 1 && (
          <div onClick={() => setConfirmEnd(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 300 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: DARK, width: "100%", maxWidth: 400, padding: "24px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 10 }}>End the game?</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, marginBottom: 18 }}>
                This ends it for everyone and shows the final reactions.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmEnd(null)} style={{ flex: 1, background: WL, color: "#fff", fontSize: 15, fontWeight: 800, padding: "14px" }}>Cancel</button>
                <button onClick={() => setConfirmEnd(2)} style={{ flex: 2, background: WL, color: "#fff", fontSize: 15, fontWeight: 900, padding: "14px" }}>Continue</button>
              </div>
            </div>
          </div>
        )}

        {confirmEnd === 2 && (
          <div onClick={() => setConfirmEnd(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 300 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#2A0C0C", border: "1.5px solid #8B2222", width: "100%", maxWidth: 400, padding: "24px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 10 }}>Are you sure?</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, marginBottom: 18 }}>
                Has everyone answered? This can&apos;t be undone.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmEnd(null)} style={{ flex: 1, background: WL, color: "#fff", fontSize: 15, fontWeight: 800, padding: "14px" }}>Cancel</button>
                <button onClick={() => { setConfirmEnd(null); endGame() }} style={{ flex: 2, background: "#B03030", color: "#fff", fontSize: 15, fontWeight: 900, padding: "14px" }}>Yes, end game</button>
              </div>
            </div>
          </div>
        )}

        {chrome()}
      </>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────────────────────
  const resultCards = (
    <div style={{ marginTop: 8 }}>
      {answerOrder.map((entry, idx) => {
        const answerer = playerById(entry.answerer_id)
        const author = playerById(entry.author_id)
        const t = tier(author?.depth)
        const tallies = REACTIONS
          .map((emoji) => ({ emoji, n: countFor(entry.answerer_id, emoji) }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)

        return (
          <div key={idx} style={{ background: MID, borderLeft: `5px solid ${t.onDark}`, padding: "16px 18px", marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.onDark, marginBottom: 4 }}>{answerer?.name ?? "?"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, marginBottom: tallies.length ? 12 : 0 }}>
              {author?.question ?? "…"}
            </div>
            {tallies.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {/* Every tally on a card shares that question's own depth-tier color —
                    same pairing already used for the card's left accent and name, so the
                    whole card reads as one depth-coded unit instead of one reaction
                    arbitrarily standing out from the rest. */}
                {tallies.map(({ emoji, n }) => (
                  <div
                    key={emoji}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, borderRadius: 999,
                      background: t.bg, color: t.text, padding: "6px 12px",
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
                    <span style={{ fontSize: 15, fontWeight: 900 }}>×{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: BG, color: "#fff" }}>
      <EndGame
        players={[]}
        myPlayerId={myPlayerId}
        onPlayAgain={playAgain}
        bottomPad={BOTTOM_PAD}
        colors={{ yellow: ACCENT, wl: WL }}
        // The results are the whole payoff of the game, so they go above the buttons —
        // belowButtons would bury them under Play Again.
        aboveScores={
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>How it landed</div>
            {resultCards}
          </div>
        }
      />
    </div>
  )
}
