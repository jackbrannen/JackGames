# What On Earth - UI Text Document

## Home Screen
**Title:** What On Earth
**Subtitle:** Alien Translation Game
**Create button:** Create Game
**Join input placeholder:** Room code
**Join button:** Join
**Dummy game button:** Dummy Game

---

## Lobby Screen
**Header:** What On Earth
**Subheader:** Waiting for players...
**Min players message:** Need at least 3 players to start
**Footer button:** Start Game

---

## Ready Screen

**Previous round result (small, top):**
- First round: [nothing shown]
- Subsequent rounds if someone guessed correctly:
  ```
  [Earthling Name] and [Alien Name] got it!
  Last word: [WORD]
  ```
- Subsequent rounds if no one guessed:
  ```
  No one got it!
  Last word: [WORD]
  ```

**Role assignment (large, center):**
```
Earthling: [Primary Name]
Backup Earthling: [Backup Name]

Aliens:
• [Alien 1]
• [Alien 2]
• [Alien 3]
```

**On Deck (below roles):**

- Actually let's just remove this element. Too confusing. Don't show on deck.

**Scoreboard (bottom):**

- Use scoreboard component. Follow UI style guide.

**Footer prompt:** Ready?
**Footer button (primary earthling only):** Ready

---

## Playing Screen - Active Earthling View

**Top section:**
```
EARTHLING [Name] — ATTEMPT [1/2/3] - put this in the status bar for everyone
[WORD]
```

**Middle section (translator letters):**
```
Your letters:
[Large display of letter sequence with underscores]
```

**Timer:** [00:30] (countdown)

**Footer buttons:**
- "Got it!"
- "End early" (only for active earthling)

---

## Playing Screen - Backup Earthling View (during attempt 1)

**Top section:**
```
[WORD]
- Make a prominent contrast strip across the screen of the non-playing earthling. This should be visible to any non-playing earthling when he is not playing. Same design as alphajam. It should say, "Not your turn."
```

**Middle section:**
```
Current letters:
[Display of primary's letter sequence]
```

**Timer:** [00:30]

**Footer button:** "Got it!"

---

## Playing Screen - Primary Earthling View (during attempt 2)

**Top section:**
```
[WORD]
```

**Middle section:**
```
Current letters:
[Display of backup's letter sequence]
```

**Timer:** [00:30]

**Footer button:** "Got it!"

---

## Playing Screen - Alien View

**Top section:**
```
ALIEN
Earthling is translating...
```

**Middle section:**
```
Current letters:
[Display of active earthling's letter sequence]
```

**Timer:** [00:30]

**Footer button:** "Got it!"

---

## Intermediate Screen (between attempts)

**Attempt 1 → 2:**
```
No correct guesses yet!
Moving to backup earthling...
```

**Attempt 2 → 3:**
```
No correct guesses yet!
Primary earthling gets one final attempt...
```

**Auto-advances after ~2 seconds**

---

## "Got it!" / Timer End Modal

**Header:** Who figured it out?

**Options (buttons):**
- [Alien 1 name]
- [Alien 2 name]
- [Alien 3 name]
- No one

**Footer:** [nothing - just tap an option]

---

## Confirmation Modal

**After selecting an alien:**
```
Award points?

[Earthling Name]: +[3/2/1] pts
[Alien Name]: +[3/2/1] pts
```
- Note: design this like the scoreboard UI component

**Buttons:**
- "Confirm"
- "Cancel"

**After selecting "No one":**
```
No one guessed correctly?

No points awarded this round.
```

**Buttons:**
- "Confirm"
- "Cancel"

---

## "End Early" Confirmation Modal

```
Skip this turn?

Game will move to the next turn.
```

**Buttons:**
- "Skip turn"
- "Cancel"

---

## Final Results Screen

**Header:** Translation Complete!

**Scores (sorted by points):**

- Use scoreboard component - see UI doc

**Tiebreaker note (if tied):**
```
[Name] and [Name] tied for 1st place!
```

**Footer buttons:**
- "Play Again"
- "Different Game"

---

## Settings (Lobby)

**Timer duration:**
- Label: "Turn timer"
- Options: 30s / 45s / 60s / 90s / Off

---

## Notifications/Toasts

**Word pool refresh:**
[No visible notification - happens silently in background]

**Error states:**
- "Failed to load word. Try again?"
- "Connection lost. Reconnecting..."

---

## Instructions / How to Play

**Storage:** Database table `game_instructions` with `game_key = 'whatonearth'`
**Access:** Menu button (hamburger icon) available from lobby and play screens
**Display:** Modal with instructions text + close button
