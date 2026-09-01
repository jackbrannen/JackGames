"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { EMOJIS } from "../../../lib/emojis"
import manifest from "../../../public/voices/manifest.json"
import { FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, CARD } from "../../../components/styles"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import IdleGateModal from "../../../components/IdleGateModal"
import EndGame from "../../../components/EndGame"
import HighScores from "../../../components/HighScores"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import { useIdleGate } from "../../../lib/useIdleGate"

const CARD_BY_SLUG = manifest.cards
const ALL_SLUGS = Object.keys(manifest.cards)
const MY_COLOR = "hsl(205, 80%, 55%)"
const CARD_RATIO = 4 / 3 // height/width — matches the majority of source card images
const CELL_GAP = 3
const SELECT_BORDER_W = 3 // guesser's own selection (and the correct/wrong feedback that follows it)
const ASSIGNED_RING_W = 7 // clue-giver's view of the correct card — a box-shadow ring (not a
// border) at roughly this width, drawn OUTSIDE the card so it never eats into the visible
// image the way a thicker inset border would (that was the earlier design, and the width
// change alone made a card visibly resize whenever assignment landed on or left it).
const EDGE_PAD = Math.ceil(ASSIGNED_RING_W) // room for the assigned ring to bleed outward without clipping
const FEEDBACK_STRIP_H = 36
const FEEDBACK_MS = 700
const FEEDBACK_FADE_MS = 500
const EMOJI_CLUNK_MS = 260 // duration of the center emoji's slot-reel in/out animation
const BADGE_FULL_MS = 2000
const BADGE_FADE_MS = 2500
const RESULTS_ROW_EMOJI_SIZE = Math.round(36 * (1 - 0.33)) // was 2x the original 18px, then 33% smaller
const RESULTS_ROW_TEXT_SIZE = Math.round(FONT_SIZE.small * 1.2 * 0.8) // was +20%, then 20% smaller
// Clamped to the house 13px minimum (see CLAUDE.md) — the raw 20%-off-the-20%-bigger math
// lands at 12px for the secondary "Guess:" line, below the non-negotiable floor.
const RESULTS_ROW_SUBTEXT_SIZE = Math.max(FONT_SIZE.min, Math.round((FONT_SIZE.small - 1) * 1.2 * 0.8))

const PLAYER_COLORS = [
  "hsl(205, 80%, 55%)", "hsl(340, 75%, 55%)", "hsl(160, 60%, 45%)", "hsl(30, 85%, 55%)",
  "hsl(270, 60%, 60%)", "hsl(50, 90%, 50%)", "hsl(190, 70%, 50%)", "hsl(0, 70%, 55%)",
]

// Reading order around the ring: top row, middle row (skipping center), bottom row.
const RING_POSITIONS = [
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
  { row: 1, col: 0 },                     { row: 1, col: 2 },
  { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
]

function sample(arr, n) {
  const copy = [...arr]
  const out = []
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return out
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const RECENT_CATEGORIES_TO_AVOID = 2

// Avoids repeating a category that showed up in the last couple of picks, so the same
// theme (e.g. all animals) doesn't cluster together — falls back to the full pool if
// filtering would leave nothing to pick from.
function pickEmojiWithVariety(recentCategories) {
  const avoid = new Set(recentCategories.slice(-RECENT_CATEGORIES_TO_AVOID))
  const pool = EMOJIS.filter((e) => !avoid.has(e.category))
  return pickOne(pool.length ? pool : EMOJIS)
}

const BOYS_COLOR = "hsl(210, 70%, 45%)"
const GIRLS_COLOR = "hsl(280, 55%, 45%)"
const COLLAB_COLOR = "hsl(160, 55%, 40%)"
// Lighter tints of the same three, same hue/saturation with lightness raised — used for the
// reveal screen's role badges. Deliberately NOT the per-player PLAYER_COLORS palette: eight
// unrelated hues on those badges read as if they were designating separate teams, when
// really they're all just "someone on the team that's up." A single light team-tint (or
// yellow, for whichever badge is actually the viewer) reads as one coherent group instead.
const BOYS_COLOR_LIGHT = "hsl(210, 70%, 68%)"
const GIRLS_COLOR_LIGHT = "hsl(280, 55%, 68%)"
const COLLAB_COLOR_LIGHT = "hsl(160, 55%, 58%)"
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
const POP_MS = 500 // one-shot "pop" duration on the assigned card before it settles into the gentle pulse
const POKE_COLORS = { dark: "hsl(220, 10%, 10%)", mid: "hsl(220, 10%, 16%)", wl: "hsl(220, 10%, 20%)", yellow: "hsl(48, 95%, 60%)", notifBg: "hsl(220, 10%, 8%)" }
// Matches the lobby's turn-length dropdown exactly (see app/[code]/page.js) — length-only,
// no Off option here: HearingVoices' lobby never lets the host turn the timer off.
const TURN_LENGTH_OPTIONS = [15, 30, 45, 60]

// Pass either { boys, girls } (Teams) or a single { score } (Collaborative) — the shape of
// scores determines which is rendered, so every call site can just pass whichever the
// current game.mode actually has without an extra prop.
function ScoreBoxes({ scores }) {
  const boxStyle = (bg) => ({
    background: bg,
    color: "#fff",
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.black,
    padding: `4px ${SPACE.xs}px`,
  })
  if (scores.score !== undefined) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <span style={boxStyle(COLLAB_COLOR)}>Score {scores.score}</span>
      </div>
    )
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={boxStyle(BOYS_COLOR)}>Boys {scores.boys}</span>
      <span style={boxStyle(GIRLS_COLOR)}>Girls {scores.girls}</span>
    </div>
  )
}

// Shared row rendering for a list of guess results — used both by the mid-turn Time's Up
// recap and by the Game Over screen's full-game history (see game.game_history).
function RoundResultsList({ history, players }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {history.map((h, i) => {
        // Older entries recorded before correct_slug existed fall back to h.slug so
        // they don't render blank — every entry going forward always has it.
        const correctCard = CARD_BY_SLUG[h.correct_slug ?? h.slug]
        const guessedCard = CARD_BY_SLUG[h.slug]
        const submitter = players.find((p) => p.id === h.player_id)
        const submitterName = submitter?.first_name || submitter?.name || "…"
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACE.xs,
              padding: "6px 10px",
              background: "hsl(220, 10%, 16%)",
            }}
          >
            <span style={{ fontSize: RESULTS_ROW_EMOJI_SIZE, flexShrink: 0 }}>{h.emoji}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: RESULTS_ROW_TEXT_SIZE, fontWeight: FONT_WEIGHT.semibold, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {correctCard?.name ?? h.correct_slug ?? h.slug}
              </span>
              {!h.correct && (
                <span style={{ fontSize: RESULTS_ROW_SUBTEXT_SIZE, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Guess: {guessedCard?.name ?? h.slug}
                </span>
              )}
            </span>
            <span style={{ fontSize: RESULTS_ROW_TEXT_SIZE, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})`, flexShrink: 0 }}>
              {submitterName}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: RESULTS_ROW_TEXT_SIZE,
                fontWeight: FONT_WEIGHT.black,
                color: h.points >= 0 ? "hsl(145, 80%, 55%)" : "hsl(0, 85%, 65%)",
                minWidth: 26,
                textAlign: "right",
              }}
            >
              {h.points >= 0 ? `+${h.points}` : h.points}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Game Over's full-game history, grouped by round — game.game_history is an array of
// round-records ({round, team, clue_giver_id, entries}, see hv_end_turn), one per turn
// that had at least one guess. Each group gets a "Round # · NAME's voices" header, with
// the round number boxed in that round's team color (matching ScoreBoxes' own boxes) so
// it's immediately scannable which round belonged to which team, same as the live score
// display already does.
function GameHistoryList({ rounds, players }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {rounds.map((round, i) => {
        const giver = players.find((p) => p.id === round.clue_giver_id)
        const giverName = giver?.first_name || giver?.name || "…"
        const boxColor = round.team === "boys" ? BOYS_COLOR : round.team === "girls" ? GIRLS_COLOR : COLLAB_COLOR
        return (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs, marginBottom: 4 }}>
              <span style={{ flexShrink: 0, background: boxColor, color: "#fff", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, padding: `4px ${SPACE.xs}px` }}>
                Round {round.round}
              </span>
              <span style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.normal})` }}>
                {giverName}'s voices
              </span>
            </div>
            <RoundResultsList history={round.entries ?? []} players={players} />
          </div>
        )
      })}
    </div>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [myPlayerId, setMyPlayerId] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [now, setNow] = useState(Date.now())

  const recentCategories = useRef([])
  const channelRef = useRef(null)
  const gossipKeyRef = useRef(null)
  const latestGameUpdatedAtRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [voteLoading, setVoteLoading] = useState(false)
  const [draftTurnDuration, setDraftTurnDuration] = useState(45)
  const [savingTurnDuration, setSavingTurnDuration] = useState(false)

  const boardWrapRef = useRef(null)
  const [cellSize, setCellSize] = useState({ w: 100, h: 100 })

  const [display, setDisplay] = useState({ emoji: null, selectedSlug: null, selectedBy: null, selectedAt: null })
  // The previous center emoji, kept around just long enough to animate OUT (sliding down and
  // out of view) in sync with the new one sliding IN — see the emoji-clunk effect below and
  // the two-span render in the center-emoji cell.
  const [outgoingEmoji, setOutgoingEmoji] = useState(null)
  const prevEmojiRef = useRef(null)
  const outgoingKeyRef = useRef(0)
  const outgoingTimerRef = useRef(null)
  const [correctSlug, setCorrectSlug] = useState(null)
  const prevCorrectSlugRef = useRef(null)
  const prevShowInterstitialRef = useRef(true)
  const secretFetchSeqRef = useRef(0)
  // The card that was assigned when time ran out but never got guessed — revealed to
  // everyone (not just the clue-giver) for the Time's Up recap, since the round is over and
  // there's no more live gameplay left for it to be secret from.
  const [finalPendingSlug, setFinalPendingSlug] = useState(null)
  const finalPendingSeqRef = useRef(0)
  const [assignedPopUntil, setAssignedPopUntil] = useState(0)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  // Queues hv_select_card writes from this client so rapid successive taps (e.g. someone
  // double-tapping two different cards quickly) apply in the order they were tapped,
  // instead of risking an older network response landing after a newer one.
  const selectQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    const existing = localStorage.getItem(`hv:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    else router.replace(`/${code}`)
  }, [code])

  // Gossip-diffing (see REALTIME.md §4) belongs here, in loadState — NOT inside
  // applyGameRow. loadState only runs on mount/poll/reconnect/visibility, so it's a
  // naturally low-frequency check. It used to live inside applyGameRow instead, which is
  // also the handler for every single realtime postgres_changes event — meaning EVERY
  // client that observed a transition immediately re-broadcast "sync" about it too, even
  // ones whose own realtime was working perfectly. With 4 players that's up to 4 redundant
  // broadcasts for one transition, each triggering another background refetch on every
  // OTHER client.
  function gossipSyncKey(g) {
    return `${g.phase}:${g.round_index}:${g.active_team}:${g.clue_giver_id}:${g.paused}:${g.turn_started_at}`
  }

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from("hv_games").select("*").eq("code", code).single(),
      supabase.from("hv_players").select("id,name,first_name,last_name,team,created_at").eq("game_code", code).order("created_at", { ascending: true }),
    ])
    if (seq !== loadSeqRef.current) return // a newer call already landed, discard this one
    if (g) {
      const key = gossipSyncKey(g)
      if (gossipKeyRef.current !== null && gossipKeyRef.current !== key) {
        channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      }
      gossipKeyRef.current = key
      applyGameRow(g)
    }
    setPlayers(ps ?? [])
  }

  // Applies a realtime hv_games payload directly — postgres_changes already sends the
  // full row for INSERT/UPDATE, so there's no need to refetch to get it. No gossip
  // broadcasting here — see the comment on gossipSyncKey above for why.
  //
  // Freshness-guarded against updated_at (a DB trigger touches it on every write): there
  // are now several independent paths that can deliver a game row to this client — the
  // realtime subscription, loadState's poll/gossip refetch, and each action's own post-RPC
  // verify fetch (voteEndRound, beginFirstTurn, etc.) — and nothing previously stopped a
  // SLOWER one of these from resolving after a faster one and overwriting fresher state
  // with older data, which is exactly what repeated, rapid interstitial flicker looks like:
  // real content, briefly reverting to a half-stale snapshot, correcting again a moment
  // later. Comparing against a ref (not React state, which only updates after a render)
  // means every single incoming row is checked, with no gap where a race could sneak
  // through.
  function applyGameRow(newRow) {
    if (!newRow) return
    if (latestGameUpdatedAtRef.current && newRow.updated_at <= latestGameUpdatedAtRef.current) return
    latestGameUpdatedAtRef.current = newRow.updated_at
    setGame(newRow)
  }

  // Same idea for hv_players — patch just the row that changed.
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
    // Only reset reconnectAttempt after the connection has stayed up for a
    // while — resetting on every bare SUBSCRIBED lets a flapping connection
    // (briefly connects, drops, repeat) reconnect+loadState() unthrottled,
    // since each brief success zeroes the backoff right before the next
    // drop. See BUGS.md (found in Copycats, 2026-08-24).
    let stableTimer = null

    function connect() {
      channel = supabase
        .channel(`hv-play-${code}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "hv_games", filter: `code=eq.${code}` },
          (payload) => {
            if (payload.eventType === "DELETE") { loadState(); return }
            applyGameRow(payload.new)
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "hv_players", filter: `game_code=eq.${code}` },
          applyPlayerRow
        )
        // Silent background refetch — a peer whose own postgres_changes subscription
        // silently died self-heals here without any visible UI flag. Deliberately no
        // "Loading…" indicator: several actions (every vote, every submit, every
        // pause/resume) broadcast unconditionally rather than only on the one call that
        // actually changed something, so a healthy client — which already got the real
        // update via its own subscription before this broadcast even arrives — routinely
        // receives redundant, no-op "sync" events. A visible loading flag flipping on for
        // each one flashed the interstitial back to "Loading…" and then immediately back
        // to the (unchanged) content, which is exactly the flicker this was causing.
        // applyGameRow's updated_at freshness guard already discards anything that isn't
        // newer, so this can just refetch quietly and let real changes apply on their own.
        .on("broadcast", { event: "sync" }, () => { loadState() })
        .subscribe((status) => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            channelRef.current = channel
            loadState() // catch up in case events were missed while disconnected
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
  }, [code, isIdle])

  useEffect(() => {
    if (game?.phase === "finished") return
    if (game && game.phase !== "playing" && myPlayerId) router.replace(`/${code}`)
  }, [game?.phase, myPlayerId])

  // hv_create_replay copies every player's name/team into the fresh lobby — before
  // redirecting, look up which row is ours there (matched by name, already enforced unique
  // per game at join) and pre-seed localStorage with it, so this player lands back on their
  // team instead of needing to rejoin from scratch. Looks up its own name fresh by id
  // (not `players` state) so it works reliably regardless of whether that's populated yet.
  // Used both by the actor who taps "Play Again" (see playAgain below) AND by the effect
  // right after this, which is what gets everyone ELSE there too — missing that second
  // path here once already caused the tapper's own client to skip this and land back in
  // the new lobby with no myPlayerId set at all, looking like they'd never joined even
  // though their name was already sitting in the roster.
  async function redirectToReplay(newCode) {
    if (myPlayerId) {
      const { data: mine } = await supabase.from("hv_players").select("name").eq("id", myPlayerId).single()
      if (mine?.name) {
        const { data } = await supabase.from("hv_players").select("id").eq("game_code", newCode).ilike("name", mine.name).limit(1)
        if (data?.[0]) localStorage.setItem(`hv:${newCode}:playerId`, data[0].id)
      }
    }
    router.replace(`/${newCode}`)
  }

  // Whoever taps "Play Again" sets replay_code on this row via hv_create_replay — the
  // realtime patch on hv_games (already subscribed above) delivers it to every other
  // viewer here too, so everyone follows to the new lobby without needing their own click.
  useEffect(() => {
    if (game?.replay_code) redirectToReplay(game.replay_code)
  }, [game?.replay_code])

  // Single tick loop driving remaining time, badge fade, and feedback-flash timing — all
  // derived from server timestamps so every viewer stays in sync. Deliberately a 100ms
  // interval, not a 60fps requestAnimationFrame loop: this state drives a full re-render of
  // the whole board (8 cards, each with its own inline animation/border logic), and forcing
  // that 60 times a second was competing with the CSS pop/pulse animations for the main
  // thread — the likely cause of the pop stuttering or not firing cleanly. The timer bar's
  // own CSS transition (100ms) already smooths the visual result at this tick rate.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = boardWrapRef.current
    if (!el) return
    function measure() {
      const availW = el.clientWidth - EDGE_PAD * 2
      const availH = el.clientHeight - EDGE_PAD * 2
      const wFromWidth = (availW - CELL_GAP * 2) / 3
      const wFromHeight = (availH - CELL_GAP * 2) / 3 / CARD_RATIO
      const w = Math.max(40, Math.floor(Math.min(wFromWidth, wFromHeight)))
      setCellSize({ w, h: Math.floor(w * CARD_RATIO) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!game])

  const me = players.find((p) => p.id === myPlayerId)
  const myTeam = me?.team ?? null
  const isClueGiver = !!game && myPlayerId === game.clue_giver_id
  const isSubmitter = !!game && myPlayerId === game.submitter_id
  const isOnActiveTeam = !!game && myTeam === game.active_team
  const isCollab = game?.mode === "collaborative"
  const canSelect = !isClueGiver && (isCollab ? !!game : isOnActiveTeam)
  // Only the designated submitter's Submit tap is honored server-side (see
  // hv_submit_guess) — everyone else on the team can still select/help via
  // hv_select_card, they just don't get the Submit button.
  const canSubmit = canSelect && isSubmitter
  // On the active team (or, in Collaborative, anyone) but neither of the two named roles —
  // used to highlight the "Rest of the team helping NAME2" line on the reveal screen.
  const amHelper = !isClueGiver && !isSubmitter && (isCollab ? !!game : isOnActiveTeam)

  const turnStartedMs = game?.turn_started_at ? new Date(game.turn_started_at).getTime() : null
  const pausedAtMs = game?.paused_at ? new Date(game.paused_at).getTime() : null
  // turn_started_at is null before round 1's clue-giver taps "Start" (see hv_begin_turn) —
  // `now - null` coerces to `now - 0`, which would otherwise read as a huge elapsed time,
  // so elapsedSec/remaining/timeUp all explicitly treat "not started yet" as "full time
  // left, not up" rather than computing off a null anchor.
  const elapsedSec = (game && turnStartedMs !== null)
    ? (game.paused ? (pausedAtMs - turnStartedMs) : (now - turnStartedMs)) / 1000
    : 0
  // Clamped on both ends: hv_start_game/hv_end_turn set turn_started_at a few seconds in
  // the future (see REVEAL_DELAY_SECONDS server-side) so the reveal screen has a guaranteed
  // window to show before the countdown is actually live — elapsedSec goes negative during
  // that window, which would otherwise inflate remaining past the real turn_duration_seconds.
  const remaining = game ? Math.min(game.turn_duration_seconds, Math.max(0, game.turn_duration_seconds - elapsedSec)) : 0
  const timeUp = !!game && game.phase === "playing" && !game.paused && turnStartedMs !== null && remaining <= 0
  // Revealing = turn_started_at hasn't been set yet — true for EVERY round's reveal screen,
  // not just round 1. There is deliberately no timer anywhere in this game that clears the
  // interstitial on its own: hv_end_turn now always leaves turn_started_at null, and only
  // the incoming clue-giver tapping Start (hv_begin_turn) sets it, which is what actually
  // reveals the board. A null check is also immune to clock skew by construction (it's a
  // presence check, not a numeric comparison) — no client/server clock ever gets compared
  // to decide whether this screen is still up.
  const revealing = !!game && game.phase === "playing" && !game.paused && turnStartedMs === null
  // The interstitial is now purely this reveal window — once time's up, the board stays up
  // (with a "Time's Up!" overlay + the End Round vote, see below) instead of swapping away,
  // so players can still see what they were looking at while the round wraps up.
  const showInterstitial = revealing

  // The hamburger that opens this menu is hidden once the game goes live (timerRunning on
  // Footer) — close the drawer itself on that same transition so it can't be left open with
  // no visible way to close it (the backdrop tap still works, but this is the clean case).
  useEffect(() => {
    if (!showInterstitial && !game?.paused) setMenuOpen(false)
  }, [showInterstitial, game?.paused])

  // The clue-giver already has this via correctSlug (fetched continuously all turn) — reuse
  // it rather than double-fetching. Everyone else only gets it once /api/hv-secret's own
  // server-side expiry check agrees the turn is actually over (see that route), so this
  // can't jump the gun on the client's own possibly-skewed clock.
  useEffect(() => {
    if (!timeUp || !myPlayerId) { setFinalPendingSlug(null); return }
    if (isClueGiver) { setFinalPendingSlug(correctSlug); return }
    const seq = ++finalPendingSeqRef.current
    fetch("/api/hv-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId: myPlayerId }),
    })
      .then((r) => r.json())
      .then((d) => { if (seq === finalPendingSeqRef.current) setFinalPendingSlug(d.correctCardSlug ?? null) })
      .catch(() => { if (seq === finalPendingSeqRef.current) setFinalPendingSlug(null) })
  }, [timeUp, isClueGiver, correctSlug, myPlayerId, code])

  const lastResultMs = game?.last_result_at ? new Date(game.last_result_at).getTime() : null
  const feedbackActive = !!lastResultMs && now - lastResultMs < FEEDBACK_MS
  // Stays mounted for FEEDBACK_FADE_MS beyond feedbackActive so the Correct/Incorrect strip
  // and the per-card result circle can fade out over that window (via the opacity/transition
  // below) instead of just vanishing the instant feedbackActive flips — feedbackActive itself
  // still drives the fade's start (opacity 1→0) and everything else that was already keyed
  // off it (Submit's disabled state, the border color logic, etc.), untouched.
  const feedbackVisible = !!lastResultMs && now - lastResultMs < FEEDBACK_MS + FEEDBACK_FADE_MS

  const selectedAtMs = display.selectedAt ? new Date(display.selectedAt).getTime() : null
  const badgeElapsed = selectedAtMs ? now - selectedAtMs : Infinity
  const badgeVisible = !!display.selectedBy && badgeElapsed < BADGE_FADE_MS
  const badgeFading = badgeVisible && badgeElapsed >= BADGE_FULL_MS

  // Emoji updates the instant the server advances it — no longer held back for the feedback
  // flash. It has to change in step with the clue-giver's green ring (see the secret fetch
  // below, which also now fires immediately on the same guess_nonce change): both come from
  // the SAME hv_submit_guess write, so having one wait on feedbackActive while the other
  // didn't wasn't just late, it visibly showed the new card lighting up green next to the
  // OLD emoji for the length of the feedback flash.
  useEffect(() => {
    if (!game) return
    setDisplay((d) => ({ ...d, emoji: game.current_emoji }))
  }, [game?.current_emoji])

  // Arms the outgoing emoji slot the instant display.emoji changes, so the OLD emoji has
  // something to animate out with (hvEmojiClunkOut, see globals.css) in sync with the new
  // one's own entrance — without this, the old span just unmounts the moment React swaps the
  // key, which is instant and has nothing to animate. Cleared via timer once the exit
  // animation's duration has elapsed; a fresh change arriving before that clears/replaces the
  // pending timer rather than stacking, so a rapid run of guesses can't leave stale slots
  // queued up behind each other.
  useEffect(() => {
    if (prevEmojiRef.current !== null && prevEmojiRef.current !== display.emoji) {
      outgoingKeyRef.current += 1
      setOutgoingEmoji({ emoji: prevEmojiRef.current, key: outgoingKeyRef.current })
      if (outgoingTimerRef.current) clearTimeout(outgoingTimerRef.current)
      outgoingTimerRef.current = setTimeout(() => setOutgoingEmoji(null), EMOJI_CLUNK_MS)
    }
    prevEmojiRef.current = display.emoji
  }, [display.emoji])

  // Selection/badge display stays frozen through the feedback flash — the server already
  // clears selected_card_slug the instant Submit resolves, but we don't want the guessed
  // card's border/badge to vanish out from under the "Correct"/"Incorrect" strip while it's
  // still on screen.
  useEffect(() => {
    if (!game || feedbackActive) return
    setDisplay((d) => ({
      ...d,
      selectedSlug: game.selected_card_slug,
      selectedBy: game.selected_by,
      selectedAt: game.selected_at,
    }))
  }, [game?.selected_card_slug, game?.selected_by, game?.selected_at, feedbackActive])

  // Clue-giver's secret fetch — fires as soon as guess_nonce OR clue_giver_id changes,
  // WITHOUT waiting for the feedback flash to clear, and WITHOUT waiting for turn_started_at
  // (the reveal interstitial) either. Fetching during the interstitial — while they're still
  // reading "Waiting on you to start" — is what actually hides the network round-trip: the
  // pop is triggered separately by the reveal transition itself (see the effect below), not
  // by this fetch resolving, so there's no risk of the old "pop fires and expires behind the
  // interstitial" bug from arming it too early. What WAS still broken: relying only on
  // beginFirstTurn's own pre-fetch (fired at the instant Start is tapped) wasn't early enough
  // in production — a cold serverless-function invocation for /api/hv-secret can itself take
  // 1-2s, well past the RPC + board reveal, so the ring visibly lagged the board by that much.
  // Fetching here, the moment this client becomes the incoming clue-giver (well before they
  // physically tap the button), gives the round-trip the whole interstitial-reading window to
  // finish in, so by the time they tap Start the value is already sitting there.
  // Sequence-guarded: without this, two fetches in flight at once (e.g. guess_nonce
  // changing twice in quick succession) could resolve out of order and have the STALE
  // response win.
  function fetchSecret() {
    const seq = ++secretFetchSeqRef.current
    fetch("/api/hv-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId: myPlayerId }),
    })
      .then((r) => r.json())
      .then((d) => { if (seq === secretFetchSeqRef.current) setCorrectSlug(d.correctCardSlug ?? null) })
      .catch(() => { if (seq === secretFetchSeqRef.current) setCorrectSlug(null) })
  }

  useEffect(() => {
    if (!game) return
    if (!isClueGiver) { setCorrectSlug(null); return }
    fetchSecret()
  }, [game?.guess_nonce, game?.clue_giver_id, isClueGiver, code, myPlayerId])

  // Arms a brief one-shot "pop" so the clue-giver's eye is drawn to the assigned card
  // immediately instead of having to scan for the (otherwise identical-looking) gentle pulse
  // among 8 cards. Settles into that gentle pulse afterward. Fires on two distinct triggers:
  // (1) the assigned slug changing value — a mid-turn reassignment after a guess — and
  // (2) the interstitial→board reveal transition itself, even if correctSlug's VALUE didn't
  // change from what beginFirstTurn's pre-fetch already set it to (it usually won't have —
  // that's the point of pre-fetching). Without trigger (2), a card popping during the
  // pre-fetch (while still behind the interstitial, invisible) would have its whole 500ms
  // window silently expire before the board ever became visible, and the clue-giver would
  // just see the calm pulse with no pop at all once it did.
  useEffect(() => {
    const revealedJustNow = prevShowInterstitialRef.current && !showInterstitial
    prevShowInterstitialRef.current = showInterstitial
    if (correctSlug && (correctSlug !== prevCorrectSlugRef.current || revealedJustNow)) {
      setAssignedPopUntil(Date.now() + POP_MS)
    }
    prevCorrectSlugRef.current = correctSlug
  }, [correctSlug, showInterstitial])

  function selectCard(slug) {
    if (!canSelect || !myPlayerId) return
    if (display.selectedSlug === slug) return // matches the server's no-op-on-re-tap rule
    // Update this tapper's own screen immediately instead of waiting on the round trip
    // through the RPC + realtime — the write below still happens, and other viewers get
    // it at normal realtime speed, but the person who tapped shouldn't see a delay.
    setDisplay((d) => ({ ...d, selectedSlug: slug, selectedBy: myPlayerId, selectedAt: new Date().toISOString() }))
    // Chained through selectQueueRef so a rapid double-tap on two different cards can't
    // have its network responses resolve out of order and revert to the older pick.
    selectQueueRef.current = selectQueueRef.current.then(() =>
      supabase.rpc("hv_select_card", { p_code: code, p_player_id: myPlayerId, p_card_slug: slug })
    )
  }

  async function submitGuess() {
    if (!canSubmit || !myPlayerId || !display.selectedSlug || feedbackActive) return
    const next = pickEmojiWithVariety(recentCategories.current)
    recentCategories.current.push(next.category)
    const { error } = await supabase.rpc("hv_submit_guess", { p_code: code, p_player_id: myPlayerId, p_next_emoji: next.emoji })
    if (error) throw error
    // Genuine committed action (locks in the team's answer, advances score/emoji) —
    // nudge so a peer with a silently-dead realtime subscription doesn't sit on the old
    // guess/score until its next poll.
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  // Keep the settings-panel dropdown in sync with the actually-active turn length (not any
  // staged next_turn_duration_seconds — that only takes effect once the next turn actually
  // starts, per hv_stage_turn_duration/hv_begin_turn).
  useEffect(() => {
    if (game?.turn_duration_seconds != null) setDraftTurnDuration(game.turn_duration_seconds)
  }, [game?.turn_duration_seconds])

  async function saveTurnDuration() {
    setSavingTurnDuration(true)
    await supabase.rpc("hv_stage_turn_duration", { p_code: code, p_turn_duration_seconds: draftTurnDuration })
    setSavingTurnDuration(false)
  }

  async function togglePause() {
    if (!game || !myPlayerId) return
    if (game.paused) {
      // Mirror hv_resume_game's own shift locally so the bar doesn't keep counting down
      // for the round trip back from the server — the realtime patch that follows carries
      // the server-confirmed values and simply overwrites this.
      const shiftedMs = new Date(game.turn_started_at).getTime() + (Date.now() - new Date(game.paused_at).getTime())
      setGame((g) => (g ? { ...g, paused: false, paused_by: null, paused_at: null, turn_started_at: new Date(shiftedMs).toISOString() } : g))
      await supabase.rpc("hv_resume_game", { p_code: code })
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    } else {
      // Freeze the bar the instant this client taps Pause, rather than waiting on the
      // round trip — other viewers still catch up at normal realtime speed.
      setGame((g) => (g ? { ...g, paused: true, paused_by: myPlayerId, paused_at: new Date().toISOString() } : g))
      await supabase.rpc("hv_pause_game", { p_code: code, p_player_id: myPlayerId })
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }
  }

  // Any player can vote to end the round once time's up; the RPC itself decides whether
  // this vote crosses the 50% threshold and performs the actual transition (including
  // finishing the game on the final round) — see hv_vote_end_round. Refetching and patching
  // the full row afterward means this voter sees their own vote (or the transition it
  // triggered) immediately, rather than waiting on realtime/the 60s poll fallback.
  // FooterButton manages its own loading state and only resets it if onClick throws — see
  // components/FooterButton.js. This intentionally never resets on success: the button
  // unmounts naturally once the vote (or the transition it triggers) actually lands.
  async function voteEndRound() {
    if (!game || !myPlayerId || voteLoading) return
    if (game.end_round_votes?.includes(myPlayerId)) return
    setVoteLoading(true)
    try {
      const nextPool = sample(ALL_SLUGS, 8)
      const nextEmoji = pickEmojiWithVariety(recentCategories.current)
      const { error } = await supabase.rpc("hv_vote_end_round", { p_code: code, p_player_id: myPlayerId, p_next_card_pool: nextPool, p_next_emoji: nextEmoji.emoji })
      if (error) throw error
      recentCategories.current.push(nextEmoji.category)
      // A genuine committed action — nudge unconditionally rather than trying to predict
      // whether this specific vote crosses the threshold (a prediction that's easy to get
      // wrong when two votes land close together, which is exactly what left other players
      // stuck on stale state with no nudge at all).
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      const { data } = await supabase.from("hv_games").select("*").eq("code", code).single()
      if (data) applyGameRow(data)
    } finally {
      // Unconditional, unlike FooterButton's pattern — this button doesn't reliably unmount
      // after a vote (only a TIPPING vote actually ends the round), so "reset on unmount"
      // would leave it stuck on "Loading…" forever after any vote that wasn't the last one
      // needed. Resetting here always is what keeps it correct either way.
      setVoteLoading(false)
    }
  }

  async function playAgain() {
    if (!game) return
    if (game.replay_code) { redirectToReplay(game.replay_code); return }
    const { data, error } = await supabase.rpc("hv_create_replay", { p_code: code })
    if (error) return
    redirectToReplay(data)
  }

  // Despite the name (a holdover from when only round 1 worked this way), this now fires
  // the Start tap for EVERY round — hv_end_turn always leaves turn_started_at null, and
  // this is what lifts that gate. card_pool/emoji for the round being revealed were already
  // fixed by whichever RPC (hv_start_game or hv_end_turn) set up this turn, so this call
  // doesn't touch either.
  async function tryBeginFirstTurn(attempt = 0) {
    const { error } = await supabase.rpc("hv_begin_turn", { p_code: code })
    if (!error) {
      await new Promise((r) => setTimeout(r, 500))
      const { data } = await supabase.from("hv_games").select("*").eq("code", code).single()
      if (data?.turn_started_at) { applyGameRow(data); return true }
    }
    if (attempt >= 1) return false
    await new Promise((r) => setTimeout(r, 400))
    return tryBeginFirstTurn(attempt + 1)
  }

  async function beginFirstTurn() {
    if (!game || !myPlayerId) return
    // Redundant safety-net fetch — the passive guess_nonce/clue_giver_id effect above
    // already fetches this the moment the client becomes the incoming clue-giver, well
    // before Start is tapped (see that effect's comment for why that's the actual fix for
    // the ring lagging the board). This just covers the edge case of someone tapping Start
    // fast enough to beat that effect's own fetch, or a fetch that failed and never retried.
    if (isClueGiver) fetchSecret()
    // Broadcast AFTER the RPC actually lands, not before — every other action in this file
    // does it in this order. Broadcasting first (the old code) meant every other client's
    // "sync" handler refetched the row before hv_begin_turn had written turn_started_at, so
    // they'd pull back the SAME still-null row — a wasted refetch that visibly did nothing —
    // followed moments later by the real transition once the write landed.
    // That double-flip is exactly the "text changes rapidly when someone hits Start" flicker.
    const ok = await tryBeginFirstTurn()
    if (!ok) throw new Error("hv_begin_turn did not land")
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  function colorForPlayer(id) {
    const idx = players.findIndex((p) => p.id === id)
    return PLAYER_COLORS[idx >= 0 ? idx % PLAYER_COLORS.length : 0]
  }

  function initialsForPlayer(id) {
    const p = players.find((pl) => pl.id === id)
    if (!p) return "?"
    if (p.first_name && p.last_name) return (p.first_name[0] + p.last_name[0]).toUpperCase()
    return (p.name || "?").slice(0, 2).toUpperCase()
  }

  if (isIdle) {
    return <IdleGateModal colors={{ dark: "hsl(220, 10%, 10%)", wl: "hsl(220, 10%, 20%)" }} />
  }

  if (!game) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#101014" }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold }}>Loading…</p>
      </div>
    )
  }

  const clueGiverPlayer = players.find((p) => p.id === game.clue_giver_id)
  const clueGiverName = clueGiverPlayer?.first_name || clueGiverPlayer?.name || null
  const submitterPlayer = players.find((p) => p.id === game.submitter_id)
  const submitterName = submitterPlayer?.first_name || submitterPlayer?.name || null
  // Every round played this game, across every turn — accumulated by hv_end_turn (folded in
  // from round_history, which itself resets every turn) so it survives all the way to the
  // Game Over screen below, including the very last turn's guesses even for whoever cast
  // the tipping "End Round" vote and so never saw the mid-game Time's Up recap for it.
  // Each entry is a round-record ({round, team, clue_giver_id, entries}) — EXCEPT for any
  // game that was already in progress when that shape shipped, whose game_history was
  // built as a flat stream of guesses instead (the old shape, same as round_history's own
  // entries). Rendering the new shape's grouped view against that old data just shows
  // blank "Round …'s voices" headers with nothing under them, so fall back to the old
  // flat, ungrouped list whenever the first entry doesn't look like a round-record.
  const gameHistory = game.game_history ?? []
  const gameHistoryIsLegacyFlat = gameHistory.length > 0 && gameHistory[0].entries === undefined

  if (game.phase === "finished") {
    const resultsSection = gameHistory.length > 0 && (
      <div style={{ marginTop: SPACE.xl }}>
        <div style={{ fontSize: FONT_SIZE.sectionHeader, fontWeight: FONT_WEIGHT.heavy, color: "rgba(255,255,255,0.85)", marginBottom: SPACE.xs }}>
          Round results
        </div>
        {gameHistoryIsLegacyFlat ? (
          <RoundResultsList history={gameHistory} players={players} />
        ) : (
          <GameHistoryList rounds={gameHistory} players={players} />
        )}
      </div>
    )
    // Collaborative is fully cooperative — no team comparison, no winner/tie language,
    // just the shared final score plus the persistent cross-game leaderboard below it.
    if (isCollab) {
      return (
        <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#101014", color: "#fff" }}>
          <EndGame
            players={[]}
            myPlayerId={myPlayerId}
            onPlayAgain={playAgain}
            bottomPad={BOTTOM_PAD}
            colors={{ yellow: "hsl(48, 95%, 60%)", wl: "hsl(220, 10%, 20%)" }}
            aboveScores={
              <div style={{ marginBottom: SPACE.lg }}>
                <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>
                  Final score: {game.score}
                </div>
              </div>
            }
            belowButtons={<>{resultsSection}<HighScores colors={{ wl: "hsl(220, 10%, 20%)" }} /></>}
          />
        </div>
      )
    }
    const boysWin = game.score_boys > game.score_girls
    const girlsWin = game.score_girls > game.score_boys
    const winnerText = boysWin ? "Boys win!" : girlsWin ? "Girls win!" : "It's a tie!"
    const winnerColor = boysWin ? "hsl(210, 90%, 65%)" : girlsWin ? "hsl(280, 75%, 72%)" : "#fff"
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#101014", color: "#fff" }}>
        <EndGame
          players={[]}
          myPlayerId={myPlayerId}
          onPlayAgain={playAgain}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: "hsl(48, 95%, 60%)", wl: "hsl(220, 10%, 20%)" }}
          aboveScores={
            <div style={{ marginBottom: SPACE.lg }}>
              <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: winnerColor }}>
                {winnerText}
              </div>
              <div style={{ marginTop: SPACE.md, display: "flex" }}>
                <ScoreBoxes scores={{ boys: game.score_boys, girls: game.score_girls }} />
              </div>
            </div>
          }
          belowButtons={resultsSection}
        />
      </div>
    )
  }

  const scoresProp = isCollab ? { score: game.score } : { boys: game.score_boys, girls: game.score_girls }

  // The board (and this bar) now stay up through "Time's Up!" instead of swapping to a
  // predicted interstitial, so game.active_team is always the real, current team — no more
  // need to guess what's coming next before the vote-triggered transition actually happens.
  const activeColor = isCollab ? COLLAB_COLOR : game.active_team === "boys" ? BOYS_COLOR : GIRLS_COLOR
  const activeColorLight = isCollab ? COLLAB_COLOR_LIGHT : game.active_team === "boys" ? BOYS_COLOR_LIGHT : GIRLS_COLOR_LIGHT
  const roundHistory = game.round_history ?? []
  const roundPoints = roundHistory.reduce((sum, h) => sum + h.points, 0)
  // Server-side "round_index"/"rounds_total" count boys+girls turns together as one round
  // (so 2v2 shows "Round 1 of 2" even though all 4 players get a turn) — displayed instead
  // as one round per INDIVIDUAL turn, so 2v2 correctly reads "Round 1 of 4" through
  // "Round 4 of 4". Purely a display transform; the underlying fairness/rotation math is
  // untouched. Collaborative mode has no such doubling — round_index/rounds_total already
  // count individual turns directly (see hv_start_game/hv_end_turn).
  const displayRound = isCollab ? game.round_index : (game.round_index - 1) * 2 + (game.active_team === "boys" ? 1 : 2)
  const displayRoundsTotal = isCollab ? game.rounds_total : game.rounds_total * 2
  const votesCount = game.end_round_votes?.length ?? 0
  const voteThreshold = Math.ceil(players.length / 2)
  const hasVoted = !!myPlayerId && !!game.end_round_votes?.includes(myPlayerId)

  return (
    <>
    <Menu
      supabase={supabase}
      isOpen={menuOpen}
      onClose={() => setMenuOpen(false)}
      colors={POKE_COLORS}
      roomCode={code}
      currentPlayer={me?.name}
      playerDetails={players.map((p) => ({
        name: p.name,
        firstName: p.first_name,
        lastName: p.last_name,
        teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : COLLAB_COLOR,
        teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
      }))}
      gamePhase={game.phase}
      onResetToLobby={async () => { await supabase.rpc("hv_reset_to_lobby", { p_code: code }) }}
      settingsContent={<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
          <span style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: "rgba(255,255,255,0.85)" }}>Turn length</span>
          <select
            value={draftTurnDuration}
            onChange={(e) => setDraftTurnDuration(parseInt(e.target.value))}
            style={{ background: POKE_COLORS.wl, color: "white", fontSize: FONT_SIZE.body, padding: "8px 12px", border: "none" }}
          >
            {TURN_LENGTH_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        </div>
        {game?.next_turn_duration_seconds != null && game.next_turn_duration_seconds !== game.turn_duration_seconds && (
          <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, color: "rgba(255,255,255,0.6)", paddingBottom: 10 }}>
            Starts next turn: {game.next_turn_duration_seconds}s
          </div>
        )}
        <button onClick={saveTurnDuration} disabled={savingTurnDuration}
          style={{ background: "hsl(48, 95%, 60%)", color: "#000", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.black, padding: "12px 16px", width: "100%", marginTop: 6 }}>
          Save
        </button>
      </>}
    />
    <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me?.name} />
    <div style={{ minHeight: "100dvh", width: "100%", display: "flex", flexDirection: "column", background: "#101014", paddingBottom: BOTTOM_PAD, overflowY: "auto" }}>
      {/* On the interstitial (next round's reveal screen), the score is pinned to the very
          top of the page instead of sitting inline in the centered card below it — it's the
          one piece of "current state" info worth seeing before anything else on that screen. */}
      {showInterstitial && (
        <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, display: "flex", justifyContent: "center" }}>
          <ScoreBoxes scores={scoresProp} />
        </div>
      )}

      {/* Turn indicator — colored bar naming whose turn it is. Neither this nor the timer
          bar below makes sense on the interstitial: there's no live turn to name or time
          while the recap/reveal screen is up. */}
      {!showInterstitial && (
        <div
          style={{
            flexShrink: 0,
            padding: "6px 0",
            textAlign: "center",
            background: activeColor,
            color: "#fff",
            fontSize: FONT_SIZE.small,
            fontWeight: FONT_WEIGHT.black,
          }}
        >
          {isCollab ? `${clueGiverName ?? "…"}'s Turn` : game.active_team === "boys" ? "Boys' Turn" : "Girls' Turn"}
        </div>
      )}

      {/* Timer bar — edge-to-edge, matching the suite's full-bleed depleting-bar pattern.
          hv_submit_guess never touches turn_started_at, so the real countdown keeps
          running through the feedback flash exactly as it should — forcing this to full
          during that window (an earlier attempt to avoid a DIFFERENT bug, on the reveal
          interstitial, where the clock genuinely isn't live yet) just made the bar visibly
          jump back up to 100% for a moment on every single guess, which is its own bug. */}
      {!showInterstitial && (() => {
        const barFrac = remaining / game.turn_duration_seconds
        return (
          <div style={{ flexShrink: 0, height: 10, background: barFrac > 0.3 ? "hsla(145, 65%, 48%, 0.15)" : "hsla(0, 80%, 55%, 0.15)" }}>
            <div
              style={{
                height: "100%",
                width: `${barFrac * 100}%`,
                background: barFrac > 0.3 ? "hsl(145, 65%, 48%)" : "hsl(0, 80%, 55%)",
                transition: "width 0.1s linear, background 300ms ease",
              }}
            />
          </div>
        )
      })()}

      {/* Round/score recap describes the CURRENT turn, which is exactly what the
          interstitial below replaces with the NEXT turn's info; showing both together
          contradicted each other (e.g. "Round 1 of 2" here next to "Round 2 of 2" in the
          recap), so this is hidden entirely while the interstitial is up. */}
      {!showInterstitial && (
        <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})` }}>
              Round {displayRound} of {displayRoundsTotal}
            </span>
            <ScoreBoxes scores={scoresProp} />
          </div>
        </div>
      )}

      {/* Role instruction — large and centered like "Time's Up!" below it, not small
          corner text, and gone entirely once time's up (the recap takes over from there,
          so there's no live role left to instruct anyone about).
          One line each: the clue-giver and the submitter each get their own direct "You're
          ___" callout in yellow; a helper (on the active team, or anyone in Collaborative,
          but neither of those two) gets "Help NAME decide answers" instead; a player on
          the team that's NOT up (teams mode only) gets "Don't guess" in red — replacing
          the old (incorrect) "You're guessing" in red. The clue-giver's name repeats as a
          smaller sub-line for the submitter/helper cases, since it's the one fact that's
          still relevant to them but isn't already the headline. */}
      {!showInterstitial && !timeUp && (
        <div style={{ flexShrink: 0, padding: `${SPACE.md}px ${SPACE.lg}px`, textAlign: "center" }}>
          {isClueGiver ? (
            <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "hsl(48, 95%, 60%)" }}>
              You're doing voices
            </div>
          ) : isSubmitter ? (
            <>
              <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "hsl(48, 95%, 60%)" }}>
                You're submitting answers
              </div>
              <div style={{ marginTop: 4, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})` }}>
                {clueGiverName ?? "…"} is doing voices
              </div>
            </>
          ) : !isCollab && !isOnActiveTeam ? (
            <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "hsl(0, 85%, 65%)" }}>
              Don't guess
            </div>
          ) : (
            <>
              <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>
                Help {submitterName ?? "…"} decide answers
              </div>
              <div style={{ marginTop: 4, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})` }}>
                {clueGiverName ?? "…"} is doing voices
              </div>
            </>
          )}
        </div>
      )}

      {/* Feedback strip — full-width, sits right above the cards. Content/background stay
          keyed on feedbackVisible (so they don't swap back to blank until the fade below has
          actually finished), while opacity is keyed on feedbackActive and transitions — that
          split is what makes it fade out over FEEDBACK_FADE_MS instead of just vanishing. */}
      <div
        style={{
          flexShrink: 0,
          height: FEEDBACK_STRIP_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: feedbackVisible ? (game.last_result ? "hsl(145, 70%, 38%)" : "hsl(0, 70%, 45%)") : "transparent",
          opacity: feedbackActive ? 1 : 0,
          transition: `opacity ${FEEDBACK_FADE_MS}ms ease`,
          color: "#fff",
          fontSize: FONT_SIZE.body,
          fontWeight: FONT_WEIGHT.black,
        }}
      >
        {feedbackVisible ? (game.last_result ? "Correct" : "Incorrect") : ""}
      </div>

      {/* "Time's Up!" + this turn's recap — sits above the board, not over the cards; the
          board stays visible (just slides down a bit, see below) instead of being swapped
          away, so nobody loses track of what they were looking at. Voting to end the round
          (see Footer) is what actually advances things now. */}
      {timeUp && (
        <div style={{ flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, textAlign: "center" }}>
          <div style={{ animation: "hvTimeUpIn 300ms ease-out both" }}>
            <div style={{ fontSize: FONT_SIZE.headingLg * 1.5, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>
              Time's Up!
            </div>
            <div style={{ marginTop: 2, fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.black, color: roundPoints >= 0 ? "hsl(145, 80%, 55%)" : "hsl(0, 85%, 65%)" }}>
              {roundPoints >= 0 ? `+${roundPoints}` : roundPoints} points this round
            </div>
          </div>
          {/* No internal scroll/height cap on the list below — the whole page scrolls
              instead (see the outer container's overflowY) so the full list is always
              visible without a nested scroll region. Staggered ~150ms behind the headline
              above (animation-delay) so the two don't land in the same frame. */}
          {(roundHistory.length > 0 || finalPendingSlug) && (
            <div style={{ marginTop: SPACE.sm, display: "flex", flexDirection: "column", gap: 4, textAlign: "left", animation: "hvTimeUpIn 300ms ease-out 150ms both" }}>
              <RoundResultsList history={roundHistory} players={players} />
              {/* The card that was still assigned when the buzzer went — nobody got to
                  guess it, so no submitter name and no point swing to show. */}
              {finalPendingSlug && (() => {
                const card = CARD_BY_SLUG[finalPendingSlug]
                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACE.xs,
                      padding: "6px 10px",
                      background: "hsl(220, 10%, 16%)",
                      opacity: OPACITY.muted,
                    }}
                  >
                    {/* game.current_emoji — the actual emoji that was showing for this card
                        when the buzzer went. It's a public field (only correct_card_slug is
                        secret), so no need for a placeholder icon here; the earlier ⏱ was
                        never the real emoji, just a stand-in that always rendered instead. */}
                    <span style={{ fontSize: RESULTS_ROW_EMOJI_SIZE, flexShrink: 0 }}>{game.current_emoji}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: RESULTS_ROW_TEXT_SIZE, fontWeight: FONT_WEIGHT.semibold, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {card?.name ?? finalPendingSlug}
                    </span>
                    <span style={{ fontSize: RESULTS_ROW_TEXT_SIZE, fontWeight: FONT_WEIGHT.semibold, color: `rgba(255,255,255,${OPACITY.muted})`, flexShrink: 0 }}>
                      Not guessed
                    </span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Board — slides down (rather than resizing abruptly) once Time's Up's recap above
          claims some of the vertical space, so the end of a turn feels like a deliberate,
          graceful transition instead of a jarring layout jump. minHeight is a real floor
          (not 0, flexbox's default shrink-to-fit) — without one, a long recap list could
          squeeze the cards down arbitrarily far; past this floor the page scrolls (see the
          outer container) instead of shrinking the board any further. */}
      <div
        ref={boardWrapRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: EDGE_PAD,
          paddingBottom: timeUp ? EDGE_PAD + SPACE.lg : EDGE_PAD,
          minHeight: 240,
          transition: "transform 750ms cubic-bezier(.22,.61,.36,1), padding-bottom 750ms cubic-bezier(.22,.61,.36,1)",
          transform: timeUp ? "translateY(3%)" : "translateY(0)",
        }}>
        {showInterstitial ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>
              Get ready for Round {displayRound} of {displayRoundsTotal}
            </div>
            {/* Well is the upcoming team's own color (was a fixed dark card) and lists every
                role for the round, not just the clue-giver, so nobody has to guess who's
                submitting or wonder why they can't. Each role is its own avatar+name+role
                chip (same colored-initials badge language as the card-selection badges
                below) rather than plain stacked lines — the badge is what makes each row
                scannable as "a person" at a glance instead of a wall of text. Of the four
                information units here (clue-giver row, submitter row, "rest of team"
                line, "waiting on" line), whichever one actually applies to the viewer
                turns fully yellow — badge, name, and label together — so each player's
                own eye is drawn straight to the one line that's about them, instead of
                every unit reading with equal visual weight. */}
            <div style={{ marginTop: SPACE.lg, background: activeColor, padding: CARD.wellPadding, display: "inline-block", minWidth: 280 }}>
              {!isCollab && (
                <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "#fff", textAlign: "center", marginBottom: SPACE.sm }}>
                  {game.active_team === "boys" ? "Boys" : "Girls"} up next
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}>
                  <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: isClueGiver ? POKE_COLORS.yellow : activeColorLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, color: "#000" }}>
                    {initialsForPlayer(game.clue_giver_id)}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.black, color: isClueGiver ? POKE_COLORS.yellow : "#fff" }}>{clueGiverName ?? "…"}</div>
                    <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.bold, color: isClueGiver ? POKE_COLORS.yellow : `rgba(255,255,255,${OPACITY.normal})` }}>Doing voices</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}>
                  <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: isSubmitter ? POKE_COLORS.yellow : activeColorLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.black, color: "#000" }}>
                    {initialsForPlayer(game.submitter_id)}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: FONT_SIZE.bodyLg, fontWeight: FONT_WEIGHT.black, color: isSubmitter ? POKE_COLORS.yellow : "#fff" }}>{submitterName ?? "…"}</div>
                    <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.bold, color: isSubmitter ? POKE_COLORS.yellow : `rgba(255,255,255,${OPACITY.normal})` }}>Submitting answers</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: SPACE.sm, textAlign: "center", fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.semibold, color: amHelper ? POKE_COLORS.yellow : `rgba(255,255,255,${OPACITY.muted})` }}>
                {isCollab
                  ? `Rest of the group helping ${submitterName ?? "…"}`
                  : `Rest of ${game.active_team === "boys" ? "Boys" : "Girls"} team helping ${submitterName ?? "…"}`}
              </div>
            </div>
            <div style={{ marginTop: SPACE.lg, fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: isClueGiver ? POKE_COLORS.yellow : `rgba(255,255,255,${OPACITY.muted})` }}>
              Waiting on {isClueGiver ? "you" : clueGiverName ?? "…"} to start
            </div>
          </div>
        ) : game.paused ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black, color: "#fff" }}>Paused</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(3, ${cellSize.w}px)`,
              gridTemplateRows: `repeat(3, ${cellSize.h}px)`,
              gap: CELL_GAP,
            }}
          >
            {RING_POSITIONS.map((pos, i) => {
              const slug = game.card_pool[i]
              const card = CARD_BY_SLUG[slug]
              if (!card) return <div key={i} style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1 }} />
              const isSelected = display.selectedSlug === slug
              // Not assigned once Time's Up is showing — nobody's giving any more clues
              // this turn, so a new assignment landing right as the buzzer goes (the very
              // last guess's feedback window clearing can trigger exactly that) has nothing
              // to draw attention to and was firing the pop for no reason.
              // Deliberately NOT gated on !feedbackActive — the ring should show up on the
              // next card while the Correct/Incorrect strip is still flashing on the
              // previous guess, not only after it clears (isFeedback below still keeps the
              // ring off the one card actually showing that flash, in the rare case the
              // next assignment lands on it).
              const isAssigned = isClueGiver && !timeUp && correctSlug === slug
              const isPopping = isAssigned && now < assignedPopUntil
              const isFeedback = feedbackActive && display.selectedSlug === slug
              // Same feedbackVisible/feedbackActive split as the top strip — the circle
              // below stays mounted (and the border above stays colored) for the extra
              // FEEDBACK_FADE_MS window so its own opacity transition can actually fade it
              // out, instead of the whole thing vanishing the instant feedbackActive flips.
              const isFeedbackVisible = feedbackVisible && display.selectedSlug === slug
              const badgeOnLeft = pos.col === 2 // keep the badge on-screen for the rightmost column

              return (
                <div
                  key={i}
                  // Elevated whenever assigned, not just while popping — the ring overlay
                  // below can visually extend into a neighboring cell, and without this its
                  // ring was getting painted UNDER that neighbor (later siblings paint over
                  // earlier ones at the same stacking level) any time it wasn't mid-pop.
                  style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1, position: "relative", width: cellSize.w, height: cellSize.h, zIndex: isAssigned ? 5 : "auto" }}
                >
                  <button
                    onClick={() => selectCard(slug)}
                    disabled={!canSelect}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: 0,
                      overflow: "hidden",
                      background: "hsl(220, 10%, 10%)",
                      // Border width/color never depends on isAssigned — the "assigned" ring
                      // lives entirely on a separate overlay below, so nothing about this
                      // button (border, size) ever changes based on assignment state.
                      border: isFeedback
                        ? game.last_result
                          ? `${SELECT_BORDER_W}px solid hsl(145, 80%, 50%)`
                          : `${SELECT_BORDER_W}px solid hsl(0, 85%, 60%)`
                        : isSelected
                        ? `${SELECT_BORDER_W}px solid hsl(48, 95%, 60%)`
                        : `${SELECT_BORDER_W}px solid transparent`,
                      // Override the global button:disabled dimming — a card being
                      // non-tappable for this viewer shouldn't make it harder to see.
                      opacity: OPACITY.full,
                    }}
                  >
                    <img
                      src={`/voices/${card.file}`}
                      alt={card.name}
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                    />
                  </button>
                  {/* Assigned-card ring — a separate overlay (not the button's own border)
                      so the card itself is never resized/rebordered by assignment state, and
                      pulse/pop only ever animate opacity/transform/filter here (cheap to
                      composite), never box-shadow spread (expensive, and what made this look
                      flickery rather than smooth). */}
                  {!isFeedback && isAssigned && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -ASSIGNED_RING_W,
                        border: `${ASSIGNED_RING_W}px solid hsl(145, 80%, 45%)`,
                        pointerEvents: "none",
                        animation: isPopping
                          ? "hvAssignedPop 500ms cubic-bezier(.34,1.56,.64,1) 1"
                          : "hvAssignedPulse 1.8s ease-in-out infinite",
                      }}
                    />
                  )}
                  {/* A teammate can select the exact card that's also the clue-giver's
                      assigned (correct) one — both indicators need to stay visible at once.
                      This is its own overlay (not part of the button, and rendered after the
                      assigned ring above) so it's never hidden behind the green ring's own
                      animation. */}
                  {!isFeedback && isAssigned && isSelected && (
                    <div
                      style={{
                        position: "absolute",
                        inset: SELECT_BORDER_W,
                        border: `${SELECT_BORDER_W}px solid hsl(48, 95%, 60%)`,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {/* Big +#/-# circle on the guessed card — visible to every player, not
                      just the clue-giver, showing the actual point swing (host-configurable,
                      so a plain ✓/× wouldn't say how much) rather than relying on reading
                      the thin strip above the board. */}
                  {isFeedbackVisible && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        opacity: isFeedback ? 1 : 0,
                        transition: `opacity ${FEEDBACK_FADE_MS}ms ease`,
                      }}
                    >
                      <div
                        style={{
                          width: "46%",
                          aspectRatio: "1 / 1",
                          borderRadius: "50%",
                          background: game.last_result ? "hsl(145, 70%, 38%)" : "hsl(0, 70%, 45%)",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ fontSize: Math.floor(Math.min(cellSize.w, cellSize.h) * 0.22), color: "#fff", fontWeight: FONT_WEIGHT.black, lineHeight: 1 }}>
                          {game.last_result ? `+${game.correct_points}` : `${game.wrong_points}`}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Time's Up recap: ONE badge per card showing its net point swing this
                      turn — a card reassigned and guessed more than once combines into a
                      single total (three -1's become one -3) rather than one badge per
                      individual guess. */}
                  {timeUp && (() => {
                    const entries = (game.round_history ?? []).filter((h) => h.slug === slug)
                    if (entries.length === 0) return null
                    const total = entries.reduce((sum, h) => sum + h.points, 0)
                    return (
                      <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
                        <div
                          style={{
                            minWidth: 60,
                            height: 60,
                            padding: "0 15px",
                            borderRadius: 30,
                            background: total >= 0 ? "hsl(145, 70%, 38%)" : "hsl(0, 70%, 45%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                          }}
                        >
                          <span style={{ fontSize: 33, color: "#fff", fontWeight: FONT_WEIGHT.black, lineHeight: 1 }}>
                            {total >= 0 ? `+${total}` : total}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                  {badgeVisible && display.selectedSlug === slug && (
                    <div
                      style={{
                        position: "absolute",
                        top: -6,
                        left: badgeOnLeft ? -6 : "auto",
                        right: badgeOnLeft ? "auto" : -6,
                        width: 26,
                        height: 26,
                        zIndex: 10,
                        borderRadius: "50%",
                        background: colorForPlayer(display.selectedBy),
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: FONT_WEIGHT.bold,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: badgeFading ? 0 : 1,
                        transition: badgeFading ? "opacity 500ms ease" : "none",
                      }}
                    >
                      {initialsForPlayer(display.selectedBy)}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Center emoji — "clunks" down one row like a slot reel on every change. The
                outgoing span (previous emoji, see outgoingEmoji above) animates OUT
                (sliding further down and fading) at the same time the incoming one animates
                IN from above — both absolutely positioned over each other so they cross in
                the same window instead of the old one just vanishing. The outer div's
                overflow:hidden crops both slides to just this one cell. */}
            <div
              style={{
                gridRow: 2,
                gridColumn: 2,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                fontSize: Math.floor(Math.min(cellSize.w, cellSize.h) * 0.64),
                lineHeight: 1,
              }}
            >
              {outgoingEmoji && (
                <span
                  key={`out-${outgoingEmoji.key}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: `hvEmojiClunkOut ${EMOJI_CLUNK_MS}ms cubic-bezier(.2,.85,.35,1) both`,
                  }}
                >
                  {outgoingEmoji.emoji}
                </span>
              )}
              <span
                key={display.emoji}
                style={{
                  position: outgoingEmoji ? "absolute" : "static",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: `hvEmojiClunk ${EMOJI_CLUNK_MS}ms cubic-bezier(.2,.85,.35,1) both`,
                }}
              >
                {display.emoji}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer — non-guessers (clue-giver, other team) only ever see Pause; the Submit
          slot simply doesn't exist for them, rather than being shown disabled. On the
          reveal interstitial, nobody gets a button except the incoming clue-giver — there
          is no timer-based auto-advance anywhere in this game; every round, including
          round 1, waits for that explicit tap (hv_begin_turn). Once "Time's Up!" is up,
          EVERY player gets the same End Round vote. */}
      <Footer
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        timerRunning={!showInterstitial && !timeUp && !game.paused}
      >
        {showInterstitial ? (
          isClueGiver && (
            <FooterButton onClick={beginFirstTurn} style={{ fontSize: FONT_SIZE.body }}>
              Start
            </FooterButton>
          )
        ) : timeUp ? (
          // Not a FooterButton — a NON-tipping vote leaves `timeUp` true (the round hasn't
          // actually ended yet, just this player's vote recorded), so the button never
          // unmounts in that case. FooterButton only resets its internal loading state on
          // unmount, so it would be stuck on "Loading…" forever after any vote that didn't
          // happen to be the tipping one. voteLoading here resets unconditionally instead.
          <button
            onClick={voteEndRound}
            disabled={voteLoading || hasVoted}
            style={{
              flex: 1,
              background: hasVoted ? POKE_COLORS.wl : "hsl(48, 95%, 60%)",
              color: hasVoted ? "#fff" : "#000",
              fontSize: FONT_SIZE.body,
              fontWeight: FONT_WEIGHT.black,
            }}
          >
            {voteLoading ? "…" : hasVoted ? `Waiting… (${votesCount}/${voteThreshold})` : `End Round (${votesCount}/${voteThreshold})`}
          </button>
        ) : (
          <>
            {/* Neither Pause nor Submit is a FooterButton — both stay mounted and tappable
                again after resolving (Pause toggles in place; Submit fires repeatedly across
                a whole turn's worth of guesses), which is exactly the shape FooterButton's
                "loading until unmount" contract doesn't fit — it would get stuck on
                "Loading…" forever the first time either was used more than once. */}
            <button
              onClick={togglePause}
              style={{
                width: canSubmit && !game.paused ? 90 : "100%",
                flexShrink: 0,
                background: "transparent",
                color: "#fff",
                fontSize: FONT_SIZE.small,
                fontWeight: FONT_WEIGHT.black,
              }}
            >
              {game.paused ? "Resume" : "Pause"}
            </button>
            {/* Only the designated submitter gets the Submit button — everyone else on the
                team can still tap cards to help (see hv_select_card, unchanged), but only
                this player's tap actually locks in the team's answer (see hv_submit_guess). */}
            {canSubmit && !game.paused && (
              <button
                onClick={submitGuess}
                disabled={!display.selectedSlug || feedbackActive}
                style={{ flex: 1, background: "hsl(145, 60%, 32%)", color: "#fff", fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.black }}
              >
                Submit
              </button>
            )}
          </>
        )}
      </Footer>
    </div>
    </>
  )
}
