"use client"
/*
  HomeScreen — individual game home/join page
  ────────────────────────────────────────────
  Full-screen centered layout with a big game title, tagline, Create Game button,
  a room-code join field + Join button, and a Dummy Game button fixed at the bottom.
  The Dummy Game button is present in every game — it is not optional.

  Props:
    title          ReactNode  — big game title (e.g. <>The Game<br />of What</>)
    subtitle       string     — tagline below the title
    onCreate       fn         — called when Create Game is tapped
    isCreating     bool       — disables and relabels Create button while creating
    joinCode       string     — controlled input value
    onJoinCodeChange fn(val)  — called with the new (uppercased) value on each keystroke
    onJoin         fn         — called when Join is tapped or Enter pressed
    nudgeJoin      bool       — pulses the Join button when true (requires nudgePulse keyframe in globals.css)
    error          string     — error message shown below the buttons (pass "" to hide)
    onDummyGame    fn         — called when Dummy Game is tapped (always shown; every game has one)
    isDummy        bool       — disables and relabels Dummy Game button while setting up
    colors         {
                     bg,      // page background
                     wl,      // input/join button background (warm-light)
                     yellow,  // create button background
                   }

  Usage (GameOfWhat):
    <HomeScreen
      title={<>The Game<br />of What</>}
      subtitle="Questions · Answers · Votes"
      onCreate={onCreateClick}
      isCreating={isCreating}
      joinCode={joinCode}
      onJoinCodeChange={setJoinCode}
      onJoin={onJoin}
      nudgeJoin={nudgeJoin}
      error={error}
      onDummyGame={onCreateClick}
      colors={{ bg: "#6B1A44", wl: "#821F42", yellow: "#FBDF54" }}
    />
*/

export default function HomeScreen({
  title,
  subtitle,
  onCreate,
  isCreating = false,
  joinCode = "",
  onJoinCodeChange,
  onJoin,
  nudgeJoin = false,
  error = "",
  onDummyGame,
  isDummy = false,
  colors = {},
}) {
  const { bg = "#111", wl = "#333", yellow = "#FBDF54" } = colors

  return (
    <div style={{
      minHeight: "100dvh",
      background: bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(52px, 16vw, 96px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-2px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 12,
      }}>
        {title}
      </h1>

      {subtitle && (
        <p style={{
          color: "rgba(255,255,255,0.65)",
          fontSize: 14,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 56,
          letterSpacing: "0.1em",
        }}>
          {subtitle}
        </p>
      )}

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onCreate}
          disabled={isCreating}
          style={{
            background: yellow,
            color: "#000",
            fontSize: 22,
            fontWeight: 900,
            padding: "22px 40px",
            width: "100%",
            display: "block",
          }}
        >
          {isCreating ? "Creating…" : "Create Game"}
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={e => onJoinCodeChange?.(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") onJoin?.() }}
            style={{
              flex: 1,
              minWidth: 0,
              background: wl,
              border: "none",
              color: "white",
              fontSize: 18,
              fontWeight: 800,
              padding: "18px 16px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              outline: "none",
            }}
          />
          <button
            onClick={onJoin}
            style={{
              background: wl,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              padding: "18px 20px",
              flexShrink: 0,
              animation: nudgeJoin ? "nudgePulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            Join
          </button>
        </div>
      </div>

      {!!error && (
        <p style={{ color: yellow, marginTop: 20, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
          Error: {error}
        </p>
      )}

      <button
        onClick={onDummyGame}
        disabled={isDummy}
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: wl, color: "rgba(255,255,255,0.65)",
          fontSize: 11, fontWeight: 700, padding: "8px 16px",
          letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap",
        }}
      >
        {isDummy ? "Setting up…" : "Dummy Game"}
      </button>
    </div>
  )
}
