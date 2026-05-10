"use client";

import { useState, useEffect, useCallback } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth'

// Check if Firebase is properly configured
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const isFirebaseConfigured = !!(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.length > 10 &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your_project_id'
)

// Demo mode - when Firebase is not configured
const DEMO_MODE = !isFirebaseConfigured

const DISPOSABLE_DOMAINS = ['mailinator.com', '10minutemail.com', 'temp-mail.org', 'guerrillamail.com', 'yopmail.com', 'throwawaymail.com'];

export function useFirebaseAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isFirebaseConfigured) {
        try {
          if (!getApps().length) {
            initializeApp(firebaseConfig)
          }
          setIsReady(true)
        } catch (e) {
          console.error('Firebase init error:', e)
          setIsReady(false)
        }
      } else {
        setIsReady(true) // Demo mode is always ready
      }
    }
  }, [])

  const isDisposableEmail = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return DISPOSABLE_DOMAINS.includes(domain);
  }

  const signInWithGoogle = useCallback(async (): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    // Demo mode - return mock user
    if (DEMO_MODE || !isReady) {
      console.log('[Demo Mode] Google sign-in simulating...')
      const demoUserId = `demo_${Date.now()}`
      return { 
        success: true, 
        userId: demoUserId, 
        email: 'demo@example.com', 
        name: 'Demo User' 
      }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      
      // Set persistence to browser
      await setPersistence(auth, browserLocalPersistence)
      
      const provider = new GoogleAuthProvider()
      // Add scopes if needed
      provider.addScope('email')
      provider.addScope('profile')
      
      const result = await signInWithPopup(auth, provider)
      
      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name: result.user.displayName || result.user.email?.split('@')[0]
      }
    } catch (err: any) {
      setLoading(false)
      console.error('Google sign-in error:', err)
      
      // Handle specific Firebase auth errors
      if (err.code === 'auth/popup-blocked') {
        setError('Popup was blocked. Please allow popups for this site.')
        return { success: false, error: 'Popup blocked. Please allow popups and try again.' }
      }
      if (err.code === 'auth/cancelled-popup-request') {
        return { success: false, error: 'Sign-in cancelled.' }
      }
      if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection.')
        return { success: false, error: 'Network error. Please try again.' }
      }
      if (err.code === 'auth/user-disabled') {
        return { success: false, error: 'This account has been disabled.' }
      }
      if (err.code === 'auth/invalid-credential') {
        return { success: false, error: 'Invalid credentials. Please try again.' }
      }
      
      const errorMsg = err.message || 'Failed to sign in with Google'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }, [isReady])

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (DEMO_MODE || !isReady) {
      const demoUserId = `demo_${Date.now()}`
      return { success: true, userId: demoUserId, email, name }
    }

    if (isDisposableEmail(email)) {
      return { success: false, error: 'Please use a permanent email address. Disposable emails are not allowed.' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      const result = await createUserWithEmailAndPassword(auth, email, password)
      
      if (name) {
        await updateProfile(result.user, { displayName: name });
      }
      await sendEmailVerification(result.user);
      
      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name: name || result.user.displayName
      }
    } catch (err: any) {
      setLoading(false)
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use. Try logging in instead.')
        return { success: false, error: 'This email is already in use. Try logging in instead.' }
      }
      if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.')
        return { success: false, error: 'Password should be at least 6 characters.' }
      }
      const errorMsg = err.message || 'Failed to sign up'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }, [isReady])

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string; needsVerification?: boolean }> => {
    if (DEMO_MODE || !isReady) {
      const demoUserId = `demo_${Date.now()}`
      return { success: true, userId: demoUserId, email, name: 'Demo User' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()
      const result = await signInWithEmailAndPassword(auth, email, password)
      
      if (!result.user.emailVerified) {
        setLoading(false)
        return { success: false, needsVerification: true, error: 'Please verify your email address before logging in.' }
      }

      setLoading(false)
      return { 
        success: true, 
        userId: result.user.uid,
        email: result.user.email,
        name: result.user.displayName || result.user.email?.split('@')[0]
      }
    } catch (err: any) {
      setLoading(false)
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.')
        return { success: false, error: 'Invalid email or password.' }
      }
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.')
        return { success: false, error: 'No account found with this email.' }
      }
      if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
        return { success: false, error: 'Too many attempts. Please try again later.' }
      }
      const errorMsg = err.message || 'Failed to sign in'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }, [isReady])

  const resendVerification = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const auth = getAuth()
      const result = await signInWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(result.user)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }, [])

  return {
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    resendVerification,
    loading,
    error,
    isConfigured: isFirebaseConfigured && isReady,
    isDemoMode: DEMO_MODE,
    clearError: () => setError(null),
  }
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured
}