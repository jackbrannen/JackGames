"use client"
/*
  useBonusMatch — detect when your answer matches another player's (for bonus points)
  ─────────────────────────────────────────────────────────────────────────────────────
  Comparison is case-insensitive, trimmed. Returns names of all matching players.
  Reactive — recomputes every time answers or players update, so late-arriving
  matches are caught automatically without any at-submit DB query.

  Args:
    myAnswer     string   — current player's submitted answer text
    myPlayerId   string   — current player's id (excluded from match)
    answers      { player_id, text, skipped? }[]  — all submitted answers for this round
    players      { id, name }[]

  Returns:
    matchNames   string[]   — names of all other players whose answer matches yours
                              empty array = no match

  Usage (GameOfWhat answering phase, after player has submitted):
    const matchNames = useBonusMatch(myAnswerRecord?.text, myPlayerId, answers, players)

    {matchNames.length > 0 && (
      <div>Same answer as {formatMatchNames(matchNames)} · +1</div>
    )}

  Helpers exported:
    formatMatchNames(names)  — "Alice", "Alice & Bob", "Alice, Bob & Carol"
*/

import { useMemo } from "react"

export function useBonusMatch(myAnswer, myPlayerId, answers, players) {
  return useMemo(() => {
    if (!myAnswer?.trim() || !myPlayerId) return []
    const myText = myAnswer.trim().toLowerCase()
    return answers
      .filter(a => !a.skipped && a.player_id !== myPlayerId && a.text?.trim().toLowerCase() === myText)
      .map(a => players.find(p => p.id === a.player_id)?.name)
      .filter(Boolean)
  }, [myAnswer, myPlayerId, JSON.stringify(answers.map(a => ({ id: a.player_id, t: a.text })))])
}

export function formatMatchNames(names) {
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
}
