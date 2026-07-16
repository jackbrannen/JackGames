"use client"

// Spec:
// Fixed strips at the top-right of the screen showing incoming pokes and messages.
// Each strip auto-dismisses after 4 seconds. Tap or swipe in any direction to dismiss early.
// For direct pokes (to_player === currentPlayer): plays a ping sound, vibrates the device,
// and flashes the notification strip between notifBg and yellow twice on entry.
// Subscribes to the shared `pokes` table via Supabase Realtime + 60s polling fallback.
// Skips pokes that already existed when the component mounts (no replaying old history).
//
// Usage:
//   import Notifications from "../../components/Notifications"
//
//   <Notifications supabase={supabase} colors={COLORS} roomCode={code} currentPlayer={me?.name} />
//
// Pokes table schema:
//   room_code text, from_player text, to_player text|null, message text, id uuid, created_at timestamp
// Direct poke:  { room_code, from_player, to_player: targetName, message: "👉" }
// Room message: { room_code, from_player, to_player: null, message: "..." }

import { useEffect, useRef, useState } from "react"

function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "sine"
    osc.frequency.setValueAtTime(900, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.35)
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch {}
}

export default function Notifications({ supabase, colors = {}, roomCode, currentPlayer }) {
  const { notifBg = "#0F0F20", yellow = "#FBDF54" } = colors

  const [notifications, setNotifications] = useState([])
  const knownIdsRef      = useRef(new Set())
  const hasLoadedRef     = useRef(false)
  const currentPlayerRef = useRef(currentPlayer)
  const touchStartsRef   = useRef({})
  useEffect(() => { currentPlayerRef.current = currentPlayer }, [currentPlayer])

  function addNotification(poke) {
    const id = poke.id
    setNotifications(prev => {
      if (prev.some(n => n.id === id)) return prev
      return [{ id, poke, exiting: false }, ...prev]
    })
    if (poke.to_player && poke.to_player === currentPlayerRef.current) {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([80, 40, 160])
      playPing()
    }
    setTimeout(() => setNotifications(prev => prev.map(n => n.id === id ? { ...n, exiting: true } : n)), 3500)
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000)
  }

  async function loadPokes() {
    const { data } = await supabase
      .from("pokes")
      .select("*")
      .eq("room_code", roomCode)
      .order("created_at", { ascending: true })

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      if (data?.length) data.forEach(p => knownIdsRef.current.add(p.id))
      return
    }
    if (!data?.length) return
    const newOnes = data.filter(p => !knownIdsRef.current.has(p.id))
    if (!newOnes.length) return
    newOnes.forEach(p => knownIdsRef.current.add(p.id))
    newOnes.forEach(poke => addNotification(poke))
  }

  useEffect(() => {
    if (!roomCode || !supabase) return
    loadPokes()
    let poll = setInterval(loadPokes, 60000)
    function handleVisibility() {
      clearInterval(poll)
      if (!document.hidden) { loadPokes(); poll = setInterval(loadPokes, 60000) }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    const ch = supabase.channel(`pokes-${roomCode}-${Math.random()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pokes", filter: `room_code=eq.${roomCode}` }, ({ new: poke }) => {
        if (knownIdsRef.current.has(poke.id)) return
        knownIdsRef.current.add(poke.id)
        addNotification(poke)
      })
      .subscribe()
    return () => {
      clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
      supabase.removeChannel(ch)
    }
  }, [roomCode])

  function dismiss(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, exiting: true } : n))
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 450)
  }

  return (
    <>
      <style>{`
        @keyframes notifEnter { from { transform: translateX(60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes notifExit  { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-16px); opacity: 0; } }
        @keyframes notifPoke  {
          0%   { transform: translateX(60px); opacity: 0; background: ${notifBg}; }
          25%  { transform: translateX(0);    opacity: 1; background: ${yellow}; }
          50%  { background: ${notifBg}; }
          70%  { background: ${yellow}; }
          100% { background: ${notifBg}; opacity: 1; }
        }
      `}</style>

      <div style={{
        position: "fixed", top: 12, right: 12, left: 12, zIndex: 200,
        display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end",
        pointerEvents: "none",
      }}>
        {notifications.map(({ id, poke, exiting }) => {
          const isForMe = poke.to_player && poke.to_player === currentPlayer
          return (
            <div key={id}
              onTouchStart={e => {
                if (exiting) return
                touchStartsRef.current[id] = { x: e.touches[0].clientX, y: e.touches[0].clientY }
              }}
              onTouchMove={e => {
                const start = touchStartsRef.current[id]
                if (!start) return
                const dx = e.touches[0].clientX - start.x
                const dy = e.touches[0].clientY - start.y
                e.currentTarget.style.transform = `translate(${dx}px, ${dy}px)`
                e.currentTarget.style.opacity = `${Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 120)}`
                e.currentTarget.style.transition = "none"
              }}
              onTouchEnd={e => {
                const start = touchStartsRef.current[id]
                if (!start) return
                const dx = e.changedTouches[0].clientX - start.x
                const dy = e.changedTouches[0].clientY - start.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                delete touchStartsRef.current[id]
                if (dist >= 40) {
                  e.preventDefault()
                  const scale = 280 / dist
                  e.currentTarget.style.transition = "transform 0.28s ease-out, opacity 0.28s ease-out"
                  e.currentTarget.style.transform = `translate(${dx + dx * scale}px, ${dy + dy * scale}px)`
                  e.currentTarget.style.opacity = "0"
                  setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 300)
                } else {
                  e.currentTarget.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out"
                  e.currentTarget.style.transform = ""
                  e.currentTarget.style.opacity = ""
                }
              }}
              onClick={() => dismiss(id)}
              style={{
                background: notifBg,
                padding: "8px 12px",
                maxWidth: 260,
                boxShadow: "0 2px 16px rgba(0,0,0,0.6)",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                pointerEvents: "all",
                animation: exiting
                  ? "notifExit 0.45s ease-in forwards"
                  : isForMe ? "notifPoke 0.45s ease-out forwards" : "notifEnter 0.3s ease-out forwards",
              }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", lineHeight: 1.3 }}>
                  {poke.to_player
                    ? (isForMe ? `👉 ${poke.from_player} poked you` : `👉 ${poke.to_player}`)
                    : poke.message}
                </div>
                {!isForMe && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{poke.from_player}</div>
                )}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1, flexShrink: 0, marginTop: 1 }}>✕</div>
            </div>
          )
        })}
      </div>
    </>
  )
}
