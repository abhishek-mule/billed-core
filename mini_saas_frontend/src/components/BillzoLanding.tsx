'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

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
  radiusSm: '8px',
  radiusMd: '14px',
  radiusLg: '22px',
  radiusXl: '32px',
}

const features = [
  { num: '01 / Fast Billing', title: 'GST invoice in 10 seconds', desc: 'Select customer, add items, send. Auto-calculate CGST, SGST, IGST with HSN codes. Works on mobile.' },
  { num: '02 / WhatsApp Auto', title: 'Reminders sent automatically', desc: 'Invoice goes to WhatsApp instantly. Payment reminders. Daily summaries. No follow-up calls needed.' },
  { num: '03 / ERP Power', title: 'Enterprise accounting hidden', desc: 'Ledger ready. GST reports ready. Powered by enterprise accounting engine. Your data stays safe.' },
]

const plans = [
  { name: 'Free', price: '0', period: 'Forever', tagline: 'Perfect for starting out.', features: ['50 invoices/day', 'Basic reminders', 'Mobile billing'], cta: 'Start Free' },
  { name: 'Starter', price: '₹199', period: '/month', tagline: 'For small shops.', features: ['300 invoices/day', 'WhatsApp automation', 'Inventory alerts'], popular: true, cta: 'Start Starter' },
  { name: 'Pro', price: '₹499', period: '/month', tagline: 'For growing businesses.', features: ['2000 invoices/day', 'Analytics', 'Priority support'], cta: 'Go Pro' },
]

const securityCards = [
  { icon: '🔐', title: 'Bank-grade Encryption', desc: 'Every piece of data is encrypted at rest and in transit using AES-256 and TLS 1.3 — the same standards used by major banks.', chip: 'AES-256·TLS 1.3' },
  { icon: '🇮🇳', title: 'India Data Residency', desc: 'All your data stays within Indian borders. Fully compliant with DPDP 2023 and MeitY data localisation guidelines.', chip: 'DPDP 2023·MeitY' },
  { icon: '📋', title: 'GST & UIDAI Compliance', desc: 'GSTN-certified integration for live GSTIN lookups. Aadhaar verification via official UIDAI APIs — no third-party middlemen.', chip: 'GSTN·UIDAI' },
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
    <div className="min-h-screen bg-[#faf9f7] text-[#0e0e10] font-sans" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Instrument Serif', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'py-3 shadow-lg' : 'py-4'}`}
        style={{ 
          background: 'rgba(250,249,247,0.85)',
          backdropFilter: 'blur(24px) saturate(150%)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          padding: scrolled ? '12px 48px' : '18px 48px'
        }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center font-display text-lg text-white font-italic shadow-lg" 
              style={{ background: 'linear-gradient(135deg, #5548f0, #1e1657)', boxShadow: '0 4px 12px rgba(83,72,240,0.35)' }}>
              Z
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold tracking-tight" style={{ letterSpacing: '-0.5px' }}>BillZo</span>
              <span className="text-[9px] tracking-widest uppercase" style={{ color: '#4338ca', marginTop: '2px' }}>Sahi Bill. Safe Deal.</span>
            </div>
          </Link>
          <ul className="flex gap-9 list-none" style={{ display: 'flex', gap: '36px' }}>
            {['Features', 'Pricing', 'Security', 'Aadhaar KYC'].map(l => (
              <li key={l}>
                <Link href="/start" className="text-sm font-normal no-underline transition-colors" style={{ color: '#3d3d45' }}
                  onMouseOver={(e) => e.currentTarget.style.color = '#0e0e10'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#3d3d45'}
                >{l}</Link>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <Link href="/start" className="px-5 py-2.5 text-sm font-medium no-underline transition-all border" 
              style={{ borderColor: '#e8e4dc', borderRadius: '8px', color: '#3d3d45' }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = '#4338ca'; e.currentTarget.style.color = '#4338ca'; e.currentTarget.style.background = '#eeedfb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8e4dc'; e.currentTarget.style.color = '#3d3d45'; e.currentTarget.style.background = 'transparent'; }}
            >Sign In</Link>
            <Link href="/start" className="px-5 py-2.5 text-sm font-semibold text-white no-underline transition-all border-none" 
              style={{ background: '#5548f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(83,72,240,0.35)' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(83,72,240,0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(83,72,240,0.35)'; }}
            >Start Free Billing →</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="min-h-screen pt-36 pb-24 px-12" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="absolute top-1/2 right-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none" 
          style={{ background: 'radial-gradient(circle, rgba(83,72,240,0.08) 0%, transparent 70%)', transform: 'translateY(-50%)' }} />
        <div className="absolute top-[20%] left-[-80px] w-[400px] h-[400px] rounded-full pointer-events-none" 
          style={{ background: 'radial-gradient(circle, rgba(197,165,90,0.07) 0%, transparent 70%)' }} />
        
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-20 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 text-sm font-medium mb-7 shadow-sm" 
              style={{ borderColor: 'rgba(83,72,240,0.2)', color: '#4338ca', borderRadius: '100px' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> GST-Ready · Aadhaar Verified · DPDP Compliant
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} 
              className="text-5xl font-bold mb-4 font-display leading-tight" style={{ letterSpacing: '-1.5px' }}>
              Billing that<br />
              <em className="text-[#5548f0]" style={{ fontStyle: 'italic' }}>follows up</em><br />
              <span className="relative">automatically
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#c5a55a' }} />
              </span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} 
              className="text-xl font-display italic mb-6" style={{ color: '#4338ca' }}>Sahi bill. Safe deal.</motion.p>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} 
              className="text-base leading-relaxed mb-8 max-w-md" style={{ color: '#3d3d45', fontWeight: 300 }}>
              GST billing in 10 seconds. WhatsApp reminders sent automatically. Built for Indian shop owners who want payments on time.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-4">
              <Link href="/start" className="px-8 py-3.5 text-base font-semibold text-white no-underline transition-all" 
                style={{ background: '#5548f0', borderRadius: '14px', boxShadow: '0 6px 20px rgba(83,72,240,0.35)' }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(83,72,240,0.45)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(83,72,240,0.35)'; }}
              >Start Free <span style={{ fontSize: '16px' }}>→</span></Link>
              <button className="px-7 py-3.5 text-base font-medium transition-all border bg-white" 
                style={{ borderColor: '#e8e4dc', borderRadius: '14px', color: '#3d3d45' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = '#3d3d45'; e.currentTarget.style.color = '#0e0e10'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8e4dc'; e.currentTarget.style.color = '#3d3d45'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#0e0e10] flex items-center justify-center">
                    <span className="border-l-2 border-t border-transparent border-b-transparent w-0 h-0" style={{ borderLeftWidth: '6px', marginLeft: '2px' }} />
                  </span>
                  Watch Demo
                </span>
              </button>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex items-center gap-7 mt-12">
              <div className="flex">
                {['AK', 'RS', 'PM', 'VG', '+∞'].map((a, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-semibold -ml-2 first:ml-0" 
                    style={{ background: i === 4 ? '#4338ca' : '#eeedfb', color: i === 4 ? 'white' : '#4338ca' }}>{a}</div>
                ))}
              </div>
              <p className="text-sm" style={{ color: '#7a7a8c' }}>Trusted by <strong style={{ color: '#0e0e10' }}>50,000+</strong> Indian businesses</p>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }} style={{ position: 'relative' }}>
            <div className="absolute top-[-20px] right-[-36px] bg-white rounded-[14px] p-4 shadow-xl border z-10 min-w-[160px]"
              style={{ borderColor: 'rgba(0,0,0,0.07)', boxShadow: '0 12px 40px rgba(0,0,0,0.1)' }}>
              <div className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#7a7a8c' }}>GSTIN Status</div>
              <div className="text-sm font-bold" style={{ color: '#0e0e10' }}>27AABCU9603R1ZX</div>
              <div className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: '#059669' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active & Verified
              </div>
            </div>

            <div className="bg-white rounded-[22px] shadow-2xl overflow-hidden transition-transform duration-500" 
              style={{ transform: 'perspective(1200px) rotateY(-4deg) rotateX(2deg)' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'perspective(1200px) rotateY(-1deg) rotateX(0deg)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'perspective(1200px) rotateY(-4deg) rotateX(2deg)'}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ background: '#1a1025' }}>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                </div>
                <div className="flex-1 rounded h-5 flex items-center px-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>app.billzo.in/dashboard</span>
                </div>
              </div>
              <div className="p-6" style={{ background: '#f5f3ef' }}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-lg font-bold" style={{ color: '#1e1657' }}>BillZo</span>
                  <span className="text-[10px] font-semibold text-white px-2 py-1 rounded-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>✓ GST Ready</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Revenue', val: '₹2.4L', delta: '↑ 18% this month', up: true },
                    { label: 'Invoices', val: '142', delta: '↑ 24 new', up: true },
                    { label: 'GST Due', val: '₹18.2K', delta: 'Due Dec 20', up: false },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-[14px] p-3.5 border transition-all" style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                      <div className="text-[10px] font-semibold uppercase" style={{ color: '#7a7a8c', marginBottom: '6px' }}>{stat.label}</div>
                      <div className="text-xl font-bold" style={{ color: '#1e1657' }}>{stat.val}</div>
                      <div className="text-[11px] font-semibold mt-1" style={{ color: stat.up ? '#10b981' : '#d97706' }}>{stat.delta}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-[14px] p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #1e1657, #2d1f6e)' }}>
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.1)' }}>🏢</div>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>Your GSTIN</div>
                    <div className="text-sm font-bold text-white font-mono" style={{ letterSpacing: '0.04em' }}>27AABCU9603R1ZX</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>✓ Verified</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-[-20px] left-[-36px] bg-white rounded-[14px] p-4 shadow-xl border flex items-center gap-3 animate-bounce" 
              style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <span className="text-2xl">🎉</span>
              <div>
                <div className="text-sm font-bold" style={{ color: '#0e0e10' }}>Invoice Sent!</div>
                <div className="text-[11px]" style={{ color: '#7a7a8c' }}>₹12,400 · via WhatsApp</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="px-0 py-4 flex overflow-hidden" style={{ background: '#1e1657' }}>
        <div className="flex animate-marquee whitespace-nowrap" style={{ animation: 'marquee 25s linear infinite' }}>
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-10" style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { icon: '👥', text: '50,000+ businesses trust BillZo' },
                { icon: '🧾', text: '12 lakh+ invoices created' },
                { icon: '⚡', text: 'Invoice in under 60 seconds' },
                { icon: '🔒', text: 'AES-256 bank-grade encryption' },
                { icon: '🇮🇳', text: 'DPDP 2023 compliant' },
                { icon: '✅', text: 'GSTN certified portal' },
                { icon: '📱', text: 'WhatsApp & email delivery' },
              ].map((item, j) => (
                <div key={j} className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {item.text.split(' ').map((word, k) => (
                      <span key={k} style={word.includes('+') || word === 'BillZo' ? { color: 'white', fontWeight: 600 } : {}}>{word} </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>

      {/* FEATURES */}
      <section className="py-24 px-12" id="features">
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-20">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#4338ca' }}>Core Features</div>
            <h2 className="text-4xl font-bold font-display mb-8" style={{ letterSpacing: '-1px' }}>Built for how<br /><em style={{ fontStyle: 'italic', color: '#5548f0' }}>India</em> actually works</h2>
            <div className="flex flex-col gap-2">
              {features.map((f, i) => (
                <button key={i} onClick={() => setActiveFeature(i)}
                  className={`p-5 rounded-[14px] text-left transition-all border ${activeFeature === i ? 'bg-white shadow-md' : 'border-transparent hover:bg-white/50'}`}
                  style={{ borderColor: activeFeature === i ? 'rgba(67,56,202,0.15)' : 'transparent' }}
                >
                  <div className="text-[11px] font-bold mb-1.5 font-mono" style={{ color: '#7a7a8c' }}>{f.num}</div>
                  <div className="text-lg font-bold mb-1.5">{f.title}</div>
                  <div className="text-sm leading-relaxed" style={{ color: '#7a7a8c', fontWeight: 300 }}>{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[32px] shadow-2xl border overflow-hidden sticky top-24" style={{ borderColor: 'rgba(0,0,0,0.06)', minHeight: '380px' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#1a1025' }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
            </div>
            <div className="p-8">
              {activeFeature === 0 && (
                <div>
                  <div className="flex justify-between items-start mb-6 pb-5 border-b" style={{ borderColor: '#e8e4dc' }}>
                    <div>
                      <div className="font-display text-xl italic" style={{ color: '#1e1657' }}>BillZo</div>
                      <div className="text-xs mt-1" style={{ color: '#7a7a8c' }}>Tax Invoice</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs" style={{ color: '#7a7a8c' }}>BZ-0142</div>
                      <div className="text-xs" style={{ color: '#7a7a8c', marginTop: '2px' }}>Dec 15, 2024</div>
                    </div>
                  </div>
                  <div className="flex gap-5 mb-5">
                    <div className="flex-1">
                      <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#7a7a8c' }}>Bill To</div>
                      <div className="text-sm font-semibold">Mehta Textiles Pvt Ltd</div>
                      <div className="text-xs font-mono" style={{ color: '#7a7a8c' }}>27AABCU9603R1ZX</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 py-2 border-b mb-2" style={{ borderColor: '#f2f0ec' }}>
                    <span className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Item</span>
                    <span className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Qty</span>
                    <span className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Rate</span>
                    <span className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Amt</span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 py-2 border-b mb-3" style={{ borderColor: '#f2f0ec' }}>
                    <span className="text-sm">Linen Fabric</span>
                    <span className="text-sm">12m</span>
                    <span className="text-sm text-right">₹2,200</span>
                    <span className="text-sm text-right font-semibold">₹26,400</span>
                  </div>
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>CGST 9% = ₹2,376</span>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>SGST 9% = ₹2,376</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t-2" style={{ borderColor: '#e8e4dc' }}>
                    <span className="text-sm" style={{ color: '#7a7a8c' }}>Total Amount</span>
                    <span className="text-2xl font-bold" style={{ color: '#1e1657' }}>₹31,152</span>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button className="flex-1 py-2.5 text-sm font-semibold rounded-[8px]" style={{ background: '#25d366', color: 'white' }}>📱 WhatsApp</button>
                    <button className="flex-1 py-2.5 text-sm font-semibold rounded-[8px]" style={{ background: '#eeedfb', color: '#4338ca' }}>✉ Email PDF</button>
                  </div>
                </div>
              )}
              {activeFeature === 1 && (
                <div>
                  <div className="text-[12px] font-bold uppercase mb-3" style={{ color: '#7a7a8c' }}>GSTIN Lookup</div>
                  <div className="flex gap-3 mb-5">
                    <input value={gstinInput} onChange={(e) => setGstinInput(e.target.value)} placeholder="27AABCU9603R1ZX"
                      className="flex-1 px-4 py-3 font-mono text-sm rounded-[8px] border outline-none"
                      style={{ background: '#f2f0ec', borderColor: '#e8e4dc' }}
                      onFocus={(e) => { e.target.style.borderColor = '#4338ca'; e.target.style.background = 'white'; }}
                    />
                    <button onClick={showGstinResult} className="px-5 py-3 text-sm font-semibold rounded-[8px] text-white"
                      style={{ background: '#4338ca' }}>Verify →</button>
                  </div>
                  {gstinResult && (
                    <div className="p-5 rounded-[14px]" style={{ background: '#f2f0ec', animation: 'panelIn 0.35s ease' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>✓ Active</span>
                        <span className="text-lg font-bold" style={{ color: '#1e1657' }}>Mehta Textiles Pvt Ltd</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>State</div><div className="text-sm font-semibold">Maharashtra</div></div>
                        <div><div className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Status</div><div className="text-sm font-semibold" style={{ color: '#059669' }}>Active ✓</div></div>
                        <div><div className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Reg. Type</div><div className="text-sm font-semibold">Regular</div></div>
                        <div><div className="text-[10px] font-bold uppercase" style={{ color: '#7a7a8c' }}>Category</div><div className="text-sm font-semibold">Business</div></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeFeature === 2 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-[6px] w-12 h-8 flex items-center justify-center text-xs font-bold text-white" 
                      style={{ background: 'linear-gradient(135deg, #ff9933, #138808)', color: '#000080' }}>आधार</div>
                    <div>
                      <div className="text-base font-bold">Aadhaar Verification</div>
                      <div className="text-xs" style={{ color: '#7a7a8c' }}>UIDAI-compliant KYC</div>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[11px] font-bold uppercase mb-2" style={{ color: '#7a7a8c' }}>Aadhaar Number</div>
                    <input value="XXXX  XXXX  4821" readOnly className="w-full px-4 py-3 font-mono text-base tracking-widest rounded-[8px] border outline-none" 
                      style={{ background: '#f2f0ec', borderColor: '#e8e4dc' }} />
                  </div>
                  <div className="mb-4">
                    <div className="text-[11px] font-bold uppercase mb-2" style={{ color: '#7a7a8c' }}>One-Time Password</div>
                    <div className="flex gap-2">
                      {['8','4','2','1','',''].map((v, i) => (
                        <div key={i} className={`w-12 h-14 rounded-[8px] flex items-center justify-center text-xl font-bold ${v ? 'border-2 border-[#4338ca]/30 bg-[#eeedfb]' : 'border-2 border-[#e8e4dc] bg-[#f2f0ec]'}`}>
                          {v || '_'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="w-full py-3.5 text-base font-bold rounded-[8px] text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #5548f0, #4338ca)' }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(83,72,240,0.35)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >🔒 Verify with Aadhaar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* GSTIN SECTION */}
      <section className="py-24 px-12 text-white" style={{ background: '#1e1657', position: 'relative', overflow: 'hidden' }}>
        <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none" 
          style={{ background: 'radial-gradient(circle, rgba(83,72,240,0.3) 0%, transparent 70%)' }} />
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-20 items-center relative z-10">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#34d399' }}>GSTIN Intelligence</div>
            <h2 className="text-4xl font-bold mb-4 font-display">Know who you're<br />dealing with</h2>
            <p className="text-base leading-relaxed mb-8 max-w-md" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Instantly verify any GSTIN before raising an invoice. BillZo pulls live data from the GSTN portal in under 2 seconds.
            </p>
            <div className="flex flex-col gap-4">
              {[
                'Live GSTN lookup — real-time data from government portal',
                'Auto-fills invoice — business name, address populated instantly',
                'Flags suspicious GSTINs — cancelled or invalid registrations flagged',
                'HSN code validation — ensure correct tax classification',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.25)' }}>
                    <span className="w-2 h-1 border-l-2 border-b border-[#34d399]" style={{ transform: 'rotate(-45deg) translateY(-1px)' }} />
                  </div>
                  <div className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {item.split(' — ').map((part, j) => (
                      <span key={j} style={j === 0 ? { fontWeight: 600, color: 'white' } : {}}>{part}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="rounded-[32px] p-9 border" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(24px)' }}>
              <div className="text-lg font-bold text-white mb-6">GSTIN Instant Check</div>
              <input placeholder="Enter GSTIN e.g. 27AABCU9603R1ZX"
                className="w-full px-5 py-4 mb-4 text-sm font-mono rounded-[8px] outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)', color: 'white' }}
              />
              <button className="w-full py-4 text-base font-bold rounded-[8px] text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(16,185,129,0.4)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >→ Verify Now</button>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 px-12" style={{ background: '#faf9f7' }} id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#4338ca' }}>Pricing</div>
            <h2 className="text-4xl font-bold font-display mb-4">Transparent pricing.<br /><em style={{ fontStyle: 'italic', color: '#5548f0' }}>No surprises.</em></h2>
            <p className="text-base max-w-md mx-auto" style={{ color: '#7a7a8c' }}>Start free, grow as you scale. Every plan includes GST calculation, PDF export, and WhatsApp delivery.</p>
          </div>
          
          <div className="grid grid-cols-4 gap-5">
            {plans.map((plan, i) => (
              <div key={i} className={`bg-white rounded-[22px] p-7 border transition-all relative overflow-hidden ${plan.popular ? 'shadow-lg' : ''}`}
                style={{ borderColor: plan.popular ? '#5548f0' : '#e8e4dc' }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(0,0,0,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = plan.popular ? '0 8px 32px rgba(83,72,240,0.15)' : 'none'; }}
              >
                {plan.popular && <div className="absolute top-4 right-4 text-[10px] font-bold px-3 py-1 rounded-full text-white" style={{ background: '#5548f0' }}>⚡ Most Popular</div>}
                <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7a7a8c' }}>{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-lg font-semibold" style={{ color: '#4338ca', marginTop: '6px' }}>₹</span>
                  <span className="text-5xl font-bold" style={{ color: '#1e1657', letterSpacing: '-2px' }}>{plan.price}</span>
                </div>
                <div className="text-xs mb-4" style={{ color: '#7a7a8c' }}>{plan.period}</div>
                <div className="text-sm mb-6 min-h-[40px] leading-relaxed" style={{ color: '#7a7a8c', fontWeight: 300 }}>{plan.tagline}</div>
                <div className="h-px mb-6" style={{ background: '#e8e4dc' }} />
                <div className="flex flex-col gap-2.5 mb-7">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5 text-sm" style={{ color: '#7a7a8c' }}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#d1fae5' }}>
                        <span className="w-1 h-1 border-l border-b border-[#059669]" style={{ transform: 'rotate(-45deg) translateY(-0.5px)' }} />
                      </span>
                      {f}
                    </div>
                  ))}
                </div>
                <button className={`w-full py-3 rounded-[8px] text-sm font-semibold transition-all ${plan.popular ? 'text-white' : 'border'}`}
                  style={plan.popular ? { background: '#5548f0', boxShadow: '0 4px 16px rgba(83,72,240,0.3)' } : { borderColor: 'rgba(83,72,240,0.3)', color: '#4338ca' }}
                  onMouseOver={(e) => { if (!plan.popular) e.currentTarget.style.background = '#eeedfb'; else e.currentTarget.style.background = '#4338ca'; }}
                  onMouseLeave={(e) => { if (!plan.popular) e.currentTarget.style.background = 'transparent'; else e.currentTarget.style.background = '#5548f0'; }}
                >{plan.cta}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="py-24 px-12" style={{ background: '#f2f0ec' }} id="security">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 max-w-xl">
            <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#4338ca' }}>Security & Compliance</div>
            <h2 className="text-4xl font-bold font-display">Your data is<br /><em style={{ fontStyle: 'italic', color: '#5548f0' }}>safer here</em></h2>
            <p className="text-base mt-4 max-w-md" style={{ color: '#7a7a8c', fontWeight: 300 }}>Built on Indian data infrastructure with the same encryption standards used by banks.</p>
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            {securityCards.map((card, i) => (
              <div key={i} className="bg-white rounded-[22px] p-9 border transition-all relative overflow-hidden"
                style={{ borderColor: '#e8e4dc' }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = 'rgba(83,72,240,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e8e4dc'; }}
              >
                <div className="absolute bottom-0 left-0 right-0 h-0.5 transition-transform origin-left duration-400" 
                  style={{ background: 'linear-gradient(to right, #5548f0, #c5a55a)', transform: 'scaleX(0)' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scaleX(1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scaleX(0)'} />
                <div className="w-15 h-15 rounded-[14px] flex items-center justify-center text-3xl mb-5" style={{ background: '#eeedfb' }}>{card.icon}</div>
                <div className="text-lg font-bold mb-2" style={{ letterSpacing: '-0.3px' }}>{card.title}</div>
                <div className="text-sm leading-relaxed mb-4" style={{ color: '#7a7a8c', fontWeight: 300 }}>{card.desc}</div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#eeedfb', color: '#4338ca', fontFamily: "'JetBrains Mono', monospace" }}>{card.chip}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-12 text-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1657, #2d1f6e, #4338ca)' }}>
        <div className="absolute inset-0 pointer-events-none" 
          style={{ background: 'radial-gradient(ellipse, rgba(83,72,240,0.5) 0%, transparent 70%)', transform: 'translate(-50%, -50%)', left: '50%', top: '50%' }} />
        <div className="absolute inset-0 pointer-events-none" 
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative z-10">
          <div className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Get started today</div>
          <h2 className="text-5xl font-bold text-white mb-5 font-display" style={{ letterSpacing: '-1.5px' }}>Shuru karo <em style={{ fontStyle: 'italic', color: '#a5b4fc' }}>aaj.</em></h2>
          <p className="text-lg mb-12" style={{ color: 'rgba(255,255,255,0.5)' }}>First invoice free. No credit card. No setup fee.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button className="px-10 py-4 text-base font-bold rounded-[14px] text-[#1e1657] transition-all"
              style={{ background: 'white' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(255,255,255,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >Create Free Account →</button>
            <button className="px-9 py-4 text-base font-medium rounded-[14px] border transition-all"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            >Talk to Expert</button>
          </div>
          <p className="text-sm mt-6" style={{ color: 'rgba(255,255,255,0.3)' }}>No credit card required · No setup fee · Cancel anytime</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-18 px-12" style={{ background: '#0c0a1a', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-7xl mx-auto grid grid-cols-5 gap-12 mb-16">
          <div className="col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-base font-bold text-white italic" 
                style={{ background: 'linear-gradient(135deg, #5548f0, #1e1657)' }}>B</div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-white" style={{ letterSpacing: '-0.5px' }}>BillZo</span>
                <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>Sahi Bill. Safe Deal.</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed max-w-[200px]" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 300 }}>India's most trusted GST billing platform. Built for the way India works.</p>
          </div>
          {[
            { title: 'Product', links: ['Invoicing', 'GSTIN Verify', 'Aadhaar KYC', 'Pricing', 'API Access'] },
            { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
            { title: 'Support', links: ['Help Center', 'API Docs', 'Status', 'Contact'] },
            { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'DPDP Compliance', 'Refund Policy'] },
          ].map((col, i) => (
            <div key={i}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>{col.title}</div>
              <div className="flex flex-col gap-3">
                {col.links.map(link => (
                  <Link key={link} href="/start" className="text-sm no-underline transition-colors" style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 300 }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
                  >{link}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto flex justify-between items-center pt-8 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>© 2024 BillZo Technologies Pvt Ltd · Made with ♥ in India 🇮🇳</p>
          <div className="flex gap-2">
            {['GSTN', 'UIDAI', 'DPDP', 'MeitY'].map(cert => (
              <span key={cert} className="text-[11px] font-semibold px-3 py-1 rounded-full" 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
                {cert}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}