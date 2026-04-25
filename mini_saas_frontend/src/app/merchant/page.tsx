'use client'

import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { SyncHealthBanner } from '@/components/dashboard/SyncHealthBanner'
import { RecentInvoices } from '@/components/dashboard/RecentInvoices'
import { Database, Plus } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-8 pb-10">
      {/* Header with Stats Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-gray-500 text-sm font-medium">Welcome back, here's what's happening today.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Local Database</span>
              <span className="text-xs font-bold text-emerald-700 leading-none">Online</span>
            </div>
            <Database className="w-4 h-4 text-emerald-400 ml-2" />
          </div>

          <button className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
            <Plus className="w-4 h-4" />
            New Invoice
            <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded uppercase">Ctrl+N</span>
          </button>
        </div>
      </div>

      <SyncHealthBanner />
      
      <DashboardStats />

      <RecentInvoices />
    </div>
  )
}