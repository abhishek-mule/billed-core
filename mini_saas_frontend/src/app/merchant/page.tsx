'use client'

import { TodaySnapshot } from '@/components/dashboard/TodaySnapshot'
import { SyncHealthBanner } from '@/components/dashboard/SyncHealthBanner'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { RecentInvoices } from '@/components/dashboard/RecentInvoices'
import { GSTReadinessCard } from '@/components/dashboard/GSTReadinessCard'
import { ERPConnectionStatus } from '@/components/dashboard/ERPConnectionStatus'
import { TrendingUp } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-6 pb-2">
      {/* Revenue Snapshot - Matching Screenshot 4 */}
      <div className="flex flex-col items-center justify-center py-2">
        <div className="flex items-center gap-1.5 text-blue-600 font-bold mb-1">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wider">Today:</span>
        </div>
        <h2 className="text-3xl font-black text-[#1A1C1E]">₹28,450</h2>
      </div>

      <RecentInvoices />
      
      <div className="grid gap-4 md:grid-cols-2 mt-8 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500">
        <div className="space-y-4">
          <TodaySnapshot />
          <QuickActions />
        </div>
        <div className="space-y-4">
          <GSTReadinessCard />
          <ERPConnectionStatus />
          <SyncHealthBanner />
        </div>
      </div>
    </div>
  )
}