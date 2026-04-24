"use client"

const BG = "#111118"
const YELLOW = "#FBDF54"

const GAMES = [
  {
    name: "Fishbowl",
    description: "Teams guess clues from a bowl",
    players: "4+ players",
    url: "https://fishbowl.jackbrannen.com",
    bg: "#3378FF",
  },
  {
    name: "The Game of What",
    description: "Like Quiplash but with DIY Questions.",
    players: "4+ players",
    url: "https://gameofwhat.jackbrannen.com",
    bg: "#1a1a2e",
    border: true,
  },
  {
    name: "Codenames",
    description: "Give one-word clues to reveal your team's cards.",
    players: "4+ players",
    url: "https://codenames.jackbrannen.com",
    bg: "#1C1305",
    border: true,
  },
  {
    name: "Avalon",
    description: "Hidden roles — find the traitors before they sabotage the quests.",
    players: "5–10 players",
    url: "https://avalon.jackbrannen.com",
    bg: "#0F1923",
    border: true,
  },
]

export default function Home() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(48px, 14vw, 88px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: "-2px",
        lineHeight: 0.9,
        textAlign: "center",
        marginBottom: 64,
      }}>
        Jack's<br />Games
      </h1>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 10 }}>
        {GAMES.map(game => (
          <a
            key={game.name}
            href={game.url}
            style={{
              display: "block",
              background: game.bg,
              color: "white",
              padding: "28px 28px",
              textDecoration: "none",
              outline: game.border ? "1px solid rgba(255,255,255,0.15)" : "none",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>
              {game.name}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.55, marginBottom: 4 }}>
              {game.description}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.35, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {game.players}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
