'use client'

import { useState } from 'react'
import { 
  Building2, 
  CreditCard, 
  Users, 
  MessageSquare, 
  Monitor, 
  ShieldCheck, 
  Plus, 
  Upload, 
  CheckCircle2, 
  ChevronRight,
  Save,
  Pencil
} from 'lucide-react'

const navItems = [
  { id: 'profile', label: 'Business Profile', icon: Building2, active: true },
  { id: 'billing', label: 'Billing & Payments', icon: CreditCard },
  { id: 'team', label: 'Team & Roles', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp Engine', icon: MessageSquare, category: 'INTEGRATIONS' },
  { id: 'devices', label: 'Hardware Devices', icon: Monitor, category: 'INTEGRATIONS' },
]

export default function SettingsPage() {
  const [whatsappEnabled, setWhatsappEnabled] = useState(true)

  return (
    <div className="flex flex-col h-full animate-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Business Settings</h1>
          <p className="text-gray-500 text-sm font-medium italic">Manage your account and preferences.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
            <CheckCircle2 className="w-3 h-3" />
            All changes auto-saved
          </div>
          <button className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar */}
        <div className="lg:col-span-3 space-y-8">
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Configuration</span>
            <nav className="space-y-1">
              {navItems.filter(i => !i.category).map((item) => (
                <button
                  key={item.id}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    item.active ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm font-bold">{item.label}</span>
                  </div>
                  {item.active && <ChevronRight className="w-4 h-4" />}
                </button>
              ))}
            </nav>
          </div>

          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Integrations</span>
            <nav className="space-y-1">
              {navItems.filter(i => i.category === 'INTEGRATIONS').map((item) => (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all"
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm font-bold">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Form */}
        <div className="lg:col-span-9 space-y-8 pb-20">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="mb-8">
               <h3 className="text-lg font-black text-gray-900 tracking-tight mb-1">Legal Identity</h3>
               <p className="text-xs text-gray-400 font-medium tracking-tight uppercase">This information is printed on all official documents.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              <div className="md:col-span-3 flex flex-col items-center">
                 <div className="w-32 h-32 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 transition-colors group">
                   <Upload className="w-6 h-6 text-gray-300 group-hover:text-primary transition-colors" />
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upload Logo</span>
                 </div>
              </div>

              <div className="md:col-span-9 space-y-6">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Business Legal Name</label>
                   <input type="text" defaultValue="TechCorp Solutions Pvt Ltd" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-primary/10" />
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">GSTIN</label>
                        <span className="text-[9px] font-black text-emerald-500 uppercase px-1.5 py-0.5 bg-emerald-50 rounded border border-emerald-100">Auto-Verified</span>
                      </div>
                      <div className="relative">
                        <input type="text" defaultValue="27AABCT98765C1Z5" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-primary/10" />
                        <ShieldCheck className="absolute right-4 top-3.5 w-4 h-4 text-emerald-500" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">PAN Number</label>
                      <input type="text" defaultValue="AABCT98765C" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-primary/10" />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Registered Address</label>
                    <textarea rows={2} defaultValue="142, Horizon Tech Park, MIDC Andheri East" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-primary/10 resize-none" />
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">City</label>
                      <input type="text" defaultValue="Mumbai" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">State</label>
                      <input type="text" defaultValue="Maharashtra" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">PIN Code</label>
                      <input type="text" defaultValue="400093" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none" />
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Automation Card */}
          <div className="bg-indigo-600 rounded-3xl p-8 shadow-xl shadow-indigo-600/20 text-white flex items-center justify-between group overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 transition-transform group-hover:scale-110" />
            <div className="relative z-10 flex-1">
              <h3 className="text-xl font-black tracking-tight mb-2">Auto-send Invoice on WhatsApp</h3>
              <p className="text-indigo-100 text-sm font-medium max-w-md">Instantly deliver PDFs and Payment Links when an invoice is saved. No manual effort required.</p>
            </div>
            <div className="relative z-10">
               <button 
                onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${whatsappEnabled ? 'bg-emerald-400' : 'bg-indigo-400'}`}
               >
                 <div className={`w-6 h-6 bg-white rounded-full transition-transform shadow-lg ${whatsappEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
               </button>
            </div>
          </div>

          {/* Preview Section */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
               <div>
                 <h3 className="text-lg font-black text-gray-900 tracking-tight mb-1">Customer Communication Preview</h3>
                 <p className="text-xs text-gray-400 font-medium tracking-tight uppercase">This is what your clients see when they receive an invoice.</p>
               </div>
               <button className="flex items-center gap-2 text-gray-500 hover:text-primary transition-colors font-bold text-sm">
                 <Pencil className="w-4 h-4" />
                 Edit Template
               </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex items-center justify-center min-h-[200px] text-gray-400 font-medium italic">
               Template Preview Loading...
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}