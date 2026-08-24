"use client"
/*
  RandomIdeas — single-idea inspiration button
  ─────────────────────────────────────────────
  A button that shows one random idea at a time, written onto the button
  itself. Tapping it swaps in a new idea and starts a short cooldown: the
  refresh icon is replaced by a radial ring that sweeps around where it
  was (the "ability on cooldown" idiom, not a loading bar — and the icon
  is hidden rather than overlapping the ring) — indicating "not yet." The
  icon reappears once it's pressable again. Every 10th press triggers a
  longer breather (default 10s) with the button label itself switching to
  an italic "chill for a second" for the duration, instead of the usual
  idea text. Button background/text never dims (unlike a native
  `disabled` button — see note below), and the press animation is toned
  down from the game's default (this button is full-width with content
  at both edges, so the standard scale/brightness punch reads as too
  intense here). Unlimited presses; never runs out (pool is large enough
  that exhaustion isn't handled). Reset between prompts/rounds by
  changing the `key` prop.

  Props:
    bg           hex      — button background (use game's WARM_LIGHT)
    iconColor    hex      — refresh icon + cooldown ring color (default #C8A84B)
    fetchIdeas   async (count: number, exclude: string[]) => string[]
                          — called to get an idea; use game's supabase RPC:
                            (n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])
    excludeIdeas string[] — ideas already used (e.g. game.used_prompts); passed to fetchIdeas
    cooldownMs   number   — ms before the button can be pressed again (default 900)
    longCooldownMs number — ms for the once-every-10-presses breather (default 10000)
    onIdea       (idea: string) => void — called each time a new idea is shown,
                                           so the game can persist it (e.g. append to used_prompts)

  Usage (GOW):
    <RandomIdeas
      key={roundIndex}
      bg={WARM_LIGHT}
      fetchIdeas={(n, ex) => supabase.rpc("get_random_ideas", { p_count: n, p_exclude: ex }).then(({ data }) => data ?? [])}
      excludeIdeas={game.used_prompts ?? []}
      onIdea={idea => supabase.from("gow_games")
        .update({ used_prompts: [...(game.used_prompts ?? []), idea] })
        .eq("code", code)}
    />
*/

import { useEffect, useRef, useState } from "react"
import { FONT_WEIGHT } from "./styles"

const PRESS_CSS = `.riButton:active:not(:disabled){transform:scale(0.98);filter:brightness(1.1);}`

function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

// Ring sweeps from empty back to full over `durationMs` — the "ability on
// cooldown" idiom, drawn directly around the icon rather than a separate
// bar (a bar reads as "loading," which is the wrong signal for a cooldown).
// Remounted (via `key`) on every press so each cooldown gets its own sweep.
function CooldownRing({ durationMs, color, size = 20 }) {
  const [full, setFull] = useState(false)
  const r = (size - 3) / 2
  const circumference = 2 * Math.PI * r
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFull(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={full ? 0 : circumference}
        style={{ transition: `stroke-dashoffset ${durationMs}ms linear` }}
      />
    </svg>
  )
}

export default function RandomIdeas({
  bg = "rgba(255,255,255,0.15)",
  iconColor = "#C8A84B",
  fetchIdeas,
  excludeIdeas = [],
  cooldownMs = 900,
  longCooldownMs = 10000,
  onIdea,
}) {
  const [idea, setIdea] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [onBreak, setOnBreak] = useState(false)
  const [activeCooldownMs, setActiveCooldownMs] = useState(cooldownMs)
  const [cooldownKey, setCooldownKey] = useState(0)
  const seenRef = useRef([])
  const pressCountRef = useRef(0)
  const cooldownTimerRef = useRef(null)

  // Not a real HTML `disabled` — the global `button:disabled { opacity: 0.35 }`
  // rule would dim the whole button (and its text) during cooldown, which is
  // exactly what this button must never do. Gate the click in JS instead.
  const busy = loading || cooling

  async function handlePress() {
    if (busy || !fetchIdeas) return
    setLoading(true)
    const picked = await fetchIdeas(1, [...excludeIdeas, ...seenRef.current])
    if (picked?.[0]) {
      seenRef.current = [...seenRef.current, picked[0]]
      setIdea(picked[0])
      onIdea?.(picked[0])
    }
    pressCountRef.current += 1
    const isBreather = pressCountRef.current % 10 === 0
    const duration = isBreather ? longCooldownMs : cooldownMs
    setLoading(false)
    setOnBreak(isBreather)
    setActiveCooldownMs(duration)
    setCooling(true)
    setCooldownKey(k => k + 1)
    cooldownTimerRef.current = setTimeout(() => { setCooling(false); setOnBreak(false) }, duration)
  }

  return (
    <>
      <style>{PRESS_CSS}</style>
      <button
        onClick={handlePress}
        aria-label="Get a random idea"
        className="riButton"
        style={{
          background: bg, color: "white",
          fontSize: 15, fontWeight: FONT_WEIGHT.heavy,
          padding: "14px 18px", width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          textAlign: "left",
        }}
      >
        <span style={{ fontStyle: onBreak ? "italic" : "normal" }}>
          {onBreak ? "chill for a second" : idea ?? "✦ Random ideas"}
        </span>
        <span style={{ position: "relative", flexShrink: 0, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: iconColor, opacity: busy ? 0.4 : 1 }}>
          {cooling ? <CooldownRing key={cooldownKey} durationMs={activeCooldownMs} color={iconColor} size={20} /> : <RefreshIcon size={16} />}
        </span>
      </button>
    </>
  )
}
