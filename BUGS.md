# Common Bugs Reference

Recurring bugs, their symptoms, diagnostic steps, and fixes. Check this when debugging before assuming the code is wrong.

---

## Dynamic Imports Breaking During HMR

**Symptom:** Supabase queries hang infinitely, loadState never completes, infinite loop of "loadState called" logs. Page stuck on "Loading..."

**Diagnostic steps:**
1. Check console for `[HMR] unexpected require(...lib/supabase.js) from disposed module`
2. Check if there are dynamic imports: `await import("../lib/supabase")`
3. Check if supabase is already imported at top of file

**Cause:**
- Dynamic imports (`await import("../../../lib/supabase")`) fail during Hot Module Reload
- Causes Supabase queries to hang without throwing catchable errors
- Results in infinite loadState loop

**Fix:**
1. Remove all dynamic imports: `const { supabase } = await import("../../../lib/supabase")`
2. Use the static import at top of file: `import { supabase } from "../../../lib/supabase"`
3. **Restart dev server** - HMR state is corrupted, hot reload won't fix it
4. Use global replace: `replace_all=true` to remove all occurrences at once

**Prevention:**
- Never use dynamic imports for supabase - it's already imported at top
- If you see HMR warnings in console, restart dev server immediately

---

## Stuck on Loading Screen

**Symptom:** Page shows "Loading..." indefinitely, never renders content.

**Diagnostic steps:**
1. Check browser console for errors
2. Check if `loadState()` is called on component mount
3. Check if state variables are being set (`gameExists`, `game`, `myPlayerId`, `players`)
4. Check localStorage key consistency between pages

**Common causes:**

### localStorage key mismatch
- **Example:** Lobby saves `firsttoworst:CODE:playerId`, play reads `ftw:CODE:playerId`
- **Fix:** Ensure all pages in a game use the same prefix (check home, lobby, play)
- **How to find:** Search for `localStorage.getItem` and `localStorage.setItem` across all pages

### loadState() not called on mount
- **Example:** Missing `useEffect(() => { loadState() }, [code])` 
- **Fix:** Add initial loadState call in mount effect

### gameExists stays null
- **Example:** Table name mismatch (lobby queries `firsttoworst_games`, table is `ftw_games`)
- **Fix:** Check actual table name in Supabase, update queries
- **How to find:** Add `console.log` to loadState to see what data comes back

### Conditional rendering before state loads
- **Example:** `if (!game) return null` but game is null on initial render
- **Fix:** Return "Loading..." text instead of null, or pass `loading` prop to Lobby component

---

## Button Stuck on "Loading..."

**Symptom:** Button shows "Loading..." and never resets, even after action completes.

**Diagnostic steps:**
1. Check if loading state is reset on BOTH success and error paths
2. Check if this is a phase-changing button (should NOT reset on success)
3. Check browser console for uncaught errors

**Common causes:**

### Loading state only reset on error path
- **Example:** `setLoading(false)` only in catch block, not after successful RPC
- **Fix:** For non-phase-changing buttons, reset on both paths
- **Pattern:**
  ```js
  try {
    await rpc(...)
    setLoading(false)  // ← add this
  } catch (e) {
    setLoading(false)
  }
  ```

### Phase-changing button resets on success (causes flash)
- **Example:** Submit button calls `setLoading(false)` after RPC
- **Fix:** Do NOT reset loading state on success for phase-changing buttons
- **Rule:** Component unmounts when phase changes; leave loading=true
- **See:** CLAUDE.md "Button Loading State" section

### Uncaught error in async handler
- **Example:** RPC throws error, no try-catch, FooterButton never resets
- **Fix:** Wrap RPC calls in try-catch, re-throw after resetting state

### Component doesn't transition after submission (state not refreshed)
- **Symptom:** Button stuck on "Loading..." even though RPC succeeded. Screen doesn't change to show "waiting for others" or next phase.
- **Example:** `submitAnswer()` succeeds but component still renders the submit form because `myAnswerRow` is undefined
- **Root cause:** State isn't refreshed after RPC, so the component doesn't know the submission succeeded
- **Diagnostic:** Check if the async handler calls `loadState()` after the RPC
- **Fix:** Add `await loadState()` after successful RPC (but before any error handling)
- **Pattern:**
  ```js
  async function submitAnswer() {
    const { error } = await supabase.rpc("submit_answer", { ... })
    if (error) { setError(error.message); throw error }
    
    // Load fresh state so component can detect submission and transition
    await loadState()
    
    // Optional: check for matches or do other post-submit logic
  }
  ```
- **Why it works:** After `loadState()` runs, the component re-renders and detects the new data (e.g., `myAnswerRow` is now defined), causing it to render the "waiting" screen instead of the submit form. Since the component changed, FooterButton naturally stays in loading state (which is correct - see "Phase-changing button" pattern above).
- **Note:** This is NOT a phase change, but it IS a screen transition (submit form → waiting screen). The pattern is the same: don't manually reset loading; let the component unmount naturally.

---

## React Hooks Violation

**Symptom:** "Rendered more hooks than during the previous render"

**Diagnostic steps:**
1. Error shows line number — check that line for `useEffect`, `useState`, `useMemo`, etc.
2. Look ABOVE that line for conditional blocks (`if`, early `return`)
3. Check if hook is inside conditional rendering or after early return

**Common causes:**

### useEffect inside conditional block
- **Example:** `if (game.phase === "guessing") { useEffect(() => {...}) }`
- **Fix:** Move useEffect BEFORE the conditional, add phase check inside effect
- **Pattern:**
  ```js
  // WRONG
  if (phase === "X") {
    useEffect(() => {...}, [])
  }
  
  // CORRECT
  useEffect(() => {
    if (phase !== "X") return
    ...
  }, [phase])
  ```

### useEffect after early return
- **Example:** `if (!game) return <div>Loading</div>` then `useEffect(...)` below
- **Fix:** Move ALL hooks above ALL conditional returns
- **Rule:** Hooks must be at the top level, in the same order every render

### Derived state used before declaration
- **Example:** `useEffect(() => { ... isSubject ... })` but `const isSubject = ...` is declared inside conditional block
- **Fix:** Either move declaration above useEffect, or compute inline within effect

---

## Missing Import

**Symptom:** "ReferenceError: supabase is not defined" or similar

**Diagnostic steps:**
1. Check error line number
2. Check top of file for import statement
3. Search for where it should be imported from

**Common causes:**

### Import removed or never added
- **Example:** Component uses `supabase` but has no `import { supabase } from ...`
- **Fix:** Add import at top of file: `import { supabase } from "../../../lib/supabase"`

### Wrong import path
- **Example:** `import { supabase } from "../../lib/supabase"` but file is 3 levels deep
- **Fix:** Count directories to lib/, use correct number of `../`

---

## Vercel Build Fails — Module Not Found

**Symptom:** Local build works, Vercel build fails with "Module not found: Can't resolve '../lib/useSubmitNudge'"

**Diagnostic steps:**
1. Check if file exists on disk
2. Check if file is committed to git: `git ls-files lib/useSubmitNudge.js`
3. Check if recent changes added new imports

**Common causes:**

### File exists but not committed
- **Example:** Copied `lib/useSubmitNudge.js` to game but didn't `git add`
- **Fix:** `git add lib/useSubmitNudge.js && git commit`
- **Prevention:** After copying shared lib files, always commit them

### Wrong file path in import
- **Example:** `import useSubmitNudge from "../lib/useSubmitNudge"` but file is at `./lib/`
- **Fix:** Verify relative path is correct

---

## Component Not Working as Expected

**Symptom:** Shared component doesn't look right or behave correctly

**Diagnostic steps:**
1. Read the component spec comment at top of component file
2. Check if all required props are passed
3. Check if prop values match spec (e.g. colors object has correct keys)
4. Compare against StyleGuide visual reference

**Common causes:**

### Missing required props
- **Example:** Lobby component missing `colors` prop, uses fallback defaults
- **Fix:** Check component spec, pass all required props

### Wrong prop structure
- **Example:** Passing `color` instead of `colors={{ dark, mid, wl, yellow }}`
- **Fix:** Read component spec for exact prop shape

### Not following component spec
- **Example:** Settings rendered inline instead of via modal
- **Fix:** Check component spec for settingsContent usage (takes closeModal callback)

---

## Dummy Game Not Following Spec

**Symptom:** Dummy game behaves incorrectly (auto-advances, creates "Player N" names, etc.)

**Diagnostic steps:**
1. Check tasks.md for dummy game spec
2. Check if implementation matches: auto-join (only if profile), pre-fill text

**Common causes:**

### Didn't read spec before implementing
- **Example:** Implemented dummy auto-join as "always create Player N"
- **Fix:** Read tasks.md "Dummy Game spec" section:
  1. Auto-join — use saved profile username (only if exists)
  2. Pre-fill text fields — fill with random ideas when phase starts
- **Prevention:** Follow CLAUDE.md Rule #1 — always read spec first

### Auto-advancing through phases
- **Example:** Auto-submit drawings after 1 second in dummy game
- **Fix:** Remove auto-advance logic; dummy games should still require user interaction
- **Rule:** Dummy = auto-join + pre-fill, NOT auto-play

---

## Footer Covering Content

**Symptom:** Sticky footer overlaps bottom content (buttons, controls, etc.)

**Diagnostic steps:**
1. Check if container has `paddingBottom: BOTTOM_PAD` or accounts for footer height
2. Check if using fixed height container (100dvh)

**Common causes:**

### Missing paddingBottom
- **Example:** Scrollable content has no bottom padding
- **Fix:** Add `paddingBottom: BOTTOM_PAD` where `BOTTOM_PAD = calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

### Fixed height doesn't account for footer
- **Example:** Drawing canvas container is `height: "100dvh"` with footer inside
- **Fix:** `height: calc(100dvh - ${FOOTER_H}px - env(safe-area-inset-bottom))`
- **Rule:** If container is 100dvh AND footer is sticky inside it, subtract footer height

---

## Profile Not Persisting / Auto-Join Failing

**Symptom:** User enters profile but it doesn't save, or auto-join doesn't work

**Diagnostic steps:**
1. Check localStorage and cookie in browser dev tools
2. Check if saveProfile called with complete profile (has `username`)
3. Check auto-join logic gates on `savedProfile?.username`

**Common causes:**

### Calling saveProfile without username
- **Example:** `saveProfile({ firstName, lastName })` without username
- **Fix:** Never call saveProfile unless `username` is present
- **Rule:** See CLAUDE.md "Profile Management Rules"

### Auto-join using fallback value
- **Example:** Auto-join with `firstName` when `username` is missing
- **Fix:** Gate auto-join on `savedProfile?.username`, not state variables

### Cookie/localStorage out of sync
- **Example:** localStorage has old data, cookie is authoritative
- **Fix:** Always merge with cookie as override (see CODE_PATTERNS.md for loadProfile implementation)

---

## FooterButton Stuck on "Loading..."

**Symptom:** Submit button shows "Loading..." and won't reset even after submission completes or fails. Button is grayed out and unclickable.

**Diagnostic steps:**
1. Check if page is passing `loading={someState}` prop to FooterButton
2. Check if FooterButton component accepts the `loading` prop in its parameters
3. Check if parent component has useEffect that resets loading state when phase/index changes

**Cause:**
- FooterButton component was using only internal loading state, ignoring external `loading` prop
- When parent component reset its state (e.g., `submittingAnswer` via useEffect), FooterButton's internal state stayed true
- Component didn't unmount so internal loading state never reset

**Fix:**
1. Update FooterButton to accept optional `loading` prop
2. Use external loading if provided, otherwise fall back to internal state:
   ```javascript
   const [internalLoading, setInternalLoading] = useState(false)
   const loading = externalLoading !== undefined ? externalLoading : internalLoading
   ```
3. Only manage internal loading if no external loading provided

**Example in Drawful:**
- `Drawful/components/FooterButton.js` updated to accept `loading` prop
- Now properly respects `loading={submittingAnswer}` from play page
- When useEffect resets `submittingAnswer` on phase change, button shows "Submit" again

**Prevention:**
- When using FooterButton with external state, always pass `loading` prop
- Ensure parent has cleanup logic (useEffect) to reset loading states

---

## Game Stuck on "Waiting for answers"

**Symptom:** Drawful stuck on "Waiting for answers" screen even when all players submitted. Shows "X / X done" but never advances to voting.

**Diagnostic steps:**
1. Check database: count answers where `is_real = false` for current drawing
2. Count non-artist players
3. Check if counts match
4. Check game phase - should be 'guessing', should advance to 'voting'

**Cause:**
- `drawful_submit_answer` RPC function was missing logic to auto-advance phase
- It inserted the answer but didn't check if all answers were in
- No trigger to move from 'guessing' → 'voting' phase

**Fix:**
Update `drawful_submit_answer` to count answers and auto-advance:
```sql
-- Count how many non-artist players exist
SELECT count(*) INTO v_total_non_artist
FROM drawful_players WHERE game_code = p_code AND id != p_drawing_player_id;

-- Count how many fake answers have been submitted
SELECT count(*) INTO v_submitted
FROM drawful_answers
WHERE game_code = p_code
  AND drawing_player_id = p_drawing_player_id
  AND is_real = false;

-- If all non-artist players have submitted, advance to voting
IF v_submitted >= v_total_non_artist THEN
  UPDATE drawful_games SET phase = 'voting' WHERE code = p_code;
END IF;
```

**Related Issue:** Missing `drawful_start_game` function
- Game also needs real answers (prompts) inserted at start
- Create function that inserts `is_real = true` answer for each player's prompt

**Example:** `Drawful/supabase/pending_migrations.sql` has both functions

---

## Null Constraint Error on Submit

**Symptom:** Error message "null value in column 'text' violates not-null constraint" when submitting answers/input.

**Diagnostic steps:**
1. Check if frontend validates input before submission
2. Check if RPC function validates parameters
3. Check if text could become empty after processing (trim, capitalization, etc.)

**Cause:**
- Frontend validation may check raw input but send processed version
- RPC function receives null or processes text to empty string
- Database constraint violated on INSERT

**Fix:**
Add validation in RPC function before INSERT:
```sql
-- Validate text is not null or empty
IF p_text IS NULL OR trim(p_text) = '' THEN
  RAISE EXCEPTION 'Answer text cannot be empty';
END IF;

-- Trim before inserting to ensure clean data
INSERT INTO table (text) VALUES (trim(p_text));
```

**Prevention:**
- Always validate input in both frontend AND backend
- Use `trim()` before checking emptiness
- Add frontend double-check after processing but before RPC call

**Example in Drawful:**
```javascript
const trimmed = answerText.trim()
if (!trimmed) {
  setSubmitting(false)
  return
}
// Then call RPC with trimmed value
```

---

## Circular Reference Error on Game Creation

**Symptom:** "TypeError: JSON.stringify cannot serialize cyclic structures" or "TypeError: Converting circular structure to JSON --> starting at object with constructor 'HTMLButtonElement' | property '__reactFiber$...' -> object with constructor 'FiberNode'"

**Diagnostic steps:**
1. Check if error appears when clicking Create Game button
2. Check if code throws Supabase error objects
3. Check for console.error() calls in event handlers
4. Look for pattern: error related to HTMLButtonElement and React Fiber

**Cause:**
When Supabase errors are thrown from within React event handlers (like onClick), Next.js dev overlay tries to serialize the entire execution context including React Fiber references from the button element. These create circular references that can't be stringified.

**Fix:**
Option 1 - Return error strings instead of throwing:
```javascript
// WRONG - throws error object with circular refs
async function createGame() {
  const { error } = await supabase.from("games").insert(...)
  if (error) throw error  // ← circular reference
}

// CORRECT - return null on error
async function createGame() {
  const { error } = await supabase.from("games").insert(...)
  if (error) return null
  return code
}
```

Option 2 - Don't call console.error in event handlers:
```javascript
// WRONG - Next.js serializes context when logging
async function onClick() {
  try {
    await createGame()
  } catch (e) {
    console.error('[Game] Error:', e)  // ← triggers serialization
  }
}

// CORRECT - just set error state
async function onClick() {
  const code = await createGame()
  if (!code) {
    setError("Failed to create game")
  }
}
```

**Additional Fix - Use Dynamic Import:**
If database inserts are failing silently, try dynamic import of Supabase client:
```javascript
// WRONG - static import may not work in all contexts
import { supabase } from "../lib/supabase"

// CORRECT - dynamic import (like GameOfWhat pattern)
async function createGame() {
  const { supabase } = await import("../lib/supabase")
  // ... rest of function
}
```

**Example from Copycats:**
- Static import caused database inserts to fail silently
- Throwing errors caused circular reference serialization
- Solution: dynamic import + return null pattern
- See commit 86c46d5

**Prevention:**
- Never throw raw Supabase error objects from event handlers
- Extract error.message before throwing, or return error strings
- Avoid console.error() in React event handlers in dev mode
- Use dynamic import for Supabase if static import causes issues

---

## FooterButton Stuck on "Loading..." During Multi-Step Progression

**Symptom:** Button shows "Loading..." indefinitely during reveal/progression phases where the same button advances through multiple steps (step 0→1→2→3). Button resets correctly on first click but gets stuck on subsequent clicks.

**Diagnostic steps:**
1. Check if button key prop is static (e.g., `key="reveal"`) or dynamic
2. Add console.log to measure RPC and database query timing
3. Check if `loadState()` or similar refresh is called after RPC
4. Verify button text/function changes between steps

**Cause:**
FooterButton has internal `loading` state that only resets on error, not success. When the same button instance is reused across multiple progression steps, React doesn't unmount it between steps because the `key` prop stays the same. The internal loading state persists from one step to the next.

**Example:**
```javascript
// WRONG - static key means same FooterButton instance across all steps
<FooterButton key="reveal" onClick={handleAdvanceReveal}>
  Reveal
</FooterButton>

// On step 0→1: button sets loading=true, RPC completes, but key="reveal" stays same
// On step 1→2: React reuses the same instance, loading is still true from step 0
```

**Fix:**
Use dynamic keys that include the current progression state:
```javascript
// CORRECT - key changes with each step, forcing fresh button instance
<FooterButton 
  key={`reveal-${currentRevealStep}`} 
  onClick={handleAdvanceReveal}
>
  Reveal
</FooterButton>

// For chain/round progression:
<FooterButton 
  key={`next-chain-${currentRevealChain}`} 
  onClick={handleNextChain}
>
  {isLastChain ? "Finish →" : "Next chain →"}
</FooterButton>
```

**Why it works:**
- When `currentRevealStep` changes (0→1→2→3), the key changes
- React unmounts the old FooterButton and mounts a fresh one
- Fresh instance has `loading=false` by default
- Natural component lifecycle handles state reset

**Additional optimization:**
Create a lightweight state refresh function that queries only what's needed:
```javascript
// Instead of calling full loadState() (3+ queries)
async function loadGameOnly() {
  const { data } = await supabase
    .from("games").select("*").eq("code", code).single()
  if (data) setGame(data)
}

// Call after RPC to immediately update UI
async function handleAdvance() {
  await supabase.rpc("advance_step", { ... })
  await loadGameOnly()  // Fast 1-query refresh
}
```

**Example from ExquisiteCorpse:**
- Reveal phase has 4 steps per chain, 4 chains total (16 button clicks)
- Static `key="reveal"` caused button to stay stuck after first click
- Changed to `key={`reveal-${currentRevealStep}`}` 
- Also added `loadGameOnly()` to reduce queries from 3→1
- See commits e7015b6, a3c46d6

**Prevention:**
- Use dynamic keys for any multi-step progression buttons
- Include the step/index/chain number in the key
- Don't try to manually reset FooterButton's internal loading state
- Let React's component lifecycle handle state reset naturally
