'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { 
  Camera, 
  CameraOff, 
  Flashlight, 
  FlipHorizontal,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  onError?: (error: string) => void
}

export function BarcodeScanner({ onScan, onClose, onError }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  
  const [scanning, setScanning] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [error, setError] = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setScanning(true)
      }
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError' 
        ? 'Camera permission denied' 
        : 'Cannot access camera'
      setError(msg)
      onError?.(msg)
    }
  }, [facingMode, onError])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // Barcode detection loop using BarcodeDetector API (Chrome/Edge)
  useEffect(() => {
    if (!scanning || !videoRef.current) return

    const detectBarcode = async () => {
      if (!('BarcodeDetector' in window)) {
        // Fallback: try legacy @zxing approach
        console.log('BarcodeDetector not supported, using mock')
        return
      }

      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        })

        const detectLoop = async () => {
          if (!videoRef.current || !streamRef.current) return

          try {
            const barcodes = await barcodeDetector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue
              if (code !== lastScanned) {
                setLastScanned(code)
                onScan(code)
                stopCamera()
                return
              }
            }
          } catch (e) {
            // Ignore NotFoundException
          }

          if (streamRef.current) {
            requestAnimationFrame(detectLoop)
          }
        }

        detectLoop()
      } catch (e) {
        console.error('BarcodeDetector error:', e)
      }
    }

    detectBarcode()
  }, [scanning, onScan, lastScanned, stopCamera])

  const toggleFlash = useCallback(() => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0]
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
      if (capabilities.torch) {
        track.applyConstraints({ advanced: [{ torch: !flashOn }] as any })
        setFlashOn(!flashOn)
      }
    }
  }, [flashOn])

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
    stopCamera()
  }, [stopCamera])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <h3 className="text-white font-semibold">Scan Barcode</h3>
        <button 
          onClick={() => { stopCamera(); onClose() }}
          className="p-2 rounded-full bg-white/10"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Scanner View */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center p-8">
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <p className="text-white text-lg">{error}</p>
            <p className="text-white/60 text-sm mt-2">
              Please allow camera access or use manual entry
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-40 border-2 border-emerald-500 rounded-lg animate-pulse" />
              </div>
            )}
          </>
        )}

        {/* Last scanned */}
        {lastScanned && (
          <div className="absolute bottom-4 left-4 right-4 bg-emerald-600 text-white p-4 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6" />
            <span className="font-mono text-lg">{lastScanned}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-black/50 flex items-center justify-center gap-4">
        {!scanning ? (
          <button
            onClick={startCamera}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-full font-semibold"
          >
            <Camera className="w-5 h-5" />
            Start Scanner
          </button>
        ) : (
          <>
            <button
              onClick={toggleFlash}
              className={`p-4 rounded-full ${flashOn ? 'bg-amber-500' : 'bg-white/10'}`}
            >
              <Flashlight className={`w-6 h-6 ${flashOn ? 'text-white' : 'text-white/60'}`} />
            </button>
            <button
              onClick={toggleCamera}
              className="p-4 rounded-full bg-white/10"
            >
              <FlipHorizontal className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={stopCamera}
              className="p-4 rounded-full bg-white/10"
            >
              <CameraOff className="w-6 h-6 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Manual entry fallback */}
      <div className="p-4 bg-black/50 text-center">
        <button
          onClick={onClose}
          className="text-white/60 text-sm hover:text-white"
        >
          Enter barcode manually
        </button>
      </div>
    </div>
  )
}