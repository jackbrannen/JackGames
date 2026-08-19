# Secret Phrase — UI Text & Mechanics Draft

Please edit this file directly (copy, wording, anything) and hand it back before I start coding.

---

## Game summary (confirm this matches your intent)

- 2 teams: **Boys** / **Girls** (exact copy/colors reused from Fishbowl — orange `#F97316` / magenta `#C026D3`)
- Min 4 players total, min 2 per team. Teams do **not** need to be equal size.
- One team holds a secret phrase each turn ("phrase team"); the other team is the "guessing team." Roles strictly alternate every turn.
- The primary answerer, secondary answerer, AND the guessing team's "official guesser" are all auto-assigned by the game at turn start (no in-app picking) — each player is primary exactly once, secondary exactly once, and official guesser exactly once across the game (extras distributed fairly if teams are uneven, same compromise as the turn-count rule below). The official guesser is always on the opposing (guessing) team from that turn's primary/secondary.
- Each answerer gets their own **answer timer** (default 20s, configurable 10/15/20/25/35/40/45s per game via lobby Settings) and doesn't see the phrase until they personally tap "Start my answer (N seconds)." Other phrase-team members (not currently answering) can always see the phrase. The countdown bar itself is visible to **everyone**, both teams, the whole time — only the phrase content is gated.
- **Only the official guesser asks questions and speaks for the guessing team** — other guessing-team members are consultants/spectators, not co-askers. This applies to both the primary and secondary rounds.
- Turn flow (phase names in parens are the DB `turn_phase` values — all of the below happens within a single `answering` row, driven by client-computed sub-states from `primary_started_at`/`secondary_started_at` timestamps, same pattern as HearingVoices):
  1. **Primary wait** — primary sees "Tap Start…", no phrase. Guesser sees "Come up with a question…"; everyone else waits.
  2. **Primary timer** — primary taps Start → phrase appears for them + countdown (visible to all). Guesser's "come up with a question" prompt hides while the timer runs (they should be asking/listening, not reading instructions) — guesser asks verbally.
  3. **Primary time's up** — banner "⏰ Time's up!" for everyone; phrase stays visible to primary. Secondary's own Start button appears **immediately, no lockout** (guesser's next unlock still has the 3s lockout, unchanged).
  4. **Secondary timer** — secondary taps Start → phrase appears for them + fresh countdown.
  5. **Secondary time's up** — banner again; after a 3s lockout, the turn's official guesser (and only them) sees a footer button: **"Guess the phrase"** → opens a local confirm modal, "Make your official guess" (explains: say your final guess out loud now, don't reveal until official) with a **"Reveal Secret Phrase"** button. That's the real transition — straight to `guess_confirm` for everyone, phrase now visible to all.
  6. **Guess confirm** (`guess_confirm`) — everyone gets inline **Correct** / **Incorrect** buttons (not footer), with a live team-grouped vote tracker updating in real time as votes land. Majority decides; an exact 50/50 split resolves to Correct. Correct → guessing team scores a point.
  7. **Turn result** (`turn_result`) — phrase + running score + the same team-grouped vote breakdown (final state) shown to everyone, "Next turn →" (50%+ ready, like between-rounds screens elsewhere).
- Turn order / fairness: at game start, total turns = 2 × (larger team's size). The larger team's players are each primary exactly once, secondary exactly once, and guesser exactly once (randomized order, no repeats needed — turn count for them equals their own team size). The smaller team fills the same number of primary/secondary/guesser slots; extras are handed out fairly among them until the counts match. Order is locked in at game start, not recomputed live.
- Phrases: AI-generated pool of 30, stored in Supabase, regenerated (+24) whenever the pool drops to 6 or fewer. Prompt already tested/approved.
- Game ends after all turns are used; final scoreboard via the shared EndGame component.

Confirmed: 100% verbal — the app never captures the question or either answer.

---

## Home page (recycled from Fishbowl — exact copy pattern)

- Title: `Secret Phrase`
- Subtitle: `Slip the secret phrase into your answer—the other team guesses it.`
- Create button: `Create Game` (loading: `Creating…`)
- Join button: `Join`
- Join code input placeholder: `Room code`
- Dummy game button: `Dummy Game` (loading: `Setting up…`)
- Error prefix: `Error: `
- Name fields: `First name`, `Last name`, `Display Name`

## Lobby

- Header redesigned to match Fishbowl's convention: small uppercase "SECRET PHRASE" eyebrow label, then the room code as the large two-tone headline (not the game title) — Invite + How to Play stacked top-right.
- How to Play button opens a modal with the shared `game_instructions` table content (`game_key = 'secretphrase'`).
- Settings (⚙️ cog, same button row) opens a modal to set answer duration: `10s` / `15s` / `20s` (default) / `25s` / `35s` / `40s` / `45s`, writes directly to `secretphrase_games.answer_duration_seconds`, live for anyone in the lobby (no lock/editor concept, matches the game's overall low-ceremony settings model).
- Team labels: `Boys` / `Girls`
- Swap team button: `Change Genders` (matches Fishbowl exactly)
- Joining a team auto-marks the player ready (no separate ready toggle in the UI — removed entirely).
- Start button: `Start Game` (loading: `Starting…`)
- Team balance blocker: `Need at least 2 players per team to start.`
- Invite button: `Invite`, copied confirmation: `Link copied!`
- Post-lock join notice: `Game already started. New players cannot join.`
- Turn-count preview line under the player list, e.g. `8 turns total — 4 each`

## In-game

**Persistent team bar** (under the top status bar, shown during Answering):
`[Team] Team · You know the secret phrase` / `[Team] Team · You're guessing the secret phrase` (no "You: {name}" label — removed)

**Timer bar** — thin depleting bar directly under the team bar, visible to everyone whenever a timer is running (green above 30% remaining, red below). Hidden only during primary_wait, before anyone has started.

**"Time's up!" banner** — full-width red strip, shown to everyone right when either timer hits zero.

**Official guesser card** — full-width block, shown above the First/Second answerer row, visible to everyone throughout Answering: eyebrow `OFFICIAL GUESSER`, guesser's name, small text `Can consult their team.`

**Answering — role text**
- Phrase card label: `The secret phrase`; First/Second answerer row shows `{primary name}` / `{secondary name}`, active one highlighted.
- Primary, before starting: `Tap Start when you're ready to answer using the secret phrase.` (footer: `Start my answer (N seconds)`)
- Primary, timer running: `You have to use this secret phrase in your answer.`
- Primary, after: `Nice work! Waiting for {secondary} now.`
- Secondary, before primary's time is up: `Waiting for {primary} to answer…`
- Secondary, unlocked (immediately, no lockout): `Tap Start when you're ready to answer using the secret phrase.` (footer: `Start my answer (N seconds)`)
- Secondary, timer running: `You have to use this secret phrase in your answer.`
- Secondary, after: `Nice work!`
- Other phrase-team members (3+ person teams): `Waiting for {primary or secondary, whichever is current} to answer…`
- **Official guesser** (only them): `Come up with a question {primary} has to answer using the secret phrase.` before primary starts; hidden while either timer runs; `Get ready to ask {secondary} the same question.` during primary's time's-up window.
- **Everyone else on the guessing team** (constant): `{guesser name} is asking the questions this turn.`
- Footer button, **exclusive to the official guesser**, appears once unlocked (3s lockout) after secondary's time's up: `Guess the phrase` → opens confirm modal:
  - Title: `Make your official guess`
  - Body: `This is the moment to say your final guess out loud. Don't reveal the phrase until your guess is official.`
  - Button: `Reveal Secret Phrase` (this is the real transition to Guess confirm)

**Guess confirm** (phrase now visible to everyone)
- Header: `Did they guess the phrase?`
- Helper: `Vote based on what {guesser name} said out loud.`
- Buttons: `✅ Correct` / `❌ Incorrect` — **inline in the page content**, not the footer.
- Live team-grouped vote tracker below the buttons (`Boys` / `Girls` columns), updating in real time via realtime as each player votes.

**Turn result**
- Header (correct): `They got it!` — header (incorrect): `So close — the phrase was:`
- Phrase card: `"{phrase}"`
- Score line: `Boys 3 · Girls 2`
- Same team-grouped vote breakdown as Guess confirm, final state (`Didn't vote` shown as `—` for anyone whose vote never landed).
- Button: `Next turn →` (50%+ ready), waiting state: `{x}/{y} ready — waiting…`

## End game (recycled EndGame component)
- Standard `Game Over` header, sorted scores, `Play Again` / existing button set — no new copy needed unless you want a superlative callout (e.g. "Most turns as primary") — let me know if you want one.

---

## Color

Primary: `#2434C4`
- dark (cool-dark): `#2920AD`
- mid (mid-dark): `#2224B7`
- wl (warm-light): `#2858DB`
- yellow accent: standard `#FBDF54`
