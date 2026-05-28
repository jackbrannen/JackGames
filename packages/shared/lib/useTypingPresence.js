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
  const myPlayerIdRef = useRef(myPlayerId)
  const isTypingRef = useRef(false)
  const [presenceState, setPresenceState] = useState({})

  // Keep ref current so the subscribe callback (a closure) can read the latest value
  useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])

  useEffect(() => {
    if (!code) return
    const channel = supabase.channel(`${gameKey}-typing-${code}`)
      .on("presence", { event: "sync" }, () => {
        const s = channel.presenceState()
        console.log("[presence] sync:", JSON.stringify(s))
        setPresenceState({ ...s })
      })
      .subscribe(async status => {
        console.log("[presence] status:", status, "id:", myPlayerIdRef.current)
        if (status === "SUBSCRIBED" && myPlayerIdRef.current) {
          await channel.track({ playerId: myPlayerIdRef.current, typing: false })
          console.log("[presence] tracked initial")
        }
      })
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [gameKey, code])

  // Track when myPlayerId becomes available after the channel is already subscribed
  useEffect(() => {
    if (!myPlayerId || !channelRef.current) return
    channelRef.current.track({ playerId: myPlayerId, typing: false })
  }, [myPlayerId])

  const typingPlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.typing && p.playerId !== myPlayerId).map(p => p.playerId)
    )
  )

  function onTypingChange(isTyping) {
    if (!channelRef.current || !myPlayerId) return
    if (isTyping === isTypingRef.current) return
    isTypingRef.current = isTyping
    console.log("[presence] track:", isTyping)
    channelRef.current.track({ playerId: myPlayerId, typing: isTyping })
  }

  return { onTypingChange, typingPlayerIds }
}
