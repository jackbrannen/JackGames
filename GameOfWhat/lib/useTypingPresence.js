"use client"
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
  const [presenceState, setPresenceState] = useState({})

  // Keep ref current so the subscribe callback (a closure) can read the latest value
  useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])

  useEffect(() => {
    if (!code) return
    console.log("[useTypingPresence] creating channel", `${gameKey}-typing-${code}`)
    const channel = supabase.channel(`${gameKey}-typing-${code}`)
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState()
        console.log("[useTypingPresence] sync event, presenceState:", state)
        setPresenceState({ ...state })
      })
      .subscribe(async status => {
        console.log("[useTypingPresence] subscribe status:", status, "myPlayerId:", myPlayerIdRef.current)
        if (status === "SUBSCRIBED" && myPlayerIdRef.current) {
          await channel.track({ playerId: myPlayerIdRef.current, typing: false })
          console.log("[useTypingPresence] tracked on subscribe")
        }
      })
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [gameKey, code])

  // Track when myPlayerId becomes available after the channel is already subscribed
  useEffect(() => {
    if (!myPlayerId || !channelRef.current) return
    console.log("[useTypingPresence] tracking on myPlayerId effect, id:", myPlayerId)
    channelRef.current.track({ playerId: myPlayerId, typing: false })
  }, [myPlayerId])

  const typingPlayerIds = new Set(
    Object.values(presenceState).flatMap(presences =>
      presences.filter(p => p.typing && p.playerId !== myPlayerId).map(p => p.playerId)
    )
  )

  function onTypingChange(isTyping) {
    if (!channelRef.current || !myPlayerId) return
    console.log("[useTypingPresence] onTypingChange:", isTyping, "id:", myPlayerId)
    channelRef.current.track({ playerId: myPlayerId, typing: isTyping })
  }

  return { onTypingChange, typingPlayerIds }
}
