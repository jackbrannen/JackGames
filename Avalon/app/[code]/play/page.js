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

const BG         = "#0F1923"
const CARD       = "#1C2B3A"
const GOLD       = "#C9A84C"
const TEXT       = "#E8DCC8"
const GOOD       = "#4A8FD4"
const EVIL       = "#AA2222"
const TEAL       = "#12BAAA"
const CARD_BACK  = "#243040"
const WARM_LIGHT = "#19303B"

// ~1/3 of the padded viewport (24px side padding × 2 + 20px for gaps = 68px)
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

const POKE_COLORS = { dark: "#091218", mid: "#1C2B3A", wl: "#19303B", yellow: "#C9A84C", notifBg: "#070D13" }
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
  .av-flip-in  { animation: avFlipIn   0.35s ease forwards; }
  .av-flip-out { animation: avCardFly 0.5s ease-in forwards; }
`

// Playing card with 180° flip reveal. animate=false → stays face-down; animate=true → flips in.
function PlayingCard({ frontBg, frontContent, delay = 0, animate }) {
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
        background: frontBg, borderRadius: 10,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "12px 8px", textAlign: "center", overflow: "hidden",
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

// Static playing card (same design, shown immediately — no flip)
function StaticCard({ bg, children }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      background: bg, borderRadius: 10,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "12px 8px", textAlign: "center",
      overflow: "hidden", flexShrink: 0,
    }}>
      {children}
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
  const [selected, setSelected]         = useState([])
  const [target, setTarget]             = useState(null)
  const [acting, setActing]             = useState(false)
  const [cardPhase, setCardPhase]       = useState("unset")
  const [animReady, setAnimReady]       = useState(false)
  const [instructions, setInstructions] = useState("")
  const soundTriggerRef = useRef(null)

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

  async function refresh() {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from("avalon_games").select("*").eq("code", code).single(),
      supabase.from("avalon_players").select("*").eq("game_code", code).order("seat"),
    ])
    if (g) setGame(g)
    if (p) setPlayers(p)
  }

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "avalon").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    refresh()
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [code])

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
    footerButtons = (
      <FooterButton variant="primary" onClick={() => rpc("advance_avalon_quest", { p_code: code })}>
        {nextLabel}
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
          await supabase.from("avalon_games").update({
            phase: "lobby", quest_results: [], winning_team: null,
            proposed_ids: [], reject_count: 0, quest_number: 1,
            leader_id: null, player_count: null, reveal_at: null,
          }).eq("code", code)
          await supabase.from("avalon_players").update({
            role: null, team: null, seat: null, submitted_card: null, ready: false,
          }).eq("game_code", code)
          router.replace(`/${code}`)
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
        onResetToLobby={async () => { await supabase.rpc("avalon_reset_to_lobby", { p_code: code }); await loadState() }}
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
  const voteCards = useMemo(() => {
    const arr = [...Array(resultSuccCount).fill("succeed"), ...Array(resultFailCount).fill("fail")]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, resultSuccCount, resultFailCount])

  // Role info
  const evilPlayers = players.filter(p => p.team === "evil")
  const evilOthers  = evilPlayers.filter(p => p.id !== myId)
  const teamColor   = me ? (me.team === "good" ? GOOD : EVIL) : GOLD
  const teamLabel   = me?.team === "good" ? "Good" : "Evil — Minions of Mordred"

// Score menu bar: show during active quest phases
  const showMenuBar = ["propose", "vote", "mission", "result", "assassination"].includes(phase)

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    // Small delay to let DB transaction commit before polling
    await new Promise(resolve => setTimeout(resolve, 100))
    await refresh()
  }


  // ─── shared components ────────────────────────────────────────

  function QuestTrack() {
    const results = game.quest_results ?? []
    return (
      <>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(232,220,200,0.35)", textAlign: "center", paddingTop: 14, paddingBottom: 6 }}>
          Quests
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "0 24px 18px" }}>
          {sizes.map((sz, i) => {
            const qn     = i + 1
            const result = results[i]
            const curr   = qn === game.quest_number && !result
            const dbl    = qn === 4 && (game.player_count ?? 5) >= 7
            const bg     = result === "success" ? GOOD : result === "fail" ? EVIL : curr ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.06)"
            const border = curr ? `2px solid ${GOLD}` : result ? "2px solid transparent" : "2px solid rgba(255,255,255,0.12)"
            const col    = result ? "#fff" : curr ? GOLD : "rgba(232,220,200,0.4)"
            return (
              <div key={i} style={{ flex: 1, maxWidth: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", background: bg, border, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: col, lineHeight: 1 }}>{sz}</span>
                  {dbl && <span style={{ fontSize: 13, fontWeight: 800, color: col, marginTop: 1 }}>†</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(232,220,200,0.4)", marginTop: 5 }}>{qn}</span>
              </div>
            )
          })}
        </div>
      </div>
        {pokeSystemNode}
      </>
    )
  }

  function Header({ sub, showTrack = true }) {
    return (
      <>
      <div style={{ background: "#0A1520" }}>
        {sub && (
          <div style={{ padding: "14px 24px 0" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{sub}</div>
          </div>
        )}
        {showTrack ? <QuestTrack /> : sub ? <div style={{ paddingBottom: 16 }} /> : null}
      </div>
        {pokeSystemNode}
      </>
    )
  }

  function PlayerRow({ p, onClick, highlight }) {
    return (
      <>
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
        {pokeSystemNode}
      </>
    )
  }


  // Role card content (shared between role reveal card and modal)
  function RoleCardBody() {
    if (!me) return null
    const roleSubtitle = me.role === "merlin" ? "Good — Loyal Servant of King Arthur" : teamLabel
    return (
      <>
        <div style={{ fontSize: 36, fontWeight: 900, color: teamColor, lineHeight: 1.1 }}>
          {ROLE_LABEL[me.role] ?? me.role}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: teamColor, opacity: 0.75, marginTop: 6 }}>
          {roleSubtitle}
        </div>

        {me.role === "merlin" && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EVIL, marginBottom: 10 }}>
              Evil Minions of Mordred
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
              {evilPlayers.map(p => (
                <StaticCard key={p.id} bg={EVIL}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", wordBreak: "break-word" }}>{p.name}</span>
                </StaticCard>
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
                    <StaticCard key={p.id} bg={EVIL}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", wordBreak: "break-word" }}>{p.name}</span>
                    </StaticCard>
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
                    style={{ background: WARM_LIGHT, color: TEXT, fontSize: 13, fontWeight: 700, padding: "10px 18px", marginTop: 22, display: "inline-block" }}
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
              showCount={false}
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
        <Header sub={`Quest ${game.quest_number}`} />
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
        <Header sub={`Quest ${game.quest_number}`} />
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
        <Header />
        <div style={{ padding: "20px 24px" }}>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {voteCards.map((v, i) => (
              <PlayingCard
                key={i}
                animate={animReady}
                delay={i * 0.15}
                frontBg={v === "succeed" ? GOOD : EVIL}
                frontContent={
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>
                    {v === "succeed" ? "Succeed" : "Fail"}
                  </span>
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

          {/* Score */}
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              <span style={{ color: GOOD }}>Loyal Servants: {goodWins}</span>
              <span style={{ color: "rgba(232,220,200,0.25)", margin: "0 12px" }}>·</span>
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
      <div style={{ paddingBottom: BOTTOM_PAD }}>
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
                frontContent={
                  <>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.2, wordBreak: "break-word" }}>{p.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)", marginTop: 6, lineHeight: 1.3 }}>{ROLE_LABEL[p.role] ?? p.role}</div>
                    {p.id === myId && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>you</div>}
                  </>
                }
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
                frontContent={
                  <>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.2, wordBreak: "break-word" }}>{p.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)", marginTop: 6, lineHeight: 1.3 }}>{ROLE_LABEL[p.role] ?? p.role}</div>
                    {p.id === myId && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>you</div>}
                  </>
                }
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

      {/* Score menu bar */}
      {showMenuBar && (
        <div style={{ background: "#0A1520", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOOD, opacity: 0.7, marginBottom: 2 }}>Loyal Servants</div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: GOOD }}>{goodWins}</div>
          </div>
          <div style={{ fontSize: 18, color: "rgba(232,220,200,0.2)", fontWeight: 300 }}>–</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: EVIL, opacity: 0.7, marginBottom: 2 }}>Evil Minions</div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: EVIL }}>{evilWins}</div>
          </div>
        </div>
      )}

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
