'use client'

import { useState } from 'react'
import { Sheet, Button } from './Base'
import { QrCode, Banknote, History, Check } from 'lucide-react'

export function CollectPaymentSheet({ onClose, total }: { onClose: () => void, total: number }) {
  const [method, setMethod] = useState<'upi' | 'cash' | 'udhar'>('upi')

  return (
    <Sheet onClose={onClose}>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold text-[#1A1C1E]">Collect<br />Payment</h2>
          <div className="bg-amber-50 text-amber-700 px-3 py-2 rounded-xl border border-amber-100 flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-tight">Pending:</span>
            <span className="text-sm font-bold">₹3,200</span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Amount</span>
          <h1 className="text-5xl font-black text-[#1A1C1E]">₹{total.toLocaleString('en-IN')}</h1>
        </div>

        <div className="space-y-3">
          {/* UPI Option */}
          <button 
            onClick={() => setMethod('upi')}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
              method === 'upi' ? 'border-blue-600 bg-blue-50/30' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-slate-600" />
              </div>
              <div className="text-left">
                <p className="font-bold text-[#1A1C1E]">UPI / QR Code</p>
                <p className="text-xs text-blue-600 font-bold">Send link via WhatsApp</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === 'upi' ? 'border-blue-600 bg-blue-600' : 'border-slate-200'}`}>
              {method === 'upi' && <Check className="w-4 h-4 text-white" />}
            </div>
          </button>

          {/* Cash Option */}
          <button 
            onClick={() => setMethod('cash')}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
              method === 'cash' ? 'border-blue-600 bg-blue-50/30' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-slate-600" />
              </div>
              <p className="font-bold text-[#1A1C1E]">Cash</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === 'cash' ? 'border-blue-600 bg-blue-600' : 'border-slate-200'}`}>
              {method === 'cash' && <Check className="w-4 h-4 text-white" />}
            </div>
          </button>

          {/* Udhar Option */}
          <button 
            onClick={() => setMethod('udhar')}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
              method === 'udhar' ? 'border-blue-600 bg-blue-50/30' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <History className="w-5 h-5 text-slate-600" />
              </div>
              <div className="text-left">
                <p className="font-bold text-[#1A1C1E]">Save as Udhar</p>
                <p className="text-xs text-slate-400 font-bold">Add to Party Ledger</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === 'udhar' ? 'border-blue-600 bg-blue-600' : 'border-slate-200'}`}>
              {method === 'udhar' && <Check className="w-4 h-4 text-white" />}
            </div>
          </button>
        </div>

        <div className="pt-2">
          <button 
            onClick={() => {
              console.log('Generating bill:', { method })
              onClose()
            }}
            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-lg shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
          >
            Generate & Send
          </button>
        </div>
      </div>
    </Sheet>
  )
}
