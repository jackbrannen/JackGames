"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const BG = "#0F1923"
const GOLD = "#C9A84C"
const TEXT = "#E8DCC8"
const WARM_LIGHT = "#19303B"

const WORDS_A = ["AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER","KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ"]
const WORDS_B = ["ANCHOR","BASALT","COBALT","DUSK","ECLIPSE","FLINT","GRAVEL","HAZE","IRON","JADE","KHAKI","LAVA","MOSS","NICKEL","OBSIDIAN","PEWTER","RUST","SLATE","TEAK","UMBER"]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame() {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const { data, error } = await supabase
      .from("avalon_games")
      .insert({ code })
      .select("code")
      .single()
    if (!error && data) return data.code
    // If duplicate key error, try again with new code
    if (error?.code === "23505") continue
    // Other error, throw it
    if (error) throw error
  }
  throw new Error("Could not allocate game code")
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
  async function onCreate() {
    if (creating) return
    setCreating(true)
    setError("")
    try {
      const code = await createGame()
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "Unknown error")
      setCreating(false)
    }
  }

  function onJoin() {
    const t = joinCode.trim().toUpperCase()
    if (t) router.push(`/${t}`)
  }

  return (
    <HomeScreen
      title="Avalon"
      subtitle="Find the traitors before they sabotage the quests"
      onCreate={onCreate}
      isCreating={creating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onCreate}
      isDummy={creating}
      colors={{ bg: BG, wl: WARM_LIGHT, yellow: GOLD }}
    />
  )
}
