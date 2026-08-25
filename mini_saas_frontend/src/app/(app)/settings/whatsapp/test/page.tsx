'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle, Wifi, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/billzo/Button'

export default function WhatsAppTestPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<'idle' | 'connecting' | 'callback' | 'test' | 'complete'>('idle')
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    const phone = searchParams.get('phone')
    const err = searchParams.get('error')

    if (err) {
      setError(err)
      setStep('idle')
      return
    }

    if (connected && phone) {
      setStep('test')
    }
  }, [searchParams])

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    setStep('connecting')

    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.signupUrl) {
        window.location.href = data.signupUrl
      } else {
        setError(data.error || 'Failed to initiate connection')
        setStep('idle')
      }
    } catch (err: any) {
      setError(err.message)
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  const handleTestMessage = async () => {
    if (!testMessage.trim()) return

    setLoading(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '+919876543210',
          text: testMessage,
        }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err: any) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 'idle':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">WhatsApp Coexistence Test</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your existing WhatsApp Business number via Gupshup Coexistence.
                Your existing WhatsApp Business App will continue to work normally.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Wifi className="h-4 w-4" /> Uses your existing WhatsApp Business number</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Chat history syncs with Business App</div>
                <div className="flex items-center gap-2"><Send className="h-4 w-4" /> Automated reminders from your number</div>
              </div>
            </div>
            <Button onClick={handleConnect} disabled={loading} className="w-full" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Connect WhatsApp Business'}
            </Button>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )

      case 'test':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Connected Successfully</h3>
                  <p className="text-sm text-muted-foreground">Your WhatsApp Business number is connected</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-border p-4">
                  <label className="block text-sm font-medium text-foreground mb-2">Test Message</label>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Enter test message..."
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <Button onClick={handleTestMessage} disabled={loading} className="w-full mt-2" size="lg">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Send Test Message'}
                  </Button>
                </div>

                {testResult && (
                  <div className={`rounded-lg p-4 ${testResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-destructive/10 border-destructive/20'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-medium">
                        {testResult.success ? 'Message sent successfully!' : 'Failed to send'}
                      </span>
                    </div>
                    <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-auto">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Coexistence Proof</h1>
        <p className="text-muted-foreground mt-1">Test 3-merchant onboarding flow</p>
      </div>
      {renderStep()}
    </div>
  )
}