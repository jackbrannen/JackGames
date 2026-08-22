import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const client = new Anthropic()
  try {
    // Load random ideas (only the categories we need) — the master categorized
    // list lives in the random_ideas table now, not the old JackGames JSON file.
    const relevantCategories = ["daily life", "people", "places", "food & drink", "animals", "life events", "objects & tools", "social events"]
    const { data: ideaRows } = await supabase
      .from("random_ideas")
      .select("idea, category")
      .in("category", relevantCategories)
    const ideas = Object.fromEntries(relevantCategories.map(cat => [cat, []]))
    for (const row of ideaRows ?? []) ideas[row.category].push(row.idea)
    const ideasList = JSON.stringify(ideas, null, 2)

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
        content: `# Drawful Prompt Generator

Generate 50 scene descriptions. Each should be specific and concrete enough to draw and guess from a drawing alone.

## Rules

- Prompts can be fully normal, oddly specific, slightly off, or genuinely absurd — anything on that spectrum is fair game. Not every prompt needs a wrong element.
- No letters, numbers, or text-based humor. Must be drawable.
- Vary length. At least 8 prompts should be 2–3 words. Some 4–5. Some 6–7. No prompt may exceed 7 words — count before finalizing.
- Vary structure. None of these should dominate:
  - Two or three words that create an unexpected image
  - A character doing something slightly wrong
  - An object or scene with no character
  - Scale violations — something the wrong size
  - Relational scenes — two or more people in a specific dynamic
  - Aftermath or consequence
  - Oddly specific normal things
- "[thing] in/at/inside [place]" constructions may appear no more than 10 times total.
- Short prompts (2–3 words) must not default to [adjective] [noun]. Use compound nouns, unexpected pairings, or other constructions.
- Avoid "someone" and "a man" as subjects. Use specific roles, drop the subject, or find another construction.
- Occupations (doctor, priest, lifeguard, mechanic, plumber, etc.) may appear as subjects no more than 8 times total.
- No more than 5 prompts may follow the pattern of a role doing something outside their expected context.
- Relational scenes — two or more people in a specific dynamic — no more than 8 total.
- Aftermath or consequence prompts no more than 6 total.
- Do not repeat the same underlying concept more than twice: age/size mismatches, scale violations, spilled or broken things, sleeping in wrong places, animals wearing things.
- No single person, animal, or object should anchor more than one prompt.
- Draw ingredients from the list below, spanning at least 6 of these categories: daily life, people, places, food & drink, animals, life events, objects & tools, social events. Use the list as a source of raw material — combine and transform ingredients into scenes rather than outputting the terms directly.
- 1–2 prompts may use [Player] as a placeholder for a real name filled in at game time. Must be clearly drawable.
- Do not write prompts that are reaching for a laugh. Describe the scene plainly. If the humor is in the concept, the writing should be neutral.
- No numbering, no quotes, no punctuation at the end. One prompt per line.

## Ingredient list

${ideasList}

## Burned concepts

Do not reuse or closely echo any of the following:

- barn chandelier
- wrong funeral
- pasture cubicle
- grandmother being questioned
- crossing guard at a funeral
- scarecrow in a job interview
- toddler firing a contractor
- pilot asking for directions
- competitive / wrong / passive [noun] constructions
- animals doing human jobs (keep this rare if used at all)
${excludeSection}`,
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
