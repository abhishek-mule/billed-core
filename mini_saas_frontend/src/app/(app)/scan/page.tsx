'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Webcam from 'react-webcam'
import { 
  Camera, 
  X, 
  Upload, 
  Zap, 
  CheckCircle2, 
  Loader2,
  RefreshCcw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ScanPage() {
  const router = useRouter()
  const webcamRef = useRef<Webcam>(null)
  
  const [image, setImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [step, setStep] = useState<'camera' | 'preview' | 'success'>('camera')

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (imageSrc) {
      setImage(imageSrc)
      setStep('preview')
      // Vibration for success feedback (mobile PWA)
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50)
      }
    }
  }, [webcamRef])

  const retake = () => {
    setImage(null)
    setStep('camera')
  }

  const processImage = () => {
    setIsProcessing(true)
    // Simulate OCR Processing delay
    setTimeout(() => {
      setIsProcessing(false)
      setStep('success')
      // Redirect to purchase edit screen after 1.5s
      setTimeout(() => {
        router.push('/purchases/new?fromScan=true')
      }, 1500)
    }, 2500)
  }

  const videoConstraints = {
    width: 720,
    height: 1280,
    facingMode: "environment" // Use back camera on mobile
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/60 to-transparent">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white backdrop-blur-md"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 text-white bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md">
          <Zap className="w-4 h-4 text-warning" />
          <span className="text-sm font-semibold tracking-wide">Auto OCR</span>
        </div>
        <div className="w-10 h-10" /> {/* Spacer */}
      </div>

      <div className="flex-1 relative overflow-hidden flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === 'camera' && (
            <motion.div
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="object-cover w-full h-full"
              />
              {/* Camera Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                <div className="w-full h-2/3 max-w-sm border-2 border-white/40 rounded-3xl relative">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-40">
                    <p className="text-white text-center font-medium px-4">Align bill within frame</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'preview' && image && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="absolute inset-0"
            >
              <img src={image} alt="Scanned Bill" className="object-contain w-full h-full" />
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Extracting Data...</h3>
                  <p className="text-white/80 text-sm max-w-xs">Reading supplier, items, and tax details using OCR.</p>
                </div>
              )}
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-success flex flex-col items-center justify-center text-success-foreground p-6"
            >
              <CheckCircle2 className="w-20 h-20 mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-center">Data Extracted</h2>
              <p className="text-center font-medium opacity-90">Redirecting to purchase entry...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Controls */}
      <div className="p-8 pb-12 z-10 bg-gradient-to-t from-black to-transparent">
        {step === 'camera' && (
          <div className="flex items-center justify-center gap-8">
            <button className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Upload className="w-6 h-6 text-white" />
            </button>
            <button 
              onClick={capture}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1"
            >
              <div className="w-full h-full bg-white rounded-full active:scale-95 transition-transform" />
            </button>
            <div className="w-12 h-12" /> {/* Spacer for symmetry */}
          </div>
        )}

        {step === 'preview' && !isProcessing && (
          <div className="flex items-center justify-center gap-6">
            <button 
              onClick={retake}
              className="px-6 py-4 rounded-xl bg-white/20 text-white font-medium flex items-center gap-2 backdrop-blur-md active:bg-white/30"
            >
              <RefreshCcw className="w-5 h-5" /> Retake
            </button>
            <button 
              onClick={processImage}
              className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-bold shadow-glow text-lg active:scale-95 transition-transform"
            >
              Process Bill
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
