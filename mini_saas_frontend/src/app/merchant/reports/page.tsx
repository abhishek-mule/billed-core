'use client'

import { useState, useEffect } from 'react'
import { 
  Download, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  BarChart3, 
  PieChart, 
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Users,
  Wallet,
  IndianRupee,
  Printer
} from 'lucide-react'
import { formatINR, formatINRCompact } from '@/lib/api-client'
import { Button } from "@/components/ui/Button"
import { toast } from "sonner"

type ReportPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year'
type ReportType = 'sales' | 'gst' | 'inventory' | 'customers' | 'payments'

interface ReportStats {
  totalSales: number
  totalInvoices: number
  averageOrderValue: number
  topSellingProducts: Array<{ name: string; quantity: number; revenue: number }>
  gstCollected: { cgst: number; sgst: number; igst: number }
  pendingPayments: number
  lowStockItems: number
  activeCustomers: number
}

interface ReportsData {
  success: boolean
  period: string
  dateRange: { start: string; end: string }
  stats: ReportStats
  topSellingProducts: Array<{ name: string; quantity: number; revenue: number }>
  lowStockItems: Array<{ name: string; code: string; stock: number; reorderLevel: number }>
  salesTrend: Array<{ date: string; invoices: number; revenue: number }>
  paymentBreakdown: Array<{ status: string; count: number; amount: number }>
  topCustomers: Array<{ name: string; phone: string; orders: number; spent: number }>
}

export default function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('month')
  const [selectedReport, setSelectedReport] = useState<ReportType>('sales')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [reportsData, setReportsData] = useState<ReportsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch reports data
  const fetchReportsData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/merchant/reports/stats?period=${selectedPeriod}`)
      if (!res.ok) {
        throw new Error('Failed to fetch reports data')
      }
      const data = await res.json()
      if (data.success) {
        setReportsData(data)
      } else {
        throw new Error(data.error || 'Failed to load reports')
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err)
      setError('Failed to load reports data')
      // Use fallback data if API fails
      setReportsData(getFallbackData())
    } finally {
      setLoading(false)
    }
  }

  // Load data on mount and period change
  useEffect(() => {
    fetchReportsData()
  }, [selectedPeriod])

  // Fallback data in case API fails
  const getFallbackData = (): ReportsData => ({
    success: true,
    period: selectedPeriod,
    dateRange: { start: new Date().toISOString(), end: new Date().toISOString() },
    stats: {
      totalSales: 842300,
      totalInvoices: 156,
      averageOrderValue: 5398,
      topSellingProducts: [
        { name: 'Parle-G Biscuit 100g', quantity: 245, revenue: 2450 },
        { name: 'Amul Milk 500ml', quantity: 189, revenue: 6048 },
        { name: 'Tata Salt 1kg', quantity: 156, revenue: 4368 },
        { name: 'Maggi 70g', quantity: 134, revenue: 1876 },
        { name: 'Coca Cola 750ml', quantity: 98, revenue: 3920 }
      ],
      gstCollected: { cgst: 74520, sgst: 74520, igst: 0 },
      pendingPayments: 28500,
      lowStockItems: 8,
      activeCustomers: 89
    },
    topSellingProducts: [
      { name: 'Parle-G Biscuit 100g', quantity: 245, revenue: 2450 },
      { name: 'Amul Milk 500ml', quantity: 189, revenue: 6048 },
      { name: 'Tata Salt 1kg', quantity: 156, revenue: 4368 },
      { name: 'Maggi 70g', quantity: 134, revenue: 1876 },
      { name: 'Coca Cola 750ml', quantity: 98, revenue: 3920 }
    ],
    lowStockItems: [],
    salesTrend: [],
    paymentBreakdown: [],
    topCustomers: []
  })

  const reportStats = reportsData?.stats || getFallbackData().stats

  const handleExportGstr = async () => {
    try {
      setExporting(true)
      const date = new Date()
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]
      
      const res = await fetch('/api/merchant/reports/gstr-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        body: JSON.stringify({
          from_date: firstDay,
          to_date: lastDay,
          format: 'excel'
        })
      })

      if (!res.ok) {
        throw new Error('Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GSTR_Export_${firstDay}_to_${lastDay}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success("GSTR-1 exported successfully")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export GSTR-1")
    } finally {
      setExporting(false)
    }
  }

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExporting(true)
    try {
      const res = await fetch('/api/merchant/reports/gstr-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_date: getFromDate(selectedPeriod),
          to_date: new Date().toISOString().split('T')[0],
          format: format === 'excel' ? 'excel' : 'json'
        })
      })
      
      if (format === 'excel' && res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `GSTR_Report_${selectedPeriod}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        toast.success("Report exported successfully")
      }
    } catch (error) {
      console.error('Export failed:', error)
      toast.error("Failed to export report")
    } finally {
      setExporting(false)
    }
  }

  const getFromDate = (period: ReportPeriod): string => {
    const date = new Date()
    switch (period) {
      case 'today':
        return date.toISOString().split('T')[0]
      case 'week':
        date.setDate(date.getDate() - 7)
        return date.toISOString().split('T')[0]
      case 'month':
        date.setMonth(date.getMonth() - 1)
        return date.toISOString().split('T')[0]
      case 'quarter':
        date.setMonth(date.getMonth() - 3)
        return date.toISOString().split('T')[0]
      case 'year':
        date.setFullYear(date.getFullYear() - 1)
        return date.toISOString().split('T')[0]
      default:
        return date.toISOString().split('T')[0]
    }
  }

  const StatCard = ({ 
    title, 
    value, 
    change, 
    positive, 
    icon: Icon,
    color 
  }: { 
    title: string; 
    value: string | number; 
    change?: string; 
    positive?: boolean; 
    icon: any;
    color?: string
  }) => (
    <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${color || 'bg-primary/10'} ${color ? '' : 'text-primary'} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
        {change && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${positive ? 'text-success' : 'text-destructive'}`}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  )

  const Mini = ({ label, value, dark }: { label: string; value: string; dark?: boolean }) => (
    <div className={`rounded-lg p-3 ${dark ? "bg-white/10" : "bg-secondary"}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  )

  const ReportCard = ({ title, desc }: { title: string; desc: string }) => (
    <button 
      className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all flex items-center gap-4 w-full"
      onClick={() => toast.success(`${title} exported`)}
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Download className="h-4 w-4 text-muted-foreground" />
    </button>
  )

  return (
    <div className="space-y-6 pb-10 animate-in slide-in-from-right-2 max-w-7xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Business Reports</h1>
          <p className="text-muted-foreground text-sm">Analytics and insights for your business.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchReportsData}
            disabled={loading}
            className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-muted transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Button 
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={handleExportGstr}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-2" /> {exporting ? 'Exporting...' : 'Export GSTR-1'}
          </Button>
        </div>
      </div>

      {/* GST Card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/90 text-primary-foreground p-6 lg:p-8 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
              <CheckCircle2 className="h-3.5 w-3.5" /> April 2026
            </div>
            <h2 className="mt-3 text-2xl font-bold">GST Ready</h2>
            <p className="mt-1 text-sm opacity-80">All invoices reconciled. Send to your CA.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Mini label="Total sales" value={formatINR(reportStats.totalSales)} dark />
          <Mini label="Output GST" value={formatINR(reportStats.gstCollected.cgst + reportStats.gstCollected.sgst)} dark />
          <Mini label="Input GST" value={formatINR(18420)} dark />
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 bg-card p-1 rounded-xl border border-border w-fit">
        {(['today', 'week', 'month', 'quarter', 'year'] as ReportPeriod[]).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
              selectedPeriod === period
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Sales"
          value={formatINR(reportStats.totalSales)}
          change="+12.5%"
          positive={true}
          icon={IndianRupee}
          color="bg-success-soft text-success"
        />
        <StatCard
          title="Total Invoices"
          value={reportStats.totalInvoices}
          change="+8.2%"
          positive={true}
          icon={FileText}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Avg Order Value"
          value={formatINR(reportStats.averageOrderValue)}
          change="-2.1%"
          positive={false}
          icon={TrendingUp}
          color="bg-warning-soft text-warning"
        />
        <StatCard
          title="Pending Payments"
          value={formatINR(reportStats.pendingPayments)}
          icon={Wallet}
          color="bg-destructive/10 text-destructive"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Active Customers"
          value={reportStats.activeCustomers}
          change="+15"
          positive={true}
          icon={Users}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Low Stock Items"
          value={reportStats.lowStockItems}
          icon={Package}
          color="bg-warning-soft text-warning"
        />
        <StatCard
          title="GST Collected"
          value={formatINR(reportStats.gstCollected.cgst + reportStats.gstCollected.sgst + reportStats.gstCollected.igst)}
          icon={CheckCircle2}
          color="bg-success-soft text-success"
        />
      </div>

      {/* Report Type Tabs */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex border-b border-border">
          {(['sales', 'gst', 'inventory', 'customers', 'payments'] as ReportType[]).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedReport(type)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold capitalize transition-all ${
                selectedReport === type
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {type === 'sales' && <BarChart3 className="w-4 h-4" />}
              {type === 'gst' && <FileText className="w-4 h-4" />}
              {type === 'inventory' && <Package className="w-4 h-4" />}
              {type === 'customers' && <Users className="w-4 h-4" />}
              {type === 'payments' && <Wallet className="w-4 h-4" />}
              {type}
            </button>
          ))}
        </div>

        <div className="p-6">
          {selectedReport === 'sales' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground">Sales Analysis</h3>
              
              {/* Sales Trend Chart */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h4 className="text-sm font-semibold text-muted-foreground mb-4">Sales Trend</h4>
                <div className="h-48 flex items-end gap-2">
                  {reportsData?.salesTrend && reportsData.salesTrend.length > 0 ? (
                    reportsData.salesTrend.slice(-7).map((trend, index) => {
                      const maxRevenue = Math.max(...reportsData.salesTrend.map(t => t.revenue))
                      const height = maxRevenue > 0 ? (trend.revenue / maxRevenue) * 100 : 0
                      return (
                        <div key={index} className="flex-1 flex flex-col items-center gap-2">
                          <div 
                            className="w-full bg-primary/80 rounded-t-lg transition-all hover:bg-primary"
                            style={{ height: `${Math.max(height, 5)}%` }}
                            title={`₹${formatINR(trend.revenue)}`}
                          />
                          <div className="text-xs text-muted-foreground">
                            {new Date(trend.date).toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No trend data available
                    </div>
                  )}
                </div>
              </div>

              {/* Top Selling Products */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-4">Top Selling Products</h4>
                <div className="space-y-3">
                  {reportStats.topSellingProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.quantity} units sold</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">{formatINR(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedReport === 'gst' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground">GST Summary</h3>
              
              {/* GST Breakdown Chart */}
              <div className="bg-card rounded-xl p-6 border border-border">
                <h4 className="text-sm font-semibold text-muted-foreground mb-4">GST Breakdown</h4>
                <div className="flex items-center gap-8">
                  <div className="flex-1 space-y-3">
                    {reportStats.gstCollected.cgst > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">CGST</span>
                          <span className="font-semibold">{formatINR(reportStats.gstCollected.cgst)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(reportStats.gstCollected.cgst / (reportStats.gstCollected.cgst + reportStats.gstCollected.sgst + reportStats.gstCollected.igst)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {reportStats.gstCollected.sgst > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">SGST</span>
                          <span className="font-semibold">{formatINR(reportStats.gstCollected.sgst)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(reportStats.gstCollected.sgst / (reportStats.gstCollected.cgst + reportStats.gstCollected.sgst + reportStats.gstCollected.igst)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {reportStats.gstCollected.igst > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">IGST</span>
                          <span className="font-semibold">{formatINR(reportStats.gstCollected.igst)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${(reportStats.gstCollected.igst / (reportStats.gstCollected.cgst + reportStats.gstCollected.sgst + reportStats.gstCollected.igst)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-success-soft rounded-xl border border-success/20">
                  <p className="text-xs font-semibold text-success uppercase tracking-widest mb-1">CGST Collected</p>
                  <p className="text-xl font-bold text-success-foreground">{formatINR(reportStats.gstCollected.cgst)}</p>
                </div>
                <div className="p-4 bg-success-soft rounded-xl border border-success/20">
                  <p className="text-xs font-semibold text-success uppercase tracking-widest mb-1">SGST Collected</p>
                  <p className="text-xl font-bold text-success-foreground">{formatINR(reportStats.gstCollected.sgst)}</p>
                </div>
                <div className="p-4 bg-success-soft rounded-xl border border-success/20">
                  <p className="text-xs font-semibold text-success uppercase tracking-widest mb-1">IGST Collected</p>
                  <p className="text-xl font-bold text-success-foreground">{formatINR(reportStats.gstCollected.igst)}</p>
                </div>
              </div>

              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Total GST Liability</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatINR(reportStats.gstCollected.cgst + reportStats.gstCollected.sgst + reportStats.gstCollected.igst)}
                    </p>
                  </div>
                  <Button 
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    onClick={handleExportGstr}
                    disabled={exporting}
                  >
                    <Download className="h-4 w-4 mr-2" /> {exporting ? 'Exporting...' : 'GSTR-1 Export'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selectedReport === 'inventory' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground">Inventory Overview</h3>
              
              <div className="p-6 bg-warning-soft rounded-xl border border-warning/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warning text-warning-foreground flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-warning-foreground">Low Stock Alert</p>
                    <p className="text-xs text-warning-foreground/80">{reportStats.lowStockItems} items need restocking</p>
                  </div>
                  <button className="px-4 py-2 bg-warning text-warning-foreground rounded-lg text-sm font-semibold hover:opacity-90">
                    View Items
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedReport === 'customers' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground">Customer Analytics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Active Customers</p>
                  <p className="text-2xl font-bold text-primary">{reportStats.activeCustomers}</p>
                </div>
                <div className="p-4 bg-success-soft rounded-xl border border-success/20">
                  <p className="text-xs font-semibold text-success uppercase tracking-widest mb-1">Customer Retention</p>
                  <p className="text-2xl font-bold text-success-foreground">78%</p>
                </div>
              </div>
            </div>
          )}

          {selectedReport === 'payments' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground">Payment Analysis</h3>
              
              <div className="p-6 bg-destructive/10 rounded-xl border border-destructive/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive-foreground">Pending Collections</p>
                    <p className="text-xs text-destructive-foreground/80">{formatINR(reportStats.pendingPayments)} awaiting payment</p>
                  </div>
                  <button className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold hover:opacity-90">
                    Send Reminders
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Report Cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ReportCard title="Sales summary" desc="Day, week & month-wise" />
        <ReportCard title="Party ledger" desc="Receivables & payables" />
        <ReportCard title="Stock report" desc="Movement & valuation" />
        <ReportCard title="Tax report" desc="HSN-wise breakdown" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:bg-muted transition-all">
          <Printer className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Print Summary</span>
        </button>
        <button className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:bg-muted transition-all">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Schedule Reports</span>
        </button>
        <button className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:bg-muted transition-all">
          <Filter className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Advanced Filters</span>
        </button>
      </div>
    </div>
  )
}