'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Camera, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ShoppingCart,
  Plus,
  Minus,
  Zap,
  Flashlight,
  FlipHorizontal,
  Loader2,
  Trash2,
  ScanLine
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ScannedItem {
  id: string
  name: string
  price: number
  quantity: number
  image?: string
}

interface ProductMatch {
  id: string
  name: string
  rate: number
  matchScore: number
}

const DEMO_PRODUCTS: ProductMatch[] = [
  { id: '1', name: 'Bajaj LED Bulb 9W', rate: 150, matchScore: 95 },
  { id: '2', name: 'Havells Wire 2.5mm', rate: 1200, matchScore: 88 },
  { id: '3', name: 'Polycab Switch', rate: 45, matchScore: 92 },
  { id: '4', name: 'Finolex Cable 1.5mm', rate: 850, matchScore: 85 },
  { id: '5', name: 'Anchor Fan Regulator', rate: 180, matchScore: 90 },
]

export default function MagicScanPage() {
  const [scanning, setScanning] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [detecting, setDetecting] = useState(false)
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [total, setTotal] = useState(0)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setCameraActive(true)
        setScanning(true)
      }
    } catch (err) {
      console.error('Camera error:', err)
      alert('Unable to access camera. Please grant camera permission.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setScanning(false)
  }

  const simulateDetection = useCallback(() => {
    if (!detecting) return
    
    const randomProduct = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)]
    setLastDetected(randomProduct.name)
    
    setTimeout(() => {
      setScannedItems(prev => {
        const existing = prev.find(item => item.name === randomProduct.name)
        if (existing) {
          return prev.map(item => 
            item.name === randomProduct.name 
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        return [...prev, {
          id: randomProduct.id,
          name: randomProduct.name,
          price: randomProduct.rate,
          quantity: 1
        }]
      })
      setLastDetected(null)
    }, 500)
  }, [detecting])

  useEffect(() => {
    if (scanning && detecting) {
      const interval = setInterval(simulateDetection, 2000)
      return () => clearInterval(interval)
    }
  }, [scanning, detecting, simulateDetection])

  useEffect(() => {
    setTotal(scannedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0))
  }, [scannedItems])

  const updateQuantity = (id: string, delta: number) => {
    setScannedItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta
        return newQty > 0 ? { ...item, quantity: newQty } : item
      }
      return item
    }).filter(item => item.quantity > 0))
  }

  const removeItem = (id: string) => {
    setScannedItems(prev => prev.filter(item => item.id !== id))
  }

  const toggleDetection = () => {
    if (detecting) {
      setDetecting(false)
    } else {
      setDetecting(true)
      if (!scanning) startCamera()
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-6 pb-24 animate-in">
      {/* Hidden canvas for potential frame processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Magic Scan</h1>
          <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
            <Zap className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Vision</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scanning && (
            <>
              <button 
                onClick={() => setFlashOn(!flashOn)}
                className={`p-2 rounded-xl ${flashOn ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}
              >
                <Flashlight className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
                className="p-2 bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Camera View */}
      <div className="relative bg-black rounded-3xl overflow-hidden aspect-[4/3] min-h-[400px]">
        {!scanning ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
            <Camera className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-gray-400 font-medium mb-6">Camera not active</p>
            <button 
              onClick={startCamera}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold"
            >
              <Zap className="w-5 h-5" />
              Start Scanning
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            
            {/* Scan overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Scanning line animation */}
              <motion.div 
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(99,102,241,0.8)]"
              />
              
              {/* Corner markers */}
              <div className="absolute top-8 left-8 w-12 h-12 border-l-2 border-t-2 border-white/50" />
              <div className="absolute top-8 right-8 w-12 h-12 border-r-2 border-t-2 border-white/50" />
              <div className="absolute bottom-8 left-8 w-12 h-12 border-l-2 border-b-2 border-white/50" />
              <div className="absolute bottom-8 right-8 w-12 h-12 border-r-2 border-b-2 border-white/50" />
            </div>

            {/* Last detected item toast */}
            <AnimatePresence>
              {lastDetected && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2"
                >
                  <ScanLine className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span className="text-white font-medium text-sm">{lastDetected}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Status indicator */}
        {scanning && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${detecting ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-white text-xs font-medium">
                {detecting ? 'Detecting...' : 'Ready to scan'}
              </span>
            </div>
            <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full">
              <Camera className="w-4 h-4 text-gray-300" />
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-center gap-4">
        <button 
          onClick={toggleDetection}
          disabled={!cameraActive}
          className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all ${
            detecting 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' 
              : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {detecting ? (
            <>
              <AlertCircle className="w-5 h-5" />
              Stop Detection
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Start AI Scan
            </>
          )}
        </button>
        
        {scanning && (
          <button 
            onClick={stopCamera}
            className="px-4 py-4 bg-gray-100 rounded-2xl text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scanned Items */}
      {scannedItems.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900">Scanned Items</span>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {scannedItems.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <span className="text-lg font-black text-gray-900">{formatCurrency(total)}</span>
          </div>

          <div className="divide-y divide-gray-50">
            {scannedItems.map((item) => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-500">{formatCurrency(item.price)} each</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
                    <button 
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-colors"
                    >
                      <Minus className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-gray-300 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-gray-50/50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Tap items to edit quantity
            </div>
            <button className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20">
              Create Invoice
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {scannedItems.length === 0 && scanning && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ScanLine className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-2">No items detected yet</h3>
          <p className="text-gray-500 mb-4">Point your camera at products to auto-detect</p>
          <button 
            onClick={toggleDetection}
            disabled={!cameraActive}
            className="text-primary font-bold text-sm"
          >
            {detecting ? 'Scanning in progress...' : 'Enable AI detection'}
          </button>
        </div>
      )}
    </div>
  )
}