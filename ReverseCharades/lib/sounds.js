/*
  sounds.js — shared audio feedback utilities
  ─────────────────────────────────────────────
  Three functions, each a distinct sound event:

    playSubmit()   — single ding on successful form submission
    playYourTurn() — two-tone chirp when it's the player's turn to act
    playPoke()     — descending blip when a poke is received

  All calls are fire-and-forget; errors are silently swallowed so audio
  never breaks the game.

  Usage:
    import { playSubmit, playYourTurn, playPoke } from "../lib/sounds"
    playYourTurn()   // call when phase changes to your active turn
    playSubmit()     // call after a successful supabase.rpc() submit
    // playPoke() is already called inside Notifications.js
*/

function tone(freq, start, dur, gainVal, ctx) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(gainVal, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.start(start)
  osc.stop(start + dur)
}

function play(notes) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    let t = ctx.currentTime
    for (const [freq, dur, gain = 0.22] of notes) {
      tone(freq, t, dur, gain, ctx)
      t += dur
    }
  } catch {}
}

// Single ascending ding — confirms the player did something
export function playSubmit() {
  play([[659, 0.18]])
}

// Two-tone rising chirp — signals "your turn now"
export function playYourTurn() {
  play([[523, 0.08], [659, 0.18]])
}

// Short descending blip — poke received
export function playPoke() {
  play([[880, 0.05, 0.18], [660, 0.18, 0.18]])
}
