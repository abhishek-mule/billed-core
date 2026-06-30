import type { LoadCustomerSnapshot } from '@billzo/shared'

export const loadCustomerSnapshot: LoadCustomerSnapshot = async (customerId) => {
  const { db } = await import('@/lib/billzo/db')
  const database = db()
  
  const customer = await database.customers.get(customerId)
  if (!customer) throw new Error('Customer not found')

  const invoices = await database.invoices.where('customerId').equals(customerId).toArray()
  const payments = await database.payments.where('customerId').equals(customerId).toArray()

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    whatsappNumber: customer.whatsapp_number,
    email: customer.email,
    address: customer.address,
    gstin: customer.gstin,
    invoices: invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      total: inv.total,
      paidAmount: inv.paidAmount || 0,
      status: inv.status,
      dueAt: inv.dueAt,
      createdAt: inv.createdAt,
    })),
    payments: payments.map(p => ({
      id: p.id,
      amount: p.amount,
      method: p.provider,
      createdAt: p.createdAt,
    })),
  }
}