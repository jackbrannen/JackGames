"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG         = "#5C2D8C"
const YELLOW     = "#FBDF54"
const WARM_LIGHT = "#7A3AAA"

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

const BOT_NAMES = ["Alex", "Jordan", "Riley", "Sam"]
const BOT_QUESTIONS = [
  "What's your go-to order when you can't decide what to eat?",
  "What's a skill you pretend to have but actually don't?",
  "What's the last thing you searched on your phone?",
  "What's something you do when no one is watching?",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame(isDummy = false) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("cc_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("cc_games")
      .insert({ code, is_dummy: isDummy })
      .select("code")
      .single()
    if (error) throw error
    return String(data.code).toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
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
      setCreating(true)
      createGame()
        .then(code => router.push(`/${code}`))
        .catch(e => {
          setError(e?.message ?? "Failed to create game")
          setCreating(false)
        })
    }
  }, [])
  async function onCreate(isDummy = false) {
    if (creating) return
    setCreating(true)
    setError("")
    try {
      const code = await createGame(isDummy)
      router.push(`/${code}`)
    } catch (e) {
      console.error("onCreate error:", e)
      setError(e?.message ?? String(e) ?? "Unknown error")
      setCreating(false)
    }
  }

  function onJoin() {
    const t = joinCode.trim().toUpperCase()
    if (t) router.push(`/${t}`)
  }

  async function onDummy() {
    onCreate(true)
  }

  return (
    <HomeScreen
      title="Copycats"
      subtitle="Answer as another player."
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
