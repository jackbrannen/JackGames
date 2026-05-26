"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { pick25Words } from "../lib/words"
import { useSubmitNudge } from "../lib/useSubmitNudge"

const BG = "#C0B298"
const TAN = "#C4924A"
const RED = "#CC2222"
const BLUE = "#1E50B5"

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
    <div style={{
      minHeight: "100dvh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(48px, 14vw, 88px)",
        fontWeight: 900,
        color: "#1A1008",
        letterSpacing: "-2px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 12,
      }}>
        Code<br />Names
      </h1>

      <p style={{
        color: "rgba(0,0,0,0.4)",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        marginBottom: 56,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        4+ Players
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreateClick}
          disabled={isCreating}
          style={{
            background: TAN,
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
            onKeyDown={e => { if (e.key === "Enter") onJoin() }}
            style={{
              flex: 1,
              minWidth: 0,
              background: "rgba(0,0,0,0.1)",
              color: "#1A1008",
              fontSize: 18,
              fontWeight: 800,
              padding: "18px 16px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          />
          <button
            onClick={onJoin}
            style={{
              background: "rgba(0,0,0,0.1)",
              color: "#1A1008",
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

      {!!error && (
        <p style={{ color: TAN, marginTop: 20, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
          Error: {error}
        </p>
      )}

      <button
        onClick={createDummyGame}
        disabled={isCreating}
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.35)",
          fontSize: 11, fontWeight: 700, padding: "8px 16px",
          letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap",
        }}
      >
        Dummy Game
      </button>
    </div>
  )
}
