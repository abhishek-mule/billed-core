import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  { db: { schema: 'public' } },
)

function money(value: unknown): string {
  const amount = Number(value || 0)
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id
    const tenantId = request.nextUrl.searchParams.get('tenantId')

    const query = supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)

    if (tenantId) query.eq('tenant_id', tenantId)

    const { data: invoice, error } = await query.single()
    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const [{ data: items }, { data: customer }, { data: tenant }] = await Promise.all([
      supabase
        .from('invoice_items')
        .select('name, qty, quantity, price, rate, gst_rate, line_total, total')
        .eq('invoice_id', invoiceId),
      invoice.customer_id
        ? supabase
            .from('customers')
            .select('customer_name, phone, gstin')
            .eq('id', invoice.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('tenants')
        .select('company_name, phone, email, upi_id')
        .eq('id', invoice.tenant_id)
        .maybeSingle(),
    ])

    const businessName = tenant?.company_name || 'BillZo'
    const customerName = customer?.customer_name || invoice.customer_name || 'Customer'
    const total = Number(invoice.outstanding_amount ?? invoice.grand_total ?? invoice.total ?? 0)

    const doc = new jsPDF()
    const margin = 16
    let y = margin

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(businessName, margin, y)
    doc.setFontSize(12)
    doc.text('INVOICE', 194, y, { align: 'right' })

    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (tenant?.phone) doc.text(`Phone: ${tenant.phone}`, margin, y)
    if (tenant?.email) doc.text(`Email: ${tenant.email}`, 194, y, { align: 'right' })

    y += 12
    doc.setFont('helvetica', 'bold')
    doc.text(`Invoice: ${invoice.invoice_number || invoice.public_id || invoice.id}`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${(invoice.created_at || new Date().toISOString()).slice(0, 10)}`, 194, y, { align: 'right' })

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(customerName, margin, y)
    y += 5
    if (customer?.phone) {
      doc.text(`Phone: ${customer.phone}`, margin, y)
      y += 5
    }
    if (customer?.gstin) {
      doc.text(`GSTIN: ${customer.gstin}`, margin, y)
      y += 5
    }

    const rows = (items || []).map((item: any, index: number) => {
      const qty = Number(item.qty ?? item.quantity ?? 1)
      const rate = Number(item.price ?? item.rate ?? 0)
      const lineTotal = Number(item.line_total ?? item.total ?? qty * rate)
      return [
        String(index + 1),
        item.name || 'Item',
        String(qty),
        money(rate),
        `${Number(item.gst_rate || 0)}%`,
        money(lineTotal),
      ]
    })

    autoTable(doc, {
      startY: y + 4,
      head: [['#', 'Item', 'Qty', 'Rate', 'GST', 'Amount']],
      body: rows.length > 0 ? rows : [['1', 'Invoice amount', '1', money(total), '0%', money(total)]],
      styles: { font: 'helvetica', fontSize: 9 },
      headStyles: { fillColor: [22, 128, 45] },
      columnStyles: {
        0: { cellWidth: 12 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })

    const finalY = (doc as any).lastAutoTable?.finalY || y + 40
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Amount Due: ${money(total)}`, 194, finalY + 12, { align: 'right' })

    if (tenant?.upi_id) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`UPI: ${tenant.upi_id}`, margin, finalY + 12)
    }

    const pdf = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err: any) {
    console.error('[InvoicePDF GET] Error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
