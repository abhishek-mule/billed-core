"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Download, Database, Trash2, FileSpreadsheet, FileJson,
  Loader2, CheckCircle2, AlertCircle, ChevronRight,
} from "lucide-react"
import { getCookie, clearAuthCookies } from "@/lib/cookies"
import { fetchWithAuth } from "@/lib/fetch-with-auth"

export default function DataPrivacyPage() {
  const router = useRouter()
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleExport = async (format: "csv" | "json") => {
    setExporting(format)
    setError("")
    setExportDone(false)
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) throw new Error("Not authenticated")

      const res = await fetchWithAuth(`/api/tenant/export?format=${format}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `billzo-export-${tenantId.slice(0, 8)}-${Date.now()}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      setExportDone(true)
      setTimeout(() => setExportDone(false), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(null)
    }
  }

  const handleDeleteAccount = () => {
    clearAuthCookies()
    localStorage.clear()
    router.push("/auth")
  }

  return (
    <div className="min-h-screen bg-muted pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Data & Privacy</h1>
            <p className="text-sm text-muted-foreground">Export data, manage storage</p>
          </div>
        </div>

        {/* Status */}
        {exportDone && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Export downloaded
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Export data */}
        <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Export Data</p>
              <p className="text-xs text-muted-foreground">Download your business data for backup or migration</p>
            </div>
          </div>
          <div className="p-4 flex gap-3">
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting !== null}
              className="flex-1 h-11 rounded-lg border border-border flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {exporting === "csv" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Export CSV
            </button>
            <button
              onClick={() => handleExport("json")}
              disabled={exporting !== null}
              className="flex-1 h-11 rounded-lg border border-border flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {exporting === "json" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileJson className="w-4 h-4" />
              )}
              Export JSON
            </button>
          </div>
        </div>

        {/* Storage info */}
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Local Storage</p>
            <p className="text-xs text-muted-foreground">Data is cached locally for offline access</p>
          </div>
          <button
            onClick={() => {
              localStorage.clear()
              setExportDone(true)
              setTimeout(() => setExportDone(false), 3000)
            }}
            className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors shrink-0"
          >
            Clear Cache
          </button>
        </div>

        {/* Danger Zone */}
        <div className="border-t border-rose-200 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">Danger Zone</p>
          </div>
          <div className="bg-card border border-rose-200 rounded-lg overflow-hidden">
            {confirmDelete ? (
              <div className="p-4 space-y-3">
                <p className="text-sm text-rose-700 font-medium">Are you sure?</p>
                <p className="text-xs text-rose-500">
                  This will sign you out and clear all local data. Your data on the server is preserved.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    className="flex-1 h-10 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sign Out & Clear
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-5 h-5 text-rose-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-rose-700">Clear local data & sign out</p>
                  <p className="text-xs text-rose-500">Removes cached data from this device</p>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-300 shrink-0" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
