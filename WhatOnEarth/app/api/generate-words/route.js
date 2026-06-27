import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

// Keep at least this many words in the pool. When the pool drops to this many
// or fewer, generate a fresh batch. Games consume one word per round, so the
// buffer needs to comfortably cover a full game.
const POOL_THRESHOLD = 10
const BATCH_SIZE = 50

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  try {
    // Only refill when the pool is running low. This makes the route safe to
    // call liberally (on game start, after every round) without spamming the
    // model or growing the pool unbounded.
    const { count, error: countError } = await supabase
      .from("woe_words")
      .select("*", { count: "exact", head: true })

    if (countError) throw countError

    if (count > POOL_THRESHOLD) {
      return Response.json({ count, generated: 0, skipped: true })
    }

    const client = new Anthropic()
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Generate ${BATCH_SIZE} short phrases for a translation party game. These will be secret words that players try to communicate using limited letters.

Rules:
- Mix of 1-3 word phrases
- Should be appropriate for 11-year-olds, but can have a hint of something slightly transgressive or topical
- Good mix of actions, objects, concepts, and cultural references
- Should be concrete enough to translate creatively but not too easy

Examples that capture the right vibe:
- flat earthers
- spooning
- doing the worm
- swear jar
- whipped cream
- area 51
- kissing booth
- nude beach
- hyperventilating
- crop circles
- trust fall
- dumpster diving
- speed dating
- belly button
- mullet haircut

Format: one phrase per line, no numbering, no quotes, no punctuation at the end.`,
      }],
    })

    const text = message.content[0].text
    const words = text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => l.charAt(0).toUpperCase() + l.slice(1))
      .slice(0, BATCH_SIZE)

    if (words.length === 0) {
      return Response.json({ error: "No words generated" }, { status: 500 })
    }

    // upsert + ignoreDuplicates so a repeated phrase doesn't fail the whole
    // batch against the UNIQUE(word) constraint.
    const { error } = await supabase
      .from("woe_words")
      .upsert(words.map(word => ({ word })), { onConflict: "word", ignoreDuplicates: true })

    if (error) throw error

    return Response.json({ count: count + words.length, generated: words.length })
  } catch (e) {
    console.error("generate-words error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
