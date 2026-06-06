# Games Documentation

Reference documentation for implementation patterns, component specs, and recurring mechanics. Consult this when building features — not meant to be memorized.

---

## Games Catalog

Each game is deployed to its own Vercel subdomain under `jackbrannen.com`.

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

### Team-Based Games
Fishbowl, Codenames, and Reverse Charades use two teams:
- Show team badges in Menu's Players tile (pass `teamColor`/`teamLabel` in `playerDetails`)
- Disable hamburger while timer running (pass `timerRunning` to Footer)
- Use team-grid player list layouts instead of numbered layout

Avalon has hidden roles (not teams) — do NOT show role info in Players tile.

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
  layout.js          # Minimal — sets html/body styles
  page.js            # Home/join page
  [code]/page.js     # Lobby
  [code]/play/page.js # In-game
lib/
  supabase.js        # Single Supabase client instance
  words.js or prompts.js  # Game-specific content
```

---

## Color System

Every game has a primary background color. Derive zone colors using HSB formulas.

**Derivation formulas:**
- **Cool-dark** (headers, status bars): hue +10° toward blue, brightness −9%, saturation unchanged
- **Mid-dark** (wells, cards, panels): hue +5°, brightness −5%
- **Warm-light** (inputs, buttons): hue −10° toward orange, brightness +9%

**Never use `rgba(0,0,0,X)` or `rgba(255,255,255,X)` overlays.** Always derive explicit hex. Exception: full-screen modal backdrop at 0.7+ opacity.

**For actual color values:** See `StyleGuide/app/page.js` lines 5-17. Each game has `bg`, `dark`, `mid`, `wl`, and `yellow` defined there.

When adding a new game: compute primary in HSB, apply formulas, convert back to hex. Yellow `#FBDF54` is universal accent (exception: Drawful uses warm cream `#F5E8D8`).

---

## Shared Assets

### Random Ideas List
One canonical list in Supabase table `random_ideas` (single column `idea` text). Shared across Game of What and First to Worst.

- To add/edit: update `random_ideas` table in Supabase dashboard
- To use: call `get_random_ideas(p_count, p_exclude)` RPC
- `p_exclude` is `text[]` of already-shown ideas

---

## Code Patterns

Fishbowl is the most mature game. Copy its patterns.

### Game Code Generation
Two concatenated words from word list (e.g. `MAPLERIVER`). Uniqueness checked against DB (loop up to 10 attempts).

### Player ID Persistence
Format: `localStorage:[gamename]:[code]:playerId`  
Example: `fishbowl:MAPLERIVER:playerId`

### Realtime + Polling
All games use BOTH: Supabase Realtime + 1.5s polling. Never rely on only one. See CODE_PATTERNS.md for implementation.

### Profile Management
All games share profile: `localStorage:jackgames:profile` + cookie `jackgames_profile` (domain `.jackbrannen.com`).

**Cookie is authoritative.** localStorage can be stale. Always merge with local as base, cookie as override.

For implementation code, see CODE_PATTERNS.md.

---

## Shared Components

Canonical sources in `packages/shared/components/`. Each game has copy at `[Game]/components/[Name].js`. To update: edit canonical, copy to all 12 games.

**Full specs live in comment at top of each component file.**

### Component List

| Component | File | What it does |
|---|---|---|
| HomeScreen | `components/HomeScreen.js` | Game home/join page — title, tagline, Create/Join buttons |
| Lobby | `components/Lobby.js` | Pre-game lobby shell — header, player list, settings/start/join slots |
| EndGame | `components/EndGame.js` | Final scores — "Game Over", sorted scores, Play Again/Another buttons |
| Results | `components/Results.js` | Post-question results — answer groups, votes, bonus labels, points |
| Footer | `components/Footer.js` | Sticky 56px bottom bar — hamburger left, action buttons right |
| FooterButton | `components/FooterButton.js` | Action button for Footer — auto-loading, nudge pulse, variants |
| Menu | `components/Menu.js` | Slide-up drawer — Players, Poke, Message, optional tiles |
| Notifications | `components/Notifications.js` | Poke/message strips at top — tap/swipe to dismiss |
| WaitingList | `components/WaitingList.js` | Player rows with status dots, inline poke buttons |
| Selections | `components/Selections.js` | Tap-to-select rows with ✕ deselect, own-item label |
| TextEntry | `components/TextEntry.js` | Textarea/input with debounced `onTypingChange` |
| StatusBar | `components/StatusBar.js` | Thin top strip — label + optional right node |
| RandomIdeas | `components/RandomIdeas.js` | Draw button, idea chips, player name injection |
| GameModal | `components/GameModal.js` | Game-picker modal at end of game |

### Shared Lib Files

| File | What it does |
|---|---|
| lib/sounds.js | Audio feedback: `playSubmit`, `playYourTurn`, `playPoke` |
| lib/useDuplicates.js | Within-player duplicate detection |
| lib/useBlockingDuplicates.js | Between-player blocking duplicates (Fishbowl, ReverseCharades) |
| lib/useTypingPresence.js | Tracks which players are typing via Supabase presence |
| components/styles.js | Design tokens (FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD, STYLE) |

### Key Constants
```js
export const FOOTER_H = 56  // height of sticky footer bar

const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`
// Use for paddingBottom on scrollable content
```

### Pokes Database Table
All games share same `pokes` table:
- Columns: `room_code` text, `from_player` text, `to_player` text | null, `message` text, `id` uuid, `created_at` timestamp
- Poke: `supabase.from("pokes").insert({ room_code, from_player, to_player: targetName, message: "👉" })`
- Message: same but `to_player: null` and `message` = the text

### Game-Specific Behaviors
- **Fishbowl / ReverseCharades**: pass `timerRunning` to Footer — disables hamburger during turn
- **Avalon**: pass `roleContent` JSX to Menu — shows "My Role" tile
- **Team games**: pass `teamColor`/`teamLabel`/`teamTextColor` in `playerDetails` to Menu

---

## Supabase Schema Conventions

### Naming
- `{game}_games` — one row per room, keyed by `code`
- `{game}_players` — one row per player, FK to `game_code`
- Exception: Fishbowl uses unprefixed `games`, `players`, `clues` (legacy)

### Standard Columns

**`*_games`:**
- `code` text UNIQUE NOT NULL — join code
- `phase` text NOT NULL — `'lobby' | 'play' | 'finished'` (add more as needed)
- `created_at` timestamp

**`*_players`:**
- `id` uuid PRIMARY KEY DEFAULT gen_random_uuid()
- `game_code` text REFERENCES games(code)
- `first_name` text
- `last_name` text
- `name` text — display name
- `created_at` timestamp

Add game-specific columns (score, team, role, ready, etc.) beyond these.

### RPCs
Use Postgres RPC functions for atomic operations. Name: `{game}_{operation}` (e.g. `gow_start_game`, `fishbowl_pass_turn`).

---

## Lobby Page Pattern

Every lobby follows this structure (top to bottom):

1. **Header** — game title with join code; Invite button (copies URL)
2. **Phase-specific status** — team assignment, role selector, settings summary
3. **Player list** — grid/list with ready indicators, "(you)" label on self
4. **Join form** — shown if player hasn't joined; first/last name inputs
5. **Game-specific content** — clue submission (Fishbowl), question preview (GoW)
6. **Start button + settings** — Start disabled until valid state, optional settings panel

**Player list:** Two-column card layout — narrow number/index block left, name block right. Use cool-dark and mid-dark colors. See CODE_PATTERNS.md for JSX.

Exception: team-based games use team-grid layout.

**Ready indicator:** teal/green dot = ready, gray = not ready. Show "X / Y ready".

**Start button:** Visible to all players. Validate: min player count, teams balanced (if team-based).

---

## In-Game Page Pattern

1. **Status bar (top)** — round/phase indicator, score, timer
2. **Main content** — primary action for this player's role/turn
3. **Secondary info** — other players' status, waiting states, spectator views
4. **Action buttons (bottom)** — fixed to bottom, safe-area padded

Distinguish "it's your turn" vs "you're waiting" clearly.

---

## Recurring Mechanics

### Timed Turns (Fishbowl)
- `turn_started_at` timestamp in DB + `turn_duration_seconds` config
- Client countdown: `Date.now() - turn_started_at` (don't store in DB)
- Use `setInterval` to tick; re-sync from DB on poll/realtime
- Timer end: client detects expiry, calls RPC (server also validates)

### Rounds
- `round_index` (0-based) + `rounds_total` in games table
- Phase transitions: `lobby → play → between_rounds → play → ... → finished`
- Between-rounds screen shows score summary before advancing

### Team Assignment
- Two teams; players choose or auto-assigned
- Enforce balance: can't start if teams differ by >1
- Visual: color-coded rows, team name headers

### Advancing Between Phases — 50%+ Ready

For results/reveal screens (content to read), never let one player advance everyone. Use 50%+ ready:

- All see "Next →" / "Ready" button
- Pressing marks ready in DB (`ready_player_ids uuid[]`)
- RPC checks: if `array_length(ready_player_ids) * 2 >= player_count`, advance
- Ready players see "X / Y ready — waiting..."

Exception: pure transition screens (no content) can auto-advance.

See CODE_PATTERNS.md for RPC implementation. Reset `ready_player_ids = '{}'` in reset RPCs.

### Voting
- Each player submits vote into their row in `*_players`
- Server detects all votes in (count non-null vs player count)
- Show "waiting for votes" with status dots (filled = voted, empty = not)
- Reveal all at once — never show partial results

### Exclusive Votes
When each answer has ≤1 voter (e.g. Drawful fake-answer voting):
- Check at SQL level: if `answer_id` has vote from different voter, raise exception
- Client: compute `takenAnswerIds`, disable taken options with "taken" label
- Bot logic: filter out taken answers before picking

### Score Display
- Running totals on lobby/between-rounds screens
- Highlight leader; show delta from last round
- Sort players/teams descending

### Hidden Roles (Avalon)
- Role stored server-side (or encrypted); never send full list to clients
- Each player fetches only their own role
- RPC assigns roles atomically at game start
- "Evil sees evil": send evil player IDs only to players whose role grants that knowledge
- Identity card accessed via Menu's "My Role" tile — no floating mini-card
