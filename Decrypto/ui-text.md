# Decrypto—UI Text

## Colors (light theme; HSB-derived, refine in styles.js)
- **bg / card:** #B7DAEE (pale blue) — page + games-list card background
- **ink (primary text):** #15314A (deep navy)
- **dark** (footer bar, menu, status eyebrow; white text): #15314A
- **mid** (panels/cards on the page): #9CC8E6
- **wl** (secondary buttons): #6FA8CE
- **accent** (primary action buttons; dark text on it): #FFC857 (warm gold)
- **Boys team:** #2F6DB4 (saturated blue)
- **Girls team:** #CC5B86 (rose)
- Games-list card text color: #15314A (dark, since bg is light)


All user-facing copy. Tone/casing synced to Codenames, What On Earth, and the
shared components. Section headers: sentence case, no letter-spacing. Eyebrows:
UPPERCASE + letter-spacing (status bar only).

## Games list (games.jackbrannen.com card)
- **Name:** Decrypto
- **Players:** 4+ players
- **Description:** Clue your team to a secret code—without the other team cracking it.
- **Instructions (How to Play body):**
  Two teams, each with four secret keywords numbered 1–4 that only your team can see.

  Each round, one teammate is the Encryptor. They get a secret 3-digit code (three different digits from 1–4) and give one clue for each digit, hinting at the keyword in that position.

  Both teams then guess the code. Your team has to decode it correctly—guess wrong and you take a Miscommunication. The other team tries to intercept it using every clue you've given so far—if they crack it, they take an Interception.

  (Round 1 can't be intercepted as there's no clue history yet.

  Win by landing 2 Interceptions. Lose if you rack up 2 Miscommunications. If no one's decided after 8 rounds, the most Interceptions wins.

  The whole game is the tug-of-war between being clear enough for your team and cryptic enough for theirs.

## Lobby
- Code label (reused pattern): the room code, split-colored like Drawful.
- Team columns: **Boys** / **Girls** (header). Join buttons: **Join Boys**, **Join Girls**.
- Switch teams: tapping the other team's Join moves you.
- Ready dots beside each name (reuse Codenames).
- Min players hint: **Each team needs 2+ players to start.**
- Start button (any player, once both teams have 2+): **Start Game**
- Remove player: ✕ per row (shared lobby behavior), confirm **Remove [name]?**

## Status bar (eyebrow, UPPERCASE + letter-spacing)
- During play: **ROUND {n} · {BOYS/GIRLS} CLUEING**
- Reveal: **ROUND {n} · RESULTS**

## Role banners (during a round)
- Encryptor (yellow): **You're the Encryptor**
- Your team, clue phase (white): **{Encryptor} is writing clues…**
- Your team, guess phase—clueing team (yellow): **Decode your team's code**
- Other team, guess phase (white): **Intercept the [Boys'/Girls'] code**
- Round 1, opponents (white, muted): **No intercepting in round 1—just listen.**

## Your keywords (persistent panel)
- Visible to your whole team in EVERY phase; opponents never see it.
- Header: **Your keywords**
- Keyword rows: number 1–4 + word. (On the Encryptor's clue screen, the code digits are highlighted.)

## Clue phase
- Section header: **Your code** (Encryptor only)
- The 3 code digits shown large.
- Clue inputs (3): placeholder **Clue for {n}**
- Submit button: **Submit clues**
- Validation: **Write all 3 clues** (disabled state) · **Clues can't repeat a keyword** (if a clue equals one of your keywords)
- Waiting screen (teammates): **{Encryptor} is writing clues…** + WaitingList.

## Guess phase
- This round's clues shown (3, in order, unlabeled by position).
- Clue board visible (full history—see below).
- Code entry: 3 ordered slots; tap digits **1 2 3 4** to fill. Selected digit slots and the teammate's in-progress picks show the **dotted border** (Codenames tentative style).
- Helper under the slots: **Tap to set your guess—your team sees it live.**
- Submit button—clueing team: **Lock in decode** · intercepting team: **Lock in intercept**
- Disabled until 3 distinct digits chosen: **Pick all 3 digits**
- After submit (waiting): **Waiting for [Boys/Girls]…** / **Waiting for [Boys/Girls]…** + WaitingList showing which teams have locked in.

## Clue board (public history)
- Header: **Clue history**
- Two columns: **Boys** / **Girls**.
- Each round row: the 3 clues; after reveal, the digit each clue mapped to (1–4) shown beside it.

## Reveal
- Header: **The code was {d}-{d}-{d}**
- Clueing team result:
  - decoded right: **[Boys/Girls] decoded it.**
  - decoded wrong: **[Boys/Girls] miscommunicated. +1 Miscommunication**
- Intercepting team result:
  - intercepted: **[Boys/Girls] intercepted! +1 Interception**
  - missed: **[Boys/Girls] didn't crack it.**
- Token tallies per team: **Interceptions {n} · Miscommunications {n}**
- Continue button (any player): **Next round →**

## Finished (EndGame)
- Title: **{Winning Team} wins!**
- Subtitles by reason:
  - **2 interceptions—code cracked.**
  - **2 miscommunications—they fell apart.**
  - **Most interceptions after 8 rounds.**
- Token summary per team.
- Buttons: **Play Again** (reset to lobby) · **Play Another Game** (→ games.jackbrannen.com)

## Menu (hamburger)
- **How to Play** (instructions body above)
- **Reset to lobby** (any player) → returns everyone to the lobby, teams kept
- Score/token adjust (any player), same pattern as What On Earth's score adjust.

## Pokes / notifications
- Reuse the shared poke system verbatim (👉, same copy as other games).

## Errors / edge
- Not enough players: **Each team needs 2+ players.**
- Word pool low (if applicable): handled silently by refill, like Drawful/WOE.
