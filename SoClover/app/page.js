"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG         = "#6B8C2A"
const COOL_DARK  = "#4C7523"
const WARM_LIGHT = "#90A331"
const ACCENT     = "#FBDF54"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SPRING","SUMMER","WINTER","AUTUMN","MORNING","ORCHID","LANTERN","PINE",
  "CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","MIRROR","BRIDGE","CANDLE","CIRCUS","BLOSSOM","CORAL","PEBBLE","MARBLE",
  "FROST","FLAME","SPARK","SHADOW","WONDER","HONEY","BUTTER","LEMON","MANGO","PLUM",
  "PEACH","BERRY","OLIVE","BASIL","PEPPER","GINGER","PANDA","EAGLE","FALCON","ROBIN",
  "WHALE","DOLPHIN","KOALA","ZEBRA","CLOVER","FERN","ACORN","MOSS","THISTLE","BRIAR",
]
const WORDS_B = [
  "CLOVER","FERN","ACORN","MAPLE","BROOK","GROVE","LEAF","HEATH","THICKET","GLEN",
  "WILLOW","BIRCH","ELDER","HAZEL","HEATHER","SORREL","CLOVE","SAGE","THYME","REED",
  "MARSH","VALE","KNOLL","RIDGE","HOLLOW","BRAMBLE","NETTLE","LICHEN","SEDGE","RUSH",
  "LARKSPUR","YARROW","TANSY","FOXGLOVE","SPURGE","DOCK","SPURGE","PENNYWORT","WORT",
  "NIGHTSHADE","BINDWEED","CREEPER","BRIER","BRIAR","THORN","SPIKE","BURR","CHAFF",
]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("soclover_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("soclover_games")
      .insert({ code })
      .select("code")
      .single()
    if (error) throw error
    return data.code.toUpperCase()
  }
  throw new Error("Could not generate a unique game code")
}


export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")


  useEffect(() => {
    const fromGame = searchParams.get("fromGame")
    const pickerName = searchParams.get("pickerName")

    if (fromGame && pickerName) {
      setCreating(true)
      createGame()
        .then(code => router.push(`/${code}`))
        .catch(e => {
          setError(e?.message ?? "Failed to create game")
          setCreating(false)
        })
    }
  }, [searchParams, router])
  async function onCreate() {
    if (creating) return
    setError("")
    setCreating(true)
    try {
      const code = await createGame()
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "Unknown error")
      setCreating(false)
    }
  }

  async function onDummy() {
    if (creating) return
    setError("")
    setCreating(true)
    try {
      const code = await createGame()
      localStorage.setItem(`soclover:${code}:isDummy`, "true")
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "Unknown error")
      setCreating(false)
    }
  }

  function onJoin() {
    const code = joinCode.trim().toUpperCase()
    if (code) router.push(`/${code}`)
  }

  return (
    <HomeScreen
      title={<>So<br />Clover</>}
      subtitle="Keyword · Clues · Guessing"
      onCreate={onCreate}
      isCreating={creating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onDummy}
      isDummy={creating}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: ACCENT }}
    />
  )
}
