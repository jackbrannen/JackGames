"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#307977"
const ACCENT = "#F5E8D8"
const WARM_LIGHT = "#3A9180"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
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
const BOT_NAMES = ["Raccoon", "Flamingo", "Capybara", "Narwhal"]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function ensurePromptBank() {
  const { supabase } = await import("../lib/supabase")
  const { count } = await supabase
    .from("drawful_prompts")
    .select("id", { count: "exact", head: true })
    .is("used_at", null)
  if ((count ?? 0) < 10) {
    await fetch("/api/generate-prompts", { method: "POST" })
  }
}

async function createGame(isDummy = false) {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("drawful_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("drawful_games")
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
  const searchParams = useSearchParams()
  const [isCreating, setIsCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [error, setError] = useState("")


  useEffect(() => {
    const fromGame = searchParams.get("fromGame")
    const pickerName = searchParams.get("pickerName")

    if (fromGame && pickerName) {
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
      await ensurePromptBank()
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
      const { supabase } = await import("../lib/supabase")

      // Generate a unique code
      let code
      for (let i = 0; i < 10; i++) {
        const candidate = randomCode()
        const { count } = await supabase.from("drawful_games").select("code", { count: "exact", head: true }).eq("code", candidate).neq("phase", "finished")
        if ((count ?? 0) === 0) { code = candidate; break }
      }
      if (!code) throw new Error("Could not generate code")

      // Insert game in lobby phase for dummy game
      const { error: gameErr } = await supabase.from("drawful_games").insert({ code, is_dummy: true, phase: "lobby" })
      if (gameErr) throw gameErr

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
      title="Drawful"
      subtitle="Guess prompts based on the drawing"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={false}
      error={error}
      onDummyGame={onDummyClick}
      isDummy={isCreating}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: ACCENT }}
    />
  )
}
