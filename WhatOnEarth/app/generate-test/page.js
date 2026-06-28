"use client"

import { useState } from "react"

export default function GenerateTest() {
  const [status, setStatus] = useState("Ready")
  const [count, setCount] = useState(null)

  async function generate() {
    setStatus("Generating...")
    try {
      const res = await fetch("/api/generate-words", { method: "POST" })
      const data = await res.json()
      if (data.error) {
        setStatus(`Error: ${data.error}`)
      } else {
        setStatus("Success!")
        setCount(data.count)
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Word Generator Test</h1>
      <button onClick={generate} style={{ padding: "12px 24px", fontSize: 16 }}>
        Generate 50 Words
      </button>
      <p>Status: {status}</p>
      {count && <p>Generated {count} words</p>}
    </div>
  )
}
