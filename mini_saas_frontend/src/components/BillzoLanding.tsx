'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Smartphone, 
  Building2, 
  ArrowRight, 
  Play, 
  ExternalLink, 
  Lock, 
  MessageSquare,
  BarChart3,
  Search,
  Check,
  ChevronRight,
  Shield,
  Clock,
  LayoutDashboard
} from 'lucide-react'

// Constants & Content
const tokens = {
  ink: '#0e0e10',
  inkSoft: '#3d3d45',
  inkMuted: '#7a7a8c',
  surface: '#faf9f7',
  surface2: '#f2f0ec',
  surface3: '#e8e4dc',
  indigo: '#4338ca',
  indigoBright: '#5548f0',
  indigoDeep: '#1e1657',
  indigoPale: '#eeedfb',
  emerald: '#059669',
  emeraldPale: '#d1fae5',
  gold: '#c5a55a',
}

const features = [
  { 
    id: 'billing',
    icon: <Clock className="w-5 h-5" />,
    num: '01 / Fast Billing', 
    title: 'GST invoice in 10 seconds', 
    desc: 'Select customer, add items, send. Auto-calculate CGST, SGST, IGST with HSN codes. Works flawlessly on mobile browsers.',
    detail: 'GST-Compliant / Mobile-First / HSN Lookup'
  },
  { 
    id: 'whatsapp',
    icon: <MessageSquare className="w-5 h-5" />,
    num: '02 / WhatsApp Auto', 
    title: 'Reminders sent automatically', 
    desc: 'Invoice goes to WhatsApp instantly. Automated payment reminders. Daily business summaries. Stop chasing payments.',
    detail: '98% Open Rate / Instant PDF / Auto-Followup'
  },
  { 
    id: 'erp',
    icon: <LayoutDashboard className="w-5 h-5" />,
    num: '03 / ERP Power', 
    title: 'Enterprise accounting hidden', 
    desc: 'Ledgers, GST reports, and inventory management—all running on an enterprise-grade accounting engine while you just bill.',
    detail: 'Ledger-Ready / GST Portal Ready / Secure'
  },
]

const plans = [
  { 
    name: 'Free', 
    price: '0', 
    period: 'Forever', 
    tagline: 'Perfect for small shops starting their digital journey.', 
    features: ['50 invoices/month', 'Basic WhatsApp reminders', 'Mobile-friendly billing', 'GST calculation'], 
    cta: 'Start Free' 
  },
  { 
    name: 'Starter', 
    price: '₹199', 
    period: '/month', 
    tagline: 'For growing retailers who need automation.', 
    features: ['300 invoices/month', 'WhatsApp automation', 'Basic inventory alerts', 'GSTIN live lookup'], 
    popular: true, 
    cta: 'Start Starter' 
  },
  { 
    name: 'Pro', 
    price: '₹499', 
    period: '/month', 
    tagline: 'Full power for high-volume businesses.', 
    features: ['Unlimited invoices', 'Priority WhatsApp support', 'Advanced Analytics', 'Aadhaar KYC credits'], 
    cta: 'Go Pro' 
  },
]

const securityCards = [
  { 
    icon: <Lock className="w-8 h-8 text-indigo-600" />, 
    title: 'Bank-grade Encryption', 
    desc: 'Every piece of data is encrypted at rest and in transit using AES-256 and TLS 1.3 standards.', 
    chip: 'AES-256·TLS 1.3' 
  },
  { 
    icon: <ShieldCheck className="w-8 h-8 text-emerald-600" />, 
    title: 'India Data Residency', 
    desc: 'All your data stays within Indian borders. Fully compliant with DPDP 2023 and MeitY guidelines.', 
    chip: 'DPDP 2023·MeitY' 
  },
  { 
    icon: <Building2 className="w-8 h-8 text-indigo-900" />, 
    title: 'GSTN & UIDAI Certified', 
    desc: 'Live GSTN integration and official UIDAI APIs for Aadhaar verification—zero third-party middlemen.', 
    chip: 'GSTN·UIDAI' 
  },
]

export default function BillZoLanding() {
  const [activeFeature, setActiveFeature] = useState(0)
  const [gstinInput, setGstinInput] = useState('')
  const [gstinResult, setGstinResult] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  
  const showGstinResult = () => {
    if (gstinInput.trim().length >= 5) setGstinResult(true)
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#0e0e10] selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      {/* Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style jsx global>{`
        .font-display { font-family: 'Instrument Serif', Georgia, serif; }
        .font-sans { font-family: 'DM Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .glass { background: rgba(250, 249, 247, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(0,0,0,0.05); }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 30s linear infinite; }
      `}</style>

      {/* NAVIGATION */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${scrolled ? 'py-3 border-b border-black/5 bg-white/90 backdrop-blur-xl' : 'py-6 bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 no-underline group relative z-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display text-xl text-white italic font-medium shadow-lg transition-transform group-hover:scale-105" 
              style={{ background: 'linear-gradient(135deg, #5548f0, #1e1657)' }}>
              Z
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-[#0e0e10]">BillZo</span>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-indigo-600">Sahi Bill. Safe Deal.</span>
            </div>
          </Link>
          
          <div className="hidden lg:flex items-center gap-10">
            {['Features', 'Pricing', 'Security', 'KYC'].map(item => (
              <Link key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-[#3d3d45] hover:text-indigo-600 transition-colors no-underline">
                {item}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link href="/start" className="hidden sm:block text-sm font-semibold text-[#3d3d45] hover:text-[#0e0e10] no-underline">
              Sign In
            </Link>
            <Link href="/start" className="px-6 py-2.5 rounded-full bg-[#5548f0] text-white text-sm font-bold shadow-xl shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all no-underline">
              Start Free Billing
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-44 pb-24 px-6 md:px-12 z-10 overflow-visible">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-50/50 rounded-full blur-[120px] -z-10 translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-50/50 rounded-full blur-[100px] -z-10 -translate-x-1/4 translate-y-1/4" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-8">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              GST Ready · Aadhaar Verified · DPDP Compliant
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold font-display leading-[0.95] tracking-[-0.03em] mb-8">
              Billing that <br />
              <span className="italic text-[#5548f0]">follows up</span><br />
              <span className="relative">
                automatically
                <motion.svg width="100%" height="12" viewBox="0 0 300 12" fill="none" className="absolute -bottom-2 left-0 w-full"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.5 }}>
                  <path d="M2 10C60 4 180 4 298 10" stroke="#c5a55a" strokeWidth="4" strokeLinecap="round" />
                </motion.svg>
              </span>
            </h1>

            <p className="text-xl text-[#3d3d45] leading-relaxed mb-10 max-w-lg font-sans font-light">
              GST billing in 10 seconds. WhatsApp reminders sent automatically. Built for Indian shop owners who value their time and cashflow.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 mb-14">
              <Link href="/start" className="px-10 py-5 bg-[#5548f0] text-white rounded-2xl font-bold text-lg shadow-2xl shadow-indigo-200 hover:shadow-indigo-400 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 no-underline">
                Create First Bill Free <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/demo" className="px-10 py-5 bg-white border border-black/5 rounded-2xl font-bold text-lg text-[#3d3d45] hover:bg-indigo-50/50 hover:border-indigo-100 transition-all flex items-center justify-center gap-3 no-underline shadow-sm">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white"><Play className="w-3 h-3 fill-white ml-0.5" /></div>
                Try Interactive Demo
              </Link>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center overflow-hidden">
                    <img src={`https://i.pravatar.cc/100?u=${i}`} alt="User" />
                  </div>
                ))}
                <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                  50k+
                </div>
              </div>
              <p className="text-sm text-[#7a7a8c] font-medium">
                Trusted by <span className="text-[#0e0e10]">50,000+</span> Indian SMEs
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }} className="relative">
            <div className="relative z-10 rounded-3xl overflow-hidden shadow-[0_48px_100px_-24px_rgba(0,0,0,0.15)] border border-white/20">
              <img src="/images/dashboard-preview.png" alt="BillZo Dashboard Preview" className="w-full h-auto" />
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
            </div>

            {/* Floating Badges */}
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} 
              className="absolute -top-6 -right-6 glass p-4 rounded-2xl shadow-xl z-20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">GST Verified</div>
                <div className="text-xs font-bold text-[#0e0e10]">27AABCU9603R1ZX</div>
              </div>
            </motion.div>

            <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }} 
              className="absolute -bottom-8 -left-8 glass p-5 rounded-2xl shadow-xl z-20 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0e0e10]">WhatsApp Sent!</div>
                <div className="text-[10px] font-medium text-[#7a7a8c]">PDF Invoice · Mehta Textiles</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* TRUST MARQUEE */}
      <div className="bg-[#1e1657] py-8 border-y border-white/5 relative overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-16 px-8">
              {[
                { icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />, text: "GSTN Certified Portal" },
                { icon: <Shield className="w-5 h-5 text-indigo-400" />, text: "Bank-Grade AES-256 Encryption" },
                { icon: <MessageSquare className="w-5 h-5 text-emerald-400" />, text: "Official WhatsApp Business API" },
                { icon: <Building2 className="w-5 h-5 text-indigo-400" />, text: "DPDP 2023 Compliant" },
                { icon: <Smartphone className="w-5 h-5 text-emerald-400" />, text: "Android & iOS Progressive App" },
                { icon: <Zap className="w-5 h-5 text-yellow-400" />, text: "12 Lakh+ Invoices Created" },
              ].map((item, j) => (
                <div key={j} className="flex items-center gap-3">
                  {item.icon}
                  <span className="text-white font-bold text-sm tracking-wide opacity-80">{item.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES REVEAL */}
      <section className="py-32 px-6 md:px-12 bg-white relative z-20" id="features">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-20">
            <div className="lg:col-span-5">
              <div className="text-indigo-600 text-xs font-black uppercase tracking-[0.2em] mb-4">The Workflow</div>
              <h2 className="text-5xl font-bold font-display mb-10 tracking-tight leading-[1.1]">Built for how India <br /><em className="italic text-[#c5a55a]">actually works.</em></h2>
              
              <div className="space-y-4">
                {features.map((f, i) => (
                  <button 
                    key={i} 
                    onClick={() => setActiveFeature(i)}
                    className={`w-full group p-6 rounded-3xl text-left transition-all relative overflow-hidden border-2 ${activeFeature === i ? 'bg-[#faf9f7] border-indigo-100 shadow-xl' : 'bg-white border-transparent hover:bg-[#faf9f7]/50'}`}
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeFeature === i ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-indigo-50 text-indigo-600'}`}>
                        {f.icon}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-[#7a7a8c] uppercase tracking-widest">{f.num}</div>
                        <h3 className="text-xl font-bold">{f.title}</h3>
                      </div>
                    </div>
                    <p className={`text-sm leading-relaxed transition-all ${activeFeature === i ? 'text-[#3d3d45] font-medium' : 'text-[#7a7a8c]'}`}>{f.desc}</p>
                    {activeFeature === i && (
                      <motion.div layoutId="indicator" className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="bg-[#faf9f7] rounded-[40px] p-2 shadow-2xl shadow-black/5 border border-black/5 relative min-h-[500px] flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {activeFeature === 0 && (
                    <motion.div key="f1" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md p-8 bg-white rounded-3xl shadow-inner border border-black/5">
                      <div className="flex justify-between items-start mb-10 pb-6 border-b border-black/5">
                        <div className="font-display text-2xl italic text-indigo-900">BillZo</div>
                        <div className="text-right">
                          <div className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">INV-2024-082</div>
                          <div className="text-xs font-bold mt-1">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        </div>
                      </div>
                      <div className="mb-8">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Billed To</div>
                        <div className="text-base font-bold">Mehta Textiles Pvt Ltd</div>
                        <div className="text-xs font-mono text-indigo-600 mt-1 uppercase tracking-tight">27AABCU9603R1ZX</div>
                      </div>
                      <div className="space-y-4 mb-8">
                        <div className="flex justify-between text-sm font-medium pb-2 border-b border-gray-50">
                          <span>Cotton Fabric (20m)</span>
                          <span>₹8,400.00</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 font-medium">
                          <span>SGST 9%</span>
                          <span>₹756.00</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 font-medium">
                          <span>CGST 9%</span>
                          <span>₹756.00</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-4 px-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                        <span className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Grand Total</span>
                        <span className="text-3xl font-black text-indigo-600">₹9,912.00</span>
                      </div>
                      <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 text-xs font-bold gap-2">
                          <CheckCircle2 className="w-4 h-4" /> WhatsApp Sent
                        </div>
                        <div className="h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-bold gap-2">
                          <ExternalLink className="w-4 h-4" /> Download PDF
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeFeature === 1 && (
                    <motion.div key="f2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-sm">
                      <div className="bg-[#1e1657] rounded-[32px] overflow-hidden shadow-2xl border-4 border-[#0e0e10]">
                        <div className="bg-[#2d1f6e] p-4 flex items-center gap-3 border-b border-white/5">
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white text-xs font-bold">Mehta Textiles</div>
                            <div className="text-emerald-400 text-[10px] font-bold">Online</div>
                          </div>
                        </div>
                        <div className="p-6 h-[400px] bg-[#0c0a1a] flex flex-col gap-6 overflow-y-auto">
                          <div className="self-end bg-[#5548f0] text-white p-4 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-lg">
                            Namaste! Your invoice for Oct 12 is ready. View it here: billzo.in/inv/8271
                          </div>
                          <div className="self-start bg-white/5 text-white p-4 rounded-2xl rounded-tl-none text-sm max-w-[80%] border border-white/10 italic opacity-50">
                            Mehta Textiles is typing...
                          </div>
                          <div className="mt-auto">
                            <div className="bg-white/10 rounded-2xl p-4 border border-white/10">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">PDF</div>
                                <div className="text-white text-xs font-bold">Tax-Invoice-BZ82.pdf</div>
                              </div>
                              <div className="text-[10px] text-white/40">124 KB · 2:14 PM</div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-[#2d1f6e] flex items-center gap-3">
                          <div className="flex-1 h-10 rounded-full bg-white/5 border border-white/10 flex items-center px-4">
                            <span className="text-white/20 text-xs">Reply to Mehta...</span>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                            <Zap className="w-5 h-5 fill-white" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeFeature === 2 && (
                    <motion.div key="f3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-md space-y-6">
                      <div className="bg-white rounded-3xl p-6 shadow-xl border border-indigo-50">
                        <div className="flex items-center gap-3 mb-6">
                          <BarChart3 className="w-6 h-6 text-indigo-600" />
                          <h4 className="text-base font-bold">Hidden Accounting Core</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-indigo-50 rounded-2xl p-4">
                            <div className="text-[10px] font-bold text-indigo-600 uppercase mb-1">Total Sales</div>
                            <div className="text-2xl font-black text-indigo-900">₹8.42L</div>
                            <div className="text-[10px] font-bold text-emerald-600 mt-1">↑ 14.2% growth</div>
                          </div>
                          <div className="bg-emerald-50 rounded-2xl p-4">
                            <div className="text-[10px] font-bold text-emerald-600 uppercase mb-1">GST Ready</div>
                            <div className="text-2xl font-black text-emerald-900">₹1.14L</div>
                            <div className="text-[10px] font-bold text-emerald-700 mt-1">GSTR-1 Generated</div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-[#1e1657] rounded-3xl p-6 text-white shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="text-sm font-bold">Ledger-Safe Infrastructure</span>
                        </div>
                        <div className="space-y-3">
                          {[
                            "Double-entry system (Hidden)",
                            "Real-time Inventory sync",
                            "Auto-Journal entries",
                            "Compliance-first architecture"
                          ].map(t => (
                            <div key={t} className="flex items-center gap-2 text-xs opacity-70">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {t}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Floating Decorative Icon */}
                <div className="absolute top-[-20px] right-[-20px] w-12 h-12 rounded-2xl bg-[#c5a55a] shadow-xl flex items-center justify-center text-white">
                  <Zap className="w-6 h-6 fill-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GSTIN INSTANT CHECKER */}
      <section className="py-32 bg-[#faf9f7]" id="kyc">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="bg-[#0e0e10] rounded-[60px] p-12 md:p-20 relative overflow-hidden shadow-3xl">
            <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none" 
              style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #5548f0, transparent 40%)' }} />
            
            <div className="grid lg:grid-cols-2 gap-20 items-center relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-6">
                  Live GSTN Portal Access
                </div>
                <h2 className="text-5xl font-bold font-display text-white mb-8 tracking-tight">Know exactly who you are dealing with.</h2>
                <p className="text-lg text-white/50 mb-10 leading-relaxed font-sans font-light">
                  Instantly verify any GSTIN before raising an invoice. Pull live business names, trade addresses, and registration status directly from the government portal.
                </p>
                
                <div className="space-y-6">
                  {[
                    "Live status check (Active / Inactive / Suspended)",
                    "Auto-fills billing address instantly",
                    "Validates HSN codes for correct tax rates",
                    "Reduces input errors by 94%"
                  ].map(item => (
                    <div key={item} className="flex items-center gap-4 text-white/80 font-medium text-sm">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Check className="w-3 h-3" />
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 backdrop-blur-xl">
                <div className="text-sm font-bold text-white/40 uppercase tracking-widest mb-6">GSTIN Quick-Verify</div>
                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      placeholder="e.g. 27AABCU9603R1ZX"
                      value={gstinInput}
                      onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
                      className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl px-6 text-white font-mono text-lg focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
                    />
                    <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                  </div>
                  <button 
                    onClick={showGstinResult}
                    className="h-16 px-8 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-900/40"
                  >
                    Verify Now
                  </button>
                </div>

                <AnimatePresence>
                  {gstinResult && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8 rounded-3xl bg-white text-[#0e0e10] shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                      <div className="flex items-center justify-between mb-6">
                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Status: Active
                        </div>
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                      <div className="text-2xl font-bold mb-6 leading-tight">Abhishek Electricals & Traders</div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">State</div>
                          <div className="text-sm font-bold">Maharashtra</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Reg. Type</div>
                          <div className="text-sm font-bold">Regular</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Address</div>
                          <div className="text-sm font-medium leading-relaxed">Shop 4, Gandhi Nagar, Market Area, Pune - 411001</div>
                        </div>
                      </div>
                      <div className="mt-8 pt-6 border-t border-gray-100">
                        <button className="w-full h-12 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
                          Add to Customer Master <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-32 px-6 md:px-12" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="text-indigo-600 text-xs font-black uppercase tracking-[0.2em] mb-4">Pricing</div>
            <h2 className="text-5xl font-bold font-display mb-6 tracking-tight">Transparent plans. No hidden fees.</h2>
            <p className="text-lg text-[#3d3d45] max-w-lg mx-auto font-sans font-light">
              Start free, grow as you scale. Every plan includes GST calculation, PDF export, and WhatsApp delivery.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, i) => (
              <div 
                key={i} 
                className={`group relative bg-white rounded-[40px] p-10 border transition-all duration-500 hover:-translate-y-2 ${plan.popular ? 'border-indigo-600 shadow-[0_32px_64px_-16px_rgba(85,72,240,0.2)]' : 'border-black/5 hover:border-black/10 shadow-sm'}`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-10 -translate-y-1/2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-lg">
                    Most Popular
                  </div>
                )}
                <div className="text-sm font-black text-[#7a7a8c] uppercase tracking-widest mb-6">{plan.name}</div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-6xl font-black text-[#0e0e10] tracking-tighter">{plan.price}</span>
                  <span className="text-sm font-bold text-[#7a7a8c]">{plan.period}</span>
                </div>
                <p className="text-sm text-[#7a7a8c] font-medium leading-relaxed mb-8 min-h-[40px]">{plan.tagline}</p>
                <div className="h-px bg-black/5 mb-8" />
                <div className="space-y-4 mb-10">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-3 text-sm font-medium text-[#3d3d45]">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>
                <button className={`w-full py-5 rounded-2xl font-bold text-base transition-all ${plan.popular ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700' : 'bg-[#faf9f7] text-[#0e0e10] border border-black/5 hover:bg-black/5'}`}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY GRID */}
      <section className="py-32 px-6 md:px-12 bg-[#1e1657]" id="security">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-20">
            <div className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em] mb-4">Security & Trust</div>
            <h2 className="text-5xl font-bold font-display text-white mb-6 tracking-tight leading-tight">Your data is safer with us than <em className="italic text-emerald-400">any ledger.</em></h2>
            <p className="text-lg text-white/50 leading-relaxed font-sans font-light">
              Built on sovereign Indian infrastructure with bank-grade security protocols. We take compliance as seriously as you take your business.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {securityCards.map((card, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-[40px] p-10 backdrop-blur-md hover:bg-white/[0.08] transition-all group">
                <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-8 shadow-2xl group-hover:scale-105 transition-transform">
                  {card.icon}
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 leading-tight">{card.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed mb-6 font-medium">{card.desc}</p>
                <div className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest font-mono">
                  {card.chip}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-40 px-6 md:px-12 text-center relative overflow-hidden bg-white">
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
            <h2 className="text-6xl md:text-7xl font-bold font-display tracking-tight mb-8">
              Shuru karo <em className="italic text-indigo-600">aaj hi.</em>
            </h2>
            <p className="text-xl text-[#3d3d45] mb-12 font-sans font-light">
              First 50 invoices are completely free. No credit card. No setup fee. No excuses.
            </p>
            <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
              <Link href="/start" className="w-full sm:w-auto px-12 py-6 bg-[#0e0e10] text-white rounded-2xl font-bold text-lg shadow-3xl hover:bg-indigo-600 transition-all no-underline">
                Create Free Account
              </Link>
              <button className="w-full sm:w-auto px-12 py-6 bg-white border-2 border-[#0e0e10] text-[#0e0e10] rounded-2xl font-bold text-lg hover:bg-black/5 transition-all">
                Talk to Sales Expert
              </button>
            </div>
            <p className="text-xs text-[#7a7a8c] mt-10 font-bold uppercase tracking-widest">
              Available on Web · Mobile · Tablet
            </p>
          </motion.div>
        </div>
        
        {/* Background Decorative Pattern */}
        <div className="absolute inset-0 -z-10 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </section>

      {/* FOOTER */}
      <footer className="py-24 px-6 md:px-12 bg-[#faf9f7] border-t border-black/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-16 mb-20">
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-3 no-underline mb-8">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-display text-base text-white italic font-medium" 
                  style={{ background: 'linear-gradient(135deg, #5548f0, #1e1657)' }}>
                  Z
                </div>
                <span className="text-xl font-bold text-[#0e0e10]">BillZo</span>
              </Link>
              <p className="text-[#3d3d45] text-sm leading-relaxed max-w-sm font-medium mb-8">
                India's most trusted GST billing platform. Built with the speed of a shopkeeper and the security of a bank.
              </p>
              <div className="flex gap-4">
                {[MessageSquare, Smartphone, BarChart3].map((Icon, i) => (
                  <div key={i} className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center text-[#3d3d45] hover:bg-indigo-600 hover:text-white transition-all cursor-pointer">
                    <Icon className="w-5 h-5" />
                  </div>
                ))}
              </div>
            </div>
            
            {[
              { title: 'Product', links: ['Invoicing', 'GSTIN Verify', 'Aadhaar KYC', 'API Access'] },
              { title: 'Support', links: ['Help Center', 'API Docs', 'Status', 'Contact'] },
              { title: 'Legal', links: ['Privacy Policy', 'Terms', 'DPDP Compliance'] },
            ].map((col, i) => (
              <div key={i}>
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0e0e10] mb-8">{col.title}</h5>
                <ul className="space-y-4 list-none p-0">
                  {col.links.map(l => (
                    <li key={l}>
                      <Link href="#" className="text-sm font-medium text-[#7a7a8c] hover:text-indigo-600 transition-colors no-underline">
                        {l}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          <div className="pt-12 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-xs font-medium text-[#7a7a8c]">
              © 2024 BillZo Technologies Pvt Ltd · Made with ❤️ in India 🇮🇳
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['GSTN Certified', 'UIDAI Integration', 'MeitY Compliant', 'DPDP Ready'].map(badge => (
                <span key={badge} className="px-4 py-1.5 rounded-full bg-white border border-black/5 text-[10px] font-black text-[#0e0e10] uppercase tracking-widest shadow-sm">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}