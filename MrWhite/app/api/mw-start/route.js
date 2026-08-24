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
    // Blocklist: the 50 most recently generated words (across all games, finished
    // or not) - a hard constraint, not just an LLM hint, so a game can never repeat
    // a word still sitting in the last 50 generated.
    const { data: blocklistRows } = await supabase
      .from("mrwhite_used_words")
      .select("word")
      .order("created_at", { ascending: false })
      .limit(50)
    const blockedWords = (blocklistRows ?? []).map(r => r.word)
    const blockedSet = new Set(blockedWords.map(w => w.toLowerCase()))
    const exclusionNote = blockedWords.length > 0
      ? `\n\nDo NOT generate any of these recently used words (avoid the exact words and obvious synonyms):\n${blockedWords.join(", ")}`
      : ""

    async function generatePair() {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: `You are a word pair generator for a social deduction party game called Mr. White.

Your job is to return exactly one word pair: a CORRECT word (given to most players) and an IMPOSTOR word (given to one player, "Mr. White," who doesn't know—at least not at first—that their word is different).

The players have to go around saying TRUE statements about their word. For the players who aren't Mr. White, the goal is to find out who Mr. White is and expose him. For the player who is Mr. White, the goal is to reason that his word is different, piece together clues to figure out what the real word probably is, and then craft his TRUE statements about his word so that it sounds like the real word, and he's not discovered for as long as possible.

Your word pairs should be designed to make this game maximally fun for all players. Not so similar that all statements the players make will apply to both the CORRECT and INCORRECT words (Mr. White could never be found out). But not so dissimilar that players' statements will quickly and obviously distinguish the CORRECT from the INCORRECT words (Mr. White will be exposed too easily).

Rules for a good pair:
- Both words must be concrete nouns. No verbs, adjectives, or abstract concepts.
- The two words should share a broad category so that early, vague clues are plausibly valid for both. This means that there are many things that could be said of either that are true of both.
- They must diverge on specific physical or sensory properties — size, texture, shape, material, smell, sound, how you hold or use them — so that precise clues eventually expose the difference.
- The impostor must never be a synonym or near-identical concept. There must be real, guessable tension.
- Avoid pairs where one word is a strict subset of the other (e.g. "dog" / "puppy") — the impostor's clues will always seem valid.
- Avoid pairs so different that players narrow it down in one round.

Bad pair examples (do NOT generate these):
- Swimming / Running — verbs, not nouns
- Bad because they're too similar
	- Sofa / Couch — synonyms, no tension
	- Ocean / Lake - too much overlap
	- Glacier / Iceberg - too similar
	- Turtle / Tortoise - different only on a technicality, will confuse players
	- River / Lake - way too similar
	- Kayak / Canoe - too similar, almost anything that would apply to one would apply to the other
	- Hammer / Mallet - way too similar, both blunt striking tools, nearly interchangeable
- Bad because they're too different
	- Cat / Dog — too different, obvious after one clue
	- Sword / Shield — same era/context but no physical overlap in clues
	- Volcano / Mountain - too quickly exposed as different
	- Castle / Barn - too different
	- Anchor / Rope
	- Winter / Summer

Good pair examples:
- Guitar / Violin (both string instruments, but how you hold, bow vs. pluck, and size differ)
- Prison / School (both institutions with schedules, rules, and halls, but connotation diverges fast)
- Butter / Cream cheese (both soft dairy spreads, but texture, smell, and uses differ)
- Backpack / Briefcase (both carry your stuff, but shape, material, who carries them differ)
- Strawberry / Apple (both red sweet fruits, used in desserts, but different size, uses, appearance)
- Snowman / Yeti
- Blanket / Pillow

Don't use any of these specific examples

Return ONLY a JSON object in this exact format, with no preamble or explanation:
{"correct": "WORD", "impostor": "WORD"}`,
        messages: [{ role: "user", content: `Generate a word pair. Theme: ${theme}.${exclusionNote}` }],
      })

      const raw = message.content[0].text
      const jsonMatch = raw.match(/\{[\s\S]*?\}/)
      if (!jsonMatch) throw new Error("no JSON object in AI response")
      const pair = JSON.parse(jsonMatch[0])
      if (!pair.correct || !pair.impostor) throw new Error("invalid pair")
      return pair
    }

    // Hard constraint: retry until the AI returns a pair with no word in the
    // blocklist (the LLM prompt hint above isn't reliable enough on its own).
    let pair = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await generatePair()
      if (!blockedSet.has(candidate.correct.toLowerCase()) && !blockedSet.has(candidate.impostor.toLowerCase())) {
        pair = candidate
        break
      }
    }
    if (!pair) throw new Error("could not generate a non-blocked word pair")

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

    await supabase.rpc("mw_record_used_words", { p_words: [pair.correct, pair.impostor] })

    return Response.json({ ok: true })
  } catch (e) {
    console.error("mw-start error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
