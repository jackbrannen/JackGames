"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
const BOYS_COLOR = "#359c94"
const GIRLS_COLOR = "#df668e"
const INK = "#1A2418"
// Dark enough on the light green surfaces above to clear 4.5:1 contrast —
// checked against WARM_LIGHT/BG (#cbe08c), the lightest surface they sit on.
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

function ScoreBoxes({ boys, girls }) {
  const boxStyle = (bg) => ({ background: bg, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 8px" })
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={boxStyle(BOYS_COLOR)}>Boys {boys}</span>
      <span style={boxStyle(GIRLS_COLOR)}>Girls {girls}</span>
    </div>
  )
}

function TeamBadge({ team, amount }) {
  const bg = team === "boys" ? BOYS_COLOR : GIRLS_COLOR
  const label = team === "boys" ? "Boys" : "Girls"
  return (
    <span style={{ background: bg, color: "white", fontSize: 13, fontWeight: 900, padding: "4px 10px", flexShrink: 0 }}>
      +{amount} {label}
    </span>
  )
}

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [superlatives, setSuperlatives] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [draft, setDraft] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [voteSelection, setVoteSelection] = useState(null)
  const [blufferRevealed, setBlufferRevealed] = useState(false)
  const [truthtellerSelection, setTruthtellerSelection] = useState(null)
  const isIdle = useIdleGate()
  const loadSeqRef = useRef(0)
  const channelRef = useRef(null)
  const gossipKeyRef = useRef(null)

  useEffect(() => {
    setVoteSelection(null)
    setBlufferRevealed(false)
    setTruthtellerSelection(null)
  }, [game?.round_index])

  // Gossip (see REALTIME.md §4): if this client's own loadState() notices the game
  // row changed since it last checked, re-broadcast a "sync" nudge so any peer whose
  // own postgres_changes subscription silently dropped that update catches up
  // immediately instead of waiting on the next 60s poll. None of these fields fire on
  // every tap — the truth-teller's repeatable target-selection tap is deliberately
  // excluded (see chooseTarget below), same rule as the drag-position exclusion in
  // the FirstToWorst gossip bug.
  function gossipSyncKey(g) {
    return `${g.phase}:${g.round_index}:${g.current_boy_id}:${g.current_girl_id}:${g.bluffer_ready_speech}:${g.truthteller_ready_speech}:${Object.keys(g.votes || {}).length}:${(g.ready_next_round_ids || []).length}`
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
    const [{ data: gameData }, { data: playerData }, { data: superlativeData }] = await Promise.all([
      supabase.from("nom_games").select("*").eq("code", code).single(),
      supabase.from("nom_players").select("id,name,first_name,last_name,team,created_at").eq("game_code", code).order("created_at", { ascending: true }),
      supabase.from("nom_superlatives").select("id,player_id,text").eq("game_code", code),
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
  }

  function applyPlayerRow(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") { setPlayers(prev => prev.filter(r => r.id !== oldRow?.id)); return }
    if (!newRow) return
    setPlayers(prev => { const i = prev.findIndex(r => r.id === newRow.id); return i === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r) })
  }
  function applySuperlativeRow(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") { setSuperlatives(prev => prev.filter(r => r.id !== oldRow?.id)); return }
    if (!newRow) return
    setSuperlatives(prev => { const i = prev.findIndex(r => r.id === newRow.id); return i === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r) })
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
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_players", filter: `game_code=eq.${code}` }, applyPlayerRow)
        .on("postgres_changes", { event: "*", schema: "public", table: "nom_superlatives", filter: `game_code=eq.${code}` }, applySuperlativeRow)
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

  const isBoy = me.id === game.current_boy_id
  const isGirl = me.id === game.current_girl_id
  const isUp = isBoy || isGirl
  const isBluffer = me.id === game.current_bluffer_id
  const isTruthteller = me.id === game.current_truthteller_id
  const boy = byId[game.current_boy_id]
  const girl = byId[game.current_girl_id]
  const bluffer = byId[game.current_bluffer_id]
  const truthteller = byId[game.current_truthteller_id]
  const currentSuperlative = superlativeById[game.current_superlative_id]?.text

  async function rpc(fn, args) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
    await loadState()
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
        playerDetails={players.map(p => ({
          name: p.name, firstName: p.first_name, lastName: p.last_name,
          teamColor: p.team === "boys" ? BOYS_COLOR : p.team === "girls" ? GIRLS_COLOR : undefined,
          teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
          score: p.team === "boys" ? game.boys_score : game.girls_score,
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
        channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      } catch (e) {
        setSubmitError(e?.message || "Something went wrong.")
        throw e
      }
    }

    if (mySuperlative) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label="Nominations" dark={DARK} textColor={INK} />
          <div style={{ padding: "32px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1, marginBottom: 24 }}>Waiting for<br />everyone…</div>
            <WaitingList
              players={players.map(p => ({ name: p.name, done: superlatives.some(s => s.player_id === p.id) }))}
              myName={me.name}
              colors={{ mid: WAIT_BG }}
              doneColor={CHECK_GREEN}
            />
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
        </>
      )
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
        <StatusBar label="Nominations" dark={DARK} textColor={INK} />
        <div style={{ padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1, marginBottom: 10 }}>Write your superlative</div>
          <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.75, marginBottom: 24, lineHeight: 1.4 }}>
            Something like "Most likely to…" or "Best…". <b>Don't pick one with an obvious answer</b> for this group — the fun is in the surprise.
          </p>
          <TextEntry
            value={draft}
            onChange={setDraft}
            multiline={false}
            onSubmit={submit}
            placeholder="Most likely to…"
            maxLength={140}
            bg={WARM_LIGHT}
            fontSize={18}
            style={{ fontWeight: 600, color: INK }}
          />
          {submitError && <p style={{ fontSize: 14, fontWeight: 700, color: "#B03030", marginTop: 12 }}>{submitError}</p>}
        </div>
      </div>
        {menuNode}
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <FooterButton onClick={submit} disabled={!draft.trim()} bg={BTN} textColor="white">Submit</FooterButton>
        </Footer>
      </>
    )
  }

  // ── CHOOSING PHASE ─────────────────────────────────────────────────────
  if (game.phase === "choosing") {
    if (!isUp) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} right={<ScoreBoxes boys={game.boys_score} girls={game.girls_score} />} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.7, marginBottom: 16 }}>Nominators this round</div>
            <div style={{ fontSize: "clamp(30px, 8vw, 46px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 12 }}>{boy?.name} &amp; {girl?.name}</div>
            <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.75 }}>They&apos;re each getting their assignment.</p>
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
        </>
      )
    }

    if (isBluffer) {
      const target = byId[game.bluffer_target_id]
      async function readySpeech() {
        await rpc("nom_ready_speech", { p_code: code, p_player_id: myPlayerId })
        channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
      }

      // Once readied, swap to a separate return (unmounting the FooterButton below)
      // rather than just toggling its disabled/label props on the same instance —
      // FooterButton deliberately never resets its own internal "loading" state on
      // success, relying on the caller to unmount it once the click's effect lands.
      // Leaving it mounted here left the button stuck reading "Loading…" forever
      // instead of ever reaching "Waiting for your partner…".
      if (game.bluffer_ready_speech) {
        return (
          <>
          <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
            <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "clamp(26px, 7vw, 36px)", fontWeight: 900, opacity: 0.75 }}>Waiting for your partner…</div>
            </div>
          </div>
            {menuNode}
            <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
          </>
        )
      }

      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
          <div style={{ padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ background: BTN, color: "white", padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3 }}>{currentSuperlative}</div>
            </div>
            <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
              You&apos;re the bluffer.
            </div>
            <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
              Convince everyone this is true of this person:
            </p>
            {!blufferRevealed ? (
              <button
                onClick={() => setBlufferRevealed(true)}
                style={{ display: "block", width: "100%", background: WARM_LIGHT, color: INK, fontSize: 18, fontWeight: 900, padding: "22px", marginBottom: 20 }}
              >
                Tap to reveal
              </button>
            ) : (
              <div
                style={{
                  textAlign: "center", background: WARM_LIGHT, padding: "22px", marginBottom: 20,
                  animation: "nom-reveal 0.35s ease-out",
                }}
              >
                <span style={{ fontSize: 24, fontWeight: 900, color: INK }}>{target?.name}</span>
              </div>
            )}
            <style>{`@keyframes nom-reveal { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
            <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, opacity: 0.75 }}>
              Make them think you&apos;re NOT the bluffer by making it sound like you picked this person on your own.
            </p>
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
            <FooterButton onClick={readySpeech} disabled={!blufferRevealed} bg={BTN} textColor="white">
              Ready to give my speech
            </FooterButton>
          </Footer>
        </>
      )
    }

    // truth-teller — can pick anyone in the game except themselves or the
    // bluffer's (already-assigned) target, including the bluffer. Excluding the
    // bluffer's target keeps the two speeches from coincidentally pointing at
    // the same person. Selection stays changeable (tap another name) right up
    // until "Ready to give my speech" is pressed.
    const truthtellerChoices = players.filter(p => p.id !== myPlayerId && p.id !== game.bluffer_target_id)
    const selectedTargetId = truthtellerSelection ?? game.truthteller_target_id
    async function chooseTarget(id) {
      setTruthtellerSelection(id)
      await rpc("nom_choose_target", { p_code: code, p_player_id: myPlayerId, p_target_id: id })
    }
    async function readySpeech() {
      await rpc("nom_ready_speech", { p_code: code, p_player_id: myPlayerId })
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }

    if (game.truthteller_ready_speech) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: "clamp(26px, 7vw, 36px)", fontWeight: 900, opacity: 0.75 }}>Waiting for your partner…</div>
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
        </>
      )
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
        <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
        <div style={{ padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ background: BTN, color: "white", padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3 }}>{currentSuperlative}</div>
          </div>
          <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
            You&apos;re the truth teller.
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
            Who does this fit best?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {truthtellerChoices.map(p => (
              <button
                key={p.id}
                onClick={() => chooseTarget(p.id)}
                style={{
                  textAlign: "left", padding: "16px 18px", fontSize: 17, fontWeight: 700,
                  background: selectedTargetId === p.id ? YELLOW : WARM_LIGHT,
                  color: INK,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
        {menuNode}
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          {selectedTargetId ? (
            <FooterButton onClick={readySpeech} bg={BTN} textColor="white">
              Ready to give my speech
            </FooterButton>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>
              Lock in your choice
            </div>
          )}
        </Footer>
      </>
    )
  }

  // ── VOTING_WAIT PHASE (speeches + voting, combined) ────────────────────
  if (game.phase === "voting_wait") {
    if (isUp) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: "clamp(26px, 7vw, 36px)", fontWeight: 900, opacity: 0.75 }}>Giving your speech…</div>
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
        </>
      )
    }

    const eligible = players.filter(p => p.id !== game.current_boy_id && p.id !== game.current_girl_id)
    const myVote = game.votes?.[myPlayerId]
    async function vote(targetId) {
      await rpc("nom_submit_vote", { p_code: code, p_player_id: myPlayerId, p_guessed_bluffer_id: targetId })
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }

    if (myVote) {
      return (
        <>
        <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
          <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
          <div style={{ padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
            <div style={{ fontSize: "clamp(26px, 7vw, 34px)", fontWeight: 900, marginBottom: 20 }}>Vote locked in</div>
            <WaitingList
              players={eligible.map(p => ({ name: p.name, done: !!game.votes?.[p.id] }))}
              myName={me.name}
              colors={{ mid: WAIT_BG }}
              doneColor={CHECK_GREEN}
            />
          </div>
        </div>
          {menuNode}
          <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)} />
        </>
      )
    }

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
        <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} />
        <div style={{ padding: "28px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: "clamp(24px, 7vw, 32px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 20 }}>Listen to the speeches, then pick the bluffer.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[boy, girl].map(p => (
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
        </div>
      </div>
        {menuNode}
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          <FooterButton onClick={() => vote(voteSelection)} disabled={!voteSelection} bg={BTN} textColor="white">
            Lock it in
          </FooterButton>
        </Footer>
      </>
    )
  }

  // ── REVEAL PHASE ───────────────────────────────────────────────────────
  if (game.phase === "reveal") {
    const last = (game.round_history || [])[game.round_history.length - 1]
    const blufferTarget = byId[last?.bluffer_target_id]
    const truthtellerTarget = byId[last?.truthteller_target_id]
    const isLastRound = game.round_index + 1 >= game.total_rounds
    const imReady = (game.ready_next_round_ids || []).includes(myPlayerId)
    async function readyNext() {
      await rpc("nom_ready_next_round", { p_code: code, p_player_id: myPlayerId })
      channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} })
    }

    const correctVoters = players.filter(p => last?.votes?.[p.id] === last?.bluffer_id)
    const wrongVoters = players.filter(p => last?.votes?.[p.id] && last?.votes?.[p.id] !== last?.bluffer_id)
    const boysPoints = correctVoters.filter(p => p.team === "boys").length
    const girlsPoints = correctVoters.filter(p => p.team === "girls").length

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column" }}>
        <StatusBar label={`Round ${game.round_index + 1} of ${game.total_rounds}`} dark={DARK} textColor={INK} right={<ScoreBoxes boys={game.boys_score} girls={game.girls_score} />} />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px", paddingBottom: BOTTOM_PAD }}>
          <div style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
            <Nm>{bluffer?.name}</Nm> was the bluffer
          </div>
          <div style={{ background: BTN, color: "white", padding: 18, marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.3 }}>{currentSuperlative}</div>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 10 }}>
            Got it right:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            {correctVoters.length === 0 && <div style={{ fontSize: 14, fontStyle: "italic", opacity: 0.6, padding: "4px 12px" }}>Nobody</div>}
            {correctVoters.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: WARM_LIGHT }}>
                <span style={{ fontWeight: 700 }}>{p.name}</span>
                <span style={{ fontWeight: 900, color: CHECK_GREEN }}>✓</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 10 }}>
            Got it wrong:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            {wrongVoters.length === 0 && <div style={{ fontSize: 14, fontStyle: "italic", opacity: 0.6, padding: "4px 12px" }}>Nobody</div>}
            {wrongVoters.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: WARM_LIGHT }}>
                <span style={{ fontWeight: 700 }}>{p.name}</span>
                <span style={{ fontWeight: 900, color: WRONG_RED }}>✗</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <TeamBadge team="boys" amount={boysPoints} />
            <TeamBadge team="girls" amount={girlsPoints} />
          </div>
        </div>
      </div>
        {menuNode}
        <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
          {imReady ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", opacity: 0.65 }}>
              {(game.ready_next_round_ids || []).length} / {players.length} ready…
            </div>
          ) : (
            <FooterButton onClick={readyNext} bg={BTN} textColor="white">
              {isLastRound ? "See final score →" : "Next round →"}
            </FooterButton>
          )}
        </Footer>
      </>
    )
  }

  // ── FINISHED ───────────────────────────────────────────────────────────
  if (game.phase === "finished") {
    const boysWin = game.boys_score > game.girls_score
    const girlsWin = game.girls_score > game.boys_score

    const teamAbove = (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 32 }}>
        {[
          { label: "Boys", color: BOYS_COLOR, score: game.boys_score, winner: boysWin },
          { label: "Girls", color: GIRLS_COLOR, score: game.girls_score, winner: girlsWin },
        ].map(team => (
          <div key={team.label} style={{ display: "flex" }}>
            <div style={{ padding: "13px 0", minWidth: 48, flexShrink: 0, background: team.color, fontSize: 18, fontWeight: 900, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {team.score}
            </div>
            <div style={{ padding: "13px 16px", flex: 1, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{team.label}</div>
              {team.winner && <span style={{ fontSize: 11, fontWeight: 800, color: team.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner</span>}
            </div>
          </div>
        ))}
        {!boysWin && !girlsWin && (
          <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, opacity: 0.7, marginTop: 4 }}>It&apos;s a tie</div>
        )}
      </div>
    )

    const history = (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75, marginBottom: 16 }}>Round by Round</div>
        {(game.round_history || []).map((r, i) => {
          const rBluffer = byId[r.bluffer_id]
          const rCorrectVoters = players.filter(p => r.votes?.[p.id] === r.bluffer_id)
          const rWrongVoters = players.filter(p => r.votes?.[p.id] && r.votes?.[p.id] !== r.bluffer_id)
          const rBoysPoints = r.boys_points ?? rCorrectVoters.filter(p => p.team === "boys").length
          const rGirlsPoints = r.girls_points ?? rCorrectVoters.filter(p => p.team === "girls").length
          return (
            <div key={i} style={{ background: WARM_LIGHT, color: INK, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Round {i + 1}
              </div>
              <div style={{ background: BTN, color: "white", padding: "10px 14px", marginBottom: 12, fontSize: 14, fontWeight: 800 }}>
                {superlativeById[r.superlative_id]?.text}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginBottom: 12 }}>
                <Nm>{rBluffer?.name}</Nm> was the bluffer
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Got it right</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                {rCorrectVoters.length ? rCorrectVoters.map(p => p.name).join(", ") : <span style={{ fontStyle: "italic", opacity: 0.6, fontWeight: 600 }}>Nobody</span>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Got it wrong</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                {rWrongVoters.length ? rWrongVoters.map(p => p.name).join(", ") : <span style={{ fontStyle: "italic", opacity: 0.6, fontWeight: 600 }}>Nobody</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <TeamBadge team="boys" amount={rBoysPoints} />
                <TeamBadge team="girls" amount={rGirlsPoints} />
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
          players={[]}
          onPlayAgain={async () => { await supabase.rpc("nom_reset_to_lobby", { p_code: code }); router.push(`/${code}`) }}
          bottomPad={BOTTOM_PAD}
          colors={{ yellow: YELLOW, wl: WARM_LIGHT }}
          scoreTextColor={INK}
          linkBg={BTN}
          linkTextColor="white"
          aboveScores={teamAbove}
          belowButtons={history}
        />
      </div>
        {menuNode}
      </>
    )
  }

  return null
}
