# Debug Trace: "I Won" Button Click

## Expected Flow
1. User clicks "I Won" button
2. `handleIWin()` called → `setIWinLoading(true)`
3. Button shows "Loading..."
4. RPC `aj_mark_winner` executes
5. RPC updates phase from 'playing' → 'processing' → 'matchup_preview' (or 'countdown')
6. `await loadState()` fetches new phase
7. `gameState.phase` changes
8. useEffect detects phase change → calls `setIWinLoading(false)`
9. Button resets

## Where It's Breaking
Need to add console.logs to find out:

```javascript
async function handleIWin() {
  console.log('[handleIWin] START', { iWinLoading })
  if (iWinLoading) return
  setIWinLoading(true)
  console.log('[handleIWin] Set loading=true')
  try {
    console.log('[handleIWin] Calling RPC...')
    const { error } = await supabase.rpc("aj_mark_winner", { p_code: code, p_player_id: myPlayerId })
    console.log('[handleIWin] RPC returned', { error })
    if (error) throw error

    console.log('[handleIWin] Calling loadState...')
    await loadState()
    console.log('[handleIWin] loadState complete, new phase:', gameState?.phase)
  } catch (e) {
    console.log('[handleIWin] ERROR:', e)
    alert("Error: " + (e?.message ?? "unknown error"))
    setIWinLoading(false)
  }
  console.log('[handleIWin] END')
}
```

Then check:
1. Does RPC succeed?
2. Does loadState() get called?
3. Does gameState.phase actually change?
4. Does the useEffect fire?
