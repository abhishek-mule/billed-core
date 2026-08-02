'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Clock } from 'lucide-react'
import '@/styles/recovery-center.css'
import { RecoveryEventTimeline } from '@/components/billzo/RecoveryEventTimeline'

export default function TimelinePage() {
  const router = useRouter()
  const [caseId, setCaseId] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('caseId')
    const custId = params.get('customerId')
    setCaseId(cid)
    setCustomerId(custId)
    if (!cid && !custId) {
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [])

  const hasParam = caseId || customerId

  return (
    <div className="rc-page">
      <header className="cw-header">
        <button className="rc-refresh" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="cw-head-main">
          <h1 className="cw-name">Timeline</h1>
          {caseId ? (
            <Link className="cw-phone" href={`/recovery/case/${encodeURIComponent(caseId)}`}>Back to workspace</Link>
          ) : customerId ? (
            <Link className="cw-phone" href={`/recovery/customer/${encodeURIComponent(customerId)}`}>Back to workspace</Link>
          ) : null}
        </div>
      </header>

      {!hasParam ? (
        <div className="rc-empty"><Clock size={18} /><span>No case or customer selected.</span></div>
      ) : (
        <RecoveryEventTimeline
          caseId={caseId || undefined}
          customerId={customerId || undefined}
          emptyMessage={caseId ? 'No activity recorded for this case.' : 'No activity recorded for this customer.'}
        />
      )}
    </div>
  )
}
