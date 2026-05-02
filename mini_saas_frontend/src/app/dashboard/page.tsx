'use client'

import { Package, TrendingUp, Users, ShoppingCart, FileText, DollarSign } from 'lucide-react'

const mockProducts = [
  { id: 1, name: 'Wireless Mouse', sku: 'WM-001', price: 599, stock: 45, category: 'Electronics' },
  { id: 2, name: 'USB Cable Type-C', sku: 'USB-002', price: 199, stock: 120, category: 'Accessories' },
  { id: 3, name: 'Bluetooth Speaker', sku: 'BS-003', price: 1299, stock: 28, category: 'Electronics' },
  { id: 4, name: 'Mobile Cover', sku: 'MC-004', price: 299, stock: 85, category: 'Accessories' },
  { id: 5, name: 'Screen Guard', sku: 'SG-005', price: 149, stock: 200, category: 'Accessories' },
  { id: 6, name: 'Power Bank 10000mAh', sku: 'PB-006', price: 899, stock: 35, category: 'Electronics' },
]

const stats = [
  { label: 'Total Revenue', value: '₹1,24,580', change: '+12.5%', positive: true, icon: DollarSign },
  { label: 'Total Invoices', value: '156', change: '+8', positive: true, icon: FileText },
  { label: 'Total Customers', value: '89', change: '+5', positive: true, icon: Users },
  { label: 'Products Sold', value: '342', change: '+18', positive: true, icon: Package },
]

const recentInvoices = [
  { id: 'INV-001', customer: 'Sharma Electronics', amount: '₹15,200', date: 'Today', status: 'Paid' },
  { id: 'INV-002', customer: 'Gupta Hardware', amount: '₹8,450', date: 'Today', status: 'Pending' },
  { id: 'INV-003', customer: 'Patel Mobile Store', amount: '₹32,000', date: 'Yesterday', status: 'Paid' },
  { id: 'INV-004', customer: 'Singh Electricals', amount: '₹5,780', date: 'Yesterday', status: 'Paid' },
]

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome back!</h1>
        <p className="text-slate-500 mt-1">Here's what's happening with your business today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div 
              key={stat.label} 
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
                  <Icon className="w-6 h-6 text-teal-600" />
                </div>
                <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                  stat.positive 
                    ? 'bg-emerald-50 text-emerald-600' 
                    : 'bg-rose-50 text-rose-600'
                }`}>
                  {stat.change}
                </span>
              </div>
              <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* Product Showcase */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Popular Products</h2>
              <p className="text-slate-500 text-sm mt-0.5">Your top selling items this month</p>
            </div>
            <button className="text-teal-600 font-medium text-sm hover:text-teal-700 transition-colors">
              View All
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-slate-400" />
                      </div>
                      <span className="font-medium text-slate-700">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{product.sku}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">₹{product.price}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      product.stock > 50 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : product.stock > 20 
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-rose-50 text-rose-600'
                    }`}>
                      {product.stock} units
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Recent Invoices</h3>
              <p className="text-slate-500 text-sm mt-0.5">Latest transactions</p>
            </div>
            <button className="text-teal-600 font-medium text-sm hover:text-teal-700 transition-colors">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {recentInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">{invoice.customer}</p>
                    <p className="text-slate-400 text-sm">{invoice.id} • {invoice.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{invoice.amount}</p>
                  <span className={`text-xs font-medium ${
                    invoice.status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats Card */}
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
          <div className="mb-6">
            <h3 className="text-lg font-bold">Monthly Performance</h3>
            <p className="text-teal-100 text-sm mt-0.5">Sales summary</p>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-teal-100 text-sm">Revenue Growth</span>
                <span className="font-semibold">+24%</span>
              </div>
              <div className="h-2 bg-teal-400/30 rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-white rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-teal-100 text-sm">Invoice Completion</span>
                <span className="font-semibold">92%</span>
              </div>
              <div className="h-2 bg-teal-400/30 rounded-full overflow-hidden">
                <div className="h-full w-[92%] bg-white rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-teal-100 text-sm">Customer Retention</span>
                <span className="font-semibold">78%</span>
              </div>
              <div className="h-2 bg-teal-400/30 rounded-full overflow-hidden">
                <div className="h-full w-[78%] bg-white rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}