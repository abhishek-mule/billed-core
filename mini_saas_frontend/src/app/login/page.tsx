"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";

type Step = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [resend, setResend] = useState(24);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  const handleSendOtp = () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      alert("Enter a valid 10-digit number");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("otp");
      setResend(24);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    }, 700);
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

  const verifyOtp = (code: string) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (code === "000000") {
        setShake(true);
        setTimeout(() => setShake(false), 350);
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        alert("Wrong code. Try again.");
        return;
      }
      localStorage.setItem("tenantId", "demo-tenant-001");
      localStorage.setItem("businessName", phone || "My Business");
      router.push("/dashboard");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex flex-col">
      <header className="container py-5 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-xl text-white">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-indigo-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <span>BillZo</span>
        </div>
        {step === "otp" && (
          <button onClick={() => setStep("phone")} className="text-sm text-white/80 inline-flex items-center gap-1 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
      </header>

      <div className="flex-1 grid place-items-center px-4 pb-16">
        <div className="w-full max-w-md">
          {step === "phone" ? (
            <div className="rounded-2xl border border-white/20 bg-white/95 backdrop-blur p-7 shadow-xl">
              <h1 className="text-2xl font-bold tracking-tight">Welcome to BillZo</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Enter your phone to continue.</p>

              <label className="mt-7 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</label>
              <div className="mt-2 flex items-center gap-2 rounded-xl border-2 border-input bg-background px-4 py-3 focus-within:border-primary">
                <span className="text-base font-semibold text-muted-foreground">+91</span>
                <span className="h-5 w-px bg-border" />
                <input
                  inputMode="numeric"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="98765 43210"
                  className="flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/50"
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </div>

              <button
                onClick={handleSendOtp}
                disabled={loading}
                className="mt-6 w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>

              <p className="mt-5 text-xs text-center text-muted-foreground">
                Demo: enter any phone, OTP = 123456
              </p>
            </div>
          ) : (
            <div className={`rounded-2xl border border-white/20 bg-white/95 backdrop-blur p-7 shadow-xl ${shake ? "animate-pulse" : ""}`}>
              <h1 className="text-2xl font-bold tracking-tight">Enter the 6-digit code</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Sent to +91 {phone}</p>

              <div className="mt-7 flex gap-2 justify-between">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-14 w-12 text-center text-2xl font-bold rounded-xl border-2 border-input focus:border-indigo-600 focus:outline-none"
                  />
                ))}
              </div>

              <div className="mt-6 text-sm text-center">
                {resend > 0 ? (
                  <span className="text-muted-foreground">Resend in {resend}s</span>
                ) : (
                  <button onClick={() => { setResend(24); setOtp(["", "", "", "", "", ""]); }} className="text-indigo-600 font-medium hover:underline">
                    Resend code
                  </button>
                )}
              </div>

              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                </div>
              )}

              <p className="mt-5 text-xs text-center text-muted-foreground">
                Tip: enter <span className="font-mono font-semibold">000000</span> to see error state
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}