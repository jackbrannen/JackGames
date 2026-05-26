"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const BG = "#111118"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#21232E"

const GAMES = [
  {
    name: "Fishbowl",
    description: "Teams guess clues from a bowl",
    players: "4+ players",
    url: "https://fishbowl.jackbrannen.com",
    bg: "#3378FF",
    color: "white",
    instructions: `Everyone splits into two teams. Before the game starts, each player secretly submits several clue words — people, places, things, phrases, anything goes. All the clues go into a shared "fishbowl."

The game has 3 rounds. In each round, teams take turns sending one player up to give clues. That clue-giver draws from the fishbowl and tries to get their team to guess as many clues as possible before time runs out.

Round 1 — Describe it: Say anything but the clue word itself.
Round 2 — One word: Only a single word as your clue.
Round 3 — Act it out: No words at all.

The same clues rotate through all rounds, so by Round 3 everyone has heard them and the game gets fast and chaotic. The team with the most points wins.`,
  },
  {
    name: "The Game of What",
    description: "Like Quiplash but with DIY Questions.",
    players: "4+ players",
    url: "https://gameofwhat.jackbrannen.com",
    bg: "#A02866",
    color: "white",
    instructions: `A voting game about creativity and knowing your crowd.

Every player writes an open-ended question that invites creative, funny answers. The game then presents each question to all players, and everyone submits an answer.

Answers are revealed anonymously, and the group votes for their favorite. The author of the winning answer earns points. Identical answers also earn bonus points.

Highest score after all rounds wins.`,
  },
  {
    name: "Avalon",
    description: "Hidden roles — find the traitors before they sabotage the quests.",
    players: "5–10 players",
    url: "https://avalon.jackbrannen.com",
    bg: "#C9A84C",
    color: "#2A1800",
    instructions: `A social deduction game of good vs. evil. Each player is secretly assigned a role — either a Loyal Servant (good) or a Minion of Mordred (evil). Evil players know each other. Merlin knows who is evil but must stay hidden.

The game is a series of 5 quests. A rotating leader proposes a team to go on each quest. Everyone votes to approve or reject it.

If approved, players on the quest secretly vote Success or Fail. One Fail card is enough to fail most quests.

Good wins if 3 quests succeed — but evil gets one last chance: the Assassin can name who they think Merlin is. If correct, evil wins.

Evil wins if 3 quests fail, 5 consecutive proposals are rejected, or the Assassin identifies Merlin.`,
  },
  {
    name: "First to Worst",
    description: "Submit 5 things, rank them secretly, then the group guesses your order.",
    players: "4+ players",
    url: "https://firsttoworst.jackbrannen.com",
    bg: "#004F45",
    color: "white",
    instructions: `A ranking game. Each player picks a theme (or it's random) and submits 5 words that fit the theme. Your words go to another player, who ranks them from first to worst.

Once everyone has ranked their words, the whole group tries to guess the exact ranking together — dragging words into what they think is the right order. The ranker watches and can't say anything.

After the group locks in their guess, the real ranking is revealed. Everyone scores points for every word in the correct position.`,
  },
  {
    name: "Codenames",
    description: "Two teams race to find their secret agents using one-word clues.",
    players: "4+ players",
    url: "https://codenames.jackbrannen.com",
    bg: "#C0B298",
    color: "#2C1A0A",
    instructions: `Two teams — Red and Blue. Each team has a Cluegiver who can see which words belong to their team, the other team, neutral bystanders, or the instant-lose Assassin.

Cluegivers take turns giving a one-word clue plus a number ("Vehicles, 3"). Their team guesses which words match that clue, one at a time. A correct guess continues the turn. A wrong guess ends the turn — and touching the Assassin loses the game immediately.

The first team to correctly identify all their words wins.`,
  },
  {
    name: "Telestrations",
    description: "Write a sentence, draw it, guess the drawing — watch it fall apart.",
    players: "5+ players",
    url: "https://telestrations.jackbrannen.com",
    bg: "#2B0F6B",
    color: "white",
    instructions: `A telephone-style game alternating between drawing and guessing.

Each player starts by writing a phrase. They pass it to the next player, who draws it. That drawing passes to the next player, who guesses what it is. Their guess passes on to be drawn again, and so on down the chain.

At the end, the original phrase and the final result are revealed side by side. The further it drifts from the original, the funnier it gets.`,
  },
  {
    name: "Exquisite Corpse",
    description: "Cooperative blind drawing game.",
    players: "4+ players",
    url: "https://exquisitecorpse.jackbrannen.com",
    bg: "#1A3A5C",
    color: "white",
    instructions: `A collaborative drawing chain. Each player starts a drawing, then folds their paper (digitally) to hide most of it — leaving only a small strip visible at the fold line as a hint for the next person.

The next player draws a continuation below the hint, not knowing what came before. This repeats until every player has added a section to every chain.

At the end, the full exquisite corpse — assembled from everyone's individual drawings — is revealed one layer at a time.`,
  },
  {
    name: "Drawful",
    description: "Draw weird. Guess weirder.",
    players: "4+ players",
    url: "https://drawful.jackbrannen.com",
    bg: "#307977",
    color: "white",
    instructions: `Each player gets a secret prompt and draws it on their phone. No labels allowed.

Everyone's drawings are shown one at a time. All other players type a fake title that sounds plausible. The real prompt is mixed in with the fakes, and everyone votes for which title they think is real.

You score points by voting for the real prompt, or by writing a fake that fools other players into voting for it. Identical fakes earn bonus points too.`,
  },
  {
    name: "So Clover",
    description: "Arrange keyword cards, write clues, guess each other's boards.",
    players: "2+ players",
    url: "https://soclover.jackbrannen.com",
    bg: "#6B8C2A",
    color: "white",
    instructions: `A cooperative word game. Each player gets a board with 4 keyword cards. Where two words from a card touch an edge, you write a single clue word that connects both keywords.

Once everyone has written their clues, the boards are passed. The next player sees only the clue words (not which keywords they connect) and must figure out the correct arrangement of the 4 cards.

Points are earned for correct placements. Perfect guesses earn a bonus point. Everyone's scores are summed — it's a cooperative total at the end.`,
  },
  {
    name: "Copycats",
    description: "Write a question for another player. Everyone else tries to fake their answer.",
    players: "3+ players",
    url: "https://copycats.jackbrannen.com",
    bg: "#5C2D8C",
    color: "white",
    instructions: `Each round, one player is the target and another is the questioner. The questioner writes a personal question directed at the target.

The target answers truthfully. Everyone else reads the question and writes what they think the target would say — trying to sound exactly like them.

All answers are shuffled and shown anonymously. Everyone votes for which answer is really the target's.

Points: guess the real answer → earn points. Your fake fools someone → earn a point per person fooled. Write the same answer as someone else → you both earn a bonus point.`,
  },
  {
    name: "Mr. White",
    description: "One player has a slightly different word. Find the impostor.",
    players: "4+ players",
    url: "https://mrwhite.jackbrannen.com",
    bg: "#2C2540",
    color: "white",
    instructions: `One player secretly gets a different word from everyone else — they're Mr. White.

Each player says one statement about their word without saying it directly. After everyone has spoken, the group votes to eliminate the player they think is Mr. White.

If they're right, Mr. White loses — unless they can guess what the real word was.

If the group is wrong, Mr. White survives to another round. Last player standing wins.`,
  },
  {
    name: "Reverse Charades",
    description: "Everyone acts it out — one person guesses.",
    players: "4+ players",
    url: "https://reversecharades.jackbrannen.com",
    bg: "#974344",
    color: "white",
    instructions: `Normal Charades in reverse: instead of one person acting for the group, the whole team acts while the guesser calls out guesses until they get it.

Three modes:
1. Catchphrase — teammates can say anything but the clue word.
2. Body cues — teammates tell the guesser what to do with their body until they figure it out.
3. Chain reaction — teammates alternate saying one word at a time to build sentences.

Teams alternate turns. The team with the most points wins.`,
  },
]

const EXTERNAL_GAMES = [
  {
    name: "Secret Hitler",
    description: "No login required.",
    players: "5–10 players",
    url: "https://secret-hitler.online",
    bg: "#C73B32",
    color: "white",
  },
  {
    name: "Wavelength",
    description: "iPhone game",
    players: "4+ players",
    url: "https://apps.apple.com/us/app/wavelength/id1512834505",
    bg: "#C4486C",
    color: "white",
  },
  {
    name: "Heads Up!",
    description: "iPhone game",
    players: "3+ players",
    url: "https://apps.apple.com/us/app/heads-up/id623592465",
    bg: "#2171C7",
    color: "white",
  },
  {
    name: "Among Us",
    description: "iPhone game",
    players: "4–15 players",
    url: "https://apps.apple.com/us/app/among-us/id1351168404",
    bg: "#1B1B2E",
    color: "white",
  },
]

function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}

function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

function shortDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const inputStyle = {
  background: WARM_LIGHT,
  color: "white",
  fontSize: 18,
  padding: "14px 16px",
  width: "100%",
  display: "block",
  border: "none",
  outline: "none",
  boxSizing: "border-box",
}

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [instructionsGame, setInstructionsGame] = useState(null)
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [saved, setSaved] = useState(false)
  const [logs, setLogs] = useState({ real: [], test: [] })
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    const p = loadProfile()
    if (p) {
      setProfile(p)
      setFirstName(p.firstName || "")
      setLastName(p.lastName || "")
      setUsername(p.username || "")
    }
  }, [])

  function openSettings() {
    const p = loadProfile()
    setFirstName(p?.firstName || "")
    setLastName(p?.lastName || "")
    setUsername(p?.username || "")
    setSaved(false)
    setSettingsOpen(true)
  }

  function saveSettings() {
    const trimFirst = firstName.trim()
    const trimLast = lastName.trim()
    const trimUser = username.trim()
    if (!trimFirst || !trimLast) return
    const p = { firstName: trimFirst, lastName: trimLast, username: trimUser }
    saveProfile(p)
    setProfile(p)
    setSaved(true)
    setTimeout(() => setSettingsOpen(false), 700)
  }

  async function openLogs() {
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const [fishbowl, gow, codenames, avalon, ftw, tel, ec, rc, soclover, copycats, drawful, mrwhite] = await Promise.all([
        supabase.from("players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("gow_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("codenames_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("avalon_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("ftw_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("tel_players").select("first_name,last_name,game_code,created_at").eq("is_bot", false).limit(2000),
        supabase.from("ec_players").select("first_name,last_name,game_code,created_at").eq("is_bot", false).limit(2000),
        supabase.from("reversecharades_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("soclover_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("cc_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("drawful_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("mrwhite_players").select("first_name,last_name,game_code,created_at").limit(2000),
      ])

      // people[fullName][gameName] = { count, first, last }
      const people = {}

      function addRows(rows, gameName) {
        for (const row of (rows ?? [])) {
          if (!row.first_name || !row.last_name) continue
          const name = `${row.first_name} ${row.last_name}`
          if (!people[name]) people[name] = {}
          if (!people[name][gameName]) people[name][gameName] = { count: 0, first: row.created_at, last: row.created_at }
          const g = people[name][gameName]
          g.count++
          if (row.created_at < g.first) g.first = row.created_at
          if (row.created_at > g.last) g.last = row.created_at
        }
      }

      addRows(fishbowl.data, "Fishbowl")
      addRows(gow.data, "Game of What")
      addRows(codenames.data, "Codenames")
      addRows(avalon.data, "Avalon")
      addRows(ftw.data, "First to Worst")
      addRows(tel.data, "Telestrations")
      addRows(ec.data, "Exquisite Corpse")
      addRows(rc.data, "Reverse Charades")
      addRows(soclover.data, "So Clover")
      addRows(copycats.data, "Copycats")
      addRows(drawful.data, "Drawful")
      addRows(mrwhite.data, "Mr. White")

      const toRows = entries => entries
        .map(([name, games]) => ({
          name,
          games: Object.entries(games)
            .map(([game, s]) => ({ game, ...s }))
            .sort((a, b) => a.game.localeCompare(b.game)),
          total: Object.values(games).reduce((sum, g) => sum + g.count, 0),
        }))
        .sort((a, b) => b.total - a.total)

      const isTest = ([name]) => name.split(" ").pop().toLowerCase() === "test"
      const real = toRows(Object.entries(people).filter(e => !isTest(e)))
      const test = toRows(Object.entries(people).filter(e => isTest(e)))

      setLogs({ real, test })
    } finally {
      setLogsLoading(false)
    }
  }

  const isJack = profile?.firstName?.trim().toLowerCase() === "jack" &&
    profile?.lastName?.trim().toLowerCase() === "brannen"

  return (
    <>
    <div style={{
      minHeight: "100dvh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
    }}>

      {/* Cog button — top right */}
      <button
        onClick={openSettings}
        aria-label="Settings"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          background: WARM_LIGHT,
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontSize: 22,
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        ⚙
      </button>

      {/* Settings overlay */}
      {settingsOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 100,
            paddingTop: 60,
          }}
        >
          <div style={{ background: "#1C1C26", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              Your Profile
            </div>
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveSettings()}
              placeholder="Display name (username)"
              maxLength={40}
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <button
              onClick={saveSettings}
              disabled={!firstName.trim() || !lastName.trim()}
              style={{
                background: saved ? WARM_LIGHT : YELLOW,
                color: saved ? "white" : "#000",
                fontSize: 18,
                fontWeight: 900,
                padding: "16px",
                width: "100%",
                display: "block",
                border: "none",
                cursor: "pointer",
              }}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Logs overlay */}
      {logsOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setLogsOpen(false) }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            overflowY: "auto",
            zIndex: 100,
            padding: "24px 16px 60px",
          }}
        >
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>
                Game Logs
              </div>
              <button
                onClick={() => setLogsOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {logsLoading && (
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>
                Loading…
              </div>
            )}

            {!logsLoading && logs.real.length === 0 && logs.test.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>
                No sessions found.
              </div>
            )}

            {!logsLoading && logs.real.map((person, i) => (
              <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 0" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>
                  {person.name}
                </div>
                {person.games.map(g => {
                  const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                  const dateStr = sameDay
                    ? shortDate(g.first)
                    : `${shortDate(g.first)} – ${shortDate(g.last)}`
                  const gameColor = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                  const bg = gameColor?.bg ?? "rgba(255,255,255,0.15)"
                  const fg = gameColor?.color ?? "white"
                  return (
                    <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 800, padding: "3px 8px", whiteSpace: "nowrap" }}>
                        {g.game}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                        {g.count}×
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                        {dateStr}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            {!logsLoading && logs.test.length > 0 && (
              <>
                <div style={{ margin: "24px 0 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)" }}>
                    Test Agents
                  </span>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                </div>
                {logs.test.map((person, i) => (
                  <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 0", opacity: 0.5 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>
                      {person.name}
                    </div>
                    {person.games.map(g => {
                      const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                      const dateStr = sameDay ? shortDate(g.first) : `${shortDate(g.first)} – ${shortDate(g.last)}`
                      const gameColor = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                      const bg = gameColor?.bg ?? "rgba(255,255,255,0.15)"
                      const fg = gameColor?.color ?? "white"
                      return (
                        <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 800, padding: "3px 8px", whiteSpace: "nowrap" }}>
                            {g.game}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                            {g.count}×
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                            {dateStr}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

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

      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 10 }}>
        {GAMES.map(game => (
          <div key={game.name} style={{ position: "relative" }}>
            <a
              href={game.url}
              style={{
                display: "block",
                background: game.bg,
                color: game.color,
                padding: "20px 20px",
                paddingRight: 52,
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2, marginBottom: 5 }}>
                {game.name}
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.2)", color: game.color, padding: "3px 8px", opacity: 0.85 }}>
                  {game.players}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.65 }}>
                {game.description}
              </div>
            </a>
            <button
              onClick={e => { e.preventDefault(); setInstructionsGame(game) }}
              style={{
                position: "absolute", top: 0, right: 0, bottom: 0,
                width: 44,
                background: "rgba(0,0,0,0.2)",
                color: game.color,
                fontSize: 16, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: 0.8,
              }}
            >
              ?
            </button>
          </div>
        ))}

        <div style={{ marginTop: 32, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.6)" }}>
            Games elsewhere
          </div>
        </div>

        {EXTERNAL_GAMES.map(game => (
          <a
            key={game.name}
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              background: game.bg,
              color: game.color,
              padding: "20px 20px",
              textDecoration: "none",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2, marginBottom: 5 }}>
              {game.name}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.2)", color: game.color, padding: "3px 8px", opacity: 0.85 }}>
                {game.players}
              </span>
            </div>
            {game.description && (
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.65 }}>
                {game.description}
              </div>
            )}
          </a>
        ))}

        {isJack && (
          <button
            onClick={openLogs}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
              paddingTop: 14,
              textAlign: "center",
            }}
          >
            View Logs
          </button>
        )}
      </div>
    </div>

    {instructionsGame && (
      <div onClick={() => setInstructionsGame(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div onClick={e => e.stopPropagation()} style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 64px" }}>
          <div style={{ background: instructionsGame.bg, color: instructionsGame.color, padding: "20px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{instructionsGame.name}</div>
              <button onClick={() => setInstructionsGame(null)} style={{ background: "rgba(0,0,0,0.2)", color: instructionsGame.color, fontSize: 18, fontWeight: 800, padding: "6px 12px" }}>✕</button>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.2)", color: instructionsGame.color, padding: "3px 8px", opacity: 0.85 }}>{instructionsGame.players}</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, fontWeight: 400, whiteSpace: "pre-wrap" }}>
            {instructionsGame.instructions}
          </div>
          <a href={instructionsGame.url} style={{ display: "block", marginTop: 24, background: instructionsGame.bg, color: instructionsGame.color, textAlign: "center", textDecoration: "none", fontSize: 16, fontWeight: 900, padding: "14px 24px" }}>
            Play {instructionsGame.name} →
          </a>
        </div>
      </div>
    )}
    </>
  )
}
