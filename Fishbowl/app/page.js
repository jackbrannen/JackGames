"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"

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
    <div style={{
      minHeight: "100dvh",
      background: "#3378FF",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(72px, 22vw, 120px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-4px",
        textTransform: "uppercase",
        lineHeight: 0.88,
        textAlign: "center",
        marginBottom: 20,
      }}>
        Fish<br />bowl
      </h1>

      <p style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: 14,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.18em",
        textAlign: "center",
        marginBottom: 64,
      }}>
        Party Guessing Game
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreateClick}
          disabled={isCreating}
          style={{
            background: "#FBDF54",
            color: "#000",
            fontSize: 22,
            fontWeight: 900,
            padding: "22px 40px",
            width: "100%",
            display: "block",
          }}
        >
          {isCreating ? "Creating…" : "Create Game"}
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter" && joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
            style={{
              flex: 1,
              background: WARM_LIGHT,
              border: "none",
              color: "white",
              fontSize: 18,
              fontWeight: 800,
              padding: "18px 16px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              outline: "none",
              minWidth: 0,
            }}
          />
          <button
            onClick={() => { if (joinCode.trim()) router.push(`/${joinCode.trim()}`) }}
            style={{
              background: WARM_LIGHT,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              padding: "18px 20px",
              flexShrink: 0,
              animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            Join
          </button>
        </div>
      </div>

      <button
        onClick={onDummyClick}
        disabled={isDummy}
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          fontSize: 11,
          fontWeight: 600,
          padding: "8px 16px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: "pointer",
        }}
      >
        {isDummy ? "Setting up…" : "Dummy Game"}
      </button>

      {!!errorMessage && (
        <p style={{
          color: "#FBDF54",
          marginTop: 20,
          fontSize: 15,
          textAlign: "center",
          fontWeight: 600,
        }}>
          Error: {errorMessage}
        </p>
      )}
    </div>
  )
}
