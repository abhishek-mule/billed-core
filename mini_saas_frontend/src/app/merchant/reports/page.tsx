'use client'

import React, { useState } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText, 
  Users, 
  Clock, 
  Download, 
  Filter,
  MoreVertical,
  ArrowUpRight,
  ShieldCheck,
  BarChart3,
  AlertCircle
} from 'lucide-react'
import { CAPackage } from '@/components/reports/CAPackage'
import { useDashboardStats, useCustomers } from '@/hooks/useApi'
import { formatINR } from '@/lib/api-client'
import { StatCardSkeleton } from '@/components/ui/Skeleton'

export default function ReportsPage() {
  const [showCAPackage, setShowCAPackage] = useState(false)
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: customersData, isLoading: customersLoading } = useCustomers('', 5)
  
  const stats = statsData?.stats
  const topCustomers = customersData?.data?.sort((a: any, b: any) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 4) || []

  return (
    <div className="space-y-6 pb-10 animate-in slide-in-from-right-2 max-w-7xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
      {showCAPackage && <CAPackage onClose={() => setShowCAPackage(false)} />}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground text-sm">Detailed overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowCAPackage(true)}
            className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-primary/20 transition-all shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            Generate CA Package
          </button>
          <button 
            onClick={() => window.open('/api/export?type=invoices&format=csv')}
            className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-muted transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Data
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-success-soft text-success">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-1">Today's Revenue</p>
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{formatINR(stats?.revenue || 0)}</h3>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-1">Today's Invoices</p>
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{stats?.invoiceCount || 0}</h3>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-warning-soft text-warning">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-1">Pending Sync</p>
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{stats?.pendingCount || 0}</h3>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-1">Failed Syncs</p>
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{stats?.totalFailedCount || 0}</h3>
            </div>
          </>
        )}
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Data Placeholder */}
        <div className="bg-card p-8 rounded-2xl border border-border shadow-sm flex flex-col items-center justify-center text-center min-h-[300px]">
          <BarChart3 className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Category Analytics</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Categorized revenue breakdown is being calculated. Check back after more invoices are processed.
          </p>
        </div>

        {/* Top Customers */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[300px]">
          <div className="px-8 py-6 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Top Customers</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Customer</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customersLoading ? (
                  <tr>
                    <td colSpan={2} className="px-8 py-8 text-center text-sm text-muted-foreground">Loading...</td>
                  </tr>
                ) : topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-8 py-8 text-center text-sm text-muted-foreground">No customers yet</td>
                  </tr>
                ) : (
                  topCustomers.map((customer: any) => (
                    <tr key={customer.id} className="hover:bg-muted/40 transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                            {customer.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right font-bold text-foreground text-sm">
                        {formatINR(customer.totalSales || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
