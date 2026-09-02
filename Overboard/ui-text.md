# Overboard — UI Text

Everyone writes a question. Nobody answers their own. The room collaboratively decides who gets
stuck with what, then you go around the room answering out loud while everyone reacts.

**No scoring, no winner.** The only tally is reactions, and those are for laughs, not points.

- **Min 4 players, no max.** Every player is both a question-writer and a question-answerer.
- Tables: `ob_games`, `ob_players`, `ob_reactions` · Dev port **3424**

---

## Core rules

- Every player writes exactly **one** question, so there are always exactly as many questions as players.
- **You can never be assigned your own question.** The board rejects that drop.
- **Question authors are never revealed** — not during assignment, not at game over. Deniability is the point.
- The depth rating is chosen by the author and is visible to everyone, but only as **color**, never as a number.

---

## Lobby

- Game name: **Overboard**, single "Join" button, flat player list, no teams
- Min players notice: needs 4
- Start confirm modal: "Start the game?" / "Everyone writes one question. Are all players in?"

---

## Phase 1 — Writing

Header: **"Write your question"**

Three fields, in order, all required before the button enables:

1. **Your question**
   - Label: "Your question"
   - Placeholder: "What's something you've changed your mind about?"
   - Multi-line. This is the full text, shown big during answering.

2. **The hint**
   - Label: "Hint"
   - Subtext: **"A word or two about the topic. This is all anyone sees when the questions get handed out — don't give the answer away."**
   - Placeholder: "changing your mind"
   - Short, single line. This becomes your draggable chip.

3. **How deep does it go?**
   - Slider, 5 notches, no numbers shown — the label under the slider changes as you drag:
     1. **Splash pad**
     2. **Shallow end**
     3. **Diving team**
     4. **Fishing trip**
     5. **Ocean floor**
   - The slider track/handle takes on that tier's color as you move, so you feel the depth as well as read it.
   - Defaults to **Shallow end** (notch 2) — a default of "not yet chosen" adds a validation state for no benefit, and starting at the shallow end nudges people to think before going deep.

Button: **"Lock it in"**

After submitting: "Locked in" / "Waiting for everyone…" + `WaitingList` (with typing indicators + poke).

---

## Phase 2 — Assignment (shared board)

This is the Typecast guess-phase board: **one shared board, everyone drags at once**, changes appear
live on every screen.

Header: **"Who gets which question?"**
Subtext: **"Drag a hint onto each player. Nobody can get their own."**

- **Chips** (top): every player's hint, in random order, **anonymous** — no author names, ever.
  Colored by depth (see Colors below). Chips leave the tray as they're placed.
- **Slots** (below): one per player, labeled with the player's name, in join order.
- Dropping a chip on an occupied slot **swaps** — same as Typecast, and it's the escape hatch when
  the last chip left is someone's own. Swaps animate for everyone, not just the person dragging.

**Rejected drop:** dropping a chip on its own author's slot is refused, with a brief toast:
**"That's their own question."** The chip springs back to where it came from.

**Ready-up**
- Button: **"Ready"** → once tapped: **"Ready ✓"** (tap again to un-ready)
- `WaitingList` shows who's ready. Count line: "X / Y ready"
- **Ready is disabled until every slot is filled.** Disabled-state subtext: "Fill every slot first."
- **Any change to the board un-readies everyone who had readied**, per spec. Rather than silently
  flipping people, whoever gets un-readied sees a banner: **"The board changed — take another look."**
  It clears when they re-ready.
- When the last player readies, the game advances to answering.

---

## Phase 3 — Answering

Everyone answers out loud, in person, one at a time. The screen is a **reference sheet + reaction pad**,
not a turn tracker — nothing here advances on its own.

- A long, scrollable vertical list. **Big type.**
- Sorted **shallow → deep**, randomized within each tier, fixed once the phase starts.
- Grouped under depth headers (**Splash pad**, **Shallow end**, …) so the climb from small talk to
  ocean floor feels deliberate and gives the scroll natural landmarks.

Each card:
- **Player name** (large, the person who has to answer it)
- **The full question** (large)
- A row of six big emoji buttons beneath it:

  👍 ❤️ 💀 😵‍💫 🤦‍♂️ 🤮

**Reactions**
- Press any emoji as many times as you want, no limits, no cooldown.
- Each press floats a copy of that emoji up from the button and fades it out.
- **Everyone sees everyone's presses live**, on every screen.
- A small running count sits on each button once it's above zero.

At the very bottom of the list: **"End Game"** button.

---

## Ending the game

Double-confirm, matching the footer's Back-to-Lobby pattern exactly:

1. Title **"End the game?"** / "This ends it for everyone and shows the final reactions."
   → Cancel · **Continue**
2. Title **"Are you sure?"** / "Has everyone answered? This can't be undone."
   → Cancel · **Yes, end game** (red)

---

## Game over

Header: **"Overboard"** (via shared `EndGame`, no scores, no winner, no leaderboard)

One card per player, in the same shallow → deep order they were answered in:
- **Player name**
- Their question (smaller, secondary)
- **The reaction tallies they earned**, big and celebratory: `❤️ x100`
  - Only emojis with a count above zero are shown, ordered highest first.
  - The card's biggest tally is the loudest thing on it — that's the payoff.
- Authors are **not** revealed.

Buttons: **Play Again** / **Play Another Game**

---

## Colors

Ocean blues. Depth is the whole visual language: shallow reads as pale-blue-on-white, deep as
white-on-navy, crossing over at tier 3.

- Main: `hsl(205, 80%, 45%)` · Dark: `hsl(214, 85%, 22%)` · Light: `hsl(205, 90%, 88%)`
- Wells + footer buttons: `hsl(214, 40%, 16%)`

**Depth ramp** (chips, slider, section headers):

| Tier | Label | Background | Text |
|---|---|---|---|
| 1 | Splash pad | `hsl(205, 100%, 97%)` | `hsl(205, 75%, 42%)` |
| 2 | Shallow end | `hsl(205, 90%, 88%)` | `hsl(205, 80%, 30%)` |
| 3 | Diving team | `hsl(207, 75%, 62%)` | `#fff` |
| 4 | Fishing trip | `hsl(210, 80%, 42%)` | `#fff` |
| 5 | Ocean floor | `hsl(214, 85%, 22%)` | `#fff` |

Legend on the assignment screen shows all five swatches with labels, so the color ramp is readable
without having to guess.

---

## Realtime & egress

Reaction buttons are the single riskiest thing in this game — unlimited mashing, fanned out to every
client. `REALTIME.md` already logs `toggleLike` (Copycats, Drawful, GameOfWhat) as an egress incident
for exactly this shape. The two jobs are split deliberately:

| | Mechanism |
|---|---|
| **Floating animation** | Realtime `broadcast` only — never touches Postgres. Presses are coalesced client-side (~250ms) into one message carrying a count. A dropped one is harmless. |
| **Running tally** | Debounced atomic increment RPC (`ob_add_reactions`), flushed every ~3s and on unmount/phase change. Thirty mashes become one write. |

**No reaction ever calls `loadState()`.** Tallies patch in from the `ob_reactions` payload.

The assignment board follows Typecast's proven shape: every drag writes through a **queued** RPC
(`ob_set_board`) so rapid drags can't land out of order, and the `postgres_changes` handler applies
`payload.new` directly instead of refetching. Board writes never `nudge()`.

---

## Data model

**`ob_games`** — `code`, `phase` (lobby|write|assign|answer|finished), `slot_order uuid[]` (board slot
order), `board jsonb` (array of author ids or null, parallel to `slot_order`), `answer_order jsonb`
(fixed at answer-phase start: `[{answerer_id, author_id}]` sorted shallow→deep), `replay_code`,
`replay_of`, `created_at`, `updated_at`

**`ob_players`** — `id`, `game_code`, `name`, `first_name`, `last_name`, `question text`, `hint text`,
`depth int` (1–5), `submitted bool`, `ready bool`, `created_at`

**`ob_reactions`** — `game_code`, `target_player_id` (the answerer, not the author), `emoji`, `count`,
unique on `(game_code, target_player_id, emoji)`, incremented atomically
