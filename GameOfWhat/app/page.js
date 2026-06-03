"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

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

async function createGame() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("gow_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue

    const { data, error: insertError } = await supabase
      .from("gow_games")
      .insert({ code, rounds_total: 1 })
      .select("code")
      .single()
    if (insertError) throw insertError
    return String(data.code).toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
}

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCreating, setIsCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")

  useEffect(() => {
    const fromGame = searchParams.get("fromGame")
    const pickerName = searchParams.get("pickerName")

    if (fromGame && pickerName) {
      // Auto-create game and navigate to lobby
      setIsCreating(true)
      createGame()
        .then(code => router.push(`/${code}`))
        .catch(e => {
          setError(e?.message ?? "Failed to create game")
          setIsCreating(false)
        })
    }
  }, [searchParams, router])

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
      title={<>The Game<br />of What</>}
      subtitle="Questions · Answers · Votes"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onCreateClick}
      isDummy={isCreating}
      colors={{ bg: "#6B1A44", wl: "#821F42", yellow: "#FBDF54" }}
    />
  )
}
