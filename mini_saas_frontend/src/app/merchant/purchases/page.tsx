'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Camera, Search, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface Purchase {
  id: string
  invoiceNumber: string
  supplierName: string
  amount: number
  date: string
  status: 'pending' | 'received' | 'cancelled'
}

export default function PurchasesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  
  const purchases: Purchase[] = []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500 mt-1">Track your purchase invoices and inventory</p>
        </div>
        <Link
          href="/merchant/purchases/scan"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Scan Purchase
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search purchases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {purchases.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No purchases yet</h3>
          <p className="text-gray-500 mb-6">Start tracking your purchase invoices</p>
          <Link
            href="/merchant/purchases/scan"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Scan Your First Purchase
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => router.push(`/merchant/purchases/${purchase.id}`)}
            >
              <div>
                <p className="font-medium text-gray-900">{purchase.invoiceNumber}</p>
                <p className="text-sm text-gray-500">{purchase.supplierName}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">₹{purchase.amount.toLocaleString()}</p>
                <p className="text-sm text-gray-500">{purchase.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}