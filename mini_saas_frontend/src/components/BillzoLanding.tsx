'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

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
  { name: 'Starter', price: '0', period: 'Forever free', tagline: 'For freelancers just getting started.', features: ['10 invoices/month', 'GSTIN verify (5)', 'PDF export', 'WhatsApp'], cta: 'Get Started Free' },
  { name: 'Growth', price: '399', period: '/month', tagline: 'For small shops.', features: ['Unlimited', 'GSTIN verify (50)', 'Aadhaar KYC', 'Client portal'], popular: true, cta: 'Start Growth' },
  { name: 'Pro', price: '999', period: '/month', tagline: 'For startups.', features: ['Everything in Growth', 'Unlimited GSTIN', 'GSTR export', 'Priority'], cta: 'Start Pro' },
  { name: 'Business', price: '2499', period: '/month', tagline: 'For enterprises.', features: ['Everything in Pro', 'Unlimited Aadhaar', 'API access', 'Dedicated manager'], cta: 'Contact Sales' },
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
    <div className="min-h-screen bg-[#fafaf8] text-[#1c1c1e] font-sans">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#fafaf8]/95 backdrop-blur-md border-b border-black/5 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/billZo_logo.png" alt="BillZo" width={1000} height={1000} className="w-9 h-9 object-contain" />
            <span className="text-xl font-bold">BillZo</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/start" className="text-sm font-medium text-[#3a3a3c]">Features</Link>
            <Link href="/start" className="text-sm font-medium text-[#3a3a3c]">Pricing</Link>
            <Link href="/start" className="text-sm font-medium text-[#3a3a3c]">Aadhaar KYC</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/start" className="px-4 py-2 border border-indigo-300 rounded-lg text-sm font-medium text-indigo-700">Sign In</Link>
            <Link href="/start" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">Start Free →</Link>
          </div>
        </div>
      </nav>

      <section className="pt-40 pb-20 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full px-4 py-2 text-sm font-medium text-indigo-700 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              GST-Ready · Aadhaar Verified
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl font-bold mb-4">
              Billing that<br />
              <em className="text-indigo-600 not-italic">understands</em><br />
              Indian business
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="text-xl text-indigo-400 font-medium mb-8">
              BillZo – Sahi bill. Safe deal.
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-lg text-[#3a3a3c] mb-8 max-w-lg">
              Create GST invoices, verify GSTIN and Aadhaar, file returns—all in one clean workspace.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-4">
              <Link href="/start" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700">Start Free →</Link>
              <button className="px-6 py-3 bg-transparent border border-[#d1d1d6] rounded-xl font-medium">▶ Demo</button>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <div className="absolute top-4 right-4 bg-white rounded-xl p-4 shadow-lg border border-[#e5e5ea] z-20">
              <div className="text-xs font-semibold text-[#3a3a3c] uppercase mb-1">Business Verified</div>
              <div className="text-sm font-bold text-indigo-900">27AABCU9603R1ZX</div>
              <div className="mt-2 inline-flex items-center gap-1 bg-emerald-100 text-emerald-600 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Active</div>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden -rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="bg-[#0f0a2e] px-5 py-3 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                </div>
                <div className="flex-1 bg-white/10 rounded h-5 flex items-center px-3">
                  <span className="text-xs text-white/50">app.billzo.in/dashboard</span>
                </div>
              </div>
              <div className="p-5 bg-[#f7f6f2]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-bold text-indigo-900">BillZo</span>
                  <span className="text-xs font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-2 py-1 rounded-full">✓ GST Ready</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]">
                    <div className="text-xs text-[#8e8e93] font-semibold uppercase mb-1">Revenue</div>
                    <div className="text-xl font-bold text-indigo-900">₹2.4L</div>
                    <div className="text-xs text-emerald-600 font-semibold">↑ 18%</div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]">
                    <div className="text-xs text-[#8e8e93] font-semibold uppercase mb-1">Invoices</div>
                    <div className="text-xl font-bold text-indigo-900">142</div>
                    <div className="text-xs text-emerald-600 font-semibold">↑ 24</div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]">
                    <div className="text-xs text-[#8e8e93] font-semibold uppercase mb-1">GST Due</div>
                    <div className="text-xl font-bold text-indigo-900">₹18.2K</div>
                    <div className="text-xs text-amber-600 font-semibold">Due Dec 20</div>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-indigo-950 to-indigo-800 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">🏢</div>
                  <div className="flex-1">
                    <div className="text-xs text-white/50 font-semibold">Your GSTIN</div>
                    <div className="text-sm font-bold text-white">27AABCU9603R1ZX</div>
                  </div>
                  <span className="text-xs font-bold bg-emerald-500 text-white px-2 py-1 rounded">✓ Verified</span>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 -left-4 bg-white rounded-xl p-4 shadow-lg border border-[#e5e5ea] flex items-center gap-3 animate-bounce">
              <span className="text-2xl">🎉</span>
              <div>
                <div className="text-xs font-bold text-[#1c1c1e]">Invoice Sent!</div>
                <div className="text-xs text-[#8e8e93]">₹12,400 · GST</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="bg-indigo-950 px-8 py-5 flex items-center gap-8 overflow-x-auto">
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

      <section className="py-24 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-indigo-500 mb-4">Core Features</div>
            <h2 className="text-4xl font-bold mb-8">Built for how India actually works</h2>
            <div className="flex flex-col gap-3">
              {features.map((f, i) => (
                <div key={i} onClick={() => setActiveFeature(i)} className={`p-5 rounded-xl cursor-pointer transition-all border-2 ${activeFeature === i ? 'bg-white border-indigo-200 shadow-lg' : 'border-transparent hover:bg-white/50'}`}>
                  <div className="text-xs font-bold text-indigo-500 uppercase mb-1">{f.num} / {f.title}</div>
                  <div className="text-base font-bold text-indigo-900 mb-1">{f.title}</div>
                  <div className="text-sm text-[#636366]">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e5e5ea] shadow-xl overflow-hidden">
            <div className="bg-indigo-950 px-6 py-4 flex items-center gap-3">
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
                    <div className="flex-1 bg-[#f7f6f2] rounded-lg p-3 border border-[#e5e5ea]">
                      <div className="text-xs text-[#8e8e93] font-semibold uppercase mb-1">Client</div>
                      <div className="text-sm font-semibold text-[#3a3a3c]">Mehta Textiles</div>
                    </div>
                    <div className="flex-1 bg-[#f7f6f2] rounded-lg p-3 border border-[#e5e5ea]">
                      <div className="text-xs text-[#8e8e93] font-semibold uppercase mb-1">No.</div>
                      <div className="text-sm font-semibold text-[#3a3a3c]">BZ-0142</div>
                    </div>
                  </div>
                  <table className="w-full mb-4">
                    <thead>
                      <tr className="border-b border-[#e5e5ea]">
                        <th className="text-left py-2 text-xs font-semibold uppercase">Item</th>
                        <th className="text-left py-2 text-xs font-semibold uppercase">Qty</th>
                        <th className="text-right py-2 text-xs font-semibold uppercase">Rate</th>
                        <th className="text-right py-2 text-xs font-semibold uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#f7f6f2]">
                        <td className="py-2 text-sm">Linen Fabric</td>
                        <td className="py-2 text-sm">12m</td>
                        <td className="py-2 text-sm text-right">₹2,200</td>
                        <td className="py-2 text-sm text-right">₹26,400</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex gap-2 mb-4">
                    <span className="bg-emerald-100 text-emerald-600 text-xs font-semibold px-2 py-1 rounded-full">CGST 9% = ₹2,448</span>
                    <span className="bg-emerald-100 text-emerald-600 text-xs font-semibold px-2 py-1 rounded-full">SGST 9% = ₹2,448</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t-2 border-[#e5e5ea]">
                    <span className="text-sm font-semibold text-[#636366]">Total</span>
                    <span className="text-2xl font-bold text-indigo-900">₹32,096</span>
                  </div>
                </div>
              )}
              {activeFeature === 1 && (
                <div>
                  <div className="flex gap-3 mb-5">
                    <input value={gstinInput} onChange={(e) => setGstinInput(e.target.value)} className="flex-1 bg-[#f7f6f2] border-2 border-[#e5e5ea] rounded-xl px-4 py-3 text-sm font-semibold tracking-widest" placeholder="Enter GSTIN" />
                    <button onClick={showGstinResult} className="bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-semibold">Verify →</button>
                  </div>
                  {gstinResult && (
                    <div className="bg-[#f7f6f2] border border-[#e5e5ea] rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full">✓ Verified</span>
                        <span className="text-lg font-bold text-indigo-900">Mehta Textiles Pvt Ltd</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-xs text-[#8e8e93] font-semibold uppercase">State</div><div className="text-sm font-semibold">Maharashtra</div></div>
                        <div><div className="text-xs text-[#8e8e93] font-semibold uppercase">Status</div><div className="text-sm font-semibold text-emerald-600">Active</div></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeFeature === 2 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-gradient-to-r from-orange-500 to-green-600 rounded-lg px-3 py-1.5 text-white text-xs font-bold">आधार</div>
                    <span className="text-base font-semibold">Aadhaar Verification</span>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-[#636366] font-semibold uppercase mb-2">Aadhaar Number</div>
                    <input value="XXXX XXXX 4821" readOnly className="w-full bg-[#f7f6f2] border-2 border-[#e5e5ea] rounded-xl px-4 py-3 text-base font-semibold tracking-widest" />
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-[#636366] font-semibold uppercase mb-2">One-Time Password</div>
                    <div className="flex gap-2">
                      {['8', '4', '2', '1', '', ''].map((v, i) => (
                        <div key={i} className={`w-11 h-13 bg-[#f7f6f2] border-2 ${v ? 'border-indigo-300 bg-indigo-50' : 'border-[#e5e5ea]'} rounded-xl flex items-center justify-center text-lg font-bold`}>
                          {v || '_'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="w-full bg-indigo-600 text-white py-4 rounded-xl text-base font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">
                    🔒 Verify Aadhaar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-8 bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-emerald-400 mb-4">GSTIN Intelligence</div>
            <h2 className="text-4xl font-bold mb-4">Know who you're dealing with</h2>
            <p className="text-base text-white/65 mt-5 mb-8">
              Instantly verify any GSTIN before raising an invoice. BillZo pulls live data from the GSTN portal.
            </p>
            <div className="flex flex-col gap-4">
              {['Live GSTN lookup', 'Auto-fills invoice', 'Flags suspicious GSTINs'].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">✓</div>
                  <div className="text-sm text-white/80">{item}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur">
              <div className="text-lg font-bold text-white mb-6">GSTIN Instant Check</div>
              <input className="w-full bg-white/8 border border-white/15 rounded-xl px-5 py-4 text-sm font-semibold text-white placeholder-white/30 mb-4" placeholder="Enter GSTIN" />
              <button className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-4 rounded-xl text-base font-bold">→ Verify Now</button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-8 bg-[#fafaf8]">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-12">
            <div className="text-xs font-bold tracking-widest uppercase text-indigo-500 mb-4">Pricing</div>
            <h2 className="text-4xl font-bold">Transparent pricing.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, i) => (
              <div key={i} className={`bg-white rounded-2xl p-6 border-2 transition-all hover:-translate-y-1 hover:shadow-xl ${plan.popular ? 'border-indigo-400 shadow-lg' : 'border-[#e5e5ea]'}`}>
                {plan.popular && <div className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">⚡ Popular</div>}
                <div className="text-sm font-bold text-[#636366] uppercase mb-2">{plan.name}</div>
                <div className="mb-2">
                  <span className="text-xl font-semibold text-indigo-700">₹</span>
                  <span className="text-4xl font-bold text-indigo-900">{plan.price}</span>
                </div>
                <div className="text-xs text-[#8e8e93] mb-4">{plan.period}</div>
                <div className="text-sm text-[#636366] mb-6 min-h-[40px]">{plan.tagline}</div>
                <div className="h-px bg-[#e5e5ea] mb-6"></div>
                <div className="flex flex-col gap-2 mb-6">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2 text-sm text-[#636366]">
                      <span className="text-emerald-500">✓</span> {f}
                    </div>
                  ))}
                </div>
                <button className={`w-full py-3 rounded-lg text-sm font-semibold transition ${plan.popular ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50'}`}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-8 bg-[#fafaf8]">
        <div className="max-w-xl mb-12">
          <div className="text-xs font-bold tracking-widest uppercase text-indigo-500 mb-4">Security</div>
          <h2 className="text-4xl font-bold">Your data is safer here.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {securityCards.map((card, i) => (
            <div key={i} className="bg-white rounded-2xl p-8 border border-[#e5e5ea] hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl transition">
              <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl mb-5">{card.icon}</div>
              <div className="text-lg font-bold mb-2">{card.title}</div>
              <div className="text-sm text-[#636366] mb-4">{card.desc}</div>
              <span className="inline-block bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full">{card.chip}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="py-32 px-8 bg-gradient-to-br from-indigo-950 via-[#1e0a5e] to-indigo-900 text-center relative overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(79,53,189,0.4)_0%,transparent_70%)] pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-5xl font-bold text-white mb-4">Shuru karo aaj.</h2>
          <p className="text-lg text-white/60 mb-12">First invoice free.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button className="px-9 py-4 bg-white text-indigo-900 rounded-xl text-base font-bold hover:shadow-lg hover:shadow-white/10 transition">Create Free Account →</button>
            <button className="px-7 py-4 bg-transparent border border-white/25 text-white/85 rounded-xl text-base font-semibold hover:border-white/50">Talk to Expert</button>
          </div>
          <p className="text-sm text-white/40 mt-6">No credit card · No setup fee</p>
        </div>
      </section>

      <footer className="bg-indigo-950 px-8 py-12 border-t border-white/6">
        <div className="max-w-7xl mx-auto flex justify-between items-start gap-10 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">B</span>
              </div>
              <span className="text-xl font-bold text-white">BillZo</span>
            </div>
            <p className="text-xs text-white/40 max-w-[220px]">Sahi bill. Safe deal. India's most trusted GST billing platform.</p>
          </div>
          <div className="flex gap-12 flex-wrap">
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Product</div>
              {['Invoicing', 'GSTIN Verify', 'Aadhaar KYC', 'Pricing'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Company</div>
              {['About', 'Blog', 'Careers'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Support</div>
              {['Help', 'API Docs', 'Status'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80">{l}</Link>)}
            </div>
            <div>
              <div className="text-xs font-bold text-white/60 uppercase mb-4">Legal</div>
              {['Privacy', 'Terms', 'DPDP'].map(l => <Link key={l} href="/start" className="block text-sm text-white/50 mb-2 hover:text-white/80">{l}</Link>)}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto flex justify-between items-center pt-6 border-t border-white/6 mt-10 flex-wrap gap-4">
          <p className="text-xs text-white/30">© 2024 BillZo Technologies Pvt Ltd · Made in India</p>
          <div className="flex gap-3">
            {['GSTN', 'UIDAI', 'DPDP'].map(c => (
              <span key={c} className="bg-white/6 border border-white/10 text-white/50 text-xs font-semibold px-3 py-1 rounded-full">{c}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}