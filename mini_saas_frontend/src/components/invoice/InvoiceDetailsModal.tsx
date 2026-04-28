'use client'

import { 
  X, 
  Printer, 
  FileText, 
  Share2, 
  Check, 
  Clock, 
  MapPin, 
  Phone,
  ChevronLeft
} from 'lucide-react'

interface InvoiceItem {
  name: string
  qty: number
  rate: number
  gst: number
  hsn: string
}

interface Invoice {
  id: string
  date: string
  customerName: string
  customerPhone: string
  amount: number
  paymentStatus: 'PAID' | 'UNPAID' | 'PENDING'
  syncStatus: 'SYNCED' | 'LOCAL'
  items: InvoiceItem[]
}

interface InvoiceDetailsModalProps {
  invoice: Invoice | null
  isOpen: boolean
  onClose: () => void
}

export function InvoiceDetailsModal({ invoice, isOpen, onClose }: InvoiceDetailsModalProps) {
  if (!isOpen || !invoice) return null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const subtotal = invoice.items.reduce((acc, item) => acc + (item.qty * item.rate), 0)
  const gstTotal = invoice.items.reduce((acc, item) => acc + (item.qty * item.rate * item.gst / 100), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-slate-50 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Modal Header */}
        <div className="bg-white px-8 py-4 flex items-center justify-between border-b border-slate-100">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors font-bold text-sm"
          >
            <ChevronLeft className="w-5 h-5" />
            All invoices
          </button>
          <div className="flex items-center gap-4">
             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
               <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 md:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
          
          {/* Main Info Card */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                   <FileText className="w-4 h-4" />
                   {invoice.id}
                </div>
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter">
                  {formatCurrency(invoice.amount)}
                </h2>
              </div>
              <div className="text-right text-slate-400 text-sm font-bold">
                 Today, {invoice.date}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
               <span className="bg-amber-100 text-amber-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">Pending</span>
               <span className="bg-rose-100 text-rose-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">UNPAID</span>
               <span className="bg-slate-100 text-slate-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">Udhar</span>
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
               <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs">
                  <Check className="w-4 h-4" />
                  Saved locally
               </div>
               <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs">
                  <Clock className="w-4 h-4" />
                  Will sync when online
               </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-4">
             <div className="flex justify-between items-center px-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Send to customer</span>
                <span className="text-[10px] font-bold text-slate-300 italic">{'< 5s delivery'}</span>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 hover:scale-105 transition-all">
                   <Check className="w-4 h-4" />
                   Sent
                </button>
                <button className="flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-600 px-4 py-3 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all">
                   <Printer className="w-4 h-4 text-slate-400" />
                   Print
                </button>
                <button className="flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-600 px-4 py-3 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all">
                   <FileText className="w-4 h-4 text-slate-400" />
                   PDF
                </button>
                <button className="flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-600 px-4 py-3 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all">
                   <Share2 className="w-4 h-4 text-slate-400" />
                   Share
                </button>
             </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4 px-2">CUSTOMER</span>
             <div className="flex items-center gap-4 px-2">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-lg">
                   {invoice.customerName[0]}
                </div>
                <div>
                   <p className="font-black text-slate-900">{invoice.customerName}</p>
                   <p className="text-slate-400 text-sm font-bold flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {invoice.customerPhone}
                   </p>
                </div>
             </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
             <div className="px-8 py-4 border-b border-slate-50 bg-slate-50/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ITEMS</span>
             </div>
             <div className="p-8 space-y-6">
                {invoice.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-start group">
                     <div>
                        <p className="font-black text-slate-900 group-hover:text-primary transition-colors">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                           {item.qty} x ₹{item.rate} · GST {item.gst}% · HSN {item.hsn}
                        </p>
                     </div>
                     <div className="text-right">
                        <p className="font-black text-slate-900">₹{item.qty * item.rate}</p>
                     </div>
                  </div>
                ))}

                <div className="pt-6 border-t border-slate-50 space-y-3">
                   <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-400 uppercase tracking-wider">Subtotal</span>
                      <span className="font-black text-slate-600">₹{subtotal}</span>
                   </div>
                   <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-400 uppercase tracking-wider">GST</span>
                      <span className="font-black text-slate-600">₹{gstTotal}</span>
                   </div>
                   <div className="flex justify-between pt-3 border-t border-slate-50">
                      <span className="font-black text-slate-900 text-lg uppercase tracking-tighter">Total</span>
                      <span className="font-black text-slate-900 text-xl">{formatCurrency(invoice.amount)}</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Modal Footer */}
          <div className="text-center pb-4">
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                Issued by <span className="text-slate-400 italic">Ravi Electronics</span> · GSTIN 27ABCDE1234F1Z5
             </p>
          </div>

        </div>
      </div>
    </div>
  )
}
