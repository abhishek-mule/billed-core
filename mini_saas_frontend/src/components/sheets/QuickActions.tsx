'use client'

import { useState } from 'react'
import { Sheet, Button, Input } from './Base'

export function AddCustomerSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gstin, setGstin] = useState('')

  return (
    <Sheet onClose={onClose} title="Add Customer">
      <div className="flex justify-between items-start mb-5">
        <div className="w-9 h-9 bg-gray-100 rounded-full" />
        <div className="text-2xl font-bold text-center">Add<br />Customer</div>
        <div className="w-9 h-9 bg-gray-100 rounded-full" />
      </div>
      
      <Input 
        label="CUSTOMER NAME *" 
        placeholder="e.g. Amit Kumar" 
        value={name} 
        onChange={setName} 
      />
      <Input 
        label="PHONE NUMBER *" 
        prefix="+91" 
        placeholder="10-digit mobile" 
        value={phone} 
        onChange={setPhone} 
      />
      <Input 
        label="GSTIN" 
        optional 
        placeholder="e.g. 27AADCB2230M1Z2" 
        value={gstin} 
        onChange={setGstin} 
      />
      
      <div className="mt-2">
        <Button onClick={onClose}>Save Customer</Button>
      </div>
    </Sheet>
  )
}

export function AddProductSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Fan')
  const [price, setPrice] = useState('')
  const [gst, setGst] = useState('18')

  const gstOptions = ['0', '5', '12', '18', '28']

  return (
    <Sheet onClose={onClose} title="Add Product">
      <div className="flex justify-between items-start mb-5">
        <div className="w-9 h-9 bg-gray-100 rounded-full" />
        <div className="text-2xl font-bold text-center">Add<br />Product</div>
        <button className="bg-gray-100 rounded-full px-3 py-2 text-xs font-bold">
          Use Existing<br/>(₹1,500)
        </button>
      </div>
      
      <Input 
        label="PRODUCT NAME *" 
        placeholder="e.g. Fan" 
        value={name} 
        onChange={setName} 
      />
      <Input 
        label="SELLING PRICE *" 
        prefix="₹" 
        placeholder="0.00" 
        value={price} 
        onChange={setPrice} 
      />

      <div className="mb-4">
        <div className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-3">GST %</div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {gstOptions.map(g => (
            <button 
              key={g} 
              onClick={() => setGst(g)}
              className={`flex-1 py-2 rounded-lg font-bold ${gst === g ? 'bg-white shadow-sm' : ''}`}
            >
              {g}{g !== '0' ? '%' : ''}
            </button>
          ))}
        </div>
      </div>

      <button className="block mx-auto my-2 bg-transparent border-none text-blue-600 font-bold text-sm">
        Add More Details
      </button>
      
      <Button onClick={onClose}>Save & Add to Bill</Button>
    </Sheet>
  )
}

export function CollectPaymentSheet({ 
  onClose,
  amount = 15499,
  pending = 3200
}: { 
  onClose: () => void
  amount?: number
  pending?: number
}) {
  const [method, setMethod] = useState('upi')

  const methods = [
    { id: 'upi', icon: '📱', label: 'UPI / QR Code', sub: 'Send link via WhatsApp' },
    { id: 'cash', icon: '💵', label: 'Cash', sub: null },
    { id: 'udhar', icon: '📒', label: 'Save as Udhar', sub: 'Add in Party Ledger' },
  ]

  const formatCurrency = (n: number) => '₹' + n.toLocaleString('en-IN')

  return (
    <Sheet onClose={onClose} title="Collect Payment">
      <div className="flex justify-between items-center mb-5">
        <div className="text-xl font-bold">Collect<br />Payment</div>
        <div className="bg-amber-50 rounded-full px-4 py-2">
          <span className="text-amber-700 font-bold text-sm">Pending: {formatCurrency(pending)}</span>
        </div>
      </div>
      
      <div className="text-center mb-5">
        <div className="text-gray-500 text-sm">Total Amount</div>
        <div className="text-4xl font-black">{formatCurrency(amount)}</div>
      </div>

      <div className="space-y-3">
        {methods.map(m => (
          <button 
            key={m.id}
            onClick={() => setMethod(m.id)}
            className="w-full flex items-center gap-4 rounded-xl p-4 cursor-pointer"
            style={{ 
              border: `1.5px solid ${method === m.id ? '#1B6BF5' : '#E2E5EB'}`,
              background: method === m.id ? '#F0F6FF' : '#fff'
            }}
          >
            <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center text-2xl">
              {m.icon}
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold">{m.label}</div>
              {m.sub && <div className="text-sm text-blue-600">{m.sub}</div>}
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === m.id ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
              {method === m.id && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Button color="#22C55E" onClick={onClose}>Generate & Send</Button>
      </div>
    </Sheet>
  )
}