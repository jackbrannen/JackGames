"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Footer, { FOOTER_H } from "../../components/Footer"
import Menu from "../../components/Menu"
import TextEntry from "../../components/TextEntry"
import VennDiagram from "../../components/VennDiagram"
import { ZoneChip, textColorFor, ZONE_RINGS, fetchIdeas } from "../../components/RingHelpers"
import { TIR_RULES } from "../../components/rulesText"

const BG = "#C0C9BC"
const INK = "#2A303C"
const INK_MUTED = "rgba(42,48,60,0.6)"
const DARK = "#2C3827"
const PANEL = "#94A68D"
const BTN = "#2A303C"
const BTN_TEXT = "#FFF4F0"
const RED = "#C0392B"
const INPUT_BG = "#FFFFFF"
const BOYS = "#3B6FA0"
const GIRLS = "#B5548A"

const MIN_PER_TEAM = 1

function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}
function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

const inputStyle = {
  background: INPUT_BG, color: INK, fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block", border: "none", outline: "none", boxSizing: "border-box",
}
const POKE_COLORS = { dark: DARK, mid: "#3E4F37", wl: "#C1E0B4", yellow: "#FBDF54", notifBg: "#1F2A1B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [phase, setPhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [replayOf, setReplayOf] = useState(null)
  const [ringRules, setRingRules] = useState(null)
  const [ringHints, setRingHints] = useState(null)
  const [rulesSubmitted, setRulesSubmitted] = useState(false)
  const [knowerReady, setKnowerReady] = useState(false)
  const [players, setPlayers] = useState([])
  const [cards, setCards] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)
  const [starting, setStarting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const channelRef = useRef(null)

  const [ruleA, setRuleA] = useState(""); const [hintA, setHintA] = useState("")
  const [ruleB, setRuleB] = useState(""); const [hintB, setHintB] = useState("")
  const [ruleC, setRuleC] = useState(""); const [hintC, setHintC] = useState("")
  const [submittingRules, setSubmittingRules] = useState(false)
  const [showKnowerTips, setShowKnowerTips] = useState(true)

  const [prefillZone, setPrefillZone] = useState(null)
  const [prefillText, setPrefillText] = useState("")
  const [submittingPrefill, setSubmittingPrefill] = useState(false)
  const [readyBusy, setReadyBusy] = useState(false)
  const [showKnowerTakeoverConfirm, setShowKnowerTakeoverConfirm] = useState(false)
  const [pendingKnowerPick, setPendingKnowerPick] = useState(null)

  const me = players.find(p => p.id === myPlayerId)
  const currentKnower = players.find(p => p.is_knower)
  const boysCount = players.filter(p => p.team === "boys").length
  const girlsCount = players.filter(p => p.team === "girls").length
  const hasKnower = players.some(p => p.is_knower)
  const canStart = knowerReady && boysCount >= MIN_PER_TEAM && girlsCount >= MIN_PER_TEAM

  async function refreshPlayers() {
    const { data } = await supabase.from("tir_players")
      .select("id,name,team,is_knower,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function refreshCards() {
    const { data } = await supabase.from("tir_cards").select("id,text,zone,source").eq("game_code", code).eq("source", "prefill")
    setCards(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase.from("tir_games")
      .select("code,phase,is_dummy,replay_of,replay_code,ring_rules,ring_hints,rules_submitted,knower_ready").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    if (data.replay_code) { router.replace(`/${data.replay_code}`); return }
    setGameExists(true)
    setPhase(data.phase || "lobby")
    setIsDummy(!!data.is_dummy)
    setReplayOf(data.replay_of ?? null)
    setRingRules(data.ring_rules ?? null)
    setRingHints(data.ring_hints ?? null)
    setRulesSubmitted(!!data.rules_submitted)
    setKnowerReady(!!data.knower_ready)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`thingsinrings:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(() => { refreshPlayers(); refreshCards() })
  }, [code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers(); refreshCards() }
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`tir-lobby-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tir_players", filter: `game_code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "tir_games", filter: `code=eq.${code}` }, loadState)
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

  useEffect(() => {
    if (phase && phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [phase, myPlayerId])

  const hasAutoJoinedRef = useRef(false)
  useEffect(() => {
    if (!isDummy || gameExists !== true || phase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const { data, error } = await supabase.from("tir_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      await supabase.rpc("tir_set_role", { p_code: code, p_player_id: data.id, p_role: boysCount <= girlsCount ? "boys" : "girls" })
      localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, phase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay.
  const hasReplayJoinedRef = useRef(false)
  useEffect(() => {
    if (!replayOf || gameExists !== true || phase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`thingsinrings:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`thingsinrings:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const { data, error } = await supabase.from("tir_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "" })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [replayOf, gameExists, phase, myPlayerId, code])

  // Dummy games auto-fill the Knower's rules+hints so solo testing doesn't
  // require manually typing through all 6 fields.
  const autoFilledRulesRef = useRef(false)
  useEffect(() => {
    if (!isDummy || phase !== "lobby" || !me?.is_knower || rulesSubmitted || autoFilledRulesRef.current) return
    autoFilledRulesRef.current = true
    fetchIdeas(6, []).then(ideas => {
      if (ideas[0]) setRuleA(ideas[0]); if (ideas[1]) setHintA(ideas[1])
      if (ideas[2]) setRuleB(ideas[2]); if (ideas[3]) setHintB(ideas[3])
      if (ideas[4]) setRuleC(ideas[4]); if (ideas[5]) setHintC(ideas[5])
    })
  }, [isDummy, phase, me?.is_knower, rulesSubmitted])

  async function join(role) {
    const trimmed = name.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmed || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true); setJoinError("")
    const { data: existing } = await supabase.from("tir_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("tir_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    await supabase.rpc("tir_set_role", { p_code: code, p_player_id: data.id, p_role: role })
    localStorage.setItem(`thingsinrings:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function setRole(role) {
    if (!me) return
    await supabase.rpc("tir_set_role", { p_code: code, p_player_id: me.id, p_role: role })
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function submitRingDefinitions() {
    if (submittingRules || !ruleA.trim() || !hintA.trim() || !ruleB.trim() || !hintB.trim() || !ruleC.trim() || !hintC.trim()) return
    setSubmittingRules(true)
    const { error } = await supabase.rpc("tir_submit_ring_definitions", {
      p_code: code, p_knower_id: me.id,
      p_rule_a: ruleA.trim(), p_hint_a: hintA.trim(),
      p_rule_b: ruleB.trim(), p_hint_b: hintB.trim(),
      p_rule_c: ruleC.trim(), p_hint_c: hintC.trim(),
    })
    if (error) { alert(error.message); setSubmittingRules(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function addPrefill() {
    if (!prefillZone || !prefillText.trim() || submittingPrefill) return
    setSubmittingPrefill(true)
    await supabase.rpc("tir_knower_prefill_zone", { p_code: code, p_knower_id: me.id, p_zone: prefillZone, p_text: prefillText.trim() })
    setPrefillText("")
    setSubmittingPrefill(false)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function removePrefill(cardId) {
    await supabase.rpc("tir_knower_remove_prefill", { p_code: code, p_knower_id: me.id, p_card_id: cardId })
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function toggleKnowerReady() {
    if (!me || readyBusy) return
    setReadyBusy(true)
    await supabase.rpc("tir_knower_set_ready", { p_code: code, p_knower_id: me.id, p_ready: !knowerReady })
    setReadyBusy(false)
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function startGame() {
    if (starting || !canStart) return
    setStarting(true)
    const { error } = await supabase.rpc("tir_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function invite() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: `Join Things in Rings — ${code}`, url })
    else { await navigator.clipboard.writeText(url); alert("Link copied!") }
  }

  function roleSelector(onPick) {
    const myRole = me ? (me.is_knower ? "knower" : me.team) : null
    // Taking the Knower role away from someone who already holds it wipes
    // whatever they've entered (rules/hints/prefills) — confirm first rather
    // than silently clobbering their work. No confirmation needed if nobody
    // holds it yet, or if it's already me (re-picking is a no-op).
    function pickKnower() {
      if (myRole === "knower") return
      if (currentKnower && currentKnower.id !== me?.id) {
        setPendingKnowerPick(() => () => onPick("knower"))
        setShowKnowerTakeoverConfirm(true)
        return
      }
      onPick("knower")
    }
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => onPick("boys")}
            disabled={joining}
            style={{ background: BOYS, color: "white", fontSize: 18, fontWeight: 900, padding: 18, border: myRole === "boys" ? "3px solid white" : "3px solid transparent", boxSizing: "border-box" }}
          >
            {joining && myRole === "boys" ? "Joining…" : "Boys"}
          </button>
          <button
            onClick={() => onPick("girls")}
            disabled={joining}
            style={{ background: GIRLS, color: "white", fontSize: 18, fontWeight: 900, padding: 18, border: myRole === "girls" ? "3px solid white" : "3px solid transparent", boxSizing: "border-box" }}
          >
            {joining && myRole === "girls" ? "Joining…" : "Girls"}
          </button>
        </div>
        <button
          onClick={pickKnower}
          disabled={joining}
          style={{ background: myRole === "knower" ? BTN : "rgba(42,48,60,0.12)", color: myRole === "knower" ? BTN_TEXT : INK, fontSize: 16, fontWeight: 900, padding: 16, width: "100%", display: "block" }}
        >
          {joining && myRole === "knower" ? "Joining…" : myRole === "knower" ? "Playing as Knower ✓" : "Play as Knower"}
        </button>
      </div>
    )
  }

  if (gameExists === null) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: INK_MUTED, fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!gameExists) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}><p style={{ color: INK, fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p></div>
  }
  if (phase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.5, marginBottom: 16, color: INK }}>Things in Rings</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: INK }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, color: INK_MUTED, fontWeight: 600 }}>This page will update automatically.</p>
      </div>
    )
  }

  const zoneWords = Object.fromEntries(
    ["A", "B", "C", "AB", "AC", "BC", "ABC", "OUTSIDE", "NA"].map(z => [z, cards.filter(c => c.zone === z).map(c => c.text)])
  )
  const prefillInZone = cards.filter(c => c.zone === prefillZone)

  return (
    <div style={{ height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
      {showKnowerTakeoverConfirm && (
        <div onClick={() => setShowKnowerTakeoverConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "28px 24px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>Take over as Knower?</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>
              {currentKnower ? `${currentKnower.name} is` : "Someone else is"} currently the Knower. Switching yourself to Knower will erase anything they've already entered — rules, hints, and any prefilled words.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowKnowerTakeoverConfirm(false)} style={{ flex: 1, background: "rgba(42,48,60,0.15)", color: INK, fontWeight: 900, padding: "12px 16px" }}>
                Cancel
              </button>
              <button
                onClick={() => { pendingKnowerPick?.(); setShowKnowerTakeoverConfirm(false) }}
                style={{ flex: 1, background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "12px 16px" }}
              >
                Yes, take over
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ background: DARK, padding: "24px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Things in Rings</div>
          <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, color: "white" }}>{code}</div>
        </div>
        <button onClick={invite} style={{ background: "rgba(255,255,255,0.2)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px", flexShrink: 0 }}>Invite</button>
      </div>

      <div style={{ padding: "20px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 10 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {players.length === 0 && <div style={{ fontSize: 14, color: INK_MUTED, fontStyle: "italic" }}>No players yet</div>}
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: PANEL, padding: "12px 14px" }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: INK }}>
                {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
              </span>
              {p.is_knower ? (
                <span style={{ background: BTN, color: BTN_TEXT, fontSize: 12, fontWeight: 900, padding: "6px 12px" }}>Knower</span>
              ) : p.team ? (
                <span style={{ background: p.team === "boys" ? BOYS : GIRLS, color: "white", fontSize: 12, fontWeight: 900, padding: "6px 12px", textTransform: "capitalize" }}>{p.team}</span>
              ) : null}
              {p.id !== myPlayerId && (
                <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("tir_players").delete().eq("id", p.id); refreshPlayers() } }}
                  aria-label={`Remove ${p.name}`}
                  style={{ background: "transparent", border: "none", color: INK_MUTED, fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>✕</button>
              )}
            </div>
          ))}
        </div>
        {!canStart && (
          <p style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, marginTop: 12 }}>
            {!hasKnower ? "One player must volunteer as the Knower." :
              !knowerReady ? "Waiting for the Knower to finish setup and get ready." :
              `Need ${Math.max(0, MIN_PER_TEAM - boysCount)} more on Boys, ${Math.max(0, MIN_PER_TEAM - girlsCount)} more on Girls.`}
          </p>
        )}
      </div>

      <div style={{ padding: "8px 20px 0" }}>
        {!me ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 12 }}>Join Game</div>
            {!savedProfile && (
              <>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              </>
            )}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name" maxLength={40} style={{ ...inputStyle, marginBottom: 12 }} />
            {roleSelector(join)}
            {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginTop: 10 }}>{joinError}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK, opacity: 0.55, marginBottom: 12 }}>Your role</div>
            {roleSelector(setRole)}
            <button onClick={startGame} disabled={!canStart || starting}
              style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "18px", width: "100%", display: "block", marginTop: 16 }}>
              {starting ? "Starting…" : "Start Game"}
            </button>
          </>
        )}
      </div>

      {me?.is_knower && (
        <div style={{ marginTop: 28, borderTop: `1px solid rgba(42,48,60,0.15)`, paddingTop: 24 }}>
          {!rulesSubmitted ? (
            <div style={{ padding: "0 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>You're the Knower</div>
              <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, lineHeight: 1.15 }}>Set up the rings before inviting everyone in.</h1>
              <div style={{ display: "grid", gridTemplateRows: showKnowerTips ? "1fr" : "0fr", transition: "grid-template-rows 320ms ease, margin-bottom 320ms ease", marginBottom: showKnowerTips ? 20 : 0 }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ background: PANEL, color: INK, padding: "18px 18px 16px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6, marginBottom: 10 }}>
                      For each ring, write a secret <b>Rule</b> (what actually belongs there) and a <b>Hint</b> (what players see instead — a vaguer clue toward the same idea).
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6, marginBottom: 10 }}>For example, if the Rule is "Things that are found in a kitchen," the Hint might be "Things in a room in your house."</div>
                    <button onClick={() => setShowKnowerTips(false)} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "10px 20px", width: "100%" }}>
                      Got It
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateRows: showKnowerTips ? "0fr" : "1fr", transition: "grid-template-rows 320ms ease, margin-bottom 320ms ease", marginBottom: showKnowerTips ? 0 : 20 }}>
                <div style={{ overflow: "hidden" }}>
                  <button onClick={() => setShowKnowerTips(true)} style={{ background: PANEL, color: INK, fontSize: 14, fontWeight: 800, padding: "8px 16px" }}>
                    Tips
                  </button>
                </div>
              </div>
              <div style={{ maxWidth: 320, margin: "0 auto 24px" }}>
                <VennDiagram onZoneTap={() => {}} selectedZone={null} full />
              </div>
              {[["A", ruleA, setRuleA, hintA, setHintA], ["B", ruleB, setRuleB, hintB, setHintB], ["C", ruleC, setRuleC, hintC, setHintC]].map(([zone, rVal, rSet, hVal, hSet]) => (
                <div key={zone} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}><ZoneChip zone={zone} label={`${zone === "A" ? "Red" : zone === "B" ? "Green" : "Blue"} Ring`} /></div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 4 }}>Rule for the ring</div>
                  <div style={{ marginBottom: 10 }}>
                    <TextEntry value={rVal} onChange={rSet} placeholder="Person/object/concept/word rule" maxLength={80} multiline={false} bg={INPUT_BG} style={{ color: INK }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 4 }}>Hint for players</div>
                  <div>
                    <TextEntry value={hVal} onChange={hSet} placeholder="Person/object/concept/word rule" maxLength={80} multiline={false} bg={INPUT_BG} style={{ color: INK }} />
                  </div>
                </div>
              ))}
              <button onClick={submitRingDefinitions} disabled={submittingRules || !ruleA.trim() || !hintA.trim() || !ruleB.trim() || !hintB.trim() || !ruleC.trim() || !hintC.trim()}
                style={{ background: BTN, color: BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block", marginTop: 8 }}>
                {submittingRules ? "Saving…" : "Lock in rules & hints"}
              </button>
            </div>
          ) : (
            <div style={{ padding: "0 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Rules locked in</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12, lineHeight: 1.15 }}>Optionally pre-fill a few zones for context.</h1>
              <p style={{ fontSize: 14, color: INK_MUTED, fontWeight: 600, marginBottom: 16 }}>
                Tap a zone, then type a word that belongs there. These are just examples for players to see while they write their own words — not required, and not part of anyone's hand.
              </p>
              <div style={{ background: PANEL, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.55, marginBottom: 10 }}>Your rules & hints</div>
                {["A", "B", "C"].map(zone => (
                  <div key={zone} style={{ marginBottom: zone === "C" ? 0 : 10 }}>
                    <div style={{ marginBottom: 3 }}><ZoneChip zone={zone} label={`${zone === "A" ? "Red" : zone === "B" ? "Green" : "Blue"} Ring`} /></div>
                    <div style={{ fontSize: 13, color: INK, fontWeight: 600, lineHeight: 1.4 }}>Rule: {ringRules?.[zone]}</div>
                    <div style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, lineHeight: 1.4 }}>Hint: {ringHints?.[zone]}</div>
                  </div>
                ))}
              </div>
              <div style={{ maxWidth: 320, margin: "0 auto 16px" }}>
                <VennDiagram onZoneTap={z => setPrefillZone(prev => prev === z ? null : z)} selectedZone={prefillZone} zoneWords={zoneWords} full />
              </div>
              {prefillZone && (
                <div style={{ background: PANEL, padding: "14px 16px", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}><ZoneChip zone={prefillZone} /></div>
                  {prefillInZone.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {prefillInZone.map(c => (
                        <span key={c.id} style={{ background: "rgba(42,48,60,0.12)", color: INK, padding: "5px 10px", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {c.text}
                          <button onClick={() => removePrefill(c.id)} style={{ background: "none", border: "none", color: INK_MUTED, fontWeight: 900, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <TextEntry value={prefillText} onChange={setPrefillText} placeholder="Add a word" maxLength={40} multiline={false} bg={INPUT_BG} style={{ color: INK }} />
                    </div>
                    <button onClick={addPrefill} disabled={!prefillText.trim() || submittingPrefill} style={{ background: BTN, color: BTN_TEXT, fontWeight: 900, padding: "0 18px" }}>Add</button>
                  </div>
                </div>
              )}
              <button onClick={toggleKnowerReady} disabled={readyBusy}
                style={{ background: knowerReady ? "rgba(42,48,60,0.12)" : BTN, color: knowerReady ? INK : BTN_TEXT, fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block", marginBottom: 24 }}>
                {readyBusy ? "…" : knowerReady ? "Ready ✓ (tap to edit more)" : "I'm ready — invite everyone in"}
              </button>
            </div>
          )}
        </div>
      )}

      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me?.name}
        playerDetails={players.map(p => ({ name: p.name }))}
        rules={TIR_RULES}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
    </div>
  )
}
