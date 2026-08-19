// Weekly Vercel Cron hits this route to keep the Supabase project active —
// the free tier auto-pauses a project after 7 days with no API activity.
// This does one trivial read against a small, stable table; nothing here
// needs to succeed for the site to work, it's purely a heartbeat.
import { NextResponse } from "next/server"
import { supabase } from "../../../lib/supabase"

export async function GET(request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { error } = await supabase.from("game_instructions").select("game_key").limit(1)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() })
}
