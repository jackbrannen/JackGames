"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import WaitingList from "../../../components/WaitingList"
import TextEntry from "../../../components/TextEntry"
import { useSubmitNudge } from "../../../lib/useSubmitNudge"
import useTypingPresence from "../../../lib/useTypingPresence"
import { RULES } from "../../../lib/rules"
import { playSubmit, playYourTurn } from "../../../lib/sounds"

const SHRUG = "🤷"

const BG = "#FF85FD"
const INK = "#3C3022"
const INK_MUTED = "rgba(60,48,34,0.6)"
const DARK = "#882F9E"        // cool-dark (hue ~288) — status/header bars
const PANEL = "#FFD1F5"       // warm light (hue ~313) — cards/wells
const WARM = "#FFBDF1"        // warm light (hue ~313) — inputs, secondary buttons
const BTN = "#3C3022"
const BTN_TEXT = "#FFF4F0"
const RED = "#C0392B"
const POKE_COLORS = { dark: DARK, mid: "#7A2A8E", wl: "#6E2682", yellow: "#FFC857", notifBg: "#4E1A5C" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [pokes, setPokes] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState(["", "", ""])
  const [shrugs, setShrugs] = useState([false, false, false])
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState(null)
  const prevTimerRef = useRef(null)
  const [pokeCooldown, setPokeCooldown] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const channelRef = useRef(null)
  const soundPhaseRef = useRef(null)
  const syncKeyRef = useRef(null)
  const { onTypingChange, typingPlayerIds } = useTypingPresence("sp", code, myPlayerId)

  const me = players.find(p => p.id === myPlayerId)
  const timerDuration = game?.timer_seconds ?? 0
  const answeringStartedAt = game?.answering_started_at ?? null
  const elapsed = useMemo(() => {
    if (!answeringStartedAt) return 0
    return Math.max(0, (Date.now() - new Date(answeringStartedAt).getTime()) / 1000)
  }, [answeringStartedAt])
  const prompts = game?.prompts ?? []
  const round = (game?.round_index ?? 0) + 1
  const matchFlags = game?.match_flags ?? [false, false, false]
  const threshold = game?.match_threshold ?? 2
  const everyone = threshold >= players.length

  async function loadState() {
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from("sp_games").select("*").eq("code", code).single(),
      supabase.from("sp_players").select("*").eq("game_code", code).order("created_at"),
    ])
    if (!g) { router.replace(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    const { data: as } = await supabase.from("sp_answers").select("*").eq("game_code", code).eq("round_index", g.round_index)
    setGame(g); setPlayers(ps ?? []); setAnswers(as ?? []); setLoading(false)
    // Gossip: whoever notices a phase/round change re-broadcasts a sync so any
    // peer that missed the realtime push catches up in a round-trip, not on the poll.
    const key = `${g.phase}:${g.round_index}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  async function loadPokes() {
    const { data } = await supabase.from("pokes").select("*").eq("room_code", code).order("created_at", { ascending: false }).limit(10)
    if (data) setPokes(data)
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  useEffect(() => {
    const stored = localStorage.getItem(`samepage:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState(); loadPokes()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const ch = supabase.channel(`samepage-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sp_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "sp_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "sp_answers", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = ch
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(ch) }
  }, [code])

  // Reset drafts each round; dummy games prefill with the letters so a solo
  // tester gets guaranteed matches.
  useEffect(() => {
    if (game?.is_dummy && Array.isArray(game?.prompts)) {
      setDrafts(game.prompts.map(p => p.letter))
    } else {
      setDrafts(["", "", ""])
    }
    setShrugs([false, false, false])
    setSubmitting(false)
  }, [game?.round_index, game?.is_dummy])

  // Chirp when an actionable phase begins for the player (write answers / mark
  // matches). Skips the initial load so navigating in doesn't fire it.
  useEffect(() => {
    if (!game) return
    const prev = soundPhaseRef.current
    soundPhaseRef.current = game.phase
    if (prev === null) return
    if (prev !== game.phase && (game.phase === "answering" || game.phase === "reveal")) playYourTurn()
  }, [game?.phase])

  // Answering timer
  useEffect(() => {
    if (game?.phase !== "answering" || timerDuration === 0 || !answeringStartedAt) {
      setTimerRemaining(null)
      prevTimerRef.current = null
      return
    }
    function tick() {
      const e = (Date.now() - new Date(answeringStartedAt).getTime()) / 1000
      const rem = Math.max(0, timerDuration - e)
      setTimerRemaining(rem)
      prevTimerRef.current = rem
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [game?.phase, timerDuration, answeringStartedAt])

  // Auto-submit when timer expires
  useEffect(() => {
    if (timerRemaining !== 0 || prevTimerRef.current === 0) return
    if (hasSubmitted) return
    // Fill any empty/non-shrug answers with SHRUG before force-submitting
    const forced = drafts.map((d, i) => shrugs[i] ? SHRUG : (d.trim() || SHRUG))
    supabase.rpc("sp_submit_answers", { p_code: code, p_player_id: myPlayerId, p_texts: forced })
      .then(() => { playSubmit(); nudge() })
  }, [timerRemaining])

  const myAnswers = answers.filter(a => a.player_id === myPlayerId)
  const hasSubmitted = myAnswers.length >= 3
  const finalTexts = drafts.map((d, i) => (shrugs[i] ? SHRUG : d.trim()))
  const allFilled = finalTexts.every(t => t)
  const nudgeSubmit = useSubmitNudge(drafts.join("|") + shrugs.join(""), hasSubmitted)

  async function submitAnswers() {
    if (!allFilled || submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("sp_submit_answers", { p_code: code, p_player_id: myPlayerId, p_texts: finalTexts })
    if (error) { alert(error.message); setSubmitting(false); throw error }
    playSubmit()
    nudge()
  }
  async function toggleMatch(i) {
    await supabase.rpc("sp_toggle_match", { p_code: code, p_index: i, p_value: !matchFlags[i] })
    nudge()
  }
  async function resolveRound() {
    setConfirming(false)
    const { error } = await supabase.rpc("sp_resolve_round", { p_code: code })
    if (error) { alert(error.message); return }
    nudge()
  }
  async function playAgain() {
    if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
    const { data, error } = await supabase.rpc("sp_create_replay", { p_code: code })
    if (error) { alert(error.message); return }
    nudge()
    router.replace(`/${data}`)
  }
  async function sendPoke(targetName) {
    if (!me || pokeCooldown) return
    setPokeCooldown(true); setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldown(false), 10000)
  }

  if (loading || !game) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: INK_MUTED, fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ color: INK, fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: BTN }}>Back to lobby</a></div>
    </div>
  }

  const matchCount = matchFlags.filter(Boolean).length
  const answersByPrompt = i => answers.filter(a => a.prompt_index === i)
  const submittedIds = new Set(
    players.map(p => p.id).filter(pid => answers.filter(a => a.player_id === pid).length >= 3)
  )

  function letterSquare(letter) {
    return <div style={{ width: 48, height: 48, flexShrink: 0, background: BTN, color: BTN_TEXT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900 }}>{letter}</div>
  }

  function pokeSystem(footer = null) {
    return (
      <>
        <Notifications supabase={supabase} pokes={pokes} roomCode={code} currentPlayer={me.name} colors={POKE_COLORS} />
        <Menu
          supabase={supabase}
          colors={POKE_COLORS}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          roomCode={code}
          currentPlayer={me.name}
          playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
          gamePhase={game.phase}
          rules={RULES}
          onResetToLobby={async () => { await supabase.rpc("sp_reset_to_lobby", { p_code: code }); nudge() }}
        />
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          {footer}
        </Footer>
      </>
    )
  }

  function bankBox(value, label) {
    return (
      <div style={{ flex: 1, background: PANEL, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: INK, lineHeight: 1, flexShrink: 0 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{label}</div>
      </div>
    )
  }
  function bankBanner() {
    return (
      <div style={{ display: "flex", gap: 8, padding: "12px 16px" }}>
        {bankBox(game.bank, <>Banked matches<br /><span style={{ color: INK_MUTED }}>cover empty rounds</span></>)}
        {bankBox(1, "Matches needed this round")}
      </div>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────
  if (game.phase === "finished") {
    const win = game.outcome === "win"
    return (
      <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: INK_MUTED, marginBottom: 12 }}>{win ? "You did it" : "Game over"}</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: win ? INK : RED, marginBottom: 12, lineHeight: 1 }}>
            {win ? "On the same page!" : "Out of sync."}
          </div>
          <div style={{ fontSize: 16, color: INK, fontWeight: 600, marginBottom: 8 }}>
            {win
              ? `You matched your way through all ${game.rounds_total} rounds.`
              : `You made it ${game.round_index + 1} of ${game.rounds_total} rounds.`}
          </div>
          {win && <div style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 8 }}>{game.bank} match{game.bank === 1 ? "" : "es"} left in the bank.</div>}
          <button onClick={playAgain}
            style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", marginTop: 20, maxWidth: 320, width: "100%" }}>Play Again</button>
          <a href="https://games.jackbrannen.com" style={{ display: "block", background: PANEL, color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", marginTop: 10 }}>Play Another Game</a>
        </div>
        {pokeSystem()}
      </>
    )
  }

  const isReveal = game.phase === "reveal" || game.phase === "resolving"

  return (
    <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        <div style={{ background: DARK, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>
            Round {round} of {game.rounds_total} · {isReveal ? "Reveal" : "Answer"}
          </div>
        </div>

        {/* Timer bar */}
        {timerDuration > 0 && game.phase === "answering" && answeringStartedAt && (
          <>
            <style>{`@keyframes spTimerDrain { from { width: 100%; } to { width: 0%; } }`}</style>
            <div style={{ height: 8, background: "rgba(60,48,34,0.15)", position: "relative", overflow: "hidden" }}>
              <div
                key={`sp-timer-${game.round_index}`}
                style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: "100%",
                  background: BTN,
                  animation: `spTimerDrain ${timerDuration}s linear forwards`,
                  animationDelay: `-${elapsed}s`,
                }}
              />
            </div>
          </>
        )}

        {bankBanner()}

        {/* ANSWERING */}
        {!isReveal && (
          <div style={{ padding: "4px 16px 16px" }}>
            {timerRemaining !== null && !hasSubmitted && (
              <div style={{ fontSize: 13, fontWeight: 800, color: timerRemaining <= 10 ? RED : INK_MUTED, textAlign: "right", marginBottom: 4 }}>
                {Math.ceil(timerRemaining)}s
              </div>
            )}
            {!hasSubmitted ? (
              <>
                {prompts.map((p, i) => (
                  <div key={i} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", gap: 0, marginBottom: 8, alignItems: "stretch" }}>
                      {letterSquare(p.letter)}
                      <div style={{ flex: 1, background: PANEL, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 16, fontWeight: 800, color: INK }}>{p.text}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <TextEntry
                          value={shrugs[i] ? "" : drafts[i]}
                          onChange={v => setDrafts(d => d.map((x, j) => (j === i ? v : x)))}
                          onTypingChange={onTypingChange}
                          placeholder={shrugs[i] ? "Shrugging…" : `Answer starting with ${p.letter}…`}
                          maxLength={60}
                          multiline={false}
                          disabled={shrugs[i]}
                          bg={WARM}
                          fontSize={18}
                          style={{ color: INK, opacity: shrugs[i] ? 0.45 : 1 }}
                        />
                      </div>
                      <button
                        aria-label="No idea — shrug"
                        onClick={() => setShrugs(s => s.map((x, j) => (j === i ? !x : x)))}
                        style={{ flexShrink: 0, width: 56, background: shrugs[i] ? BTN : WARM, border: shrugs[i] ? `2px solid ${BTN}` : "2px solid transparent", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        {SHRUG}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 16 }}>Your answers are in. Waiting for everyone…</div>
                <div style={{ color: INK }}>
                  <WaitingList
                    players={players.map(p => ({ name: p.name, done: submittedIds.has(p.id), typing: typingPlayerIds.has(p.id) }))}
                    myName={me.name}
                    onPoke={sendPoke}
                    cooldownActive={pokeCooldown}
                    pokeJustSent={pokeJustSent}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* REVEAL + MATCH CHECK */}
        {isReveal && (
          <div style={{ padding: "4px 16px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 14 }}>Check every prompt where <b>{everyone ? "you all" : `at least ${threshold} of you`}</b> gave the same answer, then submit.</div>
            {prompts.map((p, i) => {
              const checked = !!matchFlags[i]
              return (
                <div key={i} style={{ background: PANEL, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
                    {letterSquare(p.letter)}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 16, fontWeight: 800, color: INK }}>{p.text}</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 14px" }}>
                    {answersByPrompt(i).map(a => {
                      const pl = players.find(x => x.id === a.player_id)
                      return (
                        <div key={a.id} style={{ background: "#fff", borderRadius: 14, padding: "8px 14px", border: "1px solid rgba(60,48,34,0.08)" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.15 }}>{a.text || "—"}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: INK_MUTED, marginTop: 1 }}>{pl?.name}</div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => toggleMatch(i)} disabled={game.phase !== "reveal"}
                    style={{ width: "100%", border: "none", background: checked ? BTN : "rgba(60,48,34,0.1)", color: checked ? "white" : INK, fontSize: 15, fontWeight: 900, padding: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? "white" : INK_MUTED}`, background: checked ? "white" : "transparent", color: BTN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{checked ? "✓" : ""}</span>
                    {everyone ? "Everyone matched" : `${threshold}+ matched`}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pokeSystem(
        !isReveal && !hasSubmitted ? (
          <FooterButton key={`ans-${game.round_index}`} onClick={submitAnswers} disabled={!allFilled || submitting} nudge={nudgeSubmit} bg={BTN} textColor={BTN_TEXT}>
            {allFilled ? "Submit answers" : "Fill in all 3"}
          </FooterButton>
        ) : isReveal ? (
          <FooterButton key={`rev-${game.round_index}`} onClick={() => { setConfirming(true); throw new Error("modal") }} bg={BTN} textColor={BTN_TEXT}>
            {matchCount > 0 ? `Submit ${matchCount} match${matchCount === 1 ? "" : "es"}` : "Submit (no matches)"}
          </FooterButton>
        ) : null
      )}

      {/* Confirm matches */}
      {confirming && (
        <div onClick={() => setConfirming(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginBottom: matchCount > 0 ? 20 : 8 }}>
              {matchCount > 0 ? `Confirm ${matchCount} match${matchCount === 1 ? "" : "es"}?` : "No matches this round?"}
            </div>
            {matchCount === 0 && (
              <p style={{ fontSize: 15, color: INK_MUTED, fontWeight: 600, marginBottom: 20 }}>
                You'll spend a banked match to continue — and if the bank is empty, the game ends.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirming(false)} style={{ flex: 1, background: WARM, color: INK, fontSize: 16, fontWeight: 800, padding: "16px" }}>Back</button>
              <button onClick={resolveRound} style={{ flex: 2, background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px" }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
