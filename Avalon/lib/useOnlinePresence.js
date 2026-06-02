/*
  useOnlinePresence — tracks which players have the game tab open and visible
  ─────────────────────────────────────────────────────────────────────────────
  Broadcasts this player's presence when their tab is visible; untracks when
  the tab has been hidden for 30 seconds. After a 12-second grace period
  (presenceReady), players not in the channel are considered "stepped away."

  The 30s hide debounce prevents false positives from mobile users who briefly
  switch apps — immediate untrack on visibilitychange was the main source of
  both false positives (away when they're not) and delayed-reappear issues.

  Separate from useTypingPresence — online status is a persistent signal,
  typing is transient. They run on different channels.

  Usage:
    const { onlinePlayerIds, presenceReady } = useOnlinePresence("gow", code, myPlayerId)

    <WaitingList
      players={players.map(p => ({
        name: p.name,
        done: ...,
        typing: typingPlayerIds.has(p.id),
        away: presenceReady && p.id !== myPlayerId && !onlinePlayerIds.has(p.id),
      }))}
    />

  Args:
    gameKey     string   — short game prefix, e.g. "gow" — namespaces the channel
    code        string   — room code
    myPlayerId  string   — current player's UUID (may be null on first render)

  Returns:
    onlinePlayerIds  Set<string>  — player IDs with active presence (excludes self)
    presenceReady    bool         — true after 12s; gate "away" logic on this to avoid
                                    false positives during initial presence sync
*/

import { useState, useEffect, useRef } from "react"
import { supabase } from "./supabase"

const HIDE_UNTRACK_DELAY = 30000 // ms hidden before considered away
const PRESENCE_READY_DELAY = 12000 // ms after mount before marking anyone away

export default function useOnlinePresence(gameKey, code, myPlayerId) {
  const channelRef = useRef(null)
  const myPlayerIdRef = useRef(myPlayerId)
  const hideTimerRef = useRef(null)
  const [presenceState, setPresenceState] = useState({})
  const [presenceReady, setPresenceReady] = useState(false)

  // Keep ref current so visibilitychange handler always has the latest playerId
  useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])

  useEffect(() => {
    if (!code) return
    const channel = supabase.channel(`${gameKey}-online-${code}`)
      .on("presence", { event: "sync" }, () => {
        setPresenceState({ ...channel.presenceState() })
      })
      .subscribe()
    channelRef.current = channel

    const readyTimer = setTimeout(() => setPresenceReady(true), PRESENCE_READY_DELAY)

    function handleVisibility() {
      const ch = channelRef.current
      const pid = myPlayerIdRef.current
      if (!ch || !pid) return
      if (document.hidden) {
        // Debounce: only untrack after sustained absence, not on every app-switch
        hideTimerRef.current = setTimeout(() => {
          if (document.hidden) ch.untrack()
        }, HIDE_UNTRACK_DELAY)
      } else {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
        ch.track({ playerId: pid })
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(readyTimer)
      clearTimeout(hideTimerRef.current)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [gameKey, code])

  // Broadcast presence when myPlayerId becomes available
  useEffect(() => {
    if (!channelRef.current || !myPlayerId || document.hidden) return
    channelRef.current.track({ playerId: myPlayerId })
  }, [myPlayerId])

  const onlinePlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.playerId !== myPlayerId).map(p => p.playerId)
    )
  )

  return { onlinePlayerIds, presenceReady }
}
