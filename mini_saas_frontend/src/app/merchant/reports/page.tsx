'use client'

import React, { useState } from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText, 
  Users, 
  Clock, 
  Download, 
  ChevronDown,
  Filter,
  MoreVertical,
  ArrowUpRight,
  ShieldCheck,
  Send
} from 'lucide-react'
import { CAPackage } from '@/components/reports/CAPackage'

// Data based on the provided dashboard image
const CATEGORY_DATA = [
  { name: 'Electronics', value: 45, color: '#6366f1' },
  { name: 'Groceries', value: 30, color: '#10b981' },
  { name: 'Apparel', value: 15, color: '#f59e0b' },
  { name: 'Others', value: 10, color: '#94a3b8' },
]

const TOP_CUSTOMERS = [
  { name: 'Anjali Sharma', orders: 12, total: 45200 },
  { name: 'Arjun Kumar', orders: 8, total: 32150 },
  { name: 'Meera Gupta', orders: 15, total: 28400 },
  { name: 'TechCorp Solutions', orders: 5, total: 24500 },
]

const REVENUE_EXPENSE_DATA = [
  { month: 'Jan', revenue: 45000, expense: 32000 },
  { month: 'Feb', revenue: 52000, expense: 38000 },
  { month: 'Mar', revenue: 48000, expense: 41000 },
  { month: 'Apr', revenue: 61000, expense: 45000 },
  { month: 'May', revenue: 55000, expense: 42000 },
  { month: 'Jun', revenue: 67000, expense: 48000 },
  { month: 'Jul', revenue: 72000, expense: 51000 },
]

export default function ReportsPage() {
  const [showCAPackage, setShowCAPackage] = useState(false)
  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`

  return (
    <div className="space-y-8 pb-10 animate-in">
      {showCAPackage && <CAPackage onClose={() => setShowCAPackage(false)} />}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Financial Reports</h1>
          <p className="text-slate-500 text-sm font-medium">Detailed overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowCAPackage(true)}
            className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 px-5 py-2.5 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            Generate CA Package
          </button>
          <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-slate-200 hover:scale-[1.02] transition-all active:scale-95">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Revenue', value: 242000, change: '+12.5%', icon: DollarSign, color: 'indigo' },
          { label: 'Net Profit', value: 84500, change: '+8.2%', icon: TrendingUp, color: 'emerald' },
          { label: 'Total Invoices', value: 1248, change: '+5%', icon: FileText, color: 'slate' },
          { label: 'Pending Payments', value: 33786, change: '-2.4%', icon: Clock, color: 'rose' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-center mb-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-black ${stat.change.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                {stat.change.startsWith('+') ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{stat.label}</p>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{stat.label.includes('Invoices') ? stat.value.toLocaleString() : formatCurrency(stat.value)}</h3>
          </div>
        ))}
      </div>

      {/* Middle Row: Category Pie and Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Category */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Revenue by Category</h3>
            <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-[220px] w-full md:w-1/2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={CATEGORY_DATA}
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {CATEGORY_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black text-slate-900">74%</span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Growth</span>
              </div>
            </div>
            
            <div className="w-full md:w-1/2 space-y-4">
              {CATEGORY_DATA.map((item, i) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{item.name}</span>
                  </div>
                  <span className="text-sm font-black text-slate-900">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Top Customers</h3>
            <button className="text-xs font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-600 transition-colors">
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Orders</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {TOP_CUSTOMERS.map((customer, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                          {customer.name[0]}
                        </div>
                        <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{customer.name}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center font-bold text-slate-600 text-sm">
                      {customer.orders}
                    </td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 text-sm">
                      {formatCurrency(customer.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Row: Revenue vs Expense Bar Chart */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Revenue vs Expense</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Monthly comparison</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm shadow-indigo-100" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-200" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expense</span>
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={REVENUE_EXPENSE_DATA} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }}
                tickFormatter={(val) => `₹${val/1000}k`}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'black' }}
              />
              <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={20} />
              <Bar dataKey="expense" fill="#e2e8f0" radius={[6, 6, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
