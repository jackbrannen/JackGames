import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const client = new Anthropic()
  try {
    // Fetch the last 50 used prompts to exclude
    const { data: recentUsed } = await supabase
      .from("drawful_prompts")
      .select("text")
      .not("used_at", "is", null)
      .order("used_at", { ascending: false })
      .limit(50)

    const excludeList = (recentUsed ?? []).map(r => r.text)
    const excludeSection = excludeList.length > 0
      ? `\n\nDo not reuse any character, animal, setting, or concept from these recently used prompts. Avoid anything too similar:\n${excludeList.join("\n")}`
      : ""

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Generate 50 Drawful-style drawing prompts for a party game. Each should be a specific, concrete scene that would be funny to draw and guess.

Rules:
- Each prompt has exactly one absurd element — one normal thing in a weird situation, or one weird thing in a normal situation. Don't stack two or more absurdities.
- No letters, numbers, or text-based humor — prompts must be drawable.
- Vary prompt length — some should be 2 words, some 3–5 words, some 6–7, some longer. Don't let any one length dominate.
- Vary structure:
    - Some could be compound nouns or hybrid objects. They could be as simple as [modifier] [subject], as in "samurai Hanukkah" or "fish house."
    - Some should be location/situation-based ("inside a X, a Y is happening")
    - Some can be "a [character] doing [wrong thing]" style.
    - Rarely, a prompt can use the placeholder [Player] (exactly as written, with square brackets) in place of a specific person's name. The [Player] slot will be filled in with a real player's name at game time. Examples: "[Player] being chased through a mall by a goose", "a judge sentencing [Player] for stealing a cracker", "the moment [Player] realized the bear was friendly". Use [Player] only once per prompt, and make sure it's a scene that's still clearly drawable.
- Do not number the prompts.

Format: one prompt per line, no numbering, no quotes, no punctuation at the end.${excludeSection}`,
      }],
    })

    const text = message.content[0].text
    const prompts = text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.charAt(0).toUpperCase() + l.slice(1))
      .slice(0, 50)

    if (prompts.length === 0) {
      return Response.json({ error: "No prompts generated" }, { status: 500 })
    }

    const { error } = await supabase
      .from("drawful_prompts")
      .insert(prompts.map(text => ({ text, used_at: null })))

    if (error) throw error

    return Response.json({ count: prompts.length })
  } catch (e) {
    console.error("generate-prompts error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
