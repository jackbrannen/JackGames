"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const WORDS_A = [
  "MAPLE", "RIVER", "OCEAN", "SUNRISE", "VELVET", "COPPER", "SILVER", "EMBER", "FOREST", "CLOUD",
  "IVORY", "SAPPHIRE", "SPRING", "SUMMER", "WINTER", "AUTUMN", "MORNING", "MIDNIGHT", "ORCHID", "LANTERN",
]

const WORDS_B = [
  "CASTLE", "CANDLE", "BRIDGE", "ROCKET", "MIRROR", "LANTERN", "POCKET", "CARPET", "PILOT", "HARBOR",
  "ISLAND", "VALLEY", "FOREST", "GARDEN", "MEADOW", "CANYON", "RIVER", "OCEAN", "MOUNTAIN", "BREEZE",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("hv_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue

    const { data, error: insertError } = await supabase
      .from("hv_games")
      .insert({ code })
      .select("code")
      .single()
    if (insertError) throw insertError
    return String(data.code).toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
}

export default function Home() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")

  async function onCreateClick() {
    if (isCreating) return
    setError("")
    setIsCreating(true)
    try {
      const code = await createGame()
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "unknown error")
      setIsCreating(false)
    }
  }

  function onJoin() {
    const trimmed = joinCode.trim()
    if (trimmed) router.push(`/${trimmed}`)
  }

  return (
    <HomeScreen
      title={<>Hearing<br />Voices</>}
      subtitle="Say it like this"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onCreateClick}
      isDummy={isCreating}
      colors={{ bg: "#101014", wl: "hsl(220, 10%, 20%)", yellow: "#FBDF54" }}
    />
  )
}
