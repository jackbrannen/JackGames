import { useMemo } from "react"

/*
  useBlockingDuplicates — detect when current player's values clash with other players'
  ──────────────────────────────────────────────────────────────────────────────────────
  Used when two players cannot submit the same answer (Fishbowl, ReverseCharades).
  Returns a boolean array: true for each entry in myValues that matches something
  already submitted by another player.

  Args:
    myValues      string[]  — current player's text field values (one per field)
    takenValues   string[]  — all other players' already-submitted values (flat list)

  Returns: boolean[]  — same length as myValues; true = blocked (duplicate of a taken value)

  Usage (Fishbowl clue entry):
    const takenClues = otherPlayersClues.map(c => c.text)
    const blocked = useBlockingDuplicates(clueFields, takenClues)

    // blocked[i] === true → show red highlight on field i, disable submit
    const anyBlocked = blocked.some(Boolean)

    <input style={{ borderBottom: blocked[0] ? "2px solid red" : "none" }} ... />
    {blocked[0] && <div style={{ fontSize: 12, color: "#F04F52" }}>Already taken by another player</div>}
    <FooterButton disabled={anyBlocked} ...>Submit</FooterButton>
*/

export function useBlockingDuplicates(myValues, takenValues) {
  return useMemo(() => {
    const taken = new Set(
      (takenValues ?? []).map(v => (v || "").trim().toLowerCase()).filter(Boolean)
    )
    return (myValues ?? []).map(v => {
      const norm = (v || "").trim().toLowerCase()
      return norm.length > 0 && taken.has(norm)
    })
  }, [JSON.stringify(myValues), JSON.stringify(takenValues)])
}
