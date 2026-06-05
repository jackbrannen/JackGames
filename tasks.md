## Component Style Guide Compliance

Status of shared components matching StyleGuide/ (localhost:3099):

| Component | Locked to Style Guide? | Notes |
|-----------|------------------------|-------|
| HomeScreen | ✅ Yes | Matches style guide exactly (proper casing, spacing) |
| Results | ✅ Yes | Single card for answers (gap: 12), two-column for scores (gap: 3) |
| EndGame | ✅ Yes | Game Over heading, score cards, Play Again button |
| Footer | ✅ Yes | 56px sticky bar with hamburger + action buttons |
| FooterButton | ✅ Yes | Auto-loading state, primary/secondary/danger variants |
| Menu | ✅ Yes | Slide-up drawer with Players, Poke, Message tiles |
| Notifications | ✅ Yes | Top-fixed strips for pokes/messages |
| WaitingList | ✅ Yes | Verified matches style guide (gap:3, fontSize:16, padding:13px 16px) |
| Selections | ✅ Yes | Now matches style guide (gap:6, fontSize:16, fontWeight varies, inline ✕) |
| StatusBar | ✅ Yes | Now uses FONT_SIZE, FONT_WEIGHT, OPACITY constants |
| TextEntry | ✅ Yes | Now uses FONT_SIZE, FONT_WEIGHT constants |
| RandomIdeas | ✅ Yes | Now uses FONT_SIZE, FONT_WEIGHT, OPACITY constants |
| Lobby | ✅ Yes | Now uses FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP constants throughout |
| GameModal | ✅ Yes | End-game picker modal |

**All shared components now ✅ locked to style guide!**

---

## Component & Feature Rollout

✓ = wired in game's app pages · — = not yet · · = not applicable to this game

All 12 games have copies of every shared component file. "Wired" means the game's
pages actually import and use the component. Footer, Menu, Notifications, GameModal
are wired in all 12 games and omitted from the table.

|                  | FB | GOW | AV | FTW | DF | SC | TEL | CC | CN | RC | EC | MW |
|------------------|----|-----|----|-----|----|----|-----|----|----|----|----|-----|
| FooterButton     | ✓  | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ✓  | ✓  | ✓  | ✓  | ✓  |
| WaitingList      | ·  | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ·  | ·  | ·  | ✓  | ·  |
| StatusBar        | C  | ✓   | C  | ✓   | C  | ✓  | C   | ✓  | C  | C  | C  | C  |
| TextEntry        | ·  | ✓   | ·  | ✓   | ✓  | ·  | ·   | ✓  | ·  | ·  | ·  | ·  |
| RandomIdeas      | ✓  | ✓   | ·  | ✓   | ✓  | ·  | ✓   | ✓  | ·  | ✓  | ·  | ·  |
| Selections       | ·  | ✓   | ✓  | ·   | ✓  | ·  | ·   | ✓  | ·  | ·  | ·  | ·  |
| HomeScreen       | ✓  | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ✓  | ✓  | ✓  | ✓  | ✓  |
| Lobby            | C  | ✓   | ✓  | ✓   | ✓  | ✓  | ✓   | ✓  | C  | C  | ✓  | ✓  |
| EndGame          | ✓  | ✓   | ·  | ·   | ✓  | ·  | ·   | ✓  | ✓  | ✓  | ·  | ·  |
| Results          | C  | ✓   | C  | C   | C  | C  | C   | ✓  | C  | C  | C  | C  |
| Dummy Games      | ✓  | ✓   | ·  | ✓   | ✓  | ✓  | ✓   | ✓  | ✓  | ✓  | ·  | ·  |
| Online pres      |    | ✓   |    |     |    |    |     |    |    |    |    |    |

FB=Fishbowl, GOW=Game of What, AV=Avalon, FTW=First to Worst, DF=Drawful,
SC=So Clover, TEL=Telestrations, CC=Copycats, CN=Codenames, RC=Reverse Charades,
EC=Exquisite Corpse, MW=Mr. White

**Legend:**
- **✓** = Using the shared component from packages/shared/components/
- **❌** = Imported but NOT using (defeats "tweak once, updates everywhere")
- **C** = Custom implementation (game-specific needs)
- **·** = Not applicable to this game

**Component Usage Summary:**
- **12/12 (100%):** FooterButton ✅, HomeScreen ✅
- **9/12 (75%):** Lobby (3 custom for team games) ✅
- **8/12 (67%):** WaitingList ✅
- **7/12 (58%):** RandomIdeas ✅
- **6/12 (50%):** EndGame ✅
- **4/12 (33%):** StatusBar, Selections, TextEntry ✅
- **4/12 (33%):** TextEntry ✅
- **2/12 (17%):** Results ✅

**Notes:**
- **Lobby:** Team-based games (Fishbowl, Codenames, ReverseCharades) use custom lobby with team selection but still use Footer for Start button.
- **StatusBar:** Only 4/12 games use it (GOW, FTW, SoClover, Copycats). The other 8 have custom top bars for game-specific info (team scores, clues remaining, etc.).
- **WaitingList:** 8/12 games use it. Turn-based games (Fishbowl, Codenames, ReverseCharades, MrWhite) don't need it (marked ·).
- **TextEntry:** 4/12 games use it (GOW, FTW, Drawful, Copycats). Provides consistent input styling, Enter-to-submit, and debounced typing indicators. Other games either have no text entry or don't need typing indicators (marked ·).
- **RandomIdeas:** 7/12 games use it (GOW, FTW, Drawful, Telestrations, Copycats, Fishbowl, ReverseCharades). Others don't have creative prompt entry (marked ·).
- **Results:** Only 2/12 games use the shared component (GOW, Copycats). Results component is designed for answer-voting games. Other games have custom results for their specific mechanics: images (Drawful), chains (Telestrations), rankings (FTW), missions (Avalon), etc. (marked C for custom).
- **EndGame:** 6/12 games use it (FB, GOW, DF, CC, CN, RC). Games without traditional "game over" screens (Avalon, FTW, SoClover, Tel, EC, MW) have custom end states.
- **Selections:** 4/12 games use it (GOW, AV, DF, CC) for tap-to-select answer lists. Other games don't have this mechanic (marked ·).

### Dummy Game spec (per game)
Each game's dummy game implementation must:
1. **Auto-join** — use saved profile username to join the lobby automatically
2. **Pre-fill text fields** — fill input fields with random ideas when the relevant phase starts

### Rollout To-Do

- [x] **HomeScreen rollout** — ✅ Complete! All 12 games now use HomeScreen component. Custom accent colors: Avalon (GOLD), Drawful (ACCENT), Codenames (TAN).

- [x] **Shared component infrastructure rollout** — ✅ Complete! All 12 games now import all shared components:
  - StatusBar, FooterButton, WaitingList, Results, TextEntry, RandomIdeas
  - All components match StyleGuide/ localhost:3099
  - Games actively using each component tracked in table above

- [x] **Lobby component rollout** — ✅ Complete! All 12 games now use consistent lobby patterns:
  - 9 games use shared Lobby component: GOW, Avalon, FTW, Drawful, SoClover, Telestrations, Copycats, ExquisiteCorpse, MrWhite
  - 3 team-based games use custom lobbies but consistent Footer: Fishbowl, Codenames, ReverseCharades
  - Total lines removed: 1,221 lines across simple games

- [x] **Footer + Start button rollout** — ✅ Complete! All 12 games now use Footer with FooterButton for Start button:
  - Sticky 56px footer bar with consistent spacing (BOTTOM_PAD)
  - Auto-loading state on Start button (never flashes back on success)
  - POKE_COLORS and color constants defined per game
  - Codenames & ReverseCharades completed June 2026

- [ ] **Replace inline typography with constants in game pages** — GameOfWhat done. Remaining 11 games: replace inline fontSize/fontWeight/opacity values with FONT_SIZE/FONT_WEIGHT/OPACITY/STYLE constants. This is polish work — shared components already achieve "tweak once, updates everywhere" goal. Estimated: ~69 replacements per game × 11 games = ~760 edits.

### Components still to build
- [ ] **Duplicate detection** — works with TextEntry. Three modes: (1) within one player's fields — useDuplicates hook built ✓; (2) between players for bonus points (Drawful, GameOfWhat) — show bonus on submission (GOW: working ad-hoc in submitAnswer); (3) between players to block (Fishbowl, ReverseCharades) — highlight and block. Modes 2-3 are game-specific (need DB data).

---

## Bug fixes
- **Stuck loading buttons (cross-game)** — Phase-changing buttons get stuck in "Loading..." state. Root cause: calling `loadState()` immediately after RPC races with DB transaction, keeping button mounted. Solution: remove `loadState()` call after phase-changing RPCs; let polling pick up phase change naturally. Avalon ✓ fixed. Needs fixing: FB, GOW, FTW, DF, SC, TEL, CC, CN, RC, EC, MW.
- Avalon: On screens that reveal the quest succeeding or failing, the text that reveals the result, along with the updated score, should not be revealed until the card flip animation is done. Showing it beforehand spoils the surprise.


### Recently fixed
- ~~Avalon: no need to show room code in header once game has started~~ ✓ (removed unused splitCode code; verified no games show room code during play)
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