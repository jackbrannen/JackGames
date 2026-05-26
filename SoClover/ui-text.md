# So Clover — UI Text

## Home Screen
- Title: **So Clover**
- Tagline: *Cooperative word game*
- Primary CTA: **Create Game**
- Join input placeholder: *Room code*
- Join button: **Join**

## Lobby
- Header: **🍀 So Clover**
- Invite button: **Invite**
- Section header: **Players — {n}**
- You label: *you*
- Host label: *host*
- Join section header: **Join Game**
- First name placeholder: *First name*
- Last name placeholder: *Last name*
- Join button: **Join** / *Joining…*
- How to play header: **How to Play**
- How to play body: *Each player arranges 4 keyword cards on their clover board and writes a single clue word connecting each pair of adjacent cards. Then everyone takes turns guessing one board — placing all 5 cards (4 real + 1 decoy) in the right slots and rotation.*
- Start button: **Start Game** / *Starting…* / *Need 2+ Players*

## Clue-Writing Phase
- Status bar: **ARRANGE YOUR BOARD**
- Instruction: *Drag cards onto the board, rotate to choose which words show, then write a clue for each corner.*
- Pool label: **YOUR CARDS — drag to board**
- Pool empty state: *All cards placed*
- Clue input placeholder: *clue*
- Submit button: **Submit My Board** / *Submitting…* / *Fill all 4 slots* / *Write all 4 clues*
- Slot empty label: TOP / RIGHT / BOTTOM / LEFT
- Rotate button: **↻**

## Waiting for Others
- Status bar: **WRITING CLUES**
- Heading: **{n} / {total} ready**
- Subtext: *Waiting for everyone to submit their clues…*

## Guessing Phase (active guesser)
- Status bar: **BOARD {n} / {total} — {owner name}**
- Hint (attempt 1): *{guesser name} — place all 5 cards, rotate to match the clues*
- Hint (attempt 2): *Attempt 2 — place the remaining {n} card(s)*
- Pool label: **CARDS — drag to board**
- Pool empty state: *All placed — submit when ready*
- Submit button: **Submit Guess** / **Submit Guess (Attempt 2)** / *Checking…* / *Place all {n} remaining cards*

## Guessing Phase (spectator / board owner)
- Owner notice: **Your board — watch {guesser name} guess**
- Spectator label: *{guesser name} is guessing…*
- Owner label: *Your board is being guessed!*

## Scoring 1 (attempt 1 results)
- Heading: **{n} / 4 correct — attempt 2 coming up**
- Subtext: *Correct slots stay locked. {guesser name} gets one more try with the remaining cards.*
- Continue button (guesser only): **Continue to Attempt 2 →**

## Round Summary (board complete)
- Perfect (5 pts): 🎉
- Good (3–4 pts): ✨
- OK (0–2 pts): 💪
- Points display: **{n} point(s)**
- Perfect bonus label: *Perfect round! +1 bonus*
- Correct board label: *Correct board — owned by {name}*
- Ready count: *{n} / {total} ready to continue*
- Next button: **Next Board →** / *Waiting for others…*

## Final Scoreboard
- Status bar: **FINAL SCORE**
- Score display: **{total pts}**
- Subtext: *out of {max} possible points*
- Section header: **Board Results**
- Board row: *Guessed by {name} · {n} pts*
- Play again (host only): **Play Again 🍀**

## Error Messages
- Clue has space: *Clues must be a single word*
- Clue is a keyword: *"{CLUE}" is one of your keywords — pick a different clue*
- Not joined: *You haven't joined this game. [Back to lobby]*
- Loading: *Loading…* / *Setting up…*
- Game not found: *Game not found*
