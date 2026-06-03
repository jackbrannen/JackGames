import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function randomCode() {
  const words = ["MAPLE", "RIVER", "STONE", "FOREST", "CLOUD", "BRIDGE", "SUNSET", "WINTER", "VALLEY", "HARBOR", "CRYSTAL", "THUNDER", "SILVER", "MARBLE", "GOLDEN", "MYSTIC", "DRAGON", "CROWN", "LANTERN", "PHOENIX", "VELVET", "SHADOW", "CASTLE", "PRISM", "EMBER", "RAVEN", "DESERT", "OCEAN", "ISLAND", "GARDEN"]
  return words[Math.floor(Math.random() * words.length)] + words[Math.floor(Math.random() * words.length)]
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS(request) {
  return new Response(null, { headers: corsHeaders })
}

export async function POST(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      return NextResponse.json(
        { error: "Missing env vars" },
        { status: 500, headers: corsHeaders }
      )
    }

    const supabase = createClient(url, key)

    for (let attempt = 1; attempt <= 10; attempt++) {
      const code = randomCode()
      const { count, error: checkError } = await supabase
        .from("gow_games")
        .select("code", { count: "exact", head: true })
        .eq("code", code)
        .neq("phase", "finished")

      if (checkError) throw checkError
      if ((count ?? 0) > 0) continue

      const { data, error: insertError } = await supabase
        .from("gow_games")
        .insert({ code, rounds_total: 1 })
        .select("code")
        .single()

      if (insertError) throw insertError

      return NextResponse.json(
        { code: String(data.code).toUpperCase() },
        { headers: corsHeaders }
      )
    }

    throw new Error("unable_to_allocate_game_code")
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json(
      { error: error?.message ?? "unknown" },
      { status: 500, headers: corsHeaders }
    )
  }
}
