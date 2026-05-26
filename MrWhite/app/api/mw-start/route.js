import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

export async function POST(req) {
  const { code } = await req.json()
  if (!code) return Response.json({ error: "missing code" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const client = new Anthropic()

  const THEMES = [
    "sports and athletics",
    "food and cooking",
    "nature and the outdoors",
    "music and instruments",
    "transportation and vehicles",
    "animals",
    "furniture and household objects",
    "clothing and accessories",
    "science and technology",
    "art and creativity",
    "places and buildings",
    "health and the human body",
    "weather and seasons",
    "jobs and professions",
    "games and entertainment",
    "drinks and beverages",
    "tools and hardware",
    "plants and gardens",
    "emotions and feelings",
    "school and education",
  ]
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)]

  try {
    // Fetch recent word pairs to avoid reusing them
    const { data: recentGames } = await supabase
      .from("mrwhite_games")
      .select("correct_word, impostor_word")
      .not("correct_word", "is", null)
      .order("created_at", { ascending: false })
      .limit(30)
    const usedPairs = (recentGames ?? [])
      .filter(g => g.correct_word && g.impostor_word)
      .map(g => `${g.correct_word} / ${g.impostor_word}`)
    const exclusionNote = usedPairs.length > 0
      ? `\n\nDo NOT generate any of these recently used pairs (avoid the exact words and obvious synonyms):\n${usedPairs.join("\n")}`
      : ""

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: `You are a word pair generator for a social deduction party game called Mr. White.

Your job is to return exactly one word pair: a CORRECT word (given to most players) and an IMPOSTOR word (given to one player, who doesn't know their word is different).

Rules for a good pair:
- Both words must be concrete nouns. No verbs, adjectives, or abstract concepts.
- The two words should share a broad category so that early, vague clues are plausibly valid for both.
- They must diverge on specific physical or sensory properties — size, texture, shape, material, smell, sound, how you hold or use them — so that precise clues eventually expose the difference.
- The impostor must never be a synonym or near-identical concept. There must be real, guessable tension.
- Avoid pairs where one word is a strict subset of the other (e.g. "dog" / "puppy") — the impostor's clues will always seem valid.
- Avoid pairs so different that players narrow it down in one round.

Bad pair examples (do NOT generate these):
- Swimming / Running — verbs, not nouns
- Sofa / Couch — synonyms, no tension
- Cat / Dog — too different, obvious after one clue
- Sword / Shield — same era/context but no physical overlap in clues
- Flour / Sugar — nearly identical to describe physically

Good pair examples:
- Ocean / Lake (both large bodies of water, but scale, salinity, waves, and tides differ)
- Guitar / Violin (both string instruments, but how you hold, bow vs. pluck, and size differ)
- Prison / School (both institutions with schedules, rules, and halls, but connotation diverges fast)
- Butter / Cream cheese (both soft dairy spreads, but texture, smell, and uses differ)
- Backpack / Briefcase (both carry your stuff, but shape, material, who carries them differ)

Return ONLY a JSON object in this exact format, with no preamble or explanation:
{"correct": "WORD", "impostor": "WORD"}`,
      messages: [{ role: "user", content: `Generate a word pair. Theme: ${theme}.${exclusionNote}` }],
    })

    const raw = message.content[0].text.replace(/```json\s*/gi, "").replace(/```/g, "").trim()
    const pair = JSON.parse(raw)
    if (!pair.correct || !pair.impostor) throw new Error("invalid pair")

    const { data: players, error: playersError } = await supabase
      .from("mrwhite_players")
      .select("id")
      .eq("game_code", code)
      .eq("is_bot", false)

    if (playersError || !players?.length) throw new Error("no players")

    const mrWhite = players[Math.floor(Math.random() * players.length)]

    const { error: updateError } = await supabase
      .from("mrwhite_games")
      .update({
        phase: "statements",
        correct_word: pair.correct,
        impostor_word: pair.impostor,
        mr_white_id: mrWhite.id,
        round_number: 1,
        ready_player_ids: [],
      })
      .eq("code", code)

    if (updateError) throw updateError

    return Response.json({ ok: true })
  } catch (e) {
    console.error("mw-start error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
