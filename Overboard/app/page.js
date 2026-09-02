"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"
import { BG, WL, ACCENT, ACCENT_TEXT } from "../components/theme"

// Water-themed room codes — two words, so they're easy to read aloud across a room.
const WORDS_A = [
  "DEEP", "OPEN", "COLD", "BLUE", "STILL", "SALT", "TIDAL", "LOST", "FAR", "DARK",
  "WILD", "CALM", "GLASS", "SILVER", "BROKEN", "HIDDEN", "DRIFT", "SUNKEN", "HIGH", "LOW",
]
const WORDS_B = [
  "WATER", "HARBOR", "CURRENT", "ANCHOR", "TRENCH", "REEF", "TIDE", "WAVE", "SHORE", "DEPTH",
  "LAGOON", "CHANNEL", "BASIN", "FATHOM", "UNDERTOW", "SHALLOWS", "BUOY", "KEEL", "WAKE", "SOUND",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame(isDummy = false) {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("ob_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue

    const { data, error: insertError } = await supabase
      .from("ob_games")
      .insert({ code, is_dummy: isDummy })
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

  async function create(isDummy = false) {
    if (isCreating) return
    setError("")
    setIsCreating(true)
    try {
      const code = await createGame(isDummy)
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
      title="Overboard"
      subtitle="Everyone writes a question. Nobody answers their own."
      onCreate={() => create(false)}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={() => create(true)}
      isDummy={isCreating}
      colors={{ bg: BG, wl: WL, yellow: ACCENT, createText: ACCENT_TEXT }}
    />
  )
}
