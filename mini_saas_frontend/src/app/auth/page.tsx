"use client"

import { Suspense } from "react"
import { SignInPage } from "@/components/ui/sign-in"

function FontFaces() {
  return (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,450;9..144,560;9..144,650&family=Inter:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Fraunces', ui-serif, Georgia, serif; font-feature-settings: 'ss01' 1; }
    `}</style>
  )
}

function LoginSkeleton() {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] mx-6 space-y-4 animate-pulse">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-muted" />
        </div>
        <div className="h-8 w-52 mx-auto bg-muted rounded" />
        <div className="h-4 w-72 mx-auto bg-muted rounded" />
        <div className="space-y-3 pt-4">
          <div className="h-14 bg-muted rounded-2xl" />
          <div className="h-14 bg-muted rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="bg-background text-foreground">
      <FontFaces />
      <Suspense fallback={<LoginSkeleton />}>
        <SignInPage
          title={
            <span className="font-display font-semibold text-foreground tracking-tight">
              Welcome back
            </span>
          }
          description="Sign in with a magic link — no passwords to remember."
          heroImageSrc="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80"
        />
      </Suspense>
    </div>
  )
}