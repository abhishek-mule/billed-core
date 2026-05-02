'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Share2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { WhiteLabelFooter } from '@/components/invoice/WhiteLabelFooter'

export default function InvoiceDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [invoice, setInvoice] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/merchant/invoices/${id}`)
        const json = await res.json()
        if (json.success) setInvoice(json.data)
      } catch (e) {
        console.error('Failed to fetch invoice', e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchInvoice()
  }, [id])

  const handleDownload = () => {
    window.location.href = `/api/merchant/invoices/${id}/download`
  }

  const handlePrint = () => {
    window.print()
  }

  if (isLoading) return <div className="p-8 animate-pulse bg-muted rounded-3xl h-96" />
  if (!invoice) return (
    <div className="flex flex-col items-center justify-center py-20">
       <AlertCircle className="w-12 h-12 text-destructive mb-4" />
       <h2 className="text-xl font-black uppercase">Invoice Not Found</h2>
       <Button onClick={() => router.back()} variant="outline" className="mt-4">Go Back</Button>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-8 animate-fade-in">
      {/* Navigation Header */}
      <div className="flex items-center justify-between px-1">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={handleDownload} icon={<Download className="w-3.5 h-3.5" />}>Export</Button>
           <Button variant="primary" size="sm" onClick={handlePrint} icon={<Printer className="w-3.5 h-3.5" />}>Print</Button>
        </div>
      </div>

      {/* Invoice Document Card */}
      <div className="card-base p-8 md:p-12 bg-white text-black shadow-2xl relative overflow-hidden print:p-0 print:shadow-none print:bg-transparent">
        {/* Document Header */}
        <div className="flex flex-col md:flex-row justify-between gap-8 mb-12">
           <div>
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black italic">BZ</div>
                 <h1 className="text-2xl font-black uppercase tracking-tighter italic">BillZo Invoice</h1>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Billed To</p>
                 <h2 className="text-xl font-black tracking-tight">{invoice.customer_name}</h2>
                 <p className="text-xs font-bold text-muted-foreground">{invoice.customer_phone}</p>
                 {invoice.customer_gstin && <p className="text-[10px] font-black text-primary uppercase mt-2">GSTIN: {invoice.customer_gstin}</p>}
              </div>
           </div>
           
           <div className="md:text-right space-y-4">
              <div>
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Invoice Number</p>
                 <p className="text-lg font-black tracking-tight">{invoice.invoice_number}</p>
              </div>
              <div>
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date Issued</p>
                 <p className="text-xs font-bold">{new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                invoice.status === 'PAID' ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
              )}>
                 {invoice.status === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                 {invoice.status}
              </div>
           </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-12 overflow-x-auto">
           <table className="w-full text-left">
              <thead>
                 <tr className="border-b-2 border-black/5">
                    <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Item Description</th>
                    <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Qty</th>
                    <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Rate</th>
                    <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Amount</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                 {invoice.line_items_json.map((item: any, i: number) => (
                   <tr key={i}>
                      <td className="py-5">
                         <p className="text-sm font-black uppercase tracking-tight">{item.itemName}</p>
                         <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase">HSN: {item.hsnCode || 'N/A'}</p>
                      </td>
                      <td className="py-5 text-center text-sm font-bold">{item.quantity}</td>
                      <td className="py-5 text-right text-sm font-bold">₹{item.rate}</td>
                      <td className="py-5 text-right text-sm font-black italic">₹{(item.quantity * item.rate).toLocaleString()}</td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>

        {/* Totals Section */}
        <div className="flex flex-col md:flex-row justify-between gap-12">
           <div className="flex-1">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Payment Info</p>
              <div className="p-4 bg-muted/20 rounded-2xl border border-black/5">
                 <p className="text-[10px] font-bold uppercase leading-relaxed text-muted-foreground">
                    Bank Transfer: HDFC BANK • A/C 501004...<br/>
                    UPI: sharma.elec@okicici<br/>
                    Notes: {invoice.notes || 'No extra notes provided.'}
                 </p>
              </div>
           </div>
           
           <div className="w-full md:w-64 space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                 <span>Subtotal</span>
                 <span>₹{Number(invoice.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                 <span>GST (Total)</span>
                 <span>₹{Number(invoice.tax_amount).toLocaleString()}</span>
              </div>
              <div className="h-px bg-black/10 my-4" />
              <div className="flex justify-between items-center">
                 <span className="text-sm font-black uppercase tracking-widest">Total</span>
                 <span className="text-2xl font-black tracking-tighter italic">₹{Number(invoice.total).toLocaleString()}</span>
              </div>
           </div>
        </div>

        {/* Growth Loop Footer */}
        <WhiteLabelFooter 
           merchantName="Sharma Electronics" 
           referralId="USER_123" 
           isPremium={false} 
        />
      </div>

      {/* Sharing HUD */}
      <div className="card-base p-6 bg-primary text-primary-foreground flex items-center justify-between shadow-glow print:hidden">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
               <Share2 className="w-6 h-6" />
            </div>
            <div>
               <p className="text-sm font-black uppercase tracking-tight">Share Invoice</p>
               <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Send via WhatsApp or SMS</p>
            </div>
         </div>
         <Button 
            variant="outline" 
            className="bg-white text-primary border-none hover:bg-white/90"
            onClick={() => window.open(invoice.whatsappLink, '_blank')}
         >
           Send Link
         </Button>
      </div>
    </div>
  )
}
