"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"
import { BG, WL, YELLOW } from "../components/styles"

const WORDS_A = [
  "COSMIC","EARTH","GALACTIC","LUNAR","MARTIAN","NEBULA","ORBIT","PLANET","QUASAR","ROCKET",
  "SOLAR","STELLAR","TRANSIT","UNIVERSE","VENUS","WARP","XENON","ZODIAC"
]

const WORDS_B = [
  "ALIEN","BEING","COSMOS","DWELLER","ENTITY","FRIEND","GUEST","HUMAN","INTEL","JOURNEY",
  "KEEPER","LANGUAGE","MESSAGE","NOMAD","ORIGIN","PROTOCOL","QUEST","RELAY","SIGNAL","TALK"
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
      .from("woe_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("woe_games")
      .insert({ code, is_dummy: isDummy, turn_duration_seconds: isDummy ? 30 : 90 })
      .select("code")
      .single()
    if (error) throw error
    return String(data.code).toUpperCase()
  }
  throw new Error("unable to allocate game code")
}

function HomeContent() {
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
      title={<>What On<br />Earth</>}
      subtitle="Alien Translation Game"
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

export default function Home() {
  return (
    <Suspense fallback={<div style={{ background: BG, minHeight: "100vh" }} />}>
      <HomeContent />
    </Suspense>
  )
}
