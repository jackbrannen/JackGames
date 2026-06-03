# Games

> ⚠️ **DEPLOYMENT RULE — READ FIRST:** Vercel free tier allows **100 deployments/day across all projects**. Finish ALL edits to a game before deploying. Never deploy the same game twice in one session. Violating this floods the Vercel dashboard with deployment errors.

A series of multiplayer web game built with Next.js 14 and Supabase. Players connect from their own devices and play together in real time.

## Stack

- **Frontend:** Next.js 14, React 18
- **Backend:** Next.js API routes
- **Database & Realtime:** Supabase (Postgres + Supabase Realtime for live game state)
- **Hosting:** Vercel (custom domain)

## Project Conventions

- All game logic lives in `pages/` or `app/` — check which one exists before editing
- Supabase client is initialized once and imported; don't create new instances in components
- Real-time subscriptions are set up in the component that owns that game phase's state

## Database & Schema Changes

- There is **no local migrations folder** — schema changes are made in the Supabase dashboard or via `supabase` CLI
- Before writing code that depends on a new column or table, confirm the schema change has been made in Supabase and is live
- If a feature isn't working and it touches the database, check whether the column/table actually exists before debugging the code

## Bug Fixes

- Do not write automated tests — verification is manual
- If I ask for a code path audit before a fix, enumerate every handler touching the affected state, confirm with me, then fix

### Button Loading State — Never Flash Back on Success

When a button action causes a phase/screen transition, do NOT call `setLoading(false)` on the success path. Only reset loading state on error. Leave the button text as "Loading…" until the component unmounts naturally when the new phase arrives. Resetting early causes a visible flash back to the idle label right before the screen changes.

```js
// CORRECT
async function handleAction() {
  if (loading) return
  setLoading(true)
  const { error } = await supabase.rpc(...)
  if (error) { setLoading(false); return }  // reset only on error
  await loadState()  // component unmounts when phase changes; loading stays
}

// WRONG — causes flash
async function handleAction() {
  setLoading(true)
  await supabase.rpc(...)
  setLoading(false)   // ← flash! briefly shows idle label before screen changes
  await loadState()
}
```

This applies to every action button that triggers a phase transition: Submit, Lock It In, Start Game, Ready, etc.

## Monorepo Structure

All games live in a single git repo at `https://github.com/jackbrannen/JackGames`. The local root is `/Users/jack/Library/CloudStorage/Dropbox-Personal/Claude/Games/`. Each game is a subdirectory (e.g. `Fishbowl/`, `GameOfWhat/`). Shared code lives in `packages/shared/`.

**Vercel is NOT connected to the monorepo** (Vercel hobby plan caps at 10 projects per repo; we have 13). Each Vercel project is still connected to its own individual GitHub repo (`jackbrannen/Fishbowl`, etc.). Those individual repos are now stale — do not push to them.

### Git workflow

- All edits happen inside the monorepo (`Games/`)
- Commit freely during a session; push once at the end with `git push`
- To deploy a game after editing it: `vercel --prod --cwd Fishbowl` (run from `Games/` root)
- Track which games were edited in a session so you know which ones need deploying

### Shared components

Canonical sources live in `packages/shared/components/`. Each game has its own copy at `[Game]/components/[Name].js`. To update a shared component: edit the canonical, then copy it to all 12 games. See the **Shared Components** section below for the full list and specs.

## Deployment

- Deployed to Vercel
- For custom domain DNS: use **CNAME** for subdomains (e.g. `www`), **A record** for apex domain
- Don't change DNS recommendations mid-conversation — pick one approach and stick with it

**When a fix "isn't working": check deployment first.** Run `vercel ls --cwd [Game]` before assuming the code is wrong. If the latest deployment predates the fix, deploy manually with `vercel --prod --cwd [Game]` and retest.

### Cross-Game Mechanic Parity

When a shared mechanic is improved in one game, immediately update all other games that use it. Shared mechanics include:
- Random ideas (fetch count, chip style, exhaustion limit)
- Profile management (localStorage + cookie)
- "Game in progress" screen for late-joiners
- Realtime + polling setup pattern
- Section header style (17px bold, not 11px small-caps)
- Player list card design (two-column numbered layout)
- Cool-dark hex backgrounds (no rgba black overlays)
- Opacity floor (0.65 minimum on colored backgrounds)
- 50%+ ready to advance from results screens
- Button loading state never resets on success
- **Shared components** (Footer, Menu, Notifications, WaitingList, GameModal) — see dedicated section below

Failing to propagate improvements counts as an incomplete task.

### Vercel Deployment Limit

The free tier allows **100 deployments per day across all projects**. With 11 games, a session that touches all games multiple times will hit this cap.

- Always check `vercel ls` to confirm a deployment is live before debugging code
- When the cap is hit, `vercel --prod --cwd [dir]` returns `api-deployments-free-per-day` error
- **Batch changes**: finish all edits for a game before committing; avoid committing the same file multiple times in one session
- The cap resets on a rolling 24-hour window — try again in a few hours if blocked

## SQL & Migrations

- Run all SQL changes directly against the linked Supabase project using `supabase db query --linked -f <file>` — no manual steps needed
- Write SQL to a temp file, execute it, then delete the file. Do not keep a `pending_migrations.sql` around.

## UI & Design

- Avoid low-contrast text that is hard to read
- Avoid placing highly saturated complementary colors next to each other (e.g. red next to green) — they create visual vibration and are hard to read
- Do not make body or label text too small — err on the side of larger, not smaller
- Avoid mixed alignment within a row: do not left-align text while right-aligning its badge or marker in the same row. If text and badges appear together, align the badge to the left of the text instead
- Don't make any text smaller than 13px
- The main games menu screen should use the game's color scheme for each game card
- All buttons are square — no `borderRadius` unless the shape is intentionally a circle or pill (e.g. a status dot, a tag chip)

## Development Workflow

- Run locally with `npm run dev`
- Test multiplayer features with two browser windows (or two devices on the same network)
- Verify changes manually by playing through the affected game flow on two devices or two browser windows
- One deploy per game per session maximum — see deployment rule at top of this file
- Always make all edits to the deployed site only, not the local, and push to git then deploy with `vercel --prod --cwd [Game]`.

## Workflow

- **Always read the spec first.** Before implementing any feature, search tasks.md and this file for the spec. Implement exactly what it says. If the spec requires something complex, ask before deviating: "Spec says X, but that requires Y — should I do Z instead?" Never shortcut spec requirements without asking.
- **Never copy code to all 12 games without testing the template first.** When creating a pattern to copy (API endpoints, shared hooks, etc.): (1) build and test locally in one game; (2) verify the build passes; (3) test the feature works; (4) only then copy to the other 11. Bugs caught in step 1 prevent 11 cascading failures.
- If you ever have questions, ask me rather than guessing.
- If I ask for something that seems unwise, let me know and explain why it might be a bad idea.
- **Never navigate above `/Users/jack/Library/CloudStorage/Dropbox-Personal/Claude/Games`.** All file reads, writes, edits, and shell commands must stay within this directory and its subdirectories.

## What I'm Building

Party games for groups of people playing together in person, each on their own phone. The experience should feel smooth and clear on mobile. Clarity of information on each player's screen is the top priority — players glance at their phone and need to immediately understand what's happening and what they need to do.

---

## Games Catalog

Each game is a separate Next.js repo deployed to its own Vercel subdomain under `jackbrannen.com`. They share no package dependencies, but must share UI patterns and conventions.

| Game | Subdomain | Color | Players | Core Mechanic |
|------|-----------|-------|---------|---------------|
| Fishbowl | `fishbowl` | Blue `#3378FF` | 4+ | Teams guess clues in timed turns across rounds |
| Game of What | `gameofwhat` | Maroon `#6B1A44` | 4+ | Write answers to prompts, vote on funniest |
| Avalon | `avalon` | Dark navy `#0F1923` | 5–10 | Hidden roles, team voting, social deduction |
| First to Worst | `firsttoworst` | Forest green `#004F45` | 4+ | Rank 5 words, group guesses your order |
| Drawful | `drawful` | Teal `#307977` | 4+ | Draw prompts, write fake answers, vote on the real one |
| So Clover | `soclover` | Yellow-green `#6B8C2A` | 2–6 | Arrange keyword cards, write clues, guess each other's boards |
| Telestrations | `telestrations` | Purple `#3D1060` | 4+ | Draw-guess telephone chain |
| Copycats | `copycats` | Purple `#4A1A80` | 4+ | Write answers, group finds the copycat |
| Codenames | `codenames` | — | 4+ | Teams guess words from one-word clues |
| Reverse Charades | `reversecharades` | — | 4+ | Group acts out clues, one person guesses |
| Exquisite Corpse | `exquisite-corpse` | — | 4+ | Collaborative drawing/writing chain |

The central hub at `JackGames/` lists all games. Each game card uses that game's color scheme.

### Team-Based Games
Fishbowl, Codenames, and Reverse Charades use two teams. These games:
- Show team badges in the Menu's Players tile (pass `teamColor`/`teamLabel` in `playerDetails`)
- Disable the hamburger while the timer is running (pass `timerRunning` to Footer)
- Use team-grid player list layouts instead of the standard numbered layout

Avalon has hidden roles (not teams in the traditional sense) — do NOT show role info in the Players tile.

---

## Project Structure

```
/Games/
├── JackGames/         # Central hub / main menu
├── Fishbowl/          # Most feature-complete reference game
├── GameOfWhat/
├── Avalon/
├── FirstToWorst/
├── Drawful/
├── SoClover/
├── Telestrations/
├── Copycats/
├── Codenames/
├── ReverseCharades/
└── ExquisiteCorpse/
```

Within each game:
```
app/
  layout.js          # Minimal — just sets html/body styles
  page.js            # Home/join page
  [code]/page.js     # Lobby
  [code]/play/page.js # In-game
lib/
  supabase.js        # Single Supabase client instance
  words.js or prompts.js  # Game-specific content
```

All pages use `"use client"`. No SSR. No component library — inline styles only.

---

## UI Design System

### CSS Reset (copy verbatim into every new game's `globals.css`)
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { min-height: 100%; padding-bottom: env(safe-area-inset-bottom); }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
button { cursor: pointer; border: none; -webkit-tap-highlight-color: transparent; }
button:active:not(:disabled) { transform: scale(0.91); filter: brightness(1.3); }
button:disabled { opacity: 0.35; cursor: not-allowed; }
input, select, textarea { font-family: inherit; outline: none; border: none; }
input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.6); opacity: 1; }
```

### Button Styles (copy into every new game)
- **Primary action:** background `#FBDF54`, color `#000`, font-weight 900
- **Secondary:** background `rgba(255,255,255,0.15)`, color `#fff`, font-weight 700
- **Disabled:** opacity 0.35 (handled by global CSS above)
- All buttons are square — no `borderRadius`

### Typography
- Minimum font size: **13px** (non-negotiable)
- **Section headers** — `fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)"`. No uppercase, no letter-spacing. This applies everywhere a label titles a section of content (Players, Join Game, Scores, etc.)
- **Eyebrow / metadata labels** inside colored header bands (e.g. "ROUND 2 OF 5" above a bigger title) — `fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.75`. These are progress indicators, not section titles.
- Headings: 20–28px, weight 900
- Use `clamp()` for responsive sizing where appropriate
- Body text: 16–18px, weight 400–500
- **Opacity floor on colored backgrounds: 0.65.** Never set text opacity below 0.65 on a colored background — it becomes unreadable. The only exception is the `button:disabled` global rule (0.35) which is handled by CSS and applies to interactive affordance, not reading.
- Opacity scale: 0.35 disabled (CSS only), 0.65 muted/secondary, 0.75 moderate emphasis, 0.85 normal, 1.0 full

### Spacing
- 8px base grid: 8, 16, 20, 24, 28, 32, 48
- `padding-bottom: env(safe-area-inset-bottom)` on any bottom-pinned bar

### Color System — Cool/Warm Zone Derivation

Every game has a primary background color. Darker zones (section headers, wells, status bars) use a **cool-dark** variant; lighter interactive zones (input fields, secondary buttons) use a **warm-light** variant.

**Derivation rule — always work in HSB, never estimate in hex:**
- **Cool-dark** (headers, top bars): hue +10° toward blue, brightness −9%, saturation unchanged
- **Mid-dark** (wells, cards, panels): hue +5°, brightness −5%
- **Warm-light** (inputs, secondary buttons, lighter interactive zones): hue −10° toward orange, brightness +9%

**Never use `rgba(0,0,0,X)` or `rgba(255,255,255,X)` overlays on colored backgrounds.** Both produce desaturated results with no intentional hue. Always derive an explicit hex using the HSB formulas above. The only exception is a full-screen modal backdrop (`position: fixed; inset: 0`) at high opacity (0.7+) — that is intentional visual separation, not a tint.

Derived colors for each game:

| Game | Primary (BG) | Cool-dark (headers) | Mid-dark (wells/cards) | Warm-light (inputs/btns) |
|------|-------------|---------------------|------------------------|--------------------------|
| Fishbowl | `#3378FF` | `#0C47E9` | `#2357E7` | — |
| Game of What | `#6B1A44` | `#4A123B` | `#5C1640` | — |
| Avalon | `#0F1923` | — | — | — |
| First to Worst | `#004F45` | `#003638` | `#00423f` | `#006648` |
| Drawful | `#307977` | `#1C5250` | `#245E5C` | — |
| So Clover | `#6B8C2A` | `#4C7523` | `#5A8026` | `#90A331` |
| JackGames hub | `#111118` | — | — | — |

When adding a new game: compute the primary in HSB, apply the ±10°/±5° shifts and ±9% brightness adjustments, then convert back to hex. Do not eyeball hex values.

### Game Color Palettes

| Game | Primary | Team A | Team B | Accent | Text |
|------|---------|--------|--------|--------|------|
| Fishbowl | `#3378FF` | `#F97316` (orange) | `#C026D3` (magenta) | `#FBDF54` | white |
| Game of What | `#6B1A44` | — | — | `#FBDF54` | white |
| Avalon | `#0F1923` | `#4A8FD4` (good) | `#AA2222` (evil) | `#C9A84C` (gold) | `#E8DCC8` (cream) |
| First to Worst | `#004F45` | — | — | `#FBDF54` | white |
| Drawful | `#307977` | — | — | `#F5E8D8` (warm cream) | white |
| So Clover | `#6B8C2A` | — | — | `#FBDF54` | white |
| JackGames hub | `#111118` | — | — | `#FBDF54` | white |

Yellow `#FBDF54` is the universal accent/CTA color across all games. Individual games may use a different accent if yellow conflicts with their palette (e.g. Drawful uses warm cream).

---

## Shared Assets

### Random Ideas List
There is **one canonical list of random idea prompts** shared across multiple games (currently Game of What and First to Worst). It lives in a **Supabase table called `random_ideas`** — a single column `idea` (text). Both games query this table directly. Do not copy the list into individual game repos.

- To add or edit ideas: update the `random_ideas` table in the Supabase dashboard — changes appear in all games immediately
- When building a new game that needs random prompts, call the shared `get_random_ideas(p_count, p_exclude)` RPC
- `p_exclude` is a `text[]` of idea strings already shown — the RPC avoids repeating them

---

## Code Patterns (Copy From Fishbowl)

Fishbowl is the most mature game. When building new games, copy its patterns rather than inventing new ones.

### Profile Management
All games share a player profile (first name, last name, display name) stored in `localStorage:jackgames:profile` and mirrored to cookie `jackgames_profile` (domain `.jackbrannen.com` so it's readable by all games).

**The cookie is authoritative.** localStorage is per-domain and can hold stale data from a previous session. The shared cookie reflects the most recent explicit save (from any game or the hub). Always merge with local as base and cookie as override:

```js
function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}

function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}
```

**Critical rules — do not diverge:**
- **Never call `saveProfile(saved)` on load unless `saved.username` is present.** Reading the profile and immediately writing it back corrupts the shared cookie if the local copy is incomplete (missing username). Guard it: `if (saved.username) saveProfile(saved)`.
- **Never use a fallback value (e.g. `firstName`) as a stand-in for `username`.** If that fallback gets auto-saved or auto-joined with, it cements the wrong value into storage across all games.
- **If username is missing, show all three fields (first, last, display name) blank** so the user re-enters everything cleanly. Do not hide first/last fields just because `savedProfile` exists — gate on `savedProfile?.username`.
- **Auto-join (if used) must gate on `savedProfile?.username`**, not the username state variable, which may contain a UI hint rather than a stored value.

### Game Code Generation
Two concatenated words from a word list, e.g. `MAPLERIVER`. Uniqueness checked against the DB (loop up to 10 attempts). Each game can use its own word list but the generation logic is identical.

### Player ID Persistence
Format: `localStorage:[gamename]:[code]:playerId`
Example: `fishbowl:MAPLERIVER:playerId`

### Realtime + Polling
All games use **both**: Supabase Realtime for fast updates, plus a 1.5s polling interval as a fallback. Always set up both; never rely on only one.

```js
const poll = setInterval(loadState, 1500)
const channel = supabase.channel(`game-${code}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "GAME_players" }, refreshPlayers)
  .on("postgres_changes", { event: "*", schema: "public", table: "GAME_games", filter: `code=eq.${code}` }, handleGameUpdate)
  .subscribe()
return () => { clearInterval(poll); supabase.removeChannel(channel) }
```

### Modals / Overlays
Fixed position, full-screen, semi-transparent dark background. Click outside to close. No library needed — this is 15 lines of inline JSX.

---

## Shared Components

Each shared component has a canonical source in `packages/shared/components/` and a copy in every game's `components/` folder. To update: edit canonical, copy to all 12 games. Full specs live alongside each component file.

### Component list

| Component | File | What it does |
|---|---|---|
| **HomeScreen** | `components/HomeScreen.js` | Game home/join page — big title, tagline, Create Game button, join input |
| **Lobby** | `components/Lobby.js` | Pre-game lobby shell — header (code + invite + how-to-play), player list, slots for settings/start CTA/join form |
| **EndGame** | `components/EndGame.js` | Final scores screen — "Game Over", sorted score list, Play Again + Play Another Game buttons |
| **Results** | `components/Results.js` | Post-question results — answer groups with vote counts, bonus labels, per-round points breakdown |
| **Footer** | `components/Footer.js` | Sticky 56px bar at bottom; hamburger left, action buttons right |
| **FooterButton** | `components/FooterButton.js` | Action button for use inside Footer; auto-loading state, nudge pulse, primary/secondary/danger variants |
| **Menu** | `components/Menu.js` | Slide-up drawer opened by the hamburger; Players, Poke, Message, optional tiles |
| **Notifications** | `components/Notifications.js` | Poke/message strips fixed at top of screen; tap or swipe to dismiss |
| **WaitingList** | `components/WaitingList.js` | Player rows with status dots and inline 👉 poke buttons |
| **Selections** | `components/Selections.js` | Tap-to-select rows with ✕ deselect and own-item label |
| **TextEntry** | `components/TextEntry.js` | Textarea/input with debounced `onTypingChange` callback |
| **StatusBar** | `components/StatusBar.js` | Thin top strip — label + optional right node |
| **RandomIdeas** | `components/RandomIdeas.js` | Draw button, idea chips, player name injection |
| **GameModal** | `components/GameModal.js` | Game-picker modal shown at end of game |

Shared lib files (canonical in `packages/shared/lib/`, copied to each game's `lib/`):

| File | What it does |
|---|---|
| `lib/sounds.js` | `playSubmit`, `playYourTurn`, `playPoke` — audio feedback |
| `lib/useDuplicates.js` | Within-player duplicate detection — highlights duplicate fields within one player's form |
| `lib/useBlockingDuplicates.js` | Between-player blocking duplicates — returns which of the current player's values clash with another player's submission (Fishbowl, ReverseCharades) |
| `lib/useTypingPresence.js` | Tracks which players are currently typing via Supabase presence channel |
| `components/styles.js` | Design tokens (colors, spacing) used by shared components |

Full props, usage examples, and behavior notes are in the spec comment at the top of each component file. `PokeSystem.js` is a backward-compatible wrapper around Footer + Menu + Notifications — existing games use it until they're migrated. Rollout status tracked in `tasks.md`.

### Key constants
```js
export const FOOTER_H = 56  // from Footer.js — height of the sticky footer bar

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
// Use BOTTOM_PAD for paddingBottom on scrollable content areas
```

### Colors per game
Each game passes a `colors` object to Footer, Menu, and Notifications:
```js
{ dark, mid, wl, yellow, notifBg }

// Fishbowl:        { dark: "#0C47E9", mid: "#2357E7", wl: "#4A70FF", yellow: "#FBDF54", notifBg: "#071A8A" }
// GameOfWhat:      { dark: "#4A123B", mid: "#5C1640", wl: "#821F42", yellow: "#FBDF54", notifBg: "#300A20" }
// FirstToWorst:    { dark: "#003638", mid: "#00423f", wl: "#006648", yellow: "#FBDF54", notifBg: "#001E1C" }
// Drawful:         { dark: "#1C5250", mid: "#245E5C", wl: "#3A9180", yellow: "#F5E8D8", notifBg: "#0F302F" }
// SoClover:        { dark: "#4C7523", mid: "#5A8026", wl: "#90A331", yellow: "#FBDF54", notifBg: "#2E4510" }
// Avalon:          { dark: "#0A1520", mid: "#121F2E", wl: "#1E3248", yellow: "#C9A84C", notifBg: "#060D14" }
// Telestrations:   { dark: "#1A0840", mid: "#200C52", wl: "#4A228C", yellow: "#FBDF54", notifBg: "#15062A" }
// Copycats:        { dark: "#1A0840", mid: "#200C52", wl: "#4A228C", yellow: "#FBDF54", notifBg: "#15062A" }
// Codenames, ReverseCharades, ExquisiteCorpse, MrWhite — derive from primary colors
```

### Pokes database table
All games share the same `pokes` table:
- `room_code` text, `from_player` text, `to_player` text | null, `message` text, `id` uuid, `created_at` timestamp
- Poke: `supabase.from("pokes").insert({ room_code, from_player, to_player: targetName, message: "👉" })`
- Message: same but `to_player: null` and `message` = the text

### Reset RPCs (used by Menu's Lobby tile)
- `tel_reset_game`, `gow_reset_game`, `ftw_reset_to_lobby`, `drawful_reset_game`
- `soclover_reset_to_lobby`, `avalon_reset_to_lobby`, `cc_reset_to_lobby`
- `reset_codenames_game`, `rc_reset_game`, `ec_reset_game`

### Game-specific behaviors
- **Fishbowl / ReverseCharades**: pass `timerRunning` to Footer — disables hamburger during active turn
- **Avalon**: pass `roleContent` JSX to Menu — shows "My Role" tile with hidden-role info
- **Team games** (Fishbowl, Codenames, ReverseCharades): pass `teamColor`/`teamLabel`/`teamTextColor` in `playerDetails` to Menu

---

## Supabase Schema Conventions

### Naming
- `{game}_games` — one row per active room, keyed by `code`
- `{game}_players` — one row per player, FK to `game_code`
- Exception: Fishbowl uses unprefixed `games`, `players`, `clues` (legacy)

### Standard Columns

`*_games`:
- `code` text UNIQUE NOT NULL — the join code
- `phase` text NOT NULL — `'lobby' | 'play' | 'finished'` (add more phases as needed)
- `host_id` uuid — player ID of the host
- `created_at` timestamp

`*_players`:
- `id` uuid PRIMARY KEY DEFAULT gen_random_uuid()
- `game_code` text REFERENCES games(code)
- `first_name` text
- `last_name` text
- `name` text — display name (computed or entered)
- `created_at` timestamp

Add game-specific columns (score, team, role, ready, etc.) beyond these.

### RPCs
Use Postgres RPC functions for any operation that must be atomic (start game, pass turn, end round). Name them `{game}_{operation}`, e.g. `gow_start_game`, `fishbowl_pass_turn`.

---

## Lobby Page Pattern

Every game's lobby follows this structure (top to bottom):

1. **Header** — game title with join code displayed prominently; Invite button (copies URL to clipboard)
2. **Phase-specific status** — e.g. team assignment strip, role selector, settings summary
3. **Player list** — grid or list with ready/status indicators; "(you)" label on self
4. **Join form** — shown only if player hasn't joined yet; first/last name inputs
5. **Game-specific content** — e.g. clue submission form (Fishbowl), question preview (GoW)
6. **Host controls** — Start button (disabled until valid state), optional settings panel
7. **Settings panel** — collapsible or separate screen; only visible to host

Ready state indicator: teal/green dot = ready, gray dot = not ready. Show count "X / Y ready".

### Player List — Two-Column Card Design

Player lists use a two-column card layout: a narrow number/index block on the left, a name block on the right. Use the game's cool-dark and mid-dark colors.

```jsx
<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
  {players.map((p, i) => (
    <div key={p.id} style={{ display: "flex" }}>
      <div style={{
        padding: "13px 0", minWidth: 48, flexShrink: 0,
        background: DARK,  // cool-dark hex
        fontSize: 18, fontWeight: 900, color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {i + 1}
      </div>
      <div style={{
        padding: "13px 16px", flex: 1,
        background: MID,   // mid-dark hex
        display: "flex", alignItems: "center",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          {p.name}
          {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
        </div>
      </div>
    </div>
  ))}
</div>
```

Exception: team-based games (Fishbowl, Avalon) use a team-grid layout instead.

### Start Button Logic
Always validate before enabling:
- Minimum player count met
- Teams balanced (if team-based)
- All players ready (or host overrides)
- Host is the one pressing it (check `playerId === game.host_id`)

---

## In-Game Page Pattern

1. **Status bar (top)** — round/phase indicator, score if relevant, timer if applicable
2. **Main content area** — the primary action for this player's role/turn
3. **Secondary info** — other players' status, waiting states, spectator views
4. **Action buttons (bottom)** — fixed to bottom, safe-area padded

Distinguish clearly between "it's your turn" and "you're waiting." Players who are waiting should see what's happening without being confused about whether they need to do something.

---

## Recurring Mechanics — Implementation Notes

### Timed Turns (Fishbowl)
- `turn_started_at` timestamp in DB + `turn_duration_seconds` config
- Client-side countdown computed from `Date.now() - turn_started_at`; do not store countdown in DB
- Use `setInterval` on client to tick the display; re-sync from DB on each poll/realtime update
- Timer end: client detects expiry and calls an RPC to advance state (don't trust client time alone — server also validates)

### Rounds
- `round_index` (0-based) + `rounds_total` in the games table
- `phase` transitions: `lobby → play → between_rounds → play → ... → finished`
- Between-rounds screen shows score summary before advancing

### Team Assignment
- Two teams; players choose or are auto-assigned
- Enforce balance: host can't start if teams differ by more than 1
- Visual: color-coded player rows, team name headers

### Advancing Between Phases — 50%+ Ready

When transitioning from a results or reveal screen (i.e. a screen players may want time to read), **never let a single player advance everyone**. Use a 50%+ ready system instead:

- All players see a "Next →" / "Ready" button
- Pressing it marks them ready in the DB (`ready_player_ids uuid[]` column on the games table)
- An RPC checks: if `array_length(ready_player_ids) * 2 >= player_count`, call the advance RPC and reset the array
- Players who have pressed show "X / Y ready — waiting for others…" instead of the button

Exception: pure transition screens with no content to absorb (e.g. a loading state between rounds) can auto-advance or allow any single player to advance.

```sql
-- Schema addition
ALTER TABLE {game}_games ADD COLUMN IF NOT EXISTS ready_player_ids uuid[] DEFAULT '{}';

-- RPC pattern
CREATE OR REPLACE FUNCTION {game}_mark_ready(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_ready int; v_total int;
BEGIN
  UPDATE {game}_games
  SET ready_player_ids = array_append(COALESCE(ready_player_ids, '{}'), p_player_id)
  WHERE code = p_code AND NOT (p_player_id = ANY(COALESCE(ready_player_ids, '{}')));
  SELECT COALESCE(array_length(ready_player_ids,1),0),
         (SELECT count(*) FROM {game}_players WHERE game_code = p_code)
  INTO v_ready, v_total FROM {game}_games WHERE code = p_code;
  IF v_ready * 2 >= v_total THEN
    PERFORM {game}_next_phase(p_code);
    UPDATE {game}_games SET ready_player_ids = '{}' WHERE code = p_code;
  END IF;
END; $$;
```

Reset `ready_player_ids = '{}'` in any reset/restart RPC as well.

### Voting
- Each player submits a vote (player ID or option index) into their row in `*_players`
- Host/server detects when all votes are in (count non-null votes vs. player count)
- Show "waiting for votes" with per-player status dots (voted = filled, not voted = empty)
- Reveal all at once — never show partial results until all votes are in

### Exclusive Votes (one voter per answer)
When the mechanic requires each answer/option to have at most one voter (e.g. Drawful's fake-answer voting where two players can't pick the same answer):
- Check at the SQL level before inserting: if `answer_id` already has a vote from a different voter, raise an exception
- On the client: compute `takenAnswerIds` from current votes, disable taken options with a "taken" label
- Bot logic must also filter out already-taken answers before picking

### Score Display
- Running totals on lobby/between-rounds screens
- Highlight leader; show delta from last round
- Sort players/teams by score descending

### Hidden Roles (Avalon)
- Role stored only server-side (or encrypted); never send full role list to clients
- Each player fetches only their own role
- RPC assigns roles atomically at game start
- "Evil sees evil" info: send evil player IDs only to players whose role grants that knowledge
- Identity card is accessed via the Menu's "My Role" tile — there is no floating mini-card

### useSubmitNudge
Some games use `lib/useSubmitNudge.js` — a hook that tracks whether the player has started typing/drawing and nudges them to submit. This file **must be committed to git** in every game that imports it. If a Vercel build fails with `Module not found: Can't resolve '../lib/useSubmitNudge'`, the file is on disk but untracked — run `git add lib/useSubmitNudge.js && git commit` and redeploy.