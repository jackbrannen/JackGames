"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import VennDiagram from "../../../components/VennDiagram"

const BG = "#FFBBE5"
const INK = "#3C3022"
const INK_MUTED = "rgba(60,48,34,0.6)"
const DARK = "#882F9E"
const PANEL = "#FFD1F5"
const WARM = "#FFBDF1"
const BTN = "#3C3022"
const BTN_TEXT = "#FFF4F0"
const RED = "#C0392B"
const POKE_COLORS = { dark: DARK, mid: "#7A2A8E", wl: WARM, yellow: BTN }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const ZONE_LABELS = {
  A: "Ring A", B: "Ring B", C: "Ring C",
  AB: "A ∩ B", AC: "A ∩ C", BC: "B ∩ C", ABC: "A ∩ B ∩ C", OUTSIDE: "Outside all rings",
}
const ZONE_ORDER = ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE"]

function fetchIdeas(n, ex) {
  return supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])
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

  const [ruleA, setRuleA] = useState("")
  const [ruleB, setRuleB] = useState("")
  const [ruleC, setRuleC] = useState("")
  const [submittingRules, setSubmittingRules] = useState(false)

  const [initialWords, setInitialWords] = useState(Array(7).fill(""))
  const [submittingWords, setSubmittingWords] = useState(false)

  const [replenishWords, setReplenishWords] = useState(["", "", ""])
  const [submittingReplenish, setSubmittingReplenish] = useState(false)

  const [resolving, setResolving] = useState(false)
  const [flashResolution, setFlashResolution] = useState(null)

  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)
  const lastResolutionCardRef = useRef(null)

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
      setTimeout(() => setFlashResolution(null), 4000)
    }

    const key = `${g.phase}:${g.turn_index}:${g.round_number}:${g.pending_card_id ?? ""}:${g.final_chance_index}:${(g.winner_ids || []).join(",")}:${(ps ?? []).map(p => p.words_submitted).join("")}:${(ps ?? []).map(p => p.replenish_submitted).join("")}`
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
  const myHand = cards.filter(c => c.owner_player_id === myPlayerId && !c.zone)
  const activeHand = cards.filter(c => c.owner_player_id === activePlayerId && !c.zone)
  const pendingCard = game?.pending_card_id ? cards.find(c => c.id === game.pending_card_id) : null
  const pendingPlayer = game?.pending_player_id ? players.find(p => p.id === game.pending_player_id) : null
  const zoneCards = inspectZone ? cards.filter(c => c.zone === inspectZone) : []

  function nameOf(id) { return players.find(p => p.id === id)?.name ?? "?" }

  async function onZoneTap(zone) {
    setInspectZone(zone)
    if (game?.phase === "replenishing" || game?.phase === "finished") return
    if (isKnower && game?.pending_card_id) {
      if (resolving) return
      setResolving(true)
      const { error } = await supabase.rpc("tir_resolve_placement", { p_code: code, p_knower_id: myPlayerId, p_zone: zone })
      setResolving(false)
      if (error) { alert(error.message); return }
      nudge()
      return
    }
    if (isMyTurn && selectedCardId && !game?.pending_card_id) {
      const cardId = selectedCardId
      setSelectedCardId(null)
      const { error } = await supabase.rpc("tir_submit_guess", { p_code: code, p_player_id: myPlayerId, p_card_id: cardId, p_zone: zone })
      if (error) { alert(error.message); return }
      nudge()
    }
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

  function fillNextWordSlot(idea) {
    setInitialWords(prev => {
      const idx = prev.findIndex(w => !w.trim())
      if (idx === -1) return prev
      const next = [...prev]; next[idx] = idea; return next
    })
  }
  function fillNextReplenishSlot(idea) {
    setReplenishWords(prev => {
      const idx = prev.findIndex(w => !w.trim())
      if (idx === -1) return prev
      const next = [...prev]; next[idx] = idea; return next
    })
  }

  function menuNode() {
    return (
      <>
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me?.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
          gamePhase={game?.phase}
          onResetToLobby={async () => { await supabase.rpc("tir_reset_to_lobby", { p_code: code }); nudge() }}
        />
      </>
    )
  }

  if (loading || !game || !me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: INK_MUTED, fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }

  // ── SETUP ────────────────────────────────────────────────
  if (game.phase === "setup") {
    if (isKnower) {
      if (game.rules_submitted) {
        const waitingOn = finders.filter(p => !p.words_submitted)
        return (
          <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Rules locked in</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Waiting for players to submit their words…</div>
            {waitingOn.map(p => <div key={p.id} style={{ fontSize: 15, fontWeight: 700, color: INK_MUTED, marginBottom: 4 }}>{p.name}</div>)}
          </div>
        )
      }
      return (
        <div style={{ minHeight: "100dvh", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>You're the Knower</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Write a secret rule for each ring.</h1>
          {[["Ring A", ruleA, setRuleA], ["Ring B", ruleB, setRuleB], ["Ring C", ruleC, setRuleC]].map(([label, val, setter]) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, opacity: 0.7 }}>{label}</div>
              <TextEntry value={val} onChange={setter} placeholder={`e.g. "starts with a vowel"`} maxLength={80} multiline={false} bg={WARM} style={{ color: INK }} />
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
          <div style={{ fontSize: 22, fontWeight: 900 }}>Waiting for everyone else…</div>
        </div>
      )
    }
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Setup</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Submit 7 words or phrases.</h1>
        {initialWords.map((w, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <TextEntry value={w} onChange={v => setInitialWords(prev => prev.map((x, j) => j === i ? v : x))} placeholder={`Word ${i + 1}`} maxLength={40} multiline={false} bg={WARM} style={{ color: INK }} />
          </div>
        ))}
        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <RandomIdeas bg={WARM} yellow={BTN} fetchIdeas={fetchIdeas} maxDraws={5} onIdeaClick={fillNextWordSlot} />
        </div>
        <button onClick={submitWords} disabled={submittingWords || initialWords.some(w => !w.trim())}
          style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block" }}>
          {submittingWords ? "Submitting…" : "Submit words"}
        </button>
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
      <div style={{ minHeight: "100dvh", background: BG, color: INK, padding: "36px 24px", paddingBottom: BOTTOM_PAD }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Word pool is empty</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 20, lineHeight: 1.15 }}>Everyone add 3 more words.</h1>
        {replenishWords.map((w, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <TextEntry value={w} onChange={v => setReplenishWords(prev => prev.map((x, j) => j === i ? v : x))} placeholder={`Word ${i + 1}`} maxLength={40} multiline={false} bg={WARM} style={{ color: INK }} />
          </div>
        ))}
        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <RandomIdeas bg={WARM} yellow={BTN} fetchIdeas={fetchIdeas} maxDraws={2} onIdeaClick={fillNextReplenishSlot} />
        </div>
        <button onClick={submitReplenish} disabled={submittingReplenish || replenishWords.some(w => !w.trim())}
          style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block" }}>
          {submittingReplenish ? "Submitting…" : "Submit words"}
        </button>
      </div>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────
  if (game.phase === "finished") {
    const winners = (game.winner_ids ?? []).map(id => nameOf(id))
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
        <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 12, lineHeight: 1.1 }}>
          {winners.length > 1 ? `${winners.join(" & ")} tied!` : `${winners[0] ?? "?"} wins!`}
        </div>
        <div style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 8 }}>Ring A: {game.ring_rules?.A}</div>
        <div style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 8 }}>Ring B: {game.ring_rules?.B}</div>
        <div style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 28 }}>Ring C: {game.ring_rules?.C}</div>
        <button onClick={async () => {
          if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
          const { data, error } = await supabase.rpc("tir_create_replay", { p_code: code })
          if (error) { alert(error.message); return }
          nudge()
          router.replace(`/${data}`)
        }} style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", marginTop: 8, maxWidth: 320, width: "100%" }}>Play Again</button>
        <a href="https://games.jackbrannen.com" style={{ display: "block", background: PANEL, color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", marginTop: 10 }}>Play Another Game</a>
      </div>
    )
  }

  // ── PLAYING / FINAL_CHANCE ───────────────────────────────
  const inFinalChance = game.phase === "final_chance"

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
      <div style={{ background: DARK, padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>
          Round {game.round_number}
        </div>
      </div>

      {inFinalChance && (
        <div style={{ background: "#F4C542", color: "#000", padding: "10px 16px", fontSize: 14, fontWeight: 800 }}>
          🎉 {nameOf(game.winner_ids?.[0])} emptied their hand! Waiting to see if {game.final_chance_ids.map(nameOf).join(", ")} can tie…
        </div>
      )}

      {flashResolution && (
        <div style={{ background: flashResolution.correct ? "#2E7D32" : RED, color: "white", padding: "10px 16px", fontSize: 14, fontWeight: 700 }}>
          {flashResolution.correct
            ? `${nameOf(flashResolution.guesser_id)} placed "${cards.find(c => c.id === flashResolution.card_id)?.text ?? ""}" correctly in ${ZONE_LABELS[flashResolution.actual_zone]}.`
            : `${nameOf(flashResolution.guesser_id)} guessed ${ZONE_LABELS[flashResolution.guessed_zone]} — it actually belongs in ${ZONE_LABELS[flashResolution.actual_zone]}.`}
        </div>
      )}

      <div style={{ padding: "16px" }}>
        <VennDiagram
          onZoneTap={onZoneTap}
          selectedZone={inspectZone}
          labels={{ A: "A", B: "B", C: "C" }}
          disabled={resolving}
        />
      </div>

      {inspectZone && (
        <div style={{ margin: "0 16px 16px", background: PANEL, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 8 }}>{ZONE_LABELS[inspectZone]}</div>
          {zoneCards.length === 0
            ? <div style={{ fontSize: 14, color: INK_MUTED, fontStyle: "italic" }}>Nothing placed here yet</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {zoneCards.map(c => (
                  <div key={c.id} style={{ background: WARM, padding: "6px 12px", fontSize: 14, fontWeight: 700 }}>{c.text}</div>
                ))}
              </div>}
        </div>
      )}

      {game.pending_card_id && (
        <div style={{ margin: "0 16px 16px", background: "rgba(60,48,34,0.12)", padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {nameOf(game.pending_player_id)} guesses <b>"{pendingCard?.text}"</b> belongs in <b>{ZONE_LABELS[game.pending_zone]}</b>
          </div>
          {isKnower && <div style={{ fontSize: 13, color: INK_MUTED, marginTop: 6, fontWeight: 600 }}>Tap the ring it actually belongs in.</div>}
          {!isKnower && <div style={{ fontSize: 13, color: INK_MUTED, marginTop: 6, fontWeight: 600 }}>Waiting on the Knower…</div>}
        </div>
      )}

      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {finders.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "10px 14px" }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>
                {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                {p.id === activePlayerId && <span style={{ fontSize: 11, fontWeight: 900, marginLeft: 8, color: DARK }}>← turn</span>}
              </span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>{handCounts[p.id] ?? 0} 🂠</span>
            </div>
          ))}
        </div>
      </div>

      {activePlayerId && activeHand.length > 0 && !game.pending_card_id && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>
            {isMyTurn ? "Your hand — pick a card, then tap a ring" : `${activePlayer?.name}'s hand`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeHand.map(c => (
              <button
                key={c.id}
                onClick={() => isMyTurn && setSelectedCardId(prev => prev === c.id ? null : c.id)}
                style={{
                  background: selectedCardId === c.id ? BTN : WARM,
                  color: selectedCardId === c.id ? BTN_TEXT : INK,
                  padding: "10px 16px", fontSize: 15, fontWeight: 800,
                  cursor: isMyTurn ? "pointer" : "default",
                }}
              >
                {c.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {menuNode()}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
    </div>
  )
}
