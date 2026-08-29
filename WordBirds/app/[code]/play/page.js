"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import EndGame from "../../../components/EndGame"
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
const BOYS_COLOR = "#628ab3"
const GIRLS_COLOR = "#b769aa"
const CARD_GOOD_BG = "#FFFFFF"
const CARD_GOOD_TEXT = "#000000"
const CARD_BAD_BG = "#7D2B5B"
const CARD_BAD_TEXT = "#FFFFFF"
const POKE_COLORS = { dark: DARK, mid: "#3A2E1B", wl: "#5A4A32", yellow: "#FBDF54", notifBg: "#1C140B" }
const FOOTER_ROWS_H = FOOTER_H * 2
const scrollH = footerH => `calc(100dvh - ${footerH}px - env(safe-area-inset-bottom, 0px))`
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


export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const [roundDoneStep, setRoundDoneStep] = useState(null) // null | "pick"
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

    const key = `${g.phase}:${g.round_number}:${g.paused}:${g.boys_score}:${g.girls_score}:${g.cards_visible_at}:${(g.round_ready_ids ?? []).join(",")}:${g.redeal_pending_by}:${g.round_result_pending_by}:${g.round_result_pending_winner}:${(ps ?? []).map(p => `${p.id}:${p.team}`).join(",")}`
    if (syncKeyRef.current !== null && syncKeyRef.current !== key) nudge()
    syncKeyRef.current = key
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  // wb_games/wb_players changes: apply the row directly from the realtime
  // payload instead of a full loadState() refetch. Each change
  // independently reaches every subscribed client already, so there's no
  // need to also nudge — nudge() exists for cases where a client's own
  // realtime might be lagging, which doesn't apply to the client that just
  // received this exact event.
  const gamesSyncKeyRef = useRef(null)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(newRow); setLoading(false)
    const key = `${newRow.phase}:${newRow.round_number}:${newRow.paused}:${newRow.boys_score}:${newRow.girls_score}:${newRow.cards_visible_at}:${(newRow.round_ready_ids ?? []).join(",")}:${newRow.redeal_pending_by}:${newRow.round_result_pending_by}:${newRow.round_result_pending_winner}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) nudge()
    gamesSyncKeyRef.current = key
  }
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
    const stored = localStorage.getItem(`wordbirds:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    if (isIdle) return
    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0
    // Only reset reconnectAttempt after the connection has stayed up for a
    // while — resetting on every bare SUBSCRIBED lets a flapping connection
    // (briefly connects, drops, repeat) reconnect+loadState() unthrottled,
    // since each brief success zeroes the backoff right before the next
    // drop. See BUGS.md (found in Copycats, 2026-08-24).
    let stableTimer = null

    function connect() {
      channel = supabase.channel(`wb-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "wb_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { loadState(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "wb_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("broadcast", { event: "sync" }, loadState)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            loadState()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            // A dropped websocket otherwise leaves this client stuck until the 60s poll fires.
            // Recreate the channel instead of waiting on it, backing off if it keeps failing
            // so a persistent outage doesn't turn into a reconnect storm across many clients.
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
      clearTimeout(stableTimer)
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
  const msLeft = game?.cards_visible_at ? Math.max(0, new Date(game.cards_visible_at).getTime() - Date.now()) : 0
  const countingDown = msLeft > 0
  const secondsLeft = Math.ceil(msLeft / 1000)

  // Current matchup: round_number is 1-based and IS the schedule index.
  const totalRounds = game?.matchup_boys?.length ?? 0
  const idx = (game?.round_number ?? 1) - 1
  const boyId = game?.matchup_boys?.[idx] ?? null
  const girlId = game?.matchup_girls?.[idx] ?? null
  const isCompeting = !!myPlayerId && (myPlayerId === boyId || myPlayerId === girlId)
  const opponentId = myPlayerId === boyId ? girlId : myPlayerId === girlId ? boyId : null
  const iAmReady = !!myPlayerId && (game?.round_ready_ids ?? []).includes(myPlayerId)
  const opponentReady = !!opponentId && (game?.round_ready_ids ?? []).includes(opponentId)

  // Mutual New-Letters confirmation
  const redealPendingBy = game?.redeal_pending_by ?? null
  const iRequestedRedeal = redealPendingBy && redealPendingBy === myPlayerId
  const opponentRequestedRedeal = redealPendingBy && isCompeting && redealPendingBy !== myPlayerId
  const redealCountdown = !!game?.redeal_countdown

  // Mutual Round-Result confirmation
  const roundResultPendingBy = game?.round_result_pending_by ?? null
  const roundResultPendingWinner = game?.round_result_pending_winner ?? null
  const iProposedRoundResult = roundResultPendingBy && roundResultPendingBy === myPlayerId
  const othersToConfirmRoundResult = roundResultPendingBy && myPlayerId && roundResultPendingBy !== myPlayerId

  function nameOf(id) {
    if (id == null) return "?"
    return players.find(p => p.id === id)?.name ?? "(left)"
  }

  async function togglePause() {
    if (busy || !game) return
    setBusy(true)
    await supabase.rpc("wb_set_paused", { p_code: code, p_paused: !game.paused })
    setBusy(false)
    nudge()
  }

  async function markReady() {
    if (!myPlayerId || iAmReady) return
    await supabase.rpc("wb_mark_ready", { p_code: code, p_player_id: myPlayerId })
    nudge()
  }

  async function requestNewLetters() {
    if (!myPlayerId || redealPendingBy) return
    await supabase.rpc("wb_request_redeal", { p_code: code, p_player_id: myPlayerId })
    nudge()
  }

  async function respondNewLetters(accept) {
    if (!myPlayerId) return
    await supabase.rpc("wb_respond_redeal", { p_code: code, p_player_id: myPlayerId, p_accept: accept })
    nudge()
  }

  async function proposeRoundResult(winnerId) {
    if (busy || !game || !myPlayerId) return
    setBusy(true)
    await supabase.rpc("wb_propose_round_result", { p_code: code, p_player_id: myPlayerId, p_winner_id: winnerId, p_round: game.round_number })
    setBusy(false)
    setRoundDoneStep(null)
    nudge()
  }

  async function respondRoundResult(accept) {
    if (!myPlayerId || !game) return
    await supabase.rpc("wb_respond_round_result", { p_code: code, p_player_id: myPlayerId, p_accept: accept, p_round: game.round_number })
    nudge()
  }

  async function adjustTeamScore(team, delta) {
    await supabase.rpc("wb_adjust_team_score", { p_code: code, p_team: team, p_delta: delta })
    nudge()
  }

  function settingsNode() {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 12 }}>Adjust score</div>
        {[
          { team: "boys", label: "Boys", color: BOYS_COLOR, score: game?.boys_score ?? 0 },
          { team: "girls", label: "Girls", color: GIRLS_COLOR, score: game?.girls_score ?? 0 },
        ].map(t => (
          <div key={t.team} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ flex: 1, color: t.color, fontWeight: 800, fontSize: 14 }}>{t.label}</span>
            <button onClick={() => adjustTeamScore(t.team, -1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>−</button>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", minWidth: 24, textAlign: "center" }}>{t.score}</div>
            <button onClick={() => adjustTeamScore(t.team, 1)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 900 }}>+</button>
          </div>
        ))}
      </div>
    )
  }

  function menuAndFooter(footerChildren, footerH = FOOTER_ROWS_H) {
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
          playerDetails={players.map(p => ({
            name: p.name,
            teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
            teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined,
          }))}
          gamePhase={game?.phase}
          rules={WB_RULES}
          settingsContent={settingsNode()}
          onResetToLobby={async () => { await supabase.rpc("wb_reset_to_lobby", { p_code: code }); nudge() }}
          footerHeight={footerH}
        />
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} height={footerH}>
          {footerChildren}
        </Footer>
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
    const boysScore = game.boys_score ?? 0
    const girlsScore = game.girls_score ?? 0
    const isTie = boysScore === girlsScore
    const boysWin = boysScore > girlsScore
    const resultText = isTie ? "It's a tie!" : boysWin ? "Boys win!" : "Girls win!"
    const teamAbove = (
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 20, lineHeight: 1.1, color: INK }}>{resultText}</div>
        {[
          { label: "Boys", color: BOYS_COLOR, score: boysScore, isWinner: boysWin, names: players.filter(p => p.team === "boys").map(p => p.name) },
          { label: "Girls", color: GIRLS_COLOR, score: girlsScore, isWinner: !isTie && !boysWin, names: players.filter(p => p.team === "girls").map(p => p.name) },
        ].map(team => (
          <div key={team.label} style={{ display: "flex" }}>
            <div style={{ padding: "13px 0", minWidth: 48, flexShrink: 0, background: team.color, fontSize: 18, fontWeight: 900, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {team.score}
            </div>
            <div style={{ padding: "13px 16px", flex: 1, background: PANEL, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: INK }}>{team.label}</div>
                {team.names.length > 0 && <div style={{ fontSize: 13, color: INK_MUTED, marginTop: 2 }}>{team.names.join(", ")}</div>}
              </div>
              {team.isWinner && <span style={{ fontSize: 11, fontWeight: 800, color: team.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
            </div>
          </div>
        ))}
      </div>
    )
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", animation: "endGameIn 300ms ease-out both" }}>
        <EndGame
          players={[]}
          onPlayAgain={async () => {
            if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
            const { data, error } = await supabase.rpc("wb_create_replay", { p_code: code })
            if (error) { alert(error.message); return }
            nudge()
            router.replace(`/${data}`)
          }}
          onPlayAnotherGame={() => { window.location.href = "https://games.jackbrannen.com" }}
          bottomPad="40px"
          colors={{ yellow: BTN, wl: PANEL, primaryText: BTN_TEXT, secondaryText: INK }}
          aboveScores={teamAbove}
        />
      </div>
    )
  }

  // ── PLAYING ──────────────────────────────────────────────
  const waitingForReady = !game.paused && !game.cards_visible_at

  return (
    <>
    <div style={{ height: scrollH(waitingForReady ? FOOTER_H : FOOTER_ROWS_H), overflowY: "auto", WebkitOverflowScrolling: "touch", background: BG, color: INK }}>
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: DARK, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>Round {game.round_number} of {totalRounds}</div>
        <div style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 900 }}>
          <span style={{ color: BOYS_COLOR }}>Boys {game.boys_score ?? 0}</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
          <span style={{ color: GIRLS_COLOR }}>Girls {game.girls_score ?? 0}</span>
        </div>
      </div>

      <div style={{
        background: isCompeting ? "white" : (boyId && girlId ? "black" : "transparent"),
        color: isCompeting ? INK : (boyId && girlId ? "white" : INK),
        padding: "14px 16px",
      }}>
        {isCompeting ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 2 }}>You&rsquo;re up — vs {nameOf(opponentId)}</div>
            <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600 }}>Shout it out!</div>
          </>
        ) : boyId && girlId ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 2 }}>
              <span style={{ color: BOYS_COLOR }}>{nameOf(boyId)}</span> vs <span style={{ color: GIRLS_COLOR }}>{nameOf(girlId)}</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600 }}>You&rsquo;re judging — call it when someone nails it.</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600 }}>Waiting for the next matchup…</div>
        )}
      </div>

      <div style={{ padding: "24px 16px" }}>
        {game.paused ? (
          <div style={{ background: PANEL, color: INK, padding: "40px 16px", textAlign: "center", fontSize: 20, fontWeight: 900 }}>
            Paused
          </div>
        ) : waitingForReady ? (
          <div style={{ background: PANEL, color: INK, padding: "32px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, marginBottom: 12 }}>Up next</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>
              <span style={{ color: BOYS_COLOR }}>{nameOf(boyId)}</span> vs <span style={{ color: GIRLS_COLOR }}>{nameOf(girlId)}</span>
            </div>
          </div>
        ) : countingDown ? (
          <div style={{ background: PANEL, color: INK, padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, marginBottom: 8 }}>{redealCountdown ? "New letters…" : "Get ready…"}</div>
            <div style={{ fontSize: 48, fontWeight: 900 }}>{secondsLeft}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: "84%", margin: "0 auto" }}>
            {(game.cards ?? []).map((card, i) => (
              card.type === "reverse" ? <ReverseCard key={i} /> :
              <LetterCard key={i} card={card} />
            ))}
          </div>
        )}
      </div>

      {roundDoneStep === "pick" && (
        <div onClick={() => setRoundDoneStep(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Who won the round?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {boyId && (
                <button onClick={() => proposeRoundResult(boyId)} disabled={busy}
                  style={{ background: BOYS_COLOR, color: "white", fontSize: 16, fontWeight: 800, padding: "14px", textAlign: "left" }}>
                  {nameOf(boyId)}
                </button>
              )}
              {girlId && (
                <button onClick={() => proposeRoundResult(girlId)} disabled={busy}
                  style={{ background: GIRLS_COLOR, color: "white", fontSize: 16, fontWeight: 800, padding: "14px", textAlign: "left" }}>
                  {nameOf(girlId)}
                </button>
              )}
            </div>
            <button onClick={() => setRoundDoneStep(null)} style={{ background: "transparent", color: INK_MUTED, fontSize: 14, fontWeight: 700, padding: "10px", width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* New Letters: the OTHER competitor must agree before it happens */}
      {opponentRequestedRedeal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>
              {nameOf(redealPendingBy)} wants new letters. Agree?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => respondNewLetters(true)} style={{ flex: 1, background: BTN, color: BTN_TEXT, fontSize: 15, fontWeight: 900, padding: "14px" }}>Yes</button>
              <button onClick={() => respondNewLetters(false)} style={{ flex: 1, background: "rgba(34,26,18,0.12)", color: INK, fontSize: 15, fontWeight: 900, padding: "14px" }}>No</button>
            </div>
          </div>
        </div>
      )}
      {iRequestedRedeal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Asking {nameOf(opponentId)} to agree to new letters…</div>
          </div>
        </div>
      )}

      {/* Round result: any player proposes, everyone ELSE races to confirm/decline */}
      {othersToConfirmRoundResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, marginBottom: 6 }}>
              {nameOf(roundResultPendingBy)}&rsquo;s proposal
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>
              {nameOf(roundResultPendingWinner)} won the round for {roundResultPendingWinner === boyId ? "boys" : "girls"}. Agree?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => respondRoundResult(true)} style={{ flex: 1, background: BTN, color: BTN_TEXT, fontSize: 15, fontWeight: 900, padding: "14px" }}>Yes</button>
              <button onClick={() => respondRoundResult(false)} style={{ flex: 1, background: "rgba(34,26,18,0.12)", color: INK, fontSize: 15, fontWeight: 900, padding: "14px" }}>No</button>
            </div>
          </div>
        </div>
      )}
      {iProposedRoundResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: PANEL, color: INK, padding: "24px 20px", maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Asking everyone to confirm {nameOf(roundResultPendingWinner)} won the round…</div>
          </div>
        </div>
      )}
    </div>
    {menuAndFooter(
      waitingForReady ? (
        isCompeting ? (
          iAmReady ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, fontWeight: 700, opacity: 0.65 }}>
              Waiting on {nameOf(opponentId)}…
            </div>
          ) : (
            <FooterButton onClick={markReady} bg="#FFFFFF" textColor={INK}>Ready</FooterButton>
          )
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, fontWeight: 700, opacity: 0.65 }}>
            Waiting on both {nameOf(boyId)} and {nameOf(girlId)}…
          </div>
        )
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex" }}>
            {isCompeting && (
              <button onClick={requestNewLetters} disabled={busy || !!redealPendingBy}
                style={{ flex: 1, height: "100%", background: "rgba(255,255,255,0.22)", color: "white", fontSize: 15, fontWeight: 700 }}>
                New Letters
              </button>
            )}
            <button onClick={togglePause} disabled={busy}
              style={{ flex: 1, height: "100%", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 15, fontWeight: 700, borderLeft: isCompeting ? "1px solid rgba(255,255,255,0.09)" : "none" }}>
              {game.paused ? "Resume" : "Pause"}
            </button>
          </div>
          <button onClick={() => setRoundDoneStep("pick")} disabled={busy}
            style={{ flex: 1, height: "100%", background: "#FBDF54", color: "#000", fontSize: 17, fontWeight: 900, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
            Round Done
          </button>
        </div>
      ),
      waitingForReady ? FOOTER_H : FOOTER_ROWS_H
    )}
    </>
  )
}
