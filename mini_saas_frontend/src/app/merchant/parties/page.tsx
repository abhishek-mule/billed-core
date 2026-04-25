'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  Users, 
  Search, 
  Plus, 
  MoreHorizontal, 
  ChevronRight, 
  Phone, 
  MessageCircle,
  Building2,
  ArrowUpRight,
  TrendingDown
} from 'lucide-react'

const mockParties = [
  { id: '1', name: 'Ramesh Hardware & Tools', phone: '+91 98765 43210', balance: 45200, type: 'CUSTOMER', status: 'OVERDUE' },
  { id: '2', name: 'Balaji Traders', phone: '+91 98765 43211', balance: -12000, type: 'SUPPLIER', status: 'HEALTHY' },
  { id: '3', name: 'Meera Sharma', phone: '+91 98765 43212', balance: 2150, type: 'CUSTOMER', status: 'HEALTHY' },
  { id: '4', name: 'TechCorp Solutions', phone: '+91 98765 43213', balance: 112400, type: 'CUSTOMER', status: 'OVERDUE' },
  { id: '5', name: 'Priya Kreations', phone: '+91 98765 43214', balance: 0, type: 'CUSTOMER', status: 'HEALTHY' },
]

export default function PartiesPage() {
  const [search, setSearch] = useState('')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Parties & Ledgers</h1>
          <p className="text-gray-500 text-sm font-medium italic">Manage your customers and suppliers in one place.</p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
          <Plus className="w-4 h-4" />
          Add New Party
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">To Receive (Market)</span>
                <span className="text-2xl font-black text-rose-600">₹1,12,400</span>
              </div>
            </div>
            <Link href="/merchant/reports" className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </Link>
         </div>
         <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">To Pay (Suppliers)</span>
                <span className="text-2xl font-black text-emerald-600">₹12,000</span>
              </div>
            </div>
            <Link href="/merchant/reports" className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </Link>
         </div>
      </div>

      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-300 group-focus-within:text-primary transition-colors" />
        <input 
          type="text" 
          placeholder="Search parties by name or phone..." 
          className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-4 ring-primary/0 focus:ring-primary/5 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Parties List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockParties.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((party) => (
          <Link 
            key={party.id} 
            href={`/merchant/parties/${party.id}`}
            className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 opacity-[0.03] transition-transform group-hover:scale-110 ${
              party.balance > 0 ? 'bg-rose-500' : party.balance < 0 ? 'bg-emerald-500' : 'bg-gray-500'
            }`} />
            
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                <Building2 className="w-6 h-6" />
              </div>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                party.type === 'CUSTOMER' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'
              }`}>
                {party.type}
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-black text-gray-900 leading-tight mb-1 group-hover:text-primary transition-colors truncate">{party.name}</h3>
              <p className="text-xs text-gray-400 font-medium">{party.phone}</p>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Current Balance</span>
                <span className={`text-xl font-black ${
                  party.balance > 0 ? 'text-rose-600' : party.balance < 0 ? 'text-emerald-600' : 'text-gray-900'
                }`}>
                  {party.balance > 0 ? '+' : ''}{formatCurrency(Math.abs(party.balance))}
                </span>
                <span className="text-[10px] text-gray-400 font-bold ml-1 uppercase">
                   {party.balance > 0 ? 'Receive' : party.balance < 0 ? 'Pay' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                 <button className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                   <MessageCircle className="w-4 h-4" />
                 </button>
                 <button className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-gray-100 transition-all">
                   <Phone className="w-4 h-4" />
                 </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
