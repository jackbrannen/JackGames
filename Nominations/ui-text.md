# Nominations — UI Text

## Lobby
- Game name: **Nominations**
- Join buttons: "Join Boys" / "Join Girls" (teal / pink)
- "Change Genders" button (always visible once joined, matches HearingVoices)
- Min players notice: needs 6 total, 2+ per team
- How to Play:
  > At the start, everyone writes a superlative — "Most likely to…", "Best…", or your own. Don't pick one with an obvious answer among this group.
  >
  > Each round, one boy and one girl are picked and shown the same superlative — never their own. One of them is secretly the **bluffer**, assigned a random other player to argue it's about. The other is the **truth-teller**, and picks whoever they genuinely think it fits best.
  >
  > Both argue their case out loud. Nobody else knows who's bluffing.
  >
  > Once everyone's heard enough, the room votes on who they think the bluffer is. Fool people and your team scores; get caught and the other team scores instead.
- Start confirm modal: "Start the game?" / "{total_rounds} rounds — one per superlative. Are all players in?"
  - Player list sorted boys-then-girls.

## Writing phase
- Header: "Write your superlative"
- Subtext: "Something like **Most likely to…** or **Best….** Any superlative **(coolest…, smallest…, weirdest…,** etc.) is valid.

**Don't pick one with an obvious answer for this group**—the fun is in the surprise."
- Placeholder: ""
- Waiting screen (after submit): "Waiting for everyone…" + WaitingList (blue done-dots)

## Choosing phase
- Superlative is shown in a `#323340` well with white text, no quotation marks (the well already implies it's a quote).
- Both instruction screens below follow the same order: **well → role heading → subtext.**
- **Bluffer's screen** — redesigned so nothing on-screen gives away the role to someone glancing at their phone:
  - Superlative well
  - Heading: "You're the bluffer."
  - "Convince everyone this is true of this person:"
  - Single light-green **"Tap to reveal"** button, mid-screen
  - Tapping it plays a minimalist fade/scale reveal and swaps the button for the target's name
  - Below the button: "Make them think you're NOT the bluffer by making it sound like you picked this person on your own."
  - Footer: "Ready to give my speech" — disabled until revealed
  - Once readied, the screen swaps entirely to a plain "Waiting for your partner…" state (own separate return, so the footer button actually unmounts instead of getting stuck on "Loading…")
- **Truth-teller's screen:**
  - Superlative well
  - Heading: "You're the truth teller."
  - "Who does this fit best?"
  - List of eligible players (tap to select) — excludes self and the bluffer's target (the two speeches can never coincidentally point at the same person); selection shown by color only (yellow = selected), no border, never grayed out; tapping a different name freely changes the pick any time before readying up
  - Footer: while unpicked, plain white text "Lock in your choice"; once a target is picked, "Ready to give my speech" button appears
  - Once ready, screen collapses to a plain "Waiting for your partner…" state (list hidden)
- **Everyone else's screen:**
  - Header: "Nominators this round"
  - Shows the two current players' names (not roles)
  - Subtext: "They're each getting their assignment."
  - StatusBar score uses the HearingVoices-style Boys/Girls pill design

## Speech + voting phase (combined)
- **The two paired players' screen:** "Giving your speech…" (unchanged)
- **Everyone else's screen** — shown immediately once speeches start, no separate "ready to vote" gate:
  - Header: "Listen to the speeches, then pick the bluffer."
  - Two name buttons (boy/girl) — tap to select, color-only (yellow = selected), freely changeable
  - Footer: "Lock it in" — disabled until a name is selected; submits the vote
  - After locking in: "Vote locked in" + WaitingList (blue done-dots) showing who else has voted
  - Once everyone eligible has voted, phase advances straight to reveal (no intermediate voting phase)

## Reveal phase
- Heading: "{bluffer} was the bluffer" (above the well)
- Well: superlative only (`#323340`, white text, no quotes)
- "Got it right:" — list of correct guessers, green ✓ (`#357C4F`) — "Nobody" (italic) if empty
- "Got it wrong:" — list of wrong guessers, red ✗ (`#991B1B`) — "Nobody" (italic) if empty
- Below both: both team totals together — "+N Boys" and "+N Girls" pills (same style as the top-right score display)
- StatusBar score uses the HearingVoices-style Boys/Girls pill design
- Button: "Next round →" / "See final score →" with "{n}/{total} ready…" waiting state
- **Scoring:** each voter who guesses correctly (names the real bluffer) scores a point for **their own team** — not for the truth-teller's team. This was changed from the original spec after realizing the original rule (correct → truth-teller's team, wrong → bluffer's team) gave every voter a fixed incentive to always vote against their own team's rep regardless of the actual speeches, since team membership alone told you the score-maximizing vote. Scoring the voter's own team removes that exploit — honest guessing is always good for your team no matter which side the bluffer landed on. Wrong guesses score nothing for anyone.

## Game over
- "Boys Win" / "Girls Win" / "It's a Tie"
- Team score boxes (teal / pink), matching Fishbowl's end-game team pattern
- Round-by-round history: one card per round — "Round N" label, superlative in a `#323340` well, "{bluffer} was the bluffer", then "Got it right" / "Got it wrong" name lists (comma-separated, compact), then both team "+N" badges together. Cards on a `WARM_LIGHT` surface for visual separation from the page background.
- Play Again / Play Another Game buttons

## Colors
- Main: `#a2d291` (page background)
- Dark: `#7bc688` (header bar, section surfaces)
- Light: `#c5dc93` (buttons/light surfaces)
- Superlative wells: always `#323340` with white text
- Correct/green: `#357C4F` · Wrong/red: `#991B1B`
- WaitingList row background: `#C5DD94` (its own surface, distinct from `Light`, so the done-dot doesn't collide with the row color)
