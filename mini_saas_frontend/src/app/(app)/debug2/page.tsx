"use client"
import { useState } from "react"

export default function DebugClientPage() {
  const [count, setCount] = useState(0)
  return (
    <div style={{ padding: 40, background: '#f0f0f0', color: '#333', fontSize: 20 }}>
      <p>Client Debug Page Working</p>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)} style={{ padding: '8px 16px', marginTop: 8, fontSize: 16 }}>
        Click me
      </button>
    </div>
  )
}
