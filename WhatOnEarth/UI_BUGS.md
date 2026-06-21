# What On Earth - UI Bugs Found During Testing

## Testing Summary
Tested full game playthrough with 3 players (PlayerTwo, PlayerThree, PlayerFour) through all 3 rounds.

---

## Critical Bugs

### Bug #1: Incorrect ready count denominator
**Location:** Ready screen footer  
**Expected:** "X/3 players ready" (total player count)  
**Actual:** "X/2 players ready"  
**Impact:** Confusing - doesn't show correct total needed  
**File:** `/app/[code]/play/page.js` around line 395

### Bug #2: Missing status bar on playing screen
**Location:** Playing screen (all player views)  
**Expected:** Status bar at top showing "EARTHLING [Name] — ATTEMPT [1/2/3]"  
**Actual:** No status bar visible (may be missing component or not rendered)  
**Impact:** High - players can't see which attempt they're on  
**Spec reference:** ui-text.md line 64

### Bug #3: Missing word on alien view during playing
**Location:** Playing screen - alien view  
**Expected:** Header showing the word and "ALIEN / Earthling is translating..."  
**Actual:** No word or header visible, only letters and timer  
**Impact:** Medium - aliens don't see the word they're trying to guess (though this may be intentional?)  
**Spec reference:** ui-text.md lines 122-127

---

## Medium Bugs

### Bug #4: Previous word missing on ready screen
**Location:** Ready screen "Last word:" section  
**Expected:** "Last word: [WORD]" (e.g., "Last word: Swear jar")  
**Actual:** Shows "Last word:" label but the word itself is missing  
**Impact:** Medium - players can't see what the previous word was  
**Spec reference:** ui-text.md lines 26-34  
**File:** `/app/[code]/play/page.js` around line 346

### Bug #5: Incorrect previous round result
**Location:** Ready screen top section  
**Expected:** When someone guessed correctly: "[Earthling Name] and [Alien Name] got it!"  
**Actual:** Always shows "No one got it!" even when points were awarded  
**Impact:** Medium - confusing feedback about previous round  
**Spec reference:** ui-text.md lines 25-34  
**File:** `/app/[code]/play/page.js` around line 343

### Bug #6: Missing "Different Game" button
**Location:** Results/finished screen  
**Expected:** Two footer buttons: "Play Again" and "Different Game"  
**Actual:** Only "Play Again" button visible  
**Impact:** Low - players can still navigate via browser back button  
**Spec reference:** ui-text.md lines 229-230

---

## Observations (Not Bugs)

- Ready button correctly only shows for primary earthling ✓
- "Not your turn" banner correctly shows/hides based on active earthling ✓
- Role rotation working correctly across all 3 rounds ✓
- Letter generation working (3/4/5 blanks for attempts 1/2/3) ✓
- Point calculation correct (3 pts for attempt 1) ✓
- Modals ("Got it!", Confirmation, "No one") all working ✓
- Scoreboard updates correctly ✓
- Timer expiration auto-triggers modal ✓
- Countdown working (shows 1 for dummy game) ✓
- Footer buttons ("Got it!", "End early") show correctly based on role ✓

---

## Testing Notes

- All testing done with dummy game (3 second turn timer, 1 second countdown)
- All three browser tabs shared same localStorage, so only one player could be tested at a time
- Database functions (woe_start_game, woe_mark_ready, woe_award_points, etc.) all working correctly
- Realtime subscriptions working (page updated when database changed)
