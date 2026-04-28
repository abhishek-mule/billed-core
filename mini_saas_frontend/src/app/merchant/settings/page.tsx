'use client'

import { useState } from 'react'
import { 
  Search, 
  Building2, 
  FileText, 
  MessageSquare, 
  Users,
  ShieldCheck, 
  Printer, 
  Check,
  ChevronDown,
  ArrowRight,
  Bell,
  LogOut,
  Save,
  HelpCircle,
  Smartphone,
  CreditCard,
  Zap,
  Plus,
  Trash2,
  Lock,
  Mail,
  MapPin,
  Globe,
  Upload
} from 'lucide-react'

// --- Types ---
type SettingsTab = 'profile' | 'gst' | 'whatsapp' | 'team' | 'security' | 'billing' | 'print'

// --- Components for Sections ---

const ProfileSettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-10">
      <div className="flex flex-col md:flex-row gap-10 items-start">
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all group">
            <Upload className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">Change Logo</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold">Square PNG, max 1MB</p>
        </div>
        
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Business Name</label>
            <input type="text" defaultValue="Ravi Electronics" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Support Email</label>
            <input type="email" defaultValue="support@ravielectronics.in" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Contact Phone</label>
            <input type="text" defaultValue="+91 98765 43210" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Website URL</label>
            <div className="relative">
              <Globe className="absolute left-5 top-4 w-4 h-4 text-slate-300" />
              <input type="text" defaultValue="ravielectronics.in" className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Business Address</label>
        <textarea rows={3} defaultValue="Shop No. 12, Galaxy Mall, MIDC, Andheri East, Mumbai, Maharashtra - 400093" className="w-full bg-slate-50 border border-slate-100 rounded-3xl px-6 py-5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all resize-none" />
      </div>
    </div>
  </div>
)

const GSTSettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-8">
      <div className="flex items-center gap-4 p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h4 className="font-black text-slate-900 tracking-tight">GST Identity Verified</h4>
          <p className="text-xs text-slate-500 font-medium tracking-tight">Your GST details are synced with the government portal.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">GSTIN Number</label>
          <input type="text" defaultValue="27AABCT98765C1Z5" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 uppercase tracking-widest focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">PAN Number</label>
          <input type="text" defaultValue="AABCT98765C" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 uppercase tracking-widest focus:outline-none transition-all" />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tax Calculation Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all">
             <span className="text-sm font-bold text-slate-700">Intra-state GST</span>
             <input type="checkbox" defaultChecked className="w-5 h-5 accent-indigo-600" />
          </label>
          <label className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all">
             <span className="text-sm font-bold text-slate-700">Inter-state IGST</span>
             <input type="checkbox" defaultChecked className="w-5 h-5 accent-indigo-600" />
          </label>
          <label className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all">
             <span className="text-sm font-bold text-slate-700">Composition Scheme</span>
             <input type="checkbox" className="w-5 h-5 accent-indigo-600" />
          </label>
        </div>
      </div>
    </div>
  </div>
)

const WhatsAppSettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-black text-slate-900 tracking-tight">WhatsApp Templates</h4>
          <p className="text-xs text-slate-400 font-medium">Customize the messages your customers receive.</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95">
          <Plus className="w-3.5 h-3.5" />
          New Template
        </button>
      </div>

      <div className="space-y-6">
        {[
          { name: 'Invoice PDF Delivery', status: 'Approved', type: 'System' },
          { name: 'Payment Reminder', status: 'Approved', type: 'Automation' },
          { name: 'Loyalty Welcome', status: 'Pending', type: 'Marketing' },
        ].map((tpl, i) => (
          <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-emerald-500">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-sm tracking-tight">{tpl.name}</p>
                <div className="flex items-center gap-2 mt-1">
                   <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{tpl.type}</span>
                   <div className="w-1 h-1 rounded-full bg-slate-200" />
                   <span className={`text-[9px] font-black uppercase tracking-widest ${tpl.status === 'Approved' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {tpl.status}
                   </span>
                </div>
              </div>
            </div>
            <button className="p-2 text-slate-300 group-hover:text-slate-600 transition-colors">
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
)

const TeamSettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h4 className="font-black text-slate-900 tracking-tight">Staff & Permissions</h4>
          <p className="text-xs text-slate-400 font-medium">Manage who can access your POS and their roles.</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100">
          <Plus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      <div className="space-y-4">
        {[
          { name: 'Ravi Kumar', role: 'Owner', email: 'ravi@demo.in', active: true },
          { name: 'Sunil Sharma', role: 'Cashier', email: 'sunil@demo.in', active: true },
          { name: 'Meera Gupta', role: 'Accountant', email: 'meera@demo.in', active: false },
        ].map((user, i) => (
          <div key={i} className="flex items-center justify-between p-6 hover:bg-slate-50 rounded-3xl border border-transparent hover:border-slate-100 transition-all group">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black">
                  {user.name[0]}
               </div>
               <div>
                  <p className="font-black text-slate-900 tracking-tight">{user.name}</p>
                  <p className="text-xs text-slate-400 font-medium">{user.email}</p>
               </div>
            </div>
            <div className="flex items-center gap-10">
               <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${user.role === 'Owner' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                  {user.role}
               </span>
               <div className="flex items-center gap-2">
                  <button className="p-2 text-slate-200 group-hover:text-slate-400 hover:text-indigo-500 transition-colors">
                     <Lock className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-200 group-hover:text-slate-400 hover:text-rose-500 transition-colors">
                     <Trash2 className="w-4 h-4" />
                  </button>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

const SecuritySettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-10">
      <div className="space-y-6">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Password & Access</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Current Password</label>
              <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none transition-all" />
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">New Password</label>
              <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none transition-all" />
           </div>
        </div>
        <button className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest">Update Password</button>
      </div>

      <div className="h-px bg-slate-50" />

      <div className="flex items-center justify-between p-8 bg-slate-900 rounded-[2rem] text-white">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-400 border border-white/5">
               <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
               <h4 className="text-lg font-black tracking-tight">Two-Factor Authentication</h4>
               <p className="text-slate-400 text-sm font-medium">Secure your account with an extra layer of safety.</p>
            </div>
         </div>
         <button className="bg-indigo-600 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-500 transition-colors">Enable 2FA</button>
      </div>
    </div>
  </div>
)

const BillingSettings = () => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 p-8 bg-indigo-600 rounded-[2.5rem] text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-2xl" />
        <div className="relative z-10">
           <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 block">Current Subscription</span>
           <h3 className="text-3xl font-black tracking-tight mb-2">Pro Annual Plan</h3>
           <p className="text-indigo-100 text-sm font-medium">Renewing on 12th Oct 2026 · ₹12,999/year</p>
        </div>
        <button className="relative z-10 bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all">
           Manage Billing
        </button>
      </div>

      <div className="space-y-6">
         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Payment Methods</h4>
         <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 border border-slate-100">
                  <CreditCard className="w-6 h-6" />
               </div>
               <div>
                  <p className="font-black text-slate-900">Visa ending in 4242</p>
                  <p className="text-xs text-slate-400 font-bold uppercase">Expires 12/28</p>
               </div>
            </div>
            <button className="text-indigo-600 font-black text-xs uppercase tracking-widest">Update</button>
         </div>
      </div>
    </div>
  </div>
)

const PrintSettings = ({ 
  defaultAction, setDefaultAction, 
  printFormat, setPrintFormat, 
  autoPrint, setAutoPrint 
}: any) => (
  <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="max-w-xs">
          <h4 className="font-black text-slate-900 tracking-tight mb-1">Default action after billing</h4>
          <p className="text-xs text-slate-400 font-medium">What happens immediately after you save an invoice?</p>
        </div>
        <div className="relative">
          <select 
            value={defaultAction}
            onChange={(e) => setDefaultAction(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
          >
            <option>Send WhatsApp</option>
            <option>Print</option>
            <option>Ask every time</option>
          </select>
          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div className="h-px bg-slate-50" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="max-w-xs">
          <h4 className="font-black text-slate-900 tracking-tight mb-1">Default print format</h4>
          <p className="text-xs text-slate-400 font-medium">Select the page size for your physical printer.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {['80mm', '58mm', 'A4'].map((format) => (
            <button 
              key={format}
              onClick={() => setPrintFormat(format)}
              className={`px-4 py-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${
                printFormat === format 
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' 
                : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className={`p-2 rounded-xl ${printFormat === format ? 'bg-white/20' : 'bg-slate-50'}`}>
                {format === 'A4' ? <FileText className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">{format}</span>
              {printFormat === format && <Check className="w-3 h-3 mt-auto" />}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-slate-50" />

      <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
        <div>
          <h4 className="font-semibold text-emerald-800">Test Print</h4>
          <p className="text-xs text-emerald-600">Print a sample invoice to check alignment</p>
        </div>
        <button 
          onClick={() => window.open(`/api/print/test?size=${printFormat}`)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          Print Test
        </button>
      </div>

      <div className="h-px bg-slate-50" />

      <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-slate-900 tracking-tight">Auto-print after billing</h4>
            <p className="text-xs text-slate-400 font-medium">Instantly trigger the print dialog after saving.</p>
          </div>
        </div>
        <button 
          onClick={() => setAutoPrint(!autoPrint)}
          className={`w-14 h-8 rounded-full transition-all flex items-center px-1 ${autoPrint ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <div className={`w-6 h-6 bg-white rounded-full shadow-lg transition-transform ${autoPrint ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  </div>
)

// --- Navigation Groups Data ---
const navGroups = [
  {
    title: 'Business',
    items: [
      { id: 'profile', label: 'Profile', icon: Building2 },
      { id: 'gst', label: 'GST (GSTIN/HSN)', icon: FileText },
      { id: 'whatsapp', label: 'WhatsApp (Templates)', icon: MessageSquare },
      { id: 'print', label: 'Delivery & Print', icon: Printer },
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'team', label: 'Users & Roles', icon: Users },
      { id: 'security', label: 'Security (2FA/PIN)', icon: ShieldCheck },
      { id: 'billing', label: 'Subscription', icon: CreditCard },
    ]
  }
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [defaultAction, setDefaultAction] = useState('Send WhatsApp')
  const [printFormat, setPrintFormat] = useState('Thermal 80mm')
  const [autoPrint, setAutoPrint] = useState(true)

  const renderContent = () => {
    switch (activeTab) {
      case 'profile': return <ProfileSettings />
      case 'gst': return <GSTSettings />
      case 'whatsapp': return <WhatsAppSettings />
      case 'team': return <TeamSettings />
      case 'security': return <SecuritySettings />
      case 'billing': return <BillingSettings />
      case 'print': return <PrintSettings 
        defaultAction={defaultAction} setDefaultAction={setDefaultAction}
        printFormat={printFormat} setPrintFormat={setPrintFormat}
        autoPrint={autoPrint} setAutoPrint={setAutoPrint}
      />
      default: return <ProfileSettings />
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-8 flex-1">
          <div className="relative w-full max-w-md group">
            <Search className="absolute left-4 top-3 w-4 h-4 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search settings..." 
              className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 border-r border-slate-100 pr-6">
             <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
             </button>
             <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all">
                <HelpCircle className="w-5 h-5" />
             </button>
          </div>

          <div className="flex items-center gap-3 pl-2">
             <div className="text-right hidden sm:block">
                <div className="flex items-center gap-2 justify-end">
                   <p className="text-sm font-black text-slate-900">Ravi Electronics</p>
                   <span className="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">Pro Plan</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold">+91 98765 43210 · <span className="text-emerald-500">Active</span></p>
             </div>
             <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-black">
                R
             </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 space-y-10 hidden lg:block overflow-y-auto">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx}>
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-4">{group.title}</h3>
               <nav className="space-y-1">
                  {group.items.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => setActiveTab(item.id as SettingsTab)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${
                        activeTab === item.id 
                        ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' 
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
               </nav>
            </div>
          ))}

          <div className="pt-10 mt-10 border-t border-slate-100">
             <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm text-rose-500 hover:bg-rose-50 transition-all">
                <LogOut className="w-4 h-4" />
                Sign Out
             </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 md:p-12">
          <div className="max-w-4xl mx-auto space-y-12">
            
            <div className="flex items-center justify-between">
               <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight capitalize">{activeTab.replace('_', ' ')} Settings</h2>
                  <p className="text-slate-500 text-sm font-medium">Update your business parameters and system behavior.</p>
               </div>
               <button className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all">
                  <Save className="w-4 h-4" />
                  Save Changes
               </button>
            </div>

            <div className="pb-20">
              {renderContent()}
            </div>

          </div>
        </main>

      </div>
    </div>
  )
}