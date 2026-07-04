"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

// Light theme
const BG = "#B7DAEE"
const INK = "#15314A"
const WL = "#6FA8CE"
const ACCENT = "#FFC857"

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
      .from("dc_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue
    const { error: insertError } = await supabase
      .from("dc_games")
      .insert({ code })
      .select("code")
      .single()
    if (insertError) throw insertError
    return code.toUpperCase()
  }
  throw new Error("unable_to_allocate_game_code")
}

export default function Home() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")

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
      // A dummy game is just a normal game flagged is_dummy. The lobby then
      // auto-joins known players (those with a saved profile) and the play page
      // pre-fills the encryptor's clue fields with the code digits. No bots.
      await supabase.from("dc_games").update({ is_dummy: true }).eq("code", code)
      router.push(`/${code}`)
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
      title="Decrypto"
      subtitle="Clue your team to keywords without the other team cracking it"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={createDummyGame}
      isDummy={isCreating}
      colors={{ bg: BG, wl: WL, yellow: ACCENT, text: INK }}
    />
  )
}
