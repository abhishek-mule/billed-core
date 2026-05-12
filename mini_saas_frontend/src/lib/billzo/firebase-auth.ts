"use client";

import { useState, useEffect, useCallback } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
}

const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.length > 10 &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your_project_id'
)

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
        setIsReady(true)
      }
    }
  }, [])

  const isDisposableEmail = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return DISPOSABLE_DOMAINS.includes(domain);
  }

  const signInWithGoogle = useCallback(async (): Promise<{
    success: boolean
    userId?: string
    email?: string | null
    name?: string | null
    error?: string
    pending?: boolean
  }> => {
    if (!isReady) {
      return { success: false, error: 'Authentication system is still initializing. Please wait and try again.' }
    }

    if (!isFirebaseConfigured) {
      return { success: false, error: 'Google Sign-In is not configured. Please add your Firebase API Key and Project ID to .env.local' }
    }

    setLoading(true)
    setError(null)

    try {
      const auth = getAuth()

      await setPersistence(auth, browserLocalPersistence).catch(err => {
        console.warn('Persistence error:', err);
      })

      const pendingResult = await getRedirectResult(auth).catch(() => null)
      if (pendingResult?.user) {
        setLoading(false)
        return {
          success: true,
          userId: pendingResult.user.uid,
          email: pendingResult.user.email,
          name: pendingResult.user.displayName || pendingResult.user.email?.split('@')[0],
        }
      }

      const provider = new GoogleAuthProvider()
      provider.addScope('email')
      provider.addScope('profile')

      await signInWithRedirect(auth, provider)
      setLoading(false)
      return { success: false, pending: true }
    } catch (err: any) {
      setLoading(false)
      console.error('Google sign-in error:', err)

      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is not enabled. Please enable it in your Firebase console.')
        return { success: false, error: 'Google Sign-In is not enabled in Firebase console.' }
      }
      if (err.code === 'auth/no-auth-event') {
        return { success: false, error: 'No authentication event found.' }
      }
      if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection.')
        return { success: false, error: 'Network error. Please try again.' }
      }
      if (err.code === 'auth/user-disabled') {
        return { success: false, error: 'This account has been disabled.' }
      }

      const errorMsg = err.message || 'Failed to sign in with Google'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }, [isReady])

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (!isReady) {
      return { success: false, error: 'Auth not ready' }
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
        name: name || result.user.displayName,
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
    if (!isReady) {
      return { success: false, error: 'Auth not ready' }
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
        name: result.user.displayName || result.user.email?.split('@')[0],
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
    clearError: () => setError(null),
  }
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured
}