import { createClient } from '@supabase/supabase-js'

// This app never uses Supabase Auth (players are a UUID in localStorage,
// not a Supabase session) — persistSession/autoRefreshToken default to true
// and make every tab coordinate through a shared browser Navigator Lock for
// a session that doesn't exist. With several tabs open on the same origin
// (normal when testing multiple simulated players), that lock gets
// contended and calls from a losing tab fail immediately and silently
// ("Acquiring an exclusive Navigator LockManager lock ... immediately
// failed"), with no retry, since fire-and-forget RPC calls don't surface an
// unhandled rejection anywhere a player would see it. Disabling both here
// removes the lock entirely since there's no session to persist or refresh.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
