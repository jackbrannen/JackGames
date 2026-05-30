## Shared Component Rollout

Canonical files in `packages/shared/components/`, copied to all 12 games.
Do in small batches, deploy, test before continuing.

### Wired into all 12 games ✓
- [x] Footer — `components/Footer.js`
- [x] Menu — `components/Menu.js`
- [x] Notifications — `components/Notifications.js`

### Wired into Fishbowl, GameOfWhat, FirstToWorst ✓ (others pending)
- [ ] FooterButton — `components/FooterButton.js`
- [ ] Selections — `components/Selections.js` (GOW only; FTW doesn't use it)
- [ ] TextEntry — `components/TextEntry.js` (GOW only)
- [ ] WaitingList — `components/WaitingList.js`
- [ ] StatusBar — `components/StatusBar.js` (GOW only so far)
- [ ] RandomIdeas — `components/RandomIdeas.js` (GOW only so far)

### Components still to build
- [ ] **Duplicate detection** — works with TextEntry. Three modes: (1) within one player's fields — useDuplicates hook built ✓; (2) between players for bonus points (Drawful, GameOfWhat) — show bonus on submission; (3) between players to block (Fishbowl, ReverseCharades) — highlight and block. Modes 2-3 are game-specific (need DB data).

### Later
- [ ] End game screen — final scores / winning team / creation screenshots (Drawful, Telestrations, ExquisiteCorpse). Play again button. Pick a game modal button.
- [ ] Home screen — individual game home/join screen. Already exists, turn into component to eliminate inconsistencies.
- [ ] Results — mid-game results list. Shows submitted text, authors, who chose what. Supports multiple choosers/authors. Labels for correct answers.
- [ ] Lobby — room code + invite + rules at top. Three zones: numbered player list (grouped by team if applicable), name entry / join button, settings (if game has them).
- [ ] UI design / styles — audit and clean up type styles, colors, button styles across all games using styles.js.
- [ ] Dummy games — auto-join if username exists. Pre-fill text fields from random ideas list.

### Already done
- [x] GameModal — `components/GameModal.js`
- [x] Notifications — `components/Notifications.js`
- [x] FooterButton — `components/FooterButton.js` — auto-loading, nudge pulse, primary/secondary/danger variants
- [x] Selections — `components/Selections.js` — tap-to-select rows, ✕ deselect, own-item label
- [x] TextEntry — `components/TextEntry.js` — textarea/input, onTypingChange debounced callback
- [x] StatusBar — `components/StatusBar.js` — thin top strip, label + optional right node
- [x] RandomIdeas — `components/RandomIdeas.js` — draw button, chips, player name injection
- [x] sounds.js — `lib/sounds.js` — playSubmit, playYourTurn, playPoke
- [x] useDuplicates — `lib/useDuplicates.js` — within-player duplicate detection hook
- [x] WaitingList — `components/WaitingList.js`
- [x] styles.js — `components/styles.js` — design tokens used by all components

---

## Bug fixes

- SoClover: The Fifth Card setting should be editable before joining the game
- SoClover: The 5th card option can't currently be toggled on.
- SoClover: when the guesser rotates cards or the board, it is STILL not shown on other devices. The screen updates only when a card is moved. It should also update on card or board rotations. It also doesn't update when cards are taken off the board, only when they're put on it.
- GameOfWhat: auto-start round when all questions submitted — diagnostic logging deployed, root cause unconfirmed (check console for `[auto-start]` logs)
- Fishbowl: change minimum players to 4

### Recently fixed
- GOW Selections: pressing ✕ to deselect then blocked re-selection — fixed `changingVoteRef` reset + disabled ✕ buttons during submission
- GOW voting typing indicator: bubble now clears when player stops typing (using `channel.untrack()`)
- GOW submit nudge: wired to question field; FTW submit nudge wired to word fields
- GOW results: all players now see results screen (50%+ ready to advance via `gow_mark_question_ready`); removed redundant "Voted by" lines from answer cards
- GOW answering/voting: WaitingList shown to all players waiting, not just question author