"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Shield, Zap, Phone, Lock, Eye, EyeOff } from "lucide-react";
import { useFirebaseAuth } from "@/lib/billzo/firebase-auth";
import { db } from "@/lib/billzo/db";

type AuthMode = "google" | "phone" | "email";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [mode, setMode] = useState<AuthMode>("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const { signInWithGoogle, signInWithEmail, signUpWithEmail, isConfigured, loading } = useFirebaseAuth();

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    const tenantId = localStorage.getItem("tenantId");

    if (accessToken && tenantId) {
      checkOnboardingAndRedirect();
    }
  }, []);

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const checkOnboardingAndRedirect = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const tenantId = localStorage.getItem("tenantId");

      if (!userId) {
        return
      }

      const response = await fetch("/api/onboarding/check", {
        headers: {
          "x-user-id": userId,
          "x-tenant-id": tenantId || "",
        },
      });

      if (!response.ok) {
        router.push("/onboarding");
        return
      }

      const data = await response.json();

      switch (data.state) {
        case "NO_TENANT":
          router.push("/onboarding");
          break
        case "TENANT_NO_PLAN":
          if (data.paywall?.blocked) {
            router.push("/pricing")
          } else {
            router.push("/dashboard")
          }
          break
        case "ACTIVE":
          router.push("/dashboard");
          break
        default:
          router.push("/dashboard")
      }
    } catch (err) {
      console.error("Onboarding check failed:", err)
      router.push("/dashboard")
    }
  };

  const handleBackendAuth = async (userData: { email?: string; userId: string; name?: string; phone?: string }) => {
    setAuthLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userData.email,
          uid: userData.userId,
          name: userData.name,
          phone: userData.phone,
        }),
      });

      const data = await response.json();
      console.log('/api/auth/login response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.error || "Login failed via API");
      }

      const uid = userData.userId;

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("userId", uid);
      localStorage.setItem("isPaid", data.isPaid ? "true" : "false");

      const existingTenant = await db().tenants
        .filter(t => t.ownerUserId === uid || (t as any).email === userData.email)
        .first();

      if (existingTenant) {
        localStorage.setItem("tenantId", existingTenant.id);
        localStorage.setItem("tenantName", existingTenant.name);
      }

      console.log('Navigating to /onboarding...');
      setAuthLoading(false);
      router.push("/onboarding");
      return;
    } catch (err: any) {
      setAuthLoading(false);
      console.error('handleBackendAuth error:', err);
      setError(err.message || "Something went wrong.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSuccessMsg("");
    setGoogleLoading(true);

    try {
      console.log('Starting Google sign-in...');
      const result = await signInWithGoogle();
      console.log('Google sign-in result:', result);

      setGoogleLoading(false);

      if (!result.success) {
        throw new Error(result.error || "Failed to sign in with Google");
      }

      if (!result.userId) {
        throw new Error("No user ID returned");
      }

      await handleBackendAuth({
        email: result.email || 'demo@example.com',
        userId: result.userId,
        name: result.name || undefined,
      });
    } catch (err: any) {
      setGoogleLoading(false);
      console.error('Google sign-in error:', err);
      setError(err.message || "Something went wrong.");
    }
  };

  const handleSendOTP = async () => {
    setError("");
    const cleanedPhone = phone.replace(/\D/g, "");

    if (cleanedPhone.length < 10) {
      setError("Please enter a valid phone number");
      return;
    }

    try {
      const response = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanedPhone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      setOtpSent(true);
      setPhoneStep("otp");
      setOtpCountdown(60);
      setSuccessMsg(data.message || "OTP sent successfully");
    } catch (err: any) {
      setError(err.message || "Failed to send OTP. Please try again.");
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) {
      setError("Please enter a 6-digit OTP");
      return;
    }

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid OTP");
      }

      await handleBackendAuth({
        userId: data.userId,
        phone: data.phone,
      });
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.");
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
      const result = await signInWithEmail(email, password);

      if (result.needsVerification) {
        setError(result.error || "Please verify your email address.");
        return;
      }

      if (!result.success || !result.email || !result.userId) {
        throw new Error(result.error || "Failed to sign in");
      }

      await handleBackendAuth({
        email: result.email,
        userId: result.userId,
      });
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
                {mode === "phone" ? "Welcome to BillZo" : "Sign in to your account"}
              </h2>
              <p className="mt-2 text-slate-500">
                {mode === "phone"
                  ? phoneStep === "phone"
                    ? "Enter your phone number to get started"
                    : "Enter the OTP sent to your phone"
                  : "Choose your preferred sign-in method"}
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm">
                {successMsg}
              </div>
            )}

            {mode === "phone" && (
              <>
                {phoneStep === "phone" ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                      <div className="relative">
                        <Phone className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSendOTP}
                      disabled={!phone || loading}
                      className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Send OTP"
                      )}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Enter OTP sent to {phone}
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="_ _ _ _ _ _"
                        maxLength={6}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-center text-2xl tracking-widest"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={otp.length !== 6 || loading}
                      className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Verify & Continue"
                      )}
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneStep("phone");
                          setOtp("");
                          setOtpSent(false);
                        }}
                        className="text-sm text-indigo-600 font-medium hover:underline"
                      >
                        Change phone number
                      </button>
                    </div>

                    {otpCountdown > 0 && (
                      <p className="text-center text-sm text-slate-500">
                        Resend OTP in {otpCountdown}s
                      </p>
                    )}
                  </form>
                )}
              </>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

<button
                  onClick={handleGoogleSignIn}
                  type="button"
                  disabled={googleLoading || authLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                >
                  {googleLoading || authLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google Account
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
