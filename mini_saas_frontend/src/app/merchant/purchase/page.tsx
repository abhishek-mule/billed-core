'use client'

import { useState } from 'react'
import { 
  Plus, 
  Package, 
  Search, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  MoreVertical,
  Filter,
  Download,
  Upload,
  AlertCircle,
  IndianRupee,
  TrendingUp,
  Box
} from 'lucide-react'
import { formatINR } from '@/lib/api-client'

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplierName: string
  supplierGstin: string
  orderDate: string
  expectedDate: string
  items: Array<{
    productName: string
    quantity: number
    rate: number
    amount: number
  }>
  totalAmount: number
  status: 'pending' | 'ordered' | 'received' | 'cancelled'
  paymentStatus: 'unpaid' | 'partial' | 'paid'
}

const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    orderNumber: 'PO-2024-001',
    supplierName: 'Balaji Traders',
    supplierGstin: '27AABCU9603R1ZM',
    orderDate: '2024-01-15',
    expectedDate: '2024-01-20',
    items: [
      { productName: 'Ultratech Cement 50kg', quantity: 50, rate: 290, amount: 14500 },
      { productName: 'TMT Bar 12mm (Tata)', quantity: 20, rate: 1600, amount: 32000 }
    ],
    totalAmount: 46500,
    status: 'ordered',
    paymentStatus: 'partial'
  },
  {
    id: '2',
    orderNumber: 'PO-2024-002',
    supplierName: 'Sharma Electronics',
    supplierGstin: '29AAFPU4567M1ZT',
    orderDate: '2024-01-18',
    expectedDate: '2024-01-25',
    items: [
      { productName: 'LED Bulb 9W (Philips)', quantity: 100, rate: 85, amount: 8500 },
      { productName: 'Ceiling Fan (Bajaj)', quantity: 10, rate: 2500, amount: 25000 }
    ],
    totalAmount: 33500,
    status: 'pending',
    paymentStatus: 'unpaid'
  }
]

export default function PurchaseManagementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders)
  const [showNewOrderForm, setShowNewOrderForm] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredOrders = purchaseOrders.filter(order => {
    const matchesSearch = !searchQuery || 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.supplierName.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'ordered': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'received': return 'bg-green-100 text-green-800 border-green-200'
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-50 text-green-700 border-green-200'
      case 'partial': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'unpaid': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const handleCreateOrder = (newOrder: Omit<PurchaseOrder, 'id' | 'orderNumber'>) => {
    const orderNumber = `PO-2024-${String(purchaseOrders.length + 1).padStart(3, '0')}`
    const order: PurchaseOrder = {
      ...newOrder,
      id: String(purchaseOrders.length + 1),
      orderNumber
    }
    setPurchaseOrders([order, ...purchaseOrders])
    setShowNewOrderForm(false)
  }

  const handleUpdateStatus = (orderId: string, newStatus: PurchaseOrder['status']) => {
    setPurchaseOrders(orders => 
      orders.map(order => 
        order.id === orderId ? { ...order, status: newStatus } : order
      )
    )
  }

  const totalPendingAmount = purchaseOrders
    .filter(order => order.paymentStatus !== 'paid')
    .reduce((sum, order) => sum + order.totalAmount, 0)

  const totalOrdersThisMonth = purchaseOrders.filter(order => {
    const orderDate = new Date(order.orderDate)
    const now = new Date()
    return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()
  }).length

  if (showNewOrderForm) {
    return <NewPurchaseOrderForm onSubmit={handleCreateOrder} onCancel={() => setShowNewOrderForm(false)} />
  }

  return (
    <div className="space-y-6 pb-10 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Purchase Management</h1>
          <p className="text-muted-foreground text-sm">Manage purchase orders and suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-muted transition-all">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button 
            onClick={() => setShowNewOrderForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Purchase Order
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{purchaseOrders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Orders</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Active</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {purchaseOrders.filter(order => order.status === 'pending' || order.status === 'ordered').length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Pending Orders</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <IndianRupee className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">Due</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatINR(totalPendingAmount)}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending Payments</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">This Month</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalOrdersThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-1">Orders This Month</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search orders..."
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          
          <button className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl text-sm hover:bg-muted transition-all">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Items</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    No purchase orders found. Create your first order!
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className="hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-sm text-foreground">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{order.supplierGstin}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-sm text-foreground">{order.supplierName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-foreground">{new Date(order.orderDate).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground">Exp: {new Date(order.expectedDate).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-foreground">{order.items.length} items</p>
                      <p className="text-xs text-muted-foreground">
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)} units
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-sm text-foreground">{formatINR(order.totalAmount)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${getPaymentStatusColor(order.paymentStatus)}`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Handle menu click
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </div>
  )
}

function NewPurchaseOrderForm({ onSubmit, onCancel }: { onSubmit: (order: Omit<PurchaseOrder, 'id' | 'orderNumber'>) => void, onCancel: () => void }) {
  const [supplierName, setSupplierName] = useState('')
  const [supplierGstin, setSupplierGstin] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [items, setItems] = useState<Array<{ productName: string; quantity: number; rate: number; amount: number }>>([
    { productName: '', quantity: 1, rate: 0, amount: 0 }
  ])

  const addItem = () => {
    setItems([...items, { productName: '', quantity: 1, rate: 0, amount: 0 }])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    
    // Recalculate amount
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate
    }
    
    setItems(updatedItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const validItems = items.filter(item => item.productName && item.quantity > 0 && item.rate > 0)
    
    if (validItems.length === 0) {
      alert('Please add at least one valid item')
      return
    }

    onSubmit({
      supplierName,
      supplierGstin,
      orderDate: new Date().toISOString().split('T')[0],
      expectedDate: expectedDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: validItems,
      totalAmount,
      status: 'pending',
      paymentStatus: 'unpaid'
    })
  }

  return (
    <div className="space-y-6 pb-10 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">New Purchase Order</h1>
          <p className="text-muted-foreground text-sm">Create a new purchase order</p>
        </div>
        <button 
          onClick={onCancel}
          className="px-4 py-2 bg-card border border-border rounded-xl text-sm hover:bg-muted transition-all"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier Details */}
        <div className="bg-card rounded-xl p-6 border border-border space-y-4">
          <h2 className="font-semibold text-foreground">Supplier Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Supplier Name</label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter supplier name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Supplier GSTIN</label>
              <input
                type="text"
                value={supplierGstin}
                onChange={(e) => setSupplierGstin(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter GSTIN (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-card rounded-xl p-6 border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Line Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-4">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    value={item.productName}
                    onChange={(e) => updateItem(index, 'productName', e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="Product name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Rate (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
                  <div className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-medium">
                    {formatINR(item.amount)}
                  </div>
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="w-full p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    disabled={items.length === 1}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-foreground">{formatINR(totalAmount)}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-all"
              >
                Create Purchase Order
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function OrderDetailModal({ order, onClose, onUpdateStatus }: { order: PurchaseOrder, onClose: () => void, onUpdateStatus: (id: string, status: PurchaseOrder['status']) => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">{order.orderNumber}</h2>
            <p className="text-sm text-muted-foreground">{order.supplierName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Order Date</p>
              <p className="font-medium text-foreground">{new Date(order.orderDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Expected Date</p>
              <p className="font-medium text-foreground">{new Date(order.expectedDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                order.status === 'pending' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                order.status === 'ordered' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                order.status === 'received' ? 'bg-green-100 text-green-800 border-green-200' :
                'bg-red-100 text-red-800 border-red-200'
              }`}>
                {order.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Payment Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                order.paymentStatus === 'paid' ? 'bg-green-50 text-green-700 border-green-200' :
                order.paymentStatus === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-red-50 text-red-700 border-red-200'
              }`}>
                {order.paymentStatus}
              </span>
            </div>
          </div>

          {/* Items */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Items</h3>
            <div className="space-y-2">
              {order.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity} × ₹{item.rate}</p>
                  </div>
                  <p className="font-bold text-foreground">{formatINR(item.amount)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-foreground">{formatINR(order.totalAmount)}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {order.status === 'pending' && (
              <button
                onClick={() => onUpdateStatus(order.id, 'ordered')}
                className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-all"
              >
                Mark as Ordered
              </button>
            )}
            {order.status === 'ordered' && (
              <button
                onClick={() => onUpdateStatus(order.id, 'received')}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-all"
              >
                Mark as Received
              </button>
            )}
            <button className="flex-1 px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted transition-all">
              Print Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}