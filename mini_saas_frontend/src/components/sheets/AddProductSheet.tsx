'use client'

import { useState } from 'react'
import { Sheet, Input, Button } from './Base'

export function AddProductSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Fan')
  const [price, setPrice] = useState('')
  const [gst, setGst] = useState('18%')

  const gstOptions = ['0', '5', '12', '18%', '28']

  return (
    <Sheet onClose={onClose} title="Add Product">
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Product Name *</span>
          <button className="text-[10px] font-bold px-3 py-1 bg-slate-100 rounded-full text-slate-600">
            Use Existing (₹1,500)
          </button>
        </div>
        <div className="border-2 border-blue-600 rounded-xl overflow-hidden px-4 py-3 mb-4">
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-base font-medium"
          />
        </div>

        <Input 
          label="Selling Price *" 
          prefix="₹" 
          placeholder="0.00" 
          value={price} 
          onChange={setPrice} 
          type="number"
        />

        <div className="mb-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">GST %</span>
          <div className="flex items-center justify-between bg-slate-100 rounded-full p-1">
            {gstOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setGst(opt)}
                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
                  gst === opt 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-slate-500'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <button className="text-blue-600 font-bold text-sm w-full text-center py-2">
          Add More Details
        </button>
        
        <div className="pt-2">
          <Button onClick={() => {
            console.log('Adding product:', { name, price, gst })
            onClose()
          }}>
            Save & Add to Bill
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
