import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

// Keep at least this many words in the pool. When the pool drops to this many
// or fewer, generate a fresh batch. Games consume one word per round, so the
// buffer needs to comfortably cover a full game.
const POOL_THRESHOLD = 10
const BATCH_SIZE = 50

export async function POST() {
  try {
    // Validate config up front so a missing env var returns a readable error
    // instead of a blank 500 (an uncaught throw before this point gives no body).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    // Prefer the service role key, but fall back to the anon key. RLS is disabled
    // on these tables, so the anon key has write access — this keeps the route
    // working without requiring the service role key to be configured.
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY

    const missing = []
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if (!anthropicKey) missing.push("ANTHROPIC_API_KEY")
    if (missing.length > 0) {
      return Response.json({ error: "Missing environment variables: " + missing.join(", ") }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

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

    const client = new Anthropic({ apiKey: anthropicKey })
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Generate ${BATCH_SIZE} words/phrases for a translation party game where players communicate using limited letters.

Rules:
- MOST should be 1-2 words. A few can be 3 words MAX.
- Must be guessable from creative letter usage - avoid obscure multi-word phrases
- Appropriate for 11-year-olds, can have slight edge
- Mix of: compound words, iconic terms, actions, cultural references, body parts, food items
- Should be "a thing" everyone knows, not generic descriptions
- NO generic adjective+noun (like "big sandwich" or "ugly sweater")

Good examples (mostly 1-2 words):
- spooning
- flat earthers
- swear jar
- whipped cream
- area 51
- nude beach
- crop circles
- belly button
- speed dating
- trust fall

Bad examples (too long/obscure):
- middle school dance
- hot lava floor
- competitive eating contest

Format: one per line, no numbering, no quotes, no punctuation.`,
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
    return Response.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
