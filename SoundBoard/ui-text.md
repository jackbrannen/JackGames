# Sound Board — UI Text

Edit this file and return it before coding begins.

---

## Colors (red/gold theme; HSB-derived)
- **Main theme (accent, buttons, active states):** #88192B (red)
- **Cool-dark (headers, status bars):** #711515 (hue +10° toward blue, brightness -9%)
- **Mid-dark (wells, cards, panels):** #7B171F (hue +5°, brightness -5%)
- **Warm-light (inputs, buttons):** #9F1D48 (hue -10° toward orange, brightness +9%)
- **Gold (high-value word cards, primary action buttons):** #A57C31
- **Card base background:** #FFFFFF (white), darkening toward gold as value rises
- **Card base text:** #2A303C
- **Boys team:** #21273D
- **Girls team:** #D85571
- **Results modal — correct rows:** #407F56 · **wrong/missed rows:** #C42D40

---

## Games list (games.jackbrannen.com card)
- **Name:** Sound Board
- **Players:** 4+ players
- **Description:** Make sound effects. Your team has to guess what you meant.
- **Instructions (How to Play body):**
  Two teams. Everyone submits words at the start; those become the pool for the whole game.

  On your turn, pick 1–3 words from the board. When the countdown ends, you have 4 seconds to make sound effects for the words you picked — no talking, no miming, just noises. Your teammates each pick up to 3 words they think you meant.

  Score +1 per correct guess, -1 per word you picked that they missed, -1 per word they guessed that you didn't pick.

  Correctly guessed words leave the board; new ones take their place. 
  
  Here's the catch: words that stick around get more valuable — up to 9 points — the longer they survive.

  First team to [16] points wins.

---

## Home / Join Page
**Game title:** Sound Board
**Subtitle (small, uppercase, muted):** Make the sound. Guess the word.

**[Create button]:** Create Game
**[Create button — loading]:** Creating…
**[Room code input placeholder]:** Room code
**[Join button]:** Join

---

## Lobby
**[Header game name label — small uppercase]:** Sound Board
**[Room code]:** displayed prominently below
**[Invite button]:** Invite

**[Join section label — small uppercase]:** Join Game
**[First name placeholder]:** First name
**[Last name placeholder]:** Last name
**[Display name placeholder]:** Display Name
**[Team columns — header]:** Boys / Girls
**[Join buttons]:** Join Boys / Join Girls
**[Join button — loading]:** Joining…
**[Username taken error]:** That username is taken.

**[Players section label — small uppercase]:** Players
**[Player list — empty state]:** No players yet
**[Player self-label — small, inline, muted]:** you
**[Switch teams button]:** Switch Genders
**[Min players warning]:** Each team needs 2+ players to start.

**[Start CTA label — small uppercase, above button]:** All players in?
**[Start button]:** Start Game

**[Not found state]:** Room not found.
**[Loading state]:** Loading…

### Settings (⚙️ cog, host-configurable pre-start)
**[Settings header]:** Game Settings
**[Who goes first — label]:** Who goes first?
**[Who goes first — options]:** Girls / Boys (default: Girls)
**[Win score — label]:** Points to win
**[Win score — default]:** 16
**[Save button]:** Save

---

## Phase 1: Word Submission
**[Section label — small uppercase]:** Your 5 sounds
**[Instruction]:** Write 5 words or phrases other players could make sound effects for. Anything goes. They can be traditional sound effects or more something more abstract or subjective.

**[Field placeholders]:**
- Word 1
- Word 2
- Word 3
- Word 4
- Word 5

**[Random ideas button]:** ✦ Random ideas
**[Random ideas button — more]:** ✦ 3 more ideas
**[Random ideas button — exhausted]:** No more ideas
*(Tapping a generated idea does nothing — it's inspiration only, not fillable.)*

**[Submit button]:** Submit
**[Submit button — loading]:** Submitting…
**[Validation — empty fields]:** Fill in all 5 before submitting.
**[Validation — duplicates]:** No duplicates allowed.

---

## Phase 1b: Waiting for Submissions
**[Section label — small uppercase]:** Waiting for everyone…
**[Player status — submitted]:** Ready
**[Player status — still writing]:** Writing…
**[Status dots]:** teal = submitted, gray = not yet

---

## Phase 2: Main Board
**[Top bar — small uppercase]:** [Boys/Girls] · [Name]'s turn
**[Board section label]:** small uppercase, muted — not shown unless helpful

**[Card point badge]:** small numeral in corner of each card, 1–9
**[It player — instruction]:** Pick 1 to 3 words. Only you can see your picks.
**[It player — lock in button]:** Lock In
**[It player — lock in button, disabled]:** Pick at least 1 word
**[Non-it players — waiting label]:** Waiting for [Name] to choose…

---

## Phase 2b: Synced Countdown
**[Countdown caption]:** [Name] is about to make sounds…
**[Countdown numerals]:** 3 · 2 · 1
*(Same synced-timestamp mechanism as Word Birds.)*

---

## Phase 2c: Sounds! Screen
**[Big inverted text]:** Sounds!
**[Timer bar]:** drains over 4 seconds (visual only, no numeral needed)
*(Colors invert from the theme — e.g. red background, white/gold text — for high visibility.)*
**[It player — no extra copy; they just make sounds]**

---

## Phase 3: Guessing
**[Top bar — small uppercase]:** [Boys/Girls] · [Name] was making sounds
**[Instruction — guessers]:** Select up to 3 words you think [Name] meant.
**[Instruction — it player / other team, read-only]:** Watching [teammates] guess…
**[Footer submit button]:** Submit Guess
**[Footer submit button — disabled]:** Pick at least 1 word
**[Footer submit button — loading]:** Submitting…
**[Live selection indicator on cards]:** subtle highlight/outline per teammate selecting (shared visibility while choosing)

---

## Phase 3b: Results Modal (per player, individually dismissed)
**[Header]:** Your Results
**[Correct row]:** ✓ [word] +[n]
**[Missed row — it selected, you didn't]:** ✗ [word] -[n]
**[Wrong row — you selected, it didn't]:** ✗ [word] -[n]
**[Total row]:** Total: [+/-n]
**[Dismiss button]:** Got It

---

## Phase 3c: Board Replenish (animation)
- Correctly guessed cards fade out + scale down, then vacate.
- New cards fade in + scale up into the vacated slots.
- Surviving cards briefly pulse as their point badge increments and background shifts a shade toward gold.
*(Sequenced: clear → refill → pulse, ~600–900ms total, non-blocking.)*

---

## Phase 4: More Words Needed (pool exhausted)
**[Modal header]:** More words needed
**[Modal body]:** The word bank is empty. Let's add more!
**[Button]:** Write More
*(Not dismissible except via the button. Shown to each player right after they dismiss their own Phase 3b results modal.)*

### Phase 4b: Top-Up Submission
**[Section label — small uppercase]:** 3 more sounds
**[Field placeholders]:** Word 1 / Word 2 / Word 3
**[Random ideas button]:** ✦ Random ideas
**[Submit button]:** Submit

### Phase 4c: Waiting for Top-Up
**[Section label — small uppercase]:** Waiting for everyone…
*(Same WaitingList pattern as Phase 1b.)*

---

## Footer Menu (⚙️ mid-game settings)
**[Settings header]:** Adjust Scores
**[Boys score — label]:** Boys
**[Girls score — label]:** Girls
**[Save button]:** Save

---

## Game Over
**[Heading]:** [Boys/Girls] Win!
**[Final score row]:** Boys [n] · Girls [n]

**[Play Again button]:** Play Again
**[Play Another Game button]:** Play Another Game

**[Word history section — label]:** Every word this game
**[Word history row]:** [word] — written by [Name] · scored by [Name, Name…] *(blank/muted if never scored)*
- Note: [word] above should by styled differently from other text in the row. [Name] should also be styled differently so it's easy to scan for.

---

## Error / Loading States
**[Room not found]:** Room not found.
**[Game in progress]:** That game has already started.
**[Generic loading]:** Loading…
**[Generic error — muted]:** Something went wrong. Try refreshing.
