import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const client = new Anthropic()
  try {
    // Pick 150 random seed words, grouped into 50 triples — a different draw
    // each run is what actually produces variety, not the rule list alongside it.
    const relevantCategories = ["daily life", "people", "places", "food & drink", "animals", "life events", "objects & tools", "social events"]
    const { data: ideaRows } = await supabase
      .from("random_ideas")
      .select("idea, category")
      .in("category", relevantCategories)
    const seeds = (ideaRows ?? [])
      .map(row => row.idea)
      .sort(() => Math.random() - 0.5)
      .slice(0, 150)
    const seedGroups = []
    for (let i = 0; i < seeds.length; i += 3) seedGroups.push(seeds.slice(i, i + 3))
    const seedList = seedGroups.map((g, i) => `${i + 1}. ${g.join(" / ")}`).join("\n")

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

Below are 50 groups of 3 random seed words each. For EACH group, invent exactly ONE specific, drawable scene. Use 1, 2, or 3 of that group's words as inspiration — whichever number actually produces the best scene. Combine two or three only when they genuinely click into a single coherent image; when they don't, just take the one word that sparks something and ignore the rest. Never force all three together if it makes the scene cluttered or nonsensical. The words are triggers for your imagination, not ingredients to insert — don't just describe a seed word itself or bolt it onto a generic template.

## Rules

- Must be concrete enough to draw and guess from a drawing alone. No letters, numbers, or text-based humor.
- No brand names — nothing that requires drawing a logo or label to be recognizable. And no purely internal/emotional states with nothing physical to draw ("nerves," "a missed deadline," "an argument") — every prompt needs at least one concrete object, action, or setting a pen can actually render.
- Vary length across the batch: some 2–3 words, some 4–5, some 6–7. No prompt may exceed 7 words — count before finalizing.
- Avoid "someone" and "a man" as vague subjects — use a specific role, drop the subject, or find another construction.
- Don't reach for a joke or a twist — describe the scene plainly. If a prompt ends up funny, the humor should come from the concept itself, not from how it's phrased.
- Let the seeds pull you toward genuinely different scenes — resist falling back on a favorite sentence shape (e.g. "[role] doing [wrong thing]") for more than a handful of these.
- Vary sentence structure hard, not just content. A present-participle "-ing" construction as the main verb (e.g. "Moose lecturing a classroom," "Falling asleep mid car wash") must NOT appear in more than 1 of every 4 prompts — rotate through other shapes instead:
  - A bare noun phrase with no verb at all ("Barn chandelier," "The wrong funeral")
  - A finite past-tense verb ("Milkshake spilled in a cul-de-sac," "Goat headbutted the padlock")
  - A finite present-tense verb ("A crow steals a fire extinguisher")
  - A prepositional/setting-first phrase ("At the DMV, a moose files a complaint")
  Before finalizing, scan your own draft and count how many use "-ing" as the main verb — if it's more than 12 or 13, rewrite some into one of the other shapes.
- 1–2 prompts may use [Player] as a placeholder for a real name filled in at game time. Must be clearly drawable.
- No numbering, no quotes, no punctuation at the end. Output exactly 50 lines, one prompt per line, in the same order as the seed groups below.

## Seed groups

${seedList}

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
