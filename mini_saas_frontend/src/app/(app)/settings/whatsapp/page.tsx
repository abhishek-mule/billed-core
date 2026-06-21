"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, MessageCircle, Smartphone, Wifi, WifiOff, QrCode,
  CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, ChevronRight,
  LayoutTemplate,
} from "lucide-react"
import type { TenantWhatsAppConfig, WhatsAppProvider } from "@/lib/billzo/types"
import QRCode from "qrcode"
import { getCookie } from "@/lib/cookies"

const QR_TIMEOUT_SECONDS = 60

const DEFAULT_CONFIG: TenantWhatsAppConfig = {
  autoSend: false,
  paymentLinkEnabled: false,
  paymentLinkExpiry: 7,
  optInMessage: "Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.",
  templateNames: {},
}

export default function WhatsAppSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [config, setConfig] = useState<TenantWhatsAppConfig>(DEFAULT_CONFIG)
  const [showApiKey, setShowApiKey] = useState(false)
  const [connectionState, setConnectionState] = useState<string>("disconnected")
  const [channelHealth, setChannelHealth] = useState<Record<string, any> | null>(null)

  // Pairing state
  const [pairStatus, setPairStatus] = useState<"idle" | "requested" | "awaiting_scan" | "connected" | "failed">("idle")
  const [pairQr, setPairQr] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null)
  const [qrTimeLeft, setQrTimeLeft] = useState(0)
  const [pairPollInterval, setPairPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [pairingInProgress, setPairingInProgress] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pairPollInterval) clearInterval(pairPollInterval)
    }
  }, [pairPollInterval])

  const loadSettings = async () => {
    try {
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }
      const res = await fetch("/api/tenant/whatsapp-config", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setConfig({ ...DEFAULT_CONFIG, ...data.config })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const res = await fetch("/api/tenant/whatsapp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ config }),
      })
      if (!res.ok) throw new Error("Failed to save")
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof TenantWhatsAppConfig>(key: K, value: TenantWhatsAppConfig[K]) => {
    setConfig(c => ({ ...c, [key]: value }))
  }

  const setProvider = (provider: WhatsAppProvider) => {
    set("whatsappProvider", provider)
    if (provider === "gupshup") disconnectBaileys()
  }

  // Baileys pairing
  const startPairing = useCallback(async () => {
    const tenantId = getCookie("bz_tenant")
    if (!tenantId || pairingInProgress) return

    setPairingInProgress(true)
    setPairStatus("requested")
    setPairQr(null)
    setQrExpiresAt(null)
    setQrTimeLeft(0)
    setError("")

    let pollInterval: ReturnType<typeof setInterval> | null = null

    try {
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        let errorMsg = "Failed to start pairing"
        try { const data = await res.json(); errorMsg = data.error || errorMsg } catch {}
        throw new Error(errorMsg)
      }

      pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/whatsapp/pair?tenantId=${tenantId}`, { credentials: "include" })
          if (!pollRes.ok) return
          const data = await pollRes.json()
          setConnectionState(data.connectionState || "disconnected")
          setChannelHealth(data.health || null)

          if (data.status === "connected") {
            setPairStatus("connected")
            setPairQr(null)
            if (pollInterval) clearInterval(pollInterval)
            setPairingInProgress(false)
          } else if (data.status === "awaiting_scan" && data.qr) {
            setPairStatus("awaiting_scan")
            setPairQr(data.qr)
            set("whatsappProvider", "baileys")
          } else if (data.connectionState === "disconnected" && data.health?.error === "qr_refs_exhausted") {
            setPairStatus("failed")
            setError("QR pairing timed out. Please try again.")
            if (pollInterval) clearInterval(pollInterval)
            setPairingInProgress(false)
          }
        } catch {}
      }, 1500)

      setPairPollInterval(pollInterval)
    } catch (err: any) {
      setError(err.message || "Failed to start pairing")
      setPairStatus("idle")
      if (pollInterval) clearInterval(pollInterval)
      setPairingInProgress(false)
    }
  }, [pairingInProgress, set])

  const disconnectBaileys = async () => {
    try {
      await fetch("/api/whatsapp/pair", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    } catch (err: any) {
      setError(err.message || "Failed to disconnect")
    }
    setPairStatus("idle")
    setPairQr(null)
    if (pairPollInterval) {
      clearInterval(pairPollInterval)
      setPairPollInterval(null)
    }
  }

  // QR code generation
  useEffect(() => {
    if (pairQr) {
      QRCode.toDataURL(pairQr, { width: 256, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } })
        .then(setQrDataUrl)
        .catch(() => {})
      setQrExpiresAt(Date.now() + QR_TIMEOUT_SECONDS * 1000)
      setQrTimeLeft(QR_TIMEOUT_SECONDS)
    } else {
      setQrDataUrl(null)
      setQrExpiresAt(null)
      setQrTimeLeft(0)
    }
  }, [pairQr])

  // QR countdown
  useEffect(() => {
    if (!qrExpiresAt) return
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((qrExpiresAt - Date.now()) / 1000))
      setQrTimeLeft(left)
      if (left <= 0) {
        clearInterval(tick)
        setPairStatus("failed")
        setError("QR code expired. A new QR will be generated automatically...")
        setTimeout(() => { setError(""); startPairing() }, 1500)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [qrExpiresAt, startPairing])

  // Initial connection check
  useEffect(() => {
    const tenantId = getCookie("bz_tenant")
    if (!tenantId) return
    fetch(`/api/whatsapp/pair?tenantId=${tenantId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setConnectionState(data.connectionState || "disconnected")
        setChannelHealth(data.health || null)
        if (data.status === "connected") setPairStatus("connected")
      })
      .catch(() => {})
  }, [])

  const isConnected = connectionState === "connected"
  const isBaileys = config.whatsappProvider === "baileys"
  const PROPS = { config, set, showApiKey, setShowApiKey }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Connect WhatsApp, manage templates, auto-send</p>
          </div>
        </div>

        {/* Status banners */}
        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Settings saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Connection status card */}
        {connectionState !== "disconnected" && (
          <div className={`rounded-lg border p-4 flex items-center gap-3 ${
            isConnected ? "bg-card border-border" :
            connectionState === "auth_expired" || connectionState === "banned" ? "bg-rose-50 border-rose-200" :
            "bg-amber-50 border-amber-200"
          }`}>
            {isConnected ? (
              <Wifi className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : connectionState === "connecting" || connectionState === "reconnecting" ? (
              <Loader2 className="w-5 h-5 text-amber-500 shrink-0 animate-spin" />
            ) : (
              <WifiOff className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {connectionState === "connected" ? "WhatsApp Connected" :
                 connectionState === "connecting" ? "Connecting..." :
                 connectionState === "reconnecting" ? "Reconnecting..." :
                 connectionState === "degraded" ? "Degraded" :
                 connectionState === "rate_limited" ? "Rate Limited" :
                 connectionState === "auth_expired" ? "Session Expired" :
                 connectionState === "banned" ? "Account Banned" :
                 "Not Connected"}
              </p>
              {isConnected && channelHealth?.lastConnectedAt && (
                <p className="text-xs text-muted-foreground">Connected {new Date(channelHealth.lastConnectedAt).toLocaleString()}</p>
              )}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium border shrink-0 ${
              isConnected ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              {connectionState}
            </span>
          </div>
        )}

        {/* Provider section */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">WhatsApp Provider</p>
                <p className="text-xs text-muted-foreground">Choose how to send WhatsApp messages</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["gupshup", "baileys"] as WhatsAppProvider[]).map(provider => (
                <button
                  key={provider}
                  onClick={() => setProvider(provider)}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    (config.whatsappProvider || "gupshup") === provider
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-border hover:border-border"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground capitalize">{provider}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {provider === "gupshup" ? "Transactional API" : "Merchant-owned WhatsApp"}
                  </p>
                </button>
              ))}
            </div>

            {/* Baileys pairing */}
            {isBaileys && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-3">
                {pairStatus === "connected" ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-foreground">Linked & Active</span>
                    </div>
                    <button onClick={disconnectBaileys} className="text-xs text-rose-500 hover:underline font-medium">
                      Disconnect
                    </button>
                  </div>
                ) : pairStatus === "awaiting_scan" && pairQr ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative rounded-lg border border-border bg-card p-2">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="WhatsApp QR" className="w-48 h-48 rounded" />
                      ) : (
                        <div className="w-48 h-48 bg-muted rounded flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                        </div>
                      )}
                      <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-bold shadow-sm dark:shadow-[0_2px_4px_rgba(0,0,0,0.25)] bg-card/90 backdrop-blur ${
                        qrTimeLeft > 15 ? "text-emerald-600" : qrTimeLeft > 5 ? "text-amber-600" : "text-rose-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          qrTimeLeft > 15 ? "bg-emerald-500" : qrTimeLeft > 5 ? "bg-amber-500 animate-pulse" : "bg-rose-500 animate-pulse"
                        }`} />
                        {qrTimeLeft}s
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      Open WhatsApp on your phone → Menu → Linked Devices → Link a Device → Scan this QR
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Not connected</span>
                    </div>
                    <button
                      onClick={startPairing}
                      disabled={pairingInProgress}
                      className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {pairingInProgress ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <QrCode className="w-3 h-3" />
                      )}
                      {pairingInProgress ? "Connecting..." : "Link WhatsApp"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Gupshup fields */}
            {(config.whatsappProvider || "gupshup") === "gupshup" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Gupshup API Key</label>
                  <div className="relative">
                    <input
                      value={config.gupshupApiKey || ""}
                      onChange={e => set("gupshupApiKey", e.target.value)}
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      className="w-full h-10 rounded-lg border border-border px-3 pr-9 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">App Name</label>
                    <input
                      value={config.gupshupAppName || ""}
                      onChange={e => set("gupshupAppName", e.target.value)}
                      placeholder="My App"
                      className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Source Number</label>
                    <input
                      value={config.sourceNumber || ""}
                      onChange={e => set("sourceNumber", e.target.value)}
                      placeholder="919876543210"
                      type="tel"
                      className="w-full h-10 rounded-lg border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Templates link */}
        <Link
          href="/settings/whatsapp/templates"
          className="bg-card border border-border rounded-lg p-4 flex items-center gap-3 hover:border-border transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <LayoutTemplate className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Message Templates</p>
            <p className="text-xs text-muted-foreground">Customize invoice, reminder, and receipt templates</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>

        {/* Auto-Send */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Auto-Send</p>
              <p className="text-xs text-muted-foreground">Control when messages go out automatically</p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSend}
              onChange={e => set("autoSend", e.target.checked)}
              className="h-4 w-4 accent-emerald-500 rounded border-border"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Auto-send invoice via WhatsApp</p>
              <p className="text-xs text-muted-foreground">After creating an invoice</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.paymentLinkEnabled}
              onChange={e => set("paymentLinkEnabled", e.target.checked)}
              className="h-4 w-4 accent-emerald-500 rounded border-border"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Include payment links</p>
              <p className="text-xs text-muted-foreground">Add UPI payment links in messages</p>
            </div>
          </label>

          {config.paymentLinkEnabled && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Payment link expiry</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 15, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => set("paymentLinkExpiry", days)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      config.paymentLinkExpiry === days
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Opt-in message */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Opt-in Message</p>
            <p className="text-xs text-muted-foreground">First message sent to new customers before regular messages</p>
          </div>
          <textarea
            value={config.optInMessage || ""}
            onChange={e => set("optInMessage", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            placeholder="Hi {{name}}..."
          />
          <p className="text-[10px] text-muted-foreground">
            {"Use {{name}} for customer name, {{link}} for payment link"}
          </p>
        </div>

        {/* Save */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/settings"
            className="flex-1 h-11 rounded-lg border border-border flex items-center justify-center text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

      </div>
    </div>
  )
}
