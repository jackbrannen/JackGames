## Shared Component Rollout

Canonical files in `packages/shared/components/`, copied to all 12 games.
Do in small batches, deploy, test before continuing.

### Wired into all 12 games ✓
- [x] Footer — `components/Footer.js`
- [x] Menu — `components/Menu.js`
- [x] Notifications — `components/Notifications.js`

### Built — needs wiring into game pages
- [ ] FooterButton — `components/FooterButton.js`
- [ ] Selections — `components/Selections.js`
- [ ] TextEntry — `components/TextEntry.js`
- [ ] WaitingList — `components/WaitingList.js`

### Components still to build
- [ ] **Duplicate detection** — works with TextEntry. Three modes: (1) within one player's fields — useDuplicates hook built ✓; (2) between players for bonus points (Drawful, GameOfWhat) — show bonus on submission; (3) between players to block (Fishbowl, ReverseCharades) — highlight and block. Modes 2-3 are game-specific (need DB data).

### Later
- [ ] End game screen — final scores / winning team / creation screenshots (Drawful, Telestrations, ExquisiteCorpse). Play again button. Pick a game modal button.
- [ ] Home screen — individual game home/join screen. Already exists, turn into component to eliminate inconsistencies.
- [ ] Results — mid-game results list. Shows submitted text, authors, who chose what. Supports multiple choosers/authors. Labels for correct answers.
- [ ] Score display — in hamburger menu. On results screen shows points gained this round with reasons.
- [ ] Lobby — room code + invite + rules at top. Three zones: numbered player list (grouped by team if applicable), name entry / join button, settings (if game has them).
- [ ] Status bar — thin strip at top showing whose turn it is. No scores or invite code here.
- [ ] Random ideas — button below text entry areas. Works as currently coded.
- [ ] UI design / styles — audit and clean up type styles, colors, button styles across all games using styles.js.
- [ ] Dummy games — auto-join if username exists. Pre-fill text fields from random ideas list.

### Already done
- [x] GameModal — `components/GameModal.js`
- [x] Notifications — `components/Notifications.js`
- [x] FooterButton — `components/FooterButton.js` — auto-loading, nudge pulse, primary/secondary/danger variants
- [x] Selections — `components/Selections.js` — tap-to-select rows, ✕ deselect, own-item label
- [x] TextEntry — `components/TextEntry.js` — textarea/input, onTypingChange debounced callback
- [x] sounds.js — `lib/sounds.js` — playSubmit, playYourTurn, playPoke
- [x] useDuplicates — `lib/useDuplicates.js` — within-player duplicate detection hook
- [x] WaitingList — `components/WaitingList.js`
- [x] styles.js — `components/styles.js` — design tokens used by all components

---

## Bug fixes

- SoClover: The Fifth Card setting should be editable before joining the game
- SoClover: The 5th card option can't currently be toggled on.
- SoClover: when the guesser rotates cards or the board, it is STILL not shown on other devices. The screen updates only when a card is moved. It should also update on card or board rotations. It also doesn't update when cards are taken off the board, only when they're put on it.
- GameofWhat: when all questions are submitted, no need to make players choose to start the round. Just go ahead and start it.