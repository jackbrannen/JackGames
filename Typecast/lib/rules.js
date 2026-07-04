// Shared "How to Play" — used by both the lobby modal and the in-game menu.
// Format matches the Menu `rules` prop: an array of [title, body] pairs.
export const RULES = [
  ["Goal", "Each round one player is the Matcher. As a group, everyone else tries to reconstruct exactly how the Matcher paired words to people."],
  ["Matching", "The Matcher gets one random word for each other player and drags each word onto the person it fits best."],
  ["Guessing", "Everyone else then works together on one shared board, dragging the same words onto whoever they think the Matcher chose."],
  ["Scoring", "You score a point for every word placed on the same person the Matcher picked. It's cooperative — rack up matches across all rounds and see how well you read each other."],
]
