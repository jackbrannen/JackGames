## Shared Component Rollout

Canonical files in `packages/shared/components/`, copied to all 12 games.
Do in small batches, deploy, test before continuing.

### Built but needs spec corrections before wiring
- [ ] **Menu** — currently includes Message and Poke tiles, which should be hidden. "Players" tile should become "Scores" (listing scores) in games with scoring, with poke buttons inline. Games with teams should group by team. Settings tile needed for Fishbowl. See spec below.
- [ ] **Footer** — currently dims/disables during timer. Spec says it should not appear at all during timer (Fishbowl, ReverseCharades).

### Built — needs wiring into game pages
- [ ] Footer — `components/Footer.js` — spec at top of file
- [ ] Menu — `components/Menu.js` — spec at top of file
- [ ] Notifications — `components/Notifications.js` — spec at top of file
- [ ] WaitingList — `components/WaitingList.js` — spec at top of file

### Implementation status per game (Footer + Menu + Notifications + WaitingList)
- [ ] Fishbowl
- [ ] GameOfWhat
- [ ] FirstToWorst
- [ ] SoClover
- [ ] Telestrations
- [ ] Copycats
- [ ] Drawful
- [ ] Avalon
- [ ] Codenames
- [ ] ReverseCharades
- [ ] ExquisiteCorpse
- [ ] MrWhite

### Components still to build
- [ ] **Action button** — lives in Footer's right slot. May be one or two buttons. Primary button always changes immediately to loading state on tap. Two buttons can share a row or stack.
- [ ] **Selections** — tap a row to select; whole row highlights; X to deselect; no separate submit button. Own answer shown last in alternate shade with label. See GameOfWhat for reference.
- [ ] **Text entry & submission** — signals primary action button to pulse if text entered but not submitted. Signals game when player is typing (feeds WaitingList). Supports multiple fields (FirstToWorst).
- [ ] **Duplicate detection** — works with Text entry. Three modes: (1) within one player's fields — highlight duplicates, block submit; (2) between players for bonus points (Drawful, GameOfWhat) — show bonus on submission; (3) between players to block (Fishbowl, ReverseCharades) — highlight and block.
- [ ] **Sound effects** — subtle: on submission, on your turn to act, on poke received.

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
- [x] WaitingList — `components/WaitingList.js`
- [x] styles.js — `components/styles.js` — design tokens used by all components

---

## Bug fixes

- SoClover: The Fifth Card setting should be editable before joining the game
- SoClover: The 5th card option can't currently be toggled on.
- SoClover: when the guesser rotates cards or the board, it is STILL not shown on other devices. The screen updates only when a card is moved. It should also update on card or board rotations. It also doesn't update when cards are taken off the board, only when they're put on it.
- GameofWhat: when all questions are submitted, no need to make players choose to start the round. Just go ahead and start it.