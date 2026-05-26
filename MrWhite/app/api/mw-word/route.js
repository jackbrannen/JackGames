import { createClient } from "@supabase/supabase-js"

export async function POST(req) {
  const { code, playerId } = await req.json()
  if (!code || !playerId) return Response.json({ error: "missing params" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { data: game } = await supabase
      .from("mrwhite_games")
      .select("phase, correct_word, impostor_word, mr_white_id, eliminated_player_id")
      .eq("code", code)
      .single()

    if (!game?.correct_word) return Response.json({ word: null })

    const word = playerId === game.mr_white_id ? game.impostor_word : game.correct_word

    let eliminatedWasMrWhite = null
    if (game.phase === "reveal" || game.phase === "finished") {
      eliminatedWasMrWhite = game.eliminated_player_id === game.mr_white_id
    }

    let revealData = null
    if (game.phase === "finished") {
      const { data: mrWhitePlayer } = await supabase
        .from("mrwhite_players")
        .select("name")
        .eq("id", game.mr_white_id)
        .single()

      revealData = {
        correctWord: game.correct_word,
        impostorWord: game.impostor_word,
        mrWhiteName: mrWhitePlayer?.name ?? "Unknown",
      }
    }

    return Response.json({ word, eliminatedWasMrWhite, revealData })
  } catch (e) {
    console.error("mw-word error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
