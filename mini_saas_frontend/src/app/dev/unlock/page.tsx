"use client"

import { useEffect, useState } from "react"

export default function DevUnlockPage() {
  const [status, setStatus] = useState("Unlocking...")

  useEffect(() => {
    async function run() {
      try {
        const match = document.cookie.match(/bz_tenant=([^;]+)/)
        if (!match) { setStatus("❌ No tenant cookie. Visit /auth/resolve."); return }
        const tenantId = decodeURIComponent(match[1])

        // Update Supabase via API
        const res = await fetch("/api/dev/unlock")
        const data = await res.json()
        if (!data.success) { setStatus("❌ " + data.error); return }

        // Update local Dexie via raw IndexedDB
        const open = indexedDB.open("billzo_production_v1", 5)
        open.onsuccess = () => {
          const tx = open.result.transaction("tenants", "readwrite")
          const store = tx.objectStore("tenants")

          store.get(tenantId).onsuccess = (e: any) => {
            const tenant = e.target.result
            if (!tenant) { setStatus("❌ Tenant not found in local DB"); return }

            tenant.plan = "pro"
            tenant.paywallUnlocked = true
            tenant.invoiceCount = 0
            tenant.reminderCount = 0
            tenant.updatedAt = new Date().toISOString()

            store.put(tenant)
            setStatus("✅ Unlocked! You can now use all features.")
          }
        }
        open.onerror = () => setStatus("❌ Failed to open local DB")
      } catch (err: any) {
        setStatus("❌ " + err.message)
      }
    }
    run()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-sm text-center space-y-4 p-8">
        <div className="text-4xl">{status.includes("✅") ? "🎉" : "⏳"}</div>
        <div className="text-sm text-slate-600 font-medium">{status}</div>
        {status.includes("✅") && (
          <a href="/parties" className="inline-block mt-4 px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
            Go to Parties
          </a>
        )}
        {status.includes("❌") && (
          <a href="/auth/resolve" className="inline-block mt-4 px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
            Fix Auth
          </a>
        )}
      </div>
    </div>
  )
}
