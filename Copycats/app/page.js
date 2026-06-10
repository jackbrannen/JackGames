"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"
import { supabase } from "../lib/supabase"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "HONEY","BUTTER","COOKIE","WAFFLE","MUFFIN","BAGEL","COCOA","LATTE","LEMON","MANGO",
  "PLUM","PEACH","BERRY","OLIVE","BASIL","PEPPER","GINGER","SUGAR","SALMON","TURKEY",
  "PANDA","TIGER","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA",
]

const WORDS_B = [
  "CASTLE","CANDLE","BRIDGE","ROCKET","MIRROR","LANTERN","POCKET","CARPET","PILOT","HARBOR",
  "ISLAND","VALLEY","FOREST","GARDEN","MEADOW","CANYON","RIVER","OCEAN","MOUNTAIN","BREEZE",
  "CLOUD","EMBER","SPARK","GLIMMER","SHADOW","FROST","FLAME","SAPPHIRE","IVORY","MARBLE",
  "COPPER","SILVER","CORAL","ORCHID","BLOSSOM","HONEY","COCOA","LATTE","LEMON","MANGO",
  "PEACH","PLUM","BERRY","OLIVE","BASIL","PEPPER","PANDA","OTTER","EAGLE","FALCON",
  "ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA","NINJA","KNIGHT","WIZARD","RANGER","SCOUT",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame(isDummy = false) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("cc_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) return { error: checkError.message || "Failed to check game code" }
    if ((count ?? 0) > 0) continue

    const { data, error: insertError } = await supabase
      .from("cc_games")
      .insert({ code, is_dummy: isDummy })
      .select("code")
      .single()
    if (insertError) return { error: insertError.message || "Failed to create game" }
    return { code: String(data.code).toUpperCase() }
  }
  return { error: "unable_to_allocate_game_code" }
}

export default function Home() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")

  async function onCreateClick(isDummy = false) {
    if (isCreating) return
    setError("")
    setIsCreating(true)
    const result = await createGame(isDummy)
    if (result.error) {
      console.error('[Copycats] Create game error:', result.error)
      setError(result.error)
      setIsCreating(false)
    } else {
      router.push(`/${result.code}`)
    }
  }

  function onJoin() {
    const trimmed = joinCode.trim()
    if (trimmed) router.push(`/${trimmed}`)
  }

  return (
    <HomeScreen
      title="Copycats"
      subtitle="Answer as another player."
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={() => onCreateClick(true)}
      isDummy={isCreating}
      colors={{ bg: "#5C2D8C", wl: "#7A3AAA", yellow: "#FBDF54" }}
    />
  )
}
