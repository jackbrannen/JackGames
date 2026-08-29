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
| First to Worst | `firsttoworst` | Forest green `#004F45` | 3+ | Rank 5 words, group guesses your order |
| Drawful | `drawful` | Teal `#307977` | 4+ | Draw prompts, write fake answers, vote on the real one |
| So Clover | `soclover` | Yellow-green `#6B8C2A` | 2–6 | Arrange keyword cards, write clues, guess each other's boards |
| Telestrations | `telestrations` | Purple `#3D1060` | 4+ | Draw-guess telephone chain |
| Copycats | `copycats` | Purple `#4A1A80` | 4+ | Write answers, group finds the copycat |
| Codenames | `codenames` | — | 4+ | Teams guess words from one-word clues |
| Reverse Charades | `reversecharades` | — | 4+ | Group acts out clues, one person guesses |
| Exquisite Corpse | `exquisite-corpse` | — | 4+ | Collaborative drawing/writing chain |
| Nominations | `nominations` | Green `#a2d291` | 6+ | Teams argue who a superlative fits — one bluffs, the room votes |

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

## Testing Multi-User Games

### Testing with Single Browser (Dummy Games)

When testing game flow that requires multiple players, use dummy games + direct database manipulation:

1. **Create a dummy game**  
   Click "DUMMY GAME" button on home page. This sets `is_dummy: true` in the database.

2. **Join as test user**  
   Join normally in the browser (this will be your "real" player for testing UI interactions).

3. **Add additional test players via database**  
   ```javascript
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(url, key);
   
   await supabase.from('[game]_players').insert([
     { game_code: 'CODE', name: 'test_player_2', first_name: 'Test', last_name: 'Two' },
     { game_code: 'CODE', name: 'test_player_3', first_name: 'Test', last_name: 'Three' }
   ]);
   ```

4. **Advance game state manually**  
   For testing phases that require all players to complete an action:
   ```javascript
   // Mark players as having submitted (adjust table/column names per game)
   await supabase.from('[game]_players')
     .update({ questions_submitted: true })
     .eq('game_code', 'CODE')
     .neq('name', 'your_test_player');
   
   // Or insert required data directly
   await supabase.from('[game]_answers').insert([
     { game_code: 'CODE', player_id: id2, round: 0, answer: 'test answer' }
   ]);
   
   // Manually advance phase if needed
   await supabase.from('[game]_games')
     .update({ phase: 'voting', current_round: 0 })
     .eq('code', 'CODE');
   ```

5. **Use browser to test the real flow**  
   With dummy players in the database, test the actual UI interactions and button states for your test player.

### Why Not Multiple Browser Tabs?

Browser tabs share localStorage, so they all appear as the same player. Incognito tabs work but are harder to manage. Direct database manipulation is faster for testing game logic.

### Dummy Game Auto-Fill

Dummy games automatically pre-fill text input fields with random ideas when a phase starts (only if `game.is_dummy === true`). This speeds up testing but shouldn't auto-submit — you still click buttons to advance.

### Local Dev Server Ports

Always start a game's dev server with an explicit, fixed `-p <port>` — never bare `npm run dev`. Left to auto-pick, `next dev` grabs whichever port is free, which changes every run; since the saved username/profile lives in `localStorage` (scoped per-origin, and the port is part of the origin on `localhost`), a random port silently "forgets" the tester's saved name on every restart.

Assigned ports (reuse the same one for a game every time — add a new row here rather than letting a new game auto-pick):

| Game | Port | Game | Port |
|---|---|---|---|
| Codenames | 3401 | AlphaJam | 3411 |
| Copycats | 3402 | Avalon | 3412 |
| Decrypto | 3403 | Drawful | 3413 |
| GameOfWhat | 3404 | ExquisiteCorpse | 3414 |
| SamePage | 3405 | FirstToWorst | 3415 |
| WhatOnEarth | 3406 | JackGames (hub site) | 3416 |
| Fishbowl | 3407 | MrWhite | 3417 |
| ReverseCharades | 3408 | SoClover | 3418 |
| HearingVoices | 3409 | SoundBoard | 3419 |
| SecretPhrase | 3410 | Telestrations | 3420 |
| Typecast | 3320 | ThingsInRings | 3421 |
| StyleGuide | 3099 | WordBirds | 3422 |
| Nominations | 3423 | | |

**Don't restart a dev server that's already running for an ordinary edit.** `next dev`'s Fast Refresh picks up file changes on its own — a manual kill+restart (or worse, running `next build` against a game mid-iteration, even with the server killed first) can crash a browser tab that's still open on that game: the tab survives the restart, its connection drops and reconnects against a different build ID, and Fast Refresh can spin into a runaway reload loop. Only touch a running dev server if it's actually stuck, and warn before doing so if a tab might be open on it.

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

### Likes (cosmetic, unlike votes)
Separate from the scoring vote — a Jackbox-style "like" any voter can drop on submitted answers while voting is live (Copycats, Game of What, Drawful):
- `{game}_likes` table: `(round/question_id scope, liker_id, liked/answer id)`, unique per (scope, liker, target) so a toggle call inserts or deletes the row
- RPC `{game}_toggle_like` rejects liking your own answer; never touches score
- Live tally: fetched/subscribed the same way as votes so counts update in real time for everyone during voting — no "reveal all at once" gating like real votes
- UI: `Selections` component's `showLikes`/`likeCounts`/`likedIds`/`onToggleLike` props render a heart button per non-mine row, independent of vote selection state
- End game: aggregate likes across the whole game (not just final round) and show a "Most Liked" superlative via `EndGame`'s `aboveScores` slot — ties share the callout

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
