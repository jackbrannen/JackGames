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
import { useDuplicates } from "../../../lib/useDuplicates"
import VennDiagram, { ZONE_COLORS, ZONE_NAMES } from "../../../components/VennDiagram"
import { ZoneChip, textColorFor, wordChipStyle, zoneTitle, ZONE_RINGS, fetchIdeas } from "../../../components/RingHelpers"
import { TIR_RULES } from "../../../components/rulesText"

const BG = "#C0C9BC"
const INK = "#2A303C"
const INK_MUTED = "rgba(42,48,60,0.6)"
const DARK = "#2C3827"
const PANEL = "#94A68D"
const BTN = "#2A303C"
const BTN_TEXT = "#FFF4F0"
const INPUT_BG = "#FFFFFF"
const RESOLUTION_MODAL_BG = "#95A68D"
const POKE_COLORS = { dark: DARK, mid: "#3E4F37", wl: "#C1E0B4", yellow: "#FBDF54", notifBg: "#1F2A1B" }
const BOYS = "#3B6FA0"
const GIRLS = "#B5548A"

function teamColor(t) { return t === "boys" ? BOYS : GIRLS }
function teamLabel(t) { return t === "boys" ? "Boys" : "Girls" }

function WordListForm({ words, setWords, onSubmit, submitting, submitLabel, maxLength, maxDraws, takenIndex, onEdit }) {
  const allFilled = words.every(w => w.trim())
  const { dupeIndices, hasDuplicates } = useDuplicates(words)
  function fillNextSlot(idea) {
    setWords(prev => {
      const idx = prev.findIndex(w => !w.trim())
      if (idx === -1) return prev
      const next = [...prev]; next[idx] = idea; return next
    })
  }
  return (
    <>
      {words.map((w, i) => {
        const isTaken = takenIndex === i
        const isDupe = dupeIndices.has(i)
        return (
          <div key={i} style={{ marginBottom: isTaken ? 4 : 8 }}>
            <TextEntry
              value={w}
              onChange={v => { setWords(prev => prev.map((x, j) => j === i ? v : x)); onEdit?.(i) }}
              placeholder={`Word ${i + 1}`} maxLength={maxLength} multiline={false}
              bg={isTaken ? "rgba(240,79,82,0.18)" : isDupe ? "#5C1010" : INPUT_BG}
              style={{ color: INK }}
            />
            {isTaken && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F04F52", marginTop: 4 }}>
                "{w}" was already submitted. Try something else.
              </div>
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        {allFilled ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: INK_MUTED, padding: "12px 0" }}>All filled in — ready to submit.</div>
        ) : (
          <RandomIdeas bg={DARK} yellow="#FBDF54" fetchIdeas={fetchIdeas} maxDraws={maxDraws} onIdeaClick={fillNextSlot} />
        )}
      </div>
      <button onClick={onSubmit} disabled={submitting || !allFilled || hasDuplicates}
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

  const [initialWords, setInitialWords] = useState(Array(5).fill(""))
  const [submittingWords, setSubmittingWords] = useState(false)
  const [takenWordIndex, setTakenWordIndex] = useState(null)

  const [resolving, setResolving] = useState(false)
  const [flashResolution, setFlashResolution] = useState(null)
  const [resolutionDismissed, setResolutionDismissed] = useState(true)
  const [knowerZoneChoice, setKnowerZoneChoice] = useState(null)
  const [knowerActAlertDismissed, setKnowerActAlertDismissed] = useState(true)
  const [selectedMoveCardId, setSelectedMoveCardId] = useState(null)
  const [showMoveZonePicker, setShowMoveZonePicker] = useState(false)
  const [turnDecisionBusy, setTurnDecisionBusy] = useState(false)

  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)
  const lastResolutionCardRef = useRef(null)
  const prevPendingCardRef = useRef(null)

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }, { data: cs }] = await Promise.all([
      supabase.from("tir_games").select("*").eq("code", code).single(),
      supabase.from("tir_players").select("*").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("tir_cards").select("*").eq("game_code", code),
    ])
    if (seq !== loadSeqRef.current) return
    if (!g) { router.replace(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g); setPlayers(ps ?? []); setCards(cs ?? []); setLoading(false)

    if (g.last_resolution?.card_id && g.last_resolution.card_id !== lastResolutionCardRef.current) {
      lastResolutionCardRef.current = g.last_resolution.card_id
      setFlashResolution(g.last_resolution)
      setResolutionDismissed(false)
    }

    const key = `${g.phase}:${g.active_team}:${g.round_number}:${g.pending_card_id ?? ""}:${g.turn_decision_pending}:${(g.winning_teams || []).join(",")}:${(ps ?? []).map(p => p.words_submitted).join("")}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  // tir_games changes on every tap while someone's picking a word/zone (the
  // live-cursor broadcast via active_selected_card_id/zone), far more often
  // than real state changes. Applying the row straight from the realtime
  // payload — which always carries the complete new row — instead of
  // triggering a full loadState() avoids a 3-table refetch fanned out to
  // every connected client on every single tap.
  const gamesSyncKeyRef = useRef(null)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(newRow)
    setLoading(false)

    if (newRow.last_resolution?.card_id && newRow.last_resolution.card_id !== lastResolutionCardRef.current) {
      lastResolutionCardRef.current = newRow.last_resolution.card_id
      setFlashResolution(newRow.last_resolution)
      setResolutionDismissed(false)
    }

    const key = `${newRow.phase}:${newRow.active_team}:${newRow.round_number}:${newRow.pending_card_id ?? ""}:${newRow.turn_decision_pending}:${(newRow.winning_teams || []).join(",")}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) nudge()
    gamesSyncKeyRef.current = key
  }

  useEffect(() => {
    const stored = localStorage.getItem(`thingsinrings:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`tir-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tir_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "tir_players", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "tir_cards", filter: `game_code=eq.${code}` }, loadState)
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
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
      channelRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code])

  const me = players.find(p => p.id === myPlayerId)
  const isKnower = !!me?.is_knower
  const myTeam = me?.team ?? null
  const teamPlayers = players.filter(p => !!p.team)
  const activeTeam = game?.active_team ?? null
  const isMyTurn = game?.phase === "playing" && !!myTeam && myTeam === activeTeam
  const pendingCard = game?.pending_card_id ? cards.find(c => c.id === game.pending_card_id) : null
  const knower = players.find(p => p.is_knower)
  const knowerName = knower?.name ?? "The Knower"
  const teamWritingWaitingList = teamPlayers.map(p => ({ name: p.name, done: !!p.words_submitted }))
  const handCounts = {
    boys: cards.filter(c => c.owner_team === "boys" && !c.zone).length,
    girls: cards.filter(c => c.owner_team === "girls" && !c.zone).length,
  }

  const diagramSelectedZone = (isKnower && game?.pending_card_id)
    ? knowerZoneChoice
    : (inspectZone ?? (!isMyTurn ? game?.active_selected_zone ?? null : null))
  const zoneCards = diagramSelectedZone ? cards.filter(c => c.zone === diagramSelectedZone) : []
  const zoneWords = Object.fromEntries(
    ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE"].map(z => [
      z,
      cards.filter(c => c.zone === z)
        .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
        .map(c => c.text),
    ])
  )

  function nameOf(id) { return players.find(p => p.id === id)?.name ?? "?" }

  useEffect(() => {
    if (game?.pending_card_id !== prevPendingCardRef.current) {
      setKnowerZoneChoice(null)
      if (isKnower && game?.pending_card_id) setKnowerActAlertDismissed(false)
    }
    prevPendingCardRef.current = game?.pending_card_id ?? null
  }, [game?.pending_card_id, isKnower])

  useEffect(() => {
    setSelectedCardId(null)
    setInspectZone(null)
  }, [game?.phase])

  // Broadcast my in-progress word/zone picks so everyone else's screen can
  // show them live, not just after the guess is submitted.
  useEffect(() => {
    if (!isMyTurn || !myPlayerId || game?.pending_card_id) return
    supabase.rpc("tir_set_active_selection", { p_code: code, p_player_id: myPlayerId, p_card_id: selectedCardId, p_zone: inspectZone }).then(() => nudge())
  }, [selectedCardId, inspectZone, isMyTurn, myPlayerId, game?.pending_card_id])

  const liveCardId = isMyTurn ? selectedCardId : (game?.active_selected_card_id ?? null)
  const liveZone = isMyTurn ? inspectZone : (game?.active_selected_zone ?? null)
  const liveWord = liveCardId ? cards.find(c => c.id === liveCardId)?.text : null
  const canConfirmPlacement = isMyTurn && !game?.pending_card_id && !!selectedCardId && !!inspectZone && inspectZone !== "NA"

  function clearSelection() {
    setSelectedCardId(null)
    setInspectZone(null)
  }

  function liveSelectionPill(showClear) {
    if (game.pending_card_id) return null
    const placeholderStyle = { background: "transparent", border: "2px dashed rgba(42,48,60,0.35)", color: INK_MUTED, padding: "4px 9px", fontSize: 14, fontWeight: 700, borderRadius: 8 }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", padding: "12px 16px 0" }}>
        {liveCardId
          ? <div style={{ background: "#D9E2D5", color: INK, padding: "4px 9px", fontSize: 14, fontWeight: 800, borderRadius: 8 }}>{liveWord}</div>
          : <div style={placeholderStyle}>{showClear ? "pick a word" : "Word"}</div>}
        <span style={{ fontSize: 15, fontWeight: 900, opacity: 0.6 }}>+</span>
        {liveZone
          ? <span style={{ background: ZONE_COLORS[liveZone], color: textColorFor(ZONE_COLORS[liveZone], liveZone), padding: "4px 9px", fontSize: 14, fontWeight: 800, borderRadius: 8 }}>{zoneTitle(liveZone)}</span>
          : <div style={placeholderStyle}>{showClear ? "pick a zone" : "Zone"}</div>}
        {showClear && (liveCardId || liveZone) && (
          <button onClick={clearSelection} aria-label="Clear selection" style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 18, fontWeight: 800, padding: "2px 6px", lineHeight: 1 }}>✕</button>
        )}
      </div>
    )
  }

  // A team's hand shown in a colored container with word chips. The active
  // team's hand is interactive for any of its members; the other team's is
  // shown muted/read-only (everyone can already see everyone's words — you
  // just don't know where they go).
  function teamHandRow(team, handCards, interactive) {
    return (
      <div style={{ background: team === activeTeam ? PANEL : "#26314A", color: team === activeTeam ? INK : "white", padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: teamColor(team), color: "white", fontSize: 11, fontWeight: 900, padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{teamLabel(team)}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: "50%",
            background: "#2A303C", color: "#BFC8BC", fontSize: 13, fontWeight: 900, flexShrink: 0,
          }}>{handCards.length}</span>
        </div>
        {handCards.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {handCards.map(c => {
              const isSelected = interactive && liveCardId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => interactive && setSelectedCardId(prev => prev === c.id ? null : c.id)}
                  style={{
                    ...(isSelected ? { background: BTN, color: BTN_TEXT } : team === activeTeam ? wordChipStyle(false) : { background: "#34435D", color: "white" }),
                    padding: "7px 12px", fontSize: 15, fontWeight: 800,
                    border: "none", borderRadius: 10,
                    opacity: team === activeTeam ? 1 : 0.7,
                    cursor: interactive ? "pointer" : "default",
                  }}
                >
                  {c.text}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Shared across the writing, playing, and finished screens. Knower-only
  // players (and the Knower reviewing after the fact) see the true rules;
  // everyone else sees the Knower's player-facing hints instead.
  function zoneDescriptionNode() {
    if (!diagramSelectedZone) {
      return (
        <div style={{ margin: "0 16px 16px", background: PANEL, padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: INK, opacity: 0.6, marginBottom: 8 }}>Zone</div>
          <div style={{ fontSize: 14, color: INK, opacity: 0.65, fontStyle: "italic" }}>No zone selected</div>
        </div>
      )
    }
    const zoneColor = ZONE_COLORS[diagramSelectedZone]
    const isWhiteZone = diagramSelectedZone === "ABC"
    const zoneTextColor = textColorFor(zoneColor, diagramSelectedZone)
    const rings = ZONE_RINGS[diagramSelectedZone]
    const textSource = isKnower ? game.ring_rules : game.ring_hints
    const label = isKnower ? "Rules for this zone" : "Hints for this zone"
    return (
      <>
        {rings.length > 0 && (
          <div style={{ margin: "0 16px 8px", background: PANEL, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 6 }}>{label}</div>
            {rings.map(ring => (
              <div key={ring} style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                <ZoneChip zone={ring} label={`${ZONE_NAMES[ring]} Ring`} />: {textSource?.[ring]}
              </div>
            ))}
          </div>
        )}
        <div style={{ margin: "0 16px 16px", background: zoneColor, padding: "14px 16px", borderRadius: 14 }}>
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

  // Dummy games auto-fill everyone's word submissions from the random-ideas
  // pool so solo testing doesn't require manually typing through every field.
  const autoFilledWordsRef = useRef(false)
  useEffect(() => {
    if (!game?.is_dummy || game.phase !== "team_writing" || !myTeam || me?.words_submitted || autoFilledWordsRef.current) return
    autoFilledWordsRef.current = true
    fetchIdeas(5, []).then(ideas => {
      if (ideas.length) setInitialWords(prev => prev.map((w, i) => ideas[i] ?? w))
    })
  }, [game?.is_dummy, game?.phase, myTeam, me?.words_submitted])

  function onZoneTap(zone) {
    if (isKnower && game?.pending_card_id) {
      setKnowerZoneChoice(prev => prev === zone ? null : zone)
      return
    }
    setInspectZone(prev => prev === zone ? null : zone)
  }

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

  async function teamTurnDecision(cont) {
    if (turnDecisionBusy) return
    setTurnDecisionBusy(true)
    await supabase.rpc("tir_team_turn_decision", { p_code: code, p_player_id: myPlayerId, p_continue: cont })
    setTurnDecisionBusy(false)
    nudge()
  }

  async function setTeamHandSize(team, newSize) {
    if (newSize < 0 || newSize > 15) return
    await supabase.rpc("tir_set_team_hand_size", { p_code: code, p_knower_id: myPlayerId, p_team: team, p_hand_size: newSize })
    nudge()
  }

  async function moveCardZone(cardId, zone) {
    await supabase.rpc("tir_move_card_zone", { p_code: code, p_knower_id: myPlayerId, p_card_id: cardId, p_zone: zone })
    setSelectedMoveCardId(null)
    setShowMoveZonePicker(false)
    nudge()
  }

  function dismissResolutionModal() {
    setResolutionDismissed(true)
  }

  async function submitWords() {
    const trimmed = initialWords.map(w => w.trim())
    if (submittingWords || trimmed.some(w => !w)) return
    setTakenWordIndex(null)
    setSubmittingWords(true)
    const { error } = await supabase.rpc("tir_submit_words", { p_code: code, p_player_id: myPlayerId, p_words: trimmed })
    if (error) {
      setSubmittingWords(false)
      if (error.code === "23505" || /already submitted/i.test(error.message ?? "")) {
        await loadState()
        const existing = new Set(cards.map(c => c.text.trim().toLowerCase()))
        const idx = trimmed.findIndex(w => existing.has(w.toLowerCase()))
        setTakenWordIndex(idx === -1 ? 0 : idx)
        return
      }
      alert(error.message)
      return
    }
    nudge()
  }

  function settingsNode() {
    if (!isKnower) return null
    const placedCards = cards.filter(c => c.zone)
    const zoneOrder = ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE"]
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 8 }}>Words per team</div>
        {["boys", "girls"].map(team => (
          <div key={team} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ flex: 1, color: "white", fontWeight: 700, fontSize: 14 }}>{teamLabel(team)}</span>
            <button onClick={() => setTeamHandSize(team, (handCounts[team] ?? 0) - 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>−</button>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", minWidth: 24, textAlign: "center" }}>{handCounts[team] ?? 0}</div>
            <button onClick={() => setTeamHandSize(team, (handCounts[team] ?? 0) + 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>+</button>
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginTop: 16, marginBottom: 8 }}>Move a placed word</div>
        {placedCards.length === 0
          ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>No words placed yet</div>
          : <>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {zoneOrder.map(z => {
                  const zc = placedCards.filter(c => c.zone === z)
                  if (zc.length === 0) return null
                  const zoneColor = ZONE_COLORS[z]
                  const zoneTextColor = textColorFor(zoneColor, z)
                  return (
                    <div key={z} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {zc.map(c => {
                        const selected = selectedMoveCardId === c.id
                        return (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedMoveCardId(prev => prev === c.id ? null : c.id); setShowMoveZonePicker(false) }}
                            style={{
                              background: zoneColor, color: zoneTextColor,
                              padding: "8px 14px", fontSize: 14, fontWeight: 800, borderRadius: 10,
                              border: selected ? "3px solid white" : "3px solid transparent",
                            }}
                          >
                            {c.text}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              {showMoveZonePicker ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {zoneOrder.map(z => (
                    <button key={z} onClick={() => moveCardZone(selectedMoveCardId, z)}
                      style={{ background: ZONE_COLORS[z], color: textColorFor(ZONE_COLORS[z], z), fontSize: 11, fontWeight: 900, padding: "5px 9px", borderRadius: 6 }}>
                      {ZONE_NAMES[z]}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => selectedMoveCardId && setShowMoveZonePicker(true)}
                  disabled={!selectedMoveCardId}
                  style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px", marginTop: 12, opacity: selectedMoveCardId ? 1 : 0.4 }}
                >
                  Move…
                </button>
              )}
            </>
        }
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

  // ── TEAM WRITING ─────────────────────────────────────────
  if (game.phase === "team_writing") {
    if (isKnower || me.words_submitted) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>{isKnower ? "Setup complete" : "Words submitted"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Waiting for both teams to submit their words…</div>
          <div style={{ background: PANEL, color: INK, padding: "12px 20px", width: "100%", maxWidth: 360 }}>
            <WaitingList players={teamWritingWaitingList} myName={me.name} colors={{ mid: PANEL }} showCount />
          </div>
        </div>
      )
    }
    return (
      <div style={{ height: `calc(100dvh - ${FOOTER_H}px - env(safe-area-inset-bottom, 0px))`, overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>{teamLabel(myTeam)} team</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 16, lineHeight: 1.15 }}>Submit 5 words or phrases.</h1>
        <div style={{ maxWidth: 320, margin: "0 auto 4px" }}>
          <VennDiagram onZoneTap={onZoneTap} selectedZone={diagramSelectedZone} zoneWords={zoneWords} full />
        </div>
        {zoneDescriptionNode()}
        <WordListForm words={initialWords} setWords={setInitialWords} onSubmit={submitWords} submitting={submittingWords} submitLabel="Submit words" maxLength={40} maxDraws={3} takenIndex={takenWordIndex} onEdit={i => { if (takenWordIndex === i) setTakenWordIndex(null) }} />
      </div>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────
  if (game.phase === "finished") {
    const winners = game.winning_teams ?? []
    return (
      <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, padding: "36px 24px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
          <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 20, lineHeight: 1.1 }}>
            {winners.length > 1 ? `${winners.map(teamLabel).join(" & ")} tied!` : `${teamLabel(winners[0])} win!`}
          </div>
        </div>

        <div style={{ margin: "0 -16px" }}>
          <div style={{ padding: "0 16px" }}>
            <VennDiagram onZoneTap={onZoneTap} selectedZone={diagramSelectedZone} zoneWords={zoneWords} full />
          </div>
          {zoneDescriptionNode()}
        </div>

        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 10 }}>The secret rules</div>
        {["A", "B", "C"].map(zone => (
          <div key={zone} style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 8 }}>
            <ZoneChip zone={zone} label={`${ZONE_NAMES[zone]} Ring`} />: {game.ring_rules?.[zone]}
          </div>
        ))}

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
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

  // ── PLAYING ───────────────────────────────────────────────
  const showYourTurnBar = isMyTurn && !game.pending_card_id
  const showKnowerPickBar = isKnower && game.pending_card_id
  const showWhiteBar = !showYourTurnBar && !showKnowerPickBar
  const whiteBarText = game.pending_card_id
    ? (isMyTurn ? "Waiting on the Knower to evaluate your team's guess." : `Waiting on the Knower to evaluate ${teamLabel(activeTeam)}'s guess.`)
    : `${teamLabel(activeTeam)}'s Turn`
  const showKeepGoingModal = game.turn_decision_pending && isMyTurn && resolutionDismissed
  const boysHand = cards.filter(c => c.owner_team === "boys" && !c.zone)
  const girlsHand = cards.filter(c => c.owner_team === "girls" && !c.zone)

  return (
    <div style={{ height: `calc(100dvh - ${FOOTER_H}px - env(safe-area-inset-bottom, 0px))`, overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
      {!(flashResolution && !resolutionDismissed) && showYourTurnBar && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#F4C542", color: "#000", padding: "14px 16px", fontSize: 15, fontWeight: 900, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 2 }}>Round {game.round_number}</div>
          Your Team's Turn
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

      {game.first_empty_team && (
        <div style={{ background: "#F4C542", color: "#000", padding: "10px 16px", fontSize: 14, fontWeight: 800 }}>
          🎉 {teamLabel(game.first_empty_team)} emptied their hand! {teamLabel(game.first_empty_team === "boys" ? "girls" : "boys")} get one more turn to tie…
        </div>
      )}

      {flashResolution && !resolutionDismissed && (() => {
        const isNA = flashResolution.actual_zone === "NA"
        const guesserName = nameOf(flashResolution.guesser_id)
        const guesserTeam = flashResolution.active_team
        const word = cards.find(c => c.id === flashResolution.card_id)?.text ?? ""
        const wordChipEl = <span style={{ background: "#D9E2D5", color: INK, padding: "2px 8px", fontSize: 16, fontWeight: 900, borderRadius: 6, display: "inline-block" }}>{word}</span>
        const title = flashResolution.correct ? "Correct!" : isNA ? "Stumped the Knower!" : "Incorrect"
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: RESOLUTION_MODAL_BG, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 18 }}>{title}</div>

              {flashResolution.correct ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{guesserName} ({teamLabel(guesserTeam)}) got it:</div>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, marginBottom: 20 }}>
                    {wordChipEl} belongs in the <ZoneChip zone={flashResolution.actual_zone} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{guesserName} ({teamLabel(guesserTeam)}) guessed:</div>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, marginBottom: 16 }}>
                    {wordChipEl} <span style={{ opacity: 0.6, fontWeight: 900 }}>+</span> <ZoneChip zone={flashResolution.guessed_zone} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
                    {isNA ? "But it doesn't fit any zone:" : "But the Knower moved it:"}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, marginBottom: 16 }}>
                    {wordChipEl} <span style={{ opacity: 0.6, fontWeight: 900 }}>→</span> <ZoneChip zone={isNA ? "NA" : flashResolution.actual_zone} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.75, marginBottom: 20 }}>
                    {isNA ? <>{teamLabel(guesserTeam)} get a new word, but go again — no penalty.</> : <>{teamLabel(guesserTeam)} take new word(s) as a penalty.</>}
                  </div>
                </>
              )}

              <button onClick={dismissResolutionModal} style={{ background: "rgba(42,48,60,0.15)", color: INK, fontWeight: 900, padding: "12px 24px", width: "100%" }}>
                {(() => {
                  if (isNA) return "Continue"
                  if (game.phase === "finished") return "See who won →"
                  if (game.turn_decision_pending) return isMyTurn ? "It's your call — keep going? →" : `Waiting on ${teamLabel(activeTeam)} →`
                  if (isKnower) return "Continue"
                  return isMyTurn ? "Your turn →" : `${teamLabel(activeTeam)}' turn →`
                })()}
              </button>
            </div>
          </div>
        )
      })()}

      {isKnower && game.pending_card_id && !knowerActAlertDismissed && !(flashResolution && !resolutionDismissed) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: RESOLUTION_MODAL_BG, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Your turn!</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>
              {nameOf(game.pending_player_id)} ({teamLabel(activeTeam)}) guessed{" "}
              <span style={{ background: "#D9E2D5", color: INK, padding: "2px 8px", fontSize: 16, fontWeight: 900, borderRadius: 6, display: "inline-block" }}>{pendingCard?.text}</span>
              . Place it in the right zone.
            </div>
            <button onClick={() => setKnowerActAlertDismissed(true)} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "12px 24px", width: "100%" }}>
              Place it →
            </button>
          </div>
        </div>
      )}

      {showKeepGoingModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: RESOLUTION_MODAL_BG, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Nice! Keep going?</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 22 }}>
              A miss now costs you 2 words instead of 1.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => teamTurnDecision(true)} disabled={turnDecisionBusy} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
                Try Another Word
              </button>
              <button onClick={() => teamTurnDecision(false)} disabled={turnDecisionBusy} style={{ background: "rgba(42,48,60,0.15)", color: INK, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
                Stop Here
              </button>
            </div>
          </div>
        </div>
      )}

      {liveSelectionPill(isMyTurn)}

      <div style={{ padding: "16px 0" }}>
        <VennDiagram
          onZoneTap={onZoneTap}
          selectedZone={diagramSelectedZone}
          zoneWords={zoneWords}
          disabled={resolving || submittingGuess}
        />
      </div>

      {zoneDescriptionNode()}

      {game.pending_card_id && !isKnower && (
        <div style={{ margin: "0 16px 16px", background: "rgba(42,48,60,0.12)", padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {nameOf(game.pending_player_id)} ({teamLabel(activeTeam)}) placed <b>"{pendingCard?.text}"</b> in the <ZoneChip zone={game.pending_zone} />.
          </div>
        </div>
      )}

      <div style={{ background: "#2D3B51", color: "white", flex: 1, paddingTop: 16, paddingBottom: 16 }}>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {teamHandRow(activeTeam, activeTeam === "boys" ? boysHand : girlsHand, isMyTurn && !game.pending_card_id)}
          {teamHandRow(activeTeam === "boys" ? "girls" : "boys", activeTeam === "boys" ? girlsHand : boysHand, false)}
        </div>
      </div>

      {menuNode()}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {isMyTurn && !game.pending_card_id && !game.turn_decision_pending && (
          <FooterButton onClick={confirmPlacement} disabled={!canConfirmPlacement || submittingGuess}>
            {submittingGuess ? "Placing…" : inspectZone === "NA" ? "You can't guess the N/A Zone" : "Confirm"}
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
