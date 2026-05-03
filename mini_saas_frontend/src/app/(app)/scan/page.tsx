'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Webcam from 'react-webcam'
import { 
  Camera, 
  X, 
  Upload, 
  Zap, 
  ZapOff,
  CheckCircle2, 
  Loader2,
  RefreshCcw,
  ImagePlus
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function ScanPage() {
  const router = useRouter()
  const webcamRef = useRef<Webcam>(null)
  
  const [image, setImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [step, setStep] = useState<'camera' | 'preview' | 'success'>('camera')
  const [isBlurry, setIsBlurry] = useState(false)

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (imageSrc) {
      // Simulated blur detection
      const isSimulatedBlur = Math.random() < 0.05
      if (isSimulatedBlur) {
        setIsBlurry(true)
        setTimeout(() => setIsBlurry(false), 3000)
        return
      }

      setImage(imageSrc)
      setStep('preview')
      
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([10, 30, 10]) // Premium haptic feedback
      }
    }
  }, [webcamRef])

  const retake = () => {
    setImage(null)
    setStep('camera')
    setIsBlurry(false)
  }

  const processImage = () => {
    setIsProcessing(true)
    // Simulate OCR Processing delay
    setTimeout(() => {
      setIsProcessing(false)
      setStep('success')
      // Redirect to purchase edit screen after 1s
      setTimeout(() => {
        router.push('/purchases/new?fromScan=true')
      }, 1000)
    }, 2000)
  }

  const videoConstraints = {
    width: 720,
    height: 1280,
    facingMode: "environment"
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* 1. Sticky Header */}
      <div className="flex items-center justify-between p-4 z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-md active:scale-90 transition-all"
        >
          <X className="w-6 h-6" />
        </button>
        
        <div className="flex items-center gap-2 text-white bg-white/10 px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
          <Zap className="w-4 h-4 text-warning fill-warning" />
          <span className="text-xs font-black uppercase tracking-widest">Auto OCR Engine</span>
        </div>

        <button 
          onClick={() => setFlash(!flash)}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all",
            flash ? "bg-warning text-black" : "bg-white/10 text-white"
          )}
        >
          {flash ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
        </button>
      </div>

      {/* 2. Main Camera Area */}
      <div className="flex-1 relative flex flex-col justify-center">
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
              
              {/* Scan Guide */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="w-full aspect-[3/4] max-w-sm border-2 border-white/20 rounded-[2rem] relative overflow-hidden">
                  {/* Corner Accents */}
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-3xl m-[-2px]" />
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-3xl m-[-2px]" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-3xl m-[-2px]" />
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-3xl m-[-2px]" />
                  
                  {/* Scanning Line Animation */}
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent top-0 animate-scan-line shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white text-[10px] font-black uppercase tracking-[0.2em] opacity-40 bg-black/20 px-4 py-2 rounded-full backdrop-blur-sm">
                      Position bill within frame
                    </p>
                  </div>
                </div>
              </div>

              {/* Blurry Warning */}
              <AnimatePresence>
                {isBlurry && (
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-destructive text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-glow whitespace-nowrap"
                  >
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    IMAGE UNCLEAR - RETAKE
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {step === 'preview' && image && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="absolute inset-0 bg-black flex flex-col"
            >
              <img src={image} alt="Scanned Bill" className={cn(
                "object-contain w-full h-full transition-all duration-1000",
                isProcessing && "scale-110 opacity-50 blur-sm"
              )} />
              
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-30">
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <Zap className="w-8 h-8 text-primary fill-primary animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter italic">Extracting Data</h3>
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest max-w-xs">AI is reading supplier & line items...</p>
                </div>
              )}
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-primary flex flex-col items-center justify-center text-primary-foreground p-6 z-40"
            >
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-8 animate-bounce">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-black italic tracking-tighter mb-2">GOT IT!</h2>
              <p className="text-center font-bold uppercase tracking-widest opacity-80 text-sm">Reviewing extracted details...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Footer Controls */}
      <div className="p-8 pb-12 z-20 bg-gradient-to-t from-black to-transparent">
        {step === 'camera' && (
          <div className="flex items-center justify-between max-w-sm mx-auto">
            <button className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md active:scale-90 transition-all">
              <ImagePlus className="w-6 h-6" />
            </button>
            
            <button 
              onClick={capture}
              className="w-20 h-20 rounded-full border-[6px] border-white/20 flex items-center justify-center p-1 group"
            >
              <div className="w-full h-full bg-white rounded-full transition-all group-active:scale-90 group-hover:scale-95 shadow-glow" />
            </button>

            <div className="w-12" /> {/* Spacer */}
          </div>
        )}

        {step === 'preview' && !isProcessing && (
          <div className="flex flex-col gap-4 max-w-sm mx-auto">
            <button 
              onClick={processImage}
              className="w-full py-5 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow text-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <Zap className="w-5 h-5 fill-current" />
              Process Bill
            </button>
            <button 
              onClick={retake}
              className="w-full py-4 rounded-2xl bg-white/10 text-white font-black uppercase tracking-widest text-xs backdrop-blur-md active:bg-white/20 transition-all"
            >
              Retake Photo
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan-line {
          0% { top: 0% }
          100% { top: 100% }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
      ` }} />
    </div>
  )
}
