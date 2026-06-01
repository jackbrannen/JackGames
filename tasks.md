## Component & Feature Rollout

✓ = wired in game's app pages · — = not yet · · = not applicable to this game

All 12 games have copies of every shared component file. "Wired" means the game's
pages actually import and use the component. Footer, Menu, Notifications, GameModal
are wired in all 12 games and omitted from the table.

|                  | FB | GOW | AV | FTW | DF | SC | TEL | CC | CN | RC | EC | MW |
|------------------|----|-----|----|-----|----|----|-----|----|----|----|----|-----|
| FooterButton     | ✓  | ✓   |    | ✓   |    |    |     |    |    |    |    |    |
| WaitingList      |    | ✓   |    | ✓   |    |    |     | ✓  |    |    |    |    |
| StatusBar        |    | ✓   |    |     |    | ✓  |     |    |    |    |    |    |
| TextEntry        |    | ✓   |    | ✓   |    |    |     |    |    |    |    |    |
| RandomIdeas      |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| Selections       |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| HomeScreen       |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| Lobby            |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| EndGame          |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| Results          |    | ✓   |    |     |    |    |     |    |    |    |    |    |
| **Dummy Games**  |    | ✓   |    | ✓   |    |    |     |    |    |    |    |    |
| **Online pres.** |    | ✓   |    |     |    |    |     |    |    |    |    |    |

FB=Fishbowl, GOW=Game of What, AV=Avalon, FTW=First to Worst, DF=Drawful,
SC=So Clover, TEL=Telestrations, CC=Copycats, CN=Codenames, RC=Reverse Charades,
EC=Exquisite Corpse, MW=Mr. White

### Dummy Game spec (per game)
Each game's dummy game implementation must:
1. **Auto-join** — use saved profile username; fall back to a placeholder name
2. **Pre-fill text fields** — fill input fields with random ideas when the phase starts
3. **Bot automation** — bots auto-submit their moves so the game progresses without waiting

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
- Change the pick a new game flow at the end of the game:
	- Someone picks a new game, it opens that game and drops them immediately into the lobby
	- Then it sends a pop-up message to the remaining players who are still on the end game screen of the previous game saying "[Name] has invited you to play [Game]" with a "Join" button. When pressed, drops them right into the lobby for that game.

### Recently fixed
- GOW Selections: pressing ✕ to deselect then blocked re-selection
- GOW voting typing indicator: bubble now clears when player stops typing
- GOW submit nudge: wired to question field; FTW submit nudge wired to word fields
- GOW results: all players now see results screen (50%+ ready to advance)
- GOW answering/voting: WaitingList shown to all players waiting
- FTW dummy game: uses saved profile name; pre-fills word fields; bots auto-rank
