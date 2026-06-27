// Ask the server to top up the word pool if it's running low. The API route
// decides whether a refill is actually needed, so this is safe to call on every
// game start and after every round.
//
// Pass { wait: true } when you need the pool to be filled *before* continuing
// (e.g. starting a game on an empty pool). Otherwise it's fire-and-forget.
export async function topUpWordPool({ wait = false } = {}) {
  const request = fetch("/api/generate-words", { method: "POST" }).catch(e => {
    console.error("topUpWordPool failed:", e)
  })
  if (wait) await request
}
