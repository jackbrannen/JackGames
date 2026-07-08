"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import WaitingList from "../../../components/WaitingList"
import VennDiagram, { ZONE_COLORS, ZONE_NAMES, FORCE_LIGHT_TEXT_ZONES } from "../../../components/VennDiagram"
import { TIR_RULES } from "../../../components/rulesText"

const BG = "#C0C9BC"
const INK = "#2A303C"
const INK_MUTED = "rgba(42,48,60,0.6)"
const DARK = "#2C3827"
const PANEL = "#94A68D"
const WARM = "#C1E0B4"
const BTN = "#2A303C"
const BTN_TEXT = "#FFF4F0"
const INPUT_BG = "#FFFFFF"
const WORD_CHIP_BG = "#BFC8BC"
const WORD_CHIP_ON_LIGHT_BG = "#2D3A52"
const WORD_CHIP_ON_LIGHT_TEXT = "#BFC8BC"
const RESOLUTION_MODAL_BG = "#95A68D"
const POKE_COLORS = { dark: DARK, mid: "#3E4F37", wl: WARM, yellow: "#FBDF54", notifBg: "#1F2A1B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

// Picks whichever of INK / a light text color has better contrast against
// a given zone color, so dark zone backgrounds get light text and light
// zone backgrounds get dark text automatically — except teal/green, which
// are forced to light text regardless (they read better that way).
function relLuminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrastRatio(hexA, hexB) {
  const l1 = relLuminance(hexA), l2 = relLuminance(hexB)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}
function textColorFor(bgHex, zone) {
  if (zone && FORCE_LIGHT_TEXT_ZONES.has(zone)) return BTN_TEXT
  return contrastRatio(INK, bgHex) >= contrastRatio(BTN_TEXT, bgHex) ? INK : BTN_TEXT
}

// A word chip's colors flip when it's sitting on a very light background
// (the White zone panel) so it doesn't disappear into it.
function wordChipStyle(onLightBg) {
  return onLightBg
    ? { background: WORD_CHIP_ON_LIGHT_BG, color: WORD_CHIP_ON_LIGHT_TEXT }
    : { background: WORD_CHIP_BG, color: INK }
}

// Inline highlighted label for a ring/zone color reference in game text —
// e.g. "Red Ring" or "Gold Zone" — background = the zone's actual color,
// text color auto-picked for contrast.
function ZoneChip({ zone, label }) {
  const bg = ZONE_COLORS[zone]
  return (
    <span style={{ background: bg, color: textColorFor(bg, zone), padding: "2px 8px", borderRadius: 6, fontWeight: 900, whiteSpace: "nowrap" }}>
      {label ?? `${ZONE_NAMES[zone]} Zone`}
    </span>
  )
}

function zoneTitle(zone) { return `${ZONE_NAMES[zone]} Zone` }

// Which base rings compose a given zone — used to look up the Knower's own
// rule text for whichever ring(s) intersect at the selected zone.
const ZONE_RINGS = {
  A: ["A"], B: ["B"], C: ["C"],
  AB: ["A", "B"], AC: ["A", "C"], BC: ["B", "C"],
  ABC: ["A", "B", "C"], OUTSIDE: [],
}

function fetchIdeas(n, ex) {
  return supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])
}

function WordListForm({ words, setWords, onSubmit, submitting, submitLabel, maxLength, maxDraws }) {
  const allFilled = words.every(w => w.trim())
  function fillNextSlot(idea) {
    setWords(prev => {
      const idx = prev.findIndex(w => !w.trim())
      if (idx === -1) return prev
      const next = [...prev]; next[idx] = idea; return next
    })
  }
  return (
    <>
      {words.map((w, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <TextEntry value={w} onChange={v => setWords(prev => prev.map((x, j) => j === i ? v : x))} placeholder={`Word ${i + 1}`} maxLength={maxLength} multiline={false} bg={INPUT_BG} style={{ color: INK }} />
        </div>
      ))}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        {allFilled ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: INK_MUTED, padding: "12px 0" }}>All filled in — ready to submit.</div>
        ) : (
          <RandomIdeas bg={DARK} yellow="#FBDF54" fetchIdeas={fetchIdeas} maxDraws={maxDraws} onIdeaClick={fillNextSlot} />
        )}
      </div>
      <button onClick={onSubmit} disabled={submitting || !allFilled}
        style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block" }}>
        {submitting ? "Submitting…" : submitLabel}
      </button>
    </>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [cards, setCards] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [inspectZone, setInspectZone] = useState(null)
  const [submittingGuess, setSubmittingGuess] = useState(false)

  const [ruleA, setRuleA] = useState("")
  const [ruleB, setRuleB] = useState("")
  const [ruleC, setRuleC] = useState("")
  const [submittingRules, setSubmittingRules] = useState(false)

  const [initialWords, setInitialWords] = useState(Array(5).fill(""))
  const [submittingWords, setSubmittingWords] = useState(false)

  const [replenishWords, setReplenishWords] = useState(["", "", ""])
  const [submittingReplenish, setSubmittingReplenish] = useState(false)

  const [resolving, setResolving] = useState(false)
  const [flashResolution, setFlashResolution] = useState(null)
  const [resolutionDismissed, setResolutionDismissed] = useState(true)
  const [knowerZoneChoice, setKnowerZoneChoice] = useState(null)
  const [movingCardId, setMovingCardId] = useState(null)
  const [guideDismissed, setGuideDismissed] = useState(false)

  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)
  const lastResolutionCardRef = useRef(null)
  const prevPendingCardRef = useRef(null)

  async function loadState() {
    const [{ data: g }, { data: ps }, { data: cs }] = await Promise.all([
      supabase.from("tir_games").select("*").eq("code", code).single(),
      supabase.from("tir_players").select("*").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("tir_cards").select("*").eq("game_code", code),
    ])
    if (!g) { router.replace(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g); setPlayers(ps ?? []); setCards(cs ?? []); setLoading(false)

    if (g.last_resolution?.card_id && g.last_resolution.card_id !== lastResolutionCardRef.current) {
      lastResolutionCardRef.current = g.last_resolution.card_id
      setFlashResolution(g.last_resolution)
      setResolutionDismissed(false)
    }

    const key = `${g.phase}:${g.rules_submitted}:${g.turn_index}:${g.round_number}:${g.pending_card_id ?? ""}:${g.final_chance_index}:${(g.winner_ids || []).join(",")}:${(ps ?? []).map(p => p.words_submitted).join("")}:${(ps ?? []).map(p => p.replenish_submitted).join("")}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  useEffect(() => {
    const stored = localStorage.getItem(`thingsinrings:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`tir-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tir_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "tir_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "tir_cards", filter: `game_code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  const me = players.find(p => p.id === myPlayerId)
  const isKnower = !!me?.is_knower
  const finders = players.filter(p => !p.is_knower)
  const handCounts = Object.fromEntries(finders.map(p => [p.id, cards.filter(c => c.owner_player_id === p.id && !c.zone).length]))
  const activePlayerId = game?.turn_order?.[(game?.turn_index ?? 1) - 1] ?? null
  const activePlayer = players.find(p => p.id === activePlayerId)
  const isMyTurn = activePlayerId === myPlayerId
  const pendingCard = game?.pending_card_id ? cards.find(c => c.id === game.pending_card_id) : null
  const knowerName = players.find(p => p.is_knower)?.name ?? "The Knower"
  const setupWaitingList = players.map(p => ({ name: p.name, done: p.is_knower ? !!game?.rules_submitted : !!p.words_submitted }))

  // While the Knower is resolving a pending guess, the diagram's selected
  // zone is their in-progress (unconfirmed) choice. Otherwise it's whatever
  // zone I've personally tapped to inspect — falling back, for onlookers
  // who haven't tapped anything themselves, to the active player's live pick.
  const diagramSelectedZone = (isKnower && game?.pending_card_id)
    ? knowerZoneChoice
    : (inspectZone ?? (!isMyTurn ? game?.active_selected_zone ?? null : null))
  const zoneCards = diagramSelectedZone ? cards.filter(c => c.zone === diagramSelectedZone) : []
  const zoneCounts = Object.fromEntries(
    ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE"].map(z => [z, cards.filter(c => c.zone === z).length])
  )

  function nameOf(id) { return players.find(p => p.id === id)?.name ?? "?" }

  // A fresh pending card means the Knower hasn't chosen a zone for it yet —
  // clear any leftover selection so their next tap is a genuinely fresh choice.
  useEffect(() => {
    if (game?.pending_card_id !== prevPendingCardRef.current) setKnowerZoneChoice(null)
    prevPendingCardRef.current = game?.pending_card_id ?? null
  }, [game?.pending_card_id])

  // When the word pool runs dry, the server holds off flipping to the
  // replenishing phase for a few seconds (tir_resolve_placement sets
  // replenish_ready_at) so the "Incorrect!" result modal has time to show
  // on every screen before everyone gets pulled into "write 3 more words."
  // Each client independently times off that same timestamp and nudges the
  // actual transition — harmless if more than one client's timer fires,
  // since tir_begin_replenish is a no-op once the phase has already flipped.
  const replenishTriggeredRef = useRef(false)
  useEffect(() => {
    if (!game?.replenish_ready_at) { replenishTriggeredRef.current = false; return }
    if (replenishTriggeredRef.current) return
    const delay = Math.max(0, new Date(game.replenish_ready_at).getTime() - Date.now())
    const t = setTimeout(async () => {
      replenishTriggeredRef.current = true
      await supabase.rpc("tir_begin_replenish", { p_code: code })
      nudge()
    }, delay)
    return () => clearTimeout(t)
  }, [game?.replenish_ready_at, code])

  // Broadcast the active player's in-progress word/zone picks so everyone
  // else's screen can show them live, not just after the guess is submitted.
  useEffect(() => {
    if (!isMyTurn || !myPlayerId || game?.pending_card_id) return
    supabase.rpc("tir_set_active_selection", { p_code: code, p_player_id: myPlayerId, p_card_id: selectedCardId, p_zone: inspectZone }).then(() => nudge())
  }, [selectedCardId, inspectZone, isMyTurn, myPlayerId, game?.pending_card_id])

  // The "live" selection shown above the diagram: my own in-progress pick on
  // my turn, or whatever the active player has broadcast on everyone else's.
  const liveCardId = isMyTurn ? selectedCardId : (game?.active_selected_card_id ?? null)
  const liveZone = isMyTurn ? inspectZone : (game?.active_selected_zone ?? null)
  const liveWord = liveCardId ? cards.find(c => c.id === liveCardId)?.text : null
  const canConfirmPlacement = isMyTurn && !game?.pending_card_id && !!selectedCardId && !!inspectZone

  function clearSelection() {
    setSelectedCardId(null)
    setInspectZone(null)
  }

  // Shared between the playing screen and the finished screen: the colored
  // panel showing what's in the selected zone, plus — Knower only — the
  // rule text for whichever ring(s) compose that zone.
  function zoneDescriptionNode() {
    if (!diagramSelectedZone) return null
    const zoneColor = ZONE_COLORS[diagramSelectedZone]
    const isWhiteZone = diagramSelectedZone === "ABC"
    const zoneTextColor = textColorFor(zoneColor, diagramSelectedZone)
    const rings = ZONE_RINGS[diagramSelectedZone]
    return (
      <>
        {isKnower && rings.length > 0 && (
          <div style={{ margin: "0 16px 8px", background: PANEL, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 6 }}>Rules for this zone</div>
            {rings.map(ring => (
              <div key={ring} style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                <ZoneChip zone={ring} label={`${ZONE_NAMES[ring]} Ring`} />: {game.ring_rules?.[ring]}
              </div>
            ))}
          </div>
        )}
        <div style={{ margin: "0 16px 16px", background: zoneColor, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: zoneTextColor, opacity: 0.75, marginBottom: 8 }}>{zoneTitle(diagramSelectedZone)}</div>
          {zoneCards.length === 0
            ? <div style={{ fontSize: 14, color: zoneTextColor, opacity: 0.65, fontStyle: "italic" }}>Nothing placed here yet</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {zoneCards.map(c => (
                  <div key={c.id} style={{ ...wordChipStyle(isWhiteZone), padding: "3px 8px", fontSize: 13, fontWeight: 700, borderRadius: 8 }}>{c.text}</div>
                ))}
              </div>}
        </div>
      </>
    )
  }

  // Dummy games auto-fill the Knower's rules and everyone's word submissions
  // from the random-ideas pool, so solo testing doesn't require manually
  // typing or tapping through every field.
  const autoFilledRulesRef = useRef(false)
  useEffect(() => {
    if (!game?.is_dummy || game.phase !== "setup" || !isKnower || game.rules_submitted || autoFilledRulesRef.current) return
    autoFilledRulesRef.current = true
    fetchIdeas(3, []).then(ideas => {
      if (ideas[0]) setRuleA(ideas[0])
      if (ideas[1]) setRuleB(ideas[1])
      if (ideas[2]) setRuleC(ideas[2])
    })
  }, [game?.is_dummy, game?.phase, isKnower, game?.rules_submitted])

  const autoFilledWordsRef = useRef(false)
  useEffect(() => {
    if (!game?.is_dummy || game.phase !== "setup" || isKnower || me?.words_submitted || autoFilledWordsRef.current) return
    autoFilledWordsRef.current = true
    fetchIdeas(5, []).then(ideas => {
      if (ideas.length) setInitialWords(prev => prev.map((w, i) => ideas[i] ?? w))
    })
  }, [game?.is_dummy, game?.phase, isKnower, me?.words_submitted])

  const autoFilledReplenishRef = useRef(false)
  useEffect(() => {
    if (game?.phase !== "replenishing") {
      autoFilledReplenishRef.current = false
      setReplenishWords(["", "", ""])
      return
    }
    if (!game?.is_dummy || me?.replenish_submitted || autoFilledReplenishRef.current) return
    autoFilledReplenishRef.current = true
    fetchIdeas(3, []).then(ideas => {
      if (ideas.length) setReplenishWords(prev => prev.map((w, i) => ideas[i] ?? w))
    })
  }, [game?.is_dummy, game?.phase, me?.replenish_submitted])

  function onZoneTap(zone) {
    if (game?.phase === "replenishing") return

    if (isKnower && game?.pending_card_id) {
      setKnowerZoneChoice(prev => prev === zone ? null : zone)
      return
    }

    setInspectZone(prev => prev === zone ? null : zone)
  }

  // The RPC only fires when the player taps Confirm in the footer, so a
  // stray word/zone tap can't silently place the wrong word.
  async function confirmPlacement() {
    if (submittingGuess || !canConfirmPlacement) return
    setSubmittingGuess(true)
    const { error } = await supabase.rpc("tir_submit_guess", { p_code: code, p_player_id: myPlayerId, p_card_id: selectedCardId, p_zone: inspectZone })
    setSubmittingGuess(false)
    if (error) { alert(error.message); throw error }
    setSelectedCardId(null)
    setInspectZone(null)
    nudge()
  }

  async function confirmResolution() {
    if (resolving || !knowerZoneChoice) return
    setResolving(true)
    const { error } = await supabase.rpc("tir_resolve_placement", { p_code: code, p_knower_id: myPlayerId, p_zone: knowerZoneChoice })
    setResolving(false)
    if (error) { alert(error.message); throw error }
    setKnowerZoneChoice(null)
    nudge()
  }

  async function setPlayerHandSize(playerId, newSize) {
    if (newSize < 0 || newSize > 15) return
    await supabase.rpc("tir_set_player_hand_size", { p_code: code, p_knower_id: myPlayerId, p_player_id: playerId, p_hand_size: newSize })
    nudge()
  }

  async function moveCardZone(cardId, zone) {
    await supabase.rpc("tir_move_card_zone", { p_code: code, p_knower_id: myPlayerId, p_card_id: cardId, p_zone: zone })
    setMovingCardId(null)
    nudge()
  }

  function dismissResolutionModal() {
    setResolutionDismissed(true)
  }

  async function submitRules() {
    if (submittingRules || !ruleA.trim() || !ruleB.trim() || !ruleC.trim()) return
    setSubmittingRules(true)
    const { error } = await supabase.rpc("tir_submit_rules", { p_code: code, p_knower_id: myPlayerId, p_rule_a: ruleA.trim(), p_rule_b: ruleB.trim(), p_rule_c: ruleC.trim() })
    if (error) { alert(error.message); setSubmittingRules(false); return }
    nudge()
  }

  async function submitWords() {
    const trimmed = initialWords.map(w => w.trim())
    if (submittingWords || trimmed.some(w => !w)) return
    setSubmittingWords(true)
    const { error } = await supabase.rpc("tir_submit_words", { p_code: code, p_player_id: myPlayerId, p_words: trimmed })
    if (error) { alert(error.message); setSubmittingWords(false); return }
    nudge()
  }

  async function submitReplenish() {
    const trimmed = replenishWords.map(w => w.trim())
    if (submittingReplenish || trimmed.some(w => !w)) return
    setSubmittingReplenish(true)
    const { error } = await supabase.rpc("tir_submit_replenish_words", { p_code: code, p_player_id: myPlayerId, p_words: trimmed })
    if (error) { alert(error.message); setSubmittingReplenish(false); return }
    nudge()
  }

  function settingsNode() {
    if (!isKnower) return null
    const placedCards = cards.filter(c => c.zone)
    const zoneOrder = ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE"]
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 8 }}>Words per player</div>
        {finders.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ flex: 1, color: "white", fontWeight: 700, fontSize: 14 }}>{p.name}</span>
            <button onClick={() => setPlayerHandSize(p.id, (handCounts[p.id] ?? 0) - 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>−</button>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", minWidth: 24, textAlign: "center" }}>{handCounts[p.id] ?? 0}</div>
            <button onClick={() => setPlayerHandSize(p.id, (handCounts[p.id] ?? 0) + 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>+</button>
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginTop: 16, marginBottom: 8 }}>Move a placed word</div>
        {placedCards.length === 0
          ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>No words placed yet</div>
          : placedCards.map(c => (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, color: "white", fontWeight: 700, fontSize: 14 }}>{c.text}</span>
                  <ZoneChip zone={c.zone} />
                </div>
                {movingCardId === c.id ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {zoneOrder.map(z => (
                      <button key={z} onClick={() => moveCardZone(c.id, z)}
                        style={{ background: ZONE_COLORS[z], color: textColorFor(ZONE_COLORS[z], z), fontSize: 11, fontWeight: 900, padding: "5px 9px", borderRadius: 6 }}>
                        {ZONE_NAMES[z]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setMovingCardId(c.id)} style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 12, fontWeight: 800, padding: "6px 10px" }}>Move…</button>
                )}
              </div>
            ))}
      </div>
    )
  }

  function menuNode() {
    return (
      <>
        <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me?.name} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me?.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
          gamePhase={game?.phase}
          rules={TIR_RULES}
          settingsContent={isKnower ? settingsNode() : null}
          onResetToLobby={async () => { await supabase.rpc("tir_reset_to_lobby", { p_code: code }); nudge() }}
        />
      </>
    )
  }

  if (loading || !game) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: INK_MUTED, fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ color: INK, fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: BTN }}>Back to lobby</a></div>
      </div>
    )
  }

  // ── SETUP ────────────────────────────────────────────────
  if (game.phase === "setup") {
    if (isKnower) {
      if (game.rules_submitted) {
        return (
          <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Rules locked in</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Waiting for players to submit their words…</div>
            <div style={{ background: PANEL, color: INK, padding: "12px 20px", width: "100%", maxWidth: 360 }}>
              <WaitingList players={setupWaitingList} myName={me.name} colors={{ mid: PANEL }} showCount />
            </div>
          </div>
        )
      }
      return (
        <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
          {!guideDismissed && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: PANEL, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%" }}>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Guide your Guessers</div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>Tell your guessers what kind of words to write. Examples:</div>
                <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 15, fontWeight: 600, lineHeight: 1.7 }}>
                  <li>Physical objects</li>
                  <li>Activities</li>
                  <li>People</li>
                  <li>Personality attributes</li>
                  <li>Any noun</li>
                </ul>
                <button onClick={() => setGuideDismissed(true)} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "12px 24px", width: "100%" }}>
                  Got it
                </button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>You're the Knower</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Write a secret rule for each ring.</h1>
          <div style={{ maxWidth: 320, margin: "0 auto 24px" }}>
            <VennDiagram onZoneTap={() => {}} selectedZone={null} disabled />
          </div>
          {[["A", ruleA, setRuleA], ["B", ruleB, setRuleB], ["C", ruleC, setRuleC]].map(([zone, val, setter]) => (
            <div key={zone} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}><ZoneChip zone={zone} label={`${ZONE_NAMES[zone]} Ring`} /></div>
              <TextEntry value={val} onChange={setter} placeholder={`e.g. "starts with a vowel"`} maxLength={80} multiline={false} bg={INPUT_BG} style={{ color: INK }} />
            </div>
          ))}
          <button onClick={submitRules} disabled={submittingRules || !ruleA.trim() || !ruleB.trim() || !ruleC.trim()}
            style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block", marginTop: 8 }}>
            {submittingRules ? "Saving…" : "Lock in rules"}
          </button>
        </div>
      )
    }

    if (me.words_submitted) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Words submitted</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Waiting for everyone else…</div>
          <div style={{ background: PANEL, color: INK, padding: "12px 20px", width: "100%", maxWidth: 360 }}>
            <WaitingList players={setupWaitingList} myName={me.name} colors={{ mid: PANEL }} showCount />
          </div>
        </div>
      )
    }
    return (
      <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Setup</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Submit 5 words or phrases.</h1>
        <WordListForm words={initialWords} setWords={setInitialWords} onSubmit={submitWords} submitting={submittingWords} submitLabel="Submit words" maxLength={40} maxDraws={3} />
      </div>
    )
  }

  // ── REPLENISHING ─────────────────────────────────────────
  if (game.phase === "replenishing") {
    if (me.replenish_submitted) {
      const waitingOn = players.filter(p => !p.replenish_submitted)
      return (
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Word pool running low</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Waiting on…</div>
          {waitingOn.map(p => <div key={p.id} style={{ fontSize: 15, fontWeight: 700, color: INK_MUTED, marginBottom: 4 }}>{p.name}</div>)}
        </div>
      )
    }
    return (
      <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Word pool is empty</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Everyone add 3 more words.</h1>
        <WordListForm words={replenishWords} setWords={setReplenishWords} onSubmit={submitReplenish} submitting={submittingReplenish} submitLabel="Submit words" maxLength={40} maxDraws={2} />
      </div>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────
  if (game.phase === "finished") {
    const winners = (game.winner_ids ?? []).map(id => nameOf(id))
    return (
      <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
          <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 20, lineHeight: 1.1 }}>
            {winners.length > 1 ? `${winners.join(" & ")} tied!` : `${winners[0] ?? "?"} wins!`}
          </div>
        </div>

        <div style={{ margin: "0 -16px" }}>
          <div style={{ padding: "0 16px" }}>
            <VennDiagram onZoneTap={onZoneTap} selectedZone={diagramSelectedZone} zoneCounts={zoneCounts} />
          </div>
          {zoneDescriptionNode()}
        </div>

        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 10 }}>The secret rules</div>
        {["A", "B", "C"].map(zone => (
          <div key={zone} style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 8 }}>
            <ZoneChip zone={zone} label={`${ZONE_NAMES[zone]} Ring`} />: {game.ring_rules?.[zone]}
          </div>
        ))}

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button onClick={async () => {
            if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
            const { data, error } = await supabase.rpc("tir_create_replay", { p_code: code })
            if (error) { alert(error.message); return }
            nudge()
            router.replace(`/${data}`)
          }} style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", marginTop: 8, maxWidth: 320, width: "100%" }}>Play Again</button>
          <a href="https://games.jackbrannen.com" style={{ display: "block", background: PANEL, color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", marginTop: 10 }}>Play Another Game</a>
        </div>
      </div>
    )
  }

  // ── PLAYING / FINAL_CHANCE ───────────────────────────────
  const inFinalChance = game.phase === "final_chance"
  const showYourTurnBar = isMyTurn && !game.pending_card_id
  const showKnowerPickBar = isKnower && game.pending_card_id
  const showWhiteBar = !showYourTurnBar && !showKnowerPickBar
  const whiteBarText = game.pending_card_id
    ? (isMyTurn ? "Waiting on the Knower to evaluate your guess." : `Waiting on the Knower to evaluate ${activePlayer?.name}'s guess.`)
    : `${activePlayer?.name}'s turn`

  return (
    <div style={{ height: `calc(100dvh - ${FOOTER_H}px - env(safe-area-inset-bottom, 0px))`, overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK }}>
      {!(flashResolution && !resolutionDismissed) && showYourTurnBar && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#F4C542", color: "#000", padding: "14px 16px", fontSize: 15, fontWeight: 900, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 2 }}>Round {game.round_number}</div>
          Your Turn
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Select a word and a zone.</div>
        </div>
      )}

      {!(flashResolution && !resolutionDismissed) && showKnowerPickBar && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#F4C542", color: "#000", padding: "14px 16px", fontSize: 15, fontWeight: 900, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 2 }}>Round {game.round_number}</div>
          Pick the correct zone for <span style={{ background: "rgba(0,0,0,0.15)", color: "#000", padding: "3px 8px", borderRadius: 8, fontWeight: 900 }}>{pendingCard?.text}</span>
        </div>
      )}

      {!(flashResolution && !resolutionDismissed) && showWhiteBar && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#FFFFFF", color: INK, padding: "14px 16px", fontSize: 15, fontWeight: 900, textAlign: "center", borderBottom: "1px solid rgba(42,48,60,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.5, marginBottom: 2 }}>Round {game.round_number}</div>
          {whiteBarText}
        </div>
      )}

      {inFinalChance && (
        <div style={{ background: "#F4C542", color: "#000", padding: "10px 16px", fontSize: 14, fontWeight: 800 }}>
          🎉 {nameOf(game.winner_ids?.[0])} used up their words! Waiting to see if {game.final_chance_ids.map(nameOf).join(", ")} can tie…
        </div>
      )}

      {flashResolution && !resolutionDismissed && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: RESOLUTION_MODAL_BG, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>{flashResolution.correct ? "Correct!" : "Incorrect!"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
              {flashResolution.correct
                ? <>{nameOf(flashResolution.guesser_id)} put "{cards.find(c => c.id === flashResolution.card_id)?.text ?? ""}" in the <ZoneChip zone={flashResolution.actual_zone} />.</>
                : <>{nameOf(flashResolution.guesser_id)} put "{cards.find(c => c.id === flashResolution.card_id)?.text ?? ""}" in the <ZoneChip zone={flashResolution.guessed_zone} />, but {knowerName} moved it to the <ZoneChip zone={flashResolution.actual_zone} />.</>}
            </div>
            {!flashResolution.correct && (
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, opacity: 0.75 }}>
                {nameOf(flashResolution.guesser_id)} gets a new word as a penalty.
              </div>
            )}
            <button onClick={dismissResolutionModal} style={{ marginTop: 20, background: "rgba(42,48,60,0.15)", color: INK, fontWeight: 900, padding: "12px 24px", width: "100%" }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {!game.pending_card_id && (liveCardId || liveZone) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", padding: "12px 16px 0" }}>
          {liveCardId && <div style={{ background: "#D9E2D5", color: INK, padding: "4px 9px", fontSize: 14, fontWeight: 800, borderRadius: 8 }}>{liveWord}</div>}
          {liveCardId && liveZone && <span style={{ fontSize: 15, fontWeight: 900, opacity: 0.6 }}>+</span>}
          {liveZone && (
            <span style={{ background: ZONE_COLORS[liveZone], color: textColorFor(ZONE_COLORS[liveZone], liveZone), padding: "4px 9px", fontSize: 14, fontWeight: 800, borderRadius: 8 }}>
              {zoneTitle(liveZone)}
            </span>
          )}
          {isMyTurn && (
            <button onClick={clearSelection} aria-label="Clear selection" style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 18, fontWeight: 800, padding: "2px 6px", lineHeight: 1 }}>✕</button>
          )}
        </div>
      )}

      <div style={{ padding: "16px" }}>
        <VennDiagram
          onZoneTap={onZoneTap}
          selectedZone={diagramSelectedZone}
          zoneCounts={zoneCounts}
          disabled={resolving || submittingGuess}
        />
      </div>

      {zoneDescriptionNode()}

      {game.pending_card_id && !isKnower && (
        <div style={{ margin: "0 16px 16px", background: "rgba(42,48,60,0.12)", padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {nameOf(game.pending_player_id)} placed <b>"{pendingCard?.text}"</b> in the <ZoneChip zone={game.pending_zone} />.
          </div>
        </div>
      )}

      {(() => {
        const current = finders.filter(p => p.id === activePlayerId)
        const others = finders.filter(p => p.id !== activePlayerId)
        function playerRow(p) {
          const isActive = p.id === activePlayerId
          const interactive = isActive && isMyTurn && !game.pending_card_id
          const handForPlayer = cards.filter(c => c.owner_player_id === p.id && !c.zone)
          return (
            <div key={p.id} style={{ background: PANEL, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                <span style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#2A303C", color: "#BFC8BC", fontSize: 13, fontWeight: 900, flexShrink: 0,
                }}>{handCounts[p.id] ?? 0}</span>
              </div>
              {handForPlayer.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: isActive ? 6 : 4, marginTop: isActive ? 10 : 8 }}>
                  {handForPlayer.map(c => (
                    <button
                      key={c.id}
                      onClick={() => interactive && setSelectedCardId(prev => prev === c.id ? null : c.id)}
                      style={{
                        ...(interactive && liveCardId === c.id ? { background: BTN, color: BTN_TEXT } : wordChipStyle(false)),
                        padding: isActive ? "7px 12px" : "3px 7px",
                        fontSize: isActive ? 15 : 11,
                        fontWeight: isActive ? 800 : 600,
                        opacity: isActive ? 1 : 0.6,
                        border: "none", borderRadius: isActive ? 10 : 6,
                        cursor: interactive ? "pointer" : "default",
                      }}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <>
            {current.length > 0 && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Current Player</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{current.map(playerRow)}</div>
              </div>
            )}
            {others.length > 0 && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Other Players</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{others.map(playerRow)}</div>
              </div>
            )}
          </>
        )
      })()}

      {menuNode()}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {isMyTurn && !game.pending_card_id && (
          <FooterButton onClick={confirmPlacement} disabled={!canConfirmPlacement || submittingGuess}>
            {submittingGuess ? "Placing…" : "Confirm"}
          </FooterButton>
        )}
        {isKnower && game.pending_card_id && (
          <FooterButton onClick={confirmResolution} disabled={!knowerZoneChoice || resolving}>
            {resolving ? "Confirming…" : "Confirm"}
          </FooterButton>
        )}
      </Footer>
    </div>
  )
}
