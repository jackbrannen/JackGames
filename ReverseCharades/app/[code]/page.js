"use client"

import { supabase } from "../../lib/supabase"
import { splitCode } from "../../lib/words"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import RandomIdeas from "../../components/RandomIdeas"

const PRIMARY = "#974344"
const DARK    = "#803946"
const MID     = "#8A3D45"
const WARM    = "#AE5C4D"
const YELLOW  = "#FBDF54"


const GAME_STYLES = {
  catchphrase:    { name: "Catchphrase",    description: "Teammates can say anything except the clue." },
  body_cues:      { name: "Body Cues",      description: "Teammates tell the guesser what to do with their body until they figure it out." },
  chain_reaction: { name: "Chain Reaction", description: "Teammates alternate saying one word at a time to build entire sentences." },
}

const DEFAULT_SETTINGS = {
  turn_duration_seconds: 45,
  skip_limit: 1,
  skip_penalty: 0,
  min_clues_per_player: 4,
  max_clues_per_player: 6,
  game_style: "catchphrase",
}

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

function normalizeSettings(game) {
  return {
    turn_duration_seconds: game?.turn_duration_seconds ?? DEFAULT_SETTINGS.turn_duration_seconds,
    skip_limit: game?.skip_limit ?? DEFAULT_SETTINGS.skip_limit,
    skip_penalty: game?.skip_penalty ?? DEFAULT_SETTINGS.skip_penalty,
    min_clues_per_player: game?.min_clues_per_player ?? DEFAULT_SETTINGS.min_clues_per_player,
    max_clues_per_player: game?.max_clues_per_player ?? DEFAULT_SETTINGS.max_clues_per_player,
    game_style: game?.game_style ?? DEFAULT_SETTINGS.game_style,
  }
}

const inputStyle = {
  background: WARM,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
}

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM, yellow: YELLOW, notifBg: "#5A2428" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

const selectStyle = {
  background: DARK,
  color: "white",
  fontSize: 16,
  padding: "8px 12px",
  marginLeft: 8,
  border: "1px solid rgba(255,255,255,0.2)",
}

const labelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 16,
  fontWeight: 600,
  color: "rgba(255,255,255,0.85)",
  padding: "10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
      {children}
    </div>
  )
}

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

const BANNED_CLUES = ["hitler", "taylor swift"]
function isBannedClue(text) {
  const lower = text.trim().toLowerCase()
  return BANNED_CLUES.some(b => lower === b)
}

function AddClueForm({ code, playerId, onAdded, disabled, playerNames = [] }) {
  const [text, setText] = useState("")
  const [clueError, setClueError] = useState("")

  async function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    setClueError("")
    if (isBannedClue(trimmed)) { alert("Good clues only, please"); setText(""); return }
    const { data: dup } = await supabase
      .from("reversecharades_clues")
      .select("id")
      .eq("game_code", code)
      .ilike("text", trimmed)
      .limit(1)
    if (dup?.length > 0) { setClueError("Someone already submitted this clue!"); return }
    const { error } = await supabase.from("reversecharades_clues").insert({
      game_code: code, submitted_by: playerId, text: trimmed,
    })
    if (error) { alert("Error adding clue"); return }
    setText("")
    await onAdded()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="Type a clue…"
        maxLength={150}
        disabled={disabled}
        style={inputStyle}
      />
      <button
        disabled={disabled || !text.trim()}
        onClick={submit}
        style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", marginTop: 8, display: "block" }}
      >
        Add Clue
      </button>
      {clueError && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", background: DARK, padding: "8px 12px", marginTop: 8 }}>
          {clueError}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <RandomIdeas
          bg={WARM}
          yellow={YELLOW}
          fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
          playerNames={playerNames}
          maxDraws={3}
        />
      </div>
    </div>
  )
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  console.log('[LOBBY MOUNT]', { code })

  const [gameExists, setGameExists] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [myClues, setMyClues] = useState([])
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinTeam, setJoinTeam] = useState(null)
  const [joinError, setJoinError] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [startError, setStartError] = useState("")
  const [starting, setStarting] = useState(false)
  const hasAutoJoinedRef = useRef(false)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("reversecharades_players")
      .select("id,name,team,ready,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function refreshMyClues(pid) {
    if (!pid) return
    const { data } = await supabase
      .from("reversecharades_clues")
      .select("id,text,created_at")
      .eq("game_code", code)
      .eq("submitted_by", pid)
      .order("created_at", { ascending: true })
    setMyClues(data ?? [])
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("reversecharades_games")
      .select("code,phase,host_id,turn_duration_seconds,skip_limit,skip_penalty,min_clues_per_player,max_clues_per_player,game_style,is_dummy")
      .eq("code", code)
      .single()
    console.log('[LOAD GAME]', { data, error })
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGame(data)
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    const existing = localStorage.getItem(`rc:${code}:playerId`)
    if (existing) setMyPlayerId(existing)

    supabase.from("game_instructions").select("body").eq("game_key", "reversecharades").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadGame().then(async () => {
      await refreshPlayers()
      await refreshMyClues(existing)
    })
  }, [code])

  useEffect(() => {
    console.log('[AUTO-JOIN CHECK]', { phase: game?.phase, myPlayerId, isDummy: game?.is_dummy, hasAutoJoined: hasAutoJoinedRef.current })
    if (game?.phase !== "lobby" || myPlayerId) return
    // Only auto-join for dummy games
    if (!game?.is_dummy) return
    const saved = loadProfile()
    console.log('[AUTO-JOIN] Saved profile:', saved)
    if (!saved?.username) return
    if (hasAutoJoinedRef.current) return
    hasAutoJoinedRef.current = true
    console.log('[AUTO-JOIN] Starting auto-join for', saved.username)
    ;(async () => {
      const { data: taken } = await supabase.from("reversecharades_players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      console.log('[AUTO-JOIN] Name check:', { username: saved.username, taken: taken?.length })
      if (taken?.length > 0) { hasAutoJoinedRef.current = false; return }

      // Fetch fresh player list to assign team
      const { data: currentPlayers } = await supabase
        .from("reversecharades_players")
        .select("id,team")
        .eq("game_code", code)

      const aCount = (currentPlayers || []).filter(p => p.team === "A").length
      const bCount = (currentPlayers || []).filter(p => p.team === "B").length
      const team = bCount < aCount ? "B" : "A"

      const { data, error } = await supabase.from("reversecharades_players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team, ready: false })
        .select("id").single()
      console.log('[AUTO-JOIN] Insert result:', { data, error })
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`rc:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      console.log('[AUTO-JOIN] Success! Player ID:', data.id)
      // Pre-fill clues for dummy games
      const clueCount = game?.min_clues_per_player || 2
      const { data: ideas } = await supabase.rpc("get_random_ideas", { p_count: clueCount, p_exclude: [] })
      if (ideas?.length) await supabase.from("reversecharades_clues").insert(ideas.map(text => ({ game_code: code, submitted_by: data.id, text })))
      await refreshPlayers()
      await refreshMyClues(data.id)
    })()
  }, [game?.is_dummy, game?.phase, myPlayerId, code, game?.min_clues_per_player])

  useEffect(() => {
    async function loadState() {
      await loadGame()
      await refreshPlayers()
    }

    loadState()
    const poll = setInterval(loadState, 5000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)

    const channel = supabase.channel(`rc-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_players" }, refreshPlayers)
      .on("postgres_changes", { event: "*", schema: "public", table: "reversecharades_games", filter: `code=eq.${code}` }, () => loadGame())
      .subscribe()

    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  const me = players.find(p => p.id === myPlayerId)
  const settings = normalizeSettings(game)
  const teamAPlayers = players.filter(p => p.team === "A")
  const teamBPlayers = players.filter(p => p.team === "B")
  const teamsValid = teamAPlayers.length >= 2 && teamBPlayers.length >= 2
  const everyoneReady = players.length > 0 && players.every(p => p.ready)
  const canStart = everyoneReady && teamsValid && !!me
  const myEditsLocked = !!me?.ready
  const isHost = myPlayerId === game?.host_id
  const isGameActive = game?.phase && game.phase !== "lobby"

  useEffect(() => {
    if (isGameActive && myPlayerId) router.push(`/${code}/play`)
  }, [isGameActive])

  async function join(teamOverride) {
    const trimmed = name.trim()
    if (!trimmed) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoinError("")
    const { data: existing } = await supabase
      .from("reversecharades_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmed)
      .limit(1)
    if (existing?.length > 0) { setJoinError("That name is already taken. Choose another."); return }

    const aCount = players.filter(p => p.team === "A").length
    const bCount = players.filter(p => p.team === "B").length
    const team = teamOverride || joinTeam || (aCount <= bCount ? "A" : "B")

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const isFirst = players.length === 0
    const { data, error } = await supabase
      .from("reversecharades_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team, ready: false })
      .select("id")
      .single()
    if (error) { setJoinError("Error joining game"); return }

    if (isFirst) {
      await supabase.from("reversecharades_games").update({ host_id: data.id }).eq("code", code)
    }

    // Pre-fill clues for dummy games
    if (game?.is_dummy) {
      const clueCount = game?.min_clues_per_player || 2
      const { data: ideas } = await supabase.rpc("get_random_ideas", { p_count: clueCount, p_exclude: [] })
      if (ideas?.length) {
        await supabase.from("reversecharades_clues").insert(
          ideas.map(text => ({ game_code: code, submitted_by: data.id, text }))
        )
      }
    }

    localStorage.setItem(`rc:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setName("")
    await refreshPlayers()
    await refreshMyClues(data.id)
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    setStartError("")
    const { error } = await supabase.rpc("rc_start_game", { p_code: code })
    if (error) { setStartError("Failed to start: " + error.message); setStarting(false); return }
    router.push(`/${code}/play`)
  }

  if (gameExists === null) {
    return (
      <div style={{ minHeight: "100dvh", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 20, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  if (!gameExists) {
    return (
      <div style={{ minHeight: "100dvh", background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "white", fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p>
      </div>
    )
  }

  if (isGameActive && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: PRIMARY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 16, color: "white" }}>Reverse Charades</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "white" }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, color: "white" }}>This page will update automatically.</p>
      </div>
    )
  }

  const [word1, word2] = splitCode(code)

  const teamHeaderStyle = (team) => ({
    background: team === "A" ? YELLOW : WARM,
    color: team === "A" ? "#000" : "white",
    fontSize: 13,
    fontWeight: 900,
    padding: "8px 12px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  })

  return (
    <>
    <div style={{ minHeight: "100dvh", background: PRIMARY, color: "white", paddingBottom: BOTTOM_PAD }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: DARK, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 4 }}>
            Reverse Charades
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>
            <span style={{ color: "#fff" }}>{word1}</span>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{word2}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) { await navigator.share({ title: `Join Reverse Charades — ${code}`, url }) }
              else { await navigator.clipboard.writeText(url); alert("Link copied!") }
            }}
            style={{ background: WARM, color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
          >
            Invite
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 800, padding: "10px 14px" }}
          >
            How to Play
          </button>
        </div>
      </div>

      {/* Game style strip */}
      {!!me && !showSettings && (
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: MID, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.55, marginBottom: 4 }}>
              Game Style
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 3 }}>
              {GAME_STYLES[settings.game_style]?.name ?? "Catchphrase"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.65 }}>
              {GAME_STYLES[settings.game_style]?.description ?? ""}
            </div>
          </div>
          {!!me && (
            <button
              onClick={() => { setSettingsDraft(settings); setShowSettings(true) }}
              style={{ background: WARM, color: "white", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16 }}
            >
              <CogIcon />
            </button>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ padding: "24px", background: DARK }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" }}>Settings</div>
            <button onClick={() => setShowSettings(false)} style={{ background: WARM, color: "white", fontSize: 13, fontWeight: 800, padding: "8px 14px" }}>Cancel</button>
          </div>
          <div>
            <label style={{ ...labelStyle, flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <span>Game Style</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                {Object.entries(GAME_STYLES).map(([key, { name, description }]) => (
                  <button
                    key={key}
                    onClick={() => setSettingsDraft(p => ({ ...p, game_style: key }))}
                    style={{
                      background: settingsDraft.game_style === key ? YELLOW : DARK,
                      color: settingsDraft.game_style === key ? "#000" : "white",
                      fontSize: 15,
                      fontWeight: settingsDraft.game_style === key ? 900 : 600,
                      padding: "10px 14px",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{name}</div>
                    <div style={{ fontSize: 13, opacity: settingsDraft.game_style === key ? 0.65 : 0.5, fontWeight: 500, marginTop: 2 }}>{description}</div>
                  </button>
                ))}
              </div>
            </label>
            <label style={labelStyle}>
              <span>Turn length</span>
              <select value={String(settingsDraft.turn_duration_seconds)} onChange={e => setSettingsDraft(p => ({ ...p, turn_duration_seconds: Number(e.target.value) }))} style={selectStyle}>
                {[30, 45, 60, 75, 90].map(v => <option key={v} value={v}>{v}s</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span>Skip limit</span>
              <select value={settingsDraft.skip_limit === 0 ? "unlimited" : String(settingsDraft.skip_limit)} onChange={e => setSettingsDraft(p => ({ ...p, skip_limit: e.target.value === "unlimited" ? 0 : Number(e.target.value) }))} style={selectStyle}>
                <option value="unlimited">Unlimited</option>
                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span>Skip penalty</span>
              <select value={String(settingsDraft.skip_penalty)} onChange={e => setSettingsDraft(p => ({ ...p, skip_penalty: Number(e.target.value) }))} style={selectStyle}>
                {[0, -1].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span>Min clues / player</span>
              <select value={String(settingsDraft.min_clues_per_player)} onChange={e => {
                const min = Number(e.target.value)
                setSettingsDraft(p => ({ ...p, min_clues_per_player: min, max_clues_per_player: p.max_clues_per_player < min ? min : p.max_clues_per_player }))
              }} style={selectStyle}>
                {[1,2,3,4,5,6,7,8].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, borderBottom: "none" }}>
              <span>Max clues / player</span>
              <select value={settingsDraft.max_clues_per_player === null ? "unlimited" : String(settingsDraft.max_clues_per_player)} onChange={e => {
                const max = e.target.value === "unlimited" ? null : Number(e.target.value)
                setSettingsDraft(p => ({ ...p, max_clues_per_player: max, min_clues_per_player: max !== null && max < p.min_clues_per_player ? max : p.min_clues_per_player }))
              }} style={selectStyle}>
                <option value="unlimited">Unlimited</option>
                {[1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <button
            disabled={savingSettings}
            onClick={async () => {
              setSavingSettings(true)
              await supabase.from("reversecharades_games").update({
                turn_duration_seconds: settingsDraft.turn_duration_seconds,
                skip_limit: settingsDraft.skip_limit,
                skip_penalty: settingsDraft.skip_penalty,
                min_clues_per_player: settingsDraft.min_clues_per_player,
                max_clues_per_player: settingsDraft.max_clues_per_player,
                game_style: settingsDraft.game_style,
              }).eq("code", code)
              await loadGame()
              setSavingSettings(false)
              setShowSettings(false)
            }}
            style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", marginTop: 20, display: "block" }}
          >
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}

      {!canStart && everyoneReady && !teamsValid && (
        <div style={{ padding: "16px 24px", background: DARK, fontSize: 14, fontWeight: 700, color: YELLOW }}>
          Need at least 2 players per team to start.
        </div>
      )}

      {/* Teams */}
      {!!me && (
        <div style={{ padding: "28px 24px" }}>
          <SectionLabel>Teams</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Boys", team: "A", tPlayers: teamAPlayers },
              { label: "Girls", team: "B", tPlayers: teamBPlayers },
            ].map(({ label, team, tPlayers }) => (
              <div key={team} style={{ background: MID, overflow: "hidden" }}>
                <div style={teamHeaderStyle(team)}>{label}</div>
                <div style={{ padding: "8px 12px 10px" }}>
                  {tPlayers.length === 0 && (
                    <div style={{ fontSize: 14, opacity: 0.65, fontStyle: "italic", padding: "4px 0" }}>No players</div>
                  )}
                  {tPlayers.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.ready ? YELLOW : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>
                        {p.name}
                      </span>
                      {me && p.id !== me.id && (
                        <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await supabase.from("reversecharades_players").delete().eq("id", p.id); loadState() } }}
                          aria-label={`Remove ${p.name}`}
                          style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join / You */}
      <div style={{ padding: `${!me ? 28 : 0}px 24px 28px` }}>
        {!me ? (
          <>
            <SectionLabel>Join Game</SectionLabel>
            {!savedProfile && (
              <>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              </>
            )}
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && join()} placeholder="Display Name" maxLength={45} style={inputStyle} />

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[{ team: "A", label: "Join Boys" }, { team: "B", label: "Join Girls" }].map(({ team, label }) => (
                <button
                  key={team}
                  onClick={() => { setJoinTeam(team); join(team) }}
                  disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim()))}
                  style={{
                    flex: 1,
                    background: YELLOW,
                    color: "#000",
                    fontSize: 16,
                    fontWeight: 900,
                    padding: "18px 12px",
                  }}
                >{label}</button>
              ))}
            </div>
            {joinError && <p style={{ color: YELLOW, marginTop: 10, fontSize: 14, fontWeight: 700 }}>{joinError}</p>}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                disabled={myEditsLocked}
                onClick={async () => {
                  const newTeam = me.team === "A" ? "B" : "A"
                  await supabase.from("reversecharades_players").update({ team: newTeam }).eq("id", me.id)
                  await refreshPlayers()
                }}
                style={{ background: WARM, color: "white", fontSize: 14, fontWeight: 800, padding: "12px 18px" }}
              >
                Change Genders
              </button>
              <button
                disabled={!me.ready && myClues.length < settings.min_clues_per_player}
                onClick={async () => {
                  const { error } = await supabase.from("reversecharades_players").update({ ready: !me.ready }).eq("id", me.id)
                  if (error) { alert("Ready toggle failed: " + error.message); return }
                  await refreshPlayers()
                }}
                style={{ background: me.ready ? MID : YELLOW, color: me.ready ? "white" : "#000", fontSize: 14, fontWeight: 900, padding: "12px 18px" }}
              >
                {me.ready ? "✓ Ready" : "Mark Ready"}
              </button>
            </div>
            {!me.ready && myClues.length < settings.min_clues_per_player && (
              <p style={{ marginTop: 12, fontSize: 13, opacity: 0.75, fontWeight: 600, color: YELLOW }}>
                Add {settings.min_clues_per_player - myClues.length} more clue{settings.min_clues_per_player - myClues.length !== 1 ? "s" : ""} before marking ready.
              </p>
            )}
            {me.ready && (
              <p style={{ marginTop: 12, fontSize: 13, opacity: 0.65, fontWeight: 600 }}>
                Clues locked. Un-ready to edit.
              </p>
            )}
          </>
        )}
      </div>

      {/* My Clues */}
      {!!me && (
        <div style={{ padding: "0 24px", paddingBottom: "max(48px, calc(48px + env(safe-area-inset-bottom, 0px)))" }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)" }}>
                My Clues
              </div>
              {!myEditsLocked && settings.min_clues_per_player > myClues.length && (
                <span style={{ fontSize: 13, color: YELLOW, fontWeight: 700 }}>
                  {settings.min_clues_per_player - myClues.length} more needed
                </span>
              )}
            </div>

            {myEditsLocked ? (
              <>
                <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Marked ready — clues locked
                </div>
                {myClues.map(c => (
                  <div key={c.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 18, fontWeight: 700 }}>
                    {c.text}
                  </div>
                ))}
              </>
            ) : (
              <>
                {myClues.map(c => (
                  <div key={c.id} style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={c.text}
                      onChange={async e => {
                        const newText = e.target.value
                        setMyClues(prev => prev.map(x => x.id === c.id ? { ...x, text: newText } : x))
                        await supabase.from("reversecharades_clues").update({ text: newText }).eq("id", c.id)
                      }}
                      onBlur={async e => {
                        if (isBannedClue(e.target.value)) {
                          alert("Good clues only, please")
                          setMyClues(prev => prev.map(x => x.id === c.id ? { ...x, text: "" } : x))
                          await supabase.from("reversecharades_clues").update({ text: "" }).eq("id", c.id)
                        }
                      }}
                      maxLength={150}
                      style={{ ...inputStyle, fontSize: 17, padding: "12px 16px", flex: 1, width: "auto" }}
                    />
                    <button
                      onClick={async () => {
                        await supabase.from("reversecharades_clues").delete().eq("id", c.id)
                        await refreshMyClues(me.id)
                      }}
                      style={{ background: DARK, color: "rgba(255,255,255,0.75)", fontSize: 20, fontWeight: 900, padding: "10px 14px", flexShrink: 0, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {settings.max_clues_per_player !== null && myClues.length >= settings.max_clues_per_player ? (
                  <p style={{ fontSize: 14, opacity: 0.65, fontWeight: 600, marginTop: 12 }}>
                    Maximum of {settings.max_clues_per_player} clues reached.
                  </p>
                ) : (
                  <AddClueForm
                    code={code}
                    playerId={me.id}
                    disabled={false}
                    onAdded={() => refreshMyClues(me.id)}
                    playerNames={players.filter(p => p.id !== me.id).map(p => p.first_name || p.name)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

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

      {/* Confirm start modal */}
      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Start the game?</h2>
            <p style={{ fontSize: 15, opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>This will begin for everyone. Are all players in?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ padding: "10px 0", minWidth: 40, flexShrink: 0, background: MID, fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i + 1}
                  </div>
                  <div style={{ padding: "10px 14px", flex: 1, background: WARM, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>
                      {p.name}
                      
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmingStart(false)} style={{ flex: 1, background: WARM, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}>Cancel</button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                Start Game
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
