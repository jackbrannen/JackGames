# Copycats — UI Text

Edit this file and return it before coding begins.

---

## Color Scheme

**Primary background:** `#5C2D8C` (deep violet)
**Cool-dark (headers/top bars):** `#3D1A70`
**Mid-dark (wells/cards/panels):** `#4A228C`
**Warm-light (inputs/secondary buttons):** `#7A3AAA`
**Accent:** `#FBDF54` (universal yellow)

---

## Home / Join Page

**Game title:** Copycats
**Subtitle (small, uppercase, muted):** Answer as another player.

**[Create button]:** Create Game
**[Create button — loading]:** Creating…
**[Room code input placeholder]:** Room code
**[Join button]:** Join

---

## Lobby

**[Header game name label — small uppercase]:** Copycats
**[Room code]:** displayed prominently below
**[Invite button]:** Invite

**[Join section label — small uppercase]:** Join Game
**[First name placeholder]:** First name
**[Last name placeholder]:** Last name
**[Display name placeholder]:** Display Name
**[Join button]:** Join
**[Join button — loading]:** Joining…
**[Username taken error]:** That username is taken.

**[Players section label — small uppercase]:** Players
**[Player list — empty state]:** No players yet
**[Player self-label — small, inline, muted]:** you
**[Min players warning]:** Minimum 3 players needed

**[Start CTA label — small uppercase, above button]:** All players in?
**[Start button]:** Start Game

**[Not found state]:** Room not found.
**[Loading state]:** Loading…

---

## Phase 1: Question Writing

**[Top bar — small uppercase]:** Write Your Questions

**[Instruction heading]:** You're asking [Name].
**[Instruction body]:** Write a personal question for them — something with a specific answer. Everyone else will try to fake their response.

**[Question input placeholder]:** Your question for [Name]…
**[Character hint — muted]:** One question only

**[Submit button]:** Submit Question
**[Submit button — loading]:** Submitting…
**[Validation — empty]:** Write a question before submitting.

---

## Phase 1b: Waiting for Questions

**[Section label — small uppercase]:** Waiting for everyone…
**[Instruction — muted]:** Everyone is writing their questions.
**[Player status — submitted]:** Ready
**[Player status — still writing]:** Writing…
**[Status dots]:** teal = submitted, gray = not yet

---

## Round: Answering Phase

**[Top bar — small uppercase]:** Round [N] of [N]

**— Target player's screen —**

**[Heading]:** [QuestionerName] wants to know…
**[Question display — large]:** "[Question text]"
**[Instruction — muted]:** You must answer truthfully. Everyone else will try to fool the group by writing something that sounds like you.
**[Answer input placeholder]:** Your answer…
**[Submit button]:** Submit Answer
**[Submit button — loading]:** Submitting…
**[Validation — empty]:** Write an answer before submitting.

**— All other players' screens —**

**[Heading]:** [QuestionerName] asked [TargetName]…
**[Question display — large]:** "[Question text]"
**[Instruction — muted]:** Write something that sounds like [TargetName] wrote it.
**[Answer input placeholder]:** Fake [TargetName]'s answer…
**[Submit button]:** Submit Answer
**[Submit button — loading]:** Submitting…
**[Validation — empty]:** Write an answer before submitting.

---

## Round: Waiting for Answers

**[Section label — small uppercase]:** Waiting for everyone…
**[Player status — submitted]:** Ready
**[Player status — still writing]:** Writing…
**[Status dots]:** teal = submitted, gray = not yet

**[Target player label — small, muted]:** [TargetName] answered first — everyone else is catching up.

---

## Round: Voting Phase

**[Top bar — small uppercase]:** Round [N] of [N]

**[Heading]:** Which answer is [TargetName]'s?
**[Question display — small, muted]:** "[Question text]"

**[Answers list]:** shuffled list of all answers (no names shown)
**[Vote button — unselected]:** [Answer text]
**[Vote button — selected]:** [Answer text] ✓

**[Submit button]:** That's the Real One
**[Submit button — loading]:** Submitting…
**[Validation — no selection]:** Pick an answer first.

**[Target player — heading]:** Stay quiet!
**[Target player — instruction — muted]:** Everyone is deciding which answer is really yours.

---

## Round: Waiting for Votes

**[Section label — small uppercase]:** Waiting for votes…
**[Player status — voted]:** Voted
**[Player status — deciding]:** Deciding…
**[Status dots]:** teal = voted, gray = not yet

---

## Round: Results

**[Top bar — small uppercase]:** Round [N] of [N] · Results

**[Question display — muted]:** [QuestionerName] asked [TargetName]: "[Question text]"

**[Real answer label — small uppercase]:** [TargetName]'s real answer
**[Real answer — highlighted]:** [Answer text]

**[All answers section label — small uppercase]:** Everyone's answers

**[Answer row — with name revealed]:** [Answer text] · [PlayerName]
**[Answer row — correct voters label — muted]:** Fooled [N]
**[Correct ID indicator]:** ✓ spotted
**[Fooled indicator]:** got fooled

**[Score section label — small uppercase]:** Points this round
**[Score row — correct ID]:** [Name] · +2 · spotted the real answer
**[Score row — fooled others]:** [Name] · +[N] · fooled [N] people
**[Score row — no points]:** [Name] · +0

**[Running scores label — small uppercase]:** Running Totals

**[Continue button]:** Next Round
**[Continue button — last round]:** See Final Scores
**[Non-host waiting label — muted]:** Waiting for [Name]…

---

## Final Scoreboard

**[Heading]:** Game Over

**[Scores section label — small uppercase]:** Final Scores
**[Score row]:** [Name] · [N] pts
**[Winner label — small uppercase, muted]:** Winner

**[New game button]:** Play Again

---

## Error / Loading States

**[Room not found]:** Room not found.
**[Game in progress]:** That game has already started.
**[Generic loading]:** Loading…
**[Generic error — muted]:** Something went wrong. Try refreshing.
