'use client'

import { useState } from 'react'
import { useInvoiceAPI } from '@/lib/useInvoiceAPI'
import { validateInvoicePayload, MerchantInvoicePayload } from '@/lib/merchant'

interface InvoiceFormProps {
  authToken: string
  onSuccess?: (invoiceNo: string) => void
}

export function InvoiceForm({ authToken, onSuccess }: InvoiceFormProps) {
  const { createInvoice, loading, error } = useInvoiceAPI({ authToken })
  
  const [phone, setPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [items, setItems] = useState([
    { itemCode: '', itemName: '', quantity: 1, rate: 0 }
  ])

  const handleAddItem = () => {
    setItems([...items, { itemCode: '', itemName: '', quantity: 1, rate: 0 }])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload: MerchantInvoicePayload = {
      customerPhone: phone,
      customerName: customerName || undefined,
      items: items.map(item => ({
        itemCode: item.itemCode,
        itemName: item.itemName || undefined,
        quantity: parseInt(item.quantity),
        rate: parseFloat(item.rate)
      }))
    }

    const validation = validateInvoicePayload(payload)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    const result = await createInvoice(payload)
    if (result?.success) {
      alert(`Invoice ${result.invoiceNumber} created!`)
      window.open(result.whatsappLink, '_blank')
      onSuccess?.(result.invoiceNumber)
      setPhone('')
      setCustomerName('')
      setItems([{ itemCode: '', itemName: '', quantity: 1, rate: 0 }])
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Invoice</h1>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Customer Phone *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            required
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Customer Name</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Rajesh Kumar"
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Items</h2>
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-5 gap-2 mb-3">
            <input
              type="text"
              value={item.itemCode}
              onChange={(e) => handleItemChange(index, 'itemCode', e.target.value)}
              placeholder="Item Code"
              required
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={item.itemName}
              onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
              placeholder="Item Name"
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
              placeholder="Qty"
              min="1"
              required
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="number"
              value={item.rate}
              onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
              placeholder="Rate"
              step="0.01"
              min="0"
              required
              className="px-3 py-2 border rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemoveItem(index)}
              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddItem}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          + Add Item
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? 'Creating Invoice...' : 'Create & Send via WhatsApp'}
      </button>
    </form>
  )
}