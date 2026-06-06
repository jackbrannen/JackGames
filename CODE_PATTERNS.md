# Code Patterns Reference

Implementation examples and copy-paste recipes for common patterns. Load this doc when you need specific code snippets.

---

## CSS Reset (copy verbatim into every new game's `globals.css`)

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { min-height: 100%; padding-bottom: env(safe-area-inset-bottom); }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
button { cursor: pointer; border: none; -webkit-tap-highlight-color: transparent; }
button:active:not(:disabled) { transform: scale(0.91); filter: brightness(1.3); }
button:disabled { opacity: 0.35; cursor: not-allowed; }
input, select, textarea { font-family: inherit; outline: none; border: none; }
input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.6); opacity: 1; }
```

---

## Button Styles

- **Primary action:** background `#FBDF54`, color `#000`, font-weight 900
- **Secondary:** background `rgba(255,255,255,0.15)`, color `#fff`, font-weight 700
- **Disabled:** opacity 0.35 (handled by global CSS above)
- All buttons are square — no `borderRadius`

---

## Player List — Two-Column Card Layout

```jsx
<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
  {players.map((p, i) => (
    <div key={p.id} style={{ display: "flex" }}>
      <div style={{
        padding: "13px 0", minWidth: 48, flexShrink: 0,
        background: DARK,  // cool-dark hex
        fontSize: 18, fontWeight: 900, color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {i + 1}
      </div>
      <div style={{
        padding: "13px 16px", flex: 1,
        background: MID,   // mid-dark hex
        display: "flex", alignItems: "center",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          {p.name}
          {p.id === myPlayerId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
        </div>
      </div>
    </div>
  ))}
</div>
```

Exception: team-based games (Fishbowl, Avalon) use a team-grid layout instead.

---

## Profile Management Code

```js
function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}

function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}
```

---

## Realtime + Polling Pattern

```js
const poll = setInterval(loadState, 1500)
const channel = supabase.channel(`game-${code}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "GAME_players" }, refreshPlayers)
  .on("postgres_changes", { event: "*", schema: "public", table: "GAME_games", filter: `code=eq.${code}` }, handleGameUpdate)
  .subscribe()
return () => { clearInterval(poll); supabase.removeChannel(channel) }
```

---

## 50%+ Ready to Advance RPC

```sql
-- Schema addition
ALTER TABLE {game}_games ADD COLUMN IF NOT EXISTS ready_player_ids uuid[] DEFAULT '{}';

-- RPC pattern
CREATE OR REPLACE FUNCTION {game}_mark_ready(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_ready int; v_total int;
BEGIN
  UPDATE {game}_games
  SET ready_player_ids = array_append(COALESCE(ready_player_ids, '{}'), p_player_id)
  WHERE code = p_code AND NOT (p_player_id = ANY(COALESCE(ready_player_ids, '{}')));
  SELECT COALESCE(array_length(ready_player_ids,1),0),
         (SELECT count(*) FROM {game}_players WHERE game_code = p_code)
  INTO v_ready, v_total FROM {game}_games WHERE code = p_code;
  IF v_ready * 2 >= v_total THEN
    PERFORM {game}_next_phase(p_code);
    UPDATE {game}_games SET ready_player_ids = '{}' WHERE code = p_code;
  END IF;
END; $$;
```

Reset `ready_player_ids = '{}'` in any reset/restart RPC as well.
