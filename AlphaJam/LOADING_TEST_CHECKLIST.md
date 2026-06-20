# AlphaJam Loading Button Test Checklist

## Testing Pattern
For each button below, verify ALL of these:
1. ✓ Button shows "Loading..." immediately when clicked
2. ✓ After RPC succeeds, `loadState()` is called
3. ✓ Screen transitions (phase changes OR state updates)
4. ✓ Button resets via useEffect when phase changes
5. ✓ Button NEVER stays stuck on "Loading..."

## Test Cases

### Lobby Page
- [ ] **Join button** (app/[code]/page.js)
  - Click → shows "Loading..."
  - Success → player appears in list, button switches to "Start Game"
  - Error → shows alert, button resets

- [ ] **Start Game button** (app/[code]/page.js)
  - Click → shows "Loading..."
  - Success → redirects to /play (matchup_preview phase)
  - Error → shows alert, button resets

### Play Page - Matchup Preview
- [ ] **Ready button** (app/[code]/play/page.js)
  - Single player clicks → shows "Loading...", transitions to "Waiting for [name]"
  - Both players click → shows "Loading...", transitions to countdown
  - Race condition test: Both click simultaneously → both should transition properly

### Play Page - Playing Phase
- [ ] **I Won button** (app/[code]/play/page.js)
  - Winner clicks → shows "Loading...", transitions to next round/matchup
  - Loser's screen → button disappears, shows "Point awarded to [name]"
  - Race condition test: Both click simultaneously → only first click counts, both buttons reset

- [ ] **New Letters button** (app/[code]/play/page.js)
  - Single player clicks → shows "Loading...", shows "Waiting for [name] to confirm"
  - Both players click → shows "Loading...", generates new letters
  - Race condition test: Both click simultaneously → both should see new letters

## Current Status

### Fixed Issues
- ✓ FooterButton now accepts external `loading` prop
- ✓ All RPC handlers call `await loadState()` after success
- ✓ All RPC handlers use try-catch and only reset loading on error
- ✓ useEffect resets all loading states when phase changes
- ✓ `aj_mark_ready` RPC uses atomic array_append
- ✓ `aj_mark_winner` RPC uses atomic phase transition

### Known Race Conditions
- None remaining (all buttons use atomic operations or are idempotent)

## Testing Commands

# Start dev server
cd /Users/jack/Library/CloudStorage/Dropbox-Personal/Claude/Games/AlphaJam
npm run dev

# Open 4 browser windows
open http://localhost:3001/COPPEROCEAN
open http://localhost:3001/COPPEROCEAN
open http://localhost:3001/COPPEROCEAN
open http://localhost:3001/COPPEROCEAN

# Test sequence:
1. Join 4 players
2. Click "Start Game"
3. Have both matchup players click "Ready" simultaneously
4. Have both matchup players click "I Won" simultaneously
5. Repeat for all matchups
