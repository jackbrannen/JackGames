"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const BG         = "#004F45"
const YELLOW     = "#FBDF54"
const DARK       = "#003638"   // H=182° (+10°), B=22%
const MID        = "#00423f"   // H=177° (+5°),  B=26%
const WARM_LIGHT = "#006648"   // H=162° (-10°), B=40%

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
]

function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code.slice(0, Math.ceil(code.length / 2)), code.slice(Math.ceil(code.length / 2))]
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

// Generate a random derangement of arr (no element stays in its original position)
// Generate personal mode word assignments.
// Returns { [writerId]: { [recipientId]: count } }
// Each writer contributes exactly 5 words total; each player receives exactly 5 words.
// Uses cyclic shifts to spread assignments as evenly as possible:
//   4 players → [2,2,1] per writer, 5 players → [2,1,1,1], 6+ players → [1,1,1,1,1]
function generateWordAssignments(playerIds) {
  const n = playerIds.length
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5)

  const result = {}
  for (const id of shuffled) result[id] = {}

  for (let r = 0; r < 5; r++) {
    const shift = (r % (n - 1)) + 1
    for (let i = 0; i < n; i++) {
      const writerId = shuffled[i]
      const recipientId = shuffled[(i + shift) % n]
      result[writerId][recipientId] = (result[writerId][recipientId] || 0) + 1
    }
  }
  return result
}

const inputStyle = {
  background: WARM_LIGHT,
  color: "white",
  fontSize: 20,
  padding: "16px 18px",
  width: "100%",
  display: "block",
}

const THEME_OPTIONS = [
  { value: "random", label: "Random" },
  { value: "good", label: "Good" },
  { value: "bad", label: "Bad" },
]

const DIST_OPTIONS = [
  { value: "random", label: "Random" },
  { value: "personal", label: "Personal" },
]

function SettingsOverlay({ game, code, me, onClose }) {
  const [theme, setTheme] = useState(game?.theme ?? "random")
  const [dist, setDist] = useState(game?.word_distribution ?? "random")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!me || saving) return
    setSaving(true)
    await supabase.from("ftw_games").update({ theme, word_distribution: dist }).eq("code", code)
    setSaving(false)
    onClose()
  }

  function PickerRow({ label, options, value, onChange, description }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 4 }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.65)", marginBottom: 12, lineHeight: 1.4 }}>
            {description}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                padding: "14px 8px",
                fontSize: 16,
                fontWeight: 800,
                background: value === opt.value ? YELLOW : WARM_LIGHT,
                color: value === opt.value ? "#000" : "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {label === "Word Distribution" && dist === "personal" && (
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginTop: 8, lineHeight: 1.4 }}>
            Each player writes words that go to specific other players, who will rank them.
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        zIndex: 100, paddingTop: 60,
      }}
    >
      <div style={{ background: DARK, width: "100%", maxWidth: 420, padding: "28px 24px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 24 }}>
          Game Settings
        </div>
        <PickerRow
          label="Theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={setTheme}
          description="What kinds of words should people write?"
        />
        <PickerRow
          label="Word Distribution"
          options={DIST_OPTIONS}
          value={dist}
          onChange={setDist}
          description="Should words be written blind, or should you know who you're writing them for?"
        />
        <button
          onClick={save}
          disabled={saving}
          style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block", border: "none", cursor: "pointer", marginTop: 8 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}

export default function Lobby({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [optWrite, setOptWrite] = useState(true)
  const [optRank, setOptRank] = useState(true)
  const [optGuess, setOptGuess] = useState(true)

  const me = players.find(p => p.id === myPlayerId)
  const sortedPlayers = [...players].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // Opt-out participation counts — include the joining player's local choices for live preview
  const dbWriters  = players.filter(p => !p.opt_out_write)
  const dbRankers  = players.filter(p => !p.opt_out_rank)
  const dbGuessers = players.filter(p => !p.opt_out_guess)
  const effWriterCount  = dbWriters.length  + (!me && optWrite  ? 1 : 0)
  const effRankerCount  = dbRankers.length  + (!me && optRank   ? 1 : 0)
  const effGuesserCount = dbGuessers.length + (!me && optGuess  ? 1 : 0)

  const wordsPerWriter = game?.word_distribution === "personal" ? 5
    : effWriterCount > 0 && effRankerCount > 0
      ? Math.max(5, Math.ceil(5 * effRankerCount / effWriterCount))
      : 5

  // Errors that block starting (only evaluated when 4+ players are in)
  const startErrors = players.length >= 4 ? [
    dbWriters.length  === 0 && "Everyone opted out of writing. At least one player must write clues.",
    dbRankers.length  === 0 && "Everyone opted out of ranking. At least one player must rank.",
    dbGuessers.length === 0 && "Everyone opted out of guessing. At least one player must guess.",
    dbWriters.length  === 1 && dbRankers.some(r => r.id === dbWriters[0].id) &&
      "The only writer is also a ranker — they'd have no words to rank. Have another player write clues, or have the sole writer opt out of ranking.",
  ].filter(Boolean) : []

  async function loadState() {
    const { data: gameData } = await supabase
      .from("ftw_games")
      .select("code,phase,theme,word_distribution")
      .eq("code", code)
      .single()

    if (!gameData) { setNotFound(true); return }

    const { data: playerData } = await supabase
      .from("ftw_players")
      .select("id,name,first_name,created_at,opt_out_write,opt_out_rank,opt_out_guess")
      .eq("game_code", code)
      .order("created_at", { ascending: true })

    setGame(gameData)
    setPlayers(playerData ?? [])
  }

  useEffect(() => {
    const existing = localStorage.getItem(`ftw:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  useEffect(() => {
    const saved = loadProfile()
    if (saved) {
      if (saved.username) saveProfile(saved)
      setSavedProfile(saved)
      setUsername(saved.username || "")
    }
  }, [])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "firsttoworst").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`ftw-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "ftw_games", filter: `code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (game?.phase && game.phase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [game?.phase, myPlayerId])

  async function join() {
    const trimmedUsername = username.trim()
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast = (savedProfile?.lastName || lastName).trim()
    if (!trimmedUsername || !trimmedFirst || !trimmedLast || joining) return
    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("ftw_players")
      .select("id")
      .eq("game_code", code)
      .ilike("name", trimmedUsername)
      .limit(1)

    if (existing?.length > 0) {
      setJoinError("That username is taken.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmedUsername }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("ftw_players")
      .insert({
        game_code: code,
        name: trimmedUsername,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        opt_out_write: !optWrite,
        opt_out_rank: !optRank,
        opt_out_guess: !optGuess,
      })
      .select("id")
      .single()

    if (error) { setJoinError("Failed to join."); setJoining(false); return }
    localStorage.setItem(`ftw:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    // Don't reset joining — the join form disappears when me is set, preventing a flash back to "Join"
  }

  async function startGame() {
    if (starting || !myPlayerId) return
    setStarting(true)
    setStartError("")

    const writerIds = players.filter(p => !p.opt_out_write).map(p => p.id)
    const rankerIds = players.filter(p => !p.opt_out_rank).map(p => p.id)

    let wordAssignments = null
    if (game?.word_distribution === "personal" && writerIds.length >= 2 && rankerIds.length >= 1) {
      wordAssignments = generateWordAssignments(writerIds.length >= 2 ? writerIds : players.map(p => p.id))
    }

    const { error } = await supabase.rpc("ftw_start_game", {
      p_code: code,
      p_host_id: myPlayerId,
      p_word_assignments: wordAssignments,
    })
    if (error) {
      console.error("ftw_start_game error:", error)
      const msg = error.message ?? ""
      const friendlyErrors = {
        all_opted_out_write:   "Everyone opted out of writing — at least one player must write clues.",
        all_opted_out_rank:    "Everyone opted out of ranking — at least one player must rank.",
        all_opted_out_guess:   "Everyone opted out of guessing — at least one player must guess.",
        sole_writer_also_ranker: "The only writer is also a ranker — they'd have nothing to rank. Have another player write, or have the writer opt out of ranking.",
      }
      setStartError(friendlyErrors[msg] ?? msg)
      setStarting(false)
    }
    // On success, stay in "Starting…" state until the phase change navigates us away
  }

  // Non-joined player visiting during an active game
  if (game && game.phase !== "lobby" && !myPlayerId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
          A game is in progress.
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, opacity: 0.65, marginBottom: 40, lineHeight: 1.5 }}>
          When this game ends, you'll be able to join the next one.
        </p>
        <button
          onClick={loadState}
          style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "18px 36px" }}
        >
          Join Lobby
        </button>
        <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginTop: 16 }}>
          This page will update automatically.
        </p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "white", fontSize: 22, fontWeight: 700 }}>Room not found.</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
    )
  }

  const [w1, w2] = splitCode(code)
  const canStart = players.length >= 4

  const themeLabel = game.theme === "good" ? "Good" : game.theme === "bad" ? "Bad" : "Random"
  const distLabel = game.word_distribution === "personal" ? "Personal" : "Random"

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: "white" }}>

      {settingsOpen && (
        <SettingsOverlay
          game={game}
          code={code}
          me={me}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Header */}
      <div style={{ padding: "28px 24px 24px", background: DARK, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
            First to Worst
          </div>
          <div style={{ fontSize: "clamp(18px, 6vw, 38px)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, whiteSpace: "nowrap" }}>
            <span style={{ color: YELLOW }}>{w1}</span>
            <span style={{ color: "rgba(255,255,255,0.75)" }}>{w2}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4, alignItems: "stretch" }}>
          <button
            onClick={async () => {
              const url = window.location.href
              if (navigator.share) await navigator.share({ title: `Join First to Worst — ${code}`, url })
              else { await navigator.clipboard.writeText(url); alert("Link copied!") }
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

      {/* Start CTA — any joined player */}
      {canStart && me && (
        <div style={{ padding: "20px 24px", background: startErrors.length > 0 ? DARK : YELLOW }}>
          {startErrors.length > 0 ? (
            <>
              {startErrors.map((err, i) => (
                <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#F87171", lineHeight: 1.4, marginBottom: i < startErrors.length - 1 ? 8 : 16 }}>
                  {err}
                </div>
              ))}
              <button
                disabled
                style={{ background: WARM_LIGHT, color: "white", fontSize: 24, fontWeight: 900, padding: "20px", width: "100%", display: "block" }}
              >
                Start Game
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#000", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
                All players in?
              </div>
              <button
                onClick={() => setConfirmingStart(true)}
                disabled={starting}
                style={{ background: "#000", color: YELLOW, fontSize: 24, fontWeight: 900, padding: "20px", width: "100%", display: "block" }}
              >
                {starting ? "Starting…" : "Start Game"}
              </button>
            </>
          )}
          {!!startError && (
            <p style={{ fontSize: 13, fontWeight: 700, color: "#F87171", marginTop: 8 }}>{startError}</p>
          )}
        </div>
      )}

      {/* Opt-out checkboxes — hidden for now, may restore later */}
      {false && !me && (
        <div style={{ padding: "24px 24px 0" }}>
          {[
            { key: "write", label: "Write clues for others", state: optWrite, set: setOptWrite },
            { key: "rank",  label: "Rank clues",             state: optRank,  set: setOptRank  },
            { key: "guess", label: "Guess others' rankings", state: optGuess, set: setOptGuess },
          ].map(({ key, label, state, set }) => (
            <div key={key}>
              <div
                onClick={() => set(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px",
                  background: state ? MID : DARK,
                  marginBottom: key === "write" ? 0 : 3,
                  cursor: "pointer",
                  userSelect: "none", WebkitUserSelect: "none",
                }}
              >
                <div style={{
                  width: 22, height: 22, flexShrink: 0,
                  background: state ? YELLOW : "transparent",
                  border: `2px solid ${state ? YELLOW : "rgba(255,255,255,0.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {state && <span style={{ fontSize: 13, fontWeight: 900, color: "#000", lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: state ? "white" : "rgba(255,255,255,0.45)" }}>
                  {label}
                </span>
              </div>
              {key === "write" && optWrite && (
                <div style={{ background: DARK, padding: "8px 16px 10px", marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                    {wordsPerWriter === 5
                      ? "You'll submit 5 clues."
                      : `You'll submit ${wordsPerWriter} clues — extra because fewer players are writing.`}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Join form */}
      {!me && (
        <div style={{ padding: "24px 24px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
            Join Game
          </div>
          {!savedProfile && (
            <>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
            </>
          )}
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && join()}
            placeholder="Display Name"
            maxLength={40}
            style={inputStyle}
          />
          <button
            onClick={join}
            disabled={!username.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
            style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "18px", width: "100%", marginTop: 8, display: "block" }}
          >
            {joining ? "Joining…" : "Join"}
          </button>
          {joinError && (
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F04F52", marginTop: 10 }}>
              {joinError}
            </div>
          )}
        </div>
      )}

      {/* Players section */}
      <div style={{ padding: "28px 24px 0" }}>

        {/* Settings row above players */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
            Players
          </div>
          {me && (
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                background: WARM_LIGHT,
                color: "rgba(255,255,255,0.85)",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                padding: "6px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>⚙</span>
              <span>{themeLabel} · {distLabel}</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {sortedPlayers.length === 0 && (
            <div style={{ fontSize: 15, opacity: 0.65, fontStyle: "italic", padding: "12px 0" }}>No players yet</div>
          )}
          {sortedPlayers.map((p, i) => (
            <div key={p.id} style={{ display: "flex" }}>
              <div style={{
                padding: "13px 0", minWidth: 48, flexShrink: 0,
                background: DARK,
                fontSize: 18, fontWeight: 900, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {i + 1}
              </div>
              <div style={{
                padding: "13px 16px", flex: 1,
                background: MID,
                display: "flex", alignItems: "center",
              }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {p.name}
                  {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {players.length < 4 && (
          <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600, marginTop: 10 }}>
            Minimum 4 players needed
          </p>
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
            style={{ background: DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: "white", opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {sortedPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: MID,
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
                      {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
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
    </div>
  )
}
