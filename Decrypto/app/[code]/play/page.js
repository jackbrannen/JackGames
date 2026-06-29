"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import FooterButton from "../../../components/FooterButton"
import Notifications from "../../../components/Notifications"

const BG = "#B7DAEE"
const INK = "#15314A"
const WL = "#6FA8CE"
const ACCENT = "#FFC857"
const BOYS = "#2F6DB4"
const GIRLS = "#CC5B86"
const PANEL = "rgba(255,255,255,0.55)"
const POKE_COLORS = { dark: INK, mid: "#2C5172", wl: WL, yellow: ACCENT, notifBg: INK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const teamColor = t => (t === "boys" ? BOYS : GIRLS)
const teamLabel = t => (t === "boys" ? "Boys" : "Girls")
const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

export default function PlayPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [guesses, setGuesses] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [pokes, setPokes] = useState([])
  const [loading, setLoading] = useState(true)

  const [clueDraft, setClueDraft] = useState(["", "", ""])
  const [slots, setSlots] = useState([null, null, null])
  const [submitting, setSubmitting] = useState(false)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)

  async function loadState() {
    const [{ data: g }, { data: ps }, { data: rs }, { data: gs }] = await Promise.all([
      supabase.from("dc_games").select("*").eq("code", code).single(),
      supabase.from("dc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("dc_rounds").select("*").eq("game_code", code).order("turn_number"),
      supabase.from("dc_guesses").select("*").eq("game_code", code),
    ])
    if (!g) { router.replace(`/${code}`); return }
    if (g.phase === "lobby") { router.replace(`/${code}`); return }
    setGame(g); setPlayers(ps ?? []); setRounds(rs ?? []); setGuesses(gs ?? []); setLoading(false)
  }
  async function loadPokes() {
    const { data } = await supabase.from("pokes").select("*").eq("room_code", code).order("created_at", { ascending: false }).limit(10)
    if (data) setPokes(data)
  }
  function nudge() { channelRef.current?.send({ type: "broadcast", event: "sync" }) }

  useEffect(() => {
    const stored = localStorage.getItem(`decrypto:${code}:playerId`)
    if (stored) setMyPlayerId(stored); else router.replace(`/${code}`)
  }, [code, router])

  useEffect(() => {
    loadState(); loadPokes()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const ch = supabase.channel(`decrypto-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_rounds", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_guesses", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "pokes", filter: `room_code=eq.${code}` }, loadPokes)
      .on("broadcast", { event: "sync" }, () => loadState())
      .subscribe()
    channelRef.current = ch
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(ch) }
  }, [code])

  useEffect(() => {
    if (game?.phase === "lobby") router.replace(`/${code}`)
  }, [game?.phase, code, router])

  useEffect(() => {
    setClueDraft(["", "", ""]); setSlots([null, null, null]); setSubmitting(false)
  }, [game?.turn_number, game?.round_phase])

  const myTeam = me?.team
  const pendingFromDb = game ? (myTeam === "boys" ? game.boys_pending_guess : game.girls_pending_guess) : null
  useEffect(() => {
    if (game?.round_phase !== "guess") return
    if (Array.isArray(pendingFromDb)) {
      const next = [0, 1, 2].map(i => pendingFromDb[i] ?? null)
      setSlots(prev => (arrEq(prev, next) ? prev : next))
    }
  }, [JSON.stringify(pendingFromDb), game?.round_phase])

  if (loading || !game) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(21,49,74,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!me) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ color: INK, fontSize: 18, fontWeight: 700 }}>You haven&apos;t joined this game.<br /><a href={`/${code}`} style={{ color: BOYS }}>Back to lobby</a></div>
    </div>
  }

  const g = game
  const activeTeam = g.active_team
  const activeIds = activeTeam === "boys" ? g.boys_ids : g.girls_ids
  const activeIdx = activeTeam === "boys" ? g.boys_encryptor_idx : g.girls_encryptor_idx
  const encryptorId = activeIds?.[(activeIdx ?? 0) % (activeIds?.length || 1)]
  const amEncryptor = encryptorId === myPlayerId
  const encryptor = players.find(p => p.id === encryptorId)
  const myKeywords = (myTeam === "boys" ? g.boys_keywords : g.girls_keywords) || []
  const myTeamActive = myTeam === activeTeam
  const interceptAllowed = g.turn_number >= 3
  const myTeamGuesses = myTeamActive || interceptAllowed
  const isIntercept = !myTeamActive
  const round = ((g.turn_number - 1) >> 1) + 1
  const currentRound = rounds.find(r => r.turn_number === g.turn_number)
  const myGuessRow = guesses.find(gg => gg.turn_number === g.turn_number && gg.team === myTeam)
  const tokens = { boys: { i: g.boys_intercepts, m: g.boys_miscomms }, girls: { i: g.girls_intercepts, m: g.girls_miscomms } }

  function header() {
    return (
      <div style={{ background: INK, color: "white", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.85 }}>
          {g.phase === "finished" ? "Final" : `Round ${round} · ${teamLabel(activeTeam)} clueing`}
        </div>
        <button onClick={() => { if (window.confirm("Reset to lobby for everyone?")) supabase.rpc("dc_reset_to_lobby", { p_code: code }).then(nudge) }}
          style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>Reset</button>
      </div>
    )
  }

  function tokenBar() {
    return (
      <div style={{ display: "flex", gap: 8, padding: "10px 16px" }}>
        {["boys", "girls"].map(t => (
          <div key={t} style={{ flex: 1, background: PANEL, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: teamColor(t) }}>{teamLabel(t)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, opacity: 0.8 }}>Intercepts {tokens[t].i} · Miss {tokens[t].m}</div>
          </div>
        ))}
      </div>
    )
  }

  function keywordPanel() {
    if (!myTeam) return null
    return (
      <div style={{ margin: "0 16px 12px", background: PANEL, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: teamColor(myTeam), marginBottom: 8 }}>Your keywords</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {myKeywords.map((w, i) => {
            const inCode = amEncryptor && Array.isArray(g.current_code) && g.current_code.includes(i + 1)
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: inCode ? ACCENT : "rgba(255,255,255,0.5)" }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: INK, opacity: 0.55, width: 14 }}>{i + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{w}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function clueBoard() {
    const revealed = rounds.filter(r => r.revealed)
    return (
      <div style={{ margin: "0 16px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: INK, opacity: 0.5, marginBottom: 8 }}>Clue history</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {["boys", "girls"].map(t => (
            <div key={t} style={{ background: PANEL, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: teamColor(t), marginBottom: 6 }}>{teamLabel(t)}</div>
              {revealed.filter(r => r.clue_team === t).length === 0 && <div style={{ fontSize: 12, opacity: 0.35, fontStyle: "italic" }}>—</div>}
              {revealed.filter(r => r.clue_team === t).map(r => (
                <div key={r.id} style={{ marginBottom: 6, fontSize: 13, color: INK }}>
                  {(r.clues || []).map((c, i) => (
                    <span key={i} style={{ fontWeight: 700 }}>
                      {c}<span style={{ opacity: 0.5, fontWeight: 900 }}>·{(r.code || [])[i]}</span>{i < 2 ? "  " : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function writePending(next) {
    setSlots(next)
    supabase.rpc("dc_set_pending_guess", { p_code: code, p_team: myTeam, p_guess: next.map(x => x ?? 0) }).then(nudge)
  }
  function tapDigit(d) {
    if (slots.includes(d)) { writePending(slots.map(x => (x === d ? null : x))); return }
    const idx = slots.findIndex(x => x == null)
    if (idx === -1) return
    const next = [...slots]; next[idx] = d; writePending(next)
  }
  function guessEditor() {
    return (
      <div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
          {slots.map((s, i) => (
            <div key={i} style={{ width: 64, height: 72, display: "flex", alignItems: "center", justifyContent: "center",
              background: s == null ? "transparent" : "rgba(255,255,255,0.7)",
              border: s == null ? "2px dashed rgba(21,49,74,0.4)" : `3px dashed ${teamColor(myTeam)}`,
              fontSize: 34, fontWeight: 900, color: INK }}>{s ?? ""}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
          {[1, 2, 3, 4].map(d => (
            <button key={d} onClick={() => tapDigit(d)} disabled={!!myGuessRow}
              style={{ width: 56, height: 56, fontSize: 22, fontWeight: 900, border: "none",
                background: slots.includes(d) ? teamColor(myTeam) : "rgba(255,255,255,0.6)",
                color: slots.includes(d) ? "white" : INK, cursor: "pointer", opacity: myGuessRow ? 0.5 : 1 }}>{d}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center", color: INK }}>Tap to set your guess — your team sees it live.</div>
      </div>
    )
  }

  async function submitClues() {
    if (submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("dc_submit_clues", { p_code: code, p_player_id: myPlayerId, p_clues: clueDraft.map(c => c.trim()) })
    if (error) { alert(error.message); setSubmitting(false); return }
    nudge()
  }
  async function submitGuess() {
    if (submitting) return
    setSubmitting(true)
    const { error } = await supabase.rpc("dc_submit_guess", { p_code: code, p_player_id: myPlayerId, p_guess: slots, p_is_intercept: isIntercept })
    if (error) { alert(error.message); setSubmitting(false); return }
    nudge()
  }

  if (g.phase === "finished") {
    const winner = g.winner_team
    const reasonText = g.win_reason === "intercepts" ? "2 interceptions — code cracked."
      : g.win_reason === "miscomms" ? "2 miscommunications — they fell apart."
      : "Most interceptions after 8 rounds."
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.5, marginBottom: 12 }}>Game over</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: winner === "tie" ? INK : teamColor(winner), marginBottom: 8 }}>
          {winner === "tie" ? "It's a tie!" : `${teamLabel(winner)} win!`}
        </div>
        <div style={{ fontSize: 16, opacity: 0.7, fontWeight: 600, marginBottom: 28 }}>{winner === "tie" ? "" : reasonText}</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          {["boys", "girls"].map(t => (
            <div key={t} style={{ background: PANEL, padding: "12px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", color: teamColor(t) }}>{teamLabel(t)}</div>
              <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.8 }}>{tokens[t].i} intercepts · {tokens[t].m} miss</div>
            </div>
          ))}
        </div>
        <button onClick={() => supabase.rpc("dc_reset_to_lobby", { p_code: code }).then(nudge)} style={{ background: ACCENT, color: "#000", fontSize: 16, fontWeight: 900, padding: "16px 32px", border: "none", cursor: "pointer", marginBottom: 12 }}>Play Again</button>
        <a href="https://games.jackbrannen.com" style={{ display: "block", background: "rgba(255,255,255,0.4)", color: INK, fontSize: 16, fontWeight: 700, padding: "14px 24px", textDecoration: "none", maxWidth: 320, width: "100%", textAlign: "center" }}>Play Another Game</a>
      </div>
    )
  }

  return (
    <>
      <Notifications supabase={supabase} pokes={pokes} roomCode={code} currentPlayer={me.name} colors={POKE_COLORS} />
      <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
        {header()}
        {tokenBar()}
        {keywordPanel()}

        {g.round_phase === "clue" && amEncryptor && (
          <div style={{ background: ACCENT, color: "#000", textAlign: "center", padding: "12px", fontSize: 16, fontWeight: 800 }}>You&apos;re the Encryptor</div>
        )}
        {g.round_phase === "guess" && myTeamGuesses && (
          <div style={{ background: ACCENT, color: "#000", textAlign: "center", padding: "12px", fontSize: 16, fontWeight: 800 }}>{isIntercept ? "Intercept their code" : "Decode your team's code"}</div>
        )}

        <div style={{ padding: "16px" }}>
          {g.round_phase === "clue" && amEncryptor && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, marginBottom: 8 }}>Your code</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
                {(g.current_code || []).map((d, i) => (
                  <div key={i} style={{ width: 56, height: 56, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: INK }}>{d}</div>
                ))}
              </div>
              {[0, 1, 2].map(i => (
                <input key={i} value={clueDraft[i]} onChange={e => setClueDraft(d => d.map((c, j) => (j === i ? e.target.value : c)))}
                  placeholder={`Clue for ${(g.current_code || [])[i]}`} maxLength={40}
                  style={{ background: "rgba(255,255,255,0.65)", color: INK, fontSize: 18, fontWeight: 700, padding: "14px 16px", width: "100%", border: "none", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
              ))}
            </div>
          )}
          {g.round_phase === "clue" && !amEncryptor && (
            <div style={{ textAlign: "center", padding: "30px 0", fontSize: 16, fontWeight: 700, opacity: 0.7 }}>{encryptor?.name || "The Encryptor"} is writing clues…</div>
          )}

          {g.round_phase === "guess" && (
            <div>
              {currentRound && (
                <div style={{ background: PANEL, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", opacity: 0.5, marginBottom: 6, color: teamColor(activeTeam) }}>{teamLabel(activeTeam)}&apos;s clues</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{(currentRound.clues || []).join("   ·   ")}</div>
                </div>
              )}
              {!myTeamGuesses && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 15, fontWeight: 700, opacity: 0.7 }}>No intercepting in round 1 — just listen.</div>}
              {myTeamGuesses && (myGuessRow
                ? <div style={{ textAlign: "center", padding: "20px 0", fontSize: 16, fontWeight: 700, opacity: 0.7 }}>Locked in. Waiting for the other team…</div>
                : guessEditor())}
            </div>
          )}

          {g.round_phase === "reveal" && (() => {
            const decode = guesses.find(gg => gg.turn_number === g.turn_number && gg.team === activeTeam)
            const inter = guesses.find(gg => gg.turn_number === g.turn_number && gg.team !== activeTeam)
            const codeArr = g.current_code || []
            const decodedRight = decode && arrEq(decode.guess, codeArr)
            const interceptedRight = interceptAllowed && inter && arrEq(inter.guess, codeArr)
            const other = activeTeam === "boys" ? "girls" : "boys"
            return (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>The code was</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
                  {codeArr.map((d, i) => <div key={i} style={{ width: 56, height: 56, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: INK }}>{d}</div>)}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: decodedRight ? "#1F8A4C" : "#C0392B" }}>
                  {decodedRight ? `${teamLabel(activeTeam)} decoded it.` : `${teamLabel(activeTeam)} miscommunicated. +1 Miscommunication`}
                </div>
                {interceptAllowed && (
                  <div style={{ fontSize: 16, fontWeight: 800, color: interceptedRight ? teamColor(other) : INK, opacity: interceptedRight ? 1 : 0.65 }}>
                    {interceptedRight ? `${teamLabel(other)} intercepted! +1 Interception` : `${teamLabel(other)} didn't crack it.`}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {clueBoard()}
      </div>

      <Footer colors={POKE_COLORS}>
        {g.round_phase === "clue" && amEncryptor && (
          <FooterButton onClick={submitClues} disabled={clueDraft.some(c => !c.trim()) || submitting} bg={ACCENT} textColor="#000">
            {clueDraft.some(c => !c.trim()) ? "Write all 3 clues" : "Submit clues"}
          </FooterButton>
        )}
        {g.round_phase === "guess" && myTeamGuesses && !myGuessRow && (
          <FooterButton onClick={submitGuess} disabled={slots.filter(x => x != null).length < 3 || submitting} bg={ACCENT} textColor="#000">
            {slots.filter(x => x != null).length < 3 ? "Pick all 3 digits" : (isIntercept ? "Lock in intercept" : "Lock in decode")}
          </FooterButton>
        )}
        {g.round_phase === "reveal" && (
          <FooterButton onClick={() => supabase.rpc("dc_next_round", { p_code: code }).then(nudge)} bg={ACCENT} textColor="#000">
            Next round →
          </FooterButton>
        )}
      </Footer>
    </>
  )
}
