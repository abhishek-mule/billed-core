'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type SourceType = 'tally' | 'zoho' | 'khatabook' | 'generic'

export default function DataMigration() {
  const [source, setSource] = useState<SourceType>('tally')
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ items: number; customers: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setProgress(10)

    // Simulation of Smart Migration
    // 1. Send to /api/migrate
    // 2. We use 'source' to pick the right mapping strategy
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval)
          return 95
        }
        return prev + Math.random() * 15
      })
    }, 800)

    try {
      // Mock API call for the Founder demo
      await new Promise(resolve => setTimeout(resolve, 4000))
      
      setResult({
        items: source === 'tally' ? 450 : 120,
        customers: source === 'tally' ? 85 : 30
      })
    } catch (error) {
      console.error(error)
    } finally {
      setIsUploading(false)
      setProgress(100)
    }
  }

  return (
    <div className="bg-black/40 border border-white/5 p-8 rounded-3xl backdrop-blur-md">
      <div className="mb-8">
        <h2 className="text-2xl font-black tracking-tighter italic uppercase underline decoration-indigo-500 decoration-4 underline-offset-8">
          LEGACY DATA IMPORTER
        </h2>
        <p className="text-sm text-gray-400 mt-4 font-medium">Switch from your old software to Billed in seconds.</p>
      </div>

      {!result && !isUploading && (
        <div className="space-y-8">
          {/* Source Selection */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { id: 'tally', label: 'Tally Prime', color: 'emerald' },
              { id: 'zoho', label: 'Zoho Books', color: 'rose' },
              { id: 'khatabook', label: 'Khatabook', color: 'indigo' },
              { id: 'generic', label: 'Excel / CSV', color: 'gray' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setSource(item.id as SourceType)}
                className={`p-4 rounded-2xl border-2 transition-all text-center ${
                  source === item.id 
                    ? `border-${item.color}-500 bg-${item.color}-500/10` 
                    : 'border-white/5 bg-white/5 hover:border-white/20'
                }`}
              >
                <p className={`text-[10px] font-black uppercase tracking-widest ${source === item.id ? `text-${item.color}-400` : 'text-gray-500'}`}>
                  {item.label}
                </p>
              </button>
            ))}
          </div>

          {/* Dropzone */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square sm:aspect-auto sm:h-64 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.02] transition-colors group"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition duration-500">
               <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
               </svg>
            </div>
            <p className="text-sm font-bold">Upload your {source.toUpperCase()} export file</p>
            <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-widest font-black">.xlsx, .csv or .xml</p>
            <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept=".csv, .xlsx, .xml" />
          </div>
        </div>
      )}

      {isUploading && (
        <div className="py-20 flex flex-col items-center justify-center space-y-8">
           <div className="relative w-48 h-48">
              <svg className="w-full h-full -rotate-90">
                <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                <circle 
                  cx="96" 
                  cy="96" 
                  r="80" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={502}
                  strokeDashoffset={502 - (502 * progress) / 100}
                  className="text-indigo-500 transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <span className="text-3xl font-black italic">{Math.round(progress)}%</span>
                 <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mt-1 animate-pulse">Mapping Data</span>
              </div>
           </div>
           <div className="text-center">
              <h3 className="text-xl font-bold uppercase tracking-tighter">Analyzing Ledger Schema</h3>
              <p className="text-sm text-gray-500 font-medium">Auto-detecting GST columns and HSN codes...</p>
           </div>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
           <div className="flex items-center gap-6 p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem]">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500 text-black flex items-center justify-center flex-shrink-0">
                 <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                 </svg>
              </div>
              <div>
                 <h4 className="text-2xl font-black tracking-tighter uppercase italic">Migration Success!</h4>
                 <p className="text-gray-400 font-medium">Billed has successfully ingestested your {source} legacy data.</p>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-8 bg-white/5 border border-white/5 rounded-3xl">
                 <p className="text-4xl font-black text-indigo-400">{result.items}</p>
                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-2">Inventory Items</p>
              </div>
              <div className="p-8 bg-white/5 border border-white/5 rounded-3xl">
                 <p className="text-4xl font-black text-purple-400">{result.customers}</p>
                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-2">Customer Ledgers</p>
              </div>
           </div>

           <button 
              onClick={() => setResult(null)}
              className="w-full py-5 bg-white text-black font-black uppercase italic tracking-tighter rounded-3xl hover:bg-gray-200 transition"
           >
              Review Imported Data
           </button>
        </motion.div>
      )}
    </div>
  )
}
