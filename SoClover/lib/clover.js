// Core So Clover game logic

// Card edge indices: 0=top, 1=right, 2=bottom, 3=left (in card's own frame at 0° rotation)
// Slots on board: top, right, bottom, left
// Leaf zones: topLeft, topRight, bottomRight, bottomLeft

// Which edges of each slot face which leaf zones at rotation 0°:
//   TOP slot:    left-edge(3) → topLeft,    right-edge(1) → topRight
//   RIGHT slot:  top-edge(0)  → topRight,   bottom-edge(2) → bottomRight
//   BOTTOM slot: right-edge(1)→ bottomRight, left-edge(3)  → bottomLeft
//   LEFT slot:   top-edge(0)  → topLeft,    bottom-edge(2) → bottomLeft

export const SLOT_LEAF_EDGES = {
  top:    { topLeft: 3, topRight: 1 },
  right:  { topRight: 0, bottomRight: 2 },
  bottom: { bottomRight: 1, bottomLeft: 3 },
  left:   { topLeft: 0, bottomLeft: 2 },
}

export const LEAF_SLOTS = {
  topLeft:     ['top', 'left'],
  topRight:    ['top', 'right'],
  bottomRight: ['right', 'bottom'],
  bottomLeft:  ['bottom', 'left'],
}

export const SLOT_NAMES = ['top', 'right', 'bottom', 'left']
export const LEAF_NAMES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']

// Get the word at a given edge of a card after rotation
// rotation: number of 90° CW steps (0–3)
// edgeInSlot: which edge of the slot's space (0=top,1=right,2=bottom,3=left)
export function getWordAtEdge(cardWords, edgeInSlot, rotationSteps) {
  const originalEdge = (edgeInSlot - rotationSteps + 4) % 4
  return cardWords[originalEdge]
}

// Given a slot's placement {cardIndex, rotation} and a leaf zone name,
// return the word from this card that faces that leaf zone.
// Returns null if this slot doesn't border that leaf zone.
export function getLeafWordFromSlot(slotName, placement, cardWords, leafName) {
  const edgeMap = SLOT_LEAF_EDGES[slotName]
  if (!(leafName in edgeMap)) return null
  const edgeInSlot = edgeMap[leafName]
  return getWordAtEdge(cardWords, edgeInSlot, placement.rotation)
}

// Get both words that appear in a leaf zone given a full slots object
export function getLeafWords(slots, cards, leafName) {
  const [slotA, slotB] = LEAF_SLOTS[leafName]
  const wordA = slots[slotA] ? getLeafWordFromSlot(slotA, slots[slotA], cards[slots[slotA].cardIndex], leafName) : null
  const wordB = slots[slotB] ? getLeafWordFromSlot(slotB, slots[slotB], cards[slots[slotB].cardIndex], leafName) : null
  return [wordA, wordB]
}

// Check if a guess placement matches the correct placement for a slot
export function isSlotCorrect(guessSlot, correctSlot) {
  if (!guessSlot || !correctSlot) return false
  return guessSlot.cardIndex === correctSlot.cardIndex &&
         guessSlot.rotation === correctSlot.rotation
}

// Score a full guess attempt. Returns array of correct slot names.
export function scoreGuess(guessSlots, correctSlots) {
  return SLOT_NAMES.filter(s => isSlotCorrect(guessSlots[s], correctSlots[s]))
}

// All 8 words on a board (from the 4 placed cards, used for clue validation)
export function getBoardWords(slots, cards) {
  const words = new Set()
  for (const slot of SLOT_NAMES) {
    if (slots[slot]) {
      cards[slots[slot].cardIndex].forEach(w => words.add(w.toLowerCase()))
    }
  }
  return words
}

// Rotate a slot's rotation value by 1 step CW
export function rotateCW(rotation) {
  return (rotation + 1) % 4
}
