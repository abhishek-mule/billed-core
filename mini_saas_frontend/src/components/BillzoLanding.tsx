'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

const tokens = {
  radius: { sm: '9px', md: '14px', lg: '22px' },
  border: '1px solid rgba(0,0,0,0.06)',
  borderHover: '1px solid rgba(0,0,0,0.1)',
  shadow: { sm: '0 1px 2px rgba(0,0,0,0.04)', md: '0 4px 12px rgba(0,0,0,0.06)', lg: '0 12px 32px rgba(0,0,0,0.08)' },
  bg: { cream: '#fafaf8', card: '#ffffff', subtle: '#f7f6f2' },
  text: { primary: '#0e0e10', secondary: '#3d3d45', muted: '#7a7a8c' },
  accent: { indigo: '#4338ca', indigoLight: '#5548f0', emerald: '#059669' }
}

const features = [
  {
    num: '01',
    title: 'GST invoices in 60 seconds',
    desc: 'Auto-calculate CGST, SGST, IGST. Add HSN codes, discount rows, and send via WhatsApp or email in one tap.',
  },
  {
    num: '02',
    title: 'Verify any GSTIN instantly',
    desc: 'Check vendor GSTIN before payment. Live lookup from GSTN portal with auto-fill of business details.',
  },
  {
    num: '03',
    title: 'OTP-based Aadhaar onboarding',
    desc: 'Add verified Aadhaar as business identity. Instant customer KYC with full UIDAI-compliant verification.',
  },
]

const plans = [
  { name: 'Starter', price: '0', period: 'Forever free', tagline: 'Perfect for new businesses starting with GST billing.', features: ['25 invoices/month', 'GSTIN verify (10)', 'PDF export', 'WhatsApp delivery'], cta: 'Start Free' },
  { name: 'Basic', price: '199', period: '/month', tagline: 'Ideal for small shops and individual professionals.', features: ['200 invoices/month', 'GSTIN verify (50)', 'Auto-GST calculation', 'Email support'], popular: true, cta: 'Start Basic' },
  { name: 'Professional', price: '499', period: '/month', tagline: 'For growing businesses with regular billing needs.', features: ['1000 invoices/month', 'Unlimited GSTIN verify', 'Aadhaar KYC', 'Priority support'], cta: 'Go Pro' },
  { name: 'Enterprise', price: '1499', period: '/month', tagline: 'For CA firms, distributors and large businesses.', features: ['Unlimited invoices', 'Unlimited Aadhaar KYC', 'API access', 'Dedicated manager'], cta: 'Contact Sales' },
]

const securityCards = [
  { icon: '🔐', title: 'Bank-grade Encryption', desc: 'AES-256 + TLS 1.3', chip: 'AES-256·TLS 1.3' },
  { icon: '🇮🇳', title: 'India Data Residency', desc: 'DPDP 2023 compliant', chip: 'DPDP 2023·MeitY' },
  { icon: '📋', title: 'GST & UIDAI Compliance', desc: 'GSTN certified', chip: 'GSTN·UIDAI' },
]

export default function BillZoLanding() {
  const [activeFeature, setActiveFeature] = useState(0)
  const [gstinInput, setGstinInput] = useState('')
  const [gstinResult, setGstinResult] = useState(false)

  const showGstinResult = () => {
    if (gstinInput.trim().length >= 5) setGstinResult(true)
  }

  return (
    <div className="min-h-screen bg-[#fafaf8] text-[#0e0e10] font-sans">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/[0.06] px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative w-11 h-11">
              <Image src="/logo.svg" alt="BillZo" fill className="object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight">BillZo</span>
              <span className="text-[10px] text-[#4338ca] font-medium tracking-widest uppercase -mt-0.5">Sahi Bill. Safe Deal.</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/start" className="text-sm font-medium text-[#3d3d45] hover:text-[#4338ca] transition-colors">Features</Link>
            <Link href="/start" className="text-sm font-medium text-[#3d3d45] hover:text-[#4338ca] transition-colors">Pricing</Link>
            <Link href="/start" className="text-sm font-medium text-[#3d3d45] hover:text-[#4338ca] transition-colors">Aadhaar KYC</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/start" className="px-4 py-2.5 border border-black/[0.08] rounded-[14px] text-sm font-semibold text-[#3d3d45] hover:border-black/[0.15] hover:bg-black/[0.02] transition-all">Sign In</Link>
            <Link href="/start" className="px-5 py-2.5 bg-[#4338ca] text-white rounded-[14px] text-sm font-bold hover:shadow-lg hover:shadow-[#4338ca]/20 hover:-translate-y-0.5 transition-all">Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-36 pb-20 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-white border border-black/[0.08] rounded-full px-4 py-2 text-sm font-medium text-[#4338ca] mb-6 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              GST-Ready · Aadhaar Verified
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl font-bold mb-4 leading-[1.1]">
              Billing that<br />
              <em className="text-[#4338ca] not-italic">understands</em><br />
              Indian business
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="text-xl text-[#4338ca] font-medium mb-8">
              BillZo – Sahi bill. Safe deal.
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-lg text-[#3d3d45] mb-8 max-w-lg leading-relaxed">
              Create GST invoices, verify GSTIN and Aadhaar, file returns—all in one clean workspace designed for Indian freelancers, shops, and startups.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-4">
              <Link href="/start" className="px-7 py-3.5 bg-[#4338ca] text-white rounded-[14px] text-base font-semibold hover:shadow-xl hover:shadow-[#4338ca]/25 hover:-translate-y-0.5 transition-all">Start Free →</Link>
              <button className="px-6 py-3.5 bg-white border border-black/[0.08] text-[#3d3d45] rounded-[14px] text-base font-medium hover:border-black/[0.15] transition-all">Watch Demo</button>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <div className="absolute top-4 right-4 bg-white rounded-[14px] p-4 shadow-lg border border-black/[0.06] z-10">
              <div className="text-[11px] font-semibold text-[#3d3d45] uppercase tracking-wide mb-1">Business Verified</div>
              <div className="text-sm font-bold text-[#0e0e10]">27AABCU9603R1ZX</div>
              <div className="mt-2 inline-flex items-center gap-1 bg-[#d1fae5] text-[#059669] text-[10px] font-semibold px-2 py-0.5 rounded-full">✓ Active</div>
            </div>

            <div className="bg-white rounded-[22px] shadow-xl overflow-hidden rotate-[-1deg] hover:rotate-0 transition-transform duration-500">
              <div className="bg-[#1e1657] px-5 py-3 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                </div>
                <div className="flex-1 bg-white/10 rounded h-5 flex items-center px-3">
                  <span className="text-[11px] text-white/50">app.billzo.in/dashboard</span>
                </div>
              </div>
              <div className="p-5 bg-[#f7f6f2]">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-lg font-bold text-[#0e0e10]">BillZo</span>
                  <span className="text-[10px] font-bold bg-gradient-to-r from-[#059669] to-[#059669] text-white px-2 py-1 rounded-full">✓ GST Ready</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-white rounded-[14px] p-3.5 border border-black/[0.06]">
                    <div className="text-[10px] text-[#7a7a8c] font-semibold uppercase mb-1">Revenue</div>
                    <div className="text-xl font-bold text-[#0e0e10]">₹2.4L</div>
                    <div className="text-[10px] text-[#059669] font-semibold">↑ 18%</div>
                  </div>
                  <div className="bg-white rounded-[14px] p-3.5 border border-black/[0.06]">
                    <div className="text-[10px] text-[#7a7a8c] font-semibold uppercase mb-1">Invoices</div>
                    <div className="text-xl font-bold text-[#0e0e10]">142</div>
                    <div className="text-[10px] text-[#059669] font-semibold">↑ 24</div>
                  </div>
                  <div className="bg-white rounded-[14px] p-3.5 border border-black/[0.06]">
                    <div className="text-[10px] text-[#7a7a8c] font-semibold uppercase mb-1">GST Due</div>
                    <div className="text-xl font-bold text-[#0e0e10]">₹18.2K</div>
                    <div className="text-[10px] text-[#d97706] font-semibold">Due Dec 20</div>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-[#1e1657] to-[#2d1f6e] rounded-[14px] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[14px] bg-white/10 flex items-center justify-center text-xl">🏢</div>
                  <div className="flex-1">
                    <div className="text-[10px] text-white/50 font-semibold">Your GSTIN</div>
                    <div className="text-sm font-bold text-white">27AABCU9603R1ZX</div>
                  </div>
                  <span className="text-[9px] font-bold bg-[#059669] text-white px-2 py-1 rounded-[9px]">✓ Verified</span>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 -left-4 bg-white rounded-[14px] p-4 shadow-lg border border-black/[0.06] flex items-center gap-3 animate-bounce">
              <span className="text-2xl">🎉</span>
              <div>
                <div className="text-xs font-bold text-[#0e0e10]">Invoice Sent!</div>
                <div className="text-[10px] text-[#7a7a8c]">₹12,400 · GST</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* TRUST */}
      <div className="bg-[#1e1657] px-8 py-5 flex items-center gap-8 overflow-x-auto">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-xl">👥</span>
          <span className="text-sm text-white/70"><strong className="text-white">50,000+</strong> businesses</span>
        </div>
        <div className="w-px h-7 bg-white/10"></div>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-xl">🧾</span>
          <span className="text-sm text-white/70"><strong className="text-white">12 lakh+</strong> invoices</span>
        </div>
        <div className="w-px h-7 bg-white/10"></div>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-xl">⚡</span>
          <span className="text-sm text-white/70">Invoice in <strong className="text-white">under 60s</strong></span>
        </div>
      </div>

      {/* FEATURES */}
      <section className="py-24 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <div className="text-xs font-bold tracking-[1.2px] uppercase text-[#4338ca] mb-4">Core Features</div>
            <h2 className="text-4xl font-bold mb-8">Built for how<br />India actually works</h2>
            <div className="flex flex-col gap-3">
              {features.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  className={`p-5 rounded-[14px] text-left transition-all border ${
                    activeFeature === i 
                      ? 'bg-white border-[#4338ca]/20 shadow-md' 
                      : 'border-transparent hover:bg-white/50'
                  }`}
                >
                  <div className="text-[11px] font-bold text-[#4338ca] uppercase tracking-wide mb-1.5">{f.num} / {f.title}</div>
                  <div className="text-lg font-bold text-[#0e0e10] mb-1.5">{f.title}</div>
                  <div className="text-sm text-[#7a7a8c] leading-relaxed">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[22px] border border-black/[0.06] shadow-xl overflow-hidden">
            <div className="bg-[#1e1657] px-6 py-4 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
              <span className="text-xs text-white/60">BillZo</span>
            </div>
            <div className="p-7">
              {activeFeature === 0 && (
                <div>
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 bg-[#f7f6f2] rounded-[14px] p-3 border border-black/[0.06]">
                      <div className="text-[10px] text-[#7a7a8c] font-semibold uppercase mb-1">Client</div>
                      <div className="text-sm font-semibold text-[#3d3d45]">Mehta Textiles</div>
                    </div>
                    <div className="flex-1 bg-[#f7f6f2] rounded-[14px] p-3 border border-black/[0.06]">
                      <div className="text-[10px] text-[#7a7a8c] font-semibold uppercase mb-1">No.</div>
                      <div className="text-sm font-semibold text-[#3d3d45]">BZ-0142</div>
                    </div>
                  </div>
                  <table className="w-full mb-4">
                    <thead>
                      <tr className="border-b border-black/[0.06]">
                        <th className="text-left py-2 text-[10px] text-[#7a7a8c] font-semibold uppercase">Item</th>
                        <th className="text-left py-2 text-[10px] text-[#7a7a8c] font-semibold uppercase">Hsn</th>
                        <th className="text-right py-2 text-[10px] text-[#7a7a8c] font-semibold uppercase">Qty</th>
                        <th className="text-right py-2 text-[10px] text-[#7a7a8c] font-semibold uppercase">Rate</th>
                        <th className="text-right py-2 text-[10px] text-[#7a7a8c] font-semibold uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-black/[0.04]">
                        <td className="py-2 text-sm text-[#3d3d45]">Linen Fabric</td>
                        <td className="py-2 text-sm text-[#3d3d45]">5208</td>
                        <td className="py-2 text-sm text-[#3d3d45] text-right">12m</td>
                        <td className="py-2 text-sm text-[#3d3d45] text-right">₹2,200</td>
                        <td className="py-2 text-sm text-[#3d3d45] text-right">₹26,400</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex gap-2 mb-4">
                    <span className="bg-[#d1fae5] text-[#065f46] text-xs font-semibold px-2.5 py-1 rounded-full">CGST 9% = ₹2,376</span>
                    <span className="bg-[#d1fae5] text-[#065f46] text-xs font-semibold px-2.5 py-1 rounded-full">SGST 9% = ₹2,376</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t-2 border-black/[0.06]">
                    <span className="text-sm font-semibold text-[#7a7a8c]">Total Amount Due</span>
                    <span className="text-2xl font-bold text-[#0e0e10]">₹31,152</span>
                  </div>
                </div>
              )}
              
              {activeFeature === 1 && (
                <div>
                  <div className="flex gap-3 mb-5">
                    <input 
                      value={gstinInput}
                      onChange={(e) => setGstinInput(e.target.value)}
                      className="flex-1 bg-[#f7f6f2] border-2 border-black/[0.06] rounded-[14px] px-4 py-3 text-sm font-semibold text-[#0e0e10]" 
                      placeholder="Enter GSTIN"
                    />
                    <button onClick={showGstinResult} className="bg-[#4338ca] text-white px-5 py-3 rounded-[14px] text-sm font-semibold hover:bg-[#3730a3]">Verify →</button>
                  </div>
                  {gstinResult && (
                    <div className="bg-[#f7f6f2] border border-black/[0.06] rounded-[14px] p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="bg-[#059669] text-white text-[10px] font-bold px-2 py-1 rounded-full">✓ Verified</span>
                        <span className="text-lg font-bold text-[#0e0e10]">Mehta Textiles Pvt Ltd</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-[10px] text-[#7a7a8c] font-semibold uppercase">State</div><div className="text-sm font-semibold text-[#3d3d45]">Maharashtra</div></div>
                        <div><div className="text-[10px] text-[#7a7a8c] font-semibold uppercase">Status</div><div className="text-sm font-semibold text-[#059669]">Active</div></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {activeFeature === 2 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-gradient-to-r from-orange-500 to-green-600 rounded-[9px] px-3 py-1.5 text-white text-xs font-bold">आधार</div>
                    <span className="text-base font-semibold text-[#3d3d45]">Aadhaar Verification</span>
                  </div>
                  <div className="mb-4">
                    <div className="text-[11px] text-[#7a7a8c] font-semibold uppercase mb-2">Aadhaar Number</div>
                    <input value="XXXX XXXX 4821" readOnly className="w-full bg-[#f7f6f2] border-2 border-black/[0.06] rounded-[14px] px-4 py-3 text-base font-semibold tracking-widest" />
                  </div>
                  <div className="mb-4">
                    <div className="text-[11px] text-[#7a7a8c] font-semibold uppercase mb-2">One-Time Password</div>
                    <div className="flex gap-2">
                      {['8', '4', '2', '1', '', ''].map((v, i) => (
                        <div key={i} className={`w-11 h-13 bg-[#f7f6f2] border-2 ${v ? 'border-[#4338ca]/30 bg-[#eeedfb]' : 'border-black/[0.06]'} rounded-[14px] flex items-center justify-center text-lg font-bold`}>
                          {v || '_'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="w-full bg-[#4338ca] text-white py-4 rounded-[14px] text-base font-bold hover:bg-[#3730a3] flex items-center justify-center gap-2 transition-colors">
                    🔒 Verify Aadhaar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* GSTIN */}
      <section className="py-24 px-8 bg-[#1e1657] text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <div className="text-xs font-bold tracking-[1.2px] uppercase text-[#34d399] mb-4">GSTIN Intelligence</div>
            <h2 className="text-4xl font-bold mb-4">Know who you're<br />dealing with</h2>
            <p className="text-base text-white/65 mt-5 mb-8">
              Instantly verify any GSTIN before raising an invoice. BillZo pulls live data from the GSTN portal.
            </p>
            <div className="flex flex-col gap-4">
              {['Live GSTN lookup', 'Auto-fills invoice', 'Flags suspicious GSTINs'].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#059669] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">✓</div>
                  <div className="text-sm text-white/80">{item}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="bg-white/5 border border-white/10 rounded-[22px] p-8 backdrop-blur">
              <div className="text-lg font-bold text-white mb-6">GSTIN Instant Check</div>
              <input 
                className="w-full bg-white/8 border border-white/15 rounded-[14px] px-5 py-4 text-sm font-semibold text-white placeholder-white/30 mb-4" 
                placeholder="Enter GSTIN"
              />
              <button className="w-full bg-gradient-to-r from-[#059669] to-[#059669] text-white py-4 rounded-[14px] text-base font-bold hover:shadow-lg hover:shadow-[#059669]/20 transition-all">
                → Verify Now
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 px-8 bg-[#f7f6f2]">
        <div className="max-w-xl mb-12">
          <div className="text-xs font-bold tracking-[1.2px] uppercase text-[#4338ca] mb-4">Pricing</div>
          <h2 className="text-4xl font-bold text-[#0e0e10]">Transparent pricing.</h2>
          <p className="text-base text-[#7a7a8c] mt-4">Start free, upgrade as you grow. No hidden charges.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
          {plans.map((plan, i) => (
            <div key={i} className={`bg-white rounded-[22px] p-7 border transition-all hover:-translate-y-1 hover:shadow-xl ${
              plan.popular ? 'border-[#4338ca] shadow-lg' : 'border-black/[0.06]'
            }`}>
              {plan.popular && <div className="bg-[#4338ca] text-white text-[10px] font-bold px-3 py-1 rounded-full inline-block mb-3">⚡ Popular</div>}
              <div className="text-sm font-bold text-[#7a7a8c] uppercase tracking-wide mb-3">{plan.name}</div>
              <div className="mb-2">
                <span className="text-xl font-semibold text-[#4338ca]">₹</span>
                <span className="text-4xl font-bold text-[#0e0e10]">{plan.price}</span>
              </div>
              <div className="text-xs text-[#7a7a8c] mb-4">{plan.period}</div>
              <div className="text-sm text-[#7a7a8c] mb-6 min-h-[40px]">{plan.tagline}</div>
              <div className="h-px bg-black/[0.06] mb-6"></div>
              <div className="flex flex-col gap-2.5 mb-6">
                {plan.features.map((f, j) => (
                  <div key={j} className="flex items-start gap-2 text-sm text-[#7a7a8c]">
                    <span className="text-[#059669]">✓</span> {f}
                  </div>
                ))}
              </div>
              <button className={`w-full py-3 rounded-[14px] text-sm font-semibold transition-all ${
                plan.popular 
                  ? 'bg-[#4338ca] text-white hover:bg-[#3730a3]' 
                  : 'border-2 border-[#4338ca]/30 text-[#4338ca] hover:bg-[#4338ca]/5'
              }`}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="py-24 px-8 bg-[#fafaf8]">
        <div className="max-w-xl mb-12">
          <div className="text-xs font-bold tracking-[1.2px] uppercase text-[#4338ca] mb-4">Security</div>
          <h2 className="text-4xl font-bold text-[#0e0e10]">Your data is safer<br />here</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {securityCards.map((card, i) => (
            <div key={i} className="bg-white rounded-[22px] p-8 border border-black/[0.06] hover:-translate-y-1 hover:border-[#4338ca]/20 hover:shadow-xl transition-all">
              <div className="w-14 h-14 rounded-[14px] bg-[#eeedfb] flex items-center justify-center text-2xl mb-5">{card.icon}</div>
              <div className="text-lg font-bold text-[#0e0e10] mb-2">{card.title}</div>
              <div className="text-sm text-[#7a7a8c] leading-relaxed mb-4">{card.desc}</div>
              <span className="inline-block bg-[#eeedfb] text-[#4338ca] text-[10px] font-bold px-3 py-1 rounded-full">{card.chip}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-8 bg-gradient-to-br from-[#1e1657] via-[#2d1f6e] to-[#4338ca] text-center relative overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(67,56,202,0.4)_0%,transparent_70%)] pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-white mb-4">Shuru karo aaj.</h2>
          <p className="text-lg text-white/60 mb-12">First invoice free.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button className="px-9 py-4 bg-white text-[#4338ca] rounded-[14px] text-base font-bold hover:shadow-lg hover:shadow-white/10 transition-all">Create Free Account →</button>
            <button className="px-7 py-4 bg-transparent border border-white/25 text-white/85 rounded-[14px] text-base font-semibold hover:border-white/50 hover:bg-white/6 transition-all">Talk to Expert</button>
          </div>
          <p className="text-sm text-white/40 mt-6">No credit card · No setup fee</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1e1657] px-8 py-12 border-t border-white/6">
        <div className="max-w-7xl mx-auto flex justify-between items-start gap-10 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative w-12 h-12">
                <Image src="/logo.svg" alt="BillZo" fill className="object-contain invert brightness-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-white tracking-tight">BillZo</span>
                <span className="text-[10px] text-[#818cf8] font-medium tracking-widest uppercase -mt-0.5">Sahi Bill. Safe Deal.</span>
              </div>
            </div>
            <p className="text-xs text-white/40 max-w-[220px]">Sahi bill. Safe deal. India's most trusted GST billing platform.</p>
          </div>
          <div className="flex gap-12 flex-wrap">
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Product</div>
              {['Invoicing', 'GSTIN Verify', 'Aadhaar KYC', 'Pricing'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80 transition-colors">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Company</div>
              {['About', 'Blog', 'Careers'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80 transition-colors">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Support</div>
              {['Help', 'API Docs', 'Status'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80 transition-colors">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Legal</div>
              {['Privacy', 'Terms', 'DPDP'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80 transition-colors">{l}</Link>)}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto flex justify-between items-center pt-6 border-t border-white/6 mt-10 flex-wrap gap-4">
          <p className="text-xs text-white/30">© 2024 BillZo Technologies Pvt Ltd · Made in India</p>
          <div className="flex gap-3">
            {['GSTN', 'UIDAI', 'DPDP'].map(c => (
              <span key={c} className="bg-white/6 border border-white/10 text-white/50 text-[10px] font-semibold px-3 py-1 rounded-full">{c}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}