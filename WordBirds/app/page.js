"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"
import HomeScreen from "../components/HomeScreen"

const WORDS_A = [
  "ROBIN","SPARROW","FALCON","PARROT","TOUCAN","MAGPIE","HERON","CONDOR","OSPREY","PUFFIN",
  "RAVEN","SWALLOW","STARLING","PELICAN","KESTREL","ORIOLE","THRUSH","WARBLER","PHOENIX","EAGLE",
]
const WORDS_B = [
  "WHISTLE","FEATHER","BRANCH","NEST","MEADOW","THICKET","CANYON","HARBOR","PRAIRIE","ORCHARD",
  "MARSH","TREETOP","HOLLOW","GARDEN","VALLEY","RIDGE","GROVE","SHORELINE","CLIFFSIDE","WOODLAND",
]

const BG = "#FEE471"
const INK = "#221A12"
const WARM = "#FFFFFF"

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame(isDummy = false) {
  const { supabase } = await import("../lib/supabase")
  for (let attempt = 1; attempt <= 10; attempt++) {
    const code = randomCode()
    const { count, error: checkError } = await supabase
      .from("wb_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if (checkError) throw checkError
    if ((count ?? 0) > 0) continue

    const { data, error: insertError } = await supabase
      .from("wb_games")
      .insert({ code, is_dummy: isDummy })
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
  const [isCreatingDummy, setIsCreatingDummy] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [error, setError] = useState("")

  async function create(isDummy = false) {
    if (isCreating || isCreatingDummy) return
    setError("")
    if (isDummy) setIsCreatingDummy(true); else setIsCreating(true)
    try {
      const code = await createGame(isDummy)
      router.push(`/${code}`)
    } catch (e) {
      setError(e?.message ?? "unknown error")
      if (isDummy) setIsCreatingDummy(false); else setIsCreating(false)
    }
  }

  function onJoin() {
    const trimmed = joinCode.trim()
    if (trimmed) router.push(`/${trimmed}`)
  }

  return (
    <HomeScreen
      title={<>Word<br />Birds</>}
      subtitle="Shout a word using every card on the table"
      onCreate={() => create(false)}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={() => create(true)}
      isDummy={isCreatingDummy}
      colors={{ bg: BG, wl: WARM, yellow: INK, text: INK, createText: "#FFF8ED", muted: "rgba(34,26,18,0.6)" }}
    />
  )
}
