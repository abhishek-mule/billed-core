"use client"
import { useEffect, useState } from "react"

export default function Debug4() {
  const [logs, setLogs] = useState<string[]>(["Starting..."])

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setLogs(prev => [...prev, "Fetching /api/recovery/queue..."])
        const res = await fetch("/api/recovery/queue", { credentials: "include" })
        setLogs(prev => [...prev, "Response status: " + res.status + " " + res.statusText])
        
        if (!res.ok) {
          const text = await res.text()
          setLogs(prev => [...prev, "✗ Not OK: " + text.slice(0, 500)])
          return
        }
        
        const data = await res.json()
        setLogs(prev => [...prev, "✓ Parsed JSON"])
        setLogs(prev => [...prev, "Summary keys: " + Object.keys(data.summary || {}).join(", ")])
        setLogs(prev => [...prev, "Items count: " + (data.items?.length || 0)])
        setLogs(prev => [...prev, "RecentEvents count: " + (data.recentEvents?.length || 0)])
      } catch (e: any) {
        setLogs(prev => [...prev, "✗ Error: " + e.message])
      }
    }
    fetchQueue()
  }, [])

  return (
    <div style={{ padding: 40, background: '#fff', color: '#333', fontSize: 14, fontFamily: 'monospace', lineHeight: 1.6, maxWidth: 900 }}>
      {logs.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  )
}
