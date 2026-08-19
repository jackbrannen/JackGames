"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#2434C4"
const DARK = "#2920AD"
const MID = "#2224B7"
const WARM_LIGHT = "#2858DB"
const YELLOW = "#FBDF54"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
]

const WORDS_B = [
  "TIGER","CASTLE","CANDLE","BRIDGE","ROCKET","MIRROR","LANTERN","POCKET","CARPET","PILOT",
  "HARBOR","ISLAND","VALLEY","FOREST","GARDEN","MEADOW","CANYON","RIVER","OCEAN","MOUNTAIN",
  "SUNRISE","MIDNIGHT","BREEZE","CLOUD","EMBER","SPARK","GLIMMER","SHADOW","FROST","FLAME",
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
    const { count } = await supabase
      .from("secretphrase_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("secretphrase_games")
      .insert({ code })
      .select("code")
      .single()
    if (error) throw error
    fetch("/api/generate-phrases", { method: "POST" }).catch(() => {})
    return String(data.code).toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
}

export default function Home() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isDummy, setIsDummy] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)

  async function onCreateClick() {
    if (isCreating) return
    setErrorMessage("")
    setIsCreating(true)
    try {
      const code = await createGame()
      router.push(`/${code}`)
    } catch (error) {
      setErrorMessage(error?.message ?? "unknown")
      setIsCreating(false)
    }
  }

  async function onDummyClick() {
    if (isDummy) return
    setErrorMessage("")
    setIsDummy(true)
    try {
      const { supabase } = await import("../lib/supabase")
      const code = await createGame()
      await supabase.from("secretphrase_games").update({ is_dummy: true }).eq("code", code)
      router.push(`/${code}`)
    } catch (error) {
      setErrorMessage(error?.message ?? "unknown")
      setIsDummy(false)
    }
  }

  return (
    <HomeScreen
      title="Secret Phrase"
      subtitle="Slip the secret phrase into your answer—the other team guesses it."
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={() => { if (joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
      nudgeJoin={nudgeJoin}
      error={errorMessage}
      onDummyGame={onDummyClick}
      isDummy={isDummy}
      colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW }}
    />
  )
}
