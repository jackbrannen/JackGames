"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { randomCode } from "../lib/words"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#974344"
const PRIMARY = "#974344"
const DARK    = "#803946"
const WARM    = "#AE5C4D"
const WARM_LIGHT = "#B85556"
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
  const code = randomCode()
  const { error: gameError } = await supabase
    .from("reversecharades_games")
    .insert({ code, turn_duration_seconds: 10, min_clues_per_player: 0, is_dummy: true })
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
  localStorage.setItem(`rc:${code}:isDummy`, "true")
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

  async function handleDummyClick() {
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
  }

  return (
    <HomeScreen
      title={<>Reverse<br />Charades</>}
      subtitle="The team gives clues, one person guesses"
      onCreate={onCreateClick}
      isCreating={creating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={() => { if (joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={handleDummyClick}
      isDummy={testCreating}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: YELLOW }}
    />
  )
}
