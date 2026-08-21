import { createClient } from '@supabase/supabase-js'

// This game never uses Supabase Auth (player identity is a custom localStorage
// key, not an auth session) — persistSession/autoRefreshToken default to on
// regardless, and their cross-tab coordination via navigator.locks can throw
// "Acquiring an exclusive Navigator LockManager lock ... immediately failed"
// when the same browser has multiple tabs of the game open (e.g. testing
// several "players" as tabs on one machine), silently breaking that tab's
// Supabase calls. Disabling the unused auth lifecycle removes the lock
// entirely.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)
