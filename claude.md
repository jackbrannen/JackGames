# Games

> ⚠️ **DEPLOYMENT RULE — READ FIRST:** Vercel free tier allows **100 deployments/day across all projects**. Finish ALL edits to a game before deploying. Never deploy the same game twice in one session. Violating this floods the Vercel dashboard with deployment errors.

A series of multiplayer web games built with Next.js 14 and Supabase. Players connect from their own devices and play together in real time.

---

## Critical Workflow Rules

**Read these first. They prevent the most common bugs.**

1. **Always read the spec first.** Before writing any code, search tasks.md and DOCS.md for relevant specs. Implement exactly what it says. If the spec requires something complex, ask before deviating: "Spec says X, but that requires Y — should I do Z instead?" Never shortcut spec requirements without asking.

2. **Never copy code to all 12 games without testing the template first.** When creating a pattern to copy (API endpoints, shared hooks, etc.): (1) build and test locally in one game; (2) verify the build passes; (3) test the feature works; (4) only then copy to the other 11. Bugs caught in step 1 prevent 11 cascading failures.

3. **Before removing or renaming any constant/function/import:** (1) `grep -rn "NAME"` to find every reference; (2) list all references and decide replacement for each; (3) replace all; (4) verify with grep again (should return zero matches); (5) only then remove/rename the definition. Removing a definition before updating all call sites causes runtime errors.

4. **Never navigate above `/Users/jack/Library/CloudStorage/Dropbox-Personal/Claude/Games`.** All file reads, writes, edits, and shell commands must stay within this directory and its subdirectories.

---

## When to Consult DOCS.md

Before proceeding with implementation, check DOCS.md for:

- **Before building a lobby page** → read "Lobby Page Pattern"
- **Before building an in-game page** → read "In-Game Page Pattern"
- **Before using any shared component** → read the component spec in "Shared Components"
- **Before deriving colors for a new game** → read "Color System" for HSB formulas
- **Before looking up a game's colors** → see StyleGuide/app/page.js lines 5-17
- **Before implementing voting** → read "Voting" in "Recurring Mechanics"
- **Before implementing rounds/phases** → read "Rounds" and "Advancing Between Phases" in "Recurring Mechanics"
- **Before implementing timed turns** → read "Timed Turns" in "Recurring Mechanics"
- **Before implementing teams** → read "Team Assignment" in "Recurring Mechanics"
- **Before implementing hidden roles** → read "Hidden Roles" in "Recurring Mechanics"
- **Before checking database schema** → read "Supabase Schema Conventions"
- **When you need the games catalog** → see "Games Catalog" for subdomains, colors, player counts

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

**Git:**
- Commit freely; push once at end: `git push`
- Deploy: `vercel --prod --cwd Fishbowl` (from Games/ root)

**Vercel limits:**
- 100 deployments/day across all projects
- Check `vercel ls --cwd [Game]` before debugging
- One deploy per game per session

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
