"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { randomCode } from "../lib/words"
import { useSubmitNudge } from "../lib/useSubmitNudge"

const PRIMARY = "#974344"
const DARK    = "#803946"
const WARM    = "#AE5C4D"
const YELLOW  = "#FBDF54"

const TEST_CLUES = [
  "Surfing", "Eating spaghetti", "A robot", "Swimming", "Playing guitar",
  "Brushing teeth", "Riding a horse", "Falling asleep", "Taking a selfie",
  "Juggling", "Rock climbing", "Fishing", "Dancing alone", "Weightlifting",
  "Texting while walking", "Opening a stuck jar", "Sneezing repeatedly",
  "Trying to parallel park", "Petting a very large dog", "Finding Waldo",
]

async function createTestGame() {
  const { supabase } = await import("../lib/supabase")
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { error: gameError } = await supabase
    .from("reversecharades_games")
    .insert({ code, turn_duration_seconds: 10, min_clues_per_player: 0 })
  if (gameError) throw gameError

  // Need one player row so clues have a valid submitted_by FK target
  const { data: hostData, error: hostError } = await supabase
    .from("reversecharades_players")
    .insert({ game_code: code, name: "You", first_name: "You", last_name: "", team: "A", ready: true })
    .select("id")
    .single()
  if (hostError) throw hostError

  await supabase.from("reversecharades_games").update({ host_id: hostData.id }).eq("code", code)

  const { error: clueError } = await supabase.from("reversecharades_clues").insert(
    TEST_CLUES.map(text => ({ game_code: code, text, submitted_by: hostData.id }))
  )
  if (clueError) throw clueError

  localStorage.setItem(`rc:${code}:playerId`, hostData.id)
  return code
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("reversecharades_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("reversecharades_games")
      .insert({ code })
      .select("code")
      .single()
    if (error) throw error
    return String(data.code).toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
}

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [creating, setCreating] = useState(false)
  const [testCreating, setTestCreating] = useState(false)
  const [error, setError] = useState("")


  useEffect(() => {
    const fromGame = searchParams.get("fromGame")
    const pickerName = searchParams.get("pickerName")

    if (fromGame && pickerName) {
      setCreating(true)
      createGame()
        .then(code => router.push(`/${code}`))
        .catch(e => {
          setError(e?.message ?? "Failed to create game")
          setCreating(false)
        })
    }
  }, [searchParams, router])
  async function onCreateClick() {
    if (creating) return
    setError("")
    setCreating(true)
    try {
      const code = await createGame()
      router.push(`/${code}`)
    } catch (e) {
      setError(e.message ?? "unknown error")
      setCreating(false)
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: PRIMARY,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(52px, 16vw, 96px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-3px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 16,
      }}>
        Reverse<br />Charades
      </h1>

      <p style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: 14,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        textAlign: "center",
        marginBottom: 64,
      }}>
        Party Acting Game
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreateClick}
          disabled={creating}
          style={{
            background: YELLOW,
            color: "#000",
            fontSize: 22,
            fontWeight: 900,
            padding: "22px 40px",
            width: "100%",
          }}
        >
          {creating ? "Creating…" : "Create Game"}
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter" && joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
            style={{
              flex: 1,
              background: WARM,
              color: "white",
              fontSize: 18,
              fontWeight: 800,
              padding: "18px 16px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              minWidth: 0,
            }}
          />
          <button
            onClick={() => { if (joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
            style={{
              background: WARM,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              padding: "18px 20px",
              flexShrink: 0,
              animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            Join
          </button>
        </div>

      </div>

      <button
        onClick={async () => {
          if (testCreating) return
          setError("")
          setTestCreating(true)
          try {
            const code = await createTestGame()
            router.push(`/${code}`)
          } catch (e) {
            setError(e.message ?? "unknown error")
            setTestCreating(false)
          }
        }}
        disabled={testCreating}
        style={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: DARK,
          color: "rgba(255,255,255,0.35)",
          fontSize: 11,
          fontWeight: 700,
          padding: "8px 16px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {testCreating ? "Setting up…" : "Dummy Game"}
      </button>

      {!!error && (
        <p style={{ color: YELLOW, marginTop: 20, fontSize: 15, textAlign: "center", fontWeight: 600 }}>
          Error: {error}
        </p>
      )}
    </div>
  )
}
