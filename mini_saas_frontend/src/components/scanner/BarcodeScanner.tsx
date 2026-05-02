'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, X, RefreshCcw, Zap } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '@/lib/utils'

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void
  onClose: () => void
  isOpen: boolean
}

export function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCamera, setHasCamera] = useState(false)
  const containerId = 'barcode-scanner-container'

  useEffect(() => {
    if (isOpen) {
      const html5QrCode = new Html5Qrcode(containerId)
      setScanner(html5QrCode)
      startScanning(html5QrCode)
    } else {
      stopScanning()
    }

    return () => {
      stopScanning()
    }
  }, [isOpen])

  const startScanning = async (scannerInstance: Html5Qrcode) => {
    try {
      setError(null)
      setIsScanning(true)
      
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0,
      }

      await scannerInstance.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          onScan(decodedText)
          // Visual feedback
          const audio = new Audio('/scan-success.mp3') // Optional
          audio.play().catch(() => {})
        },
        (errorMessage) => {
          // Silent for scan errors (normal during searching)
        }
      )
      setHasCamera(true)
    } catch (err: any) {
      console.error('Camera access failed:', err)
      setError(err.message || 'Could not access camera')
      setIsScanning(false)
    }
  }

  const stopScanning = async () => {
    if (scanner) {
      try {
        await scanner.stop()
        scanner.clear()
      } catch (err) {
        console.error('Failed to stop scanner:', err)
      }
    }
    setIsScanning(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in p-6">
      <div className="w-full max-w-md bg-card rounded-[2.5rem] border-2 border-border/50 overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 fill-primary/20" />
             </div>
             <div>
                <h3 className="text-sm font-black uppercase tracking-widest leading-none">Scanning Engine</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-tighter opacity-60">Point at a barcode</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner View */}
        <div className="relative aspect-square w-full bg-black flex flex-col items-center justify-center overflow-hidden">
           <div id={containerId} className="w-full h-full" />
           
           {/* Overlay Decorations */}
           <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
              <div className="w-full h-full border-2 border-primary/50 rounded-2xl relative">
                 <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary -translate-x-1 -translate-y-1" />
                 <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary translate-x-1 -translate-y-1" />
                 <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary -translate-x-1 translate-y-1" />
                 <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary translate-x-1 translate-y-1" />
                 
                 {/* Scanning Line */}
                 {isScanning && (
                   <div className="absolute top-0 left-0 right-0 h-1 bg-primary/50 shadow-[0_0_15px_rgba(30,58,138,0.5)] animate-scan-line" />
                 )}
              </div>
           </div>

           {!isScanning && !error && (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
                <Loader />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Warming up sensor...</p>
             </div>
           )}

           {error && (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-destructive/10 backdrop-blur-sm p-8 text-center">
                <div className="w-16 h-16 bg-destructive text-white rounded-[1.5rem] flex items-center justify-center mb-2">
                   <Camera className="w-8 h-8" />
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => scanner && startScanning(scanner)} icon={<RefreshCcw className="w-3 h-3" />}>
                   Retry Sensor
                </Button>
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-muted/30 flex items-center justify-center">
           <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50">Authorized Scanning Module v1.0</p>
        </div>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
      <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}