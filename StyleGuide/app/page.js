"use client"
import { useState } from "react"
import { FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, FOOTER_H, STYLE } from "../../packages/shared/components/styles"

const GAMES = [
  { name: "Fishbowl",         bg: "#3378FF", dark: "#0C47E9", mid: "#2357E7", wl: "#4A70FF", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Game of What",     bg: "#6B1A44", dark: "#4A123B", mid: "#5C1640", wl: "#8B2060", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Avalon",           bg: "#0F1923", dark: "#0A1520", mid: "#121F2E", wl: "#1E3248", yellow: "#C9A84C", actionBg: "#C9A84C", actionColor: "#2A1800" },
  { name: "First to Worst",   bg: "#004F45", dark: "#003638", mid: "#00423f", wl: "#006648", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Drawful",          bg: "#307977", dark: "#1C5250", mid: "#245E5C", wl: "#3A9180", yellow: "#F5E8D8", actionBg: "#F5E8D8", actionColor: "#000" },
  { name: "So Clover",        bg: "#6B8C2A", dark: "#4C7523", mid: "#5A8026", wl: "#90A331", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Telestrations",    bg: "#2B0F6B", dark: "#1A0840", mid: "#200C52", wl: "#4A228C", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Copycats",         bg: "#4A1A80", dark: "#1A0840", mid: "#200C52", wl: "#4A228C", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Codenames",        bg: "#C0B298", dark: "#9E9278", mid: "#AEA088", wl: "#D4C8B0", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Reverse Charades", bg: "#974344", dark: "#6B2A2B", mid: "#7D3233", wl: "#B85556", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Exquisite Corpse", bg: "#1A3A5C", dark: "#102540", mid: "#152E4E", wl: "#24507A", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
  { name: "Mr. White",        bg: "#2C2540", dark: "#1A1530", mid: "#221C38", wl: "#3E3560", yellow: "#FBDF54", actionBg: "#FBDF54", actionColor: "#000" },
]

const SECTION = { fontSize: 11, fontWeight: FONT_WEIGHT.heavy, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.5, marginBottom: 12 }

export default function StyleGuide() {
  const [gameIdx, setGameIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [inputVal, setInputVal] = useState("")
  const [selected, setSelected] = useState(null)

  const g = GAMES[gameIdx]
  const { bg, dark, mid, wl, yellow, actionBg, actionColor } = g

  const textColor = "white"

  function Section({ title, children, noBorder }) {
    return (
      <div style={{ borderTop: noBorder ? "none" : "1px solid rgba(255,255,255,0.08)", paddingTop: noBorder ? 0 : 28, marginBottom: 36 }}>
        <div style={SECTION}>{title}</div>
        {children}
      </div>
    )
  }

  const SELECTIONS = [
    { id: 1, text: "A golden retriever named Biscuit" },
    { id: 2, text: "My credit card statement" },
    { id: 3, text: "A warm bath" },
    { id: 4, text: "My own answer — can't vote", disabled: true },
  ]

  const WAITING = [
    { name: "Alice", done: true, typing: false },
    { name: "Bob", done: false, typing: true },
    { name: "Carol", done: false, typing: false },
    { name: "You", done: true, typing: false, isMe: true },
  ]

  return (
    <div style={{ background: bg, minHeight: "100vh", color: textColor, fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif" }}>

      {/* Game switcher */}
      <div style={{ background: dark, padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.6, marginBottom: 8 }}>Game Theme</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {GAMES.map((game, i) => (
            <button key={game.name} onClick={() => setGameIdx(i)}
              style={{ background: i === gameIdx ? yellow : "rgba(255,255,255,0.12)", color: i === gameIdx ? "#000" : "white", fontSize: 12, fontWeight: 700, padding: "6px 10px" }}>
              {game.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "28px 16px 120px" }}>

        {/* Color palette */}
        <Section title="Color Palette" noBorder>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Primary (bg)", color: bg },
              { label: "Cool-dark", color: dark },
              { label: "Mid-dark", color: mid },
              { label: "Warm-light", color: wl },
              { label: "Accent", color: yellow },
            ].map(({ label, color }) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ background: color, height: 48, marginBottom: 4 }} />
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, lineHeight: 1.3 }}>{label}</div>
                <div style={{ fontSize: 9, opacity: 0.5, fontFamily: "monospace" }}>{color}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Page title — {FONT_SIZE.headingLg}px / {FONT_WEIGHT.black}</div>
              <div style={{ fontSize: FONT_SIZE.headingLg, fontWeight: FONT_WEIGHT.black, lineHeight: 1.1 }}>Fishbowl</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Section heading — {FONT_SIZE.heading}px / {FONT_WEIGHT.black}</div>
              <div style={{ fontSize: FONT_SIZE.heading, fontWeight: FONT_WEIGHT.black }}>Round 2 of 3</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Section header label — {FONT_SIZE.sectionHeader}px / {FONT_WEIGHT.heavy}</div>
              <div style={STYLE.sectionHeader}>Players</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Body — {FONT_SIZE.body}px / {FONT_WEIGHT.regular}</div>
              <div style={{ fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.regular, opacity: OPACITY.normal }}>Teams guess clues in timed rounds across three phases.</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Secondary body — {FONT_SIZE.small}px / {FONT_WEIGHT.medium}</div>
              <div style={{ fontSize: FONT_SIZE.small, fontWeight: FONT_WEIGHT.medium, opacity: OPACITY.muted }}>Waiting for other players to submit…</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Eyebrow / progress label — {FONT_SIZE.min}px / {FONT_WEIGHT.heavy} / uppercase</div>
              <div style={STYLE.eyebrow}>Round 2 of 5</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 4 }}>Minimum — {FONT_SIZE.min}px / {FONT_WEIGHT.semibold}</div>
              <div style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.semibold, opacity: OPACITY.muted }}>4+ players · 20–30 min</div>
            </div>
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 2 }}>Primary action</div>
            <button style={{ background: actionBg, color: actionColor, fontSize: 16, fontWeight: 900, padding: "18px 24px", width: "100%", textAlign: "center" }}>
              Submit
            </button>
            <button disabled style={{ background: actionBg, color: actionColor, fontSize: 16, fontWeight: 900, padding: "18px 24px", width: "100%", textAlign: "center" }}>
              Submit (disabled)
            </button>
            <button
              onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 2000) }}
              style={{ background: actionBg, color: actionColor, fontSize: 16, fontWeight: 900, padding: "18px 24px", width: "100%", textAlign: "center" }}>
              {loading ? "Submitting…" : "Submit (tap to see loading)"}
            </button>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Secondary</div>
            <button style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}>
              Play Again
            </button>
            <button disabled style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}>
              Play Again (disabled)
            </button>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Destructive / danger</div>
            <button style={{ background: "rgba(255,80,80,0.25)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}>
              Reset to Lobby
            </button>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Small / inline</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ background: actionBg, color: actionColor, fontSize: 14, fontWeight: 800, padding: "10px 16px" }}>Join</button>
              <button style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 14, fontWeight: 700, padding: "10px 16px" }}>Skip</button>
              <button style={{ background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 20, padding: "0 8px", lineHeight: 1 }}>👉</button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Pulsing (unsubmitted text reminder)</div>
            <button style={{ background: actionBg, color: actionColor, fontSize: 16, fontWeight: 900, padding: "18px 24px", width: "100%", animation: "nudgePulse 1.4s ease-in-out infinite" }}>
              Submit ↑
            </button>
          </div>
        </Section>

        {/* Input fields */}
        <Section title="Input Fields">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 2 }}>Standard text input</div>
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Type your answer…"
              style={{ background: mid, color: "white", fontSize: 16, fontWeight: 500, padding: "16px", width: "100%" }}
            />

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Multi-line (textarea)</div>
            <textarea
              placeholder="Write your clue…"
              rows={3}
              style={{ background: mid, color: "white", fontSize: 16, fontWeight: 500, padding: "16px", width: "100%", resize: "none" }}
            />

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Duplicate error state</div>
            <input
              defaultValue="pizza"
              style={{ background: "rgba(255,80,80,0.2)", color: "white", fontSize: 16, fontWeight: 500, padding: "16px", width: "100%", outline: "2px solid rgba(255,80,80,0.7)" }}
            />
            <div style={{ fontSize: 13, color: "rgba(255,120,120,0.9)", fontWeight: 600 }}>No duplicate answers allowed</div>
          </div>
        </Section>

        {/* Player list */}
        <Section title="Player List (Lobby)">
          {["Alice", "Bob", "Carol", "You"].map((name, i) => (
            <div key={name} style={{ display: "flex", marginBottom: 3 }}>
              <div style={{ width: 48, flexShrink: 0, background: dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, padding: "13px 0" }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, background: mid, padding: "13px 16px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>
                  {name}
                  {name === "You" && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
                </span>
              </div>
            </div>
          ))}
        </Section>

        {/* Selections */}
        <Section title="Selections (Voting)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SELECTIONS.map(item => {
              const isSelected = selected === item.id
              const isDisabled = item.disabled
              return (
                <div key={item.id}>
                  <button
                    onClick={() => !isDisabled && setSelected(isSelected ? null : item.id)}
                    disabled={isDisabled}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "18px 16px", textAlign: "left",
                      background: isSelected ? yellow : isDisabled ? "rgba(255,255,255,0.05)" : mid,
                      color: isSelected ? "#000" : isDisabled ? "rgba(255,255,255,0.4)" : "white",
                      opacity: isDisabled ? 1 : undefined,
                    }}>
                    <span style={{ fontSize: 16, fontWeight: isSelected ? 700 : 500, flex: 1 }}>{item.text}</span>
                    {isSelected && <span style={{ fontSize: 18, marginLeft: 12, flexShrink: 0, fontWeight: 900 }}>✕</span>}
                    {isDisabled && <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginLeft: 12 }}>your answer</span>}
                  </button>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Waiting list */}
        <Section title="Waiting List">
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {WAITING.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", background: mid, padding: "13px 16px", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.done ? "#22C55E" : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                <span style={{ fontSize: 16, fontWeight: 600, flex: 1, opacity: p.done ? 1 : 0.75 }}>
                  {p.name}
                  {p.isMe && <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 6 }}>you</span>}
                </span>
                {p.typing && <span style={{ fontSize: 14, opacity: 0.8 }}>💬</span>}
                {!p.done && !p.isMe && (
                  <button style={{ background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 20, padding: "0 4px", lineHeight: 1 }}>👉</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, opacity: 0.55, fontWeight: 600, marginTop: 10 }}>2 / 4 submitted</div>
        </Section>

        {/* Results */}
        <Section title="Results (Post-Question)">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            <div style={{ background: mid, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ background: yellow, color: "#000", fontSize: 20, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0 }}>+3</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>A golden retriever named Biscuit</div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65, marginTop: 3 }}>
                    Alice & Bob
                    <span style={{ marginLeft: 6, background: yellow, color: "#000", fontSize: 11, fontWeight: 900, padding: "1px 5px", verticalAlign: "middle" }}>matched +1</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.5, marginTop: 4 }}>Carol, Dave voted</div>
                </div>
              </div>
            </div>
            <div style={{ background: mid, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", fontSize: 20, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0 }}>0</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>My credit card statement</div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65, marginTop: 3 }}>Carol</div>
                </div>
              </div>
            </div>
            <div style={{ background: mid, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", fontSize: 20, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "6px 0", flexShrink: 0 }}>1</div>
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, opacity: 0.65 }}>None of the above</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>Points this question</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[{ name: "Alice", pts: 4, detail: "3 votes · matched +1" }, { name: "Bob", pts: 2, detail: "1 vote · matched +1" }].map(s => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ background: yellow, color: "#000", fontSize: 18, fontWeight: 900, minWidth: 44, textAlign: "center", padding: "5px 0", flexShrink: 0 }}>+{s.pts}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.65 }}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* End Game */}
        <Section title="End Game (Final Scores)">
          <div style={{ fontSize: "clamp(56px, 16vw, 88px)", fontWeight: 900, lineHeight: 0.9, marginBottom: 32 }}>
            Game<br />Over
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>Final Scores</div>
          {[
            { name: "Alice", score: 12, isWinner: true },
            { name: "Bob",   score: 9  },
            { name: "Carol", score: 7  },
            { name: "You",   score: 5, isMe: true },
          ].map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ background: p.isWinner ? yellow : "rgba(255,255,255,0.15)", color: p.isWinner ? actionColor : "white", fontSize: 22, fontWeight: 900, minWidth: 52, textAlign: "center", padding: "8px 0" }}>
                {p.score}
              </div>
              <div>
                <span style={{ fontSize: 22, fontWeight: 700 }}>
                  {p.name}
                  {p.isMe && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
                </span>
                {p.isWinner && <span style={{ fontSize: 12, fontWeight: 800, color: yellow, marginLeft: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winner!</span>}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ background: actionBg, color: actionColor, fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>Play Again</button>
            <button style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%" }}>Play Another Game</button>
          </div>
        </Section>

        {/* Status bar */}
        <Section title="Status Bar">
          <div style={{ background: dark, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.75 }}>Round 2 of 3</div>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.65 }}>Alice's turn</div>
          </div>
        </Section>

        {/* Cards / wells */}
        <Section title="Cards & Wells">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 2 }}>Mid-dark well (prompts, clues, answers)</div>
            <div style={{ background: mid, padding: "20px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>A golden retriever named Biscuit</div>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.65 }}>Submitted by Alice</div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Score card</div>
            <div style={{ background: mid, padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>Alice</span>
                <span style={{ fontSize: 22, fontWeight: 900 }}>7</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, opacity: 0.75 }}>Bob</span>
                <span style={{ fontSize: 22, fontWeight: 900, opacity: 0.75 }}>5</span>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 8, marginBottom: 2 }}>Notification strip</div>
            <div style={{ background: dark, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>👉 Alice poked you</span>
              <button style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 13, fontWeight: 700, padding: "6px 12px" }}>✕</button>
            </div>
          </div>
        </Section>

        {/* Random Ideas */}
        <Section title="Random Ideas">
          <button style={{ background: wl, color: "white", fontSize: 15, fontWeight: 800, padding: "14px 18px", display: "block", width: "100%", marginBottom: 12 }}>
            ✦ Random ideas
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {[
              { text: "A dentist", isName: false },
              { text: "Traffic jam", isName: false },
              { text: "Vacation plans", isName: false },
              { text: "Carol", isName: true },
            ].map((chip, i) => (
              <div key={i} style={{
                padding: "7px 14px", borderRadius: 999,
                fontSize: 14, fontWeight: 700,
                background: chip.isName ? "rgba(251,223,84,0.12)" : wl,
                color: chip.isName ? yellow : "white",
                border: chip.isName ? `1px solid rgba(251,223,84,0.3)` : "1px solid rgba(255,255,255,0.15)",
              }}>
                {chip.text}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 6 }}>Exhausted state</div>
          <div style={{ background: wl, color: "rgba(255,255,255,0.25)", fontSize: 13, fontWeight: 600, padding: "12px 18px" }}>
            No more ideas for this question
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications (Poke / Message)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <div style={{ background: dark, padding: "8px 12px", maxWidth: 260, display: "flex", alignItems: "flex-start", gap: 8, boxShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", lineHeight: 1.3 }}>👉 Alice poked you</div>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1, flexShrink: 0 }}>✕</div>
            </div>
            <div style={{ background: dark, padding: "8px 12px", maxWidth: 260, display: "flex", alignItems: "flex-start", gap: 8, boxShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", lineHeight: 1.3 }}>Anyone else stuck?</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>Bob</div>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1, flexShrink: 0 }}>✕</div>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, fontWeight: 600 }}>Fixed top-right · auto-dismiss 4s · swipe to dismiss</div>
        </Section>

        {/* Action Bar */}
        <Section title="Action Bar (sits above PokeSystem footer)">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 2 }}>Primary only</div>
            <div style={{ display: "flex", height: 56 }}>
              <button style={{ flex: 1, height: "100%", background: actionBg, color: actionColor, fontSize: 17, fontWeight: 900 }}>Submit</button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 4, marginBottom: 2 }}>Primary + secondary</div>
            <div style={{ display: "flex", height: 56 }}>
              <button style={{ flex: 1, height: "100%", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 17, fontWeight: 700 }}>Skip</button>
              <button style={{ flex: 1, height: "100%", background: actionBg, color: actionColor, fontSize: 17, fontWeight: 900 }}>Lock It In</button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginTop: 4, marginBottom: 2 }}>Loading state</div>
            <div style={{ display: "flex", height: 56 }}>
              <button disabled style={{ flex: 1, height: "100%", background: actionBg, color: actionColor, fontSize: 17, fontWeight: 900 }}>Loading…</button>
            </div>

            <div style={{ fontSize: 13, opacity: 0.55, fontWeight: 600 }}>
              Positioned fixed at bottom: 56px (FOOTER_H). Never resets loading on success.
            </div>
          </div>
        </Section>

        {/* Sticky footer preview */}
        <Section title="Sticky Footer">
          <div style={{ background: dark, padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: 20, fontWeight: 800, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>☰</button>
            <button style={{ background: actionBg, color: actionColor, fontSize: 15, fontWeight: 900, padding: "10px 20px" }}>Submit</button>
          </div>
          <div style={{ fontSize: 13, opacity: 0.5, fontWeight: 600, marginTop: 8 }}>Hamburger left · action button right</div>
        </Section>

        {/* Spacing */}
        <Section title="Spacing Scale (8px grid)">
          {Object.entries(SPACE).map(([key, n]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{ width: n, height: 16, background: yellow, flexShrink: 0 }} />
              <span style={{ fontSize: FONT_SIZE.min, fontWeight: FONT_WEIGHT.semibold, opacity: OPACITY.muted }}>{key} — {n}px</span>
            </div>
          ))}
        </Section>

        {/* Opacity scale */}
        <Section title="Opacity Scale">
          {[
            { label: `full (${OPACITY.full}) — primary text`, val: OPACITY.full },
            { label: `normal (${OPACITY.normal}) — standard emphasis`, val: OPACITY.normal },
            { label: `moderate (${OPACITY.moderate}) — eyebrow labels`, val: OPACITY.moderate },
            { label: `muted (${OPACITY.muted}) — floor for colored bg`, val: OPACITY.muted },
            { label: `disabled (${OPACITY.disabled}) — buttons only`, val: OPACITY.disabled },
          ].map(({ label, val }) => (
            <div key={val} style={{ fontSize: 15, fontWeight: FONT_WEIGHT.semibold, opacity: val, marginBottom: 8 }}>{label}</div>
          ))}
        </Section>

      </div>
    </div>
  )
}
