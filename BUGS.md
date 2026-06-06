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
