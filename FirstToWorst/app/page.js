"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"
import { useSubmitNudge } from "../lib/useSubmitNudge"

const BG = "#004F45"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#006648"

const WORDS_A = [
  "MAPLE","RIVER","OCEAN","SUNRISE","VELVET","COPPER","SILVER","EMBER","FOREST","CLOUD",
  "IVORY","SAPPHIRE","SPRING","SUMMER","WINTER","AUTUMN","MORNING","MIDNIGHT","ORCHID","LANTERN",
  "PINE","CEDAR","MEADOW","CANYON","HARBOR","ISLAND","VALLEY","MOUNTAIN","GARDEN","BREEZE",
  "COMET","ROCKET","MIRROR","CARPET","POCKET","BRIDGE","CANDLE","PILOT","CIRCUS","PARADE",
  "BLOSSOM","CORAL","PEBBLE","MARBLE","FROST","FLAME","SPARK","SHADOW","WONDER","GLIMMER",
]
const WORDS_B = [
  "CASTLE","CANDLE","BRIDGE","ROCKET","MIRROR","LANTERN","POCKET","CARPET","PILOT","HARBOR",
  "ISLAND","VALLEY","FOREST","GARDEN","MEADOW","CANYON","RIVER","OCEAN","MOUNTAIN","BREEZE",
  "CLOUD","EMBER","SPARK","GLIMMER","SHADOW","FROST","FLAME","SAPPHIRE","IVORY","MARBLE",
  "COPPER","SILVER","CORAL","ORCHID","BLOSSOM","HONEY","COCOA","LEMON","MANGO","PEACH",
  "PLUM","BERRY","PANDA","OTTER","EAGLE","FALCON","ROBIN","WHALE","DOLPHIN","KOALA",
]

const BOT_NAMES = ["Alex", "Jordan", "Riley"]
const BOT_WORDS = [
  ["traffic", "pizza", "taxes", "naps", "Mondays"],
  ["hiking", "meetings", "coffee", "rain", "weekends"],
  ["spam email", "dogs", "deadlines", "sushi", "mornings"],
]
const YOU_WORDS = ["tacos", "Zoom calls", "spiders", "payday", "dentist"]

function randomCode() {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]
  return `${a}${b}`
}

async function createGame() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    const { count } = await supabase
      .from("ftw_games")
      .select("code", { count: "exact", head: true })
      .eq("code", code)
      .neq("phase", "finished")
    if ((count ?? 0) > 0) continue
    const { data, error } = await supabase
      .from("ftw_games")
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

  async function onDummy() {
    if (creating) return
    setCreating(true)
    setError("")
    try {
      const code = await createGame()

      // Insert 3 bots + "You"
      const { data: allPlayers, error: playerErr } = await supabase
        .from("ftw_players")
        .insert([
          ...BOT_NAMES.map(name => ({ game_code: code, name, first_name: name, last_name: "", is_bot: true })),
          { game_code: code, name: "You", first_name: "You", last_name: "", is_bot: false },
        ])
        .select("id,name")
      if (playerErr) throw playerErr

      const youPlayer = allPlayers.find(p => p.name === "You")
      localStorage.setItem(`ftw:${code}:playerId`, youPlayer.id)

      // Start game
      const { error: startErr } = await supabase.rpc("ftw_start_game", {
        p_code: code,
        p_host_id: youPlayer.id,
        p_word_assignments: null,
      })
      if (startErr) throw startErr

      // Submit words for all players (last submission triggers word assignment + phase → ranking)
      const allWords = [...BOT_WORDS, YOU_WORDS]
      for (let i = 0; i < allPlayers.length; i++) {
        const { error: submitErr } = await supabase.rpc("ftw_submit_words", {
          p_code: code,
          p_player_id: allPlayers[i].id,
          p_words: allWords[i],
          p_for_player_ids: null,
        })
        if (submitErr) throw submitErr
      }

      // Fetch assigned word IDs (set by the last ftw_submit_words call)
      const { data: updatedPlayers, error: fetchErr } = await supabase
        .from("ftw_players")
        .select("id,assigned_word_ids")
        .eq("game_code", code)
      if (fetchErr) throw fetchErr

      // Lock rankings for all players with a random shuffle (last one triggers phase → guessing)
      for (const player of updatedPlayers) {
        if (!player.assigned_word_ids?.length) continue
        const shuffled = [...player.assigned_word_ids].sort(() => Math.random() - 0.5)
        const { error: lockErr } = await supabase.rpc("ftw_lock_ranking", {
          p_code: code,
          p_player_id: player.id,
          p_ranking: shuffled,
        })
        if (lockErr) throw lockErr
      }

      router.push(`/${code}/play`)
    } catch (e) {
      setError(e?.message ?? "Unknown error")
      setCreating(false)
    }
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
        fontSize: "clamp(52px, 15vw, 96px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-2px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 12,
      }}>
        First to<br />Worst
      </h1>

      <p style={{
        color: "rgba(255,255,255,0.65)",
        fontSize: 14,
        fontWeight: 700,
        textAlign: "center",
        marginBottom: 56,
        letterSpacing: "0.1em",
      }}>
        How well do you know your friends?
      </p>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            background: YELLOW,
            color: "#000",
            fontSize: 22,
            fontWeight: 900,
            padding: "22px 40px",
            width: "100%",
            display: "block",
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
              flex: 1,
              minWidth: 0,
              background: WARM_LIGHT,
              color: "white",
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

      {!!error && (
        <p style={{ color: YELLOW, marginTop: 20, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
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
