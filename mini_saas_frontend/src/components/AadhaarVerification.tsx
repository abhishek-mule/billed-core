'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { formatAadhaarNumber } from '@/lib/aadhaar'

interface AadhaarVerificationProps {
  onVerified: (data: {
    aadhaar: string
    name: string
    address: string
  }) => void
  onSkip: () => void
}

export default function AadhaarVerification({ onVerified, onSkip }: AadhaarVerificationProps) {
  const [step, setStep] = useState<'input' | 'otp'>('input')
  const [aadhaarNumber, setAadhaarNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  const formattedAadhaar = formatAadhaarNumber(aadhaarNumber)

  const handleSendOTP = async () => {
    const clean = aadhaarNumber.replace(/\s/g, '')
    if (clean.length !== 12) {
      setError('Please enter valid 12-digit Aadhaar number')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/verify-aadhaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarNumber }),
      })

      const data = await res.json()

      if (data.success) {
        setReferenceId(data.referenceId)
        setStep('otp')
        setResendTimer(30)
        const interval = setInterval(() => {
          setResendTimer((t) => {
            if (t <= 1) {
              clearInterval(interval)
              return 0
            }
            return t - 1
          })
        }, 1000)
      } else {
        setError(data.message || 'Verification failed')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      setError('Please enter 6-digit OTP')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/verify-aadhaar-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceId, otp }),
      })

      const data = await res.json()

      if (data.success && data.verified) {
        const address = data.data?.address
        const fullAddress = address
          ? `${address.houseNumber || ''}, ${address.street || ''}, ${address.vtc || ''}, ${address.district || ''}, ${address.state || ''} - ${address.pincode || ''}`
          : 'Address verified'

        onVerified({
          aadhaar: data.data?.maskedAadhaar || aadhaarNumber,
          name: data.data?.name || 'Verified User',
          address: fullAddress,
        })
      } else {
        setError(data.message || 'Verification failed')
        if (data.message?.includes('expired')) {
          setStep('input')
          setOtp('')
        }
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setOtp('')
    await handleSendOTP()
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold">Verify with Aadhaar</h3>
        <p className="text-gray-400 text-sm mt-2">
          KYC verification builds trust and enables secure transactions
        </p>
      </div>

      {step === 'input' ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium mb-2">Aadhaar Number</label>
            <input
              type="text"
              value={formattedAadhaar}
              onChange={(e) => {
                const formatted = formatAadhaarNumber(e.target.value)
                setAadhaarNumber(formatted)
                setError('')
              }}
              placeholder="1234 5678 9012"
              maxLength={14}
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition text-lg tracking-widest text-center"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              OTP will be sent to your Aadhaar registered mobile
            </p>
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleSendOTP}
            disabled={loading || aadhaarNumber.replace(/\s/g, '').length !== 12}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending OTP...
              </span>
            ) : (
              'Send OTP'
            )}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-950 text-gray-500">or</span>
            </div>
          </div>

          <button
            onClick={onSkip}
            className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition text-gray-400"
          >
            Skip for now
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              Enter 6-digit OTP sent to your Aadhaar registered mobile
            </p>
            <p className="text-xs text-gray-600 mb-4">
              Aadhaar: {aadhaarNumber.slice(0, 4)} XXXX XXXX {aadhaarNumber.slice(-4)}
            </p>
            <p className="text-xs text-indigo-400 mb-4">
              Test OTP: <span className="font-mono bg-gray-800 px-2 py-1 rounded">123456</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Enter OTP</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                setOtp(digits)
                setError('')
              }}
              placeholder="● ● ● ● ● ●"
              maxLength={6}
              className="w-full px-4 py-4 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition text-2xl tracking-[0.5em] text-center font-mono"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleVerifyOTP}
            disabled={loading || otp.length !== 6}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Verifying...
              </span>
            ) : (
              'Verify & Continue'
            )}
          </button>

          <button
            onClick={handleResend}
            disabled={resendTimer > 0}
            className="w-full py-2 text-sm text-gray-400 hover:text-white transition disabled:opacity-50"
          >
            {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
          </button>

          <button
            onClick={() => {
              setStep('input')
              setOtp('')
              setError('')
            }}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Change Aadhaar Number
          </button>
        </motion.div>
      )}

      <div className="flex items-start gap-3 mt-6 p-4 bg-gray-900/50 rounded-lg">
        <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div className="text-xs text-gray-500">
          <p className="text-gray-400 font-medium mb-1">Your data is secure</p>
          <p>Aadhaar verification uses OTP-based e-KYC. We do not store your Aadhaar number. Only verified status is saved for compliance.</p>
        </div>
      </div>
    </div>
  )
}
