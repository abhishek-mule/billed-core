'use client'

import { useSession } from '@/hooks/useSession'
import { usePermissions } from '@/components/auth/RoleGate'
import { Link } from 'next/link'
import { Plus, ScanLine, Package, Users, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp, Settings, Users as UsersIcon, FileText, Shield, BarChart3 } from 'lucide-react'
import { CashFlowCard } from '@/components/dashboard/CashFlowCard'
import { InventoryHealthCard } from '@/components/dashboard/InventoryHealthCard'
import { ReceivablesCard } from '@/components/dashboard/ReceivablesCard'
import { formatINR } from '@/lib/api-client'

const statusBadge: Record<string, string> = {
  synced: 'bg-success-soft text-success',
  pending: 'bg-warning-soft text-warning',
  failed: 'bg-destructive/10 text-destructive',
}

/**
 * Role-Based Dashboard
 * Shows different content based on user role
 */
export default function RoleBasedDashboard({ data, isLoading, isError, refetch }: any) {
  const { data: session } = useSession()
  const { role } = usePermissions()
  const userRole = role || 'cashier' // Default to cashier if no role

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (isError || !data || !data.success) {
    return <DashboardError refetch={refetch} />
  }

  const { stats, recentInvoices, inventoryHealth, receivables } = data
  const allSynced = stats.failedCount === 0

  // Render different dashboard based on role
  switch (userRole) {
    case 'owner':
      return <OwnerDashboard data={{ stats, recentInvoices, inventoryHealth, receivables, allSynced }} refetch={refetch} />
    case 'manager':
      return <ManagerDashboard data={{ stats, recentInvoices, inventoryHealth, receivables, allSynced }} refetch={refetch} />
    case 'cashier':
      return <CashierDashboard data={{ stats, recentInvoices, allSynced }} />
    case 'warehouse':
      return <WarehouseDashboard data={{ inventoryHealth, stats }} />
    case 'accountant':
      return <AccountantDashboard data={{ stats, recentInvoices, receivables, allSynced }} refetch={refetch} />
    case 'auditor':
      return <AuditorDashboard data={{ stats, recentInvoices }} />
    default:
      return <CashierDashboard data={{ stats, recentInvoices, allSynced }} />
  }
}

/**
 * Owner Dashboard - Full access with financial deep-dive
 */
function OwnerDashboard({ data, refetch }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Cash Flow Card */}
      <CashFlowCard
        todaysCash={data.stats.todaysCash}
        cashCollected={data.stats.cashCollected}
        creditGiven={data.stats.creditGiven}
        pendingCollections={data.stats.pendingCollections}
        invoiceCount={data.stats.invoiceCount}
        creditInvoiceCount={data.stats.creditInvoiceCount}
      />

      {/* Sync Status */}
      <SyncStatus allSynced={data.allSynced} failedCount={data.stats.failedCount} refetch={refetch} />

      {/* Quick Actions */}
      <QuickActions showAll={true} />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <InventoryHealthCard
          lowStockItems={data.inventoryHealth?.lowStockItems || []}
          slowMovingItems={data.inventoryHealth?.slowMovingItems || []}
        />
        <ReceivablesCard
          topDebtors={data.receivables?.topDebtors || []}
          totalPending={data.receivables?.totalPending || 0}
        />
      </div>

      {/* Recent Invoices */}
      <RecentInvoices invoices={data.recentInvoices} />

      {/* Owner-only sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <FinancialSummary stats={data.stats} />
        <TaxComplianceStatus />
        <ProfitMarginAnalysis />
      </div>
    </div>
  )
}

/**
 * Manager Dashboard - Operational KPIs
 */
function ManagerDashboard({ data, refetch }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Cash Flow Card */}
      <CashFlowCard
        todaysCash={data.stats.todaysCash}
        cashCollected={data.stats.cashCollected}
        creditGiven={data.stats.creditGiven}
        pendingCollections={data.stats.pendingCollections}
        invoiceCount={data.stats.invoiceCount}
        creditInvoiceCount={data.stats.creditInvoiceCount}
      />

      {/* Sync Status */}
      <SyncStatus allSynced={data.allSynced} failedCount={data.stats.failedCount} refetch={refetch} />

      {/* Quick Actions */}
      <QuickActions showAll={true} />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <InventoryHealthCard
          lowStockItems={data.inventoryHealth?.lowStockItems || []}
          slowMovingItems={data.inventoryHealth?.slowMovingItems || []}
        />
        <ReceivablesCard
          topDebtors={data.receivables?.topDebtors || []}
          totalPending={data.receivables?.totalPending || 0}
        />
      </div>

      {/* Recent Invoices */}
      <RecentInvoices invoices={data.recentInvoices} />

      {/* Manager-specific sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StaffPerformanceMetrics />
        <OperationalAlerts />
      </div>
    </div>
  )
}

/**
 * Cashier Dashboard - Minimal, fast billing focus
 */
function CashierDashboard({ data }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Cash Flow Card */}
      <CashFlowCard
        todaysCash={data.stats.todaysCash}
        cashCollected={data.stats.cashCollected}
        creditGiven={data.stats.creditGiven}
        pendingCollections={data.stats.pendingCollections}
        invoiceCount={data.stats.invoiceCount}
        creditInvoiceCount={data.stats.creditInvoiceCount}
      />

      {/* Quick Actions - Billing focused */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/merchant/pos"
          className="rounded-2xl p-6 flex flex-col items-center gap-3 border transition-spring active:scale-95 bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
        >
          <Plus className="h-8 w-8" />
          <span className="text-lg font-bold">Start Billing</span>
        </Link>
        <Link
          href="/merchant/products"
          className="rounded-2xl p-6 flex flex-col items-center gap-3 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <Package className="h-8 w-8" />
          <span className="text-lg font-bold">Products</span>
        </Link>
      </div>

      {/* Recent Invoices */}
      <RecentInvoices invoices={data.recentInvoices} />
    </div>
  )
}

/**
 * Warehouse Dashboard - Stock management focus
 */
function WarehouseDashboard({ data }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Inventory Health */}
      <InventoryHealthCard
        lowStockItems={data.inventoryHealth?.lowStockItems || []}
        slowMovingItems={data.inventoryHealth?.slowMovingItems || []}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/merchant/products"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <Package className="h-5 w-5" />
          <span className="text-xs font-semibold">Manage Stock</span>
        </Link>
        <Link
          href="/merchant/purchases"
          className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
        >
          <ScanLine className="h-5 w-5" />
          <span className="text-xs font-semibold">Purchase Orders</span>
        </Link>
      </div>

      {/* Stock Alerts */}
      <StockAlerts items={data.inventoryHealth?.lowStockItems || []} />
    </div>
  )
}

/**
 * Accountant Dashboard - Financial operations
 */
function AccountantDashboard({ data, refetch }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Cash Flow Card */}
      <CashFlowCard
        todaysCash={data.stats.todaysCash}
        cashCollected={data.stats.cashCollected}
        creditGiven={data.stats.creditGiven}
        pendingCollections={data.stats.pendingCollections}
        invoiceCount={data.stats.invoiceCount}
        creditInvoiceCount={data.stats.creditInvoiceCount}
      />

      {/* Sync Status */}
      <SyncStatus allSynced={data.allSynced} failedCount={data.stats.failedCount} refetch={refetch} />

      {/* Receivables */}
      <ReceivablesCard
        topDebtors={data.receivables?.topDebtors || []}
        totalPending={data.receivables?.totalPending || 0}
      />

      {/* Recent Invoices */}
      <RecentInvoices invoices={data.recentInvoices} />

      {/* Accountant-specific sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PaymentReconciliationStatus />
        <TaxReports />
      </div>
    </div>
  )
}

/**
 * Auditor Dashboard - Read-only access
 */
function AuditorDashboard({ data }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      {/* Read-only Cash Flow */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Today's Cash Flow (Read Only)</h3>
        <div className="text-3xl font-bold">{formatINR(data.stats.todaysCash)}</div>
      </div>

      {/* Recent Invoices */}
      <RecentInvoices invoices={data.recentInvoices} />

      {/* Audit-specific sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AuditLogSummary />
        <ComplianceReport />
      </div>
    </div>
  )
}

// Helper Components
function SyncStatus({ allSynced, failedCount, refetch }: any) {
  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 ${allSynced ? 'border-success/30 bg-success-soft' : 'border-warning/40 bg-warning-soft'}`}>
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${allSynced ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}>
        {allSynced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold ${allSynced ? 'text-success' : 'text-warning'}`}>
          {allSynced ? 'All invoices synced' : `${failedCount} invoices failed to sync`}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {allSynced ? 'Last synced just now' : 'Tap retry to send them again'}
        </div>
      </div>
      {!allSynced && (
        <button 
          onClick={async () => {
            try {
              const res = await fetch('/api/merchant/invoice/retry-all', { method: 'POST' })
              const resData = await res.json()
              if (resData.succeeded !== undefined) {
                refetch()
              }
            } catch {
              // Ignore error
            }
          }}
          className="px-4 py-2 rounded-lg bg-warning text-warning-foreground text-sm font-medium hover:bg-warning/90"
        >
          Retry All
        </button>
      )}
    </div>
  )
}

function QuickActions({ showAll = false }: { showAll?: boolean }) {
  return (
    <div className={`grid gap-3 ${showAll ? 'grid-cols-4' : 'grid-cols-2'}`}>
      <Link
        href="/merchant/pos"
        className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
      >
        <Plus className="h-5 w-5" />
        <span className="text-xs font-semibold">Bill</span>
      </Link>
      <Link
        href="/merchant/purchases"
        className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
      >
        <ScanLine className="h-5 w-5" />
        <span className="text-xs font-semibold">Scan</span>
      </Link>
      {showAll && (
        <>
          <Link
            href="/merchant/products"
            className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
          >
            <Package className="h-5 w-5" />
            <span className="text-xs font-semibold">Products</span>
          </Link>
          <Link
            href="/merchant/parties"
            className="rounded-2xl p-4 flex flex-col items-center gap-2 border transition-spring active:scale-95 bg-card border-border hover:border-primary/30 hover:shadow-md"
          >
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold">Parties</span>
          </Link>
        </>
      )}
    </div>
  )
}

function RecentInvoices({ invoices }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Recent invoices</h2>
        <Link href="/merchant/invoice" className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {invoices.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No invoices yet today — tap Bill to create your first
        </div>
      ) : (
        <ul className="divide-y divide-border max-h-80 overflow-y-auto">
          {invoices.map((inv: any) => (
            <li key={inv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-base">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
                {inv.party?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{inv.party}</div>
                <div className="text-xs text-muted-foreground">{inv.number} • {new Date(inv.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-foreground number-display">{formatINR(inv.amount)}</div>
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge[inv.status] || 'bg-secondary text-secondary-foreground'}`}>
                  {inv.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Placeholder components for role-specific features
function FinancialSummary({ stats }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Financial Summary
      </h3>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Today's Revenue</span>
          <span className="font-semibold">{formatINR(stats.revenue)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pending Collections</span>
          <span className="font-semibold">{formatINR(stats.pendingCollections)}</span>
        </div>
      </div>
    </div>
  )
}

function TaxComplianceStatus() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-4 w-4" />
        GST Compliance
      </h3>
      <div className="text-sm text-muted-foreground">
        GSTR-1 ready for filing
      </div>
    </div>
  )
}

function ProfitMarginAnalysis() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4" />
        Profit Analysis
      </h3>
      <div className="text-sm text-muted-foreground">
        Margin trends this month
      </div>
    </div>
  )
}

function StaffPerformanceMetrics() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <UsersIcon className="h-4 w-4" />
        Staff Performance
      </h3>
      <div className="text-sm text-muted-foreground">
        Today's performance metrics
      </div>
    </div>
  )
}

function OperationalAlerts() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Operational Alerts
      </h3>
      <div className="text-sm text-muted-foreground">
        No active alerts
      </div>
    </div>
  )
}

function StockAlerts({ items }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4">Stock Alerts</h3>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No stock alerts</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item: any) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span className="text-warning">{item.stock} {item.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PaymentReconciliationStatus() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4">Payment Reconciliation</h3>
      <div className="text-sm text-muted-foreground">
        All payments reconciled
      </div>
    </div>
  )
}

function TaxReports() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4">Tax Reports</h3>
      <div className="text-sm text-muted-foreground">
        GSTR reports ready
      </div>
    </div>
  )
}

function AuditLogSummary() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        Audit Log Summary
      </h3>
      <div className="text-sm text-muted-foreground">
        Recent activity log
      </div>
    </div>
  )
}

function ComplianceReport() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold mb-4">Compliance Report</h3>
      <div className="text-sm text-muted-foreground">
        GST compliance status
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto space-y-5">
      <div className="h-32 bg-muted animate-pulse rounded-2xl" />
      <div className="h-20 bg-muted animate-pulse rounded-2xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function DashboardError({ refetch }: any) {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
      >
        Try Again
      </button>
    </div>
  )
}