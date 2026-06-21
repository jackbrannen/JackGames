import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const client = new Anthropic()
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Generate 50 short phrases for a translation party game. These will be secret words that players try to communicate using limited letters.

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
      .slice(0, 50)

    if (words.length === 0) {
      return Response.json({ error: "No words generated" }, { status: 500 })
    }

    const { error } = await supabase
      .from("woe_words")
      .insert(words.map(word => ({ word })))

    if (error) throw error

    return Response.json({ count: words.length })
  } catch (e) {
    console.error("generate-words error:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
