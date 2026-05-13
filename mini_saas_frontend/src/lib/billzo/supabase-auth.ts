"use client"

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export function isSupabaseAuthConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.length > 10 && supabaseAnonKey.length > 10)
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}

export function useSupabaseAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setIsReady(true)
  }, [])

  const signInWithEmail = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (!isReady) {
      return { success: false, error: 'Auth not ready. Please wait.' }
    }
    if (!isSupabaseAuthConfigured()) {
      return { success: false, error: 'Supabase Auth is not configured.' }
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: sbError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (sbError) {
        const msg = sbError.message
        if (msg.includes('Invalid login credentials')) {
          return { success: false, error: 'Invalid email or password.' }
        }
        if (msg.includes('Email not confirmed')) {
          return { success: false, error: 'Please verify your email address before logging in.' }
        }
        return { success: false, error: msg }
      }

      return {
        success: true,
        userId: data.user?.id,
        email: data.user?.email,
        name: data.user?.user_metadata?.full_name || data.user?.email?.split('@')[0],
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to sign in' }
    } finally {
      setLoading(false)
    }
  }, [isReady])

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    name: string
  ): Promise<{ success: boolean; userId?: string; email?: string | null; name?: string | null; error?: string }> => {
    if (!isReady) {
      return { success: false, error: 'Auth not ready.' }
    }
    if (!isSupabaseAuthConfigured()) {
      return { success: false, error: 'Supabase Auth is not configured.' }
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: sbError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (sbError) {
        const msg = sbError.message
        if (msg.includes('already')) {
          return { success: false, error: 'This email is already in use. Try logging in instead.' }
        }
        return { success: false, error: msg }
      }

      if (data.user && !data.session) {
        return {
          success: true,
          userId: data.user.id,
          email: data.user.email,
          name: name,
        }
      }

      return {
        success: true,
        userId: data.user?.id,
        email: data.user?.email,
        name: data.user?.user_metadata?.full_name || name,
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to sign up' }
    } finally {
      setLoading(false)
    }
  }, [isReady])

  const signInWithGoogle = useCallback(async (): Promise<{
    success: boolean
    userId?: string
    email?: string | null
    name?: string | null
    error?: string
  }> => {
    if (!isReady) {
      return { success: false, error: 'Auth not ready.' }
    }
    if (!isSupabaseAuthConfigured()) {
      return { success: false, error: 'Supabase Auth is not configured.' }
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: sbError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      })

      if (sbError) {
        return { success: false, error: sbError.message }
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to sign in with Google' }
    } finally {
      setLoading(false)
    }
  }, [isReady])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
  }, [])

  const getSession = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session
  }, [])

  return {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    getSession,
    loading,
    error,
    isConfigured: isSupabaseAuthConfigured() && isReady,
    clearError: () => setError(null),
  }
}