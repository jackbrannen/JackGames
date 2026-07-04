"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { pick25Words } from "../lib/words"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#C0B298"
const TAN = "#C4924A"
const RED = "#CC2222"
const BLUE = "#1E50B5"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#D4C8B0"

const WORDS_A = [
  "AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER",
  "KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ",
  "UMBRA","VORTEX","WALNUT","XENON","ZEPHYR",
]
const WORDS_B = [
  "ANCHOR","BASALT","COBALT","DUSK","ECLIPSE","FLINT","GRAVEL","HAZE","IRON","JADE",
  "KHAKI","LAVA","MOSS","NICKEL","OBSIDIAN","PEWTER","RUST","SLATE","TEAK","UMBER",
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
    const { count, error: checkError } = await supabase
      .from("codenames_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue
    const { data, error: insertError } = await supabase
      .from("codenames_games")
      .insert({ code })
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

  async function createDummyGame() {
    if (isCreating) return
    setError("")
    setIsCreating(true)
    try {
      const { supabase } = await import("../lib/supabase")
      const code = await createGame()

      // Insert 4 bots: 2 per team, 1 cluegiver per team
      const bots = [
        { name: "RedSpy",   team: "red",  is_cluegiver: true,  ready: true },
        { name: "RedAgent", team: "red",  is_cluegiver: false, ready: true },
        { name: "BlueSpy",  team: "blue", is_cluegiver: true,  ready: true },
        { name: "BlueAgent",team: "blue", is_cluegiver: false, ready: true },
      ]
      await supabase.from("codenames_players").insert(bots.map(b => ({ ...b, game_code: code })))

      // Join as "You" on red team (not cluegiver)
      const { data: meData } = await supabase
        .from("codenames_players")
        .insert({ game_code: code, name: "You", team: "red", is_cluegiver: false, ready: true })
        .select("id")
        .single()
      localStorage.setItem(`codenames:${code}:playerId`, meData.id)

      // Start the game
      const words = pick25Words([])
      await supabase.rpc("start_codenames_game", { p_code: code, p_words: words })

      router.push(`/${code}/play`)
    } catch (e) {
      setError(e?.message ?? "unknown error")
      setIsCreating(false)
    }
  }

  function onJoin() {
    const trimmed = joinCode.trim().toUpperCase()
    if (trimmed) router.push(`/${trimmed}`)
  }

  return (
    <HomeScreen
      title={<>Code<br />Names</>}
      subtitle="Two teams race to find their secret agents using one-word clues"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={createDummyGame}
      isDummy={isCreating}
      colors={{ bg: "#1A1008", wl: "#4A3015", yellow: TAN }}
    />
  )
}
