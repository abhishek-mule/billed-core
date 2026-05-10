"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Shield, Zap, Mail, Lock, User } from "lucide-react";
import { useFirebaseAuth } from "@/lib/billzo/firebase-auth";
import { db } from "@/lib/billzo/db";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resendVerification, isConfigured, loading } = useFirebaseAuth();

  useEffect(() => {
    const accessToken = sessionStorage.getItem("accessToken");
    const tenantId = localStorage.getItem("tenantId");
    
    if (accessToken && tenantId) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleBackendAuth = async (result: any) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: result.email, 
        uid: result.userId, 
        name: result.name 
      }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Login failed via API");
    }

    // Check offline DB for existing tenant
    const existingTenant = await db().tenants
      .filter(t => t.ownerUserId === result.userId || (t as any).email === result.email)
      .first();

    const uid = result.userId;
    
    sessionStorage.setItem("accessToken", data.accessToken);
    sessionStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("userId", uid);
    localStorage.setItem("isPaid", existingTenant ? (existingTenant.plan === 'pro' ? "true" : "false") : data.isPaid?.toString() || "false");

    if (existingTenant) {
      localStorage.setItem("tenantId", existingTenant.id);
      localStorage.setItem("tenantName", existingTenant.name);
      
      import("@/lib/billzo/notifications").then(m => m.registerDevice(existingTenant.id));
      router.push("/dashboard");
    } else {
      const newTenantId = data.tenantId || `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const shopName = result.name ? `${result.name}'s Shop` : `Shop ${Date.now().toString().slice(-4)}`;
      
      await db().tenants.add({
        id: newTenantId,
        name: shopName,
        ownerUserId: uid,
        plan: "starter",
        paywallUnlocked: true,
        invoiceCount: 0,
        reminderCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      localStorage.setItem("tenantId", newTenantId);
      localStorage.setItem("tenantName", shopName);

      import("@/lib/billzo/notifications").then(m => m.registerDevice(newTenantId));
      router.push("/dashboard");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSuccessMsg("");
    
    try {
      const result = await signInWithGoogle();
      
      if (!result.success || !result.email || !result.userId) {
        throw new Error(result.error || "Failed to sign in");
      }

      await handleBackendAuth(result);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    try {
      if (mode === "signup") {
        if (!name) {
          setError("Please enter your name");
          return;
        }
        const result = await signUpWithEmail(email, password, name);
        if (!result.success) {
          throw new Error(result.error || "Failed to create account");
        }
        
        // Account created, but email verification required
        setMode("login");
        setSuccessMsg("Account created! Please check your email to verify your account before logging in.");
        setPassword("");
        
      } else {
        const result = await signInWithEmail(email, password);
        
        if (result.needsVerification) {
          setError(result.error || "Please verify your email address.");
          return;
        }
        
        if (!result.success || !result.email || !result.userId) {
          throw new Error(result.error || "Failed to sign in");
        }

        await handleBackendAuth(result);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    }
  };

  const features = [
    { icon: Zap, text: "Instant invoice creation" },
    { icon: MessageCircle, text: "Automated WhatsApp reminders" },
    { icon: Shield, text: "Secure & encrypted data" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative">
          <div className="flex items-center gap-3">
            <img src="/logo_new.png" alt="BillZo" className="w-12 h-12 object-contain" />
            <span className="text-2xl font-bold text-white">BillZo</span>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Get paid faster with<br />
              <span className="text-indigo-400">automated reminders</span>
            </h1>
            <p className="mt-4 text-slate-400 text-lg max-w-md">
              Send professional invoices and follow up automatically. 
              Never lose track of pending payments again.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-4 text-slate-300">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-slate-500 text-sm">
          {!isConfigured && (
            <span className="bg-yellow-600/20 text-yellow-400 px-3 py-1 rounded text-xs">
              Demo Mode - Firebase not configured
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <img src="/logo_new.png" alt="BillZo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-slate-900">BillZo</span>
          </div>
          {!isConfigured && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Demo</span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === "login" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="mt-2 text-slate-500">
                {mode === "login" 
                  ? "Sign in to continue to your dashboard" 
                  : "Start managing your business today"}
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
                {error.includes("verify your email") && (
                  <button 
                    onClick={() => resendVerification(email, password)}
                    className="ml-2 underline font-semibold hover:text-red-700"
                  >
                    Resend link
                  </button>
                )}
              </div>
            )}
            
            {successMsg && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm">
                {successMsg}
              </div>
            )}

            <button
              onClick={handleGoogleSignIn}
              type="button"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl hover:bg-slate-50 transition-colors font-medium"
            >
              {loading && !email ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {loading && email ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  mode === "login" ? "Sign In" : "Create Account"
                )}
              </button>
            </form>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                  setSuccessMsg("");
                }}
                className="text-sm text-indigo-600 font-medium hover:underline"
              >
                {mode === "login" 
                  ? "Don't have an account? Sign up" 
                  : "Already have an account? Sign in"}
              </button>
            </div>

            <p className="text-center text-xs text-slate-400 pt-4">
              {!isConfigured ? (
                <>Demo: Click to sign in automatically</>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}