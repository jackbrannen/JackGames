/*
  useTypingPresence — Supabase Presence-backed typing indicator hook
  ──────────────────────────────────────────────────────────────────
  Pairs with TextEntry's onTypingChange prop and WaitingList's typing prop.

  Usage:
    const { onTypingChange, typingPlayerIds } = useTypingPresence("gow", code, myPlayerId)
    <TextEntry onTypingChange={onTypingChange} ... />
    <WaitingList players={players.map(p => ({ ...p, typing: typingPlayerIds.has(p.id) }))} />

  Args:
    gameKey     string   — short game prefix, e.g. "gow", "ftw" — namespaces the channel
    code        string   — room code
    myPlayerId  string   — current player's UUID (may be null on first render)

  Returns:
    onTypingChange   (isTyping: bool) => void  — pass directly to TextEntry's onTypingChange prop
    typingPlayerIds  Set<string>               — player IDs currently typing (excludes self)
*/

import { useState, useEffect, useRef } from "react"
import { supabase } from "./supabase"

export default function useTypingPresence(gameKey, code, myPlayerId) {
  const channelRef = useRef(null)
  const isTypingRef = useRef(false)
  const [presenceState, setPresenceState] = useState({})

  useEffect(() => {
    if (!code) return
    const channel = supabase.channel(`${gameKey}-typing-${code}`)
      .on("presence", { event: "sync" }, () => {
        setPresenceState({ ...channel.presenceState() })
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [gameKey, code])

  const typingPlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.typing && p.playerId !== myPlayerId).map(p => p.playerId)
    )
  )

  function onTypingChange(isTyping) {
    if (!channelRef.current || !myPlayerId) return
    if (isTyping === isTypingRef.current) return
    isTypingRef.current = isTyping
    if (isTyping) {
      channelRef.current.track({ playerId: myPlayerId, typing: true })
    } else {
      channelRef.current.untrack()
    }
  }

  return { onTypingChange, typingPlayerIds }
}
