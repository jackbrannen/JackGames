"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import WaitingList from "../../../components/WaitingList"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"
import { RULES } from "../../../lib/rules"

const BG = "#E8553A"
const INK = "#2A2D34"
const INK_MUTED = "rgba(42,45,52,0.6)"
const DARK = "#B83A22"
const PANEL = "#FFF1EA"
const WARM = "#FBD7CC"
const BTN = "#2A2D34"
const BTN_TEXT = "#FFF1EA"
const GREEN = "#1F8A4C"
const POKE_COLORS = { dark: DARK, mid: "#A33420", wl: "#8E2D1B", yellow: "#F0C808", notifBg: "#5C1E10" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const cap = w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

function SwapCard({ word, fromX, fromY, toX, toY }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = "none"
    el.style.transform = `translate(${fromX}px, ${fromY}px)`
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)"
      el.style.transform = `translate(${toX}px, ${toY}px)`
    })
  }, [])
  return (
    <div ref={ref} style={{ position: "fixed", top: 0, left: 0, zIndex: 320, pointerEvents: "none",
      background: INK, color: BTN_TEXT, padding: "10px 16px", borderRadius: 10, fontSize: 16, fontWeight: 800,
      whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.35)", willChange: "transform" }}>
      {cap(word)}
    </div>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [matchups, setMatchups] = useState([])
  const [customTargets, setCustomTargets] = useState([])
  const [newTargetName, setNewTargetName] = useState("")
  const [addingTarget, setAddingTarget] = useState(false)
  const [showRosterConfirm, setShowRosterConfirm] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [pokes, setPokes] = useState([])
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isIdle = useIdleGate()
  const [dragValue, setDragValue] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const [swapAnim, setSwapAnim] = useState(null)
  const [hidingSlots, setHidingSlots] = useState(() => new Set())
  const [pokeCooldown, setPokeCooldown] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)
  const slotsRef = useRef(slots)
  const dragRef = useRef(null)
  const dropFnRef = useRef(null)
  useEffect(() => { slotsRef.current = slots }, [slots])

  const me = players.find(p => p.id === myPlayerId)
  const g = game
  const phase = g?.phase
  const order = g?.order_ids ?? []
  const guessIndex = g?.guess_index ?? 0
  const totalRounds = order.length
  const pendingFromDb = g?.pending ?? null

  const myMatchup = matchups.find(m => m.matcher_id === myPlayerId)
  const currentMatcherId = order[guessIndex]
  const currentMatchup = matchups.find(m => m.matcher_id === currentMatcherId)
  const currentMatcher = players.find(p => p.id === currentMatcherId)
  const isCurrentMatcher = currentMatcherId === myPlayerId
  const mySubmitted = !!myMatchup?.submitted

  const activeMatchup = phase === "assign" ? myMatchup : currentMatchup
  const slotIds = activeMatchup?.slot_ids ?? []
  const N = slotIds.length
  const targetById = id => players.find(p => p.id === id) ?? customTargets.find(c => c.id === id)
  const slotPlayers = slotIds.map(id => targetById(id))
  const poolWords = phase === "assign" ? (myMatchup?.words ?? []) : (currentMatchup?.used_words ?? [])
  const matcherKey = currentMatchup?.key ?? []

  const canEditAssign = phase === "assign" && !!myMatchup && !mySubmitted
  const canEditGuess = phase === "guess" && !isCurrentMatcher
  const interactive = canEditAssign || canEditGuess
  const synced = canEditGuess

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gm }, { data: ps }, { data: ms }, { data: cts }] = await Promise.all([
      supabase.from("tc_games").select("*").eq("code", code).single(),
      supabase.from("tc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("tc_matchups").select("*").eq("game_code", code),
      supabase.from("tc_custom_targets").select("*").eq("game_code", code).order("created_at"),
    ])
    if (seq !== loadSeqRef.current) return
    if (!gm) { router.replace(`/${code}`); return }
    if (gm.replay_code) { router.replace(`/${gm.replay_code}`); return }
    if (gm.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(gm); setPlayers(ps ?? []); setMatchups(ms ?? []); setCustomTargets(cts ?? []); setLoading(false)
    // Gossip: re-broadcast on a state change so peers that missed the realtime
    // push catch up in a round-trip instead of on the poll.
    const key = `${gm.phase}:${gm.guess_index}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  async function loadPokes() {
    const { data } = await supabase.from("pokes").select("*").eq("room_code", code).order("created_at", { ascending: false }).limit(10)
    if (data) setPokes(data)
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  // tc_games changes on every drag while the shared board is being built
  // (the pending live-cursor column), far more often than real state
  // changes. Applying the row straight from the realtime payload — which
  // always carries the complete new row — instead of triggering a full
  // loadState() avoids a 3-table refetch fanned out to every connected
  // client on every single drag.
  const gamesSyncKeyRef = useRef(null)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(newRow)
    const key = `${newRow.phase}:${newRow.guess_index}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) nudge()
    gamesSyncKeyRef.current = key
  }

  // Same idea for tc_players/tc_matchups: apply the changed row directly
  // from the realtime payload instead of a full loadState() refetch. Each
  // change independently reaches every subscribed client already, so
  // there's no need to also nudge — nudge() exists for cases where a
  // client's own realtime might be lagging, which doesn't apply to the
  // client that just received this exact event.
  function applyRowChange(setList) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload
      if (eventType === "DELETE") {
        setList(prev => prev.filter(r => r.id !== oldRow?.id))
        return
      }
      if (!newRow) return
      setList(prev => {
        const idx = prev.findIndex(r => r.id === newRow.id)
        return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
      })
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(`typecast:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    if (isIdle) return
    loadState(); loadPokes()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let ch = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      ch = supabase.channel(`typecast-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tc_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "tc_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "tc_matchups", filter: `game_code=eq.${code}` }, applyRowChange(setMatchups))
        .on("postgres_changes", { event: "*", schema: "public", table: "tc_custom_targets", filter: `game_code=eq.${code}` }, applyRowChange(setCustomTargets))
        .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState(); loadPokes()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            // A dropped websocket otherwise leaves this client stuck until the 60s poll fires.
            // Recreate the channel instead of waiting on it, backing off if it keeps failing
            // so a persistent outage doesn't turn into a reconnect storm across many clients.
            if (reconnectTimer) return
            const delay = Math.min(2000 * 2 ** reconnectAttempt, 30000)
            reconnectAttempt++
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              if (cancelled) return
              supabase.removeChannel(ch)
              connect()
            }, delay)
          }
        })
      channelRef.current = ch
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(ch)
    }
  }, [code, isIdle])

  // Reset the local board whenever the active board changes (phase / which matcher / size).
  const boardKey = `${phase}|${guessIndex}|${N}`
  useEffect(() => {
    setSlots(Array(N).fill(null))
    setSubmitting(false)
  }, [boardKey])

  // Guess phase: the board is the shared `pending`; sync it in and replay swaps.
  useEffect(() => {
    if (phase !== "guess") return
    if (dragRef.current) return
    if (!Array.isArray(pendingFromDb)) return
    const next = pendingFromDb.map(w => (w ? w : null))
    const prev = slotsRef.current
    if (arrEq(prev, next)) return
    const changed = next.map((_, i) => i).filter(i => prev[i] !== next[i])
    if (changed.length === 2) {
      const [a, b] = changed
      if (prev[a] != null && prev[b] != null && prev[a] === next[b] && prev[b] === next[a]) animateSwapSlots(a, b, prev[a], prev[b])
    }
    setSlots(next)
  }, [JSON.stringify(pendingFromDb), phase])

  useEffect(() => {
    function onMove(e) { if (!dragRef.current) return; const pt = e.touches?.[0] ?? e; setDragPos({ x: pt.clientX, y: pt.clientY }) }
    function onUp(e) {
      if (!dragRef.current) return
      const pt = e.changedTouches?.[0] ?? e
      dropFnRef.current?.(pt.clientX, pt.clientY)
      dragRef.current = null; setDragValue(null); setDragPos(null)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp) }
  }, [])

  // Queued onto persistQueueRef so rapid successive drags can't have their
  // writes land out of order (an older write resolving after a newer one
  // would otherwise silently revert the newer arrangement).
  const persistQueueRef = useRef(Promise.resolve())
  function persist(next) {
    setSlots(next)
    if (synced) {
      // No nudge() here: this fires on every drag, and the write already
      // propagates cheaply via the payload-patched postgres_changes handler.
      // A broadcast nudge would still force every peer through the full
      // loadState() reload the broadcast handler falls back to.
      persistQueueRef.current = persistQueueRef.current.then(() =>
        supabase.rpc("tc_set_pending", { p_code: code, p_pending: next.map(x => x ?? "") })
      )
    }
  }
  function startDrag(e, value, source, slotIndex) {
    if (!interactive) return
    e.preventDefault()
    const pt = e.touches?.[0] ?? e
    dragRef.current = { value, source, slotIndex }
    setDragValue(value); setDragPos({ x: pt.clientX, y: pt.clientY })
    if (source === "slot") { const next = [...slotsRef.current]; next[slotIndex] = null; setSlots(next) }
  }
  function animateSwap(draggedValue, srcIndex, displacedValue, targetIndex, dropX, dropY) {
    const srcRect = document.querySelector(`[data-tc-slot="${srcIndex}"]`)?.getBoundingClientRect()
    const tgtRect = document.querySelector(`[data-tc-slot="${targetIndex}"]`)?.getBoundingClientRect()
    if (!srcRect || !tgtRect) return
    setHidingSlots(new Set([srcIndex, targetIndex]))
    setSwapAnim([
      { word: draggedValue, fromX: dropX - 30, fromY: dropY - 22, toX: tgtRect.left + 6, toY: tgtRect.top + 6 },
      { word: displacedValue, fromX: tgtRect.left + 6, fromY: tgtRect.top + 6, toX: srcRect.left + 6, toY: srcRect.top + 6 },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }
  function animateSwapSlots(indexA, indexB, valueA, valueB) {
    const rectA = document.querySelector(`[data-tc-slot="${indexA}"]`)?.getBoundingClientRect()
    const rectB = document.querySelector(`[data-tc-slot="${indexB}"]`)?.getBoundingClientRect()
    if (!rectA || !rectB) return
    setHidingSlots(new Set([indexA, indexB]))
    setSwapAnim([
      { word: valueA, fromX: rectA.left + 6, fromY: rectA.top + 6, toX: rectB.left + 6, toY: rectB.top + 6 },
      { word: valueB, fromX: rectB.left + 6, fromY: rectB.top + 6, toX: rectA.left + 6, toY: rectA.top + 6 },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }
  function handleDrop(x, y) {
    const drag = dragRef.current
    if (!drag) return
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest("[data-tc-slot]")
    const targetIndex = slotEl ? Number(slotEl.dataset.tcSlot) : null
    const cur = [...slotsRef.current]
    if (targetIndex != null) {
      const existing = cur[targetIndex]
      const slotSwap = drag.source === "slot" && existing != null && targetIndex !== drag.slotIndex
      if (drag.source === "slot") cur[drag.slotIndex] = existing ?? null
      cur[targetIndex] = drag.value
      if (slotSwap) animateSwap(drag.value, drag.slotIndex, existing, targetIndex, x, y)
    }
    persist(cur)
  }
  dropFnRef.current = handleDrop

  async function submitKey() {
    if (slots.some(s => s == null) || submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("tc_submit_key", { p_code: code, p_matcher_id: myPlayerId, p_key: slots })
    if (error) { alert(error.message); setSubmitting(false); throw error }
    nudge()
  }
  async function submitGuess() {
    setConfirming(false)
    const { error } = await supabase.rpc("tc_submit_guess", { p_code: code })
    if (error) { alert(error.message); return }
    nudge()
  }
  async function nextRound() {
    const { error } = await supabase.rpc("tc_next_round", { p_code: code })
    if (error) { alert(error.message); return }
    nudge()
  }
  async function sendPoke(targetName) {
    if (!me || pokeCooldown) return
    setPokeCooldown(true); setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldown(false), 10000)
  }

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (loading || !g) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(255,241,234,0.85)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ color: "#FFF1EA", fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: "#fff", textDecoration: "underline" }}>Back to lobby</a></div>
    </div>
  }

  const pool = poolWords.filter(w => !slots.includes(w) && w !== dragValue)
  // In the guess phase the button gates on the SHARED board (`pending`, i.e. exactly what
  // gets scored) — never on local slots, which briefly carry stale-full values across a
  // phase/round change and would otherwise flash the button enabled on an empty board.
  const allPlaced = phase === "guess"
    ? Array.isArray(pendingFromDb) && pendingFromDb.length === N && N > 0 && pendingFromDb.every(w => w != null && w !== "")
    : slots.length === N && N > 0 && slots.every(s => s != null)
  const matcherName = currentMatcher?.name ?? "Someone"

  function wordCard(word, source, slotIndex) {
    return (
      <div
        onPointerDown={interactive ? e => startDrag(e, word, source, slotIndex) : undefined}
        style={{ background: INK, color: BTN_TEXT, padding: "10px 16px", borderRadius: 10, fontSize: 16, fontWeight: 800,
          whiteSpace: "nowrap", cursor: interactive ? "grab" : "default", touchAction: "none",
          opacity: dragValue === word ? 0.35 : 1 }}>
        {cap(word)}
      </div>
    )
  }

  function board() {
    // Show the unplaced-words pool to anyone actively placing, and also to the
    // Matcher watching their own board get guessed.
    const showPool = interactive || phase === "guess"
    return (
      <div>
        {showPool && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", minHeight: 44, marginBottom: 16 }}>
            {pool.map(w => (
              <div key={w} data-tc-pool={w} style={{ touchAction: "none" }}>{wordCard(w, "pool", null)}</div>
            ))}
            {pool.length === 0 && <div style={{ fontSize: 13, color: "rgba(255,241,234,0.85)", fontWeight: 600, alignSelf: "center" }}>All words placed</div>}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {slotPlayers.map((p, i) => (
            <div key={i} style={{ background: PANEL, padding: "10px 10px" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: INK, textAlign: "center", marginBottom: 8 }}>
                {p?.name ?? "?"}{p?.id === myPlayerId && <span style={{ opacity: 0.5, fontWeight: 600 }}> (you)</span>}
              </div>
              <div data-tc-slot={i}
                style={{ minHeight: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 6, touchAction: "none",
                  border: slots[i] == null ? "2px dashed rgba(42,45,52,0.3)" : "2px solid transparent" }}>
                {slots[i] != null && !hidingSlots.has(i) && wordCard(slots[i], "slot", i)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function pokeSystem(footer = null) {
    return (
      <>
        <Notifications supabase={supabase} pokes={pokes} roomCode={code} currentPlayer={me.name} colors={POKE_COLORS} />
        <Menu
          supabase={supabase} colors={POKE_COLORS} isOpen={menuOpen} onClose={() => setMenuOpen(false)}
          roomCode={code} currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
          gamePhase={g.phase} rules={RULES}
          onResetToLobby={async () => { await supabase.rpc("tc_reset_to_lobby", { p_code: code }); nudge() }}
        />
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>{footer}</Footer>
      </>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────
  if (phase === "finished") {
    const maxPer = matchups[0]?.slot_ids?.length ?? 0
    const max = totalRounds * maxPer
    const pct = max ? g.score / max : 0
    const rating = pct >= 0.85 ? "Telepathic." : pct >= 0.6 ? "Seriously in sync." : pct >= 0.35 ? "Getting to know each other." : "Total strangers."
    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,241,234,0.85)", marginBottom: 12 }}>Final score</div>
          <div style={{ fontSize: 64, fontWeight: 900, color: "#FFF1EA", lineHeight: 1 }}>{g.score}<span style={{ fontSize: 28, opacity: 0.7 }}> / {max}</span></div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#FFF1EA", marginTop: 16 }}>{rating}</div>
          <button onClick={async () => {
            if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
            const { data, error } = await supabase.rpc("tc_create_replay", { p_code: code })
            if (error) { alert(error.message); return }
            nudge()
            router.replace(`/${data}`)
          }}
            style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", marginTop: 28, maxWidth: 320, width: "100%" }}>Play Again</button>
          <a href="https://games.jackbrannen.com" style={{ display: "block", background: PANEL, color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", marginTop: 10 }}>Play Another Game</a>
        </div>
        {pokeSystem()}
      </>
    )
  }

  // ── ROSTER ────────────────────────────────────────────────
  if (phase === "roster") {
    async function addCustomTarget() {
      const trimmed = newTargetName.trim()
      if (!trimmed || addingTarget) return
      setAddingTarget(true)
      const { error } = await supabase.from("tc_custom_targets").insert({ game_code: code, name: trimmed })
      setAddingTarget(false)
      if (error) { alert(error.message); return }
      setNewTargetName("")
      nudge()
    }
    async function removeCustomTarget(id) {
      await supabase.from("tc_custom_targets").delete().eq("id", id)
      nudge()
    }
    async function lockRoster() {
      const { error } = await supabase.rpc("tc_lock_roster", { p_code: code })
      if (error) { alert(error.message); throw error }
      setShowRosterConfirm(false)
      nudge()
    }
    const totalTargets = players.length + customTargets.length
    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
          <div style={{ background: DARK, padding: "24px 20px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Typecast</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "white", lineHeight: 1.2 }}>Who gets words this game?</h2>
          </div>
          <div style={{ padding: "16px 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,241,234,0.9)" }}>
            Everyone here gets words assigned to them. Add anyone else — an absent friend, a fictional character — to pad out a small group.
          </div>
          <div style={{ padding: "0 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#FFF1EA", marginBottom: 10 }}>Players</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              {players.map(p => (
                <div key={p.id} style={{ background: PANEL, padding: "12px 14px" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>
                    {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#FFF1EA", marginBottom: 10 }}>Other names</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {customTargets.length === 0 && <div style={{ fontSize: 14, color: "rgba(255,241,234,0.8)", fontStyle: "italic" }}>None added</div>}
              {customTargets.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: WARM, padding: "12px 14px" }}>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>{c.name}</span>
                  <button onClick={() => removeCustomTarget(c.id)} aria-label={`Remove ${c.name}`}
                    style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input value={newTargetName} onChange={e => setNewTargetName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomTarget()}
                placeholder="Add a name" maxLength={40}
                style={{ flex: 1, background: WARM, color: INK, fontSize: 16, padding: "14px 16px", border: "none", outline: "none", boxSizing: "border-box" }} />
              <button onClick={addCustomTarget} disabled={!newTargetName.trim() || addingTarget} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "0 20px" }}>Add</button>
            </div>
          </div>
        </div>

        {pokeSystem(
          <FooterButton onClick={async () => { setShowRosterConfirm(true); throw new Error("modal") }} bg={BTN} textColor={BTN_TEXT}>
            {`Confirm & start (${totalTargets} ${totalTargets === 1 ? "target" : "targets"})`}
          </FooterButton>
        )}

        {showRosterConfirm && (
          <div onClick={() => setShowRosterConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginBottom: 8 }}>Lock in this list?</div>
              <p style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 20 }}>
                {totalTargets} {totalTargets === 1 ? "name" : "names"} will get words assigned to them this game. No one can add or remove names after this.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowRosterConfirm(false)} style={{ flex: 1, background: WARM, color: INK, fontSize: 16, fontWeight: 800, padding: "16px" }}>Back</button>
                <FooterButton onClick={lockRoster} bg={BTN} textColor={BTN_TEXT} style={{ flex: 2, padding: "16px" }}>Start</FooterButton>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  const doneCount = matchups.filter(m => m.submitted).length

  return (
    <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        <div style={{ background: DARK, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>
            {phase === "assign" ? "Casting" : `Guess ${guessIndex + 1} of ${totalRounds}`}
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "white" }}>Score {g.score}</div>
        </div>

        <div style={{ background: WARM, color: INK, textAlign: "center", padding: "12px", fontSize: 16, fontWeight: 800 }}>
          {phase === "assign" && (canEditAssign ? "Cast a word onto each player — leave the extras out" : "Words cast — waiting for everyone")}
          {phase === "guess" && (isCurrentMatcher ? "Your words — watch the group guess" : `Match the words the way ${matcherName} did`)}
          {phase === "reveal" && `${matcherName}'s picks vs. the group`}
        </div>

        <div style={{ padding: "16px" }}>
          {phase === "assign" && (canEditAssign
            ? board()
            : (
              <div style={{ color: "#FFF1EA" }}>
                <WaitingList
                  players={players.map(p => ({ name: p.name, done: !!matchups.find(m => m.matcher_id === p.id)?.submitted }))}
                  myName={me.name} onPoke={sendPoke} cooldownActive={pokeCooldown} pokeJustSent={pokeJustSent}
                />
              </div>
            )
          )}

          {phase === "guess" && board()}

          {phase === "reveal" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {slotPlayers.map((p, i) => {
                  const correct = matcherKey[i] && matcherKey[i] === pendingFromDb?.[i]
                  return (
                    <div key={i} style={{ background: PANEL, padding: "10px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 6 }}>{p?.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: correct ? GREEN : INK }}>{cap(matcherKey[i])} {correct ? "✓" : "✗"}</div>
                      {!correct && <div style={{ fontSize: 12, fontWeight: 600, color: INK_MUTED, marginTop: 2 }}>guessed {cap(pendingFromDb?.[i]) || "—"}</div>}
                    </div>
                  )
                })}
              </div>
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 16, fontWeight: 800, color: "#FFF1EA" }}>
                The group matched {g.last_correct} of {N}.
              </div>
            </div>
          )}
        </div>
      </div>

      {pokeSystem(
        canEditAssign ? (
          <FooterButton key="assign" onClick={submitKey} disabled={!allPlaced || submitting} bg={BTN} textColor={BTN_TEXT}>
            {allPlaced ? "Submit your casting" : "Place a word on each player"}
          </FooterButton>
        ) : canEditGuess ? (
          <FooterButton key={`guess-${guessIndex}`} onClick={() => { setConfirming(true); throw new Error("modal") }} disabled={!allPlaced} bg={BTN} textColor={BTN_TEXT}>
            {allPlaced ? "Lock in the group's guess" : "Place every word"}
          </FooterButton>
        ) : phase === "reveal" ? (
          <FooterButton key={`reveal-${guessIndex}`} onClick={nextRound} bg={BTN} textColor={BTN_TEXT}>
            {guessIndex + 1 >= totalRounds ? "See final score →" : "Next →"}
          </FooterButton>
        ) : null
      )}

      {dragValue != null && dragPos && (
        <div style={{ position: "fixed", left: dragPos.x - 30, top: dragPos.y - 22, zIndex: 300, pointerEvents: "none",
          background: INK, color: BTN_TEXT, padding: "10px 16px", borderRadius: 10, fontSize: 16, fontWeight: 800,
          whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(0,0,0,0.3)" }}>{cap(dragValue)}</div>
      )}
      {swapAnim?.map((s, i) => <SwapCard key={i} {...s} />)}

      {confirming && (
        <div onClick={() => setConfirming(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginBottom: 8 }}>Lock in the group's guess?</div>
            <p style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 20 }}>This scores the round against {matcherName}'s picks.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirming(false)} style={{ flex: 1, background: WARM, color: INK, fontSize: 16, fontWeight: 800, padding: "16px" }}>Back</button>
              <button onClick={submitGuess} style={{ flex: 2, background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px" }}>Lock in</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
