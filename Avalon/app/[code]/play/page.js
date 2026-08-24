"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import StatusBar from "../../../components/StatusBar"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import FooterButton from "../../../components/FooterButton"
import Selections from "../../../components/Selections"
import WaitingList from "../../../components/WaitingList"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const BG         = "#0F1923"
const CARD       = "#1C2B3A"
const GOLD       = "#C8A84B"
const TEXT       = "#E8DCC8"
const GOOD       = "#4A8FD4"
const EVIL       = "#AA2222"
const TEAL       = "#12BAAA"
const CARD_BACK  = "#243040"
const WARM_LIGHT = "#19303B"

// ~1/3 of the padded viewport (24px side padding × 2 + 20px for gaps = 68px)
const QUEST_IMG_COUNT = { succeed: 5, fail: 4 }
const CARD_W = "calc((100vw - 68px) / 3)"
const CARD_H = "calc((100vw - 68px) / 2)"

const QUEST_SIZES = {
  5:  [2,3,2,3,3],
  6:  [2,3,4,3,4],
  7:  [2,3,3,4,4],
  8:  [3,4,4,5,5],
  9:  [3,4,4,5,5],
  10: [3,4,4,5,5],
}

const ROLE_LABEL = {
  merlin:   "Merlin",
  loyal:    "Loyal Servant of Arthur",
  assassin: "The Assassin",
  minion:   "Minion of Mordred",
}

// Loyal/minion have 5 generic-art variants each (role_image, assigned server-side
// without repeats per game); merlin/assassin have one unique image each.
function roleImageSrc(p) {
  if (!p) return null
  if (p.role === "merlin" || p.role === "assassin") return `/roles/${p.role}.webp`
  if (p.role === "loyal" || p.role === "minion") return `/roles/${p.role}-${p.role_image}.webp`
  return null
}

const POKE_COLORS = { dark: "#091218", mid: "#1C2B3A", wl: "#19303B", yellow: "#C8A84B", notifBg: "#070D13" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const STYLES = `
  @keyframes avFlipIn {
    0%   { transform: perspective(700px) rotateY(-80deg) scale(0.85); opacity: 0; }
    100% { transform: perspective(700px) rotateY(0deg)   scale(1);    opacity: 1; }
  }
  @keyframes avCardFly {
    from { transform: translate(0, 0) scale(1); opacity: 1; }
    to   { transform: translate(calc(28px - 50vw), 80vh) scale(0.06); opacity: 0; }
  }
  @keyframes cardFlip180 {
    0%   { transform: perspective(600px) rotateY(180deg); }
    100% { transform: perspective(600px) rotateY(0deg); }
  }
  @keyframes titleReveal {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes questPop {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.25); }
    100% { transform: scale(1); }
  }
  @keyframes scoreReveal {
    from { opacity: 0; transform: translateY(6px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
  .av-flip-in  { animation: avFlipIn   0.35s ease forwards; }
  .av-flip-out { animation: avCardFly 0.5s ease-in forwards; }
  .av-quest-pop { animation: questPop 0.45s ease; }
`

// Playing card with 180° flip reveal. animate=false → stays face-down; animate=true → flips in.
// frontBorder: renders an edge-to-edge photo with a colored stroke instead of
// a solid color fill behind padded content — used by the quest result cards.
function PlayingCard({ frontBg, frontBorder, frontContent, delay = 0, animate }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      position: "relative",
      transformStyle: "preserve-3d",
      flexShrink: 0,
      transform: animate ? undefined : "perspective(600px) rotateY(180deg)",
      animation: animate ? `cardFlip180 0.52s ease ${delay}s both` : "none",
    }}>
      {/* Front */}
      <div style={{
        position: "absolute", inset: 0,
        backfaceVisibility: "hidden",
        background: frontBorder ? "transparent" : frontBg,
        border: frontBorder ? `3px solid ${frontBorder}` : "none",
        borderRadius: 10,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: frontBorder ? 0 : "12px 8px", textAlign: "center", overflow: "hidden",
      }}>
        {frontContent}
      </div>
      {/* Back */}
      <div style={{
        position: "absolute", inset: 0,
        backfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
        background: CARD_BACK, borderRadius: 10,
        border: "2px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, color: "rgba(255,255,255,0.2)",
      }}>
        ?
      </div>
    </div>
  )
}

// Teammate card — shows a fellow evil player's character art (image + bottom
// gradient) with their name overlaid, same treatment as the main role card.
function TeammateCard({ p, bg }) {
  const src = roleImageSrc(p)
  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      background: bg, borderRadius: 10,
      position: "relative", overflow: "hidden", flexShrink: 0,
    }}>
      {src && (
        <img src={src} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0))" }} />
      <div style={{ position: "absolute", left: 8, right: 8, bottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", wordBreak: "break-word", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{p.name}</span>
      </div>
    </div>
  )
}

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(523, ctx.currentTime)
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

export default function Play({ params }) {
  const code   = useMemo(() => params.code.toUpperCase(), [params.code])
  const router = useRouter()

  const [game, setGame]                 = useState(null)
  const [players, setPlayers]           = useState([])
  const [myId, setMyId]                 = useState(null)
  const isIdle = useIdleGate()
  const [selected, setSelected]         = useState([])
  const [target, setTarget]             = useState(null)
  const [acting, setActing]             = useState(false)
  const [cardPhase, setCardPhase]       = useState("unset")
  const [animReady, setAnimReady]       = useState(false)
  const [cardsDone, setCardsDone]       = useState(false)
  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  const [instructions, setInstructions] = useState("")
  const soundTriggerRef = useRef(null)
  const syncChRef = useRef(null)
  const syncKeyRef = useRef(null)

  useEffect(() => {
    if (!game || !myId) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playChirp()
  }, [game?.phase])

  useEffect(() => {
    const id = localStorage.getItem(`avalon:${code}:playerId`)
    if (!id) { router.replace(`/${code}`); return }
    setMyId(id)
  }, [code])

  const loadSeqRef = useRef(0)
  async function refresh() {
    const seq = ++loadSeqRef.current
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from("avalon_games").select("*").eq("code", code).single(),
      supabase.from("avalon_players").select("*").eq("game_code", code).order("seat"),
    ])
    if (seq !== loadSeqRef.current) return
    if (g?.replay_code) { router.replace(`/${g.replay_code}`); return }
    if (g) setGame(g)
    if (p) setPlayers(p)
    // Gossip: re-broadcast on a state change so a peer that missed the realtime push catches up fast.
    if (g) {
      const syncKey = `${g.phase}:${g.quest_number ?? ""}:${g.leader_id ?? ""}:${g.reject_count ?? ""}:${(g.proposed_ids ?? []).join(",")}:${(g.quest_results ?? []).join(",")}`
      if (syncKeyRef.current !== null && syncKeyRef.current !== syncKey) syncChRef.current?.send({ type: "broadcast", event: "sync" })
      syncKeyRef.current = syncKey
    }
  }

  // avalon_games/avalon_players changes: apply the row directly from the
  // realtime payload instead of a full refresh() refetch. Each change
  // independently reaches every subscribed client already, so there's no
  // need to also nudge — nudge() exists for cases where a client's own
  // realtime might be lagging, which doesn't apply to the client that just
  // received this exact event.
  const gamesSyncKeyRef = useRef(null)
  function applyGameRow(newRow) {
    if (!newRow) return
    if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
    setGame(newRow)
    const key = `${newRow.phase}:${newRow.quest_number ?? ""}:${newRow.leader_id ?? ""}:${newRow.reject_count ?? ""}:${(newRow.proposed_ids ?? []).join(",")}:${(newRow.quest_results ?? []).join(",")}`
    if (gamesSyncKeyRef.current !== null && gamesSyncKeyRef.current !== key) syncChRef.current?.send({ type: "broadcast", event: "sync" })
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
    if (isIdle) return
    supabase.from("game_instructions").select("body").eq("game_key", "avalon").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    refresh()
    const t = setInterval(refresh, 60000)
    function handleVisibility() { if (!document.hidden) refresh() }
    document.addEventListener("visibilitychange", handleVisibility)

    let cancelled = false
    let channel = null
    let reconnectTimer = null
    let reconnectAttempt = 0

    function connect() {
      channel = supabase.channel(`avalon-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "avalon_games", filter: `code=eq.${code}` }, payload => {
          if (payload.eventType === "DELETE") { refresh(); return }
          applyGameRow(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "avalon_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
        .on("broadcast", { event: "sync" }, refresh)
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0
            // Catch up immediately on (re)connect in case events were missed while disconnected.
            refresh()
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
      syncChRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearInterval(t)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [code, isIdle])

  // Redirect to lobby if game resets (Play Again)
  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])


  const phase = game?.phase
  useEffect(() => {
    setSelected([])
    setTarget(null)
    setActing(false)
    setAnimReady(false)
    if (phase === "role_reveal") setCardPhase("unset") // reset for each new game
  }, [phase])

  // Synchronized card reveal: wait for server-set reveal_at timestamp
  useEffect(() => {
    if (phase !== "result") { setAnimReady(false); return }
    const revealAt = game?.reveal_at ? new Date(game.reveal_at).getTime() : Date.now()
    const delay = revealAt - Date.now()
    if (delay <= 0) { setAnimReady(true); return }
    const t = setTimeout(() => setAnimReady(true), delay)
    return () => clearTimeout(t)
  }, [phase, game?.reveal_at])

  const me        = players.find(p => p.id === myId)

  // Mini card: visible on all phases after role has been seen
  const hasSeenRole  = cardPhase !== "unset"

  const [menuOpen, setMenuOpen] = useState(false)

  // Compute footer buttons based on phase
  let footerButtons = null
  if (me && phase === "role_reveal" && !me.ready && cardPhase !== "unset") {
    footerButtons = (
      <FooterButton
        variant="primary"
        onClick={() => rpc("mark_avalon_ready", { p_code: code, p_player_id: myId })}
      >
        I'm ready to play
      </FooterButton>
    )
  } else if (me && phase === "propose" && me.id === game?.leader_id) {
    const questSize = (QUEST_SIZES[game?.player_count ?? 5] ?? [2,3,2,3,3])[(game?.quest_number ?? 1) - 1]
    footerButtons = (
      <FooterButton
        variant="primary"
        onClick={() => rpc("submit_avalon_proposal", { p_code: code, p_leader_id: me.id, p_player_ids: selected })}
        disabled={selected.length !== questSize}
      >
        Propose Team ({selected.length}/{questSize})
      </FooterButton>
    )
  } else if (me && phase === "result") {
    const goodWins = (game?.quest_results ?? []).filter(r => r === "success").length
    const evilWins = (game?.quest_results ?? []).filter(r => r === "fail").length
    const nextLabel = goodWins >= 3 || evilWins >= 3 ? "Continue to Results" : "Next Quest"
    const readyIds  = game?.ready_player_ids ?? []
    const iAmReady  = readyIds.includes(me.id)
    // Raw button, not FooterButton — this is a "stays visible, label keeps
    // changing" ready-up control (matches SecretPhrase), not a one-shot
    // phase-changing action. FooterButton's internal loading state would
    // permanently render "Loading…" over our own "X/Y ready" label instead.
    footerButtons = (
      <button
        onClick={() => rpc("advance_avalon_quest", { p_code: code, p_player_id: me.id })}
        disabled={iAmReady}
        style={{ flex: 1, height: "100%", background: GOLD, color: "#000", fontSize: 18, fontWeight: 900, opacity: iAmReady ? 0.6 : 1 }}
      >
        {iAmReady ? `${readyIds.length}/${players.length} ready — waiting…` : nextLabel}
      </button>
    )
  } else if (me && phase === "servants_won" && me.role === "assassin") {
    footerButtons = (
      <FooterButton variant="primary" onClick={() => rpc("advance_avalon_to_assassination", { p_code: code })}>
        Proceed
      </FooterButton>
    )
  } else if (me && phase === "assassination" && me.role === "assassin" && target) {
    footerButtons = (
      <FooterButton
        variant="danger"
        onClick={() => rpc("submit_avalon_assassination", { p_code: code, p_target_id: target })}
      >
        Assassinate
      </FooterButton>
    )
  } else if (me && phase === "finished") {
    footerButtons = (
      <FooterButton
        variant="secondary"
        onClick={async () => {
          if (game.replay_code) { router.replace(`/${game.replay_code}`); return }
          const { data, error } = await supabase.rpc("avalon_create_replay", { p_code: code })
          if (error) { alert(error.message); throw error }
          syncChRef.current?.send({ type: "broadcast", event: "sync" })
          router.replace(`/${data}`)
        }}
      >
        Play Again
      </FooterButton>
    )
  }

  const pokeSystemNode = me ? (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        gamePhase={game?.phase}
        roleContent={hasSeenRole ? <RoleCardBody /> : null}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await supabase.rpc("avalon_reset_to_lobby", { p_code: code }); await refresh() }}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footerButtons}
      </Footer>
    </>
  ) : null

  const leader    = players.find(p => p.id === game?.leader_id)
  const sizes     = QUEST_SIZES[game?.player_count ?? 5] ?? [2,3,2,3,3]
  const questSize = sizes[(game?.quest_number ?? 1) - 1]
  const proposed  = players.filter(p => (game?.proposed_ids ?? []).includes(p.id))

  // Quest score — computed once at top level
  const allResults = game?.quest_results ?? []
  const goodWins   = allResults.filter(r => r === "success").length
  const evilWins   = allResults.filter(r => r === "fail").length

  // Stable shuffled vote cards — only reshuffles when phase or card counts change
  const resultFailCount = phase === "result" ? proposed.filter(p => p.submitted_card === "fail").length : 0
  const resultSuccCount = phase === "result" ? proposed.length - resultFailCount : 0
  // Deterministic shuffle seeded from code+quest number, so every player's
  // client lands on the exact same card order — otherwise each device would
  // independently randomize and the fail card could reveal at a different
  // position for different players.
  const voteCards = useMemo(() => {
    const arr = [...Array(resultSuccCount).fill("succeed"), ...Array(resultFailCount).fill("fail")]
    const seedStr = `${code}:${game?.quest_number ?? 0}`
    let seed = 0
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
    function rand() {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    // Same seed → every client picks the identical image per card, drawn
    // after the shuffle so it doesn't disturb the shuffle's own randomness.
    // Draw without replacement per type (a shuffled pool, popped off) so
    // two succeed cards in the same reveal never show the same photo;
    // reshuffle a fresh pool if a single reveal ever needs more than
    // QUEST_IMG_COUNT[type] of one type.
    const pools = {}
    function nextIdx(type) {
      if (!pools[type] || pools[type].length === 0) {
        const pool = Array.from({ length: QUEST_IMG_COUNT[type] }, (_, i) => i + 1)
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]]
        }
        pools[type] = pool
      }
      return pools[type].pop()
    }
    return arr.map(type => ({ type, img: `/quests/${type}-${nextIdx(type)}.webp` }))
  }, [phase, resultSuccCount, resultFailCount, code, game?.quest_number])

  // Quest bubble fills in only once the LAST card's flip animation finishes,
  // not the instant the first one starts (which is when `animReady` itself
  // flips true). Depends on `animReady` alone — deliberately not on
  // `resultSuccCount`/`resultFailCount`/`quest_number` — so this can only
  // ever fire because `animReady` itself changed, never as a side effect of
  // some other value changing while `animReady` is stale. `resultSuccCount`/
  // `resultFailCount` are read fresh from the closure when this runs; by the
  // time `animReady` flips true (already a ~2s wait on its own), that data
  // has long since settled, so there's no staleness risk in omitting them.
  useEffect(() => {
    if (!animReady) { setCardsDone(false); return }
    const totalCards = resultSuccCount + resultFailCount
    const lastCardDoneMs = (Math.max(0, totalCards - 1) * 0.15 + 0.52) * 1000
    const t = setTimeout(() => setCardsDone(true), lastCardDoneMs)
    return () => clearTimeout(t)
  }, [animReady])

  // Role info
  const evilPlayers = players.filter(p => p.team === "evil")
  const evilOthers  = evilPlayers.filter(p => p.id !== myId)
  const teamColor   = me ? (me.team === "good" ? GOOD : EVIL) : GOLD
  const teamLabel   = me?.team === "good" ? "Good" : "Evil — Minions of Mordred"

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) { alert(error.message); throw error }
    // Refresh immediately so the acting client's own button resolves right
    // away instead of waiting on its own realtime round-trip or another
    // peer's gossip nudge (both of which can take a few seconds).
    await refresh()
  }

  async function sendInlinePoke(targetName) {
    if (pokeCooldownActive) return
    setPokeCooldownActive(true)
    setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldownActive(false), 10000)
  }


  // ─── shared components ────────────────────────────────────────

  // hideResultForQuest: while the result-phase card flip/title animation is
  // still playing, treat this quest number as unresolved so its bubble stays
  // in the "current" state instead of jumping straight to filled.
  function QuestTrack({ hideResultForQuest } = {}) {
    const results = game.quest_results ?? []
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(232,220,200,0.35)", textAlign: "center", paddingTop: 14, paddingBottom: 6 }}>
          Quests
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "0 24px 18px" }}>
          {sizes.map((sz, i) => {
            const qn     = i + 1
            const result = qn === hideResultForQuest ? undefined : results[i]
            const curr   = qn === game.quest_number && !result
            const dbl    = qn === 4 && (game.player_count ?? 5) >= 7
            const bg     = result === "success" ? GOOD : result === "fail" ? EVIL : curr ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.06)"
            const border = curr ? `2px solid ${GOLD}` : result ? "2px solid transparent" : "2px solid rgba(255,255,255,0.12)"
            const col    = result ? "#fff" : curr ? GOLD : "rgba(232,220,200,0.4)"
            // Plays once, the instant this bubble's result first becomes
            // visible (qn === hideResultForQuest flips from hiding to not) —
            // className only changes on that one transition, so the browser
            // only (re)starts the keyframe then, no extra state needed.
            const justRevealed = qn === game.quest_number && hideResultForQuest == null && !!result
            return (
              <div key={i} style={{ flex: 1, maxWidth: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  className={justRevealed ? "av-quest-pop" : ""}
                  style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", background: bg, border, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "background 0.35s ease, border-color 0.35s ease" }}
                >
                  <span style={{ fontSize: 16, fontWeight: 900, color: col, lineHeight: 1 }}>{sz}</span>
                  {dbl && <span style={{ fontSize: 13, fontWeight: 800, color: col, marginTop: 1 }}>†</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(232,220,200,0.4)", marginTop: 5 }}>{qn}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function Header({ sub, showTrack = true, hideResultForQuest }) {
    return (
      <div style={{ background: "#0A1520" }}>
        {sub && (
          <div style={{ padding: "14px 24px 0" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{sub}</div>
          </div>
        )}
        {showTrack ? <QuestTrack hideResultForQuest={hideResultForQuest} /> : sub ? <div style={{ paddingBottom: 16 }} /> : null}
      </div>
    )
  }

  function PlayerRow({ p, onClick, highlight }) {
    return (
      <div
        onClick={onClick}
        style={{
          background: highlight ? "rgba(201,168,76,0.18)" : CARD,
          border: "2px solid transparent",
          padding: "13px 16px",
          display: "flex", alignItems: "center", gap: 10,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        {highlight !== undefined && (
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: highlight ? GOLD : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {highlight && <span style={{ fontSize: 13, fontWeight: 900, color: "#000" }}>✓</span>}
          </div>
        )}
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
          {p.name}

          {p.id === game?.leader_id && <span style={{ opacity: 0.45, fontSize: 13, fontWeight: 600 }}> ♛</span>}
        </span>
      </div>
    )
  }


  // Role card content (shared between role reveal card and modal)
  // Full-bleed portrait for the finished-screen reveal cards — image + bottom
  // gradient + name/role, same treatment as the role card and teammate cards.
  function PortraitCardFace({ p }) {
    const src = roleImageSrc(p)
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {src && <img src={src} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0))" }} />
        <div style={{ position: "absolute", left: 8, right: 8, bottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.2, wordBreak: "break-word", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{p.name}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 1.3, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{ROLE_LABEL[p.role] ?? p.role}</div>
          {p.id === myId && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>you</div>}
        </div>
      </div>
    )
  }

  function RoleCardBody() {
    if (!me) return null
    const roleSubtitle = me.role === "merlin" ? "Good — Loyal Servant of King Arthur" : teamLabel
    const imgSrc = roleImageSrc(me)
    return (
      <>
        {imgSrc && (
          <div style={{ position: "relative", width: "100%", aspectRatio: "866 / 1082", overflow: "hidden", marginBottom: 16 }}>
            <img src={imgSrc} alt={ROLE_LABEL[me.role] ?? me.role} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "50%", background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0))" }} />
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 14 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
                {ROLE_LABEL[me.role] ?? me.role}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamColor, textShadow: "0 2px 6px rgba(0,0,0,0.6)", marginTop: 6 }}>
                {roleSubtitle}
              </div>
            </div>
          </div>
        )}
        <div style={{ fontSize: 36, fontWeight: 900, color: teamColor, lineHeight: 1.1, display: imgSrc ? "none" : "block" }}>
          {ROLE_LABEL[me.role] ?? me.role}
        </div>
        {!imgSrc && (
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamColor, marginTop: 6 }}>
            {roleSubtitle}
          </div>
        )}

        {me.role === "merlin" && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EVIL, marginBottom: 10 }}>
              Evil Minions of Mordred
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
              {evilPlayers.map(p => (
                <TeammateCard key={p.id} p={p} bg={EVIL} />
              ))}
            </div>
            <div style={{ fontSize: 13, color: "rgba(232,220,200,0.55)", marginTop: 12, lineHeight: 1.6 }}>
              You are the only good player who knows the identity of the evil Minions of Mordred.
            </div>
          </div>
        )}

        {me.team === "evil" && (
          <div style={{ marginTop: 18 }}>
            {evilOthers.length > 0 ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EVIL, marginBottom: 10 }}>
                  Fellow Minions
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
                  {evilOthers.map(p => (
                    <TeammateCard key={p.id} p={p} bg={EVIL} />
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "rgba(232,220,200,0.55)", marginTop: 12, lineHeight: 1.6 }}>
                  You all know each other's identities.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "rgba(232,220,200,0.5)", lineHeight: 1.5 }}>
                You act alone.
              </div>
            )}
            {me.role === "assassin" && (
              <div style={{ fontSize: 13, fontWeight: 900, color: EVIL, marginTop: 12, lineHeight: 1.6 }}>
                Your job is to try to determine Merlin's identity.
              </div>
            )}
          </div>
        )}

        {me.team === "good" && me.role !== "merlin" && (
          <div style={{ marginTop: 14, fontSize: 14, color: "rgba(232,220,200,0.5)", lineHeight: 1.5 }}>
            You know nothing beyond your own allegiance.
          </div>
        )}
      </>
    )
  }

  // ─── loading ──────────────────────────────────────────────────

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }
  if (!game || !me) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(232,220,200,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
        {pokeSystemNode}
      </>
    )
  }

  // ─── phase content ────────────────────────────────────────────

  let phaseContent = null

  // ── role_reveal ──────────────────────────────────────────────
  if (phase === "role_reveal") {
    const amReady  = me.ready
    const showCard = cardPhase === "unset" || cardPhase === "shown" || cardPhase === "hiding"

    function handleReveal() { setCardPhase("shown") }
    function handleHide() {
      setCardPhase("hiding")
      setTimeout(() => setCardPhase("mini"), 350)
    }

    phaseContent = (
      <div style={{ paddingBottom: 120 }}>
        <div style={{ background: "#0A1520", padding: "20px 24px 24px" }}>
          <div style={{ fontSize: 40, fontWeight: 900, color: GOLD, letterSpacing: "-1.5px", lineHeight: 1 }}>
            Role Reveal
          </div>
        </div>

        <div style={{ padding: "24px" }}>
          {showCard && (
            <div
              className={cardPhase === "shown" ? "av-flip-in" : cardPhase === "hiding" ? "av-flip-out" : ""}
              style={{ background: CARD, padding: 24, marginBottom: 20 }}
            >
              {cardPhase === "unset" ? (
                <button
                  onClick={handleReveal}
                  style={{ background: GOLD, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", display: "block" }}
                >
                  Reveal My Role
                </button>
              ) : (
                <>
                  <RoleCardBody />
                  <button
                    onClick={handleHide}
                    style={{ background: TEXT, color: WARM_LIGHT, fontSize: 13, fontWeight: 700, padding: "10px 18px", marginTop: 22, display: "inline-block" }}
                  >
                    Hide
                  </button>
                  <div style={{ fontSize: 13, color: "rgba(232,220,200,0.5)", marginTop: 10, lineHeight: 1.5 }}>
                    Open the menu to view your card again.
                  </div>
                </>
              )}
            </div>
          )}

          {amReady && (
            <div style={{ background: "rgba(74,143,212,0.1)", border: `2px solid ${GOOD}`, padding: "16px 20px", textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: GOOD }}>You're ready!</div>
              <div style={{ fontSize: 13, color: "rgba(232,220,200,0.45)", marginTop: 4 }}>Waiting for everyone…</div>
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(232,220,200,0.35)", marginBottom: 10 }}>
            Players
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <WaitingList
              players={players.map(p => ({ name: p.name, done: !!p.ready }))}
              myName={me?.name}
              colors={{ mid: CARD }}
              onPoke={sendInlinePoke}
              cooldownActive={pokeCooldownActive}
              pokeJustSent={pokeJustSent}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── propose ──────────────────────────────────────────────────
  else if (phase === "propose") {
    const amLeader = me.id === game.leader_id
    const dblFail  = game.quest_number === 4 && (game.player_count ?? 5) >= 7

    function toggleSelect(pid) {
      setSelected(prev =>
        prev.includes(pid)
          ? prev.filter(x => x !== pid)
          : prev.length < questSize ? [...prev, pid] : prev
      )
    }

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <div style={{ background: "#0A1520" }}>
          <QuestTrack />
          <div style={{ padding: "0 24px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: GOLD, lineHeight: 1, letterSpacing: "-1px" }}>
              Quest {game.quest_number}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(232,220,200,0.65)", marginTop: 6 }}>
              {questSize} players needed
            </div>
            {dblFail && (
              <div style={{ fontSize: 13, color: "rgba(232,220,200,0.45)", marginTop: 4, lineHeight: 1.5 }}>
                This quest only fails if there are two fail votes.
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "20px 24px 0" }}>
          {game.reject_count > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: EVIL, marginBottom: 12 }}>
              {game.reject_count} / 5 consecutive rejections
            </div>
          )}

          <div style={{ fontSize: 17, fontWeight: 700, color: amLeader ? GOLD : "rgba(232,220,200,0.55)", marginBottom: 10 }}>
            {amLeader ? "Propose a team for the quest" : `${leader?.name ?? "?"} is proposing a team for the quest.`}
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 1, marginBottom: 16,
            border: amLeader ? `2px solid ${GOLD}` : "none",
            outline: amLeader ? `1px solid rgba(201,168,76,0.2)` : "none",
          }}>
            {players.map(p => (
              <PlayerRow
                key={p.id} p={p}
                onClick={amLeader ? () => toggleSelect(p.id) : undefined}
                highlight={amLeader ? selected.includes(p.id) : undefined}
              />
            ))}
          </div>

        </div>
      </div>
    )
  }

  // ── vote ─────────────────────────────────────────────────────
  else if (phase === "vote") {
    const amLeader = me.id === game.leader_id

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Header />
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: TEXT, marginBottom: 12 }}>
            Proposed Team
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 16 }}>
            {proposed.map(p => <PlayerRow key={p.id} p={p} />)}
          </div>

          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(232,220,200,0.65)", marginBottom: 20, lineHeight: 1.55 }}>
            Vote in person. {leader?.name ?? "The leader"} will enter the result.
          </div>

          {game.reject_count > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: EVIL, marginBottom: 16 }}>
              {game.reject_count} / 5 consecutive rejections
            </div>
          )}

          {amLeader ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => rpc("resolve_avalon_vote", { p_code: code, p_approved: true })}
                disabled={acting}
                style={{ flex: 1, background: GOOD, color: "#fff", fontSize: 18, fontWeight: 900, padding: 18 }}
              >
                Approved
              </button>
              <button
                onClick={() => rpc("resolve_avalon_vote", { p_code: code, p_approved: false })}
                disabled={acting}
                style={{ flex: 1, background: EVIL, color: "#fff", fontSize: 18, fontWeight: 900, padding: 18 }}
              >
                Rejected <span style={{ fontWeight: 400, fontSize: 15 }}>or Tie</span>
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 15, opacity: 0.65, paddingTop: 8 }}>
              Waiting for {leader?.name ?? "the leader"} to record the vote…
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── quest ─────────────────────────────────────────────────────
  else if (phase === "mission") {
    const onQuest   = (game.proposed_ids ?? []).includes(me.id)
    const submitted = proposed.filter(p => p.submitted_card).length
    const total     = proposed.length
    const myCard    = me.submitted_card

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Header />
        <div style={{ padding: "20px 24px" }}>
          <div style={{ background: "rgba(74,143,212,0.1)", border: `1px solid rgba(74,143,212,0.3)`, padding: "14px 18px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: GOOD }}>Team approved!</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(232,220,200,0.6)", marginTop: 4 }}>Now time for the quest.</div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(232,220,200,0.35)", marginBottom: 8 }}>
            On this quest ({submitted}/{total} submitted)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 24 }}>
            {proposed.map(p => (
              <div key={p.id} style={{ background: CARD, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: p.submitted_card ? TEAL : "rgba(255,255,255,0.18)" }} />
                <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                  {p.name}
                  
                </span>
                {p.submitted_card && <span style={{ fontSize: 13, color: TEAL, fontWeight: 700 }}>✓</span>}
              </div>
            ))}
          </div>

          {onQuest && !myCard && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button
                  onClick={() => rpc("submit_avalon_card", { p_code: code, p_player_id: me.id, p_card: "success" })}
                  disabled={acting}
                  style={{ flex: 1, background: GOOD, color: "#fff", fontSize: 18, fontWeight: 900, padding: 18 }}
                >
                  Quest Succeeds
                </button>
                {me.team === "evil" && (
                  <button
                    onClick={() => rpc("submit_avalon_card", { p_code: code, p_player_id: me.id, p_card: "fail" })}
                    disabled={acting}
                    style={{ flex: 1, background: EVIL, color: "#fff", fontSize: 18, fontWeight: 900, padding: 18 }}
                  >
                    Quest Fails
                  </button>
                )}
              </div>
              {me.team === "good" && (
                <div style={{ background: "rgba(74,143,212,0.08)", borderLeft: `3px solid rgba(74,143,212,0.4)`, padding: "12px 16px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(232,220,200,0.8)", lineHeight: 1.55 }}>
                    As a loyal servant of King Arthur, you can only vote for the quest to succeed.
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(232,220,200,0.45)", marginTop: 8 }}>
                    Thank you for your service.
                  </div>
                </div>
              )}
            </>
          )}
          {onQuest && myCard && (
            <div style={{ fontSize: 15, color: TEAL, fontWeight: 700 }}>
              Card submitted — waiting for others…
            </div>
          )}
          {!onQuest && (
            <div style={{ fontSize: 13, opacity: 0.65 }}>
              You're not on this quest. Hang tight for the outcome…
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── result ───────────────────────────────────────────────────
  else if (phase === "result") {
    const lastResult  = allResults[allResults.length - 1]
    const resultColor = lastResult === "success" ? GOOD : EVIL

    const nextLabel = goodWins >= 3
      ? (acting ? "…" : "Good guys win! Unless…")
      : evilWins >= 3
        ? (acting ? "…" : "View Final Results →")
        : (acting ? "…" : "Next Quest →")

    const totalCards = voteCards.length
    const titleDelay = totalCards * 0.15 + 0.2

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Header hideResultForQuest={!cardsDone ? game.quest_number : null} />
        <div style={{ padding: "20px 24px" }}>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {voteCards.map((v, i) => (
              <PlayingCard
                key={i}
                animate={animReady}
                delay={i * 0.15}
                frontBorder={v.type === "succeed" ? GOOD : EVIL}
                frontContent={
                  <img src={v.img} alt={v.type === "succeed" ? "Succeed" : "Fail"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                }
              />
            ))}
          </div>

          <div style={{
            fontSize: 38, fontWeight: 900, color: resultColor, lineHeight: 1.1,
            textAlign: "center", marginBottom: 28,
            opacity: animReady ? 1 : 0,
            animation: animReady ? `titleReveal 0.3s ease ${titleDelay}s both` : "none",
          }}>
            {lastResult === "success" ? "Quest Succeeded" : "Quest Failed"}
          </div>

          {/* Score — same pure-CSS animation-delay pattern as the title above,
              keyed off the same `animReady` boolean, just delayed further so
              it visibly follows the title. No separate timer/state: nothing
              here to race against anything else. */}
          <div style={{
            textAlign: "center", marginTop: 28,
            opacity: animReady ? 1 : 0,
            animation: animReady ? `scoreReveal 0.35s ease ${titleDelay + 0.3}s both` : "none",
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ color: GOOD }}>Loyal Servants: {goodWins}</span>
              <span style={{ color: EVIL }}>Evil Minions: {evilWins}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,220,200,0.4)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              First to three wins
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── servants_won ─────────────────────────────────────────────
  // Intervening screen after the Loyal Servants clinch their 3rd quest.
  // The game isn't decided yet: the Assassin gets one shot at Merlin before
  // the win is final. Only the Assassin can proceed to the target picker.
  else if (phase === "servants_won") {
    const amAssassin = me.role === "assassin"

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Header sub="The Servants Have Won…" showTrack={false} />
        <div style={{ padding: "20px 24px" }}>
          <div style={{
            fontSize: 22, fontWeight: 900, color: GOOD, lineHeight: 1.3,
            textAlign: "center", marginBottom: 16,
          }}>
            The Loyal Servants have completed 3 quests!
          </div>
          <div style={{ background: "rgba(170,34,34,0.1)", border: `1px solid rgba(170,34,34,0.35)`, padding: "20px 18px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(232,220,200,0.85)", lineHeight: 1.6 }}>
              But the game isn't over yet — the Assassin now gets one chance to identify Merlin.
              If correct, the evil Minions of Mordred win instead.
            </div>
          </div>
          {!amAssassin && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,220,200,0.4)", marginTop: 20, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Waiting for the Assassin…
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── assassination ────────────────────────────────────────────
  else if (phase === "assassination") {
    const amAssassin  = me.role === "assassin"
    const goodPlayers = players.filter(p => p.team === "good")

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Header sub="Assassination" showTrack={false} />
        <div style={{ padding: "20px 24px" }}>
          {amAssassin ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.6, marginBottom: 20, color: "rgba(232,220,200,0.85)" }}>
                If you successfully assassinate Merlin, your team wins the game.
              </div>
              <div style={{ marginBottom: 20 }}>
                <Selections
                  options={goodPlayers.map(p => ({ id: p.id, text: p.name }))}
                  selectedId={target}
                  onSelect={id => setTarget(id)}
                  onDeselect={() => setTarget(null)}
                  colors={{ bg: CARD, selectedBg: EVIL, selectedText: "#fff", deselectBg: "#6B0000", deselectText: "#fff" }}
                />
              </div>
            </>
          ) : (
            <div style={{ background: "rgba(170,34,34,0.1)", border: `1px solid rgba(170,34,34,0.35)`, padding: "20px 18px" }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: EVIL, marginBottom: 10 }}>
                The Assassin is choosing their target.
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(232,220,200,0.75)", lineHeight: 1.6 }}>
                If the Assassin is able to guess Merlin's identity, the evil Minions of Mordred win the game.
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── finished ─────────────────────────────────────────────────
  else if (phase === "finished") {
    const goodWon      = game.winning_team === "good"
    const winColor     = goodWon ? GOOD : EVIL
    const goodPlayers  = players.filter(p => p.team === "good")
    const evilPlayers2 = players.filter(p => p.team === "evil")

    phaseContent = (
      <div style={{ paddingBottom: BOTTOM_PAD, animation: "endGameIn 300ms ease-out both" }}>
        <Header sub="Game Over" showTrack={false} />
        <div style={{ padding: "20px 24px" }}>
          <div style={{
            background: goodWon ? "rgba(74,143,212,0.12)" : "rgba(170,34,34,0.12)",
            border: `2px solid ${winColor}`,
            padding: "28px 24px", marginBottom: 28, textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: winColor, marginBottom: 10 }}>
              {goodWon ? "Good" : "Evil"} wins
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, color: winColor, lineHeight: 1.2 }}>
              {goodWon ? "Long live King Arthur" : "Mordred Eats King Arthur"}
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: GOOD, marginBottom: 12, textAlign: "center" }}>
            Loyal Servants of King Arthur
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 28 }}>
            {goodPlayers.map((p, i) => (
              <PlayingCard
                key={p.id}
                animate={true}
                delay={i * 0.1}
                frontBg={GOOD}
                frontContent={<PortraitCardFace p={p} />}
              />
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: EVIL, marginBottom: 12, textAlign: "center" }}>
            Minions of Mordred
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 28 }}>
            {evilPlayers2.map((p, i) => (
              <PlayingCard
                key={p.id}
                animate={true}
                delay={(goodPlayers.length + i) * 0.1}
                frontBg={EVIL}
                frontContent={<PortraitCardFace p={p} />}
              />
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <a href="https://games.jackbrannen.com"
              style={{ display: "block", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none" }}>
              Play Another Game
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── main render ──────────────────────────────────────────────

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: TEXT }}>
      <style>{STYLES}</style>

      {phaseContent ?? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
          <p style={{ color: "rgba(232,220,200,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
        </div>
      )}
    </div>
      {pokeSystemNode}
    </>
  )
}
