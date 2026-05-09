"use client";

import { useState, useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : '',
  authDomain: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN : '',
  projectId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID : '',
  storageBucket: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET : '',
  messagingSenderId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID : '',
  appId: typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID : '',
}

const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10)

const DISPOSABLE_DOMAINS = ['mailinator.com', '10minutemail.com', 'temp-mail.org', 'guerrillamail.com', 'yopmail.com', 'throwawaymail.com'];

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

  const isDisposableEmail = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return DISPOSABLE_DOMAINS.includes(domain);
  }

  const signInWithGoogle = async (): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (!isFirebaseConfigured || !isReady) {
      return { success: true, userId: `demo_${Date.now()}`, email: 'demo@example.com', name: 'Demo User' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      
      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name: result.user.displayName
      }
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Failed to sign in with Google')
      return { success: false, error: err.message }
    }
  }

  const signUpWithEmail = async (email: string, password: string, name: string): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (!isFirebaseConfigured || !isReady) {
      return { success: true, userId: `demo_${Date.now()}`, email, name }
    }

    if (isDisposableEmail(email)) {
      return { success: false, error: 'Please use a permanent email address. Disposable emails are not allowed.' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      const result = await createUserWithEmailAndPassword(auth, email, password)
      
      // Update their display name
      await updateProfile(result.user, { displayName: name });
      
      // Send verification email
      await sendEmailVerification(result.user);
      
      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name
      }
    } catch (err: any) {
      setLoading(false)
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use. Try logging in instead.')
      } else {
        setError(err.message || 'Failed to sign up')
      }
      return { success: false, error: error || err.message }
    }
  }

  const signInWithEmail = async (email: string, password: string): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string; needsVerification?: boolean }> => {
    if (!isFirebaseConfigured || !isReady) {
      return { success: true, userId: `demo_${Date.now()}`, email, name: 'Demo User' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      const result = await signInWithEmailAndPassword(auth, email, password)
      
      // Check if email is verified
      if (!result.user.emailVerified) {
        setLoading(false)
        return { success: false, needsVerification: true, error: 'Please verify your email address before logging in.' }
      }

      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name: result.user.displayName
      }
    } catch (err: any) {
      setLoading(false)
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.')
      } else {
        setError(err.message || 'Failed to sign in')
      }
      return { success: false, error: error || err.message }
    }
  }

  const resendVerification = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const auth = getAuth()
      const result = await signInWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(result.user)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  return {
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    resendVerification,
    loading,
    error,
    isConfigured: isFirebaseConfigured && isReady,
    clearError: () => setError(null),
  }
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured
}