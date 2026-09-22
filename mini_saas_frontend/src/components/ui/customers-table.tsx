import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDiceBearAvatarUrl } from "@/components/billzo/Avatar"
import { formatINR } from "@/lib/utils"

type CustomerInvoice = {
  id: string
  total: number
  paidAmount: number
  dueAt?: string
  dueDate?: string
}

export type CustomerRow = {
  id: string
  name: string
  phone?: string
  gstin?: string
  invoiceCount: number
  totalSales: number
  outstanding: number
  invoices: CustomerInvoice[]
}

type CustomerStatus = "overdue" | "due_soon" | "clear"

function invoiceOutstanding(inv: CustomerInvoice): number {
  return (inv.total || 0) - (inv.paidAmount || 0)
}

function invoiceStatus(inv: CustomerInvoice): CustomerStatus {
  if (invoiceOutstanding(inv) <= 0) return "clear"
  const due = inv.dueAt || inv.dueDate
  if (!due) return "clear"
  const daysUntilDue = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
  if (daysUntilDue < 0) return "overdue"
  if (daysUntilDue <= 3) return "due_soon"
  return "clear"
}

function customerStatus(c: CustomerRow): CustomerStatus {
  if (c.outstanding <= 0) return "clear"
  const invs = c.invoices || []
  if (invs.some(i => invoiceStatus(i) === "overdue")) return "overdue"
  if (invs.some(i => invoiceStatus(i) === "due_soon")) return "due_soon"
  return "clear"
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due Soon",
  clear: "Clear",
}

const STATUS_VARIANTS: Record<CustomerStatus, "destructive" | "warning" | "success"> = {
  overdue: "destructive",
  due_soon: "warning",
  clear: "success",
}

export function CustomersTable({
  customers,
  onView,
}: {
  customers: CustomerRow[]
  onView: (id: string) => void
}) {
  const totalOutstanding = customers.reduce((s, c) => s + (c.outstanding || 0), 0)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead className="text-right">Invoices</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total Sales</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map(c => {
            const status = customerStatus(c)
            const settled = c.outstanding <= 0
            return (
              <TableRow
                key={c.id}
                onClick={() => onView(c.id)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getDiceBearAvatarUrl(c.name)}
                      alt=""
                      className="h-8 w-8 rounded-full bg-muted/20 shrink-0"
                      loading="lazy"
                    />
                    <span className="truncate">{c.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.phone || c.gstin || "—"}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {c.invoiceCount}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[status]}>
                    {settled ? "Settled" : STATUS_LABELS[status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium text-sm tabular-nums">
                  {formatINR(c.totalSales)}
                </TableCell>
                <TableCell
                  className={`text-right font-medium text-sm tabular-nums ${
                    c.outstanding > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {formatINR(c.outstanding)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    className="h-7"
                    size="sm"
                    variant="ghost"
                    onClick={e => { e.stopPropagation(); onView(c.id) }}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5}>Total outstanding</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatINR(totalOutstanding)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

export default CustomersTable