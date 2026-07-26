"use client"
// useIdleGate — after `timeoutMs` of no pointer/touch/key activity, reports
// idle so the caller can tear down its realtime connection and stop
// polling. There's no in-place "resume" — IdleGateModal's confirm button
// does a full page reload instead, which cleanly re-establishes every
// realtime channel on the page (the main game connection, but also
// independent ones like Notifications/presence/typing) with no special
// coordination needed, rather than risking some of them being left stale.
//
// Usage:
//   const isIdle = useIdleGate(5 * 60 * 1000)
//   useEffect(() => {
//     if (isIdle) return
//     ...normal connect/poll setup...
//   }, [code, isIdle])
//   {isIdle && <IdleGateModal colors={POKE_COLORS} />}
import { useEffect, useRef, useState } from "react"

export function useIdleGate(timeoutMs = 5 * 60 * 1000) {
  const [isIdle, setIsIdle] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (isIdle) return // don't arm a new timer while already paused
    function reset() {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs)
    }
    reset()
    const events = ["pointerdown", "keydown", "touchstart"]
    events.forEach(e => document.addEventListener(e, reset))
    return () => {
      clearTimeout(timerRef.current)
      events.forEach(e => document.removeEventListener(e, reset))
    }
  }, [isIdle, timeoutMs])

  return isIdle
}
