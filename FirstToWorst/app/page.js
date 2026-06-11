"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#004F45"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#006648"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
]
const WORDS_B = [
  "CASTLE","CANDLE","BRIDGE","ROCKET","MIRROR","LANTERN","POCKET","CARPET","PILOT","HARBOR",
  "ISLAND","VALLEY","FOREST","GARDEN","MEADOW","CANYON","RIVER","OCEAN","MOUNTAIN","BREEZE",
  "CLOUD","EMBER","SPARK","GLIMMER","SHADOW","FROST","FLAME","SAPPHIRE","IVORY","MARBLE",
  "COPPER","SILVER","CORAL","ORCHID","BLOSSOM","HONEY","COCOA","LEMON","MANGO","PEACH",
  "PLUM","BERRY","PANDA","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA",
]

const BOT_NAMES = ["Alex", "Jordan", "Riley"]
const BOT_WORDS = [
  ["traffic", "pizza", "taxes", "naps", "Mondays"],
  ["hiking", "meetings", "coffee", "rain", "weekends"],
  ["spam email", "dogs", "deadlines", "sushi", "mornings"],
]
const YOU_WORDS = ["tacos", "Zoom calls", "spiders", "payday", "dentist"]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("ftw_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) return null
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("ftw_games")
      .insert({ code })
      .select("code")
      .single()
    if (error) return null
    if (!data?.code) return null
    return data.code
  }
  return null
}

export default function Home() {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")


  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromGame = params.get("fromGame")
    const pickerName = params.get("pickerName")

    if (fromGame && pickerName) {
      setIsCreating(true)
      createGame()
        .then(code => router.push(`/${code}`))
        .catch(e => {
          setError(e?.message ?? "Failed to create game")
          setIsCreating(false)
        })
    }
  }, [])
  async function onCreate() {
    if (creating) return
    setCreating(true)
    setError("")
    const code = await createGame()
    if (code) {
      router.push(`/${code}`)
    } else {
      setError("Failed to create game")
      setCreating(false)
    }
  }

  function onJoin() {
    const t = joinCode.trim().toUpperCase()
    if (t) router.push(`/${t}`)
  }

  async function onDummy() {
    if (creating) return
    setCreating(true)
    setError("")
    const { supabase } = await import("../lib/supabase")
    const code = await createGame()
    if (!code) {
      setError("Failed to create game")
      setCreating(false)
      return
    }
    const { error: updateError } = await supabase.from("ftw_games").update({ is_demo: true }).eq("code", code)
    if (updateError) {
      setError("Failed to set dummy mode")
      setCreating(false)
      return
    }
    router.push(`/${code}`)
  }

  return (
    <HomeScreen
      title={<>First to<br />Worst</>}
      subtitle="Rank · Guess · Score"
      onCreate={onCreate}
      isCreating={creating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onDummy}
      isDummy={creating}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: YELLOW }}
    />
  )
}
