"use client"
/*
  FooterButton — action button with auto-managed loading state
  ─────────────────────────────────────────────────────────────
  Drop inside <Footer> as children, or use in any action bar layout.

  KEY RULE: never reset loading on success. onClick should be async and
  throw (or return a rejected promise) on error — that's the only path
  that resets loading. On success, the button stays "Loading…" until the
  component unmounts when the new phase arrives.

  Props:
    onClick    async function — called on tap; throw to reset loading
    variant    "primary" | "secondary" | "danger"  (default "primary")
    bg         hex — overrides the variant background color
    textColor  hex — overrides the variant text color
    disabled   bool
    nudge      bool — pulse animation when player has input but hasn't submitted
    style      object — additional style overrides (fontSize, fontWeight, etc.)
    children   button label

  Layout:
    The button is display:block, width:100%, height:100% so it stretches
    to fill any flex or grid container (including Footer).

  For N buttons in a row, wrap in:
    <div style={{ flex: 1, display: "flex" }}>
      <FooterButton ...>A</FooterButton>
      <FooterButton ...>B</FooterButton>
    </div>

  For N buttons stacked (e.g. Start Turn + Pass Turn), pass height prop
  to Footer and use:
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <FooterButton primary ...>Start Turn</FooterButton>
      <FooterButton variant="secondary" ...>Pass Turn</FooterButton>
    </div>

  Nudge animation:
    Use with useSubmitNudge from lib/useSubmitNudge:
      const nudge = useSubmitNudge(inputValue, submitted)
      <FooterButton nudge={nudge} ...>Submit</FooterButton>
*/

import { useState } from "react"

const VARIANTS = {
  primary:   { bg: "#C8A84B", color: "#000",   fontWeight: 900 },
  secondary: { bg: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 700 },
  danger:    { bg: "#F04F52", color: "#fff",   fontWeight: 700 },
}

const NUDGE_CSS = `@keyframes fbNudge{0%,100%{filter:brightness(1);transform:scale(1)}50%{filter:brightness(2.2);transform:scale(1.04)}}`

export default function FooterButton({
  onClick,
  variant = "primary",
  bg,
  textColor,
  disabled = false,
  nudge = false,
  style,
  children,
}) {
  const [loading, setLoading] = useState(false)
  const v = VARIANTS[variant] ?? VARIANTS.primary
  const showNudge = nudge && !loading && !disabled

  async function handleClick() {
    if (loading || disabled) return
    setLoading(true)
    try {
      await onClick?.()
    } catch {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{NUDGE_CSS}</style>
      <button
        onClick={handleClick}
        disabled={disabled || loading}
        style={{
          display: "block",
          width: "100%",
          flex: 1,
          background: bg ?? v.bg,
          color: textColor ?? v.color,
          fontWeight: v.fontWeight,
          fontSize: 18,
          animation: showNudge ? "fbNudge 1.0s ease-in-out infinite" : "none",
          ...style,
        }}
      >
        {loading ? "Loading…" : children}
      </button>
    </>
  )
}
