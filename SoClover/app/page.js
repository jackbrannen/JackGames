"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSubmitNudge } from "../lib/useSubmitNudge"

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
    <div style={{
      minHeight: "100dvh", background: BG,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>🍀</div>
      <h1 style={{
        fontSize: "clamp(44px, 14vw, 80px)", fontWeight: 900, color: "white",
        letterSpacing: "-2px", lineHeight: 0.95, textAlign: "center", marginBottom: 8,
      }}>
        So Clover
      </h1>
      <p style={{
        color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 700,
        textAlign: "center", marginBottom: 52, letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        Cooperative word game
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            background: ACCENT, color: "#000", fontSize: 22, fontWeight: 900,
            padding: "22px 40px", width: "100%",
          }}
        >
          {creating ? "Creating…" : "Create Game"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") onJoin() }}
            style={{
              flex: 1, minWidth: 0, background: WARM_LIGHT, color: "white",
              fontSize: 18, fontWeight: 800, padding: "18px 16px", textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          />
          <button
            onClick={onJoin}
            style={{ background: WARM_LIGHT, color: "white", fontSize: 18, fontWeight: 900, padding: "18px 20px", animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none" }}
          >
            Join
          </button>
        </div>
      </div>

      {!!error && (
        <p style={{ color: ACCENT, marginTop: 20, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
          {error}
        </p>
      )}

      <button
        onClick={onDummy}
        disabled={creating}
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: WARM_LIGHT, color: "rgba(255,255,255,0.65)",
          fontSize: 11, fontWeight: 700, padding: "8px 16px",
          letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap",
        }}
      >
        {creating ? "Setting up…" : "Dummy Game"}
      </button>
    </div>
  )
}
