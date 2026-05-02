'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, ShieldCheck, CheckCircle2, Smartphone, Key } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

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
      setError('Invalid Phone Number')
      return
    }
    setError('')
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setStep('otp')
    }, 800)
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 4) {
      setError('Incomplete OTP')
      return
    }
    setError('')
    setIsLoading(true)
    setTimeout(() => {
      setStep('creating')
      setTimeout(() => {
        localStorage.setItem('billzo_token', 'dummy-jwt-token')
        localStorage.setItem('billzo_onboarded', 'false')
        router.push('/dashboard')
      }, 1500)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-primary-foreground">
      <div className="w-full max-w-md space-y-10">
        {/* Logo Section */}
        <div className="text-center space-y-6">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-primary text-primary-foreground rounded-[2rem] flex items-center justify-center text-3xl font-black mx-auto shadow-glow italic"
          >
            B
          </motion.div>
          <div className="space-y-2">
             <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase italic">
               {step === 'phone' && 'Command Entry'}
               {step === 'otp' && 'Auth Protocol'}
               {step === 'creating' && 'Initializing'}
             </h1>
             <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
               {step === 'phone' && 'Access your business engine'}
               {step === 'otp' && `Verifying +91 ${phone}`}
               {step === 'creating' && 'Provisioning merchant workspace'}
             </p>
          </div>
        </div>

        {/* Action Card */}
        <div className="card-base p-8 border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-glow" />
           
           <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form
                key="phone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handlePhoneSubmit}
                className="space-y-6"
              >
                <Input 
                  type="tel"
                  placeholder="Mobile Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  icon={<Smartphone className="w-5 h-5" />}
                  error={error}
                  autoFocus
                />
                <Button 
                  type="submit" 
                  fullWidth 
                  size="xl" 
                  loading={isLoading}
                  icon={<ArrowRight className="w-5 h-5" />}
                >
                  Send OTP
                </Button>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.form
                key="otp"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleOtpSubmit}
                className="space-y-6"
              >
                <Input 
                  type="text"
                  placeholder="Verification Code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  icon={<Key className="w-5 h-5" />}
                  error={error}
                  className="text-center tracking-[0.8em]"
                  autoFocus
                />
                <Button 
                  type="submit" 
                  fullWidth 
                  size="xl" 
                  variant="success"
                  loading={isLoading}
                  icon={<ShieldCheck className="w-5 h-5" />}
                >
                  Verify Access
                </Button>
                <button 
                  type="button" 
                  onClick={() => setStep('phone')} 
                  className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors text-center"
                >
                  Change Phone Number
                </button>
              </motion.form>
            )}

            {step === 'creating' && (
              <motion.div
                key="creating"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-10 flex flex-col items-center justify-center space-y-8"
              >
                <div className="relative">
                   <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                   <div className="w-24 h-24 bg-primary text-primary-foreground rounded-[2.5rem] flex items-center justify-center relative z-10 shadow-glow">
                      <Loader2 className="w-10 h-10 animate-spin" />
                   </div>
                </div>
                <div className="text-center space-y-2">
                   <p className="text-sm font-black uppercase tracking-widest text-foreground">Syncing Database...</p>
                   <p className="text-[10px] font-bold text-muted-foreground uppercase animate-pulse">Allocating RLS Policies</p>
                </div>
              </motion.div>
            )}
           </AnimatePresence>
        </div>
        
        <div className="text-center">
           <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40 leading-relaxed">
             Secure Multi-Tenant Authentication Protocol<br/>
             Authorized Merchant Access Only
           </p>
        </div>
      </div>
    </div>
  )
}
