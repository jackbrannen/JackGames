/*
  sounds.js — shared audio feedback utilities (Sound Board)
  ─────────────────────────────────────────────────────────
  Web Audio oscillator-tone synth, same pattern as AlphaJam's lib/sounds.js.

    playCountdownTick()  — short blip, called each time the 3-2-1 countdown
                            numeral changes
    playCountdownGo()    — distinct rising tone when "Sounds!" appears
    playSoundsEnd()      — distinct tone when the 4s Sounds! timer expires
                            and the board returns

  All calls are fire-and-forget; errors are silently swallowed so audio
  never breaks the game.

  Usage:
    import { playCountdownTick, playCountdownGo, playSoundsEnd } from "../lib/sounds"
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

// Short blip — countdown numeral changed (3, 2, 1)
export function playCountdownTick() {
  play([[440, 0.1, 0.2]])
}

// Rising two-tone — "Sounds!" appears, go time
export function playCountdownGo() {
  play([[523, 0.09], [784, 0.22, 0.26]])
}

// Descending tone — Sounds! timer expired, board returns
export function playSoundsEnd() {
  play([[659, 0.1], [440, 0.2, 0.2]])
}
