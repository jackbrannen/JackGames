"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import { WB_RULES } from "../../../components/rulesText"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const BG = "#FEE471"
const INK = "#221A12"
const INK_MUTED = "rgba(34,26,18,0.6)"
const DARK = "#221A12"
const PANEL = "#FFFFFF"
const WARM = "#FFFFFF"
const BTN = "#221A12"
const BTN_TEXT = "#FFF8ED"
const CARD_GOOD_BG = "#FFFFFF"
const CARD_GOOD_TEXT = "#000000"
const CARD_BAD_BG = "#7D2B5B"
const CARD_BAD_TEXT = "#FFFFFF"
const POKE_COLORS = { dark: DARK, mid: "#3A2E1B", wl: "#5A4A32", yellow: "#FBDF54", notifBg: "#1C140B" }
const FOOTER_ROWS_H = FOOTER_H * 2
const SCROLL_H = `calc(100dvh - ${FOOTER_ROWS_H}px - env(safe-area-inset-bottom, 0px))`
const CARD_W = 98
const CARD_H = 124
const cardBoxStyle = {
  width: "100%", aspectRatio: `${CARD_W} / ${CARD_H}`,
  display: "flex", alignItems: "center", justifyContent: "center",
}

function LetterCard({ card }) {
  const isRed = !!card.red
  return (
    <div style={{
      ...cardBoxStyle,
      background: isRed ? CARD_BAD_BG : CARD_GOOD_BG,
      color: isRed ? CARD_BAD_TEXT : CARD_GOOD_TEXT,
      border: isRed ? "none" : "1px solid rgba(34,26,18,0.15)",
      fontSize: 77, fontWeight: 900,
    }}>
      {card.value}
    </div>
  )
}

function ReverseCard() {
  return (
    <div style={{
      ...cardBoxStyle,
      background: CARD_BAD_BG, color: CARD_BAD_TEXT,
      fontSize: 52, fontWeight: 900,
    }}>
      ⤾
    </div>
  )
}

// Crop focal point for each voice photo (as a CSS object-position), since
// each was shot/framed differently — most are portrait crops where the
// face sits somewhere in the top third rather than dead center.
const ACCENT_META = {
  african_king: { label: "African King", position: "50% 20%" },
  arab: { label: "Arab man", position: "50% 24%" },
  australian: { label: "Australian", position: "50% 16%" },
  british: { label: "British", position: "50% 18%" },
  german: { label: "German", position: "50% 20%" },
  goblin: { label: "Goblin", position: "50% 13%" },
  italian: { label: "Italian Chef", position: "50% 24%" },
  leprechaun: { label: "Leprechaun", position: "50% 30%" },
  nerd: { label: "Nerd", position: "50% 13%" },
  old_man: { label: "Old Man", position: "50% 20%" },
  prospector: { label: "Prospector", position: "50% 11%" },
  raging: { label: "Raging", position: "50% 11%" },
  robot: { label: "Robot", position: "50% 11%" },
  scottish: { label: "Scottish", position: "50% 16%" },
  southern_lady: { label: "Southern Lady", position: "50% 18%" },
}

function AccentCard({ card }) {
  const meta = ACCENT_META[card.id] ?? { label: card.id, position: "50% 25%" }
  return (
    <div style={{ ...cardBoxStyle, position: "relative", overflow: "hidden", padding: 0 }}>
      <img
        src={`/voices/${card.id}.jpg`}
        alt={meta.label}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: meta.position, display: "block" }}
      />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.55)", color: "#FFF8ED",
        fontSize: 22, fontWeight: 800, lineHeight: 1.2, padding: "3px 5px", textAlign: "center",
      }}>
        {meta.label}
      </div>
    </div>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const [roundDoneStep, setRoundDoneStep] = useState(null) // null | "pick" | { confirmId }
  const [newLettersConfirming, setNewLettersConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, forceCountdownTick] = useState(0)

  const channelRef = useRef(null)
  const syncKeyRef = useRef(null)

  const loadSeqRef = useRef(0)
  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from("wb_games").select("*").eq("code", code).single(),
      supabase.from("wb_players").select("*").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return
    if (!g) { router.replace(`/${code}`); return }
    if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g); setPlayers(ps ?? []); setLoading(false)

    const key = `${g.phase}:${g.round_number}:${g.paused}:${(ps ?? []).map(p => `${p.id}:${p.points}:${p.is_eliminated}`).join(",")}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  useEffect(() => {
    const stored = localStorage.getItem(`wordbirds:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    if (isIdle) return
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`wb-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "wb_games", filter: `code=eq.${code}` }, loadState)
        .on("postgres_changes", { event: "*", schema: "public", table: "wb_players", filter: `game_code=eq.${code}` }, loadState)
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState()
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
              supabase.removeChannel(channel)
              connect()
            }, delay)
          }
        })
      channelRef.current = channel
    }

    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  // Countdown ticker for cards_visible_at. msLeft is derived synchronously from
  // game state on every render (not just inside the effect) so the very first
  // render of a new round already reflects the countdown — otherwise there's a
  // one-frame flash of the cards before the effect's setState catches up.
  useEffect(() => {
    if (!game?.cards_visible_at) return
    const id = setInterval(() => forceCountdownTick(n => n + 1), 200)
    return () => clearInterval(id)
  }, [game?.cards_visible_at])

  const me = players.find(p => p.id === myPlayerId)
  const isEliminated = !!me?.is_eliminated
  const activePlayers = players.filter(p => !p.is_eliminated)
  const msLeft = game?.cards_visible_at ? Math.max(0, new Date(game.cards_visible_at).getTime() - Date.now()) : 0
  const countingDown = msLeft > 0
  const secondsLeft = Math.ceil(msLeft / 1000)

  function nameOf(id) { return players.find(p => p.id === id)?.name ?? "?" }

  async function togglePause() {
    if (busy || !game) return
    setBusy(true)
    await supabase.rpc("wb_set_paused", { p_code: code, p_paused: !game.paused })
    setBusy(false)
    nudge()
  }

  async function confirmNewLetters() {
    if (busy) return
    setBusy(true)
    await supabase.rpc("wb_redeal_cards", { p_code: code })
    setBusy(false)
    setNewLettersConfirming(false)
    nudge()
  }

  async function confirmRoundResult(loserId) {
    if (busy) return
    setBusy(true)
    await supabase.rpc("wb_apply_round_result", { p_code: code, p_loser_id: loserId })
    setBusy(false)
    setRoundDoneStep(null)
    nudge()
  }

  async function adjustPoints(playerId, delta) {
    await supabase.rpc("wb_adjust_points", { p_code: code, p_player_id: playerId, p_delta: delta })
    nudge()
  }

  function settingsNode() {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 12 }}>Adjust points</div>
        {players.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ flex: 1, color: "white", fontWeight: 700, fontSize: 14, opacity: p.is_eliminated ? 0.5 : 1 }}>
              {p.name}{p.is_eliminated ? " (out)" : ""}
            </span>
            <button onClick={() => adjustPoints(p.id, -1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>−</button>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", minWidth: 24, textAlign: "center" }}>{p.points}</div>
            <button onClick={() => adjustPoints(p.id, 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>+</button>
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
          playerDetails={players.map(p => ({ name: p.name, score: p.points }))}
          gamePhase={game?.phase}
          rules={WB_RULES}
          settingsContent={settingsNode()}
          onResetToLobby={async () => { await supabase.rpc("wb_reset_to_lobby", { p_code: code }); nudge() }}
          footerHeight={FOOTER_ROWS_H}
        />
      </>
    )
  }

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
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

  // ── FINISHED ─────────────────────────────────────────────
  if (game.phase === "finished") {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
        <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 28, lineHeight: 1.1 }}>{nameOf(game.winner_id)} wins!</div>
        <button onClick={async () => {
          if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
          const { data, error } = await supabase.rpc("wb_create_replay", { p_code: code })
          if (error) { alert(error.message); return }
          nudge()
          router.replace(`/${data}`)
        }} style={{ background: BTN, color: BTN_TEXT, fontSize: 16, fontWeight: 900, padding: "16px 24px", border: "none", marginTop: 8, maxWidth: 320, width: "100%" }}>Play Again</button>
        <a href="https://games.jackbrannen.com" style={{ display: "block", background: PANEL, color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", marginTop: 10 }}>Play Another Game</a>
      </div>
    )
  }

  // ── PLAYING ──────────────────────────────────────────────
  return (
    <div style={{ height: SCROLL_H, overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK }}>
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: DARK, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>Round {game.round_number}</div>
      </div>

      {isEliminated && (
        <div style={{ background: "rgba(34,26,18,0.12)", padding: "14px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 2 }}>You're out — spectating</div>
          <div style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600 }}>Watch the rest of the game play out.</div>
        </div>
      )}

      <div style={{ padding: "24px 16px" }}>
        {game.paused ? (
          <div style={{ background: PANEL, color: INK, padding: "40px 16px", textAlign: "center", fontSize: 20, fontWeight: 900 }}>
            Paused
          </div>
        ) : countingDown ? (
          <div style={{ background: PANEL, color: INK, padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, marginBottom: 8 }}>Get ready…</div>
            <div style={{ fontSize: 48, fontWeight: 900 }}>{secondsLeft}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: "84%", margin: "0 auto" }}>
            {(game.cards ?? []).map((card, i) => (
              card.type === "reverse" ? <ReverseCard key={i} /> :
              card.type === "accent" ? <AccentCard key={i} card={card} /> :
              <LetterCard key={i} card={card} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.55, marginBottom: 8 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", opacity: p.is_eliminated ? 0.55 : 1 }}>
              <div style={{
                background: BTN, color: BTN_TEXT, fontSize: 20, fontWeight: 900,
                minWidth: 52, textAlign: "center", padding: "10px 0", flexShrink: 0,
              }}>
                {p.points}
              </div>
              <div style={{ background: PANEL, padding: "10px 16px", flex: 1, display: "flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 15, fontWeight: 700,
                  textDecoration: p.is_eliminated ? "line-through" : "none",
                }}>
                  {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {roundDoneStep === "pick" && (
        <div onClick={() => setRoundDoneStep(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Who lost the round?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {activePlayers.map(p => (
                <button key={p.id} onClick={() => setRoundDoneStep({ confirmId: p.id })}
                  style={{ background: WARM, color: INK, fontSize: 16, fontWeight: 800, padding: "14px", textAlign: "left" }}>
                  {p.name}
                </button>
              ))}
            </div>
            <button onClick={() => setRoundDoneStep({ confirmId: null })}
              style={{ background: "rgba(34,26,18,0.12)", color: INK, fontSize: 15, fontWeight: 800, padding: "14px", width: "100%", marginBottom: 8 }}>
              No one
            </button>
            <button onClick={() => setRoundDoneStep(null)} style={{ background: "transparent", color: INK_MUTED, fontSize: 14, fontWeight: 700, padding: "10px", width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}

      {roundDoneStep && typeof roundDoneStep === "object" && (
        <div onClick={() => setRoundDoneStep(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>
              {roundDoneStep.confirmId ? <>Confirm <b>{nameOf(roundDoneStep.confirmId)}</b> lost a point?</> : "Confirm no one lost a point?"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => confirmRoundResult(roundDoneStep.confirmId)} disabled={busy}
                style={{ flex: 1, background: BTN, color: BTN_TEXT, fontSize: 15, fontWeight: 900, padding: "14px" }}>
                {busy ? "Saving…" : "Confirm"}
              </button>
              <button onClick={() => setRoundDoneStep("pick")} style={{ flex: 1, background: "rgba(34,26,18,0.12)", color: INK, fontSize: 15, fontWeight: 900, padding: "14px" }}>Back</button>
            </div>
          </div>
        </div>
      )}

      {newLettersConfirming && (
        <div onClick={() => setNewLettersConfirming(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Deal a fresh set of cards for this round?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={confirmNewLetters} disabled={busy} style={{ flex: 1, background: BTN, color: BTN_TEXT, fontSize: 15, fontWeight: 900, padding: "14px" }}>
                {busy ? "Dealing…" : "Confirm"}
              </button>
              <button onClick={() => setNewLettersConfirming(false)} style={{ flex: 1, background: "rgba(34,26,18,0.12)", color: INK, fontSize: 15, fontWeight: 900, padding: "14px" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {menuNode()}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={FOOTER_ROWS_H}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex" }}>
            <button onClick={() => setNewLettersConfirming(true)} disabled={busy}
              style={{ flex: 1, height: "100%", background: "rgba(255,255,255,0.22)", color: "white", fontSize: 15, fontWeight: 700 }}>
              New Letters
            </button>
            <button onClick={togglePause} disabled={busy}
              style={{ flex: 1, height: "100%", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 15, fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.09)" }}>
              {game.paused ? "Resume" : "Pause"}
            </button>
          </div>
          <button onClick={() => setRoundDoneStep("pick")} disabled={busy}
            style={{ flex: 1, height: "100%", background: "#FBDF54", color: "#000", fontSize: 17, fontWeight: 900, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
            Round Done
          </button>
        </div>
      </Footer>
    </div>
  )
}
