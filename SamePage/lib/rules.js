// Shared "How to Play" content — used by both the lobby modal and the in-game
// hamburger menu so they never drift apart. Format matches the Menu `rules` prop:
// an array of [title, body] pairs.
export const RULES = [
  ["Goal", "Each round, the whole group tries to land on the same answer for at least one of the three prompts."],
  ["Answering", "Everyone gets the same 3 prompts, each with a letter. Privately write an answer for each."],
  ["Matching", "When all answers are revealed, check the box on every prompt where you ALL matched, then submit."],
  ["Banking", "You need at least one all-group match each round. Extra matches get \"banked\"—a banked match covers a future round where you get none. Survive every round to win; run out and it's game over."],
]
