'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, X, Loader2, Edit, Package, Building2, Calendar, FileText, IndianRupee } from 'lucide-react'
import { formatINR } from '@/lib/api-client'

interface ExtractedItem {
  itemName: string
  quantity: number
  rate: number
  matchedProduct?: {
    id: string
    name: string
    itemCode: string
    confidence: number
  }
  matchType: string
  matchScore: number
}

interface ExtractedData {
  supplier: {
    name: string
    id: string | null
    confidence: number
  }
  items: ExtractedItem[]
  invoiceNumber?: string
  invoiceDate?: string
  total?: number
  confidence: number
  rawText: string
}

interface OCRResultProps {
  extractedData: ExtractedData
  onConfirm: (data: ExtractedData) => Promise<void>
  onEdit: () => void
  onRetry: () => void
  onClose: () => void
}

export function OCRResult({
  extractedData,
  onConfirm,
  onEdit,
  onRetry,
  onClose
}: OCRResultProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confidence = extractedData.confidence
  const isHighConfidence = confidence >= 0.8
  const isMediumConfidence = confidence >= 0.6 && confidence < 0.8
  const isLowConfidence = confidence < 0.6

  const handleConfirm = async () => {
    setIsConfirming(true)
    setError(null)

    try {
      await onConfirm(extractedData)
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase bill')
      setIsConfirming(false)
    }
  }

  const getMatchColor = (score: number) => {
    if (score >= 0.8) return 'text-success'
    if (score >= 0.6) return 'text-warning'
    return 'text-destructive'
  }

  const getMatchLabel = (score: number) => {
    if (score >= 0.8) return 'Strong match'
    if (score >= 0.6) return 'Possible match'
    return 'Manual review'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur animate-fade-in p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-elegant animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${
                isHighConfidence ? 'bg-success text-success-foreground' :
                isMediumConfidence ? 'bg-warning text-warning-foreground' :
                'bg-destructive text-destructive-foreground'
              }`}>
                {isHighConfidence ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-semibold">Invoice Recognized</h3>
                <div className="text-xs text-muted-foreground">
                  {Math.round(confidence * 100)}% confidence • {extractedData.items.length} items
                </div>
              </div>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Confidence Banner */}
          {isLowConfidence && (
            <div className="rounded-xl bg-warning/10 border border-warning/20 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium text-warning">Low confidence ({Math.round(confidence * 100)}%)</div>
                  <div className="text-muted-foreground mt-1">Please review the extracted data before confirming</div>
                </div>
              </div>
            </div>
          )}

          {/* Invoice Summary */}
          <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Supplier:</span>
              <span className="font-medium">{extractedData.supplier.name}</span>
              {extractedData.supplier.confidence > 0 && (
                <span className={`text-xs ${getMatchColor(extractedData.supplier.confidence)}`}>
                  ({Math.round(extractedData.supplier.confidence * 100)}% match)
                </span>
              )}
            </div>

            {extractedData.invoiceNumber && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Invoice:</span>
                <span className="font-medium">{extractedData.invoiceNumber}</span>
              </div>
            )}

            {extractedData.invoiceDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">{extractedData.invoiceDate}</span>
              </div>
            )}

            {extractedData.total && (
              <div className="flex items-center gap-2 text-sm">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-bold">{formatINR(extractedData.total)}</span>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Line Items
            </h4>
            <div className="space-y-2">
              {extractedData.items.map((item, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-3 ${
                    item.matchScore >= 0.8 ? 'border-success/30 bg-success/5' :
                    item.matchScore >= 0.6 ? 'border-warning/30 bg-warning/5' :
                    'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.matchedProduct?.name || item.itemName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Qty: {item.quantity} × {formatINR(item.rate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">{formatINR(item.quantity * item.rate)}</div>
                      <div className={`text-xs ${getMatchColor(item.matchScore)}`}>
                        {getMatchLabel(item.matchScore)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 border-t border-border bg-card p-4 space-y-2">
          {isHighConfidence ? (
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="w-full rounded-xl bg-gradient-primary py-3 text-base font-bold text-primary-foreground shadow-glow transition-base hover:opacity-90 disabled:opacity-50"
            >
              {isConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Purchase Bill...
                </span>
              ) : (
                `Create Purchase Bill (${extractedData.total ? formatINR(extractedData.total) : ''})`
              )}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="w-full rounded-xl bg-primary py-3 text-base font-bold text-primary-foreground transition-base hover:opacity-90 disabled:opacity-50"
            >
              {isConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Confirm & Create'
              )}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onEdit}
              disabled={isConfirming}
              className="rounded-xl border border-input py-2.5 text-sm font-medium transition-base hover:bg-secondary disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Details
            </button>
            <button
              onClick={onRetry}
              disabled={isConfirming}
              className="rounded-xl border border-input py-2.5 text-sm font-medium transition-base hover:bg-secondary disabled:opacity-50"
            >
              Scan Again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}