/*
  useOnlinePresence — tracks which players have the game tab open and visible
  ─────────────────────────────────────────────────────────────────────────────
  Broadcasts this player's presence when their tab is visible; untracks when
  the tab is hidden. After a 5-second grace period (presenceReady), players
  not in the channel are considered "stepped away."

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
    presenceReady    bool         — true after 5s; gate "away" logic on this to avoid
                                    false positives during initial presence sync
*/

import { useState, useEffect, useRef } from "react"
import { supabase } from "./supabase"

export default function useOnlinePresence(gameKey, code, myPlayerId) {
  const channelRef = useRef(null)
  const [presenceState, setPresenceState] = useState({})
  const [presenceReady, setPresenceReady] = useState(false)

  useEffect(() => {
    if (!code) return
    const channel = supabase.channel(`${gameKey}-online-${code}`)
      .on("presence", { event: "sync" }, () => {
        setPresenceState({ ...channel.presenceState() })
      })
      .subscribe()
    channelRef.current = channel

    const readyTimer = setTimeout(() => setPresenceReady(true), 5000)

    function handleVisibility() {
      if (!channelRef.current || !myPlayerId) return
      if (document.hidden) {
        channelRef.current.untrack()
      } else {
        channelRef.current.track({ playerId: myPlayerId })
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(readyTimer)
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
