"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"

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
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("avalon_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("avalon_games")
      .insert({ code })
      .select("code")
      .single()
    if (error) throw error
    return data.code
  }
  throw new Error("Could not allocate game code")
}

export default function Home() {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState("")
  const nudgeJoin = useSubmitNudge(joinCode, false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

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
    <div style={{
      minHeight: "100dvh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(56px, 16vw, 96px)", fontWeight: 900,
        color: GOLD, letterSpacing: "-2px", lineHeight: 0.9,
        textAlign: "center", marginBottom: 12,
      }}>
        Avalon
      </h1>
      <p style={{
        color: "rgba(232,220,200,0.4)", fontSize: 13, fontWeight: 700,
        textAlign: "center", marginBottom: 56,
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        5–10 Players
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            background: GOLD, color: "#000",
            fontSize: 22, fontWeight: 900,
            padding: "22px 40px", width: "100%", display: "block",
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
            onKeyDown={e => e.key === "Enter" && onJoin()}
            style={{
              flex: 1, minWidth: 0,
              background: WARM_LIGHT, color: TEXT,
              fontSize: 18, fontWeight: 800,
              padding: "18px 16px",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}
          />
          <button
            onClick={onJoin}
            style={{
              background: WARM_LIGHT, color: TEXT,
              fontSize: 18, fontWeight: 900, padding: "18px 20px", flexShrink: 0,
              animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            Join
          </button>
        </div>
      </div>

      {!!error && (
        <p style={{ color: GOLD, marginTop: 20, fontSize: 14, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <button
        onClick={onCreate}
        disabled={creating}
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: WARM_LIGHT, color: "rgba(232,220,200,0.5)",
          fontSize: 11, fontWeight: 700, padding: "8px 16px",
          letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap",
        }}
      >
        {creating ? "Setting up…" : "Dummy Game"}
      </button>
    </div>
  )
}
