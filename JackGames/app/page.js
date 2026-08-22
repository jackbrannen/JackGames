"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const BG = "#111118"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#21232E"
const PANEL_BG = "#1A1B26"

const TYPES = ["Word games", "Cooperative", "Drawing", "Voting/Judging", "Teams", "Hidden roles", "Acting"]

const GROUPS = [
  { name: "Easy Peasy", description: "Quick and low-energy" },
  { name: "Medium Schmedium", description: "Some brainpower required" },
  { name: "Big Boys", description: "Better lock in" },
]

const GAMES = [
  // ── Easy Peasy ──
  {
    name: "Typecast",
    description: "Assign a word for each player, then guess how everyone else did",
    players: "3+ players", minPlayers: 3, group: "Easy Peasy", types: ["Word games", "Cooperative"],
    url: "https://typecast.jackbrannen.com", bg: "#E8553A", color: "white",
    instructions: `Everyone gets a handful of random words and, at the same time, drags one word onto each other player — whoever it fits best. There are a couple of spare words to leave out.

Then, one board at a time, the whole group works together to reconstruct someone's picks, dragging the same words onto the same people.

You score a point for every word placed on the same person the caster chose. It's cooperative — add up your matches across everyone's boards and see how well you read the room.`,
  },
  {
    name: "So Clover",
    description: "Arrange keyword cards, write clues, guess each other's boards",
    players: "2+ players", minPlayers: 2, group: "Easy Peasy", types: ["Word games", "Cooperative"],
    url: "https://soclover.jackbrannen.com", bg: "#6B8C2A", color: "white",
    instructions: `A cooperative word game. Each player gets a board with 4 keyword cards. Where two words from a card touch an edge, you write a single clue word that connects both keywords.

Once everyone has written their clues, the boards are passed. The next player sees only the clue words (not which keywords they connect) and must figure out the correct arrangement of the 4 cards.

Points are earned for correct placements. Perfect guesses earn a bonus point. Everyone's scores are summed — it's a cooperative total at the end.`,
  },
  {
    name: "First to Worst",
    description: "Rank 5 things, then the group guesses your order",
    players: "3+ players", minPlayers: 3, group: "Easy Peasy", types: ["Word games", "Voting/Judging", "Cooperative"],
    url: "https://firsttoworst.jackbrannen.com", bg: "#004F45", color: "white",
    instructions: `A ranking game. Each player picks a theme (or it's random) and submits 5 words that fit the theme. Your words go to another player, who ranks them from first to worst.

Once everyone has ranked their words, the whole group tries to guess the exact ranking together — dragging words into what they think is the right order. The ranker watches and can't say anything.

After the group locks in their guess, the real ranking is revealed. Everyone scores points for every word in the correct position.`,
  },
  {
    name: "Exquisite Corpse",
    description: "Cooperative blind drawing game",
    players: "4+ players", minPlayers: 4, group: "Easy Peasy", types: ["Drawing", "Cooperative"],
    url: "https://exquisitecorpse.jackbrannen.com", bg: "#1A3A5C", color: "white",
    instructions: `A collaborative drawing chain. Each player starts a drawing, then folds their paper (digitally) to hide most of it — leaving only a small strip visible at the fold line as a hint for the next person.

The next player draws a continuation below the hint, not knowing what came before. This repeats until every player has added a section to every chain.

At the end, the full exquisite corpse — assembled from everyone's individual drawings — is revealed one layer at a time.`,
  },
  {
    name: "Mr. White",
    description: "One player has a slightly different word—find the impostor",
    players: "4+ players", minPlayers: 4, group: "Easy Peasy", types: ["Hidden roles", "Acting"],
    url: "https://mrwhite.jackbrannen.com", bg: "#2C2540", color: "white",
    instructions: `One player secretly gets a different word from everyone else — they're Mr. White.

Each player says one statement about their word without saying it directly. After everyone has spoken, the group votes to eliminate the player they think is Mr. White.

If they're right, Mr. White loses — unless they can guess what the real word was.

If the group is wrong, Mr. White survives to another round. Last player standing wins.`,
  },
  {
    name: "Copycats",
    description: "Answer questions as each other",
    players: "3+ players", minPlayers: 3, group: "Easy Peasy", types: ["Voting/Judging"],
    url: "https://copycats.jackbrannen.com", bg: "#5C2D8C", color: "white",
    instructions: `Each round, one player is the target and another is the questioner. The questioner writes a personal question directed at the target.

The target answers truthfully. Everyone else reads the question and writes what they think the target would say — trying to sound exactly like them.

All answers are shuffled and shown anonymously. Everyone votes for which answer is really the target's.

Points: guess the real answer → earn points. Your fake fools someone → earn a point per person fooled. Write the same answer as someone else → you both earn a bonus point.`,
  },
  {
    name: "The Game of What",
    description: "Like Quiplash but with DIY questions",
    players: "4+ players", minPlayers: 4, group: "Easy Peasy", types: ["Word games", "Voting/Judging"],
    url: "https://gameofwhat.jackbrannen.com", bg: "#A02866", color: "white",
    instructions: `A voting game about creativity and knowing your crowd.

Every player writes an open-ended question that invites creative, funny answers. The game then presents each question to all players, and everyone submits an answer.

Answers are revealed anonymously, and the group votes for their favorite. The author of the winning answer earns points. Identical answers also earn bonus points.

Highest score after all rounds wins.`,
  },
  // ── Medium Schmedium ──
  // Alpha Jam hidden from the catalog (still deployed at alphajam.jackbrannen.com, and still
  // wired into the activity log below) — re-add the object here to bring it back.
  {
    name: "Word Birds",
    description: "Shout a word using every card on the table",
    players: "2+ players", minPlayers: 2, group: "Medium Schmedium", types: ["Word games"],
    url: "https://wordbirds.jackbrannen.com", bg: "#FEE471", color: "#221A12",
    instructions: `Everyone plays at once. Each round shows 3-5 cards on the table: letters you must work into a single word, red letters that are forbidden, and sometimes a reverse-arrow (only red letters count, everything else is forbidden) or a voice/accent card (say your word in that voice).

Race to be the first to shout a valid word using the required letters while avoiding the forbidden ones — the group judges validity, there's no typing or app-side checking.

Whoever says an invalid word (or is the last player left when everyone else has gone) loses a point. Hit zero and you're eliminated, though you can keep watching. Last player with points left wins.`,
  },
  {
    name: "Things in Rings",
    description: "Deduce the Knower's secret rules for a 3-ring Venn diagram",
    players: "3+ players", minPlayers: 3, group: "Medium Schmedium", types: ["Word games"],
    url: "https://thingsinrings.jackbrannen.com", bg: "#C0C9BC", color: "#2A303C",
    instructions: `One player is the Knower and secretly writes a rule for each of three rings on a Venn diagram. Everyone else is a Finder, trying to figure out those rules by testing where words belong.

Finders submit words into a shared pool, then take turns picking a word from their hand and guessing which zone of the diagram it belongs in — a single ring, an overlap, or entirely outside.

The Knower taps where the word actually goes. Guess right and the word is set aside for good; guess wrong and you draw a replacement — either way, the turn passes to the next Finder.

Tap any zone at any time to see what's already been placed there and gather clues. First Finder to empty their hand wins — though anyone who hasn't gone yet this round with exactly one word left gets a final chance to also finish and tie.`,
  },
  {
    name: "Sound Board",
    description: "Make the sounds. Your team has to guess what you meant",
    players: "4+ players", minPlayers: 4, group: "Medium Schmedium", types: ["Teams", "Word games", "Acting"],
    url: "https://soundboard.jackbrannen.com", bg: "#249E64", color: "white",
    instructions: `Two teams — Boys and Girls. Everyone submits words at the start; those become the pool for the whole game.

On your turn, pick 1–3 words from the board. When the countdown ends, make sound effects for the words you picked — no talking, no miming, just noises. Your team works together on one shared guess — anyone can tap a word to add it, and anyone can submit once you're ready.

Score +1 for each of your words your team guessed, -1 for each of your words they missed, -1 for each wrong word they guessed.

Correctly guessed words leave the board; new ones take their place. Words that stick around get more valuable — up to 9 points — the longer they survive.

First team to 16 points wins.`,
  },
  {
    name: "Drawful",
    description: "Guess prompts based on the drawing",
    players: "4+ players", minPlayers: 4, group: "Medium Schmedium", types: ["Drawing", "Voting/Judging"],
    url: "https://drawful.jackbrannen.com", bg: "#307977", color: "white",
    instructions: `Each player gets a secret prompt and draws it on their phone. No labels allowed.

Everyone's drawings are shown one at a time. All other players type a fake title that sounds plausible. The real prompt is mixed in with the fakes, and everyone votes for which title they think is real.

You score points by voting for the real prompt, or by writing a fake that fools other players into voting for it. Identical fakes earn bonus points too.`,
  },
  {
    name: "What On Earth",
    description: "Translate words for aliens",
    players: "4+ players", minPlayers: 4, group: "Medium Schmedium", types: ["Word games", "Cooperative"],
    url: "https://whatonearth.jackbrannen.com", bg: "#1A1F2E", color: "white",
    instructions: `Each turn, two players team up as co-Earthlings trying to beam a secret word to everyone else. The rest are Aliens trying to guess it.

The Earthlings share a translator card of scrambled letters plus a few blanks, and must spell the word using only those letters. A blank is a wildcard for any letter. Get creative with spacing and arrangement — you just can't use letters that aren't on the card.

The Earthlings get three attempts at the same word, each one easier than the last: first 1 blank, then 2, then 4.

A correct guess scores 3 points on attempt 1, 2 on attempt 2, and 1 on attempt 3. Both Earthlings and the Alien who guessed all score those points. Everyone is an Earthling for two turns, and the highest score wins.

With exactly 3 players the game is fully cooperative — chase one shared team score, aiming for a perfect 9.`,
  },
  {
    name: "Secret Phrase",
    description: "Slip the secret phrase into your answer—the other team guesses it",
    players: "4+ players", minPlayers: 4, group: "Medium Schmedium", types: ["Teams", "Acting"],
    url: "https://secretphrase.jackbrannen.com", bg: "#2434C4", color: "white",
    instructions: `Everyone splits into two teams. Each turn, one team secretly gets a phrase. One player from that team is "up" — the other team asks them any question out loud, and they have to answer using the secret phrase, without being too obvious about it.

The other team then picks a second player from the phrase team to answer the same question — that player tries to repeat the phrase too.

Once both have answered, the guessing team says the phrase out loud. The phrase team confirms yes or no. If the group agrees they got it, the guessing team scores a point.

Turns alternate between teams, and every player gets to be the one "up" at least once. Most points wins.`,
  },
  {
    name: "Hearing Voices",
    description: "Do a voice, teammates guess who from an emoji clue",
    players: "4+ players", minPlayers: 4, group: "Medium Schmedium", types: ["Teams", "Acting"],
    url: "https://hearingvoices.jackbrannen.com", bg: "#7A4FDB", color: "white",
    instructions: `Boys vs Girls. Each turn, one player on the active team secretly sees which of 9 characters they've been assigned — everyone else just sees an emoji in the center of the grid.

That player does the assigned character's voice, reacting to the emoji however that character would. Their teammates guess which of the 9 cards matches by tapping it, then submit their guess.

Correct guesses score points, wrong guesses lose points (host sets how many of each in the lobby). The emoji changes and a new character is assigned after every guess, so a single turn can run through several guesses before time runs out.

Turns alternate between teams. Most points when the rounds run out wins.`,
  },
  {
    name: "Telestrations",
    description: "Write a sentence, draw it, then write a sentence, then a drawing…",
    players: "5+ players", minPlayers: 5, group: "Medium Schmedium", types: ["Drawing"],
    url: "https://telestrations.jackbrannen.com", bg: "#2B0F6B", color: "white",
    instructions: `A telephone-style game alternating between drawing and guessing.

Each player starts by writing a phrase. They pass it to the next player, who draws it. That drawing passes to the next player, who guesses what it is. Their guess passes on to be drawn again, and so on down the chain.

At the end, the original phrase and the final result are revealed side by side. The further it drifts from the original, the funnier it gets.`,
  },
  {
    name: "Same Page",
    description: "Try to come up with the same answer as everyone else",
    players: "2+ players", minPlayers: 2, group: "Medium Schmedium", types: ["Word games", "Cooperative"],
    url: "https://samepage.jackbrannen.com", bg: "#FF85FD", color: "#3C3022",
    instructions: `Everyone sees the same three prompts each round, each with a letter. Privately write an answer for each one.

When all answers are revealed, the group checks every prompt where enough of you landed on the same answer — you verify the matches yourselves.

You need at least one match each round. Extra matches get banked, and a banked match covers a future round where you come up empty.

Survive every round to win; run out of matches and it's game over.`,
  },
  // ── Big Boys ──
  {
    name: "Reverse Charades",
    description: "The team gives clues, one person guesses",
    players: "4+ players", minPlayers: 4, group: "Big Boys", types: ["Teams", "Word games", "Acting"],
    url: "https://reversecharades.jackbrannen.com", bg: "#974344", color: "white",
    instructions: `Normal Charades in reverse: instead of one person acting for the group, the whole team acts while the guesser calls out guesses until they get it.

Three modes:
1. Catchphrase — teammates can say anything but the clue word.
2. Body cues — teammates tell the guesser what to do with their body until they figure it out.
3. Chain reaction — teammates alternate saying one word at a time to build sentences.

Teams alternate turns. The team with the most points wins.`,
  },
  {
    name: "Codenames",
    description: "Two teams race to find their secret agents using one-word clues",
    players: "4+ players", minPlayers: 4, group: "Big Boys", types: ["Teams", "Word games"],
    url: "https://codenames.jackbrannen.com", bg: "#C0B298", color: "#2C1A0A",
    instructions: `Two teams — Red and Blue. Each team has a Cluegiver who can see which words belong to their team, the other team, neutral bystanders, or the instant-lose Assassin.

Cluegivers take turns giving a one-word clue plus a number ("Vehicles, 3"). Their team guesses which words match that clue, one at a time. A correct guess continues the turn. A wrong guess ends the turn — and touching the Assassin loses the game immediately.

The first team to correctly identify all their words wins.`,
  },
  {
    name: "Avalon",
    description: "Find the traitors before they sabotage the quests",
    players: "5–10 players", minPlayers: 5, group: "Big Boys", types: ["Hidden roles", "Teams"],
    url: "https://avalon.jackbrannen.com", bg: "#C9A84C", color: "#2A1800",
    instructions: `A social deduction game of good vs. evil. Each player is secretly assigned a role — either a Loyal Servant (good) or a Minion of Mordred (evil). Evil players know each other. Merlin knows who is evil but must stay hidden.

The game is a series of 5 quests. A rotating leader proposes a team to go on each quest. Everyone votes to approve or reject it.

If approved, players on the quest secretly vote Success or Fail. One Fail card is enough to fail most quests.

Good wins if 3 quests succeed — but evil gets one last chance: the Assassin can name who they think Merlin is. If correct, evil wins.

Evil wins if 3 quests fail, 5 consecutive proposals are rejected, or the Assassin identifies Merlin.`,
  },
  {
    name: "Decrypto",
    description: "Clue your team to keywords without the other team cracking it",
    players: "4+ players", minPlayers: 4, group: "Big Boys", types: ["Teams", "Word games"],
    url: "https://decrypto.jackbrannen.com", bg: "#B7DAEE", color: "#15314A",
    instructions: `Two teams, each with four secret keywords numbered 1–4 that only your team can see.

Each round, one teammate is the Encryptor. They get a secret 3-digit code (three different digits from 1–4) and give one clue for each digit, hinting at the keyword in that position.

Both teams then guess the code. Your team has to decode it correctly — guess wrong and you take a Miscommunication. The other team tries to intercept it using every clue you've given so far — if they crack it, they take an Interception.

(Round 1 can't be intercepted — there's no clue history yet.)

Win by landing 2 Interceptions. Lose if you rack up 2 Miscommunications. If no one's decided after 8 rounds, the most Interceptions wins.`,
  },
  {
    name: "Fishbowl",
    description: "Teams guess clues from a bowl",
    players: "4+ players", minPlayers: 4, group: "Big Boys", types: ["Teams", "Acting"],
    url: "https://fishbowl.jackbrannen.com", bg: "#3378FF", color: "white",
    instructions: `Everyone splits into two teams. Before the game starts, each player secretly submits several clue words — people, places, things, phrases, anything goes. All the clues go into a shared "fishbowl."

The game has 3 rounds. In each round, teams take turns sending one player up to give clues. That clue-giver draws from the fishbowl and tries to get their team to guess as many clues as possible before time runs out.

Round 1 — Describe it: Say anything but the clue word itself.
Round 2 — One word: Only a single word as your clue.
Round 3 — Act it out: No words at all.

The same clues rotate through all rounds, so by Round 3 everyone has heard them and the game gets fast and chaotic. The team with the most points wins.`,
  },
]

const EXTERNAL_GAMES = [
  {
    name: "Secret Hitler",
    description: "No login required.",
    players: "5–10 players", minPlayers: 5, types: ["Hidden roles"],
    url: "https://secret-hitler.online", bg: "#C73B32", color: "white",
  },
  {
    name: "Wavelength",
    description: "iPhone game",
    players: "4+ players", minPlayers: 4, types: ["Cooperative", "Voting/Judging"],
    url: "https://apps.apple.com/us/app/wavelength/id1512834505", bg: "#C4486C", color: "white",
  },
  {
    name: "Heads Up!",
    description: "iPhone game",
    players: "3+ players", minPlayers: 3, types: ["Teams", "Word games"],
    url: "https://apps.apple.com/us/app/heads-up/id623592465", bg: "#2171C7", color: "white",
  },
  {
    name: "Among Us",
    description: "iPhone game",
    players: "4–15 players", minPlayers: 4, types: [],
    url: "https://apps.apple.com/us/app/among-us/id1351168404", bg: "#1B1B2E", color: "white",
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

function matchesFilters(game, playerCount, typeFilter) {
  if (playerCount !== null && game.minPlayers > playerCount) return false
  if (typeFilter.size > 0 && !game.types.some(t => typeFilter.has(t))) return false
  return true
}

// Simple funnel icon
function FilterIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ display: "block", flexShrink: 0 }}>
      <path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z"/>
    </svg>
  )
}

// Simple profile icon
function ProfileIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ display: "block", flexShrink: 0 }}>
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6v1H2v-1z"/>
    </svg>
  )
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

function GameCard({ game, onInfo }) {
  return (
    <div style={{ position: "relative" }}>
      <a
        href={game.url}
        target={game.external ? "_blank" : undefined}
        rel={game.external ? "noopener noreferrer" : undefined}
        style={{ display: "block", background: game.bg, color: game.color, padding: "16px 20px", paddingRight: onInfo ? 52 : 20, textDecoration: "none" }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>
          {game.name}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.15)", color: game.color, padding: "3px 7px", opacity: 0.65 }}>
            {game.players}
          </span>
          {game.types.map(t => (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.15)", color: game.color, padding: "3px 7px", opacity: 0.65 }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.85 }}>
          {game.description}
        </div>
      </a>
      {onInfo && (
        <button
          onClick={e => { e.preventDefault(); onInfo(game) }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 44, background: "rgba(0,0,0,0.2)", color: game.color, fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8, border: "none", cursor: "pointer" }}
        >
          ?
        </button>
      )}
    </div>
  )
}

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [instructionsGame, setInstructionsGame] = useState(null)
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [saved, setSaved] = useState(false)
  const [logs, setLogs] = useState({ real: [], test: [], instancesReal: [], instancesTest: [] })
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsView, setLogsView] = useState("player")

  const [playerCount, setPlayerCount] = useState(null)
  const [typeFilter, setTypeFilter] = useState(new Set())

  useEffect(() => {
    const p = loadProfile()
    if (p) { setProfile(p); setFirstName(p.firstName || ""); setLastName(p.lastName || ""); setUsername(p.username || "") }
  }, [])

  function openSettings() {
    const p = loadProfile()
    setFirstName(p?.firstName || ""); setLastName(p?.lastName || ""); setUsername(p?.username || "")
    setSaved(false); setSettingsOpen(true)
  }

  function saveSettings() {
    const trimFirst = firstName.trim(), trimLast = lastName.trim(), trimUser = username.trim()
    if (!trimFirst || !trimLast) return
    const p = { firstName: trimFirst, lastName: trimLast, username: trimUser }
    saveProfile(p); setProfile(p); setSaved(true)
    setTimeout(() => setSettingsOpen(false), 700)
  }

  function toggleType(t) {
    setTypeFilter(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  }
  function clearFilters() {
    setPlayerCount(null); setTypeFilter(new Set())
  }

  const filtersActive = playerCount !== null || typeFilter.size > 0
  const activeCount = (playerCount !== null ? 1 : 0) + typeFilter.size

  const filteredGames = GAMES.filter(g => matchesFilters(g, playerCount, typeFilter))
  const filteredExternal = EXTERNAL_GAMES.filter(g => matchesFilters(g, playerCount, typeFilter))

  async function openLogs() {
    setLogsOpen(true); setLogsLoading(true)
    try {
      const [fishbowl, gow, codenames, avalon, ftw, tel, ec, rc, soclover, copycats, drawful, mrwhite, alphajam, woe, decrypto, samepage, typecast, soundboard, secretphrase, hearingvoices] = await Promise.all([
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
        supabase.from("alphajam_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("woe_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("dc_players").select("first_name,last_name,game_code,created_at").eq("is_bot", false).limit(2000),
        supabase.from("sp_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("tc_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("sb_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("secretphrase_players").select("first_name,last_name,game_code,created_at").limit(2000),
        supabase.from("hv_players").select("first_name,last_name,game_code,created_at").limit(2000),
      ])
      const people = {}, displayNames = {}, instances = {}
      function addRows(rows, gameName) {
        for (const row of (rows ?? [])) {
          if (!row.first_name || !row.last_name) continue
          const raw = `${row.first_name} ${row.last_name}`, key = raw.toLowerCase()
          const displayName = raw.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
          if (!displayNames[key]) displayNames[key] = displayName
          if (!people[key]) people[key] = {}
          if (!people[key][gameName]) people[key][gameName] = { count: 0, first: row.created_at, last: row.created_at }
          const g = people[key][gameName]; g.count++
          if (row.created_at < g.first) g.first = row.created_at
          if (row.created_at > g.last) g.last = row.created_at

          const instKey = `${gameName}::${row.game_code}`
          if (!instances[instKey]) instances[instKey] = { game: gameName, code: row.game_code, date: row.created_at, players: [] }
          const inst = instances[instKey]
          if (row.created_at < inst.date) inst.date = row.created_at
          inst.players.push({ name: displayName, key })
        }
      }
      addRows(fishbowl.data, "Fishbowl"); addRows(gow.data, "Game of What"); addRows(codenames.data, "Codenames")
      addRows(avalon.data, "Avalon"); addRows(ftw.data, "First to Worst"); addRows(tel.data, "Telestrations")
      addRows(ec.data, "Exquisite Corpse"); addRows(rc.data, "Reverse Charades"); addRows(soclover.data, "So Clover")
      addRows(copycats.data, "Copycats"); addRows(drawful.data, "Drawful"); addRows(mrwhite.data, "Mr. White")
      addRows(alphajam.data, "Alpha Jam"); addRows(woe.data, "What On Earth"); addRows(decrypto.data, "Decrypto")
      addRows(samepage.data, "Same Page"); addRows(typecast.data, "Typecast"); addRows(soundboard.data, "Sound Board")
      addRows(secretphrase.data, "Secret Phrase"); addRows(hearingvoices.data, "Hearing Voices")
      const toRows = entries => entries
        .map(([key, games]) => ({ name: displayNames[key], games: Object.entries(games).map(([game, s]) => ({ game, ...s })).sort((a, b) => b.last.localeCompare(a.last)), total: Object.values(games).reduce((s, g) => s + g.count, 0) }))
        .sort((a, b) => b.total - a.total)
      const isDummy = key => /\b(test|player|first|last|bot)\w*/.test(key)
      const isAliceBob = key => /\b(alice|bob)\b/.test(key)
      const toInstanceRows = insts => insts
        .map(inst => ({ ...inst, players: inst.players.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => b.date.localeCompare(a.date))
      // Mirror the per-person filtering: Alice/Bob players are hidden entirely (as
      // if they weren't there), then an instance is "test" only if every remaining
      // player is a dummy — real instances are anything with at least one real player.
      const instanceRows = Object.values(instances)
        .map(inst => ({ ...inst, players: inst.players.filter(p => !isAliceBob(p.key)) }))
        .filter(inst => inst.players.length > 0)
      setLogs({
        real: toRows(Object.entries(people).filter(([key]) => !isDummy(key) && !isAliceBob(key))),
        test: toRows(Object.entries(people).filter(([key]) => isDummy(key) && !isAliceBob(key))),
        instancesReal: toInstanceRows(instanceRows.filter(inst => inst.players.some(p => !isDummy(p.key)))),
        instancesTest: toInstanceRows(instanceRows.filter(inst => inst.players.every(p => isDummy(p.key)))),
      })
    } finally { setLogsLoading(false) }
  }

  const isJack = profile?.firstName?.trim().toLowerCase() === "jack" && profile?.lastName?.trim().toLowerCase() === "brannen"

  const chipBase = { fontSize: 13, fontWeight: 700, padding: "8px 12px", border: "none", cursor: "pointer", lineHeight: 1 }

  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>

      {/* Settings overlay */}
      {settingsOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, paddingTop: 60 }}>
          <div style={{ background: "#1C1C26", width: "100%", maxWidth: 400, padding: "28px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Your Profile</div>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && saveSettings()} placeholder="Display name (username)" maxLength={40} style={{ ...inputStyle, marginBottom: 16 }} />
            <button onClick={saveSettings} disabled={!firstName.trim() || !lastName.trim()} style={{ background: saved ? WARM_LIGHT : YELLOW, color: saved ? "white" : "#000", fontSize: 18, fontWeight: 900, padding: "16px", width: "100%", display: "block", border: "none", cursor: "pointer" }}>
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Logs overlay */}
      {logsOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setLogsOpen(false) }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", overflowY: "auto", zIndex: 100, padding: "24px 16px 60px" }}>
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>Game Logs</div>
              <button onClick={() => setLogsOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", padding: "4px 8px" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button onClick={() => setLogsView("player")} style={{ background: logsView === "player" ? "rgba(255,255,255,0.15)" : "none", border: "none", color: logsView === "player" ? "white" : "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 800, padding: "8px 14px", cursor: "pointer" }}>By Player</button>
              <button onClick={() => setLogsView("session")} style={{ background: logsView === "session" ? "rgba(255,255,255,0.15)" : "none", border: "none", color: logsView === "session" ? "white" : "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 800, padding: "8px 14px", cursor: "pointer" }}>By Session</button>
            </div>
            {logsLoading && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>Loading…</div>}
            {!logsLoading && logsView === "player" && logs.real.length === 0 && logs.test.length === 0 && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>No sessions found.</div>}
            {!logsLoading && logsView === "session" && logs.instancesReal.length === 0 && logs.instancesTest.length === 0 && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>No sessions found.</div>}
            {!logsLoading && logsView === "player" && logs.real.map((person, i) => (
              <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 0" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>{person.name}</div>
                {person.games.map(g => {
                  const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                  const dateStr = sameDay ? shortDate(g.first) : `${shortDate(g.first)} – ${shortDate(g.last)}`
                  const gc = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                  return (
                    <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ background: gc?.bg ?? "rgba(255,255,255,0.15)", color: gc?.color ?? "white", fontSize: 12, fontWeight: 800, padding: "3px 8px" }}>{g.game}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{g.count}×</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{dateStr}</span>
                    </div>
                  )
                })}
              </div>
            ))}
            {!logsLoading && logsView === "player" && logs.test.length > 0 && (
              <>
                <div style={{ margin: "24px 0 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)" }}>Test Agents</span>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                </div>
                {logs.test.map((person, i) => (
                  <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 0", opacity: 0.5 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>{person.name}</div>
                    {person.games.map(g => {
                      const sameDay = g.first.slice(0, 10) === g.last.slice(0, 10)
                      const dateStr = sameDay ? shortDate(g.first) : `${shortDate(g.first)} – ${shortDate(g.last)}`
                      const gc = GAMES.find(x => x.name === g.game || x.name.includes(g.game) || g.game.includes(x.name.replace("The ", "")))
                      return (
                        <div key={g.game} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ background: gc?.bg ?? "rgba(255,255,255,0.15)", color: gc?.color ?? "white", fontSize: 12, fontWeight: 800, padding: "3px 8px" }}>{g.game}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{g.count}×</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{dateStr}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
            {!logsLoading && logsView === "session" && logs.instancesReal.map((inst, i) => {
              const gc = GAMES.find(x => x.name === inst.game || x.name.includes(inst.game) || inst.game.includes(x.name.replace("The ", "")))
              return (
                <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ background: gc?.bg ?? "rgba(255,255,255,0.15)", color: gc?.color ?? "white", fontSize: 12, fontWeight: 800, padding: "3px 8px" }}>{inst.game}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{shortDate(inst.date)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>{inst.code}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                    {inst.players.map(p => p.name).join(", ")}
                  </div>
                </div>
              )
            })}
            {!logsLoading && logsView === "session" && logs.instancesTest.length > 0 && (
              <>
                <div style={{ margin: "24px 0 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)" }}>Test Agents</span>
                  <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)" }} />
                </div>
                {logs.instancesTest.map((inst, i) => {
                  const gc = GAMES.find(x => x.name === inst.game || x.name.includes(inst.game) || inst.game.includes(x.name.replace("The ", "")))
                  return (
                    <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "16px 0", opacity: 0.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ background: gc?.bg ?? "rgba(255,255,255,0.15)", color: gc?.color ?? "white", fontSize: 12, fontWeight: 800, padding: "3px 8px" }}>{inst.game}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{shortDate(inst.date)}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>{inst.code}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                        {inst.players.map(p => p.name).join(", ")}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}

      <h1 style={{ width: "100%", maxWidth: 480, fontSize: "clamp(48px, 14vw, 88px)", fontWeight: 900, color: "white", letterSpacing: "-2px", lineHeight: 0.9, textAlign: "left", marginBottom: 40 }}>
        Jack's<br />Games
      </h1>

      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Filter and Settings buttons ── */}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 8 }}>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: filtersActive ? YELLOW : WARM_LIGHT,
              color: filtersActive ? "#000" : "rgba(255,255,255,0.6)",
              border: "none", cursor: "pointer",
              padding: "13px 20px", fontSize: 14, fontWeight: 800,
            }}
          >
            <FilterIcon color={filtersActive ? "#000" : "rgba(255,255,255,0.5)"} />
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
          <button
            onClick={openSettings}
            aria-label="Profile"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: WARM_LIGHT, border: "none", color: "rgba(255,255,255,0.6)",
              cursor: "pointer", padding: "13px 20px", fontSize: 14, fontWeight: 800,
            }}
          >
            <ProfileIcon color="rgba(255,255,255,0.5)" />
            Profile
          </button>
        </div>

        {/* ── Filter panel ── */}
        {filtersOpen && (
          <div style={{ background: PANEL_BG, padding: "20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)" }}>Filters</div>
              <button onClick={() => setFiltersOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>✕</button>
            </div>

            {/* Players */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 10 }}>Players</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setPlayerCount(c => c === null ? null : (c === 2 ? null : c - 1))}
                  disabled={playerCount === null}
                  style={{ ...chipBase, background: playerCount !== null ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)", color: playerCount !== null ? "white" : "rgba(255,255,255,0.2)", width: 36, textAlign: "center" }}
                >−</button>
                <span style={{ fontSize: 22, fontWeight: 900, color: playerCount !== null ? YELLOW : "rgba(255,255,255,0.4)", minWidth: 36, textAlign: "center" }}>
                  {playerCount ?? "Any"}
                </span>
                <button
                  onClick={() => setPlayerCount(c => c === null ? 2 : (c >= 10 ? null : c + 1))}
                  style={{ ...chipBase, background: "rgba(255,255,255,0.12)", color: "white", width: 36, textAlign: "center" }}
                >+</button>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 20 }} />

            {/* Game type */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 10 }}>Game type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {TYPES.map(t => (
                  <button key={t} onClick={() => toggleType(t)}
                    style={{ ...chipBase, background: typeFilter.has(t) ? YELLOW : "rgba(255,255,255,0.1)", color: typeFilter.has(t) ? "#000" : "rgba(255,255,255,0.55)" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear filters */}
            {filtersActive && (
              <button onClick={clearFilters} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0, display: "block", margin: "0 auto" }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* ── Game cards ── */}
        {filteredGames.length === 0 && filteredExternal.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.35)", fontSize: 15, fontWeight: 600 }}>
            No games match these filters.
          </div>
        ) : (
          <>
            {GROUPS.map((group, i) => {
              const groupGames = filteredGames.filter(g => g.group === group.name)
              if (groupGames.length === 0) return null
              return (
                <div key={group.name} style={{ display: "contents" }}>
                  <div style={{ marginTop: i === 0 ? 8 : 28, marginBottom: 2 }}>
                    <div style={{ fontSize: 44, fontWeight: 900, color: "white", lineHeight: 1.05 }}>{group.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{group.description}</div>
                  </div>
                  {groupGames.map(game => (
                    <GameCard key={game.name} game={game} onInfo={setInstructionsGame} />
                  ))}
                </div>
              )
            })}

            {filteredExternal.length > 0 && (
              <>
                <div style={{ marginTop: 28, marginBottom: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.6)" }}>Games elsewhere</div>
                </div>
                {filteredExternal.map(game => (
                  <GameCard key={game.name} game={{ ...game, external: true }} onInfo={null} />
                ))}
              </>
            )}
          </>
        )}

        {isJack && (
          <button onClick={openLogs} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer", paddingTop: 14, textAlign: "center" }}>
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
              <button onClick={() => setInstructionsGame(null)} style={{ background: "rgba(0,0,0,0.2)", color: instructionsGame.color, fontSize: 18, fontWeight: 800, padding: "6px 12px", border: "none", cursor: "pointer" }}>✕</button>
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
