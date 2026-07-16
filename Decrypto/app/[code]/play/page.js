"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Notifications from "../../../components/Notifications"
import Menu from "../../../components/Menu"

const RULES = [
  ["Goal", "Land 2 Interceptions to win. Rack up 2 Miscommunications and you lose. If nobody's decided after 8 rounds, most Interceptions wins."],
  ["Keywords", "Each team has four secret keywords numbered 1-4, visible only to your team."],
  ["Clueing", "Each round one teammate is the Encryptor. They get a secret 3-digit code (three different digits from 1-4) and give one clue per digit, hinting at the keyword in that position."],
  ["Decoding", "Your team decodes your own Encryptor's code — guess wrong and you take a Miscommunication. The Encryptor sits this out. From round 3 on, the other team tries to intercept using every clue you've given so far."],
]

const BG = "#B7DAEE"
const INK = "#15314A"
const WL = "#6FA8CE"
const ACCENT = "#FFC857"
const BOYS = "#2F6DB4"
const GIRLS = "#CC5B86"
const PANEL = "rgba(255,255,255,0.55)"
const POKE_COLORS = { dark: INK, mid: "#2C5172", wl: WL, yellow: ACCENT, notifBg: INK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const teamColor = t => (t === "boys" ? BOYS : GIRLS)
const teamLabel = t => (t === "boys" ? "Boys" : "Girls")
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

// A number card that flies from one fixed position to another for the swap
// animation (set transform with no transition, then transition to the target on
// the next frame). Module-level so React never remounts it mid-flight.
function SwapCard({ value, fromX, fromY, toX, toY, color }) {
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
    <div ref={ref} style={{ position: "fixed", top: 0, left: 0, width: 56, height: 56, zIndex: 320, pointerEvents: "none",
      background: color, color: "white", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 28, fontWeight: 900, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", willChange: "transform" }}>
      {value}
    </div>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [guesses, setGuesses] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [pokes, setPokes] = useState([])
  const [loading, setLoading] = useState(true)

  const [clueDraft, setClueDraft] = useState(["", "", ""])
  const [slots, setSlots] = useState([null, null, null])
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragValue, setDragValue] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const [swapAnim, setSwapAnim] = useState(null)
  const [hidingSlots, setHidingSlots] = useState(() => new Set())
  const [hidingPool, setHidingPool] = useState(() => new Set())
  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)
  const slotsRef = useRef(slots)
  const dragRef = useRef(null)
  const dropFnRef = useRef(null)
  useEffect(() => { slotsRef.current = slots }, [slots])

  const me = players.find(p => p.id === myPlayerId)

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }, { data: rs }, { data: gs }] = await Promise.all([
      supabase.from("dc_games").select("*").eq("code", code).single(),
      supabase.from("dc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("dc_rounds").select("*").eq("game_code", code).order("turn_number"),
      supabase.from("dc_guesses").select("*").eq("game_code", code),
    ])
    if (seq !== loadSeqRef.current) return
    if (!g) { router.replace(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g); setPlayers(ps ?? []); setRounds(rs ?? []); setGuesses(gs ?? []); setLoading(false)
    // Gossip: re-broadcast on a state change so peers that missed the realtime push catch up fast.
    const key = `${g.phase}:${g.round_phase}:${g.turn_number}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  async function loadPokes() {
    const { data } = await supabase.from("pokes").select("*").eq("room_code", code).order("created_at", { ascending: false }).limit(10)
    if (data) setPokes(data)
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  useEffect(() => {
    const stored = localStorage.getItem(`decrypto:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState(); loadPokes()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let ch = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      ch = supabase.channel(`decrypto-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "dc_games", filter: `code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "dc_players", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "dc_rounds", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "dc_guesses", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
        .on("broadcast", { event: "sync" }, () => loadState())
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
  }, [code])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase, code, router])

  useEffect(() => {
    // In dummy games the encryptor's clue fields are pre-filled with the code
    // digits themselves (e.g. code 4-2-1 → clues "4", "2", "1") so a solo tester
    // can blow through rounds without inventing real clues.
    let prefill = ["", "", ""]
    if (game?.is_dummy && game?.round_phase === "clue" && Array.isArray(game?.current_code)) {
      const aTeam = game.active_team
      const ids = aTeam === "boys" ? game.boys_ids : game.girls_ids
      const idx = aTeam === "boys" ? game.boys_encryptor_idx : game.girls_encryptor_idx
      const encId = ids?.[(idx ?? 0) % (ids?.length || 1)]
      if (encId === myPlayerId) prefill = game.current_code.map(String)
    }
    setClueDraft(prefill); setSlots([null, null, null]); setSubmitting(false)
  }, [game?.turn_number, game?.round_phase, game?.is_dummy, myPlayerId])

  const myTeam = me?.team
  const pendingFromDb = game ? (myTeam === "boys" ? game.boys_pending_guess : game.girls_pending_guess) : null
  useEffect(() => {
    if (game?.round_phase !== "guess") return
    if (dragRef.current) return // don't clobber an in-progress drag with a remote update
    if (!Array.isArray(pendingFromDb)) return
    // Empty slots are stored as 0 in the DB; valid digits are 1-4, so treat 0 as empty.
    const next = [0, 1, 2].map(i => (pendingFromDb[i] ? pendingFromDb[i] : null))
    const prev = slotsRef.current
    if (arrEq(prev, next)) return
    // If a teammate swapped two cards, replay that swap animation here too.
    const changed = [0, 1, 2].filter(i => prev[i] !== next[i])
    if (changed.length === 2) {
      const [a, b] = changed
      if (prev[a] != null && prev[b] != null && prev[a] === next[b] && prev[b] === next[a]) {
        animateSwapSlots(a, b, prev[a], prev[b])
      }
    }
    setSlots(next)
  }, [JSON.stringify(pendingFromDb), game?.round_phase])

  // Global pointer listeners drive the drag-and-drop decode interface.
  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      const pt = e.touches?.[0] ?? e
      setDragPos({ x: pt.clientX, y: pt.clientY })
    }
    function onUp(e) {
      if (!dragRef.current) return
      const pt = e.changedTouches?.[0] ?? e
      // Call through a ref so we always use the latest handleDrop closure (with
      // current myTeam/code), not the stale one captured when this effect mounted.
      dropFnRef.current?.(pt.clientX, pt.clientY)
      dragRef.current = null
      setDragValue(null); setDragPos(null)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp) }
  }, [])

  if (loading || !game) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(21,49,74,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ color: INK, fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: BOYS }}>Back to lobby</a></div>
    </div>
  }

  const g = game
  const activeTeam = g.active_team
  const activeIds = activeTeam === "boys" ? g.boys_ids : g.girls_ids
  const activeIdx = activeTeam === "boys" ? g.boys_encryptor_idx : g.girls_encryptor_idx
  const encryptorId = activeIds?.[(activeIdx ?? 0) % (activeIds?.length || 1)]
  const amEncryptor = encryptorId === myPlayerId
  const encryptor = players.find(p => p.id === encryptorId)
  const myKeywords = (myTeam === "boys" ? g.boys_keywords : g.girls_keywords) || []
  const myTeamActive = myTeam === activeTeam
  const interceptAllowed = g.turn_number >= 3
  const isIntercept = !myTeamActive
  // The Encryptor gave the clues and knows the code, so they don't decode their own team's clues.
  // Active team (minus Encryptor) decodes; the other team intercepts (from round 3 on).
  const canGuess = isIntercept ? interceptAllowed : !amEncryptor
  const round = ((g.turn_number - 1) >> 1) + 1
  const currentRound = rounds.find(r => r.turn_number === g.turn_number)
  const myGuessRow = guesses.find(gg => gg.turn_number === g.turn_number && gg.team === myTeam)
  const tokens = { boys: { i: g.boys_intercepts, m: g.boys_miscomms }, girls: { i: g.girls_intercepts, m: g.girls_miscomms } }

  function header() {
    return (
      <div style={{ background: g.phase === "finished" ? INK : teamColor(activeTeam), color: "white", padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.9 }}>
          {g.phase === "finished" ? "Final" : `Round ${round}/8 · ${teamLabel(activeTeam)} clueing`}
        </div>
      </div>
    )
  }

  function tokenCircle(filled, color, glyph, key) {
    return (
      <div key={key} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${color}`,
        background: filled ? color : "transparent", color: "white", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 14, fontWeight: 900, lineHeight: 1 }}>
        {filled ? glyph : ""}
      </div>
    )
  }
  function tokenRows(t) {
    return [["Intercepts", "#1F8A4C", "✓", "i"], ["Misses", "#C0392B", "✕", "m"]].map(([label, color, glyph, key]) => {
      const earned = key === "i" ? tokens[t].i : tokens[t].m
      return (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: INK, opacity: 0.75, width: 70 }}>{label}</span>
          <div style={{ display: "flex", gap: 5 }}>
            {[0, 1].map(i => tokenCircle(earned > i, color, glyph, key + i))}
          </div>
        </div>
      )
    })
  }
  function tokenBar() {
    return (
      <div style={{ display: "flex", gap: 8, padding: "10px 16px" }}>
        {["boys", "girls"].map(t => (
          <div key={t} style={{ flex: 1, background: PANEL, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: teamColor(t), marginBottom: 2 }}>{teamLabel(t)}</div>
            {tokenRows(t)}
          </div>
        ))}
      </div>
    )
  }

  function keywordPanel() {
    // Your keywords are only useful on your own team's turn (clueing/decoding);
    // when you're intercepting the other team you work from their clues alone.
    if (!myTeam || !myTeamActive) return null
    return (
      <div style={{ margin: "0 16px 12px", background: PANEL, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: teamColor(myTeam), marginBottom: 8 }}>Your keywords</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {myKeywords.map((w, i) => {
            const inCode = amEncryptor && Array.isArray(g.current_code) && g.current_code.includes(i + 1)
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: inCode ? ACCENT : "rgba(255,255,255,0.5)" }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: INK, opacity: 0.55, width: 14 }}>{i + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{w}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function clueBoard() {
    // Only the team currently clueing is shown — the other team's clues stay
    // hidden until it's their turn again.
    const t = activeTeam
    const bySlot = { 1: [], 2: [], 3: [], 4: [] }
    rounds.filter(r => r.revealed && r.clue_team === t).forEach(r => {
      (r.code || []).forEach((slot, i) => {
        const clue = (r.clues || [])[i]
        if (slot >= 1 && slot <= 4 && clue) bySlot[slot].push(clue)
      })
    })
    const teamKeywords = t === myTeam ? myKeywords : null
    return (
      <div style={{ margin: "0 16px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: teamColor(t), opacity: 0.7, marginBottom: 8 }}>Clue history — {teamLabel(t)}</div>
        <div style={{ background: PANEL, padding: "8px 12px" }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{ padding: "7px 0", borderBottom: n < 4 ? "1px solid rgba(21,49,74,0.08)" : "none", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: INK, opacity: 0.6 }}>
                {n}{teamKeywords ? ` · ${teamKeywords[n - 1]}` : ""}
              </div>
              {bySlot[n].length === 0
                ? <div style={{ fontSize: 13, color: INK, opacity: 0.3 }}>—</div>
                : bySlot[n].map((c, j) => <div key={j} style={{ fontSize: 15, fontWeight: 700, color: INK }}>{c}</div>)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Queued onto persistQueueRef so rapid successive drags can't have their
  // writes land out of order (an older write resolving after a newer one
  // would otherwise silently revert the newer arrangement).
  const persistQueueRef = useRef(Promise.resolve())
  function writePending(next) {
    setSlots(next)
    persistQueueRef.current = persistQueueRef.current.then(() =>
      supabase.rpc("dc_set_pending_guess", { p_code: code, p_team: myTeam, p_guess: next.map(x => x ?? 0) }).then(nudge)
    )
  }
  function startDrag(e, value, source, slotIndex) {
    if (!canGuess || myGuessRow) return
    e.preventDefault()
    const pt = e.touches?.[0] ?? e
    dragRef.current = { value, source, slotIndex }
    setDragValue(value)
    setDragPos({ x: pt.clientX, y: pt.clientY })
    if (source === "slot") {
      const next = [...slotsRef.current]; next[slotIndex] = null; setSlots(next) // lift locally; persist on drop
    }
  }
  function animateSwap(draggedValue, srcIndex, displacedValue, targetIndex, dropX, dropY) {
    const srcRect = document.querySelector(`[data-dc-slot="${srcIndex}"]`)?.getBoundingClientRect()
    const tgtRect = document.querySelector(`[data-dc-slot="${targetIndex}"]`)?.getBoundingClientRect()
    if (!srcRect || !tgtRect) return
    setHidingSlots(new Set([srcIndex, targetIndex]))
    setSwapAnim([
      { value: draggedValue, fromX: dropX - 28, fromY: dropY - 28, toX: tgtRect.left, toY: tgtRect.top },
      { value: displacedValue, fromX: tgtRect.left, fromY: tgtRect.top, toX: srcRect.left, toY: srcRect.top },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }
  // Swap two occupied slots, both cards flying from their own slot to the other's.
  // Used when a teammate's swap arrives over the live sync (no local drop point).
  function animateSwapSlots(indexA, indexB, valueA, valueB) {
    const rectA = document.querySelector(`[data-dc-slot="${indexA}"]`)?.getBoundingClientRect()
    const rectB = document.querySelector(`[data-dc-slot="${indexB}"]`)?.getBoundingClientRect()
    if (!rectA || !rectB) return
    setHidingSlots(new Set([indexA, indexB]))
    setSwapAnim([
      { value: valueA, fromX: rectA.left, fromY: rectA.top, toX: rectB.left, toY: rectB.top },
      { value: valueB, fromX: rectB.left, fromY: rectB.top, toX: rectA.left, toY: rectA.top },
    ])
    setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()) }, 320)
  }
  // Pool card dropped onto an occupied slot: the dragged card flies into the slot
  // and the displaced card flies up to its spot in the pool. The pool reflows, so
  // we measure the displaced card's landing spot after the slots state re-renders.
  function animatePoolSwap(draggedValue, displacedValue, targetIndex, dropX, dropY) {
    const tgtRect = document.querySelector(`[data-dc-slot="${targetIndex}"]`)?.getBoundingClientRect()
    if (!tgtRect) return
    setHidingSlots(new Set([targetIndex]))
    setHidingPool(new Set([displacedValue]))
    requestAnimationFrame(() => {
      const poolRect = document.querySelector(`[data-dc-pool="${displacedValue}"]`)?.getBoundingClientRect()
      setSwapAnim([
        { value: draggedValue, fromX: dropX - 28, fromY: dropY - 28, toX: tgtRect.left, toY: tgtRect.top },
        { value: displacedValue, fromX: tgtRect.left, fromY: tgtRect.top, toX: poolRect?.left ?? tgtRect.left, toY: poolRect?.top ?? tgtRect.top },
      ])
      setTimeout(() => { setSwapAnim(null); setHidingSlots(new Set()); setHidingPool(new Set()) }, 320)
    })
  }
  function handleDrop(x, y) {
    const drag = dragRef.current
    if (!drag) return
    const el = document.elementFromPoint(x, y)
    const slotEl = el?.closest("[data-dc-slot]")
    const targetIndex = slotEl ? Number(slotEl.dataset.dcSlot) : null
    const cur = [...slotsRef.current]
    if (targetIndex != null) {
      const existing = cur[targetIndex]
      // Slot → occupied slot and pool → occupied slot are both swaps (two cards move).
      const slotSwap = drag.source === "slot" && existing != null && targetIndex !== drag.slotIndex
      const poolSwap = drag.source === "pool" && existing != null
      if (drag.source === "slot") cur[drag.slotIndex] = existing ?? null
      cur[targetIndex] = drag.value
      if (slotSwap) animateSwap(drag.value, drag.slotIndex, existing, targetIndex, x, y)
      else if (poolSwap) animatePoolSwap(drag.value, existing, targetIndex, x, y)
    }
    // Dropped outside any slot: a slot-sourced card is already lifted out (removed);
    // a pool-sourced card just stays in the pool.
    writePending(cur)
  }
  dropFnRef.current = handleDrop // keep the global pointer-up handler pointed at the current closure
  function numberCard(value, source, slotIndex, interactive) {
    return (
      <div
        onPointerDown={interactive ? e => startDrag(e, value, source, slotIndex) : undefined}
        style={{ width: 56, height: 56, flexShrink: 0, background: teamColor(myTeam), color: "white",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900,
          cursor: interactive ? "grab" : "default", touchAction: "none", opacity: dragValue === value ? 0.35 : 1 }}>
        {value}
      </div>
    )
  }
  function guessBoard(interactive, values) {
    const clues = currentRound?.clues || []
    const pool = [1, 2, 3, 4].filter(n => !values.includes(n) && n !== dragValue)
    return (
      <div>
        {interactive && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", minHeight: 56, marginBottom: 16 }}>
            {pool.map(n => (
              <div key={n} data-dc-pool={n} style={{ visibility: hidingPool.has(n) ? "hidden" : "visible", touchAction: "none" }}>
                {numberCard(n, "pool", null, true)}
              </div>
            ))}
          </div>
        )}
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
            <div data-dc-slot={i}
              style={{ width: 56, height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                border: values[i] == null ? "2px dashed rgba(21,49,74,0.4)" : "none", touchAction: "none" }}>
              {values[i] != null && !hidingSlots.has(i) && numberCard(values[i], "slot", i, interactive)}
            </div>
            <div style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center",
              padding: "0 16px", fontSize: 18, fontWeight: 700, color: INK }}>{clues[i]}</div>
          </div>
        ))}
        {interactive && <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center", color: INK, marginTop: 6 }}>Drag the numbers into the slots — your team sees it live.</div>}
      </div>
    )
  }

  async function submitClues() {
    if (submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("dc_submit_clues", { p_code: code, p_player_id: myPlayerId, p_clues: clueDraft.map(c => c.trim()) })
    if (error) { alert(error.message); setSubmitting(false); return }
    nudge()
  }
  async function submitGuess() {
    if (submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("dc_submit_guess", { p_code: code, p_player_id: myPlayerId, p_guess: slots, p_is_intercept: isIntercept })
    if (error) { alert(error.message); setSubmitting(false); return }
    nudge()
  }

  if (g.phase === "finished") {
    const winner = g.winner_team
    const reasonText = g.win_reason === "intercepts" ? "2 interceptions — code cracked."
      : g.win_reason === "miscomms" ? "2 miscommunications — they fell apart."
      : "Most interceptions after 8 rounds."
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: winner === "tie" ? INK : teamColor(winner), marginBottom: 8 }}>
          {winner === "tie" ? "It's a tie!" : `${teamLabel(winner)} win!`}
        </div>
        <div style={{ fontSize: 16, opacity: 0.7, fontWeight: 600, marginBottom: 28 }}>{winner === "tie" ? "" : reasonText}</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          {["boys", "girls"].map(t => (
            <div key={t} style={{ background: PANEL, padding: "12px 16px", textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", color: teamColor(t) }}>{teamLabel(t)}</div>
              {tokenRows(t)}
            </div>
          ))}
        </div>
        <button onClick={async () => {
          if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
          const { data, error } = await supabase.rpc("dc_create_replay", { p_code: code })
          if (error) { alert(error.message); return }
          nudge()
          router.replace(`/${data}`)
        }} style={{ background: ACCENT, color: "#000", fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", cursor: "pointer", marginBottom: 12, maxWidth: 320, width: "100%" }}>Play Again</button>
        <a href="https://games.jackbrannen.com" style={{ display: "block", background: "rgba(255,255,255,0.4)", color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", textAlign: "center" }}>Play Another Game</a>
      </div>
    )
  }

  return (
    <>
      <Notifications supabase={supabase} pokes={pokes} roomCode={code} currentPlayer={me.name} colors={POKE_COLORS} />
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        {header()}
        {tokenBar()}
        {keywordPanel()}

        {g.round_phase === "clue" && amEncryptor && (
          <div style={{ background: ACCENT, color: "#000", textAlign: "center", padding: "12px", fontSize: 16, fontWeight: 800 }}>You&apos;re the Encryptor</div>
        )}
        {g.round_phase === "guess" && canGuess && (
          <div style={{ background: ACCENT, color: "#000", textAlign: "center", padding: "12px", fontSize: 16, fontWeight: 800 }}>{isIntercept ? "Intercept their code" : "Decode your team's code"}</div>
        )}

        <div style={{ padding: "16px" }}>
          {g.round_phase === "clue" && amEncryptor && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, marginBottom: 8 }}>Your code</div>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ display: "flex", gap: 0, marginBottom: 8 }}>
                  <div style={{ width: 56, flexShrink: 0, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: INK }}>{(g.current_code || [])[i]}</div>
                  <input value={clueDraft[i]} onChange={e => setClueDraft(d => d.map((c, j) => (j === i ? e.target.value : c)))}
                    placeholder={`Clue for ${(g.current_code || [])[i]}`} maxLength={40}
                    style={{ background: "rgba(255,255,255,0.65)", color: INK, fontSize: 18, fontWeight: 700, padding: "14px 16px", flex: 1, minWidth: 0, border: "none", outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
          )}
          {g.round_phase === "clue" && !amEncryptor && (
            <div style={{ textAlign: "center", padding: "30px 0", fontSize: 16, fontWeight: 700, opacity: 0.7 }}>{encryptor?.name || "The Encryptor"} is writing clues…</div>
          )}

          {g.round_phase === "guess" && (
            <div>
              {canGuess && !myGuessRow && guessBoard(true, slots)}
              {canGuess && myGuessRow && (
                <>
                  <div style={{ textAlign: "center", padding: "4px 0 16px", fontSize: 16, fontWeight: 700, opacity: 0.7 }}>Locked in. Waiting for the other team…</div>
                  {guessBoard(false, myGuessRow.guess)}
                </>
              )}
              {!canGuess && (
                <>
                  {/* The Encryptor watches their team's live decode read-only; a round-1
                      listener has no pending guess of their own, so this shows empty. */}
                  {guessBoard(false, slots)}
                  <div style={{ textAlign: "center", padding: "16px 0 0", fontSize: 15, fontWeight: 700, opacity: 0.7 }}>
                    {amEncryptor ? "Your team is decoding your clues…" : "No intercepting in round 1 — just listen."}
                  </div>
                </>
              )}
            </div>
          )}

          {g.round_phase === "reveal" && (() => {
            const decode = guesses.find(gg => gg.turn_number === g.turn_number && gg.team === activeTeam)
            const inter = guesses.find(gg => gg.turn_number === g.turn_number && gg.team !== activeTeam)
            const codeArr = g.current_code || []
            const decodedRight = decode && arrEq(decode.guess, codeArr)
            const interceptedRight = interceptAllowed && inter && arrEq(inter.guess, codeArr)
            const other = activeTeam === "boys" ? "girls" : "boys"
            return (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>The code was</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
                  {codeArr.map((d, i) => <div key={i} style={{ width: 56, height: 56, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: INK }}>{d}</div>)}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: decodedRight ? "#1F8A4C" : "#C0392B" }}>
                  {decodedRight ? `${teamLabel(activeTeam)} decoded it.` : `${teamLabel(activeTeam)} miscommunicated. +1 Miscommunication`}
                </div>
                {interceptAllowed && (
                  <div style={{ fontSize: 16, fontWeight: 800, color: interceptedRight ? teamColor(other) : INK, opacity: interceptedRight ? 1 : 0.65 }}>
                    {interceptedRight ? `${teamLabel(other)} intercepted! +1 Interception` : `${teamLabel(other)} didn't crack it.`}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {clueBoard()}
      </div>

      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {g.round_phase === "clue" && amEncryptor && (
          <FooterButton onClick={submitClues} disabled={clueDraft.some(c => !c.trim()) || submitting} bg={ACCENT} textColor="#000">
            {clueDraft.some(c => !c.trim()) ? "Write all 3 clues" : "Submit clues"}
          </FooterButton>
        )}
        {g.round_phase === "guess" && canGuess && !myGuessRow && (
          <FooterButton onClick={submitGuess} disabled={slots.filter(x => x != null).length < 3 || submitting} bg={ACCENT} textColor="#000">
            {slots.filter(x => x != null).length < 3 ? "Pick all 3 digits" : (isIntercept ? "Lock in intercept" : "Lock in decode")}
          </FooterButton>
        )}
        {g.round_phase === "reveal" && (
          <FooterButton onClick={() => supabase.rpc("dc_next_round", { p_code: code }).then(nudge)} bg={ACCENT} textColor="#000">
            Next round →
          </FooterButton>
        )}
      </Footer>

      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({
          name: p.name,
          firstName: p.first_name,
          lastName: p.last_name,
          teamColor: teamColor(p.team),
          teamLabel: teamLabel(p.team),
          teamTextColor: "#fff",
        }))}
        gamePhase={g.phase}
        rules={RULES}
        onResetToLobby={async () => { await supabase.rpc("dc_reset_to_lobby", { p_code: code }); nudge() }}
      />

      {dragValue != null && dragPos && (
        <div style={{ position: "fixed", left: dragPos.x - 28, top: dragPos.y - 28, width: 56, height: 56, zIndex: 300,
          pointerEvents: "none", background: teamColor(myTeam), color: "white", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 28, fontWeight: 900, boxShadow: "0 8px 20px rgba(0,0,0,0.3)" }}>
          {dragValue}
        </div>
      )}
      {swapAnim?.map((s, i) => <SwapCard key={i} color={teamColor(myTeam)} {...s} />)}
    </>
  )
}
