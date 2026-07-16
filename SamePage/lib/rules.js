// Shared "How to Play" content — used by both the lobby modal and the in-game
// hamburger menu so they never drift apart. Format matches the Menu `rules` prop:
// an array of [title, body] pairs.
export const RULES = [
  ["Goal", "Each round, the group needs a certain number of matching answers (set in Settings) across the three prompts to survive."],
  ["Answering", "Everyone gets the same 3 prompts, each with a letter. Privately write an answer for each — or shrug 🤷 to pass if you're stuck. If the answering timer runs out before you submit, any blank prompts are shrugged for you automatically."],
  ["Matching", "When answers are revealed, use +/− on each prompt to count how many people gave the same answer (there's no \"1\"—a match needs at least 2 people). Add up the three prompts for your total this round."],
  ["Banking", "Extra matches beyond what's needed get \"banked,\" lowering how many you need in future rounds. Fall short and the shortfall comes out of the bank instead — run out and it's game over. Survive every round to win."],
]
