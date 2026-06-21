"use client"
import { useEffect, useState } from "react"

export default function Debug3() {
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    const steps: string[] = []

    Promise.resolve().then(async () => {
      try {
        const mod = await import("@/lib/cookies")
        steps.push("✓ cookies.ts — bz_tenant=" + (mod.getCookie("bz_tenant") || "null"))
      } catch (e: any) {
        steps.push("✗ cookies.ts: " + e.message)
      }

      try {
        const mod = await import("@/lib/utils")
        steps.push("✓ utils.ts — formatINR(100)=" + mod.formatINR(100))
      } catch (e: any) {
        steps.push("✗ utils.ts: " + e.message)
      }

      try {
        const mod = await import("@/lib/billzo/db")
        const d = mod.db()
        steps.push("✓ db.ts — instance=" + (d ? "created" : "null"))
      } catch (e: any) {
        steps.push("✗ db.ts: " + e.message)
      }

      try {
        await import("@/lib/billzo/types")
        steps.push("✓ types.ts")
      } catch (e: any) {
        steps.push("✗ types.ts: " + e.message)
      }

      try {
        await import("@/lib/billzo/api-types")
        steps.push("✓ api-types.ts")
      } catch (e: any) {
        steps.push("✗ api-types.ts: " + e.message)
      }

      setLogs([...steps])
    })
  }, [])

  return (
    <div style={{ padding: 40, background: '#fff', color: '#333', fontSize: 14, fontFamily: 'monospace', lineHeight: 1.6 }}>
      {logs.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  )
}
