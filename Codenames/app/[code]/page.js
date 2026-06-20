"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { pick25Words } from "../../lib/words"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"

const BG = "#C0B298"
const TAN = "#C4924A"

const WORDS_A_CN = [
  "AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER",
  "KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ",
  "UMBRA","VORTEX","WALNUT","XENON","ZEPHYR",
]

function splitCodeCN(code) {
  for (const w of WORDS_A_CN) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
}
const RED_COLOR = "#CC2222"
const BLUE_COLOR = "#1E50B5"
const RED_BG = "rgba(204,34,34,0.18)"
const BLUE_BG = "rgba(30,80,181,0.18)"
const YELLOW = "#FBDF54"


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

const TEXT = "#1A1008"

const POKE_COLORS = { dark: "#8A6C4E", mid: "#A0825F", wl: "rgba(0,0,0,0.15)", yellow: YELLOW, notifBg: "#6B4E32" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const inputStyle = {
  background: "rgba(0,0,0,0.1)",
  color: TEXT,
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
  border: "none",
  outline: "none",
  boxSizing: "border-box",
}

const selectStyle = {
  background: "rgba(0,0,0,0.12)",
  color: TEXT,
  fontSize: 16,
  padding: "8px 12px",
  border: "1px solid rgba(0,0,0,0.2)",
}

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [firstTurnTeam, setFirstTurnTeam] = useState("red")
  const [lastUsedWords, setLastUsedWords] = useState([])
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joining, setJoining] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [starting, setStarting] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [draftFirstTurn, setDraftFirstTurn] = useState("red")
  const hasAutoJoinedRef = useRef(false)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("codenames_players")
      .select("id,name,team,is_cluegiver,ready,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("codenames_games")
      .select("code,phase,first_turn_team,last_used_words")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase || "lobby")
    setFirstTurnTeam(data.first_turn_team || "red")
    setLastUsedWords(data.last_used_words || [])
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setName(saved.username || "")
    }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`codenames:${code}:playerId`)
    if (existing) setMyPlayerId(existing)

    supabase.from("game_instructions").select("body").eq("game_key", "codenames").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadGame().then(() => refreshPlayers())
  }, [code])

  useEffect(() => {
    if (gameExists !== true || gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("codenames_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const reds = players.filter(p => p.team === "red").length
      const blues = players.filter(p => p.team === "blue").length
      const team = blues <= reds ? "blue" : "red"
      const { data, error } = await supabase.from("codenames_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`codenames:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      await refreshPlayers()
    })()
  }, [gameExists, gamePhase, myPlayerId, players.length, code])

  useEffect(() => {
    async function loadState() {
      await refreshPlayers()
      const { data } = await supabase
        .from("codenames_games")
        .select("phase,first_turn_team,last_used_words")
        .eq("code", code)
        .single()
      if (data) {
        setGamePhase(data.phase || "lobby")
        setFirstTurnTeam(data.first_turn_team || "red")
        setLastUsedWords(data.last_used_words || [])
      }
    }

    loadState()
    const poll = setInterval(loadState, 30000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`codenames-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "codenames_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "codenames_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()

    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (gamePhase === "play") router.replace(`/${code}/play`)
  }, [gamePhase])

  async function join(team) {
    const trimmed = name.trim()
    if (!trimmed || joining || !team) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("codenames_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmed)
      .limit(1)
    if (existing?.length > 0) {
      setJoinError("That name is already taken. Please choose another.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("codenames_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id")
      .single()

    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`codenames:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setJoining(false)
    await refreshPlayers()
  }

  async function switchTeams() {
    if (!me) return
    const newTeam = me.team === "red" ? "blue" : me.team === "blue" ? "red" : "red"
    await supabase
      .from("codenames_players")
      .update({ team: newTeam, is_cluegiver: false, ready: false })
      .eq("id", me.id)
    await refreshPlayers()
  }

  async function joinTeam(team) {
    if (!me || me.team) return
    await supabase
      .from("codenames_players")
      .update({ team, ready: false })
      .eq("id", me.id)
    await refreshPlayers()
  }

  async function toggleCluegiver(playerId) {
    const target = players.find(p => p.id === playerId)
    if (!target || !me || target.team !== me.team) return
    await supabase.rpc("set_codenames_cluegiver", {
      p_code: code,
      p_player_id: playerId,
      p_is_cluegiver: !target.is_cluegiver,
    })
    await refreshPlayers()
  }

  async function toggleReady() {
    if (!me) return
    const { error } = await supabase
      .from("codenames_players")
      .update({ ready: !me.ready })
      .eq("id", me.id)
    if (error) { alert("Error: " + error.message); return }
    await refreshPlayers()
  }

  async function saveSettings() {
    await supabase
      .from("codenames_games")
      .update({ first_turn_team: draftFirstTurn })
      .eq("code", code)
    setFirstTurnTeam(draftFirstTurn)
    setShowSettings(false)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const words = pick25Words(lastUsedWords)
    const { error } = await supabase.rpc("start_codenames_game", { p_code: code, p_words: words })
    if (error) { alert("Start failed: " + error.message); setStarting(false); return }
    router.push(`/${code}/play`)
  }

  const me = players.find(p => p.id === myPlayerId)
  const redTeam = players.filter(p => p.team === "red")
  const blueTeam = players.filter(p => p.team === "blue")
  const redCluegiver = redTeam.find(p => p.is_cluegiver)
  const blueCluegiver = blueTeam.find(p => p.is_cluegiver)
  const everyoneReady = players.filter(p => p.team).length > 0 &&
    players.filter(p => p.team).every(p => p.ready)
  const canStart = gameExists === true &&
    redTeam.length >= 2 && blueTeam.length >= 2 &&
    !!redCluegiver && !!blueCluegiver && everyoneReady

  const myTeamCluegiver = me?.team === "red" ? redCluegiver : me?.team === "blue" ? blueCluegiver : null
  const myTeamSize = me?.team === "red" ? redTeam.length : me?.team === "blue" ? blueTeam.length : 0
  const otherTeamSize = me?.team === "red" ? blueTeam.length : me?.team === "blue" ? redTeam.length : 0
  const canReady = !!me?.team && !!myTeamCluegiver && myTeamSize >= 2 && otherTeamSize >= 2

  if (gameExists === null) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(0,0,0,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  if (!gameExists) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: TEXT, fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p>
      </div>
    )
  }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: TEXT, paddingBottom: BOTTOM_PAD }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: "rgba(0,0,0,0.3)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
            Codenames
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {(() => { const [w1, w2] = splitCodeCN(code); return <><span style={{ color: TEXT }}>{w1}</span><span style={{ color: TAN }}>{w2}</span></> })()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {!!me && (
              <button
                onClick={() => { setDraftFirstTurn(firstTurnTeam); setShowSettings(s => !s) }}
                style={{ background: "rgba(0,0,0,0.1)", color: TEXT, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <CogIcon />
              </button>
            )}
            <button
              onClick={async () => {
                const url = window.location.href
                if (navigator.share) await navigator.share({ title: `Join Codenames — ${code}`, url })
                else { await navigator.clipboard.writeText(url); alert("Link copied!") }
              }}
              style={{ background: "rgba(0,0,0,0.1)", color: TEXT, fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
            >
              Invite
            </button>
          </div>
          <button
            onClick={() => setShowInstructions(true)}
            style={{ background: "rgba(0,0,0,0.1)", color: TEXT, fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
          >
            How to Play
          </button>
        </div>
      </div>

      {/* Team strip */}
      {me?.team && (
        <div style={{
          background: me.team === "red" ? RED_COLOR : BLUE_COLOR,
          color: "white", fontSize: 12, fontWeight: 900,
          textTransform: "uppercase", letterSpacing: "0.12em",
          textAlign: "center", padding: "7px 0",
        }}>
          {me.team === "red" ? "Red Team" : "Blue Team"}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ padding: "20px 24px", background: "rgba(0,0,0,0.35)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Settings</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(0,0,0,0.75)" }}>First Turn</span>
            <select
              value={draftFirstTurn}
              onChange={e => setDraftFirstTurn(e.target.value)}
              style={selectStyle}
            >
              <option value="red">Red</option>
              <option value="blue">Blue</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={saveSettings}
              style={{ background: TAN, color: "#000", fontSize: 16, fontWeight: 900, padding: "12px 20px", flex: 1 }}
            >
              Save
            </button>
            <button
              onClick={() => setShowSettings(false)}
              style={{ background: "rgba(0,0,0,0.1)", color: TEXT, fontSize: 16, fontWeight: 800, padding: "12px 20px" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Teams */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { team: "red",  color: RED_COLOR,  bg: RED_BG,  label: "Red",  players: redTeam  },
            { team: "blue", color: BLUE_COLOR, bg: BLUE_BG, label: "Blue", players: blueTeam },
          ].map(({ team, color, bg, label, players: teamPlayers }) => (
            <div key={team} style={{ background: bg, overflow: "hidden" }}>
              <div style={{ background: color, color: "white", fontSize: 13, fontWeight: 900, padding: "8px 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label} Team
              </div>
              <div style={{ padding: "8px 12px 12px" }}>
                {teamPlayers.length === 0 && (
                  <div style={{ fontSize: 13, opacity: 0.35, fontStyle: "italic", padding: "4px 0" }}>No players</div>
                )}
                {teamPlayers.map(p => (
                  <div
                    key={p.id}
                    onClick={() => me?.team === team && toggleCluegiver(p.id)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 0",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      cursor: me?.team === team ? "pointer" : "default",
                    }}
                  >
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: p.ready ? "#12BAAA" : "rgba(0,0,0,0.25)", flexShrink: 0, marginTop: 4, border: p.ready ? "2px solid #0A8A7D" : "2px solid rgba(0,0,0,0.15)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
                        {p.name}
                      </div>
                      {p.is_cluegiver && (
                        <div style={{ background: color, color: "white", fontSize: 9, fontWeight: 900, padding: "2px 6px", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase", display: "inline-block" }}>
                          Cluegiver
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Join / My Info */}
      <div style={{ padding: "28px 24px 0" }}>
        {!me ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(0,0,0,0.4)", marginBottom: 14 }}>
              Join Game
            </div>
            {!savedProfile && (
              <>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  maxLength={40}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  maxLength={40}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
              </>
            )}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && join()}
              placeholder="Display Name"
              maxLength={45}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => join("red")}
                disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                style={{ background: RED_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}
              >
                {joining ? "…" : "Join Red"}
              </button>
              <button
                onClick={() => join("blue")}
                disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                style={{ background: BLUE_COLOR, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1, display: "block" }}
              >
                {joining ? "…" : "Join Blue"}
              </button>
            </div>
            {joinError && (
              <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>
                {joinError}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(0,0,0,0.4)", marginBottom: 14 }}>
              You
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>
              {me.name}
            </div>

            {!me.team && (
              <p style={{ fontSize: 14, opacity: 0.55, marginBottom: 12, fontWeight: 600 }}>
                Pick a team above to get started.
              </p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {me.team && (
                <button
                  disabled={me.ready}
                  onClick={switchTeams}
                  style={{ background: "rgba(0,0,0,0.1)", color: TEXT, fontSize: 14, fontWeight: 800, padding: "12px 18px" }}
                >
                  Switch Teams
                </button>
              )}

              {me.team && (
                <button
                  disabled={me.ready}
                  onClick={() => toggleCluegiver(me.id)}
                  style={{
                    background: me.is_cluegiver ? (me.team === "red" ? RED_COLOR : BLUE_COLOR) : "rgba(0,0,0,0.1)",
                    color: me.is_cluegiver ? "white" : TEXT,
                    fontSize: 14,
                    fontWeight: 900,
                    padding: "12px 18px",
                  }}
                >
                  {me.is_cluegiver ? "Cluegiver ✓" : "Play as Cluegiver"}
                </button>
              )}

              {me.team && (
                <button
                  disabled={!canReady && !me.ready}
                  onClick={toggleReady}
                  style={{
                    background: me.ready ? "#12BAAA" : TAN,
                    color: me.ready ? "white" : "#000",
                    fontSize: 14,
                    fontWeight: 900,
                    padding: "12px 18px",
                  }}
                >
                  {me.ready ? "Not Ready" : "I'm Ready"}
                </button>
              )}
            </div>

            {me.team && !me.ready && !canReady && (
              <p style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: TEXT }}>
                {!myTeamCluegiver
                  ? "Your team needs a cluegiver before you can mark yourself ready."
                  : myTeamSize < 2
                  ? "Your team needs at least 2 players."
                  : "The other team needs at least 2 players."}
              </p>
            )}
          </>
        )}
      </div>

      {showInstructions && (
        <div
          onClick={() => setShowInstructions(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1A1A2E", width: "100%", maxWidth: 480, padding: "28px 24px", marginTop: 24 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>How to Play</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, fontWeight: 400, whiteSpace: "pre-wrap" }}>
              {instructions || "Loading…"}
            </div>
          </div>
        </div>
      )}

      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#7A6248", width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: "rgba(0,0,0,0.25)",
                    fontSize: 15, fontWeight: 900, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: "rgba(255,255,255,0.12)",
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                      {p.name}
                      
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmingStart(false)}
                style={{ flex: 1, background: "rgba(255,255,255,0.15)", color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                {starting ? "Starting…" : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {canStart && (
      <Footer colors={POKE_COLORS}>
        <FooterButton
          onClick={() => {
            setConfirmingStart(true)
            throw new Error("Modal opened")
          }}
          disabled={starting || confirmingStart}
        >
          Start Game
        </FooterButton>
      </Footer>
    )}
    </>
  )
}
