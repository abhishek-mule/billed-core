'use client'

import { useCallback, useRef, useState } from 'react'
import { Camera, X, Loader2, Search, Zap } from 'lucide-react'

interface OCRScannerProps {
  onProductSelect: (product: any) => void
  onClose: () => void
}

interface ProductMatch {
  id: string
  item_name: string
  item_code: string
  rate: number
  matchScore: number
  matchType: string
}

export function OCRScanner({ onProductSelect, onClose }: OCRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [scanning, setScanning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [ocrText, setOCRText] = useState<string>('')

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setScanning(true)
      }
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Cannot access camera'
      setError(msg)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }, [])

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processing) return

    setProcessing(true)
    setError(null)

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    ctx.drawImage(video, 0, 0)

    const imageDataURL = canvas.toDataURL('image/png')

    try {
      const formData = new FormData()
      formData.append('file', await (await fetch(imageDataURL)).blob(), 'scan.png')

      const res = await fetch('/api/magic-scan', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success && data.matches?.length > 0) {
        setMatches(data.matches)
        setOCRText(data.ocrText || '')
      } else {
        setError(data.error || 'No products found')
        setMatches([])
      }
    } catch (err) {
      console.error('OCR failed:', err)
      setError('Scan failed')
    }

    setProcessing(false)
  }, [processing])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-2 text-white">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold">Smart Scan</h3>
          {matches.length > 0 && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              {matches.length} found
            </span>
          )}
        </div>
        <button onClick={() => { stopCamera(); onClose() }} className="p-2 rounded-full bg-white/10">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {error && !scanning && (
          <div className="text-center p-8">
            <p className="text-white/60">{error}</p>
            <button onClick={startCamera} className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-lg">
              Try Again
            </button>
          </div>
        )}

        {!scanning && !error && !matches.length && (
          <div className="text-center">
            <Camera className="w-20 h-20 text-white/30 mx-auto mb-4" />
            <p className="text-white/60 mb-4">Point camera at product label</p>
            <button onClick={startCamera} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-full font-semibold">
              <Camera className="w-5 h-5" /> Start Camera
            </button>
          </div>
        )}

        {scanning && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-48 border-2 border-white/50 rounded-lg" />
            </div>
          </>
        )}

        {processing && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-4" />
              <p className="text-white">Scanning product...</p>
            </div>
          </div>
        )}
      </div>

      {scanning && (
        <div className="p-4 bg-black/50">
          <button
            onClick={captureAndScan}
            disabled={processing}
            className="w-full py-4 bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            {processing ? 'Scanning...' : 'Scan Product'}
          </button>
        </div>
      )}

      {matches.length > 0 && (
        <div className="p-4 bg-black/50 max-h-64 overflow-y-auto">
          <p className="text-white/60 text-xs mb-2">Tap to add to cart:</p>
          <div className="space-y-2">
            {matches.map((product) => (
              <button
                key={product.id}
                onClick={() => { onProductSelect(product); stopCamera(); }}
                className="w-full p-3 bg-white/10 rounded-lg text-left hover:bg-white/20 transition"
              >
                <div className="flex justify-between">
                  <span className="text-white font-medium">{product.item_name}</span>
                  <span className="text-emerald-400 font-bold">₹{product.rate}</span>
                </div>
                <div className="text-white/50 text-xs mt-1">
                  {product.item_code} • {product.matchType} match ({product.matchScore}%)
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-black/50 text-center">
        <button onClick={onClose} className="text-white/60 text-sm hover:text-white">
          Enter barcode manually
        </button>
      </div>
    </div>
  )
}