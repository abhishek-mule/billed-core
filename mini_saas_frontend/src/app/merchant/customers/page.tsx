'use client'

import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Users, 
  Phone, 
  ArrowUpRight, 
  ArrowRight,
  MoreHorizontal, 
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Wallet
} from 'lucide-react'
import { useCustomers } from '@/hooks/useApi'
import { formatINR, formatINRCompact } from '@/lib/api-client'
import { TableSkeleton } from '@/components/ui/Skeleton'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useCustomers(search, 50)
  const customers = data?.data || []

  // Stats derived from data
  const totalCustomers = customers.length
  // Assuming a generic calculation for outstanding if not returned by API
  const totalOutstanding = 0 // Update this when backend returns actual total outstanding
  const activeLoyalty = customers.filter(c => c.totalSales > 10000).length

  return (
    <div className="space-y-6 pb-20 animate-in slide-in-from-right-2 max-w-7xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Customer Intelligence</h1>
          <p className="text-muted-foreground text-sm">Manage customer relations, loyalty, and outstanding ledgers.</p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm shadow-glow hover:opacity-90 transition-all">
          <Plus className="w-4 h-4" />
          Add New Customer
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
               <Users className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Customers</p>
               <h3 className="text-2xl font-bold text-foreground tracking-tight">{totalCustomers}</h3>
            </div>
         </div>
         <div className="bg-warning-soft p-6 rounded-2xl border border-warning/20 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-5">
               <div className="w-14 h-14 rounded-2xl bg-card text-warning shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wallet className="w-7 h-7" />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Total Outstanding</p>
                  <h3 className="text-2xl font-bold text-warning-foreground tracking-tight">{formatINRCompact(totalOutstanding)}</h3>
               </div>
            </div>
            <ArrowRight className="w-5 h-5 text-warning/50" />
         </div>
         <div className="bg-success-soft p-6 rounded-2xl border border-success/20 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-card text-success shadow-sm flex items-center justify-center">
               <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1">Active Loyalty</p>
               <h3 className="text-2xl font-bold text-success-foreground tracking-tight">{activeLoyalty} <span className="text-xs text-success font-semibold ml-1">Members</span></h3>
            </div>
         </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
         <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input 
               type="text" 
               placeholder="Search by name, phone number, or email..." 
               className="w-full bg-card border border-border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
            />
         </div>
         <div className="flex items-center gap-2 bg-card p-1 rounded-2xl border border-border shadow-sm w-full md:w-auto">
            <button className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-md transition-all">All</button>
            <button className="px-6 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-all">Debtors</button>
            <button className="px-6 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-all">Loyalty</button>
         </div>
      </div>

      {/* Customer Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="bg-muted/50 border-b border-border">
                     <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Customer Profile</th>
                     <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Spend</th>
                     <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Status</th>
                     <th className="px-8 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-16"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <TableSkeleton rows={4} cols={4} />
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-12 text-center text-muted-foreground text-sm">
                        {search ? 'No customers match your search.' : 'No customers yet.'}
                      </td>
                    </tr>
                  ) : (
                    customers.map((cust: any) => (
                       <tr key={cust.id} className="group hover:bg-muted/40 transition-all cursor-pointer">
                          <td className="px-8 py-5">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-semibold text-sm group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                   {cust.name?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                   <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{cust.name}</p>
                                   <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                      <Phone className="w-3 h-3" /> {cust.phone || 'N/A'}
                                   </p>
                                </div>
                             </div>
                          </td>
                          <td className="px-8 py-5">
                             <p className="text-sm font-bold text-foreground">{formatINR(cust.totalSales || 0)}</p>
                          </td>
                          <td className="px-8 py-5 text-center">
                             <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                                (cust.totalSales || 0) > 10000 ? 'bg-primary/10 text-primary border-primary/20' :
                                'bg-secondary text-secondary-foreground border-border'
                             }`}>
                                {(cust.totalSales || 0) > 10000 ? 'Loyal' : 'Regular'}
                             </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                             <button className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                                <MoreHorizontal className="w-4 h-4" />
                             </button>
                          </td>
                       </tr>
                    ))
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  )
}