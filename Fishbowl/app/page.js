"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
  "LLAMA","HORSE","MONKEY","RABBIT","BADGER","BEAVER","COYOTE","WOLF","FOX","MOOSE",
  "BISON","GIRAFFE","JAGUAR","COBRA","VIPER","GECKO","TURTLE","SEAL","SHARK","RAY",
  "NINJA","SAMURAI","KNIGHT","WIZARD","RANGER","SCOUT","CAPTAIN","DOCTOR","ARTIST","BAKER",
  "ENGINE","HAMMER","ANCHOR","COMPASS","RADAR","SATELLITE","CAMERA","GUITAR","PIANO","DRUM",
  "PLANET","GALAXY","NEBULA","ASTEROID","ECLIPSE","AURORA","HORIZON","SKYLINE"
]

const WORDS_B = [
  "TIGER","CASTLE","CANDLE","BRIDGE","ROCKET","MIRROR","LANTERN","POCKET","CARPET","PILOT",
  "HARBOR","ISLAND","VALLEY","FOREST","GARDEN","MEADOW","CANYON","RIVER","OCEAN","MOUNTAIN",
  "SUNRISE","MIDNIGHT","BREEZE","CLOUD","EMBER","SPARK","GLIMMER","SHADOW","FROST","FLAME",
  "SAPPHIRE","IVORY","MARBLE","COPPER","SILVER","CORAL","ORCHID","BLOSSOM","HONEY","COCOA",
  "LATTE","LEMON","MANGO","PEACH","PLUM","BERRY","OLIVE","BASIL","PEPPER","GINGER",
  "PANDA","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA","ZEBRA","LLAMA",
  "HORSE","MONKEY","RABBIT","BADGER","BEAVER","COYOTE","WOLF","FOX","MOOSE","BISON",
  "GIRAFFE","JAGUAR","COBRA","GECKO","TURTLE","SEAL","SHARK","RAY","NINJA","KNIGHT",
  "WIZARD","RANGER","SCOUT","CAPTAIN","DOCTOR","ARTIST","BAKER","ENGINE","HAMMER","ANCHOR",
  "COMPASS","RADAR","CAMERA","GUITAR","PIANO","DRUM","PLANET","GALAXY","NEBULA","ECLIPSE",
  "AURORA","HORIZON","SKYLINE","PARADE","CIRCUS","WONDER","VELVET","MAPLE"
]

const BG = "#3378FF"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#3399FF"

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

function randomPin() {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  const maxAttempts = 10

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const code = randomCode()
    const pin = randomPin()

    console.info(`[createGame] Attempt ${attempt}/${maxAttempts} with code ${code}`)

    const { count, error: checkError } = await supabase
      .from("games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")

    if (checkError) {
      console.error("[createGame] Failed checking code availability", { code, checkError })
      throw checkError
    }

    if ((count ?? 0) > 0) {
      console.warn(`[createGame] Code ${code} already exists, retrying`)
      continue
    }

    const { data, error: insertError } = await supabase
      .from("games")
      .insert({ code, admin_pin: pin })
      .select("code")
      .single()

    if (insertError) {
      console.error("[createGame] Insert failed", { code, insertError })
      throw insertError
    }

    if (!data?.code) {
      const missingCodeError = new Error("create_game_missing_code")
      console.error("[createGame] Insert succeeded but no code was returned", { code, data })
      throw missingCodeError
    }

    const createdCode = String(data.code).toUpperCase()
    console.info(`[createGame] Successfully created game ${createdCode}`)
    return createdCode
  }

  const exhaustedError = new Error("unable_to_allocate_game_code")
  console.error("[createGame] Exhausted all code generation attempts")
  throw exhaustedError
}

const DUMMY_CLUES_T1 = [
  "Elephant",
]

const DUMMY_CLUES_T2 = [
  "Harry Potter", "The Godfather", "Jurassic Park", "The Lion King", "Titanic",
  "Indiana Jones", "Star Wars", "Home Alone", "Forrest Gump", "The Matrix",
]

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

      await supabase.from("games").update({
        rounds_total: 1,
        turn_duration_seconds: 45,
        skip_limit: 1,
        skip_penalty: 0,
        min_clues_per_player: 1,
        max_clues_per_player: 6,
        is_demo: true,
      }).eq("code", code)

      router.push(`/${code}`)
    } catch (error) {
      setErrorMessage(error?.message ?? "unknown")
      setIsDummy(false)
    }
  }

  return (
    <HomeScreen
      title="Fishbowl"
      subtitle="Teams · Turns · Clues"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={() => { if (joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
      nudgeJoin={nudgeJoin}
      error={errorMessage}
      onDummyGame={onDummyClick}
      isDummy={isDummy}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: YELLOW }}
    />
  )
}
