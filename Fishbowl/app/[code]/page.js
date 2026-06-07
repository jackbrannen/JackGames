"use client"

import { supabase } from "../../lib/supabase"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import RandomIdeas from "../../components/RandomIdeas"

const T1         = "#3378FF"  // page background blue
const WARM_LIGHT = "#3399FF"
const BOYS  = "#F97316"  // boys team orange
const GIRLS = "#C026D3"  // girls team fuchsia
const YELLOW = "#FBDF54"
const PURPLE = "#E05C30"
const RED = "#F04F52"

const WORDS_A_FB = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "HONEY","BUTTER","COOKIE","WAFFLE","MUFFIN","BAGEL","COCOA","LATTE","LEMON","MANGO",
  "PLUM","PEACH","BERRY","OLIVE","BASIL","PEPPER","GINGER","SUGAR","SALMON","TURKEY",
  "PANDA","TIGER","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA",
  "LLAMA","HORSE","MONKEY","RABBIT","BADGER","BEAVER","COYOTE","WOLF","FOX","MOOSE",
  "BISON","GIRAFFE","JAGUAR","COBRA","VIPER","GECKO","TURTLE","SEAL","SHARK","RAY",
  "NINJA","SAMURAI","KNIGHT","WIZARD","RANGER","SCOUT","CAPTAIN","DOCTOR","ARTIST","BAKER",
  "ENGINE","HAMMER","ANCHOR","COMPASS","RADAR","SATELLITE","CAMERA","GUITAR","PIANO","DRUM",
  "PLANET","GALAXY","NEBULA","ASTEROID","ECLIPSE","AURORA","HORIZON","SKYLINE",
]

function splitCodeFB(code) {
  for (const w of WORDS_A_FB) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
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

const DEFAULT_SETTINGS = {
  rounds_total: 3,
  turn_duration_seconds: 45,
  skip_limit: 1,
  skip_penalty: 0,
  min_clues_per_player: 3,
  max_clues_per_player: 6,
  first_turn_team: 2,
}

const SETTINGS_LOCK_SECONDS = 30

const COOL_DARK = "#0C47E9"
const MID_DARK = "#2357E7"
const POKE_COLORS = { dark: COOL_DARK, mid: MID_DARK, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#071A8A" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function normalizeSettings(game) {
  return {
    rounds_total: game?.rounds_total ?? DEFAULT_SETTINGS.rounds_total,
    turn_duration_seconds: game?.turn_duration_seconds ?? DEFAULT_SETTINGS.turn_duration_seconds,
    skip_limit: game?.skip_limit ?? DEFAULT_SETTINGS.skip_limit,
    skip_penalty: game?.skip_penalty ?? DEFAULT_SETTINGS.skip_penalty,
    min_clues_per_player: game?.min_clues_per_player ?? DEFAULT_SETTINGS.min_clues_per_player,
    max_clues_per_player:
      game?.max_clues_per_player !== undefined
        ? game.max_clues_per_player
        : DEFAULT_SETTINGS.max_clues_per_player,
    first_turn_team: game?.first_turn_team ?? DEFAULT_SETTINGS.first_turn_team,
  }
}

const inputStyle = {
  background: WARM_LIGHT,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
}

const selectStyle = {
  background: "#0C47E9",
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

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 17,
      fontWeight: 800,
      color: "rgba(255,255,255,0.85)",
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

const INSTRUCTIONS = `Players: 4+ · Teams: 2 · Time: 15+ min

Everyone splits into two teams. Before the game starts, each player secretly submits several clue words — people, places, things, phrases, anything goes. All the clues go into a shared "fishbowl."

The game has 3 rounds. In each round, teams take turns sending one player up to give clues. That clue-giver draws from the fishbowl and tries to get their team to guess as many clues as possible before time runs out. Correct guesses score a point; you can skip clues (with a small penalty if skip penalties are on). Any clue you skip or don't reach goes back into the fishbowl for the next turn.

Round 1 — Describe it: You can say anything but the clue word itself or part of the word (or "rhymes with").

Round 2 — One word: You can only say a single word as your clue.

Round 3 — Act it out: No words at all. Gestures and acting only.

Bonus Round 4 — Under a blanket: Sound effects and act it out, but you have to be covered up.

The same clues rotate through all rounds, so by Round 3 everyone has heard them and the game gets fast and chaotic. The team with the most points after all three rounds wins.`

const DEMO_CLUES_T2 = [
  "Harry Potter",
]

const BANNED_CLUES = ["hitler", "taylor swift"]
function isBannedClue(text) {
  const lower = text.trim().toLowerCase()
  return BANNED_CLUES.some((b) => lower === b)
}

function AddClueForm({ code, playerId, onAdded, disabled, playerNames = [] }) {
  const [text, setText] = useState("")
  const [clueError, setClueError] = useState("")

  async function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    setClueError("")
    if (isBannedClue(trimmed)) {
      alert("Good clues only, please")
      setText("")
      return
    }
    const { data: dup } = await supabase
      .from("clues")
      .select("id")
      .eq("game_code", code)
      .ilike("text", trimmed)
      .limit(1)
    if (dup?.length > 0) {
      setClueError("Someone already submitted this clue!")
      return
    }
    const { error } = await supabase.from("clues").insert({
      game_code: code,
      player_id: playerId,
      text: trimmed,
    })
    if (error) {
      alert("Error adding clue")
      return
    }
    setText("")
    await onAdded()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Type a clue…"
        maxLength={150}
        disabled={disabled}
        style={inputStyle}
      />
      <button
        disabled={disabled || !text.trim()}
        onClick={submit}
        style={{
          background: YELLOW,
          color: "#000",
          fontSize: 18,
          fontWeight: 900,
          padding: "16px",
          width: "100%",
          marginTop: 8,
          display: "block",
        }}
      >
        Add Clue
      </button>
      {clueError && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", background: "#0C47E9", padding: "8px 12px", marginTop: 8 }}>
          {clueError}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <RandomIdeas
          bg={WARM_LIGHT}
          yellow={YELLOW}
          fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
          playerNames={playerNames}
          maxDraws={3}
          onIdeaClick={idea => setText(idea)}
        />
      </div>
    </div>
  )
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [gameExists, setGameExists] = useState(null)
  const [gameLocked, setGameLocked] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [gameSettings, setGameSettings] = useState(DEFAULT_SETTINGS)
  const [settingsEditorPlayerId, setSettingsEditorPlayerId] = useState(null)
  const [settingsLockExpiresAt, setSettingsLockExpiresAt] = useState(null)
  const [players, setPlayers] = useState([])
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joinGender, setJoinGender] = useState(null) // 1 = Boy, 2 = Girl
  const [joinError, setJoinError] = useState("")
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [myClues, setMyClues] = useState([])
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [joining, setJoining] = useState(false)
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState("")
  const hasAutoJoinedRef = useRef(false)

  async function refreshPlayers() {
    const { data } = await supabase
      .from("players")
      .select("id,name,team,ready,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    setPlayers(data ?? [])
  }

  async function refreshMyClues(playerId) {
    if (!playerId) return
    const { data } = await supabase
      .from("clues")
      .select("id,text,created_at")
      .eq("game_code", code)
      .eq("player_id", playerId)
      .order("created_at", { ascending: true })
    setMyClues(data ?? [])
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setName(saved.username || "")
      if (saved.team) setJoinGender(saved.team)
    }
  }, [])

  useEffect(() => {
    if (gameExists !== true || gamePhase !== "lobby" || myPlayerId || hasAutoJoinedRef.current) return
    const saved = loadProfile()
    if (!saved?.username) return
    hasAutoJoinedRef.current = true
    ;(async () => {
      const { data: taken } = await supabase.from("players").select("id").eq("game_code", code).ilike("name", saved.username.trim()).limit(1)
      if (taken?.length > 0) return
      const t1 = players.filter(p => p.team === 1).length
      const t2 = players.filter(p => p.team === 2).length
      const team = t2 <= t1 ? 2 : 1
      const { data, error } = await supabase.from("players")
        .insert({ game_code: code, name: saved.username.trim(), first_name: saved.firstName?.trim() ?? "", last_name: saved.lastName?.trim() ?? "", team, ready: false })
        .select("id").single()
      if (error || !data) { hasAutoJoinedRef.current = false; return }
      localStorage.setItem(`fishbowl:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      const clueCount = gameSettings.min_clues_per_player || 3
      const { data: ideas } = await supabase.rpc("get_random_ideas", { p_count: clueCount, p_exclude: [] })
      if (ideas?.length) await supabase.from("clues").insert(ideas.map(text => ({ game_code: code, player_id: data.id, text })))
      await refreshPlayers()
      await refreshMyClues(data.id)
    })()
  }, [gameExists, gamePhase, myPlayerId, players.length, code])

  useEffect(() => {
    const existing = localStorage.getItem(`fishbowl:${code}:playerId`)
    if (existing) setMyPlayerId(existing)

    let cancelled = false

    async function loadGame() {
      try {
        const { data, error } = await supabase
          .from("games")
          .select(
            "code,locked,phase,is_demo,rounds_total,turn_duration_seconds,skip_limit,skip_penalty,min_clues_per_player,max_clues_per_player,settings_editor_player_id,settings_lock_expires_at"
          )
          .eq("code", code)
          .single()

        if (cancelled) return

        if (error || !data) {
          setGameExists(false)
          return
        }

        setGameExists(true)
        setGameLocked(!!data.locked)
        setIsDemo(!!data.is_demo)
        setGamePhase(data.phase || "lobby")
        setGameSettings(normalizeSettings(data))
        setSettingsEditorPlayerId(data.settings_editor_player_id ?? null)
        setSettingsLockExpiresAt(data.settings_lock_expires_at ?? null)
        await refreshPlayers()
        await refreshMyClues(existing)
      } catch {
        if (!cancelled) setGameExists(false)
      }
    }

    loadGame()
    return () => { cancelled = true }
  }, [code])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "fishbowl").single()
      .then(({ data }) => { if (data) setInstructions(data.body) })
  }, [])

  useEffect(() => {
    const poll = setInterval(async () => {
      await refreshPlayers()

      const { data } = await supabase
        .from("games")
        .select(
          "locked,phase,is_demo,rounds_total,turn_duration_seconds,skip_limit,skip_penalty,min_clues_per_player,max_clues_per_player,settings_editor_player_id,settings_lock_expires_at"
        )
        .eq("code", code)
        .single()

      if (data) {
        setGameLocked(!!data.locked)
        setIsDemo(!!data.is_demo)
        setGamePhase(data.phase || "lobby")
        setGameSettings(normalizeSettings(data))
        setSettingsEditorPlayerId(data.settings_editor_player_id ?? null)
        setSettingsLockExpiresAt(data.settings_lock_expires_at ?? null)
      }
    }, 1500)

    const channel = supabase
      .channel("game-" + code)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, async () => {
        await refreshPlayers()
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `code=eq.${code}` },
        (payload) => {
          if (payload.new?.locked !== undefined) setGameLocked(!!payload.new.locked)
          if (payload.new?.phase) setGamePhase(payload.new.phase)
          if (payload.new) {
            setGameSettings(normalizeSettings(payload.new))
            setSettingsEditorPlayerId(payload.new.settings_editor_player_id ?? null)
            setSettingsLockExpiresAt(payload.new.settings_lock_expires_at ?? null)
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [code])

  async function join() {
    if (joining) return
    const trimmed = name.trim()
    if (isDemo) {
      if (!trimmed || gameLocked) return
      setJoining(true)
      // Auto-assign to the team that has fewer players (default team 2 since demo player 1 is team 1)
      const team1Count = players.filter((p) => p.team === 1).length
      const team2Count = players.filter((p) => p.team === 2).length
      const team = team2Count <= team1Count ? 2 : 1

      const { data, error } = await supabase
        .from("players")
        .insert({ game_code: code, name: trimmed, team, ready: false })
        .select("id")
        .single()

      if (error) { alert("Error joining game"); setJoining(false); return }

      localStorage.setItem(`fishbowl:${code}:playerId`, data.id)
      setMyPlayerId(data.id)
      setName("")

      await supabase.from("clues").insert(
        DEMO_CLUES_T2.map((text) => ({ game_code: code, player_id: data.id, text }))
      )

      await refreshPlayers()
      await refreshMyClues(data.id)
      return
    }

    if (!trimmed || gameLocked) return

    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")
    const { data: existing } = await supabase
      .from("players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmed)
      .limit(1)
    if (existing?.length > 0) {
      alert("That username is already taken in this game. Please choose another.")
      setJoining(false)
      return
    }

    const team1Count = players.filter((p) => p.team === 1).length
    const team2Count = players.filter((p) => p.team === 2).length
    const team = joinGender || (team1Count <= team2Count ? 1 : 2)

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed, team }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team, ready: false })
      .select("id")
      .single()

    if (error) {
      alert("Error joining game")
      setJoining(false)
      return
    }

    localStorage.setItem(`fishbowl:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setName("")
    await refreshPlayers()
    await refreshMyClues(data.id)
  }

  const me = players.find((p) => p.id === myPlayerId)
  const myEditsLocked = !!gameLocked || !!me?.ready
  const canEditSettings = !gameLocked && gamePhase === "lobby"
  const lockIsActive =
    !!settingsEditorPlayerId &&
    !!settingsLockExpiresAt &&
    new Date(settingsLockExpiresAt).getTime() > Date.now()
  const lockHeldByMe = !!myPlayerId && lockIsActive && settingsEditorPlayerId === myPlayerId
  const lockHeldByOther = lockIsActive && settingsEditorPlayerId !== myPlayerId
  const settingsEditorName =
    players.find((p) => p.id === settingsEditorPlayerId)?.name || "another player"

  const everyoneReady = players.length > 0 && players.every((p) => p.ready === true)
  const teamsBalanced = players.filter((p) => p.team === 1).length >= 2 && players.filter((p) => p.team === 2).length >= 2
  const canStartGame = gameExists === true && !gameLocked && everyoneReady && teamsBalanced

  useEffect(() => {
    if (!showSettingsPanel || !lockHeldByMe) return

    const keepAlive = setInterval(async () => {
      await supabase
        .from("games")
        .update({ settings_lock_expires_at: isoSecondsFromNow(SETTINGS_LOCK_SECONDS) })
        .eq("code", code)
        .eq("settings_editor_player_id", myPlayerId)
    }, 10000)

    return () => clearInterval(keepAlive)
  }, [showSettingsPanel, lockHeldByMe, code, myPlayerId])

  async function clearSettingsLock() {
    if (!myPlayerId) return
    await supabase
      .from("games")
      .update({ settings_editor_player_id: null, settings_lock_expires_at: null })
      .eq("code", code)
      .eq("settings_editor_player_id", myPlayerId)
  }

  async function openSettingsPanel() {
    setSettingsMessage("")
    setShowSettingsPanel(true)
    setSettingsDraft(normalizeSettings(gameSettings))

    if (!canEditSettings || !myPlayerId) return

    const lockExpiry = isoSecondsFromNow(SETTINGS_LOCK_SECONDS)
    const now = new Date().toISOString()

    const { data: d1, error: e1 } = await supabase
      .from("games")
      .update({ settings_editor_player_id: myPlayerId, settings_lock_expires_at: lockExpiry })
      .eq("code", code)
      .or(`settings_editor_player_id.is.null,settings_editor_player_id.eq.${myPlayerId}`)
      .select("settings_editor_player_id")

    if (!e1 && d1 && d1.length > 0) {
      setSettingsEditorPlayerId(myPlayerId)
      setSettingsLockExpiresAt(lockExpiry)
      return
    }

    const { data: d2, error: e2 } = await supabase
      .from("games")
      .update({ settings_editor_player_id: myPlayerId, settings_lock_expires_at: lockExpiry })
      .eq("code", code)
      .lt("settings_lock_expires_at", now)
      .select("settings_editor_player_id")

    if (!e2 && d2 && d2.length > 0) {
      setSettingsEditorPlayerId(myPlayerId)
      setSettingsLockExpiresAt(lockExpiry)
      return
    }

    setSettingsMessage("Settings are currently being edited by another player.")
  }

  async function cancelSettings() {
    if (lockHeldByMe) await clearSettingsLock()
    setShowSettingsPanel(false)
    setSettingsMessage("")
    setSettingsDraft(normalizeSettings(gameSettings))
  }

  async function saveSettings() {
    if (!canEditSettings || !lockHeldByMe) return
    setSavingSettings(true)
    setSettingsMessage("")

    const payload = {
      rounds_total: Number(settingsDraft.rounds_total),
      turn_duration_seconds: Number(settingsDraft.turn_duration_seconds),
      skip_limit: settingsDraft.skip_limit === null ? 0 : Number(settingsDraft.skip_limit),
      skip_penalty: Number(settingsDraft.skip_penalty),
      min_clues_per_player: Number(settingsDraft.min_clues_per_player),
      max_clues_per_player:
        settingsDraft.max_clues_per_player === null
          ? null
          : Number(settingsDraft.max_clues_per_player),
      first_turn_team: Number(settingsDraft.first_turn_team),
      settings_editor_player_id: null,
      settings_lock_expires_at: null,
    }

    const { error } = await supabase
      .from("games")
      .update(payload)
      .eq("code", code)
      .eq("settings_editor_player_id", myPlayerId)

    if (error) {
      setSettingsMessage("Could not save settings: " + error.message)
      setSavingSettings(false)
      return
    }

    setGameSettings(normalizeSettings(payload))
    setSavingSettings(false)
    setShowSettingsPanel(false)
  }

  useEffect(() => {
    return () => {
      if (!lockHeldByMe) return
      clearSettingsLock()
    }
  }, [lockHeldByMe])

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error: lockError } = await supabase
      .from("games")
      .update({ locked: true })
      .eq("code", code)

    if (lockError) {
      alert("Start game failed: " + lockError.message)
      setStarting(false)
      return
    }

    setGameLocked(true)

    const { error: startError } = await supabase.rpc("start_game_if_locked", { p_code: code })
    if (startError) {
      alert("Start game RPC failed: " + startError.message)
      setStarting(false)
      return
    }

    const { error: roundError } = await supabase.rpc("start_round", { p_code: code })
    if (roundError) {
      alert("Start round failed: " + roundError.message)
      setStarting(false)
      return
    }

    await supabase.rpc("set_first_turn_team", { p_code: code, p_team: gameSettings.first_turn_team ?? 2 })

    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("phase,turn_player_id")
      .eq("code", code)
      .single()

    if (!gameError && gameData) {
      setGamePhase(gameData.phase || "play")
    } else {
      setGamePhase("play")
    }

    router.push(`/${code}/play`)
  }

  if (gameExists === null) {
    return (
      <div style={{ minHeight: "100dvh", background: T1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 20, fontWeight: 700, letterSpacing: "0.1em" }}>LOADING…</p>
      </div>
    )
  }

  if (!gameExists) {
    return (
      <div style={{ minHeight: "100dvh", background: T1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "white", fontSize: 24, fontWeight: 900, textTransform: "uppercase" }}>Game not found.</p>
      </div>
    )
  }

  if (gamePhase === "play" || gamePhase === "between_rounds" || gamePhase === "finished") {
    if (myPlayerId) { router.push(`/${code}/play`); return null }
    return (
      <div style={{ minHeight: "100dvh", background: T1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 16, color: "white" }}>Fishbowl</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, letterSpacing: "-0.5px", color: "white" }}>A game is in progress.</h2>
        <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, marginBottom: 32, color: "white" }}>This page will update automatically.</p>
        <button
          onClick={async () => {
            const { data } = await supabase.from("games").select("phase").eq("code", code).single()
            if (data?.phase) setGamePhase(data.phase)
          }}
          style={{ background: "#FBDF54", color: "#000", fontSize: 18, fontWeight: 900, padding: "18px 28px" }}
        >Join Lobby</button>
      </div>
    )
  }

  const team1Players = players.filter((p) => p.team === 1)
  const team2Players = players.filter((p) => p.team === 2)

  return (
    <>
    <div style={{ minHeight: "100dvh", background: T1, color: "white", paddingBottom: BOTTOM_PAD }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: "#0C47E9", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.65, marginBottom: 4 }}>
            Fishbowl
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            {(() => { const [w1, w2] = splitCodeFB(code); return <><span style={{ color: "#fff" }}>{w1}</span><span style={{ color: "rgba(255,255,255,0.55)" }}>{w2}</span></> })()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) {
                await navigator.share({ title: `Join Fishbowl — ${code}`, url })
              } else {
                await navigator.clipboard.writeText(url)
                alert("Link copied!")
              }
            }}
            style={{ background: WARM_LIGHT, color: "white", fontSize: 13, fontWeight: 800, padding: "10px 16px" }}
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

      {/* Team strip */}
      {!!me && (
        <div style={{
          background: me.team === 1 ? BOYS : GIRLS,
          color: "white", fontSize: 12, fontWeight: 900,
          textTransform: "uppercase", letterSpacing: "0.12em",
          textAlign: "center", padding: "7px 0",
        }}>
          {me.team === 1 ? "Boys" : "Girls"}
        </div>
      )}

      {/* Locked banner */}
      {gameLocked && (
        <div style={{ padding: "14px 24px", background: RED, fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Bowl locked — game started
        </div>
      )}

      {/* Team balance warning */}
      {!teamsBalanced && gameExists && !gameLocked && players.length > 0 && (
        <div style={{ padding: "16px 24px", background: "#0C47E9", fontSize: 14, fontWeight: 700, color: YELLOW }}>
          Need at least 2 players per team to start.
        </div>
      )}

      {/* Settings strip */}
      {!!me && !showSettingsPanel && (
        <div style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#2357E7", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 14, opacity: 0.6, fontWeight: 600 }}>
            {gameSettings.rounds_total} rounds · {gameSettings.turn_duration_seconds}s turns
          </span>
          <button
            onClick={openSettingsPanel}
            style={{ background: WARM_LIGHT, color: "white", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <CogIcon />
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettingsPanel && (
        <div style={{ padding: "24px", background: "#0C47E9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Settings
            </div>
            <button
              onClick={cancelSettings}
              disabled={savingSettings}
              style={{ background: WARM_LIGHT, color: "white", fontSize: 13, fontWeight: 800, padding: "8px 14px" }}
            >
              Cancel
            </button>
          </div>

          {lockHeldByOther && (
            <div style={{ padding: "12px 16px", background: WARM_LIGHT, fontSize: 14, marginBottom: 16, fontWeight: 600 }}>
              Being edited by {settingsEditorName}
            </div>
          )}
          {settingsMessage && (
            <div style={{ padding: "12px 16px", background: "rgba(240,79,82,0.3)", fontSize: 14, marginBottom: 16, fontWeight: 600 }}>
              {settingsMessage}
            </div>
          )}

          <div>
            <label style={labelStyle}>
              <span>Rounds</span>
              <select
                value={String(settingsDraft.rounds_total)}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, rounds_total: Number(e.target.value) }))}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                {[1, 2, 3, 4].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Turn length</span>
              <select
                value={String(settingsDraft.turn_duration_seconds)}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, turn_duration_seconds: Number(e.target.value) }))}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                {[30, 45, 60, 75, 90].map((v) => <option key={v} value={String(v)}>{v}s</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Skip limit</span>
              <select
                value={settingsDraft.skip_limit === 0 ? "unlimited" : String(settingsDraft.skip_limit)}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, skip_limit: e.target.value === "unlimited" ? 0 : Number(e.target.value) }))}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                <option value="unlimited">Unlimited</option>
                {[1, 2, 3, 4, 5].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Skip penalty</span>
              <select
                value={String(settingsDraft.skip_penalty)}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, skip_penalty: Number(e.target.value) }))}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                {[0, -1].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Min clues / player</span>
              <select
                value={String(settingsDraft.min_clues_per_player)}
                onChange={(e) => {
                  const min = Number(e.target.value)
                  setSettingsDraft((p) => ({
                    ...p,
                    min_clues_per_player: min,
                    max_clues_per_player: p.max_clues_per_player !== null && p.max_clues_per_player < min ? min : p.max_clues_per_player,
                  }))
                }}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              <span>First turn</span>
              <select
                value={String(settingsDraft.first_turn_team)}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, first_turn_team: Number(e.target.value) }))}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                <option value="2">Girls</option>
                <option value="1">Boys</option>
              </select>
            </label>

            <label style={{ ...labelStyle, borderBottom: "none" }}>
              <span>Max clues / player</span>
              <select
                value={settingsDraft.max_clues_per_player === null ? "unlimited" : String(settingsDraft.max_clues_per_player)}
                onChange={(e) => {
                  const max = e.target.value === "unlimited" ? null : Number(e.target.value)
                  setSettingsDraft((p) => ({
                    ...p,
                    max_clues_per_player: max,
                    min_clues_per_player: max !== null && max < p.min_clues_per_player ? max : p.min_clues_per_player,
                  }))
                }}
                disabled={!canEditSettings || !lockHeldByMe || savingSettings}
                style={selectStyle}
              >
                <option value="unlimited">Unlimited</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
            </label>
          </div>

          <button
            onClick={saveSettings}
            disabled={!canEditSettings || !lockHeldByMe || savingSettings}
            style={{
              background: YELLOW,
              color: "#000",
              fontSize: 18,
              fontWeight: 900,
              padding: "16px",
              width: "100%",
              marginTop: 20,
              display: "block",
            }}
          >
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
          {!canEditSettings && (
            <p style={{ marginTop: 12, fontSize: 13, opacity: 0.65, textAlign: "center" }}>
              Settings are locked after the game starts.
            </p>
          )}
        </div>
      )}

      {/* Players */}
      {!!me && <div style={{ padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Boys",  color: BOYS,  players: team1Players },
            { label: "Girls", color: GIRLS, players: team2Players },
          ].map(({ label, color, players: teamPlayers }) => (
            <div key={label} style={{ background: "#2357E7", overflow: "hidden" }}>
              <div style={{ background: color, color: "white", fontSize: 13, fontWeight: 900, padding: "8px 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}
              </div>
              <div style={{ padding: "8px 12px 10px" }}>
                {teamPlayers.length === 0 && (
                  <div style={{ fontSize: 14, opacity: 0.65, fontStyle: "italic", padding: "4px 0" }}>No players</div>
                )}
                {teamPlayers.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.ready ? "#12BAAA" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                      {p.name}
                      {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, fontWeight: 600, marginLeft: 6 }}>you</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* Join */}
      {!me && (
        <div style={{ padding: "28px 24px 28px" }}>
          <SectionLabel>Join Game</SectionLabel>
          {gameLocked ? (
            <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 600 }}>Game already started. New players cannot join.</p>
          ) : isDemo ? (
            <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 600 }}>Joining…</p>
          ) : (
            <>
              {!savedProfile && (
                <>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    maxLength={40}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    maxLength={40}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                </>
              )}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinGender && join()}
                placeholder="Display Name"
                maxLength={45}
                style={inputStyle}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setJoinGender(1); setTimeout(join, 0) }}
                  disabled={joining || !name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim()))}
                  style={{
                    background: BOYS,
                    color: "white",
                    fontSize: 18,
                    fontWeight: 900,
                    padding: "18px",
                  }}
                >
                  {joining && joinGender === 1 ? "Joining…" : "Boys"}
                </button>
                <button
                  onClick={() => { setJoinGender(2); setTimeout(join, 0) }}
                  disabled={joining || !name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim()))}
                  style={{
                    background: GIRLS,
                    color: "white",
                    fontSize: 18,
                    fontWeight: 900,
                    padding: "18px",
                  }}
                >
                  {joining && joinGender === 2 ? "Joining…" : "Girls"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!!me && (
        <div style={{ padding: "0 24px 28px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              disabled={gameLocked || me.ready}
              onClick={async () => {
                const newTeam = me.team === 1 ? 2 : 1
                await supabase.from("players").update({ team: newTeam }).eq("id", me.id)
                const updated = { ...(savedProfile ?? {}), team: newTeam }
                saveProfile(updated)
                setSavedProfile(updated)
                await refreshPlayers()
              }}
              style={{
                background: WARM_LIGHT,
                color: "white",
                fontSize: 14,
                fontWeight: 800,
                padding: "14px 18px",
                flex: 1,
              }}
            >
              Change Genders
            </button>
            <button
              disabled={gameLocked || (!me.ready && myClues.length < gameSettings.min_clues_per_player)}
              onClick={async () => {
                const { error } = await supabase
                  .from("players")
                  .update({ ready: !me.ready })
                  .eq("id", me.id)
                if (error) { alert("Ready toggle failed: " + error.message); return }
                await refreshPlayers()
              }}
              style={{
                background: me.ready ? "#12BAAA" : YELLOW,
                color: me.ready ? "white" : "#000",
                fontSize: 14,
                fontWeight: 900,
                padding: "14px 18px",
                flex: 1,
              }}
            >
              {me.ready ? "Not Ready" : "I'm Ready"}
            </button>
          </div>
          {!me.ready && !gameLocked && myClues.length < gameSettings.min_clues_per_player && (
            <p style={{ marginTop: 4, fontSize: 13, opacity: 0.65, fontWeight: 600, color: YELLOW }}>
              Enter your clues before marking yourself ready.
            </p>
          )}
          {me.ready && !gameLocked && (
            <p style={{ marginTop: 4, fontSize: 13, opacity: 0.65, fontWeight: 600 }}>
              Your clues are locked. Un-ready to edit them.
            </p>
          )}
        </div>
      )}

      {/* My Clues */}
      {!!me && (
        <div style={{ padding: "0 24px", paddingBottom: "max(48px, calc(48px + env(safe-area-inset-bottom, 0px)))" }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <SectionLabel>My Clues</SectionLabel>
              {!myEditsLocked && gameSettings.min_clues_per_player > myClues.length && (
                <span style={{ fontSize: 13, color: YELLOW, fontWeight: 700 }}>
                  {gameSettings.min_clues_per_player - myClues.length} more needed
                </span>
              )}
            </div>

            {myEditsLocked ? (
              <>
                <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {gameLocked ? "Game started — clues locked" : "Marked ready — clues locked"}
                </div>
                {myClues.map((c) => (
                  <div key={c.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 18, fontWeight: 700 }}>
                    {c.text}
                  </div>
                ))}
              </>
            ) : (
              <>
                {myClues.map((c) => (
                  <div key={c.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={c.text}
                        onChange={async (e) => {
                          const newText = e.target.value
                          setMyClues((prev) => prev.map((x) => (x.id === c.id ? { ...x, text: newText } : x)))
                          await supabase.from("clues").update({ text: newText }).eq("id", c.id)
                        }}
                        onBlur={async (e) => {
                          if (isBannedClue(e.target.value)) {
                            alert("Good clues only, please")
                            setMyClues((prev) => prev.map((x) => (x.id === c.id ? { ...x, text: "" } : x)))
                            await supabase.from("clues").update({ text: "" }).eq("id", c.id)
                          }
                        }}
                        maxLength={150}
                        style={{ ...inputStyle, fontSize: 17, padding: "12px 16px", flex: 1, width: "auto" }}
                      />
                      <button
                        onClick={async () => {
                          await supabase.from("clues").delete().eq("id", c.id)
                          await refreshMyClues(me.id)
                        }}
                        style={{ background: "white", color: RED, fontSize: 20, fontWeight: 900, padding: "10px 14px", flexShrink: 0, lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                {gameSettings.max_clues_per_player !== null && myClues.length >= gameSettings.max_clues_per_player ? (
                  <p style={{ fontSize: 14, opacity: 0.65, fontWeight: 600, marginTop: 12 }}>
                    Maximum of {gameSettings.max_clues_per_player} clues reached.
                  </p>
                ) : (
                  <AddClueForm
                    code={code}
                    playerId={me.id}
                    disabled={false}
                    onAdded={async () => await refreshMyClues(me.id)}
                    playerNames={players.filter(p => p.id !== me.id).map(p => p.first_name || p.name)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>

      {canStartGame && (
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
            style={{ background: "#0C47E9", width: "100%", maxWidth: 400, padding: "28px 24px" }}
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
                    background: "#2357E7",
                    fontSize: 15, fontWeight: 900, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: WARM_LIGHT,
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                      {p.name}
                      {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, fontWeight: 600, marginLeft: 6 }}>you</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmingStart(false)}
                style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 17, fontWeight: 800, padding: "16px" }}
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
    </>
  )
}
