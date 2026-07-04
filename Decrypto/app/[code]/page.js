"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG = "#B7DAEE"
const INK = "#15314A"
const WL = "#6FA8CE"
const ACCENT = "#FFC857"
const BOYS = "#2F6DB4"
const GIRLS = "#CC5B86"
const BOYS_BG = "rgba(47,109,180,0.16)"
const GIRLS_BG = "rgba(204,91,134,0.16)"

const POKE_COLORS = { dark: INK, mid: "#2C5172", wl: WL, yellow: ACCENT, notifBg: INK }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const INSTRUCTIONS = `Two teams, each with four secret keywords numbered 1-4 that only your team can see.

Each round, one teammate is the Encryptor. They get a secret 3-digit code (three different digits from 1-4) and give one clue for each digit, hinting at the keyword in that position.

Both teams then guess the code. Your team has to decode it correctly - guess wrong and you take a Miscommunication. The other team tries to intercept it using every clue you've given so far - if they crack it, they take an Interception.

(Round 1 can't be intercepted as there's no clue history yet.)

Win by landing 2 Interceptions. Lose if you rack up 2 Miscommunications. If no one's decided after 8 rounds, the most Interceptions wins.`

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
  background: "rgba(255,255,255,0.55)", color: INK, fontSize: 20,
  padding: "16px 18px", width: "100%", display: "block", border: "none", outline: "none", boxSizing: "border-box",
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [isDummy, setIsDummy] = useState(false)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [starting, setStarting] = useState(false)
  const hasAutoJoinedRef = useRef(false)
  const hasReplayJoinedRef = useRef(false)
  const [replayOf, setReplayOf] = useState(null)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const boysTeam = players.filter(p => p.team === "boys")
  const girlsTeam = players.filter(p => p.team === "girls")
  const canStart = gameExists === true && boysTeam.length >= 2 && girlsTeam.length >= 2

  async function refreshPlayers() {
    const { data } = await supabase.from("dc_players")
      .select("id,name,team,is_bot,created_at").eq("game_code", code).order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }
  async function loadGame() {
    const { data, error } = await supabase.from("dc_games").select("code,phase,is_dummy,replay_of").eq("code", code).single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase || "lobby")
    setIsDummy(!!data.is_dummy)
    setReplayOf(data.replay_of ?? null)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`decrypto:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadGame().then(refreshPlayers)
  }, [code])

  // Auto-join from saved profile, balancing teams — dummy games only.
  // Real games require players to pick a team explicitly.
  useEffect(() => {
    if (!isDummy || gameExists !== true || gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("dc_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }
      const team = girlsTeam.length < boysTeam.length ? "girls" : "boys"
      const { data, error } = await supabase.from("dc_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`decrypto:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [isDummy, gameExists, gamePhase, myPlayerId, players.length, code])

  // Auto-join returning players from a "Play Again" replay — only for browsers
  // that held a playerId in the parent game, so this can't be used to skip
  // the join form on an arbitrary shared link.
  useEffect(() => {
    if (!replayOf || gameExists !== true || gamePhase !== "lobby" || myPlayerId || hasReplayJoinedRef.current) return
    const wasInParent = localStorage.getItem(`decrypto:${replayOf}:playerId`)
    if (!wasInParent) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasReplayJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("dc_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) {
        localStorage.setItem(`decrypto:${code}:playerId`, taken[0].id)
        setMyPlayerId(taken[0].id)
        return
      }
      const team = girlsTeam.length < boysTeam.length ? "girls" : "boys"
      const { data, error } = await supabase.from("dc_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team })
        .select("id").single()
      if (error || !data) { hasReplayJoinedRef.current = false; return }
      localStorage.setItem(`decrypto:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      refreshPlayers()
    })()
  }, [replayOf, gameExists, gamePhase, myPlayerId, code])

  useEffect(() => {
    function loadState() { loadGame(); refreshPlayers() }
    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`decrypto-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "dc_games", filter: `code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (gamePhase !== "lobby" && gamePhase) router.replace(`/${code}/play`)
  }, [gamePhase])

  async function join(team) {
    const trimmed = name.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmed || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true); setJoinError("")
    const { data: existing } = await supabase.from("dc_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Please choose another."); setJoining(false); return }
    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile); setSavedProfile(newProfile)
    const { data, error } = await supabase.from("dc_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }
    localStorage.setItem(`decrypto:${code}:playerId`, data.id)
    setMyPlayerId(data.id); setJoining(false); refreshPlayers()
  }

  async function switchTeam() {
    if (!me) return
    await supabase.from("dc_players").update({ team: me.team === "boys" ? "girls" : "boys" }).eq("id", me.id)
    refreshPlayers()
  }

  async function startGame() {
    if (starting) return
    if (!window.confirm("Start the game for everyone?")) return
    setStarting(true)
    const { error } = await supabase.rpc("dc_start_game", { p_code: code })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
    router.push(`/${code}/play`)
  }

  if (gameExists === null) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(21,49,74,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p></div>
  }
  if (!gameExists) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}><p style={{ color: INK, fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p></div>
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: INK, paddingBottom: BOTTOM_PAD }}>
      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: "rgba(255,255,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>Decrypto</div>
          <div style={{ fontSize: "clamp(20px, 7vw, 40px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>{code}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <button onClick={async () => { const url = window.location.href; if (navigator.share) await navigator.share({ title: `Join Decrypto — ${code}`, url }); else { await navigator.clipboard.writeText(url); alert("Link copied!") } }}
            style={{ background: "rgba(255,255,255,0.45)", color: INK, fontSize: 13, fontWeight: 800, padding: "10px 16px" }}>Invite</button>
          <button onClick={() => setShowInstructions(true)} style={{ background: "rgba(255,255,255,0.45)", color: INK, fontSize: 13, fontWeight: 800, padding: "10px 14px" }}>How to Play</button>
        </div>
      </div>

      {/* Teams */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { team: "boys", color: BOYS, bg: BOYS_BG, label: "Boys", teamPlayers: boysTeam },
            { team: "girls", color: GIRLS, bg: GIRLS_BG, label: "Girls", teamPlayers: girlsTeam },
          ].map(({ team, color, bg, label, teamPlayers }) => (
            <div key={team} style={{ background: bg, overflow: "hidden" }}>
              <div style={{ background: color, color: "white", fontSize: 13, fontWeight: 900, padding: "8px 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ padding: "8px 12px 12px" }}>
                {teamPlayers.length === 0 && <div style={{ fontSize: 13, opacity: 0.35, fontStyle: "italic", padding: "4px 0" }}>No players</div>}
                {teamPlayers.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 0", borderBottom: "1px solid rgba(21,49,74,0.1)" }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>
                      {p.name}{p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                    </span>
                    {p.id !== myPlayerId && (
                      <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("dc_players").delete().eq("id", p.id); refreshPlayers() } }}
                        aria-label={`Remove ${p.name}`}
                        style={{ background: "transparent", border: "none", color: "rgba(21,49,74,0.45)", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!canStart && (
          <p style={{ fontSize: 13, opacity: 0.6, fontWeight: 600, marginTop: 12 }}>Each team needs 2+ players to start.</p>
        )}
      </div>

      {/* Join / You */}
      <div style={{ padding: "28px 24px 0" }}>
        {!me ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.4, marginBottom: 14 }}>Join Game</div>
            {!savedProfile && (
              <>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              </>
            )}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Display Name" maxLength={45} style={inputStyle} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => join("boys")} disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                style={{ background: BOYS, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1 }}>{joining ? "…" : "Join Boys"}</button>
              <button onClick={() => join("girls")} disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                style={{ background: GIRLS, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1 }}>{joining ? "…" : "Join Girls"}</button>
            </div>
            {joinError && <div style={{ fontSize: 14, fontWeight: 700, color: "#C0392B", marginTop: 10 }}>{joinError}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.4, marginBottom: 14 }}>You</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>{me.name} <span style={{ fontSize: 14, opacity: 0.6 }}>· {me.team === "boys" ? "Boys" : "Girls"}</span></div>
            <button onClick={switchTeam} style={{ background: "rgba(255,255,255,0.45)", color: INK, fontSize: 14, fontWeight: 800, padding: "12px 18px" }}>Switch Genders</button>
          </>
        )}
      </div>

      {showInstructions && (
        <div onClick={() => setShowInstructions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: INK }}>How to Play</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "rgba(21,49,74,0.12)", color: INK, fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <div style={{ fontSize: 15, color: "rgba(21,49,74,0.85)", lineHeight: 1.7, fontWeight: 400, whiteSpace: "pre-wrap" }}>{INSTRUCTIONS}</div>
          </div>
        </div>
      )}
    </div>

    {canStart && (
      <Footer colors={POKE_COLORS}>
        <FooterButton onClick={startGame} disabled={starting} bg={ACCENT} textColor="#000">
          {starting ? "Starting…" : "Start Game"}
        </FooterButton>
      </Footer>
    )}
    </>
  )
}
