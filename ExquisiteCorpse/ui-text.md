# Exquisite Corpse — Proposed UI Text

All copy, labels, and messages for the game. Sections marked with existing-game patterns
are locked to match the shared UX — don't change these unless you want to diverge from
the other games.

---

## Meta

**Proposed primary color:** `#1A3A5C` (deep navy)  
**Accent color:** `#FBDF54` (universal yellow — do not change)  
**Minimum players:** 4  
**Rounds per game:** One per player (4 players = 4 rounds, each player draws 4 times)

---

## Home Page
*(Matches Fishbowl / GameOfWhat / Telestrations pattern exactly)*

**Game title:** Exquisite Corpse

**Tagline:** Cooperative blind drawing game.

**Create button:** Create Game  
**Create button (loading):** Creating…

**Room code input placeholder:** Room code  
**Join button:** Join

**Dummy game button (bottom, subtle):** Dummy Game  
**Dummy game button (loading):** Setting up…

---

## Lobby Page
*(Matches GameOfWhat / Fishbowl / Telestrations pattern exactly)*

**Invite button:** Invite  
*(Copies URL to clipboard or uses navigator.share)*

**Section: Join form**
- Section label: Join Game
- First name placeholder: First name
- Last name placeholder: Last name
- Display name placeholder: Display Name
- Join button: Join
- Join button (loading): Joining…

**Section: Players**
- Section label: Players
- Empty state: No players yet

**Start button (host, enough players):** Start Game  
**Start button disabled note:** Minimum 4 players needed  
*(Button disabled until 4 players.)*

**Info text below start button (once 4+ players joined):**  
[N] players = [N] rounds. Every player draws on every chain.

---

## Drawing Phase — Round 1

**Phase label (small caps):** ROUND 1 OF [N]

**Instruction:** Start something and adjust your fold line. The next player will only see below your fold line.

**Fold line handle label:** FOLD  
**Fold line hint (shown once on first round, dismisses after 3 seconds):**  
Drag the fold line — the next player only sees what falls below it.

**Fold line position range:** 70%–90% of canvas height (default 80%)

**Random ideas section:**
- Label: ✦ Random ideas
- First tap button: ✦ 3 more ideas
- Subsequent taps button: ✦ 3 more ideas
- Exhausted state: No more ideas
*(Word-chip prompts appear below button, same as GameOfWhat / Telestrations)*

**Submit button:** Done Drawing  
**Submit button (loading):** Submitting…

**Submit blocked (canvas is blank):** Draw something first!  
*(Button stays disabled / grayed out — no modal, no confirmation)*

---

## Drawing Phase — Rounds 2–N

**Phase label (small caps):** ROUND [N] OF [N]

**Peek strip label (subtle text above the peek strip):** ↑ previous drawing

**Peek strip boundary label (at the bottom edge of the peek strip):** YOUR CANVAS STARTS HERE

**Instruction:** Add to the drawing below the fold. You can draw over the existing art, but can't erase it.

**Fold line handle label:** FOLD  
**Fold line hint (shown once, first time a peek is visible):**  
The next player will only see below your fold line.

*(Random ideas section — same as Round 1)*

**Submit button:** Done Drawing  
**Submit button (loading):** Submitting…

**Submit blocked (new canvas area is blank):** Draw something first!  
*(Button stays disabled / grayed out — no modal, no confirmation)*

---

## Waiting Screen (after submitting, between rounds)

**Message:** Waiting for everyone to finish…

**Progress:** [N] of [N] done

**Per-player status:**
- Done: [Name] ✓
- Still drawing: [Name] …

---

## Round Transition Screen

**Heading:** Round [N] complete!

**Chain passing message:** Chains are moving…

**Next round prompt:** You're now drawing on a mystery chain.

**Sub-note (subtle):** You'll see what the last player left you. No peeking whose it is — find out at the reveal!

**Button (host advances all players):** Start Round [N+1]  
*(Non-host players see: "Waiting for [host name] to start the next round…")*

---

## Reveal Phase — Waiting to Start

**Heading:** Time to reveal!

**Body:** Each artist reveals their own chain, one at a time.

**Reveal order:** Revealing in this order: [Name 1] → [Name 2] → [Name 3] → [Name 4]  
*(Random order determined at game start)*

**Chain owner's button (when it's their turn):** Reveal My Chain

**Chain owner waiting for their turn:** Your chain reveals [Nth] — hang tight.

**Non-owner players waiting:** Waiting for [current presenter name] to reveal their chain…

---

## Reveal Phase — Presenter View (chain owner revealing their chain)

**Phase label:** YOUR CHAIN

**Instruction (before any segment revealed):**  
Tap Reveal to show each layer one at a time.

**Reveal button:** Reveal

**Segment counter:** Layer [X] of [N]

**Segment label when revealed:** [Player name who drew this layer] added this

**After final segment revealed:**  
That's the full exquisite corpse!

**Next chain button (after all segments shown):** Next chain →  
*(Advances to the next presenter in reveal order)*

---

## Reveal Phase — Audience View (watching someone else's chain)

**Watching message:** [Presenter name] is revealing their chain!

**Watching header:** [Presenter name]'s chain

**Segment counter:** Layer [X] of [N] revealed

**Segment label when revealed:** [Player name who drew this layer] added this

*(Each segment appears on ALL screens simultaneously the moment the presenter taps Reveal — same as Telestrations. Audience screens update in real time; no polling delay.)*

---

## End Screen (all chains revealed)

**Heading:** That's a wrap!

**Subtext:** This is your reminder to take screenshots.

**Play again button:** Play again  
**Back to lobby button:** Back to lobby

---

## Error / Edge Case Messages
*(Matches other games)*

**Game not found:** Game not found. Check the code and try again.  
**Game already started:** This game has already started.  
**Name taken:** That username is already taken in this game. Please choose another.  
**Generic error:** Something went wrong. Refresh and try again.

---

## Design Notes for Implementation
*(Remove this section before building — these are flags for review)*

- **Peek strip vs. canvas boundary**: The peek strip sits at the top of the player's view. A visible horizontal rule or label marks where their new canvas begins. Players can draw freely anywhere below the peek strip's top edge (including on top of the peek strip itself) but the eraser is disabled for any pixels that were part of the incoming image.
- **Fold line draggability**: The fold line shows a draggable handle on the right side. It snaps to the 70%–90% range of the player's new square only (not the peek strip).
- **Canvas dimensions**: Each player's new drawing area is a square. The total canvas height = square + peek strip height. The peek strip height = whatever area the prior player had below their fold line.
- **Stitching for reveal**: Player 1's full canvas is shown. Each subsequent layer is composited below, starting at the prior player's fold line. The overlap zone blends naturally since player 2 drew on top of player 1's peek area.
- **Reveal order**: Randomized when the host starts the reveal phase. Stored in game state so all clients agree on order.
- **No names during drawing**: No player name is shown anywhere during drawing rounds — not on the phase label, not on the peek strip label, not on the round transition. The anonymity is the game. Names are only revealed during the reveal phase, as each segment is uncovered.
- **Blank canvas blocking**: "Done Drawing" button is disabled (not just warned) if the player's new canvas area has no marks. No confirmation modal — just keep the button grayed out.
- **Reveal sync**: When the presenter taps Reveal, the newly revealed segment is written to DB immediately and all audience clients pick it up via realtime subscription — same pattern as Telestrations. The presenter's reveal_index is the source of truth.
- **Who can advance rounds**: Only the host taps "Start Round [N]." The reveal "Reveal" button is only active on the chain owner's screen.
