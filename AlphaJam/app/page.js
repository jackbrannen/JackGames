"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#FF865A"
const WL = "#FF9166"
const YELLOW = "#FBDF54"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
  "PANDA","TIGER","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA",
]

const WORDS_B = [
  "CASTLE","ROCKET","MIRROR","LANTERN","HARBOR","ISLAND","VALLEY","FOREST","GARDEN","MEADOW",
  "CANYON","RIVER","OCEAN","MOUNTAIN","BREEZE","CLOUD","EMBER","SPARK","GLIMMER","SHADOW",
  "FROST","FLAME","SAPPHIRE","IVORY","MARBLE","COPPER","SILVER","CORAL","ORCHID","HONEY",
  "COCOA","LEMON","MANGO","PEACH","BERRY","OLIVE","PANDA","OTTER","EAGLE","FALCON",
  "ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA","NINJA","KNIGHT","WIZARD","RANGER","SCOUT",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame(isDummy) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("alphajam_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("alphajam_games")
      .insert({ code, is_dummy: isDummy })
      .select("code")
      .single()
    if (error) throw error
    return String(data.code).toUpperCase()
  }
  throw new Error("unable to allocate game code")
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
      setIsCreating(true)
      createGame(false)
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
      const code = await createGame(false)
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "unknown error")
      setIsCreating(false)
    }
  }

  async function onDummyClick() {
    if (isCreating) return
    setError("")
    setIsCreating(true)
    try {
      const code = await createGame(true)
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
      title={<>Alpha<br />Jam</>}
      subtitle="Word race tournament"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onDummyClick}
      isDummy={isCreating}
      colors={{ bg: BG, wl: WL, yellow: YELLOW }}
    />
  )
}
