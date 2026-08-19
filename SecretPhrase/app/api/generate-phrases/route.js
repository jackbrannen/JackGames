import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

// Keep at least this many phrases in the pool. When the pool drops to this
// many or fewer, generate a fresh batch. Safe to call liberally (on game
// start, after every turn) — it no-ops unless the pool is actually low.
const POOL_THRESHOLD = 6
const BATCH_SIZE = 24

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
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

    const { count, error: countError } = await supabase
      .from("secretphrase_phrases")
      .select("*", { count: "exact", head: true })

    if (countError) throw countError

    if (count > POOL_THRESHOLD) {
      return Response.json({ count, generated: 0, skipped: true })
    }

    const { data: existing, error: existingError } = await supabase
      .from("secretphrase_phrases")
      .select("phrase")
      .limit(60)

    if (existingError) throw existingError
    const exclusionList = (existing || []).map(r => r.phrase)

    const client = new Anthropic({ apiKey: anthropicKey })
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Generate ${BATCH_SIZE} short phrases for a party game called Secret Phrase. One team secretly knows the phrase; their player must weave it naturally into a spoken answer to a random question, without the other team noticing.

Each phrase must:

Sound like something a real person might casually say as part of an answer to almost any question
Be 3–7 words, a complete fragment (not a single word or generic noun phrase)
Be genuinely odd, specific, or memorable — noticeable once you know to listen for it, but still plausible, not absurd
Work as a general-purpose fragment, not tied to one narrow topic
Have the oddity built into the phrase itself — not a generic clause with one weird word stapled onto the end

To keep the full set from feeling repetitive or pattern-matchable, distribute phrases across:

Sentence position/function — mix openers ("honestly, it still bugs me"), mid-sentence interruptions ("which, in hindsight, was a mistake"), standalone asides ("not that anyone asked"), and trailing clauses ("right before the power went out")

Grammatical shape — mix flat statements, questions ("who even does that anymore"), commands ("don't tell my mom"), and comparisons ("worse than it sounds")

Emotional register — mix wistful/mysterious, blunt/defensive, boastful, and dismissive tones

Oddity mechanism — mix specificity of timing, understatement, overstatement, non sequitur logic, and implied backstory as the source of the "odd" factor

Avoid leaning on any single template (e.g. don't let most phrases be "[preposition] + clause" or all end the same grammatical way).

Avoid these already-used phrases: ${exclusionList.length > 0 ? exclusionList.join("; ") : "(none yet)"}

Return exactly ${BATCH_SIZE} phrases as a JSON array of strings, no other text, no markdown formatting.`,
      }],
    })

    const text = message.content[0].text
    let phrases
    try {
      phrases = JSON.parse(text)
    } catch {
      const match = text.match(/\[[\s\S]*\]/)
      phrases = match ? JSON.parse(match[0]) : []
    }
    phrases = (phrases || [])
      .filter(p => typeof p === "string" && p.trim().length > 0)
      .map(p => p.trim())
      .slice(0, BATCH_SIZE)

    if (phrases.length === 0) {
      return Response.json({ error: "No phrases generated" }, { status: 500 })
    }

    const { error } = await supabase
      .from("secretphrase_phrases")
      .upsert(phrases.map(phrase => ({ phrase })), { onConflict: "phrase", ignoreDuplicates: true })

    if (error) throw error

    return Response.json({ count: count + phrases.length, generated: phrases.length })
  } catch (e) {
    console.error("generate-phrases error:", e)
    return Response.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
