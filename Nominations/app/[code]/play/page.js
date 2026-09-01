"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import StatusBar from "../../../components/StatusBar"
import TextEntry from "../../../components/TextEntry"
import WaitingList from "../../../components/WaitingList"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"
import EndGame from "../../../components/EndGame"
import IdleGateModal from "../../../components/IdleGateModal"
import { useIdleGate } from "../../../lib/useIdleGate"

const BG = "#a2d291"
const DARK = "#7bc688"
const MID = "#7bc688"
const WARM_LIGHT = "#c5dc93"
const YELLOW = "#FBDF54"
const BTN = "#323340"
const INK = "#1A2418"
const WRONG_RED = "#991B1B"
const CHECK_GREEN = "#357C4F"
const WAIT_BG = "#C5DD94"
// Chrome layer (Footer, Menu drawer, Notifications, IdleGateModal) needs a
// genuinely dark surface for its white text/icons to read — DARK/MID above
// are light green (correct for the StatusBar header, which is a separate,
// already-approved treatment), not dark enough for this. Built from the
// game's own dark navy footer-button color instead.
const CHROME_DARK = BTN
const CHROME_MID = "#43445A"
const CHROME_WL = "#54566F"
const POKE_COLORS = { dark: CHROME_DARK, mid: CHROME_MID, wl: CHROME_WL, yellow: YELLOW, notifBg: CHROME_DARK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

function Nm({ children }) { return <span style={{ fontWeight: 900 }}>{children}</span> }

function ScorePill({ score }) {
  return (
    <span style={{ background: BTN, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 10px" }}>
      You {score ?? 0}
    </span>
  )
}

function PointsBadge({ amount }) {
  return (
    <span style={{ background: BTN, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 10px", flexShrink: 0 }}>
      +{amount}
    </span>
  )
}

function Well({ children, size = 22 }) {
  return (
    <div style={{ background: BTN, color: "white", padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.3 }}>{children}</div>
    </div>
  )
}

// Must stay at module scope. Defined inside the page component, this gets a new
// function identity on every render, so React tears down and rebuilds the whole
// subtree each time state changes — which blurs any focused input (the
// superlative field lost focus after every keystroke).
// footerKey identifies which screen the footer belongs to. Without it, two
// different screens that both render a <FooterButton> in this same slot (e.g.
// reveal's "Next round →" and the next round's "Lock it in") reconcile as the
// same element type in the same position, so React reuses the instance and
// carries its internal loading state across. FooterButton never resets loading
// on success — it relies on unmounting — so it would sit disabled on "Loading…"
// forever. Keying the slot forces a real remount whenever the screen changes.
function Shell({ label, right, children, footer, footerKey, scroll, banner, menuNode, menuOpen, onToggleMenu }) {
  return (
    <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
        <StatusBar label={label} dark={DARK} textColor={INK} right={right} />
        {banner && (
          <div style={{ background: "#FFFFFF", color: INK, padding: "14px 16px", fontSize: 15, fontWeight: 900, textAlign: "center", flexShrink: 0 }}>
            {banner}
          </div>
        )}
        <div style={scroll
          ? { flex: 1, overflowY: "auto", padding: "24px 24px", paddingBottom: BOTTOM_PAD, display: "flex", flexDirection: "column" }
          : { flex: 1, padding: "28px 24px", paddingBottom: BOTTOM_PAD, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
      {menuNode}
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={onToggleMenu}>
        <Fragment key={footerKey}>{footer}</Fragment>
      </Footer>
    </>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [superlatives, setSuperlatives] = useState([])
  const [rounds, setRounds] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [draft, setDraft] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [voteSelection, setVoteSelection] = useState(null)
  const [targetSelection, setTargetSelection] = useState(null)
  const [revealedTarget, setRevealedTarget] = useState(false)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  const channelRef = useRef(null)
  const gossipKeyRef = useRef(null)

  useEffect(() => {
    setVoteSelection(null)
    setRevealedTarget(false)
  }, [game?.round_index])

  // Gossip (see REALTIME.md §4): if this client's own loadState() notices the
  // game row changed since it last checked, re-broadcast a "sync" nudge so any
  // peer whose postgres_changes subscription silently dropped that update
  // catches up immediately instead of waiting on the next 60s poll. None of
  // these fields change on a repeated tap.
  function gossipSyncKey(g) {
    return `${g.phase}:${g.round_index}:${(g.ready_next_round_ids || []).length}`
  }

  useEffect(() => {
    setMyPlayerId(localStorage.getItem(`nom:${code}:playerId`))
  }, [code])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "nominations").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
  }, [])

  async function loadState() {
    const seq = ++loadSeqRef.current
    const [{ data: gameData }, { data: playerData }, { data: superlativeData }, { data: roundData }] = await Promise.all([
      supabase.from("nom_games").select("*").eq("code", code).single(),
      supabase.from("nom_players").select("id,name,first_name,last_name,score,created_at").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("nom_superlatives").select("id,player_id,text").eq("game_code", code),
      supabase.from("nom_rounds").select("*").eq("game_code", code),
    ])
    if (seq !== loadSeqRef.current) return
    if (gameData?.replay_code) { router.replace(`/${gameData.replay_code}/play`); return }
    if (gameData) {
      const key = gossipSyncKey(gameData)
      if (gossipKeyRef.current !== null && gossipKeyRef.current !== key) {
        channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      }
      gossipKeyRef.current = key
      setGame(gameData)
    }
    setPlayers(playerData ?? [])
    setSuperlatives(superlativeData ?? [])
    setRounds(roundData ?? [])
  }

  function upsertRow(setter) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload
      if (eventType === "DELETE") { setter(prev => prev.filter(r => r.id !== oldRow?.id)); return }
      if (!newRow) return
      setter(prev => {
        const i = prev.findIndex(r => r.id === newRow.id)
        return i === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
      })
    }
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
    let stableTimer = null

    function connect() {
      channel = supabase
        .channel(`nom-play-${code}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_games", filter: `code=eq.${code}` }, payload => {
          if (payload.new) setGame(payload.new)
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_players", filter: `game_code=eq.${code}` }, upsertRow(setPlayers))
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_superlatives", filter: `game_code=eq.${code}` }, upsertRow(setSuperlatives))
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_rounds", filter: `game_code=eq.${code}` }, upsertRow(setRounds))
        .on("broadcast", { event: "sync" }, () => { loadState() })
        .subscribe(status => {
          if (cancelled) return
          if (status === "SUBSCRIBED") {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempt = 0 }, 10000)
            loadState()
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
      channelRef.current = channel
    }
    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      clearTimeout(stableTimer)
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [code, isIdle])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase])

  if (isIdle) return <IdleGateModal colors={{ dark: DARK, wl: WARM_LIGHT }} buttonTextColor={INK} textColor={INK} mutedTextColor="rgba(26,36,24,0.75)" />
  if (!game || !players.length) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: INK, fontSize: 18, fontWeight: 800 }}>Loading…</p>
    </div>
  }

  const byId = Object.fromEntries(players.map(p => [p.id, p]))
  const me = players.find(p => p.id === myPlayerId)
  const superlativeById = Object.fromEntries(superlatives.map(s => [s.id, s]))

  if (!me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ color: INK, fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: INK, textDecoration: "underline" }}>Back to lobby</a></div>
    </div>
  }

  const roundLabel = `Round ${game.round_index + 1} of ${game.total_rounds}`

  async function rpc(fn, args) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    await loadState()
  }
  function nudge() {
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
  }

  const menuNode = (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={[...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(p => ({
          name: p.name, firstName: p.first_name, lastName: p.last_name, score: p.score ?? 0,
        }))}
        gamePhase={game.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await supabase.rpc("nom_reset_to_lobby", { p_code: code }) }}
      />
    </>
  )

  // ── WRITING PHASE ──────────────────────────────────────────────────────
  if (game.phase === "writing") {
    const mySuperlative = superlatives.find(s => s.player_id === myPlayerId)

    async function submit() {
      const trimmed = draft.trim()
      if (!trimmed) return
      setSubmitError("")
      try {
        await rpc("nom_submit_superlative", { p_code: code, p_player_id: myPlayerId, p_text: trimmed })
        nudge()
      } catch (e) {
        setSubmitError(e?.message || "Something went wrong.")
        throw e
      }
    }

    if (mySuperlative) {
      return (
        <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)} footerKey="writing" label="Nominations">
          <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1, marginBottom: 24 }}>Waiting for<br />everyone…</div>
          <WaitingList
            players={players.map(p => ({ name: p.name, done: superlatives.some(s => s.player_id === p.id) }))}
            myName={me.name}
            colors={{ mid: WAIT_BG }}
            doneColor={CHECK_GREEN}
          />
        </Shell>
      )
    }

    return (
      <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
        label="Nominations"
        footerKey="write"
        footer={<FooterButton onClick={submit} disabled={!draft.trim()} bg={BTN} textColor="white">Submit</FooterButton>}
      >
        <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1, marginBottom: 10 }}>Write your superlative</div>
        <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.75, marginBottom: 24, lineHeight: 1.4 }}>
          Something like &quot;Most likely to…&quot; or &quot;Best…&quot;. <b>Don&apos;t pick one with an obvious answer</b> for this group — the fun is in the surprise.
        </p>
        <TextEntry
          value={draft}
          onChange={setDraft}
          multiline={false}
          onSubmit={submit}
          placeholder=""
          maxLength={140}
          bg={WARM_LIGHT}
          fontSize={18}
          style={{ fontWeight: 600, color: INK }}
        />
        {submitError && <p style={{ fontSize: 14, fontWeight: 700, color: WRONG_RED, marginTop: 12 }}>{submitError}</p>}
      </Shell>
    )
  }

  // ── ASSIGNMENT PHASE ───────────────────────────────────────────────────
  if (game.phase === "assigning") {
    // Every player answers all of this in one sitting, so nobody is ever called
    // back mid-phase (being recalled would itself reveal you hold a
    // truth-teller slot). Both superlatives you'll argue are known up front.
    const myAssignment = rounds.find(r => r.assignee_id === myPlayerId)
    const myPartnerRound = rounds.find(r => r.partner_id === myPlayerId)
    const needsRole = myAssignment && !myAssignment.assignee_role
    const needsOwnPick = myAssignment && myAssignment.assignee_role === "truthteller" && !myAssignment.assignee_pick
    const needsPartnerPick = myPartnerRound && !myPartnerRound.partner_pick

    const isDone = (p) => {
      const own = rounds.find(r => r.assignee_id === p.id)
      const partner = rounds.find(r => r.partner_id === p.id)
      if (!own || !own.assignee_role) return false
      if (own.assignee_role === "truthteller" && !own.assignee_pick) return false
      return !!(partner && partner.partner_pick)
    }

    async function chooseRole(role) {
      await rpc("nom_choose_role", { p_code: code, p_player_id: myPlayerId, p_role: role })
      nudge()
    }
    async function chooseTarget(roundId, targetId) {
      setTargetSelection(null)
      await rpc("nom_choose_assignment_target", { p_code: code, p_player_id: myPlayerId, p_round_id: roundId, p_target_id: targetId })
      nudge()
    }

    if (needsRole) {
      const text = superlativeById[myAssignment.superlative_id]?.text
      return (
        <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)} footerKey="assign-role" label="Your assignment" scroll>
          <Well>{text}</Well>
          <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            How do you want to play it?
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.75, marginBottom: 20, lineHeight: 1.4 }}>
            You&apos;ll argue two superlatives this game. This is the one you get to choose how to play — someone else will argue it against you.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => chooseRole("truthteller")}
              style={{ textAlign: "left", background: WARM_LIGHT, color: INK, padding: "18px 20px", display: "block", width: "100%" }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Truth-teller</div>
              <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.75 }}>You get to pick who you argue for.</div>
            </button>
            <button
              onClick={() => chooseRole("bluffer")}
              style={{ textAlign: "left", background: WARM_LIGHT, color: INK, padding: "18px 20px", display: "block", width: "100%" }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Bluffer</div>
              <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.75 }}>The game picks who you argue for, but you get double points for each person you fool.</div>
            </button>
          </div>
        </Shell>
      )
    }

    if (needsOwnPick || needsPartnerPick) {
      const task = needsOwnPick ? myAssignment : myPartnerRound
      const isOwn = !!needsOwnPick
      const text = superlativeById[task.superlative_id]?.text
      const choices = players.filter(p => p.id !== myPlayerId)
      return (
        <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
          label="Your assignment"
          footerKey={`assign-target-${task.id}`}
          scroll
          footer={targetSelection ? (
            <FooterButton onClick={() => chooseTarget(task.id, targetSelection)} bg={BTN} textColor="white">Lock it in</FooterButton>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>
              Lock in your choice
            </div>
          )}
        >
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Superlative {isOwn ? 1 : 2} of 2
          </div>
          <Well>{text}</Well>
          <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            {isOwn ? "You're the truth teller." : "Your second superlative"}
          </div>
          {isOwn ? (
            <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
              Who does this fit best?
            </p>
          ) : (
            <>
              <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 10 }}>
                Who does this one fit best?
              </p>
              <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, opacity: 0.75, marginBottom: 20 }}>
                You&apos;ll argue this one too, but the other player decides whether you tell the truth on it or bluff — so you might not get to use this pick. If you end up telling the truth, this is your answer. If you end up bluffing, the game hands you someone else instead.
              </p>
            </>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {choices.map(p => (
              <button
                key={p.id}
                onClick={() => setTargetSelection(p.id)}
                style={{
                  textAlign: "left", padding: "16px 18px", fontSize: 17, fontWeight: 700, color: INK,
                  background: targetSelection === p.id ? YELLOW : WARM_LIGHT,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </Shell>
      )
    }

    return (
      <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
        label="Your assignment"
        footerKey="assign-done"
        scroll
      >
        <div style={{ fontSize: "clamp(26px, 7vw, 34px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>You&apos;re all set</div>
        <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.75, marginBottom: 24, lineHeight: 1.4 }}>
          Waiting on everyone else to finish picking. Round 1 starts on its own.
        </p>
        <WaitingList
          players={players.map(p => ({ name: p.name, done: isDone(p) }))}
          myName={me.name}
          colors={{ mid: WAIT_BG }}
          doneColor={CHECK_GREEN}
        />
      </Shell>
    )
  }

  const currentRound = rounds.find(r => r.round_order === game.round_index)
  if (!currentRound && game.phase !== "finished") {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: INK, fontSize: 18, fontWeight: 800 }}>Loading…</p>
    </div>
  }

  // ── VOTING PHASE ───────────────────────────────────────────────────────
  if (game.phase === "voting") {
    const bluffer = byId[currentRound.bluffer_id]
    const truthteller = byId[currentRound.truthteller_id]
    const text = superlativeById[currentRound.superlative_id]?.text
    const first = byId[currentRound.speak_first_id]
    const second = currentRound.speak_first_id === currentRound.bluffer_id ? truthteller : bluffer
    const isBluffer = myPlayerId === currentRound.bluffer_id
    const isTruthteller = myPlayerId === currentRound.truthteller_id
    const isUp = isBluffer || isTruthteller
    const eligible = players.filter(p => p.id !== currentRound.bluffer_id && p.id !== currentRound.truthteller_id)
    const myVote = currentRound.votes?.[myPlayerId]

    async function vote(targetId) {
      await rpc("nom_submit_vote", { p_code: code, p_player_id: myPlayerId, p_guessed_bluffer_id: targetId })
      nudge()
    }

    const nominators = (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>
          Giving speeches
        </div>
        <div style={{ fontSize: 19, fontWeight: 900 }}>1. {first?.name}</div>
        <div style={{ fontSize: 19, fontWeight: 900 }}>2. {second?.name}</div>
      </div>
    )

    // The two speakers get a private reminder of their own role and who they're
    // arguing for — the assignment phase may have been many rounds ago.
    if (isUp) {
      const target = isBluffer ? byId[currentRound.bluffer_target_id] : byId[currentRound.truthteller_target_id]
      return (
        <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)} label={roundLabel} right={<ScorePill score={me.score} />} footerKey={`speaker-${currentRound.id}`} scroll banner="You're up">
          <Well>{text}</Well>
          <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            {isBluffer ? "You're the bluffer." : "You're the truth teller."}
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
            {isBluffer ? "Convince everyone this is true of this person:" : "You said this fits:"}
          </p>
          {!revealedTarget ? (
            <button
              onClick={() => setRevealedTarget(true)}
              style={{ display: "block", width: "100%", background: WARM_LIGHT, color: INK, fontSize: 18, fontWeight: 900, padding: "22px", marginBottom: 20 }}
            >
              Tap to reveal
            </button>
          ) : (
            <div style={{ textAlign: "center", background: WARM_LIGHT, padding: "22px", marginBottom: 20, animation: "nom-reveal 0.35s ease-out" }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: INK }}>{target?.name}</span>
            </div>
          )}
          <style>{`@keyframes nom-reveal { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
          <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, opacity: 0.75, marginBottom: 24 }}>
            {isBluffer
              ? "Make them think you're NOT the bluffer by making it sound like you picked this person on your own."
              : "Be convincing — you score for everyone who doesn't point the finger at you."}
          </p>
          {nominators}
        </Shell>
      )
    }

    if (myVote) {
      return (
        <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)} label={roundLabel} right={<ScorePill score={me.score} />} footerKey={`voted-${currentRound.id}`} scroll>
          <Well>{text}</Well>
          <div style={{ fontSize: "clamp(26px, 7vw, 34px)", fontWeight: 900, marginBottom: 20 }}>Vote locked in</div>
          <WaitingList
            players={eligible.map(p => ({ name: p.name, done: !!currentRound.votes?.[p.id] }))}
            myName={me.name}
            colors={{ mid: WAIT_BG }}
            doneColor={CHECK_GREEN}
          />
        </Shell>
      )
    }

    return (
      <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
        label={roundLabel}
        right={<ScorePill score={me.score} />}
        footerKey={`vote-${currentRound.id}`}
        scroll
        footer={
          <FooterButton onClick={() => vote(voteSelection)} disabled={!voteSelection} bg={BTN} textColor="white">
            Lock it in
          </FooterButton>
        }
      >
        <Well>{text}</Well>
        {nominators}
        <div style={{ flex: 1, minHeight: 24 }} />
        <div style={{ fontSize: "clamp(24px, 7vw, 32px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>Who&apos;s the bluffer?</div>
        <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.75, marginBottom: 20 }}>Vote after they&apos;ve given their speeches.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[first, second].map(p => (
            <button
              key={p.id}
              onClick={() => setVoteSelection(p.id)}
              style={{
                padding: "20px 18px", fontSize: 19, fontWeight: 900, color: INK,
                background: voteSelection === p.id ? YELLOW : WARM_LIGHT,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ height: 64, flexShrink: 0 }} />
      </Shell>
    )
  }

  // ── REVEAL PHASE ───────────────────────────────────────────────────────
  if (game.phase === "reveal") {
    const bluffer = byId[currentRound.bluffer_id]
    const truthteller = byId[currentRound.truthteller_id]
    const blufferTarget = byId[currentRound.bluffer_target_id]
    const truthtellerTarget = byId[currentRound.truthteller_target_id]
    const text = superlativeById[currentRound.superlative_id]?.text
    const votes = currentRound.votes || {}
    const correctVoters = players.filter(p => votes[p.id] === currentRound.bluffer_id)
    const wrongVoters = players.filter(p => votes[p.id] && votes[p.id] !== currentRound.bluffer_id)
    const isLastRound = game.round_index + 1 >= game.total_rounds
    const imReady = (game.ready_next_round_ids || []).includes(myPlayerId)

    async function readyNext() {
      await rpc("nom_ready_next_round", { p_code: code, p_player_id: myPlayerId })
      nudge()
    }

    const row = (p, mark, color) => (
      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: WARM_LIGHT }}>
        <span style={{ fontWeight: 700 }}>{p.name}</span>
        <span style={{ fontWeight: 900, color }}>{mark}</span>
      </div>
    )

    return (
      <Shell menuNode={menuNode} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
        label={roundLabel}
        right={<ScorePill score={me.score} />}
        footerKey={`reveal-${currentRound.id}`}
        scroll
        footer={imReady ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", opacity: 0.65 }}>
            {(game.ready_next_round_ids || []).length} / {players.length} ready…
          </div>
        ) : (
          <FooterButton onClick={readyNext} bg={BTN} textColor="white">
            {isLastRound ? "See final score →" : "Next round →"}
          </FooterButton>
        )}
      >
        <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
          <Nm>{bluffer?.name}</Nm> was the bluffer
        </div>
        <Well size={18}>{text}</Well>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: WARM_LIGHT }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}><Nm>{truthteller?.name}</Nm> truthfully picked <Nm>{truthtellerTarget?.name}</Nm></span>
            <PointsBadge amount={correctVoters.length} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: WARM_LIGHT }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              <Nm>{bluffer?.name}</Nm> bluffed with <Nm>{blufferTarget?.name}</Nm>
              <span style={{ opacity: 0.65, fontWeight: 600 }}> · 2 pts each fooled</span>
            </span>
            <PointsBadge amount={wrongVoters.length * 2} />
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Got it right <span style={{ opacity: 0.6, fontWeight: 600 }}>(+1 each)</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
          {correctVoters.length === 0 && <div style={{ fontSize: 14, fontStyle: "italic", opacity: 0.6, padding: "4px 12px" }}>Nobody</div>}
          {correctVoters.map(p => row(p, "✓", CHECK_GREEN))}
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Got it wrong</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {wrongVoters.length === 0 && <div style={{ fontSize: 14, fontStyle: "italic", opacity: 0.6, padding: "4px 12px" }}>Nobody</div>}
          {wrongVoters.map(p => row(p, "✗", WRONG_RED))}
        </div>
      </Shell>
    )
  }

  // ── FINISHED ───────────────────────────────────────────────────────────
  if (game.phase === "finished") {
    const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(p => ({ id: p.id, name: p.name, score: p.score ?? 0 }))

    const history = (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 16 }}>Round by Round</div>
        {[...rounds].sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0)).map((r, i) => {
          const votes = r.votes || {}
          const right = players.filter(p => votes[p.id] === r.bluffer_id)
          const wrong = players.filter(p => votes[p.id] && votes[p.id] !== r.bluffer_id)
          return (
            <div key={r.id} style={{ background: WARM_LIGHT, color: INK, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Round {i + 1}
              </div>
              <div style={{ background: BTN, color: "white", padding: "10px 14px", marginBottom: 12, fontSize: 14, fontWeight: 800 }}>
                {superlativeById[r.superlative_id]?.text}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <Nm>{byId[r.bluffer_id]?.name}</Nm> bluffed with <Nm>{byId[r.bluffer_target_id]?.name}</Nm> · fooled {wrong.length}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                <Nm>{byId[r.truthteller_id]?.name}</Nm> truthfully picked <Nm>{byId[r.truthteller_target_id]?.name}</Nm> · believed by {right.length}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>
                Spotted the bluffer: {right.length ? right.map(p => p.name).join(", ") : "nobody"}
              </div>
            </div>
          )
        })}
      </div>
    )

    return (
      <>
        <div style={{ minHeight: "100dvh", background: DARK, color: INK, display: "flex", flexDirection: "column" }}>
          <EndGame
            players={ranked}
            myPlayerId={myPlayerId}
            onPlayAgain={async () => { await supabase.rpc("nom_reset_to_lobby", { p_code: code }); router.push(`/${code}`) }}
            bottomPad={BOTTOM_PAD}
            colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
            scoreTextColor={INK}
            linkBg={BTN}
            linkTextColor="white"
            belowButtons={history}
          />
        </div>
        {menuNode}
      </>
    )
  }

  return null
}
