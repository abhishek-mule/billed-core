'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'otp' | 'creating'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phone.length < 10) {
      setError('Enter a valid 10-digit number')
      return
    }
    setError('')
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      setStep('otp')
    }, 600)
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 4) {
      setError('Enter complete OTP')
      return
    }
    setError('')
    setIsLoading(true)
    // Simulate verification
    setTimeout(() => {
      setStep('creating')
      // Simulate account/tenant auto-creation
      setTimeout(() => {
        localStorage.setItem('billzo_token', 'dummy-jwt-token')
        localStorage.setItem('billzo_onboarded', 'false') // Track if first action performed
        router.push('/dashboard')
      }, 1000)
    }, 600)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-glow">
            B
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {step === 'phone' && 'Welcome to BillZo'}
            {step === 'otp' && 'Verify your number'}
            {step === 'creating' && 'Setting up your workspace'}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {step === 'phone' && 'Enter your phone number to get started'}
            {step === 'otp' && `We sent a code to +91 ${phone}`}
            {step === 'creating' && 'This will only take a second...'}
          </p>
        </div>

        <div className="card-base p-6 md:p-8">
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handlePhoneSubmit}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex rounded-xl overflow-hidden border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background transition-base">
                    <span className="flex items-center justify-center px-4 bg-muted text-muted-foreground font-medium border-r border-input">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile Number"
                      className="flex-1 bg-transparent px-4 py-3 outline-none text-lg tracking-wide font-medium"
                      autoFocus
                    />
                  </div>
                  {error && <p className="text-sm text-destructive font-medium animate-shake">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={isLoading || phone.length < 10}
                  className="btn-base w-full py-3.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-elegant text-base font-semibold"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue'}
                  {!isLoading && <ArrowRight className="w-5 h-5 ml-2 opacity-80" />}
                </button>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleOtpSubmit}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter OTP"
                    className="input-base text-center text-2xl tracking-[0.5em] font-bold h-14"
                    autoFocus
                  />
                  {error && <p className="text-sm text-destructive font-medium animate-shake text-center">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={isLoading || otp.length < 4}
                  className="btn-base w-full py-3.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-elegant text-base font-semibold"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Login'}
                </button>
                <div className="text-center">
                  <button type="button" onClick={() => setStep('phone')} className="text-sm text-muted-foreground hover:text-foreground font-medium">
                    Change phone number
                  </button>
                </div>
              </motion.form>
            )}

            {step === 'creating' && (
              <motion.div
                key="creating"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-8 flex flex-col items-center justify-center space-y-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-success/20 rounded-full animate-ping" />
                  <div className="w-20 h-20 bg-success-soft text-success rounded-full flex items-center justify-center relative z-10 shadow-success">
                    <ShieldCheck className="w-10 h-10" />
                  </div>
                </div>
                <div className="space-y-2 text-center">
                  <p className="font-semibold text-foreground flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    Account Verified
                  </p>
                  <p className="text-sm text-muted-foreground">Preparing your dashboard...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-8">
          By continuing, you agree to BillZo's Terms & Conditions
        </p>
      </div>
    </div>
  )
}
