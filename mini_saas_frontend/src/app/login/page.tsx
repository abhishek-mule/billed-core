"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Shield, Zap, Phone, Mail, User } from "lucide-react";
import { useSupabaseAuth } from "@/lib/billzo/supabase-auth";
import { trackEvent, events } from "@/lib/billzo/analytics";

type AuthMode = "phone" | "email" | "google";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

function getUserIdFromCookie() {
  const token = getCookie("bz_access");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId || null;
  } catch {
    return null;
  }
}

async function handlePostAuthRedirect() {
  const userId = getUserIdFromCookie();
  const tenantId = getCookie("bz_tenant");
  if (!userId) {
    window.location.href = "/login";
    return;
  }
  try {
    const response = await fetch("/api/onboarding/check", {
      headers: {
        "x-user-id": userId,
        "x-tenant-id": tenantId || "",
      },
    });
    if (!response.ok || response.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await response.json();
    switch (data.state) {
      case "NO_TENANT":
      case "TENANT_NO_PLAN":
        window.location.href = "/onboarding";
        break;
      case "ACTIVE":
        window.location.href = "/dashboard";
        break;
      default:
        window.location.href = "/dashboard";
    }
  } catch {
    window.location.href = "/login";
  }
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mode, setMode] = useState<AuthMode>("phone");

  // Phone state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Email state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const [loading, setLoading] = useState(false);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useSupabaseAuth();

  useEffect(() => {
    const accessToken = getCookie("bz_access");
    const tenantId = getCookie("bz_tenant");
    if (accessToken && tenantId) {
      handlePostAuthRedirect();
    }
  }, []);

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        result = await signUpWithEmail(email, password, name);
        if (!result.success) {
          setError(result.error || "Sign up failed");
          setLoading(false);
          return;
        }
        setSuccessMsg("Account created! Please check your email to verify.");
        setIsSignUp(false);
        setLoading(false);
        return;
      } else {
        result = await signInWithEmail(email, password);
        if (!result.success) {
          setError(result.error || "Sign in failed");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/auth/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Login failed");

        trackEvent(result.userId!, events.login_email, {});
        handlePostAuthRedirect();
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        if (result.error?.includes("cancelled")) {
          setLoading(false);
          return;
        }
        throw new Error(result.error || "Google sign-in failed");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
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
      if (!response.ok) throw new Error(data.error || "Failed to send OTP");
      setSuccessMsg(data.message || "OTP sent successfully");
      setPhoneStep("otp");
      setOtpCountdown(60);
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
    setLoading(true);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invalid OTP");
      trackEvent(data.userId, events.login_phone, { phone });
      handlePostAuthRedirect();
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.");
      setLoading(false);
    }
  };

  const handleModeSwitch = (newMode: AuthMode) => {
    setMode(newMode);
    setError("");
    setSuccessMsg("");
  };

  const tabs = [
    { key: "phone" as AuthMode, label: "Phone", icon: Phone },
    { key: "email" as AuthMode, label: "Email", icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left panel */}
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
            {[
              { icon: Zap, text: "Instant invoice creation" },
              { icon: MessageCircle, text: "Automated WhatsApp reminders" },
              { icon: Shield, text: "Secure & encrypted data" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-4 text-slate-300">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col">
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <img src="/logo_new.png" alt="BillZo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-slate-900">BillZo</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-6">
            {/* Header */}
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === "phone"
                  ? "Welcome to BillZo"
                  : isSignUp
                  ? "Create your account"
                  : "Sign in to your account"}
              </h2>
              <p className="mt-1 text-slate-500">
                {mode === "phone" ? "Sign in or sign up with your phone" : "Enter your credentials to continue"}
              </p>
            </div>

            {/* Alerts */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>
            )}
            {successMsg && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm">{successMsg}</div>
            )}

            {/* Tab switcher (hidden on mobile, shown on lg) */}
            <div className="hidden lg:flex bg-slate-100 rounded-xl p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleModeSwitch(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    mode === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mobile tab switcher */}
            <div className="lg:hidden flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleModeSwitch(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    mode === tab.key
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Phone auth */}
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
                      disabled={!phone}
                      className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                    >
                      Send OTP
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Enter OTP sent to +91 {phone}
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
                      className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                      Verify & Continue
                    </button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setPhoneStep("phone"); setOtp(""); }}
                        className="text-sm text-indigo-600 font-medium hover:underline"
                      >
                        Change phone number
                      </button>
                    </div>
                    {otpCountdown > 0 && (
                      <p className="text-center text-sm text-slate-500">Resend OTP in {otpCountdown}s</p>
                    )}
                  </form>
                )}
              </>
            )}

            {/* Email auth */}
            {mode === "email" && (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {isSignUp ? "Create Account" : "Sign In"}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="text-sm text-indigo-600 font-medium hover:underline"
                  >
                    {isSignUp
                      ? "Already have an account? Sign in"
                      : "Don't have an account? Sign up"}
                  </button>
                </div>
              </form>
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleSignIn}
              type="button"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? (
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