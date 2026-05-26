# So Clover — iOS Game Spec

## Overview

A multiplayer party game for 2–6 players, each on their own phone. Players take turns having their clover board solved by the group. Points are awarded for each correctly placed card. The game follows the official So Clover rules with one key adaptation for phones: a single designated guesser controls the guessing UI per round, while all other players watch an animated read-only view.

The game is built into the existing suite — shared room code lobby, Supabase backend, Supabase Realtime for sync, Next.js frontend.

---

## The Clover Board

Each player's board has 4 keyword cards arranged in a cross (top, right, bottom, left). Each card has a word on each of its two exposed edges, creating 4 "leaf zones" — one between each adjacent pair of cards:

```
         [TOP CARD]
          word | word
            \   /
[LEFT]  word   word  [RIGHT]
        word   word
            /   \
          word | word
         [BOTTOM CARD]
```

Each leaf zone sits between two cards and shows one word from each. Players write a single clue word in each leaf zone that connects the two keywords it touches.

---

## Game Flow

### 1. Lobby

- Host creates a room, gets a room code.
- Other players join via room code.
- Host sees a player list and a "Start Game" button (minimum 2 players).
- Player order is randomized at game start and stored in Supabase.

### 2. Clue-Writing Phase (simultaneous, private)

- All players see their own board with 4 randomly drawn keyword cards placed in the 4 slots.
- Each player privately writes one clue word per leaf zone (4 clues total).
- Clues are single words only — validated client-side (no spaces).
- A player's clue cannot be any of the 8 keywords on their own board — validated client-side.
- Each player has a "Submit Clues" button. Once submitted, they see a waiting screen showing who has and hasn't submitted yet.
- The phase ends when all players have submitted.

### 3. Guessing Phase (one board at a time)

Players go in order. For each player's board:

**Setup:**

- The board owner's 4 keyword cards are revealed along with a 5th decoy card drawn randomly from the deck.
- The 4 clue words the board owner wrote are shown in their leaf zones.
- The 5 cards are displayed in a shuffled, unplaced pool.
- The board owner can see everything but cannot interact — they are in spectator mode for this round.
- The next player in turn order becomes the **active guesser** and controls the guessing UI.
- All other players see a read-only animated view of the board.

**Guessing:**

- The active guesser drags cards from the pool into the 4 slots on the board.
- When a card is dropped into a slot, all players see an animated card placement (slide + slight rotation, as if physically placed on a table). The board owner sees this too.
- Cards can be picked back up and moved before the first guess is submitted.
- There's also a simple rotate icon in the middle of each card that can be tapped to rotate the card 90 degrees.
- When the guesser is happy with all 4 placements, they tap **"Submit Guess"**.

**Scoring attempt 1:**

- Correctly placed cards are revealed with a green highlight animation and locked in place.
- Incorrectly placed cards are revealed with a red flash and returned to the pool.
- If all 4 are correct on the first attempt: **+1 bonus point** (so 5 points total for a perfect round).
- If any are wrong, the guesser gets one more attempt with the remaining unplaced cards.

**Scoring attempt 2:**

- Same mechanic — correctly placed cards lock in, wrong ones are returned.
- No bonus point available on attempt 2.

**Round scoring:**

- 1 point per correctly placed card across both attempts.
- Maximum 5 points (4 cards correct + 1 bonus for first-try perfect).
- Scores are shown on a brief round summary screen before moving to the next player's board.

### 4. End of Game

- After every player's board has been solved, a final scoreboard is shown. This is a collaborative game, so it's one cumulative score for everyone.
- A "Play Again" button starts a new game with the same players (new room code not required).

---

## Turn Order Logic

- Player order is set once at game start (randomized).
- During the guessing phase, boards are solved in that order (player 1's board first, then player 2's, etc.).
- The "active guesser" for each board is always the next player in order after the board owner.
- Example with 4 players [A, B, C, D]: A's board is guessed by B, B's board by C, C's board by D, D's board by A.

---

## Word / Card Logic

- The word list contains 880 words across 220 cards of 4 words each (see `so_clover_words.json`).
- At the start of each clue-writing phase, each player is dealt 4 cards randomly (without replacement within a game session if possible, falling back to full deck reshuffling if needed).
- The decoy card for each guessing round is drawn fresh from the remaining deck.
- Cards are stored in Supabase, drawn server-side to prevent cheating.

---

## Animations

All animations play on every player's screen (synced via Supabase Realtime state updates, not real-time drag sync).

- **Card placement**: card slides from the pool into the slot with a slight arc and lands with a subtle rotation (±3–8°), mimicking a physical card being placed on a table.
- **Correct placement reveal**: card glows green, then settles with a small bounce.
- **Incorrect placement reveal**: card flashes red, then animates back to the pool.
- **Perfect round bonus**: brief confetti or sparkle burst over the board.
- **End of game**: score pulses or bounces on the scoreboard.

Animations are triggered by state changes in Supabase (e.g. `card_placed`, `guess_submitted`, `result_revealed`), not by real-time drag position. Each client plays the animation locally when it receives the state update.

---

## Data Model (Supabase)

### `rooms`

|field|type|notes|
|---|---|---|
|id|uuid|primary key|
|code|text|4–6 char room code|
|status|text|`lobby`, `clue_writing`, `guessing`, `finished`|
|player_order|uuid[]|randomized at game start|
|current_board_index|int|which player's board is being guessed|
|created_at|timestamp||

### `players`

|field|type|notes|
|---|---|---|
|id|uuid||
|room_id|uuid||
|username|text||
|score|int|running total|
|clues_submitted|bool|for clue-writing phase tracking|

### `boards`

|field|type|notes|
|---|---|---|
|id|uuid||
|room_id|uuid||
|player_id|uuid|board owner|
|cards|jsonb|array of 4 card objects (words + slot position)|
|clues|jsonb|array of 4 clue strings (one per leaf zone)|
|decoy_card|jsonb|the 5th card shown during guessing|
|attempt|int|1 or 2|
|status|text|`pending`, `guessing`, `complete`|

### `guess_events`

|field|type|notes|
|---|---|---|
|id|uuid||
|board_id|uuid||
|guesser_id|uuid||
|placements|jsonb|card → slot mapping|
|attempt|int||
|correct_count|int||
|created_at|timestamp||

---

## Screens

1. **Home** — Enter username, create or join a room
2. **Lobby** — Player list, room code display, Start button (host only)
3. **Clue Writing** — Personal board with keyword cards and 4 input fields for clues
4. **Waiting** — Shows who has/hasn't submitted clues yet
5. **Guessing (active)** — Board with clues, card pool, drag-and-drop slots, Submit Guess button
6. **Guessing (spectator/owner)** — Same board, read-only, animated
7. **Round Summary** — Points earned this round, running totals
8. **Final Scoreboard** — End of game rankings, Play Again button