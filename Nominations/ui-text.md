# Nominations — UI Text

Every-man-for-himself: **no teams.** Individual scores only.

## Scoring
- **Voter:** +1 for correctly picking the bluffer. Wrong guesses score nothing.
- **Truth-teller:** +1 for every voter who saw through the bluff (i.e. didn't point at them).
- **Bluffer:** **+2** for every voter they fool. Bluffing is the harder seat, so it pays double — which is also what makes it worth choosing.

This replaced an earlier team-based rule (correct → truth-teller's team, wrong → bluffer's team), which gave every voter a fixed incentive to vote against their own team's rep regardless of the speeches — team membership alone told you the score-maximising vote. An intermediate proposal (speakers score per vote *received*) was rejected for the opposite reason: it made getting caught the bluffer's best outcome.

## Lobby
- Game name: **Nominations**, single "Join" button, flat player list, no teams
- Min players notice: needs 6
- Start confirm modal: "Start the game?" / "{total_rounds} rounds — one per superlative. Are all players in?"

## Writing phase
- Header: "Write your superlative"
- Subtext: Something like "Most likely to…" or "Best…". **Don't pick one with an obvious answer** for this group — the fun is in the surprise.
- Waiting screen after submit: "Waiting for everyone…" + WaitingList

## Assignment phase (all up front, before round 1)
Everyone is dealt a superlative that isn't their own (a rotation guarantees no one draws their own), and the whole running order is built before play starts.

**Every player answers everything in one uninterrupted sitting — nobody is ever called back.** That matters for secrecy as much as convenience: under the earlier design only players holding a truth-teller slot got recalled, so being pulled back to your phone was itself a tell.

Each player is asked, in order:
1. **Role choice** — "How do you want to play it?" over their superlative well, with "You'll argue two superlatives this game. This is the one you get to choose how to play — someone else will argue it against you."
   - **Truth-teller** — "You get to pick who you argue for."
   - **Bluffer** — "The game picks who you argue for, but you get double points for each person you fool."
2. **Own target** (only if they chose truth-teller) — "Superlative 1 of 2" / "You're the truth teller." / "Who does this fit best?"
3. **Second superlative** (always) — "Superlative 2 of 2" / "Your second superlative" / "Who does this one fit best?" with the explanation: *"You'll argue this one too, but the other player decides whether you tell the truth on it or bluff — so you might not get to use this pick. If you end up telling the truth, this is your answer. If you end up bluffing, the game hands you someone else instead."*

That third pick is speculative: used if they turn out to be that round's truth-teller, replaced by a random target if they end up bluffing it. Bluffers never see their target until their round's reminder screen.

- **Slots:** each round's second speaker is fixed at deal time by rotation, so every player gets exactly one own assignment + exactly one partner slot — 2 speaking slots each, always. Roles are *not* guaranteed one of each: you can be bluffer twice or truth-teller twice depending on how choices line up.
- **No ready-up.** Finishing your last pick *is* the ready signal — round 1 starts automatically once every round has a role and a truth-teller target. Until then: "You're all set" / "Waiting on everyone else to finish picking. Round 1 starts on its own." + WaitingList.

## Round (voting opens immediately — no "ready to speak" gate)
- Superlative in a `#323340` well, shown to **everyone**
- **"Giving speeches"** heading (same size/weight as "Who's the bluffer?") over the two speakers, listed 1/2 in a randomly decided speaking order. Round order is shuffled too.
- **The two speakers** get a full-width white **"You're up"** bar under the status bar (matching ThingsInRings/SoundBoard), then their private reminder: "You're the bluffer." / "You're the truth teller.", a **Tap to reveal** for who they're arguing for, and the speaking order. No vote UI.
- **Everyone else** votes right away, with the vote block pushed to the bottom of the screen: "Who's the bluffer?" / "Vote after they've given their speeches." → tap a name → "Lock it in". One button-height (64px) of breathing room below the last option.
- After voting: "Vote locked in" + WaitingList of who's voted
- Round advances to reveal once every eligible voter has voted

## Reveal
- "{bluffer} was the bluffer", superlative well
- Two speaker rows with their points: "{truth-teller} truthfully picked {target} +N" / "{bluffer} bluffed with {target} · 2 pts each fooled +N" (the bluffer's badge shows the doubled total)
- "Got it right (+1 each)" — green ✓ (`#357C4F`) · "Got it wrong" — red ✗ (`#991B1B`) · "Nobody" in italics if empty
- Button: "Next round →" / "See final score →", 50% ready to advance

## Game over
- Individual ranked leaderboard via the shared EndGame component (winner highlighted)
- Round-by-round cards: superlative in a well, who bluffed with whom and how many they fooled, who truthfully picked whom and how many believed them, and who spotted the bluffer
- Play Again / Play Another Game

## Colors
- Main: `#a2d291` · Dark: `#7bc688` · Light: `#c5dc93`
- Superlative wells + footer buttons + score pills: `#323340`, white text
- Correct/green `#357C4F` · Wrong/red `#991B1B` · WaitingList row `#C5DD94`
