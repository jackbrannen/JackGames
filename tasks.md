## Component & Feature Rollout

✓ = wired in game's app pages · — = not yet · · = not applicable to this game

All 12 games have copies of every shared component file. "Wired" means the game's
pages actually import and use the component. Footer, Menu, Notifications, GameModal
are wired in all 12 games and omitted from the table.

|                  | FB | GOW | AV | FTW | DF | SC | TEL | CC | CN | RC | EC | MW |
|------------------|----|-----|----|-----|----|----|-----|----|----|----|----|-----|
| FooterButton     | ✓  | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ✓  | ·  | ✓  | ✓  | ✓  |
| WaitingList      |    | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ✓  |    |    | ✓  |    |
| StatusBar        |    | ✓   |    |     |    | ✓  |     |    |    |    |    |    |
| TextEntry        |    | ✓   |    | ✓   |    |    |     |    |    |    |    |    |
| RandomIdeas      |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| Selections       | ·  | ✓   | ✓  | ·   | ✓  | ·  | ·   | ✓  | ·  | ·  | ·  | ·  |
| HomeScreen       |    | ✓   |    |     |    |    |     | ✓  |    |    |    |    |
| Lobby            |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| EndGame          | ✓  | ✓   | ·  | ·   | ✓  | ·  | ·   | ✓  | ✓  | ✓  | ·  | ·  |
| Results          |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| **Dummy Games**  | ✓  | ✓   | ·  | ✓   | ✓  | ✓  | ✓   | ✓  | ✓  | ✓  | ·  | ·  |
| **Online pres.** |    | ✓   |    |     |    |    |     |    |    |    |    |    |

FB=Fishbowl, GOW=Game of What, AV=Avalon, FTW=First to Worst, DF=Drawful,
SC=So Clover, TEL=Telestrations, CC=Copycats, CN=Codenames, RC=Reverse Charades,
EC=Exquisite Corpse, MW=Mr. White

### Dummy Game spec (per game)
Each game's dummy game implementation must:
1. **Auto-join** — use saved profile username to join the lobby automatically
2. **Pre-fill text fields** — fill input fields with random ideas when the relevant phase starts

### Components still to build
- [ ] **Duplicate detection** — works with TextEntry. Three modes: (1) within one player's fields — useDuplicates hook built ✓; (2) between players for bonus points (Drawful, GameOfWhat) — show bonus on submission (GOW: working ad-hoc in submitAnswer); (3) between players to block (Fishbowl, ReverseCharades) — highlight and block. Modes 2-3 are game-specific (need DB data).

---

## Bug fixes

- ~~SoClover: The Fifth Card setting should be editable before joining the game~~ ✓
- ~~SoClover: The 5th card option can't currently be toggled on.~~ ✓
- ~~SoClover: when the guesser rotates cards or the board, it is STILL not shown on other devices.~~ ✓
- ~~GOW: remove skip as an option~~ ✓
- ~~GOW: Dummy games: answer fields not pre-populated~~ ✓
- ~~GOW: Selections "my answer" style doesn't match style guide~~ ✓
- ~~GOW: Scores showing during normal round screens~~ ✓
- ~~GOW/others: Selections and WaitingList look too similar~~ ✓
- ~~Back to lobby from hamburger menu doesn't work~~ ✓ (all 12 games)
- ~~Change the pick a new game flow at the end of the game~~ ✓ (picker navigates immediately; others see invite banner with Join button)
- ~~change the scores component to look like the player list component with scores on the left in boxes. Then change player list component. Instead of numbering the players, just have a count at the top.~~ ✓
- ~~UI style guide has some contradictions: two notification styles, an old score card.~~ ✓
- ~~Game of What: take away multiple rounds option. All games are just one round.~~ ✓
- ~~The "stepped away" feature is very unreliable. Gives false positives and false negatives.~~ ✓
- ~~GOW: can't press X to deselect~~ ✓
- ~~GOW: Score display doesn't match UI style guide.~~ ✓
- ~~GOW/others: Selections and WaitingList look too similar~~ ✓
- ~~GOW: Results - Needs to show both who voted for something and who selected it. Component-level fix.~~ ✓

### Recently fixed
- ~~GOW: Selections "my answer" style doesn't match style guide~~ ✓
- ~~GOW: Scores showing during normal round screens~~ ✓
- ~~Back to lobby from hamburger menu doesn't work~~ ✓ (all 12 games)
- ~~FTW dummy game~~ ✓ (auto-join + pre-fill word fields)
- ~~GOW Selections: pressing ✕ to deselect then blocked re-selection~~ ✓
- ~~GOW voting typing indicator: bubble now clears when player stops typing~~ ✓
- ~~GOW submit nudge: wired to question field; FTW submit nudge wired to word fields~~ ✓
- ~~GOW results: all players now see results screen (50%+ ready to advance)~~ ✓
- ~~GOW answering/voting: WaitingList shown to all players waiting~~ ✓
- ~~FTW: eliminate the page with the "Let's Do This" button that starts rounds. Unnecessary.~~ ✓
- ~~FTW: play again button doesn't work~~ ✓
 