'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const features = [
  {
    icon: '⚡',
    title: 'Create bills in 6 seconds',
    description: 'Mobile-first interface designed for speed. No desktop required.'
  },
  {
    icon: '📱',
    title: 'Works on your phone',
    description: 'Invoice from anywhere. Internet shops, kirana stores, mobile repairs.'
  },
  {
    icon: '💬',
    title: 'WhatsApp reminders',
    description: 'Automatic payment reminders sent to customers. No chasing required.'
  },
  {
    icon: '✅',
    title: 'GST ready instantly',
    description: 'Compliant invoices generated automatically. GSTR-1 filing supported.'
  },
  {
    icon: '📊',
    title: 'Smart inventory',
    description: 'Low stock alerts. Know what to reorder before you run out.'
  },
  {
    icon: '🔄',
    title: 'Real-time sync',
    description: 'All devices updated instantly. Shop and home, always in sync.'
  }
]

const stats = [
  { value: '6s', label: 'Invoice creation time' },
  { value: '0%', label: 'GST errors' },
  { value: '3x', label: 'Faster payment collection' }
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-xs font-black italic">B</span>
            </div>
            <span className="text-lg font-bold tracking-tight">Billed</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/start" className="text-sm text-gray-400 hover:text-white transition">
              Features
            </Link>
            <Link href="/start" className="text-sm text-gray-400 hover:text-white transition">
              Pricing
            </Link>
            <Link 
              href="/start" 
              className="px-4 py-2 bg-emerald-500 text-black text-sm font-bold rounded-full hover:bg-emerald-400 transition"
            >
              Try Demo Shop
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-medium text-indigo-400 mb-6">
              Built for Indian merchants
            </span>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-6 leading-tight">
              Create GST bills.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Get paid faster.
              </span>
            </h1>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              Billed handles your billing, reminders, and GST compliance so you can focus on your business. Not on paperwork.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                href="/start" 
                className="px-8 py-4 bg-emerald-500 text-black font-bold text-lg rounded-full hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20"
              >
                Try Free for 30 Days
              </Link>
              <Link 
                href="/merchant" 
                className="px-8 py-4 bg-white/5 border border-white/10 font-bold text-lg rounded-full hover:bg-white/10 transition"
              >
                Try Demo Shop
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-20 grid grid-cols-3 gap-8"
          >
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl font-black text-emerald-400">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">
            Everything you need to run your shop
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-6 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/20 transition"
              >
                <span className="text-3xl mb-4 block">{feature.icon}</span>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            Works on your phone
          </h2>
          <p className="text-gray-400 mb-10 max-w-2xl mx-auto">
            No desktop required. No training needed. Just open and create invoices.
          </p>
          <div className="bg-white/5 border border-white/5 rounded-3xl p-8 max-w-md mx-auto">
            <div className="aspect-[9/16] bg-gradient-to-b from-gray-900 to-black rounded-2xl flex items-center justify-center text-gray-600">
              Mobile preview coming soon
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-10 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Start selling smarter today
            </h2>
            <p className="text-gray-400 mb-8">
              Free for 30 days. No credit card required.
            </p>
            <Link 
              href="/start" 
              className="inline-block px-8 py-4 bg-indigo-500 text-white font-bold text-lg rounded-full hover:bg-indigo-400 transition"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-2xl font-bold">₹0</p>
              <p className="text-sm text-gray-500 mt-1">Free forever</p>
              <p className="text-xs text-gray-600 mt-2">50 invoices/month</p>
            </div>
            <div className="bg-white/5 border border-indigo-500/20 rounded-2xl p-6 -mt-4 -mb-4">
              <span className="inline-block px-2 py-0.5 bg-indigo-500 text-xs font-bold rounded mb-2">POPULAR</span>
              <p className="text-2xl font-bold mt-2">₹299</p>
              <p className="text-sm text-gray-500 mt-1">per month</p>
              <p className="text-xs text-gray-600 mt-2">500 invoices + reminders</p>
            </div>
            <div>
              <p className="text-2xl font-bold">₹599</p>
              <p className="text-sm text-gray-500 mt-1">per month</p>
              <p className="text-xs text-gray-600 mt-2">Unlimited + multi-location</p>
            </div>
            <div>
              <p className="text-2xl font-bold">Custom</p>
              <p className="text-sm text-gray-500 mt-1">Contact us</p>
              <p className="text-xs text-gray-600 mt-2">Enterprise features</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-xs font-black italic">B</span>
            </div>
            <span className="text-lg font-bold tracking-tight">Billed</span>
          </div>
          <p className="text-sm text-gray-500">
            Built for Indian merchants 🇮🇳
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/start" className="hover:text-white transition">Privacy</Link>
            <Link href="/start" className="hover:text-white transition">Terms</Link>
            <Link href="/start" className="hover:text-white transition">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}