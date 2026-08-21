import { createClient } from "@supabase/supabase-js"

export async function POST(req) {
  const { code, playerId } = await req.json()
  if (!code || !playerId) return Response.json({ error: "missing params" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Confirm playerId actually belongs to this game before deciding what to return —
    // otherwise a player id scraped off the public realtime feed could be passed off as
    // the clue-giver's id and used to fish for the secret.
    const { data: playerRow } = await supabase
      .from("hv_players")
      .select("id")
      .eq("id", playerId)
      .eq("game_code", code)
      .single()
    if (!playerRow) return Response.json({ correctCardSlug: null })

    const { data: game } = await supabase
      .from("hv_games")
      .select("clue_giver_id, turn_started_at, turn_duration_seconds")
      .eq("code", code)
      .single()
    if (!game) return Response.json({ correctCardSlug: null })

    // Reveal to the clue-giver at any time (that's the live gameplay hint), and to
    // everyone else only once the turn's timer has actually expired server-side — that's
    // what powers the Time's Up recap's "card nobody got to guess" row for non-clue-givers.
    // Computed here rather than trusting a client-sent "time's up" flag, same reasoning as
    // hv_end_turn's own server-side expiry check: a client's clock/derived state is never
    // trusted for anything that gates revealing a secret.
    const isClueGiver = playerId === game.clue_giver_id
    const turnExpired =
      !!game.turn_started_at &&
      Date.now() >= new Date(game.turn_started_at).getTime() + game.turn_duration_seconds * 1000
    if (!isClueGiver && !turnExpired) return Response.json({ correctCardSlug: null })

    const { data: secret } = await supabase
      .from("hv_secrets")
      .select("correct_card_slug")
      .eq("game_code", code)
      .single()

    return Response.json({ correctCardSlug: secret?.correct_card_slug ?? null })
  } catch (e) {
    console.error("hv-secret error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
