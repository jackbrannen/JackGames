# Realtime, Polling & Egress Reference

The standard architecture every game uses to sync state across connected players, and the rules that keep it cheap. Read this before touching any `connect()`/`loadState()`/realtime-subscription code, and before adding any new interaction a player can tap or drag repeatedly.

This isn't stylistic guidance — every rule here exists because deviating from it caused a real, measured production incident (some burning 700MB+/day in Supabase egress). See "Incidents" at the bottom for specifics.

---

## 1. The standard connection effect shape

Every `play/page.js` (and lobby `page.js`) has one `useEffect` that does four things: initial full fetch, a 60s poll fallback, a realtime channel subscription, and reconnect-with-backoff. This is the skeleton:

```js
useEffect(() => {
  if (isIdle) return // see section 7
  loadState()
  const poll = setInterval(loadState, 60000)
  function handleVisibility() { if (!document.hidden) loadState() }
  document.addEventListener("visibilitychange", handleVisibility)

  let cancelled = false
  let channel = null
  let reconnectTimer = null
  let reconnectAttempt = 0

  function connect() {
    channel = supabase.channel(`<game>-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "<game>_games", filter: `code=eq.${code}` }, payload => {
        if (payload.eventType === "DELETE") { loadState(); return }
        applyGameRow(payload.new) // see section 3 — NOT loadState directly
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "<game>_players", filter: `game_code=eq.${code}` }, applyRowChange(setPlayers))
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe(status => {
        if (cancelled) return
        if (status === "SUBSCRIBED") {
          reconnectAttempt = 0
          loadState() // catch up immediately in case events were missed while disconnected
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (reconnectTimer) return
          const delay = Math.min(2000 * 2 ** reconnectAttempt, 30000) // backoff, capped at 30s
          reconnectAttempt++
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (cancelled) return
            supabase.removeChannel(channel)
            connect()
          }, delay)
        }
      })
    channelRef.current = channel
  }
  connect()

  return () => {
    cancelled = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    clearInterval(poll)
    document.removeEventListener("visibilitychange", handleVisibility)
    supabase.removeChannel(channel)
  }
}, [code, isIdle])
```

The reconnect-with-backoff exists because a dropped websocket otherwise leaves a client stuck until the 60s poll happens to fire. Don't skip it.

---

## 2. `loadState()` — full refetch, but guarded against races

`loadState()` does the real `Promise.all([...]).select("*")` multi-table fetch. It's the expensive path — reserved for: initial mount, the 60s poll, visibility-change catch-up, and reconnect-after-drop. It is **not** what runs on every realtime event (see section 3).

It needs a sequence guard because network responses don't resolve in the order they were sent — a slow request from an earlier call can resolve *after* a newer one and overwrite fresher state with stale data:

```js
const loadSeqRef = useRef(0)
async function loadState() {
  const seq = ++loadSeqRef.current
  const [{ data: g }, { data: ps }] = await Promise.all([...])
  if (seq !== loadSeqRef.current) return // a newer call already landed, discard this one
  if (!g) { router.replace(`/${code}`); return }
  if (g.replay_code) { router.replace(`/${g.replay_code}`); return }
  if (g.phase === "lobby") { router.replace(`/${code}`); return }
  setGame(g); setPlayers(ps ?? [])
}
```

---

## 3. The rule that matters most: don't refetch everything on every realtime event

This is the single most-recurring bug across this codebase. The naive version wires every `postgres_changes` event straight to `loadState`:

```js
// DON'T DO THIS
.on("postgres_changes", { table: "x_games", ... }, loadState)
```

Every single row change — including something as small as one player's live cursor position — triggers a full multi-table refetch, fanned out to *every* connected client. This is what burned hundreds of MB/day in real incidents. Instead, apply the changed row directly from the payload, which `postgres_changes` always sends in full for INSERT/UPDATE:

```js
// Single-row table (the game itself)
function applyGameRow(newRow) {
  if (!newRow) return
  if (newRow.replay_code) { router.replace(`/${newRow.replay_code}`); return }
  if (newRow.phase === "lobby") { router.replace(`/${code}`); return }
  setGame(newRow)
}

// Array tables (players, answers, votes, cards, etc.)
function applyRowChange(setList) {
  return (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    if (eventType === "DELETE") { setList(prev => prev.filter(r => r.id !== oldRow?.id)); return }
    if (!newRow) return
    setList(prev => {
      const idx = prev.findIndex(r => r.id === newRow.id)
      return idx === -1 ? [...prev, newRow] : prev.map(r => r.id === newRow.id ? newRow : r)
    })
  }
}
```

This costs zero extra network round-trips — the data's already in the payload you received. If a change also implies other tables need refetching (e.g. the game row's `current_question_id` changed, so a new question's answers/votes need pulling), it's fine for `applyGameRow` to fall back to calling `loadState()` in that specific case — just don't make that the default for every change.

---

## 4. Gossip/nudge discipline

`nudge()` (a manual `channelRef.current?.send({type:"broadcast", event:"sync"})`) exists so a peer whose realtime is lagging catches up fast instead of waiting on the 60s poll. **It must only fire on genuine committed state changes** (submit, vote, ready-up, phase transition) — never on something a player can tap repeatedly.

```js
// Genuine committed action — fine to nudge
async function submitAnswer() {
  await supabase.rpc("submit_answer", {...})
  channelRef.current?.send({ type: "broadcast", event: "sync" })
}

// Repeated-tap interaction (drag, live selection, a like button) — DO NOT nudge here
async function toggleLike(answerId) {
  setLikes(prev => /* optimistic update */)
  await supabase.rpc("toggle_like", {...})
  // no nudge, no loadState() — the write already propagates cheaply via
  // the payload-patched postgres_changes handler from section 3
}
```

This exact mistake — nudging on every tap of a "like" button — caused a real incident, independently, in three separate games, because the write already reaches every client via `postgres_changes`; the extra broadcast just forces everyone through a full reload for no benefit.

The internal gossip-diffing pattern inside `applyGameRow`/`loadState` (compare a computed key against a ref, only nudge if it changed) is a *separate*, lower-frequency mechanism for "did the real state change" — don't confuse that with unconditionally nudging on every function call.

---

## 5. Write ordering for anything a player can rapidly repeat (drag-and-drop, etc.)

If a client can fire multiple writes to the same row in quick succession (dragging cards, rearranging a board), queue them — network responses can resolve out of order and an older write landing after a newer one silently reverts it:

```js
const persistQueueRef = useRef(Promise.resolve())
function persistBoard(patch) {
  persistQueueRef.current = persistQueueRef.current.then(() =>
    supabase.from("x_boards").update(patch).eq("id", boardId)
  )
}
```

---

## 6. Subscription filters — always scope them

```js
// Good — scoped to this game only
.on("postgres_changes", { table: "x_answers", filter: `game_code=eq.${code}` }, ...)

// Bad — fires for every row change across every game of this type, in the whole database
.on("postgres_changes", { table: "x_answers" }, ...)
```

When a child table is keyed by something other than `game_code` (e.g. `question_id`), you can't filter server-side — instead check the relevant id client-side inside the payload handler before applying it, and drop anything that isn't for the current question/game.

---

## 7. Idle gate — pause everything after inactivity

Every play/lobby page uses `useIdleGate()` (`packages/shared/lib/useIdleGate.js`) to stop polling and tear down the realtime channel after 5 minutes of no pointer/touch/key activity, showing a blocking "Still there?" modal (`packages/shared/components/IdleGateModal.js`). Confirming does a **full page reload**, not an in-place resume — this cleanly re-establishes every realtime channel on the page (main game connection, plus independent ones like Notifications/presence) with no special coordination needed, rather than risking one of them being left stale.

This exists because abandoned open tabs poll forever — a deployed fix can't reach JS already running in an already-open tab, so the only real fix is not letting it run indefinitely in the first place.

```js
const isIdle = useIdleGate() // default 5 min
// gate the connection effect on it (section 1)
{isIdle && <IdleGateModal colors={POKE_COLORS} />}
```

---

## 8. The question to ask before adding any new interaction

"Does this fire once per meaningful action, or once per tap/pixel of movement?"

If it's the latter (drag, live cursor, a reaction button, a typing indicator), it must never trigger a full reload or unconditional nudge — only the lightweight payload-patch path from section 3. Asking this question too late is the root cause of every egress incident logged below.

---

## Incidents (for context — not exhaustive)

- **`tir_set_active_selection` (ThingsInRings), `tc_set_pending` (Typecast), `dc_set_pending_guess` (Decrypto), `persistBoard` (SoClover), `last_move` (FirstToWorst)**: live-cursor/drag writes to a subscribed table, with every connected client's `postgres_changes` handler wired to a full `loadState()`. Every tap/drag fanned a full multi-table reload out to every client. Fixed by applying the payload directly (section 3).
- **`toggleLike` (Copycats, Drawful, GameOfWhat)**: same root cause, discovered later because the keyword search for the first incident only looked for drag/selection-related names, not "like." Every tap of a reaction button fired an unconditional broadcast nudge *and* its own full reload, with no gating.
- **4 abandoned browser tabs on one Typecast game, left open ~5 hours with zero gameplay**: ~60MB of egress from nothing but the 60s poll and reconnect cycles running in the background. Motivated the idle-gate (section 7).
- **`gow_answers`/`gow_votes`/`gow_likes` with no subscription filter**: fired for every GameOfWhat game in the database, not just the current one, on top of the full-reload bug above.

If you find a new instance of this pattern, add it here.
