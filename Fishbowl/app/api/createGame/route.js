import { createClient } from "@supabase/supabase-js"



function randomCode() {
  const words = ["MAPLE", "RIVER", "STONE", "FOREST", "CLOUD", "BRIDGE", "SUNSET", "WINTER", "VALLEY", "HARBOR", "CRYSTAL", "THUNDER", "SILVER", "MARBLE", "GOLDEN", "MYSTIC", "DRAGON", "CROWN", "LANTERN", "PHOENIX", "VELVET", "SHADOW", "CASTLE", "PRISM", "EMBER", "RAVEN", "DESERT", "OCEAN", "ISLAND", "GARDEN"]
  return words[Math.floor(Math.random() * words.length)] + words[Math.floor(Math.random() * words.length)]
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  try {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const code = randomCode()
      const { count, error: checkError } = await supabase
        .from("games")
        .select("code", { count: "exact", head: true })
        .eq("code", code)
        .neq("phase", "finished")
      if (checkError) throw checkError
      if ((count ?? 0) > 0) continue

      const { data, error: insertError } = await supabase
        .from("games")
        .insert({ code })
        .select("code")
        .single()
      if (insertError) throw insertError
      return Response.json({ code: String(data.code).toUpperCase() }, {
        headers: { "Access-Control-Allow-Origin": "*" }
      })
    }
    throw new Error("unable_to_allocate_game_code")
  } catch (error) {
    return Response.json({ error: error?.message ?? "unknown" }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    })
  }
}
