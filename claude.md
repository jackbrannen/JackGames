# Games

> ⚠️ **DEPLOYMENT RULE — READ FIRST:** Vercel free tier allows **100 deployments/day across all projects**. Pushing to git is now the deploy signal (see Git Workflow & Deployment) — finish ALL edits to a game before pushing it, and avoid pushing/redeploying the same game repeatedly in one session. Violating this floods the Vercel dashboard with deployment errors and burns through the daily cap.

A series of multiplayer web games built with Next.js 14 and Supabase. Players connect from their own devices and play together in real time.

---

## Critical Workflow Rules

**Read these first. They prevent the most common bugs.**

1. **Always read the spec first.** Before writing any code, search tasks.md and DOCS.md for relevant specs. Implement exactly what it says. If the spec requires something complex, ask before deviating: "Spec says X, but that requires Y — should I do Z instead?" Never shortcut spec requirements without asking.

2. **Never copy code to all 12 games without testing the template first.** When creating a pattern to copy (API endpoints, shared hooks, etc.): (1) build and test locally in one game; (2) verify the build passes; (3) test the feature works; (4) only then copy to the other 11. Bugs caught in step 1 prevent 11 cascading failures.

3. **Before removing or renaming any constant/function/import:** (1) `grep -rn "NAME"` to find every reference; (2) list all references and decide replacement for each; (3) replace all; (4) verify with grep again (should return zero matches); (5) only then remove/rename the definition. Removing a definition before updating all call sites causes runtime errors.

4. **Never navigate above `/Users/jack/Library/CloudStorage/Dropbox-Personal/Claude/Games`.** All file reads, writes, edits, and shell commands must stay within this directory and its subdirectories.

---

## When to Consult Other Docs

**DOCS.md** — implementation patterns and specs:
- Before building a lobby page → "Lobby Page Pattern"
- Before building an in-game page → "In-Game Page Pattern"
- Before using any shared component → "Shared Components"
- Before deriving colors → "Color System" for HSB formulas
- Before implementing voting/rounds/teams/roles → "Recurring Mechanics"
- Before checking database schema → "Supabase Schema Conventions"
- When you need the games catalog → "Games Catalog"

**BUGS.md** — common bugs and fixes:
- When debugging "stuck on loading" → check diagnostic steps
- When button stuck on "Loading..." → check loading state patterns
- When seeing React hooks errors → check hook ordering rules
- When Vercel build fails → check module/file issues
- When footer covers content → check padding/height calculations
- When profile/auto-join fails → check saveProfile rules

**CODE_PATTERNS.md** — copy-paste code examples (CSS reset, player list JSX, profile management, etc.)

---

## Stack & Conventions

**Stack:**
- Frontend: Next.js 14, React 18
- Backend: Next.js API routes
- Database: Supabase (Postgres + Realtime)
- Hosting: Vercel

**Project Conventions:**
- All pages use `"use client"`. No SSR. No component library — inline styles only.
- Supabase client is initialized once and imported; don't create new instances
- All game logic lives in `app/` (check if `pages/` exists in older games)
- Realtime subscriptions are set up in the component that owns that phase's state

---

## Database Rules

- Schema changes are made in the Supabase dashboard or via `supabase` CLI
- Before writing code that depends on a new column/table, confirm it exists in Supabase
- If a feature isn't working and touches the database, check whether the column/table actually exists before debugging code
- Table naming: `{game}_games` and `{game}_players` (exception: Fishbowl uses unprefixed `games`, `players`, `clues`)
- Use RPC functions for atomic operations. Name them `{game}_{operation}` (e.g. `gow_start_game`)
- **When SQL migrations are needed:** Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `hgbvzuqqdwaobxnxvvsu` (Games project). Never ask the user to run SQL manually.

---

## Realtime & Egress Management

Supabase egress is a real, limited resource — one inefficient sync pattern, multiplied across many open tabs and connected clients over hours or days, can burn hundreds of MB/day. This has caused real incidents (traced via the Supabase dashboard's egress chart and `pg_stat_statements`). When building or touching anything realtime:

- **Never let something that fires on every tap/drag trigger a full state reload.** Only genuine committed actions (submit, vote, ready-up, a phase transition) should call `nudge()` / `channelRef.current?.send(broadcast)` or refetch every subscribed table. Live interactions — dragging, a live cursor/selection indicator, a like/react toggle, anything a player can tap repeatedly — must NOT broadcast or reload on every occurrence. The write already propagates to every subscribed client via `postgres_changes`; broadcasting on top of that just forces everyone through an expensive full reload for no benefit. This exact bug has independently recurred in several different games across different sessions — always check for it when adding a "tap repeatedly" interaction.
- **Patch local state from the realtime payload instead of refetching.** `postgres_changes` payloads carry the complete new row (`payload.new`) for INSERT/UPDATE. Apply it directly (`setGame(payload.new)`, or find-and-replace by `id` in an array) instead of re-querying every subscribed table via a generic `loadState()`. Reserve the full refetch for initial mount, the 60s poll fallback, visibility-change catch-up, and reconnect-after-drop.
- **Check subscriptions have a `filter`.** `.on("postgres_changes", { table: "x_answers" }, ...)` with no `filter: "game_code=eq.${code}"` fires for every row change across every game of that type in the whole database, not just the current one. Filter whenever the table has a column to filter on; when it doesn't (e.g. a child table keyed by `question_id` rather than `game_code`), filter client-side before applying a payload.
- **If egress looks unexpectedly high**, query `pg_stat_statements` (via the Management API) for the highest-`calls` `pgrst_source` queries — cross-reference against which tables have unpatched `postgres_changes` subscriptions to find the offender fast.
- **Abandoned open tabs poll forever** — a deployed fix can't reach JS already loaded in an already-open tab (it keeps running the old code, talking directly to Supabase, until the tab is closed or reloaded). Keep this in mind before concluding an egress spike must be a live bug — check whether it's actually old tabs first.

---

## Testing & Validation

**No automated tests** — verification is manual.

**Test checklist:**
1. Full interaction sequences (vote → deselect → vote → deselect, not just "vote works")
2. Visual comparison against StyleGuide (localhost:3099)
3. Loading states reset on BOTH success AND error paths
4. Edge cases (timer pause/resume, rapid taps, etc.)

**Button loading on phase transitions:**
- Do NOT call `setLoading(false)` on success
- Only reset on error
- Component unmounts naturally when phase changes

---

## Git Workflow & Deployment

**Git & deploy — push IS the deploy signal:**
- Do NOT run `git commit`, `git push`, or `vercel --prod` unless explicitly told to **in that same message**. Finishing a change is not permission to ship it — testing happens locally first (on this machine), and pushing only happens once that's done.
- Verify every change yourself by running it locally (dev server / headless browser / render harness) — NEVER ask to spin up `npm run dev` or do the local test yourself. The spin-up and verification are your job.
- When a change is verified, stop and report what's done, then wait for the go-ahead to push.
- Once told to push: run `git push`, then immediately `vercel --prod --cwd <Game>` for every game whose files changed in that push — back to back, as one combined action. Do not wait for a separate "and deploy" instruction; there is no push-without-deploying anymore.
- These Vercel projects still have no GitHub-integration auto-deploy hook wired up (one project, `jack-games`, has a broken leftover one — see below) — the `vercel --prod --cwd <Game>` call is what actually ships the deploy, immediately after the push.

**Vercel limits:**
- 100 deployments/day across all projects
- Check `vercel ls --cwd [Game]` before debugging
- Finish all edits to a game before pushing it — since push now triggers an immediate deploy, avoid pushing/redeploying the same game repeatedly in one session

**Shared components:**
- Edit canonical in `packages/shared/components/`, then copy to all 12 games
- When a mechanic improves in one game, update all others (see tasks.md)

**useSubmitNudge gotcha:**
If copying `lib/useSubmitNudge.js` to a game, it MUST be committed to git. If Vercel build fails with `Module not found: Can't resolve '../lib/useSubmitNudge'`, the file is on disk but untracked — run `git add lib/useSubmitNudge.js && git commit`.

---

## Development

- Run locally: `npm run dev`
- Test with two browser windows/devices
- When a fix "isn't working": check deployment first (`vercel ls`)
- Ask if unsure; explain if something seems unwise

---

## UI Design Rules

**Never use magic numbers.** Import constants from `components/styles.js` (STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD).

**Typography:**
- Min 13px font size (non-negotiable)
- Section headers: sentence case, no letter-spacing ("Players", "Scores")
- Eyebrows: UPPERCASE + letter-spacing, only for status bar progress ("ROUND 2 OF 5")
- Opacity floor: 0.65 on colored backgrounds (exception: button:disabled uses 0.35)

**Colors:**
- Always derive in HSB, never estimate hex (see DOCS.md for formulas)
- Never use rgba(0,0,0,X) or rgba(255,255,255,X) overlays on colored backgrounds

**Layout:**
- Buttons are square (no borderRadius unless circle/pill)
- No mixed alignment in rows
- Use padding-bottom: env(safe-area-inset-bottom) on bottom bars

---

## Profile & Dummy Games

**Profile rules (localStorage + cookie):**
- Never call `saveProfile(saved)` unless `saved.username` exists — corrupts shared cookie
- Never use fallback values as stand-in for `username`
- If username missing, show all three fields blank
- Auto-join must gate on `savedProfile?.username`

**Dummy games (see tasks.md for spec):**
- Auto-join only if saved profile exists
- Pre-fill text fields with random ideas when phase starts
