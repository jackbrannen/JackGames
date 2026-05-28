"use client"
/*
  TextEntry — text input with typing indicator support
  ─────────────────────────────────────────────────────
  Single-field textarea or input, styled consistently. Calls
  onTypingChange so the game page can update the DB typing indicator
  (which feeds WaitingList dots on other players' screens).

  The component does NOT handle submit — pass a FooterButton for that.
  The component does NOT pulse the submit button — do that in the game
  page by pairing with useSubmitNudge:
    const nudge = useSubmitNudge(text, submitted)
    <TextEntry value={text} onChange={setText} onTypingChange={setIsTyping} />
    <FooterButton nudge={nudge} onClick={doSubmit}>Submit</FooterButton>

  Props:
    value           string
    onChange        (newValue: string) => void
    onTypingChange  (isTyping: bool) => void   — debounced ~2s after last keystroke
    placeholder     string
    maxLength       number
    multiline       bool    — textarea (default) vs input (false)
    rows            number  — textarea rows (default 3)
    bg              hex     — input background (required — use game's WARM_LIGHT)
    fontSize        number  — default 20
    disabled        bool
    autoFocus       bool
    inputRef        ref     — attached to the underlying <input>/<textarea> element
    onSubmit        () => void  — called on Enter key (single-line only)
                               — for focus-next in multi-field forms, pass
                               — () => nextRef.current?.focus() on intermediate fields
    style           object  — additional style overrides

  Typing indicator:
    onTypingChange(true)  fires on every keystroke
    onTypingChange(false) fires 2s after the last keystroke
    The game page owns writing this to the DB, e.g.:
      async function setTyping(isTyping) {
        await supabase.from("gow_players").update({ is_typing: isTyping }).eq("id", myPlayerId)
      }
*/

import { useRef } from "react"

export default function TextEntry({
  value = "",
  onChange,
  onTypingChange,
  placeholder = "",
  maxLength,
  multiline = true,
  rows = 3,
  bg = "rgba(255,255,255,0.15)",
  fontSize = 20,
  disabled = false,
  autoFocus = false,
  inputRef,
  onSubmit,
  style,
}) {
  const typingTimer = useRef(null)

  function handleChange(e) {
    onChange?.(e.target.value)
    if (onTypingChange) {
      onTypingChange(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => onTypingChange(false), 2000)
    }
  }

  function handleKeyDown(e) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault()
      onSubmit?.()
    }
  }

  const shared = {
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    placeholder,
    maxLength,
    disabled,
    autoFocus,
    style: {
      background: bg,
      color: "white",
      fontSize,
      fontWeight: 600,
      padding: "16px 18px",
      width: "100%",
      display: "block",
      outline: "none",
      border: "none",
      lineHeight: 1.4,
      ...style,
    },
  }

  if (multiline) {
    return <textarea {...shared} ref={inputRef} rows={rows} style={{ ...shared.style, resize: "none" }} />
  }
  return <input {...shared} ref={inputRef} />
}
