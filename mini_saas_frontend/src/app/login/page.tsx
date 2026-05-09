"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, MessageCircle, Shield, Zap } from "lucide-react";

type Step = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [resend, setResend] = useState(30);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const accessToken = sessionStorage.getItem("accessToken");
    const tenantId = localStorage.getItem("tenantId");
    
    if (accessToken && tenantId) {
      router.push("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setResend((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  };

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setStep("otp");
      setResend(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError("Unable to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((d) => d) && next.join("").length === 6) verifyOtp(next.join(""));
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const verifyOtp = async (code: string) => {
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone: phone.replace(/\D/g, ""), 
          otp: code 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      sessionStorage.setItem("accessToken", data.accessToken);
      sessionStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("tenantId", data.tenantId || "");
      localStorage.setItem("isPaid", data.isPaid ? "true" : "false");
      
      setLoading(false);
      setOtp(["", "", "", "", "", ""]);
      
      if (!data.tenantId) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }

    } catch (err: any) {
      setLoading(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      setError(err.message || "Invalid code. Please try again.");
    }
  };

  const features = [
    { icon: Zap, text: "Instant invoice creation" },
    { icon: MessageCircle, text: "Automated WhatsApp reminders" },
    { icon: Shield, text: "Secure & encrypted data" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
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
          © 2025 BillZo. All rights reserved.
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900">BillZo</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            {step === "phone" ? (
              <div className="space-y-8">
                <div className="text-center lg:text-left">
                  <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
                  <p className="mt-2 text-slate-500">Enter your phone number to continue</p>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Number
                    </label>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                      <span className="text-slate-500 font-medium">+91</span>
                      <span className="h-5 w-px bg-slate-200"></span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => { setPhone(formatPhone(e.target.value)); setError(""); }}
                        placeholder="98765 43210"
                        className="flex-1 bg-transparent text-slate-900 font-medium outline-none placeholder:text-slate-400"
                        onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || phone.replace(/\D/g, "").length !== 10}
                    className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      "Continue"
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-slate-400">
                  Demo: Enter any phone number • OTP: 123456
                </p>
              </div>
            ) : (
              <div className={`space-y-8 ${shake ? "animate-pulse" : ""}`}>
                <div className="text-center">
                  <button 
                    onClick={() => setStep("phone")} 
                    className="lg:hidden mb-4 text-slate-500 flex items-center gap-1 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <h2 className="text-2xl font-bold text-slate-900">Enter verification code</h2>
                  <p className="mt-2 text-slate-500">We sent a code to +91 {phone}</p>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-2 justify-center">
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      autoComplete="one-time-code"
                      value={d}
                      disabled={loading}
                      onChange={(e) => { handleOtpChange(i, e.target.value); setError(""); }}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors"
                    />
                  ))}
                </div>

                <div className="text-center text-sm text-slate-500">
                  {resend > 0 ? (
                    <span>Resend code in <span className="font-medium text-slate-700">{resend}s</span></span>
                  ) : (
                    <button 
                      onClick={() => { setResend(30); setOtp(["", "", "", "", "", ""]); }} 
                      className="text-indigo-600 font-medium hover:underline"
                    >
                      Resend code
                    </button>
                  )}
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                  </div>
                )}

                <p className="text-center text-xs text-slate-400">
                  Demo OTP: <span className="font-mono font-semibold text-slate-600">123456</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}