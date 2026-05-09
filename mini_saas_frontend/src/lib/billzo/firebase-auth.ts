"use client";

import { useState, useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInWithPhoneNumber, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'

let confirmationResult: ConfirmationResult | null = null

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

const firebaseConfig = {
  apiKey: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : '',
  authDomain: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN : '',
  projectId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID : '',
  storageBucket: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET : '',
  messagingSenderId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID : '',
  appId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID : '',
}

const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10)

export function useFirebaseAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (isFirebaseConfigured && typeof window !== 'undefined') {
      try {
        if (!getApps().length) {
          initializeApp(firebaseConfig)
        }
        setIsReady(true)
      } catch (e) {
        console.error('Firebase init error:', e)
        setIsReady(false)
      }
    }
  }, [])

  const sendOTP = async (phone: string): Promise<{ success: boolean; error?: string }> => {
    if (!isFirebaseConfigured || !isReady) {
      return { success: false, error: 'Firebase not configured - using demo mode' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      
      // Initialize recaptcha verifier if not already done
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
          'expired-callback': () => {
            // Response expired. Ask user to solve reCAPTCHA again.
            window.recaptchaVerifier?.clear();
            window.recaptchaVerifier = null;
          }
        })
      }

      // Format phone number
      const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`

      confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier)
      
      setLoading(false)
      return { success: true }

    } catch (err: any) {
      setLoading(false)
      
      // Handle specific errors
      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number')
      } else if (err.code === 'auth/quota-exceeded') {
        setError('SMS quota exceeded')
      } else {
        setError(err.message || 'Failed to send OTP')
      }
      
      return { success: false, error: err.message }
    }
  }

  const verifyOTP = async (otp: string): Promise<{ success: boolean; userId?: string; error?: string }> => {
    if (!isFirebaseConfigured || !confirmationResult) {
      // Demo mode - accept any 6-digit OTP
      if (otp === '123456' || otp.length === 6) {
        return { success: true, userId: `demo_${Date.now()}` }
      }
      return { success: false, error: 'Invalid OTP' }
    }

    setLoading(true)
    setError(null)

    try {
      const result = await confirmationResult.confirm(otp)
      const userId = result.user.uid
      
      // Clean up
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear()
        window.recaptchaVerifier = null
      }
      confirmationResult = null
      
      setLoading(false)
      return { success: true, userId }

    } catch (err: any) {
      setLoading(false)
      
      if (err.code === 'auth/invalid-verification-code') {
        setError('Invalid OTP')
      } else {
        setError(err.message || 'Verification failed')
      }
      
      return { success: false, error: err.message }
    }
  }

  return {
    sendOTP,
    verifyOTP,
    loading,
    error,
    isConfigured: isFirebaseConfigured && isReady,
    clearError: () => setError(null),
  }
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured
}