## Shared Component Rollout

Each component is built (canonical in `packages/shared/components/`, copied to all games).
Goal: wire every game's play page to use them directly, replacing the old monolithic PokeSystem.
Do in small batches, deploy, test before continuing.

### Components built — need wiring into game pages
- [ ] Footer — `components/Footer.js` — spec at top of file
- [ ] Menu — `components/Menu.js` — spec at top of file
- [ ] Notifications — `components/Notifications.js` — spec at top of file
- [ ] WaitingList — `components/WaitingList.js` — spec at top of file

### Implementation status per game
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
- [ ] Selections (voting UI — tap to select, highlight, disabled own answer)
- [ ] TextEntry (text input + duplicate detection)
- [ ] Later: Status bar, Score display, Lobby, End game screen, Random ideas

### Already done
- [x] GameModal — `components/GameModal.js`
- [x] styles.js — `components/styles.js` — design tokens used by all components

---

## Bug fixes

- SoClover: The Fifth Card setting should be editable before joining the game
- SoClover: The 5th card option can't currently be toggled on.
- SoClover: when the guesser rotates cards or the board, it is STILL not shown on other devices. The screen updates only when a card is moved. It should also update on card or board rotations. It also doesn't update when cards are taken off the board, only when they're put on it.
- GameofWhat: when all questions are submitted, no need to make players choose to start the round. Just go ahead and start it.