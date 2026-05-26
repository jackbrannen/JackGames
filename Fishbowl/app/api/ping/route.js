import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function GET() {
  const { data, error, status, statusText } = await supabase.from("games").select("code").limit(1)
  return Response.json({ ok: !error, data, error, status, statusText }, { status: error ? 500 : 200 })
}
